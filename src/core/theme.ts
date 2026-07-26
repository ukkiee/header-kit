/**
 * 테마 (ADR 0015 — ADR 0004의 "스위치 없음, 시스템 연동만"을 개정).
 *
 * 선호값과 실제로 그려지는 명암을 **다른 타입으로** 갈라 둔다. 'system'은 그려질 수 있는
 * 값이 아니라 "시스템에 맡긴다"는 선택이라, 둘을 한 타입에 섞으면 `data-theme="system"`
 * 같은 그릴 수 없는 값이 화면까지 흘러간다.
 */

/** 사용자가 고르는 값 — storage에 영속된다. */
export type ThemePreference = 'dark' | 'light' | 'system';

/** 실제로 그려지는 명암 — 루트 `data-theme`에 반영된다. */
export type ResolvedTheme = 'dark' | 'light';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'dark', 'light'];

/** 기본값 — 아무것도 고르지 않은 사용자는 OS를 따른다. */
export const DEFAULT_THEME: ThemePreference = 'system';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

/**
 * 선호값 + 시스템 상태 → 그릴 명암. 앱 전체 명암의 단일 판단 지점이다.
 * 'system'일 때만 시스템 상태를 본다 — 명시 선호가 시스템에 밀리면 스위치가 무의미해진다.
 */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}
