import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { resolveTheme, type ThemePreference } from '@/core/theme';

/** 시스템 명암 질의 — 한 곳에 두어 구독과 읽기가 같은 문자열을 쓰게 한다. */
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * 선호값을 실제로 그려지는 명암으로 바꾸고 루트 `data-theme`에 반영한다 (ADR 0015).
 *
 * **해석 결과를 쓴다** — 선호값을 그대로 쓰지 않는다. `data-theme="system"`은 CSS가 아는
 * 값이 아니라, 그대로 두면 시스템이 다크여도 라이트로 그려진다. global.css의 `[data-theme]`
 * 훅(원래 Storybook·진단 도구가 양 테마를 강제하던 개발용 오버라이드)을 그대로 재사용하므로
 * 새 CSS 진입점이 생기지 않는다.
 *
 * 시스템 값을 **state로 들고 있지 않고 렌더 시점에 읽는다**. state로 들면 명시 선호가
 * 걸려 있는 동안 구독이 없어 값이 낡는다 — 라이트를 고정해 둔 사이 OS가 다크로 바뀌었다면,
 * '시스템'으로 돌아오는 순간 낡은 값으로 한 프레임을 칠한 뒤에야 바로잡힌다(effect는 페인트
 * 뒤에 돈다). `useSyncExternalStore`는 렌더에서 스토어를 읽으므로 그 창이 아예 없다.
 *
 * 구독은 여전히 '시스템'일 때만 건다 — 고정 선택 중에는 OS 변화가 화면에 아무 영향도
 * 주지 않으므로 subscribe가 아무것도 하지 않는다.
 */
export function useAppliedTheme(preference: ThemePreference): void {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (preference !== 'system') return () => {};
      const query = window.matchMedia(DARK_QUERY);
      query.addEventListener('change', onStoreChange);
      return () => query.removeEventListener('change', onStoreChange);
    },
    [preference],
  );
  // boolean 원시값이라 값이 같으면 같은 스냅샷이다 — 재렌더 루프가 생기지 않는다.
  const systemPrefersDark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DARK_QUERY).matches,
    // matchMedia가 없는 환경(서버·일부 테스트 러너)의 폴백을 명시해 둔다.
    () => false,
  );

  const theme = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    // 루트에 쓴다 — 팝업·탭 두 표면 모두 이 문서의 <html>이 스코프 전체다.
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}
