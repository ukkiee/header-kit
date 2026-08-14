import { describe, expect, it } from 'vitest';
import { t as translate, type Locale } from '@/core/i18n';
import type { ProfileRowStatus, StatusSummary } from '@/core/summary';
import { profileRowMetaText, statusCountsText } from './status-text';

const at = (locale: Locale) => (key: Parameters<typeof translate>[1]) => translate(locale, key);

const summary = (over: Partial<StatusSummary> = {}): StatusSummary => ({
  ruleCount: 5,
  activeProfileCount: 2,
  leadProfileColor: null,
  paused: false,
  applyError: null,
  warnings: [],
  hasProblems: false,
  ...over,
});

describe('statusCountsText — 본문 헤더 부제', () => {
  it('두 수를 가운뎃점으로 잇는다', () => {
    expect(statusCountsText(summary(), at('en'))).toBe('5 active rules · 2 active profiles');
    // 세는 단위가 수 뒤에 붙는다 — 코드에서 이어 붙였다면 여기가 '5 적용 규칙'으로 남았다.
    expect(statusCountsText(summary(), at('ko'))).toBe('적용 중인 규칙 5개 · 활성 프로필 2개');
  });

  it('하나일 때 단수형을 고른다 — 로케일마다 그 선택이 다르다', () => {
    expect(statusCountsText(summary({ ruleCount: 1, activeProfileCount: 1 }), at('en'))).toBe(
      '1 active rule · 1 active profile',
    );
  });

  /*
   * 적용에 실패했으면 수보다 그 사실이 먼저다 — 걸리지 못한 규칙을 "적용 규칙"이라 부르면
   * 헤더가 조용히 거짓을 말한다. 상태 요약 줄이 이미 갖고 있던 분기다.
   */
  it('적용 실패 중에는 "적용 규칙"이라 부르지 않는다', () => {
    const failed = summary({ applyError: 'quota', hasProblems: true });
    expect(statusCountsText(failed, at('en'))).toBe('5 rules not applied · 2 active profiles');
    // 실패 쪽도 세는 단위를 카탈로그가 든다 — 예전에는 이 자리에 '개'가 빠져 있었다.
    expect(statusCountsText(failed, at('ko'))).toBe('적용하지 못한 규칙 5개 · 활성 프로필 2개');
  });

  it('0도 그대로 말한다 — 빈칸은 "없다"와 "아직 모른다"를 구별해 주지 않는다', () => {
    expect(statusCountsText(summary({ ruleCount: 0, activeProfileCount: 0 }), at('en'))).toBe(
      '0 active rules · 0 active profiles',
    );
  });

  /*
   * 일시정지는 여기서 따로 접지 않는다 — 요약을 만드는 쪽이 이미 0으로 내려 준다.
   * 두 곳에서 접으면 한쪽만 고쳤을 때 헤더와 레일 하단이 다른 수를 말한다.
   */
  it('정지 중이라는 사실 자체는 이 문장이 말하지 않는다', () => {
    expect(statusCountsText(summary({ paused: true, ruleCount: 0, activeProfileCount: 0 }), at('ko'))).toBe(
      '적용 중인 규칙 0개 · 활성 프로필 0개',
    );
  });
});

/**
 * 프로필 행 메타 (티켓 04, 스펙 story 42) — `3개 규칙 · 적용`.
 *
 * 헤더 부제와 **같은 파일**에 있는 이유는 규약이 같기 때문이다: 가운뎃점으로 잇고, 수와 세는
 * 단위를 카탈로그가 함께 든다. 나눠 두면 한쪽만 고쳐져 같은 화면의 두 줄이 다르게 읽힌다.
 */
describe('profileRowMetaText — 프로필 행 메타', () => {
  const status = (over: Partial<ProfileRowStatus> = {}): ProfileRowStatus => ({
    enabledModificationCount: 3,
    state: 'on',
    ...over,
  });

  it('규칙 수와 상태를 가운뎃점으로 잇는다', () => {
    expect(profileRowMetaText(status(), at('en'))).toBe('3 rules · applied');
    expect(profileRowMetaText(status(), at('ko'))).toBe('규칙 3개 · 적용');
  });

  it('하나일 때 단수형을 고른다 — 한국어는 굴절하지 않는다', () => {
    expect(profileRowMetaText(status({ enabledModificationCount: 1 }), at('en'))).toBe('1 rule · applied');
    expect(profileRowMetaText(status({ enabledModificationCount: 1 }), at('ko'))).toBe('규칙 1개 · 적용');
  });

  /*
   * en이 `not applied`가 아니라 `off`인 것은 **폭 때문**이다 — 87px 칸에 107px을 요구해
   * 가장 흔한 상태 하나가 늘 잘려 있었다. 수치는 `i18n.ts`의 그 주석이 갖는다. ko는 자기
   * 폭에 들어가므로 `미적용` 그대로다.
   */
  it('꺼진 프로필은 꺼졌다고 말한다', () => {
    expect(profileRowMetaText(status({ state: 'off' }), at('en'))).toBe('3 rules · off');
    expect(profileRowMetaText(status({ state: 'off' }), at('ko'))).toBe('규칙 3개 · 미적용');
  });

  /*
   * 정지는 **낱말로** 읽힌다 (티켓 AC6). 아이콘과 흐림만으로는 9px 글리프의 관용을 아는
   * 사람에게만 전달된다 — 색을 지워도, 형태를 못 읽어도 남는 채널이 하나 필요하다.
   */
  it('전역 정지 중에는 저장된 on/off 대신 정지라고 말한다', () => {
    expect(profileRowMetaText(status({ state: 'paused' }), at('ko'))).toBe('규칙 3개 · 정지');
    expect(profileRowMetaText(status({ state: 'paused' }), at('en'))).toBe('3 rules · paused');
  });

  /*
   * 정지 중에도 **수는 깎지 않는다**. 규칙이 사라진 게 아니라 멈춘 것이고, 재개하면 그대로
   * 돌아온다 — 여기서 0으로 내리면 사용자가 규칙을 잃었다고 읽는다.
   */
  it('정지가 규칙 수를 깎지 않는다', () => {
    const paused = profileRowMetaText(status({ state: 'paused', enabledModificationCount: 7 }), at('ko'));
    expect(paused.startsWith('규칙 7개')).toBe(true);
  });

  it('0도 그대로 말한다', () => {
    expect(profileRowMetaText(status({ enabledModificationCount: 0, state: 'off' }), at('en'))).toBe(
      '0 rules · off',
    );
  });
});
