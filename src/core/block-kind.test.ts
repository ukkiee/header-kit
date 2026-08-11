import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { fieldIssues } from './rule-validation';
import {
  createDefaultState,
  createModification,
  createProfile,
  parseStoredState,
  type Modification,
  type Profile,
} from './schema';
import { exportProfiles, parseImport } from './transfer';

/**
 * Block 종류의 컴파일 계약 (티켓 04, ADR 0015).
 *
 * Block은 헤더를 고치는 다른 종류와 달리 **요청 자체를 막는** 유일한 파괴적 종류다.
 * 그래서 여기서 못박는 것은 "폼이 무엇을 보여 주는가"가 아니라 "켰을 때 트래픽에
 * 무슨 일이 일어나는가" — 어떤 요청이 막히고, 어떤 경우에 아예 막지 않는가다.
 */

const withRules = (modifications: Modification[]): Profile => ({
  ...createProfile('T'),
  active: true,
  modifications,
});

const compileOne = (m: Modification, env: Partial<Parameters<typeof compile>[1]> = {}) =>
  compile([withRules([m])], { paused: false, materialized: {}, ...env });

const block = (over: Record<string, unknown> = {}): Modification =>
  ({
    ...createModification('block'),
    urlFilter: 'ads.example.com',
    urlMatchType: 'domain',
    ...over,
  }) as Modification;

describe('Block 종류', () => {
  it('매칭된 요청을 block 액션으로 차단한다', () => {
    const { rules } = compileOne(block());
    expect(rules).toHaveLength(1);
    expect(rules[0]?.action).toEqual({ type: 'block' });
  });

  it('URL 스코프·Condition은 다른 종류와 같은 조립기를 탄다', () => {
    const { rules } = compileOne(
      block({
        urlFilter: 'ads.example.com',
        urlMatchType: 'domain',
        conditions: { resourceTypes: ['script'], requestMethods: ['get'], excludedDomains: ['ok.io'] },
      }),
    );
    // domain 매치는 regex 한도를 쓰지 않는 DNR 비정규식 문법으로 떨어진다 (ADR 0008).
    expect(rules[0]?.condition.urlFilter).toBe('||ads.example.com');
    expect(rules[0]?.condition.resourceTypes).toEqual(['script']);
    expect(rules[0]?.condition.requestMethods).toEqual(['get']);
    // 같은 조립기를 탄다는 것은 **퇴역 조건을 함께 버리는 것까지** 같다는 뜻이다 (R-2).
    expect(rules[0]?.condition.excludedRequestDomains).toBeUndefined();
  });

  it('스코프가 없으면 방출하지 않고 경고한다 — 모든 요청을 막는 사고를 막는다', () => {
    // 폼 검증이 스코프를 필수로 막지만, import·레거시 데이터는 그 문을 거치지 않는다.
    const { rules, warnings } = compileOne(block({ urlFilter: undefined, urlMatchType: undefined }));
    expect(rules).toEqual([]);
    expect(warnings.some((w) => w.code === 'block-without-scope')).toBe(true);
  });

  it('공백뿐인 스코프도 스코프 없음으로 본다', () => {
    const { rules } = compileOne(block({ urlFilter: '   ' }));
    expect(rules).toEqual([]);
  });
});

describe('Pause는 Block의 탈출구다', () => {
  /*
   * Block으로 페이지가 깨졌을 때 사용자가 즉시 쓸 수 있는 복구 수단은 전역 Pause다.
   * 다른 종류와 함께 "일시정지하면 아무 규칙도 안 나간다"에 Block도 포함되는지를
   * 계약으로 못박는다 — 차단만 Pause를 무시하면 탈출구가 사라진다.
   */
  it('일시정지 중에는 Block 규칙이 하나도 나가지 않는다', () => {
    const { rules } = compileOne(block(), { paused: true });
    expect(rules).toEqual([]);
  });

  it('규칙을 꺼도 차단이 멈춘다', () => {
    const { rules } = compileOne(block({ enabled: false }));
    expect(rules).toEqual([]);
  });
});

describe('Block 검증 — 스코프만 필수', () => {
  it('이름·값을 요구하지 않는다 — 스코프만 있으면 저장된다', () => {
    expect(fieldIssues(block())).toEqual([]);
  });

  it('스코프가 없으면 저장을 막는다 — 이 종류에서 스코프는 규칙의 전부다', () => {
    expect(fieldIssues(block({ urlFilter: undefined }))).toEqual([
      { field: 'urlFilter', reason: 'required' },
    ]);
    expect(fieldIssues(block({ urlFilter: ' ' }))).toEqual([{ field: 'urlFilter', reason: 'required' }]);
  });

  it('규칙이 만들어지지 않는 패턴은 저장을 막는다 — 막힌 줄 알았는데 아무 일도 없는 것이 최악이다', () => {
    expect(fieldIssues(block({ urlFilter: '^https://(?!ads)', urlMatchType: 'regex' }))).toEqual([
      { field: 'urlFilter', reason: 'unsupported-pattern' },
    ]);
  });

  it('넓은 스코프는 저장을 막지 않는다 — 막는 대신 폼이 확인을 요구한다', () => {
    expect(fieldIssues(block({ urlFilter: '*://*/*', urlMatchType: 'contains' }))).toEqual([]);
  });

  /*
   * 매치 방식이 정해진 뒤에 검증한다 (code-review).
   *
   * `urlMatchType` 부재는 core에서 regex를 뜻하는데(ADR 0008 하위 호환), 폼은 새 규칙에
   * contains를 보여 주고 저장 직전에야 그 값을 초안에 박는다. 정리 전 초안을 검증하면
   * 화면은 "Contains"인데 판정은 정규식으로 나서, `*ads` 같은 멀쩡한 부분 문자열이
   * "이 패턴은 못 쓴다"로 막혔다. 폼이 정리된 초안을 넘기므로 아래가 성립한다.
   */
  it('contains로 저장되는 패턴은 정규식 문법으로 거부되지 않는다', () => {
    expect(fieldIssues(block({ urlFilter: '*ads', urlMatchType: 'contains' }))).toEqual([]);
    expect(fieldIssues(block({ urlFilter: 'ads.example.com/(?!x)', urlMatchType: 'contains' }))).toEqual([]);
    // 같은 문자열이라도 정규식으로 저장한다면 거부가 맞다.
    expect(fieldIssues(block({ urlFilter: '*ads', urlMatchType: 'regex' }))).toEqual([
      { field: 'urlFilter', reason: 'unsupported-pattern' },
    ]);
  });
});

describe('Block 영속 계약', () => {
  const stored = (m: Modification) => ({
    ...createDefaultState(),
    profiles: [{ ...createProfile('P'), id: 'p1', modifications: [m] }],
  });

  it('저장→로드 왕복에서 살아남는다 — 검증 실패는 상태 전체를 기본값으로 리셋한다', () => {
    const revived = parseStoredState(JSON.parse(JSON.stringify(stored(block({ urlFilter: 'ads.io' })))));
    expect(revived.profiles[0]?.modifications[0]).toMatchObject({
      kind: 'block',
      urlFilter: 'ads.io',
    });
  });

  it('뜻 없는 값 필드가 붙지 않는다 — Block은 이름도 값도 mode도 없다', () => {
    const revived = parseStoredState(JSON.parse(JSON.stringify(stored(block()))));
    const m = revived.profiles[0]?.modifications[0];
    expect(m).not.toHaveProperty('mode');
    expect(m).not.toHaveProperty('emptyMeans');
    expect(m).not.toHaveProperty('value');
  });

  it('내보내기→가져오기 왕복에서 살아남는다', () => {
    const file = exportProfiles(stored(block({ urlFilter: 'ads.io' })), ['p1']);
    const result = parseImport(JSON.stringify(file));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profiles[0]?.modifications[0]?.kind).toBe('block');
    }
  });
});
