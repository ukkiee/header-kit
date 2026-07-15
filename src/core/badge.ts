import type { StoredState } from './schema';

export interface BadgeSpec {
  text: string;
  color: string;
}

const PAUSED_COLOR = '#6b7280';
const MULTI_ACTIVE_COLOR = '#2563eb';

/** 툴바 배지 내용을 계산하는 순수 함수 — 어댑터는 결과를 그대로 반영만 한다. */
export function computeBadge(state: StoredState): BadgeSpec {
  if (state.paused) {
    return { text: 'II', color: PAUSED_COLOR };
  }

  const active = state.profiles.filter((p) => p.active);
  if (active.length === 0) {
    return { text: '', color: PAUSED_COLOR };
  }
  if (active.length === 1) {
    const only = active[0]!;
    return { text: only.shortLabel || '1', color: only.color };
  }
  return { text: String(active.length), color: MULTI_ACTIVE_COLOR };
}
