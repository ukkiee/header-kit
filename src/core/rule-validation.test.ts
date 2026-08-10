import { describe, expect, it } from 'vitest';
import { fieldIssues, type FieldIssue, type RequiredField } from './rule-validation';
import type { Modification } from './schema';

const required = (field: RequiredField): FieldIssue => ({ field, reason: 'required' });

const header = (over: Partial<Extract<Modification, { kind: 'request-header' }>> = {}): Modification => ({
  kind: 'request-header',
  id: 'm1',
  name: 'X-Test',
  value: 'v',
  enabled: true,
  mode: 'override',
  emptyMeans: 'remove',
  comment: '',
  ...over,
});

describe('fieldIssues — 저장되면 반드시 동작하는 규칙만 통과 (ui-refine 04)', () => {
  it('요청/응답 헤더는 이름이 필수 — 값은 비어도 유효(emptyMeans)', () => {
    expect(fieldIssues(header())).toEqual([]);
    expect(fieldIssues(header({ name: '' }))).toEqual([required('name')]);
    expect(fieldIssues(header({ name: '   ' }))).toEqual([required('name')]);
    expect(fieldIssues(header({ kind: 'response-header', name: '' } as never))).toEqual([required('name')]);
    expect(fieldIssues(header({ value: '' }))).toEqual([]);
  });

  it('요청 쿠키는 이름이 필수', () => {
    const cookie = { kind: 'cookie', id: 'c', name: '', value: 'x', enabled: true, mode: 'append', emptyMeans: 'remove', comment: '' } as const;
    expect(fieldIssues(cookie as Modification)).toEqual([required('name')]);
    expect(fieldIssues({ ...cookie, name: 'sid' } as Modification)).toEqual([]);
  });

  /*
   * 응답 쿠키 (릴리스 게이트 R-1). 옛 케이스는 `name` 키가 **아예 없는** v2 모양을
   * `as Modification`으로 캐스팅해 재고 있었다 — 그래서 v3의 "이름 칸과 값 칸이 둘 다
   * 비었다"를 한 번도 덮지 못했다. v3 구조화 모양으로 올리고 세 갈래로 가른다.
   */
  const setCookie = (
    over: Partial<Extract<Modification, { kind: 'set-cookie' }>> = {},
  ): Modification => ({
    kind: 'set-cookie',
    id: 's',
    name: '',
    value: '',
    enabled: true,
    mode: 'override',
    emptyMeans: 'remove',
    comment: '',
    ...over,
  } as Modification);

  it('응답 쿠키 — 이름·값이 둘 다 비면 통과한다 (서버 Set-Cookie 차단 사용례)', () => {
    expect(fieldIssues(setCookie())).toEqual([]);
    // 이름만 비운 것도 막지 않는다 — `=값` 한 줄이 그대로 조립돼 입력이 버려지지 않는다.
    expect(fieldIssues(setCookie({ value: 'abc' }))).toEqual([]);
    expect(fieldIssues(setCookie({ name: 'sid', value: '' }))).toEqual([]);
  });

  it('응답 쿠키 — 속성만 채우면 막는다: 조립되지 않아 그 입력이 통째로 버려진다', () => {
    // 여섯 속성 각각이 혼자서도 막아야 한다 — 하나라도 새면 무경고로 전역 제거가 된다.
    expect(fieldIssues(setCookie({ domain: 'example.com' }))).toEqual([required('value')]);
    expect(fieldIssues(setCookie({ path: '/app' }))).toEqual([required('value')]);
    expect(fieldIssues(setCookie({ maxAge: '3600' }))).toEqual([required('value')]);
    expect(fieldIssues(setCookie({ sameSite: 'lax' }))).toEqual([required('value')]);
    expect(fieldIssues(setCookie({ secure: true }))).toEqual([required('value')]);
    expect(fieldIssues(setCookie({ httpOnly: true }))).toEqual([required('value')]);
    // 끈 스위치는 조립에 붙지 않으므로 버려지는 입력도 아니다 — 차단 사용례가 그대로 산다.
    expect(fieldIssues(setCookie({ secure: false, httpOnly: false }))).toEqual([]);
    // 값이 있으면 속성이 함께 조립되므로 막을 이유가 없다.
    expect(fieldIssues(setCookie({ value: 'abc', secure: true }))).toEqual([]);
  });

  it('원시로 보존된 응답 쿠키는 그대로 통과한다 — 가를 수 없는 줄에 재료를 요구할 수 없다', () => {
    const raw = { kind: 'set-cookie', id: 's', raw: 'sid=abc; Path=/; Secure', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' } as const;
    expect(fieldIssues(raw as unknown as Modification)).toEqual([]);
  });

  it('Redirect는 패턴·치환 둘 다 필수', () => {
    const redirect = (pattern: string, substitution: string): Modification =>
      ({ kind: 'redirect', id: 'r', pattern, substitution, enabled: true, comment: '' }) as Modification;
    expect(fieldIssues(redirect('', ''))).toEqual([required('pattern'), required('substitution')]);
    expect(fieldIssues(redirect('^https://a/(.*)', ''))).toEqual([required('substitution')]);
    expect(fieldIssues(redirect('', 'https://b/\\1'))).toEqual([required('pattern')]);
    expect(fieldIssues(redirect('^https://a/(.*)', 'https://b/\\1'))).toEqual([]);
  });

  /*
   * Block의 스코프 검증 (티켓 07) — **`invalid`만 막는다.**
   *
   * 다른 종류에서 못 쓰는 패턴은 규칙 하나가 조용히 빠지는 것으로 끝나지만, Block에서는
   * **차단이 걸렸다고 믿는 채로 아무것도 막히지 않는다** — 목록에는 정상으로 보이고 토글도
   * 켜져 있는데 광고·추적이 그대로 지나간다. 그래서 이 종류에만 스코프 검증이 붙는다.
   */
  describe('Block의 스코프 검증', () => {
    const block = (urlFilter?: string, urlMatchType?: string): Modification =>
      ({ kind: 'block', id: 'b', enabled: true, comment: '', urlFilter, urlMatchType }) as Modification;
    const unsupported = { field: 'urlFilter', reason: 'unsupported-pattern' };

    it('스코프가 비면 필수다 — 무엇을 막을지 모른다', () => {
      expect(fieldIssues(block())).toEqual([required('urlFilter')]);
      expect(fieldIssues(block('   '))).toEqual([required('urlFilter')]);
    });

    it('브라우저가 못 쓰는 정규식은 저장을 막는다', () => {
      // RE2가 받지 않는 역참조·전방탐색 — JS는 컴파일하므로 new RegExp만으로는 안 잡힌다.
      expect(fieldIssues(block('^https://(ads)\\.example\\.com/\\1', 'regex'))).toEqual([unsupported]);
      expect(fieldIssues(block('^https://(?=ads)', 'regex'))).toEqual([unsupported]);
    });

    /*
     * **넓다는 이유로는 막지 않는다** (수용 기준). 넓은 것은 틀린 것이 아니라 사용자가 정말
     * 원했을 수 있는 상태다 — 모든 광고 도메인을 한 번에 막는 식.
     */
    it('넓은 스코프는 막지 않는다', () => {
      expect(fieldIssues(block('*://*/*', 'contains'))).toEqual([]);
      expect(fieldIssues(block('/ads/', 'contains'))).toEqual([]);
      expect(fieldIssues(block('^https://[^/]+/ads/', 'regex'))).toEqual([]);
    });

    it('쓸 수 있는 패턴은 통과한다', () => {
      expect(fieldIssues(block('ads.example.com', 'contains'))).toEqual([]);
      expect(fieldIssues(block('^https://ads\\.example\\.com/', 'regex'))).toEqual([]);
    });

    /*
     * **다른 종류는 이 검증에 걸리지 않는다** (수용 기준). 같은 못 쓰는 패턴을 스코프로 든
     * 헤더 규칙은 통과한다 — 감도 대조로 Block에서는 실제로 막히는 것을 함께 보인다.
     */
    it('같은 패턴이라도 다른 종류는 걸리지 않는다', () => {
      const bad = '^https://(ads)\\.example\\.com/\\1';
      expect(fieldIssues(block(bad, 'regex'))).toEqual([unsupported]);
      const header: Modification = {
        kind: 'request-header', id: 'h', name: 'X-A', value: '1', enabled: true,
        mode: 'override', emptyMeans: 'remove', comment: '',
        urlFilter: bad, urlMatchType: 'regex',
      } as Modification;
      expect(fieldIssues(header)).toEqual([]);
    });
  });
});
