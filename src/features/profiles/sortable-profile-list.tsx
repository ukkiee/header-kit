import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState } from 'react';
import { AnimatePresence, MotionRow } from '@/ui/motion-row';
import type { Profile } from '@/core/schema';
import { profileRowStatus, type ProfileRowStatus } from '@/core/summary';
import { useT } from '@/ui/i18n-context';
import {
  ProfileGrip,
  ProfileSelectRow,
  profileDeleteLabels,
  profileReorderLabel,
  profileSelectLabel,
  profileToggleLabel,
  sidebarListClass,
  sidebarRowClass,
} from './profile-dot';

/**
 * 드래그 재정렬 목록 (ui-refine 06/08) — dnd-kit을 여기 몰아넣어 동적 import 대상으로
 * 삼는다(팝업 초기 청크에서 제외). 사이드바는 이 컴포넌트가 로드되기 전 같은 모양의
 * 정적 목록을 먼저 그리므로, 로드 후 그립이 기능만 얻고 시각 점프는 없다.
 */
export interface SortableProfileListProps {
  profiles: readonly Profile[];
  selectedId: string | null;
  /** 전역 일시정지 — 정적 목록과 같은 값을 같은 자리에 낸다(로드 후 시각 점프 방지). */
  paused: boolean;
  onSelect: (id: string) => void;
  /**
   * 순서 변경 — **명령이 착지할 때까지의 약속을 돌려준다.** 아래 낙관적 순서가 그 약속으로
   * 자기 수명을 정한다: 성공이든 실패든 settle되는 순간 권위 순서로 돌아간다.
   */
  onReorder: (profileId: string, toIndex: number) => Promise<void>;
  /** 인라인 on/off — 정적 목록과 같은 컨트롤을 드래그 목록도 갖는다 (티켓 10). */
  onToggleActive: (profileId: string, active: boolean) => void;
  /** 삭제 — 정적 목록과 같은 컨트롤·같은 2단계 확인 (ADR 0017 개정). */
  onDelete: (profileId: string) => void;
}

/**
 * 끌리는 범위를 **목록 안으로** 가둔다 — 세로로만, 그리고 첫 행 위·마지막 행 아래로는 못 간다.
 *
 * 이 목록은 세로 한 줄이라 가로 이동에는 아무 뜻이 없는데, 막지 않으면 손이 옆으로 새는 만큼
 * 행이 따라가 프로필 열 밖으로 끌려나간다 — 무엇을 어디에 놓는 중인지 알 수 없어지고, 놓을
 * 자리를 정하는 것은 결국 세로 위치뿐이라 그 이동은 정보도 아니다. 세로도 목록 바깥으로는
 * 나가지 않게 잘라, 끌고 있는 행이 검색창이나 '＋ 새 프로필' 위에 떠 있지 않게 한다.
 *
 * `@dnd-kit/modifiers`를 들이지 않고 여기서 끝낸다 — 이 청크는 이미 44KB이고, 필요한 것은
 * 좌표 계산 몇 줄이다. 좌표를 못 읽는 순간(측정 전 첫 프레임)에도 가로는 잠근다.
 */
const withinList: Modifier = ({ transform, draggingNodeRect, containerNodeRect }) => {
  if (!draggingNodeRect || !containerNodeRect) return { ...transform, x: 0 };
  const top = containerNodeRect.top - draggingNodeRect.top;
  const bottom = containerNodeRect.bottom - draggingNodeRect.bottom;
  return { ...transform, x: 0, y: Math.min(Math.max(transform.y, top), bottom) };
};

/**
 * 낙관적 순서를 권위 목록 위에 얹는다 — **집합이 정확히 같을 때만.**
 *
 * 다른 표면(다른 팝업·탭)에서 프로필이 늘거나 줄면 낙관 순서는 더 이상 이 목록을 설명하지
 * 못한다. 그때는 조용히 권위로 물러난다 — 없는 프로필을 그리거나 새 프로필을 감추는 것보다
 * 순서가 잠깐 튀는 편이 낫다.
 */
function applyPendingOrder(
  profiles: readonly Profile[],
  pending: readonly string[] | null,
): readonly Profile[] {
  if (!pending || pending.length !== profiles.length) return profiles;
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const ordered: Profile[] = [];
  for (const id of pending) {
    const profile = byId.get(id);
    if (!profile) return profiles;
    ordered.push(profile);
  }
  return ordered;
}

function SortableItem({
  profile,
  status,
  selected,
  onSelect,
  onToggleActive,
  onDelete,
  dragLabel,
}: {
  profile: Profile;
  status: ProfileRowStatus;
  selected: boolean;
  onSelect: () => void;
  onToggleActive: (active: boolean) => void;
  onDelete: () => void;
  dragLabel: string;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: profile.id,
  });
  return (
    /*
     * **모션 래퍼가 `<li>` 안에 있다.** 바깥에 두면 dnd-kit이 쓰는 인라인 `transform`을
     * motion이 자기 값으로 덮어 드래그가 멈춘다 — 그래서 `li`는 dnd-kit의 것으로 남기고,
     * 높이·투명도만 다루는 `MotionRow`를 그 안에 넣어 행 자체는 dnd-kit이, 등장·퇴장은
     * motion이 맡는다. 규칙 목록이 쓰는 그 래퍼 그대로다(같은 감각).
     */
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'z-10 opacity-70' : ''}
    >
      <MotionRow>
        <div className={sidebarRowClass(selected)}>
          <ProfileGrip label={dragLabel} attributes={attributes} listeners={listeners} />
          <ProfileSelectRow
            profile={profile}
            status={status}
            selected={selected}
            onSelect={onSelect}
            onToggleActive={onToggleActive}
            onDelete={onDelete}
            label={profileSelectLabel(profile, t, status.state)}
            toggleLabel={profileToggleLabel(profile, t)}
            {...profileDeleteLabels(profile, t)}
          />
        </div>
      </MotionRow>
    </li>
  );
}

export default function SortableProfileList({
  profiles,
  selectedId,
  paused,
  onSelect,
  onReorder,
  onToggleActive,
  onDelete,
}: SortableProfileListProps) {
  const t = useT();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /*
   * **드롭과 같은 커밋에서 순서를 확정한다** — 그것이 dnd-kit이 전제하는 계약이다.
   *
   * 이 목록의 순서는 배경 서비스워커를 한 바퀴 돌아야 갱신된다(메시지 두 홉 + 쓰기 줄 대기 +
   * 저장소 IPC 셋). 그 왕복은 어떤 경우에도 한 프레임 안에 끝나지 않으므로, 드롭 시점의
   * `items`는 늘 옛 순서다. 그러면 dnd-kit의 `defaultAnimateLayoutChanges`가 "착지 인덱스와
   * 실제 인덱스가 다르다"를 보고 참을 돌려주고, 드래그로 옮겨 놓은 행에 `transform: none`을
   * 향한 **200ms 복귀 애니메이션**이 붙는다 — 아래로 끌어 놓으면 행이 원래 자리로 올라갔다가,
   * 왕복이 끝나면 새 자리로 툭 내려온다. 사용자가 본 "위로 갔다 내려오는" 움직임이 이것이다.
   *
   * 그래서 드롭 순간 화면 순서를 여기서 먼저 바꾼다. 그러면 모든 항목에서 착지 인덱스와 실제
   * 인덱스가 같아져 dnd-kit이 전이를 아예 붙이지 않고, 행은 놓은 자리에 그대로 앉는다.
   *
   * **낙관은 화면에만 산다.** 권위는 여전히 명령 하나뿐이고, 왕복이 끝나면(성공이든 실패든)
   * 이 오버라이드를 버려 권위 순서로 돌아간다 — 실패하면 목록이 옛 순서로 되돌아가고 셸의
   * 오류 배너가 이유를 말한다. 저장소는 옛 순서인데 화면만 새 순서로 남는 거짓 표시가 없다.
   *
   * `arrayMove`는 권위의 `moveProfile`(core/commands.ts)과 같은 splice 순서라 두 결과가
   * 어긋나지 않는다 — 그쪽의 clamp는 목록 안에서 고른 인덱스에는 걸리지 않는다.
   */
  const [pendingOrder, setPendingOrder] = useState<readonly string[] | null>(null);
  const shown = useMemo(() => applyPendingOrder(profiles, pendingOrder), [profiles, pendingOrder]);
  // `useSortable`은 이 배열을 **참조로** 비교한다 — 렌더마다 새로 만들면 변경 감지가 헛돈다.
  const items = useMemo(() => shown.map((p) => p.id), [shown]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.indexOf(String(active.id));
    const toIndex = items.indexOf(String(over.id));
    if (from === -1 || toIndex === -1) return;
    setPendingOrder(arrayMove(items, from, toIndex));
    const settle = () => setPendingOrder(null);
    void onReorder(String(active.id), toIndex).then(settle, settle);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[withinList]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {/* 지연 청크가 실제로 도착했다는 표지 — `profile-sidebar`의 정적 목록과 짝이다. */}
        <ul className={sidebarListClass} data-profile-list="sortable">
          {/* 프로필이 늘거나 줄 때 fade+height — 규칙 목록과 같은 모션이다. `initial={false}`라
              화면을 처음 열 때는 이미 있던 행들이 움직이지 않는다. */}
          <AnimatePresence initial={false}>
            {shown.map((profile) => (
              <SortableItem
                key={profile.id}
                profile={profile}
                status={profileRowStatus(profile, paused)}
                selected={profile.id === selectedId}
                onSelect={() => onSelect(profile.id)}
                onToggleActive={(active) => onToggleActive(profile.id, active)}
                onDelete={() => onDelete(profile.id)}
                dragLabel={profileReorderLabel(profile, t)}
              />
            ))}
          </AnimatePresence>
        </ul>
      </SortableContext>
    </DndContext>
  );
}
