import { describe, expect, it } from 'vitest';
import { LOCALES, MESSAGES, resolveLocale, t } from './i18n';

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
