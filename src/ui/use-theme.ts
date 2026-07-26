import { useEffect, useState } from 'react';
import { resolveTheme, type ResolvedTheme, type ThemePreference } from '@/core/theme';

/** 시스템 명암 질의 — 한 곳에 두어 구독과 초기 읽기가 같은 문자열을 쓰게 한다. */
const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

/**
 * 선호값을 실제로 그려지는 명암으로 바꾸고 루트 `data-theme`에 반영한다 (ADR 0015).
 *
 * **해석 결과를 쓴다** — 선호값을 그대로 쓰지 않는다. `data-theme="system"`은 CSS가 아는
 * 값이 아니라, 그대로 두면 시스템이 다크여도 라이트로 그려진다. global.css의 `[data-theme]`
 * 훅(원래 Storybook·진단 도구가 양 테마를 강제하던 개발용 오버라이드)을 그대로 재사용하므로
 * 새 CSS 진입점이 생기지 않는다.
 *
 * 시스템 구독은 **'system'일 때만** 건다. 사용자가 다크를 고정해 두었는데 OS가 바뀔 때마다
 * 리렌더가 도는 것은 아무 일도 하지 않는 일이고, 그 구독이 남아 있으면 나중에 누가 조건을
 * 잘못 손댔을 때 고정 선택이 조용히 흔들린다.
 */
export function useAppliedTheme(preference: ThemePreference): ResolvedTheme {
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (preference !== 'system') return;
    const query = window.matchMedia(DARK_QUERY);
    // 구독을 거는 순간의 값으로 한 번 맞춘다 — 구독 이전에 OS가 바뀌었다면 상태가 낡았다.
    setSystemDark(query.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  const theme = resolveTheme(preference, systemDark);

  useEffect(() => {
    // 루트에 쓴다 — 팝업·탭 두 표면 모두 이 문서의 <html>이 스코프 전체다.
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return theme;
}
