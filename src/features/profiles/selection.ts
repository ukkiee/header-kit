import type { Profile } from '@/core/schema';

/**
 * 선택 재조정 불변식 (ADR 0004) — 팝업·탭 앱이 공유한다. 선택 id가 현재 목록에
 * 없으면 첫 활성 프로필 → 첫 프로필 → null(빈 상태) 순으로 폴백한다. 매 렌더에서
 * 파생값으로 호출되므로 순수 함수로 둔다.
 *
 * 선택이 사라지는 길은 이제 **가져오기·백업 복원·전체 초기화** 셋이다 (티켓 04) — 프로필
 * 삭제가 퇴역해 그 넷째 길이 없어졌다. 셋 다 프로필을 새 id로 갈아 끼우므로 이 폴백이
 * 없으면 화면이 목록에 없는 프로필을 가리킨 채로 남는다.
 */
export function reconcileSelection(
  selectedId: string | null,
  profiles: readonly Profile[],
): string | null {
  if (selectedId !== null && profiles.some((p) => p.id === selectedId)) return selectedId;
  return profiles.find((p) => p.active)?.id ?? profiles[0]?.id ?? null;
}
