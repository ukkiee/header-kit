import { describe, expect, it } from 'vitest';
import { t as translate, type Locale } from '@/core/i18n';
import type { StatusSummary } from '@/core/summary';
import { statusCountsText } from './status-text';

const at = (locale: Locale) => (key: Parameters<typeof translate>[1]) => translate(locale, key);

const summary = (over: Partial<StatusSummary> = {}): StatusSummary => ({
  ruleCount: 5,
  activeProfileCount: 2,
  paused: false,
  applyError: null,
  warnings: [],
  hasProblems: false,
  ...over,
});

describe('statusCountsText — 본문 헤더 부제', () => {
  it('두 수를 가운뎃점으로 잇는다', () => {
    expect(statusCountsText(summary(), at('en'))).toBe('5 active rules · 2 active profiles');
    expect(statusCountsText(summary(), at('ko'))).toBe('5 적용 규칙 · 2 활성 프로필');
  });

  it('하나일 때 단수형을 고른다 — 로케일마다 그 선택이 다르다', () => {
    expect(statusCountsText(summary({ ruleCount: 1, activeProfileCount: 1 }), at('en')))
      .toBe('1 active rule · 1 active profile');
  });

  it('0도 그대로 말한다 — 빈칸은 "없다"와 "아직 모른다"를 구별해 주지 않는다', () => {
    expect(statusCountsText(summary({ ruleCount: 0, activeProfileCount: 0 }), at('en')))
      .toBe('0 active rules · 0 active profiles');
  });

  /*
   * 일시정지는 여기서 따로 접지 않는다 — 요약을 만드는 쪽이 이미 0으로 내려 준다.
   * 두 곳에서 접으면 한쪽만 고쳤을 때 헤더와 레일 하단이 다른 수를 말한다.
   */
  it('정지 중이라는 사실 자체는 이 문장이 말하지 않는다', () => {
    expect(statusCountsText(summary({ paused: true, ruleCount: 0, activeProfileCount: 0 }), at('ko')))
      .toBe('0 적용 규칙 · 0 활성 프로필');
  });
});
