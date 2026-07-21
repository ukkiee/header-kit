import type { Profile } from '@/core/schema';

/**
 * 선택 재조정 불변식 (ADR 0004) — 팝업·탭 앱이 공유한다. 선택 id가 현재 목록에
 * 없으면(삭제, import 전면 교체, 빈 목록) 첫 활성 프로필 → 첫 프로필 → null(빈
 * 상태) 순으로 폴백한다. 매 렌더에서 파생값으로 호출되므로 순수 함수로 둔다.
 */
export function reconcileSelection(
  selectedId: string | null,
  profiles: readonly Profile[],
): string | null {
  if (selectedId !== null && profiles.some((p) => p.id === selectedId)) return selectedId;
  return profiles.find((p) => p.active)?.id ?? profiles[0]?.id ?? null;
}
