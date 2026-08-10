import { describe, expect, it } from 'vitest';
import { computeBadge, drawsBadge, readableTextColor } from './badge';
import { applyCommand } from './commands';
import { compile, type CompileEnv } from './compile';
import { createDefaultState, parseStoredState, type Modification, type Profile } from './schema';
import { summarizeCompile, type StatusSummary } from './summary';

/**
 * 배지 = **적용 중인 규칙 수** (티켓 06, 스펙 R-5). 예전 배지는 활성 프로필 표시기였지만
 * 설정 라벨이 "적용 중인 규칙 수"이므로, 라벨과 값이 어긋나지 않도록 재조정이 실제로
 * 발행한 컴파일 요약의 규칙 수를 낸다.
 */

/** 재조정이 발행하는 요약의 모양 — 배지는 이것만 본다. */
function summary(overrides: Partial<StatusSummary> = {}): StatusSummary {
  return {
    ruleCount: 0,
    activeProfileCount: 0,
    leadProfileColor: null,
    paused: false,
    applyError: null,
    warnings: [],
    hasProblems: false,
    ...overrides,
  };
}

const env: CompileEnv = { paused: false, materialized: {} };

function mod(id: string, name: string): Modification {
  return { kind: 'request-header', id, name, value: 'v', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' };
}

function profile(modifications: Modification[], over: Partial<Profile> = {}): Profile {
  return { id: 'p1', name: 'P', active: true, color: '#2563eb', modifications, ...over };
}

/** 컴파일 → 재조정 요약까지 실제로 태운다 — 배지가 보는 수가 방출된 규칙 수임을 확인한다. */
function summarizeOf(profiles: Profile[], applyError: string | null = null): StatusSummary {
  return summarizeCompile(compile(profiles, env), { profiles, paused: false, applyError });
}

describe('computeBadge — 적용 규칙 수 카운터', () => {
  it('적용된 규칙이 없으면 배지가 비어 있다', () => {
    expect(computeBadge(summary({ ruleCount: 0 }), true).text).toBe('');
  });

  it('적용된 규칙 수를 그대로 표시한다', () => {
    expect(computeBadge(summary({ ruleCount: 3 }), true).text).toBe('3');
  });

  it('일시정지는 적용 수보다 우선한다 — II(일시정지색)', () => {
    // 일시정지 색은 기존 배지의 값을 그대로 잇는다(회색) — 활성 카운터 색과 구분된다.
    expect(computeBadge(summary({ paused: true, ruleCount: 0 }), true)).toEqual({
      text: 'II',
      color: '#6b7280',
      textColor: '#ffffff',
    });
  });

  it('quota로 일부 규칙이 빠져도 실제 방출된 수를 보여준다 (부분 스킵)', () => {
    const many = Array.from({ length: 5001 }, (_, i) => mod(`m${i}`, `X-H-${i}`));
    const status = summarizeOf([profile(many)]);

    // 5,001개를 원했지만 한도로 5,000개만 걸렸다 — 배지는 "적용된" 수를 말한다.
    expect(status.warnings).toContainEqual(expect.objectContaining({ code: 'quota-exceeded' }));
    expect(computeBadge(status, true).text).toBe('5000');
  });

  it('컴파일에서 빠진 규칙은 세지 않는다 (부분 스킵)', () => {
    // 이름 없는 헤더 규칙은 방출되지 않는다 — 저장된 3개 중 2개만 실제로 걸린다.
    const status = summarizeOf([profile([mod('m1', 'X-A'), mod('m2', ''), mod('m3', 'X-C')])]);

    expect(computeBadge(status, true).text).toBe('2');
  });

  it('적용 자체가 실패하면(quota 등) 직전 배지를 그대로 둔다', () => {
    const status = summarizeOf([profile([mod('m1', 'X-A')])], 'MAX_NUMBER_OF_SESSION_RULES exceeded');

    // updateSessionRules는 원자적이라 실패해도 직전 규칙 세트가 그대로 걸려 있다 —
    // 실제 적용 수는 0이 아니라 직전 N이므로 배지를 다시 그리면 그 N과 어긋난다.
    expect(status.ruleCount).toBe(1);
    expect(drawsBadge(status, true)).toBe(false);
    // 일시정지도 걸리지 못했다 — 'II'로 덮는 것도 같은 거짓말이다.
    expect(drawsBadge({ ...status, paused: true }, true)).toBe(false);
    // 표시를 껐으면 실패 중에도 지운다 — 토글은 표시 여부만 정한다.
    expect(drawsBadge(status, false)).toBe(true);
    expect(computeBadge(status, false).text).toBe('');
    // 적용에 성공한 재조정은 늘 그대로 반영한다.
    expect(drawsBadge(summarizeOf([profile([mod('m1', 'X-A')])]), true)).toBe(true);
  });

  /*
   * 배지 색 = **지금 걸려 있는 프로필의 색**. 툴바와 사이드바 스와치가 같은 색을 들어야
   * 팝업을 열지 않고도 무엇이 걸려 있는지 안다.
   */
  it('켜진 프로필의 색으로 칠한다', () => {
    expect(computeBadge(summary({ ruleCount: 1, leadProfileColor: '#16a34a' }), true).color)
      .toBe('#16a34a');
  });

  it('여럿이 켜져 있으면 목록 맨 위의 색이다 — 겹침의 승자와 같은 우선순위', () => {
    const top = profile([mod('m1', 'X-A')], { id: 'p-top', color: '#db2777' });
    const below = profile([mod('m2', 'X-B')], { id: 'p-below', color: '#65a30d' });
    const status = summarizeOf([top, below]);

    expect(status.activeProfileCount).toBe(2);
    expect(computeBadge(status, true).color).toBe('#db2777');
  });

  it('꺼진 프로필은 대표 색을 내지 않는다 — 첫 **활성** 프로필이 기준이다', () => {
    const off = profile([mod('m1', 'X-A')], { id: 'p-off', color: '#db2777', active: false });
    const on = profile([mod('m2', 'X-B')], { id: 'p-on', color: '#65a30d' });

    expect(computeBadge(summarizeOf([off, on]), true).color).toBe('#65a30d');
  });

  it('색을 모르면 accent 파랑으로 물러난다 — 예전 요약에는 이 필드가 없다', () => {
    expect(computeBadge(summary({ ruleCount: 1, leadProfileColor: null }), true).color)
      .toBe('#2563eb');
  });

  /*
   * 글자색은 배경에서 계산한다. 프로필 색은 사용자 데이터라 밝은 값이 올 수 있고, 그 위에
   * 흰 글자를 쓰면 배지의 수가 보이지 않는다 — 배지는 확장이 켜져 있다는 유일한 상시 표시다.
   */
  it('밝은 색 위에는 검은 글자, 어두운 색 위에는 흰 글자', () => {
    expect(readableTextColor('#ffffff')).toBe('#000000');
    expect(readableTextColor('#65a30d')).toBe('#000000');
    expect(readableTextColor('#2563eb')).toBe('#ffffff');
    expect(readableTextColor('#000000')).toBe('#ffffff');
    // 세 자리 표기도 읽는다.
    expect(readableTextColor('#fff')).toBe('#000000');
  });

  it('읽을 수 없는 색은 흰 글자로 물러난다', () => {
    expect(readableTextColor('rebeccapurple')).toBe('#ffffff');
    expect(readableTextColor('')).toBe('#ffffff');
  });

  it('배지가 실을 글자색이 그 배경에서 나온 값이다', () => {
    expect(computeBadge(summary({ ruleCount: 1, leadProfileColor: '#d97706' }), true))
      .toEqual({ text: '1', color: '#d97706', textColor: readableTextColor('#d97706') });
  });

  it('표시가 꺼져 있으면 아무것도 보이지 않는다 — 일시정지 중에도', () => {
    expect(computeBadge(summary({ ruleCount: 3 }), false).text).toBe('');
    expect(computeBadge(summary({ paused: true }), false).text).toBe('');
  });
});

describe('배지 표시 선호값의 영속 (티켓 06)', () => {
  it('기본은 켜짐 — 배지를 끄지 않은 사용자는 지금까지처럼 본다', () => {
    expect(createDefaultState().badgeVisible).toBe(true);
  });

  it('커맨드가 표시 여부만 바꾸고 나머지 상태는 그대로 둔다', () => {
    const before = createDefaultState();
    const next = applyCommand(before, { type: 'set-badge-visible', visible: false });

    expect(next.badgeVisible).toBe(false);
    // 표시 토글은 "표시 여부만" 제어한다 — 규칙·프로필·일시정지는 손대지 않는다.
    expect(next.profiles).toEqual(before.profiles);
    expect(next.paused).toBe(before.paused);
    expect(applyCommand(next, { type: 'set-badge-visible', visible: true }).badgeVisible).toBe(true);
  });

  it('저장→로드 왕복에서 살아남는다 — 다시 열어도 꺼진 채로 남는다', () => {
    const saved = applyCommand(createDefaultState(), { type: 'set-badge-visible', visible: false });
    expect(parseStoredState(JSON.parse(JSON.stringify(saved))).badgeVisible).toBe(false);
  });

  it('선호값을 모르는 예전 상태는 켜짐으로 백필된다 — 필드 추가가 전체 리셋을 부르면 안 된다', () => {
    const { badgeVisible: _dropped, ...without } = createDefaultState();
    const revived = parseStoredState(JSON.parse(JSON.stringify(without)));

    expect(revived.badgeVisible).toBe(true);
    // 백필이 다른 것을 건드리지 않았는지 — 리셋됐다면 프로필이 사라졌을 것이다.
    expect(revived.profiles).toHaveLength(1);
  });

  it('알 수 없는 값은 켜짐으로 치유한다 — 배지 하나가 상태 전체를 날릴 이유가 없다', () => {
    const broken = { ...createDefaultState(), badgeVisible: 'yes' };
    const revived = parseStoredState(JSON.parse(JSON.stringify(broken)));

    expect(revived.badgeVisible).toBe(true);
    expect(revived.profiles).toHaveLength(1);
  });
});
