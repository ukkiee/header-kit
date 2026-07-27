import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { createDefaultState, parseStoredState } from './schema';
import { LOCALES, MESSAGES, pickLocale, resolveLocale, t } from './i18n';
import { pickLocalePreference } from './i18n';

describe('i18n 카탈로그', () => {
  it('모든 로케일이 en과 정확히 같은 키 집합을 갖는다 (누락·잉여 없음)', () => {
    const enKeys = Object.keys(MESSAGES.en).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual(enKeys);
    }
  });

  it('어떤 로케일의 어떤 메시지도 비어 있지 않다', () => {
    for (const locale of LOCALES) {
      for (const value of Object.values(MESSAGES[locale])) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('t는 로케일별 문자열을 반환한다', () => {
    expect(t('en', 'pause')).toBe('Pause');
    expect(t('ko', 'pause')).toBe('일시정지');
  });
});

describe('resolveLocale', () => {
  it('지원 언어는 그대로, 지역 태그는 기본 언어로, 미지원은 en으로 해석한다', () => {
    expect(resolveLocale('ko')).toBe('ko');
    expect(resolveLocale('ko-KR')).toBe('ko');
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('fr')).toBe('en');
    expect(resolveLocale('')).toBe('en');
  });
});

/**
 * 화면 언어의 단일 판단 지점 (티켓 09). 세 출처(URL 오버라이드 · 저장된 선호 · 브라우저 UI
 * 언어)의 우선순위를 표로 못박는다 — 순서가 하나만 어긋나도 "고른 언어가 무시된다"거나
 * 반대로 "강제 로케일로 연 화면이 선호에 끌려간다"가 된다.
 */
describe('pickLocale', () => {
  it.each([
    // 고른 적 없는 사용자는 지금까지처럼 브라우저 UI 언어를 따른다.
    [null, undefined, 'en-US', 'en'],
    [null, undefined, 'ko-KR', 'ko'],
    [null, undefined, 'fr', 'en'],
    // 고른 선호가 브라우저 UI 언어를 이긴다 — 그러라고 있는 선택이다.
    [null, 'ko', 'en-US', 'ko'],
    [null, 'en', 'ko-KR', 'en'],
    // URL 오버라이드는 무엇보다 앞선다(언어 강제) — 미지원 값은 en으로 접힌다.
    ['ko', 'en', 'en-US', 'ko'],
    ['en', 'ko', 'ko-KR', 'en'],
    ['fr', undefined, 'ko-KR', 'en'],
  ] as const)('override=%s, 선호=%s, UI=%s → %s', (override, preference, uiLanguage, expected) => {
    expect(pickLocale(override, preference, uiLanguage)).toBe(expected);
  });
});

describe('언어 선호값의 영속 (티켓 09)', () => {
  it('기본은 선호 없음 — 고른 적 없는 사용자는 브라우저를 따른다', () => {
    expect(createDefaultState().locale).toBeUndefined();
  });

  it('커맨드가 선호값만 바꾸고 나머지 상태는 그대로 둔다', () => {
    const before = createDefaultState();
    const next = applyCommand(before, { type: 'set-locale', locale: 'ko' });
    expect(next.locale).toBe('ko');
    // 미처리 커맨드는 `command satisfies never`가 런타임에 지워져 커맨드 자신을 돌려준다 —
    // `.locale`만 보는 단언은 그것도 통과하므로 진짜 상태가 왔는지 함께 본다(theme와 같은 결).
    expect(next.profiles).toEqual(before.profiles);
    expect(next.schemaVersion).toBe(before.schemaVersion);
    expect(applyCommand(next, { type: 'set-locale', locale: 'en' }).locale).toBe('en');
  });

  it('저장→로드 왕복에서 살아남는다 — "다시 열어도 유지된다"의 실질', () => {
    const saved = applyCommand(createDefaultState(), { type: 'set-locale', locale: 'ko' });
    expect(parseStoredState(JSON.parse(JSON.stringify(saved))).locale).toBe('ko');
  });

  it('알 수 없는 값은 선호 없음으로 치유한다 — 그릴 수 없는 언어가 화면까지 가지 않게', () => {
    const broken = { ...createDefaultState(), locale: 'ja' };
    const revived = parseStoredState(JSON.parse(JSON.stringify(broken)));
    expect(revived.locale).toBeUndefined();
    // 치유가 다른 것을 건드리지 않았는지 — 리셋됐다면 프로필이 사라졌을 것이다.
    expect(revived.profiles).toHaveLength(1);
  });
});

/**
 * 언어 칩이 짚는 값 (티켓 09 리뷰 R-4) — 컨트롤은 자기가 **설정하는** 것을 보여야 한다.
 * 실효 로케일에 묶으면 `?locale=`로 열린 화면에서 칩을 눌러도 저장만 되고 화면은 그대로라
 * 칩이 원래 자리로 튕겨 돌아온다. 테마 칩이 실효 테마가 아니라 저장된 선호에 묶인 것과
 * 같은 결이다. 여기서 못박는 것은 **오버라이드가 이 값에 닿지 않는다**는 사실 하나다.
 */
describe('pickLocalePreference', () => {
  it.each([
    // 고른 선호가 그대로 보인다 — 오버라이드가 무엇이든 칩은 저장된 값을 짚는다.
    ['ko', 'en-US', 'ko'],
    ['en', 'ko-KR', 'en'],
    // 고른 적 없으면 브라우저 UI 언어 — 부재는 "브라우저를 따른다"이고, 빈 칩이 아니다.
    [undefined, 'ko-KR', 'ko'],
    [undefined, 'fr', 'en'],
  ] as const)('선호=%s, UI=%s → %s', (preference, uiLanguage, expected) => {
    expect(pickLocalePreference(preference, uiLanguage)).toBe(expected);
  });

  it('오버라이드가 걸린 화면에서도 칩은 저장된 선호를 짚는다', () => {
    // 같은 입력으로 실효 로케일은 오버라이드를 따라 en이 된다 — 칩은 따라가지 않는다.
    expect(pickLocale('en', 'ko', 'ko-KR')).toBe('en');
    expect(pickLocalePreference('ko', 'ko-KR')).toBe('ko');
  });
});
