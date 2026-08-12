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
import type { Modification } from '@/core/schema';
import { AnimatePresence, MotionRow } from '@/ui/row-motion';
import { useT } from '@/ui/i18n-context';
import { RuleCard, RuleGrip, ruleListClass, ruleReorderLabel, type RuleListRowProps } from './rule-card';

/**
 * 드래그 재정렬 규칙 목록 — dnd-kit을 여기 몰아넣어 동적 import 대상으로 삼는다.
 * `profile-section`이 도착 전 같은 모양의 정적 목록(`StaticRuleList`)을 먼저 그리므로,
 * 도착 후 그립이 기능만 얻고 시각 점프는 없다. 선행 예: `sortable-profile-list`.
 *
 * **순서는 표시 정렬이 아니라 적용 우선순위다** — 컴파일이 앞선 규칙에 더 높은 dNR priority를
 * 준다(`core/compile.ts`의 충돌 의미론). 그래서 드롭은 실제로 나가는 헤더의 승자를 바꾼다.
 */
export interface SortableRuleListProps extends RuleListRowProps {
  /**
   * 표시 순서. **이 목록이 마운트되는 동안 표시 순서와 권위 순서가 같다** — 셸이 편집 중이거나
   * 붙잡은 행이 있으면 `reorderable`을 내려 드래그를 막고, 그때는 인덱스를 보내지 않는다.
   */
  modifications: readonly Modification[];
  /**
   * 드래그를 받을 수 있는가. 폼이 열려 있거나 방금 저장한 행을 붙잡고 있는 동안은 거짓이다 —
   * 그때 표시 순서가 권위 순서와 어긋나므로(편집 중인 규칙이 맨 위로 hoist된다) 드롭 인덱스가
   * 틀린 규칙을 가리킨다.
   *
   * **목록을 정적으로 되돌리지 않고 여기서 끈다.** 되돌리면 컴포넌트가 바뀌어 행이 remount되고,
   * 그 remount가 사용자가 입력 중인 폼을 파괴한다.
   */
  reorderable: boolean;
  /**
   * 순서 변경 — **명령이 착지할 때까지의 약속을 돌려준다.** 아래 낙관적 순서가 그 약속으로
   * 자기 수명을 정한다: 성공이든 실패든 settle되는 순간 권위 순서로 돌아간다.
   */
  onReorder: (modificationId: string, toIndex: number) => Promise<void>;
  /** 마지막 행이 다 접힌 시점을 셸에 알린다(빈 상태 순서·붙잡은 행 해제). */
  onExitComplete: () => void;
}

/**
 * 끌리는 범위를 **목록 안으로** 가둔다 — 세로로만, 그리고 첫 행 위·마지막 행 아래로는 못 간다.
 * 근거는 `sortable-profile-list`의 같은 모디파이어가 적는다(가로 이동은 정보가 아니고, 목록
 * 밖으로 나간 행은 무엇을 어디에 놓는 중인지 알 수 없게 만든다).
 */
const withinList: Modifier = ({ transform, draggingNodeRect, containerNodeRect }) => {
  if (!draggingNodeRect || !containerNodeRect) return { ...transform, x: 0 };
  const top = containerNodeRect.top - draggingNodeRect.top;
  const bottom = containerNodeRect.bottom - draggingNodeRect.bottom;
  return { ...transform, x: 0, y: Math.min(Math.max(transform.y, top), bottom) };
};

/**
 * 낙관적 순서를 권위 목록 위에 얹는다 — **집합이 정확히 같을 때만.** 다른 표면에서 규칙이 늘거나
 * 줄면 낙관 순서는 더 이상 이 목록을 설명하지 못하므로 조용히 권위로 물러난다.
 */
function applyPendingOrder(
  modifications: readonly Modification[],
  pending: readonly string[] | null,
): readonly Modification[] {
  if (!pending || pending.length !== modifications.length) return modifications;
  const byId = new Map(modifications.map((m) => [m.id, m]));
  const ordered: Modification[] = [];
  for (const id of pending) {
    const found = byId.get(id);
    if (!found) return modifications;
    ordered.push(found);
  }
  return ordered;
}

function SortableItem({
  modification,
  paused,
  open,
  reorderable,
  onToggleEnabled,
  onEdit,
  onRemove,
  formSlot,
}: {
  modification: Modification;
  paused: boolean;
  open: boolean;
  reorderable: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
  formSlot: React.ReactNode;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: modification.id,
    disabled: !reorderable,
  });
  return (
    /*
     * **모션 래퍼가 `<li>` 안에 있다.** 바깥에 두면 dnd-kit이 쓰는 인라인 `transform`을 motion이
     * 자기 값으로 덮어 드래그가 멈춘다 — ADR 0011의 경계가 그것을 명시한다("드래그 애니메이션은
     * dnd-kit transform에 위임, motion과 이중 적용 금지"). 그래서 `li`는 dnd-kit의 것으로 남기고
     * 높이·투명도만 다루는 `MotionRow`를 그 안에 넣는다. 정적 목록도 같은 배치다.
     *
     * **`CSS.Translate`이지 `CSS.Transform`이 아니다.** 후자는 dnd-kit이 낸 `scaleX`·`scaleY`
     * 까지 문자열에 싣는데, dnd-kit은 **높이가 다른 항목** 사이를 옮길 때 그 비율을 scale로
     * 낸다. 규칙 카드는 칩 줄이 감기면 두 줄이 세 줄이 되므로 이 목록에는 높이가 여러 가지고,
     * 세 줄 규칙을 두 줄 자리로 끌면 `scaleY(0.48)`이 붙어 카드가 눌린 채 끌렸다 —
     * 실측 122px → 59px이고 그 값은 정확히 59/122다.
     *
     * 눌리는 것은 **그림뿐**이었다: 같은 순간 `clientHeight`·`scrollHeight`는 둘 다 122로
     * 남아 있었다. 그래서 `MotionRow`의 `height: 'auto'`와 `overflow: hidden`은 이 일과
     * 무관하다 — 처음 의심한 자리가 거기였고, 재현이 아니었다면 엉뚱한 데를 고쳤을 것이다.
     */
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'z-10 opacity-70' : ''}
    >
      <MotionRow>
        <RuleCard
          modification={modification}
          paused={paused}
          open={open}
          onToggleEnabled={onToggleEnabled}
          onEdit={onEdit}
          onRemove={onRemove}
          formSlot={formSlot}
          grip={
            <RuleGrip
              label={ruleReorderLabel(modification, t)}
              // 드래그를 받지 않는 동안에는 바인딩을 주지 않는다 — 정적 목록의 그립과 같은
              // 상태가 되어, 잡히지 않는 핸들이 잡히는 척하지 않는다.
              attributes={reorderable ? attributes : undefined}
              listeners={reorderable ? listeners : undefined}
            />
          }
        />
      </MotionRow>
    </li>
  );
}

export default function SortableRuleList({
  modifications,
  paused,
  openId,
  reorderable,
  onToggleEnabled,
  onEdit,
  onRemove,
  renderFormSlot,
  onReorder,
  onExitComplete,
}: SortableRuleListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /*
   * **드롭과 같은 커밋에서 순서를 확정한다** — 근거 전체는 `sortable-profile-list`의 같은 자리가
   * 적는다. 요약하면: 권위 순서는 배경 서비스워커를 한 바퀴 돌아야 갱신되고 그 왕복은 한 프레임
   * 안에 끝나지 않으므로, 낙관 순서를 얹지 않으면 dnd-kit이 "착지 인덱스 ≠ 실제 인덱스"를 보고
   * 200ms 복귀 애니메이션을 붙인다 — 놓은 행이 원래 자리로 올라갔다가 툭 내려온다.
   *
   * **낙관은 화면에만 산다.** 권위는 명령 하나뿐이고 왕복이 끝나면 이 오버라이드를 버린다.
   */
  const [pendingOrder, setPendingOrder] = useState<readonly string[] | null>(null);
  const shown = useMemo(() => applyPendingOrder(modifications, pendingOrder), [modifications, pendingOrder]);
  // `useSortable`은 이 배열을 **참조로** 비교한다 — 렌더마다 새로 만들면 변경 감지가 헛돈다.
  const items = useMemo(() => shown.map((m) => m.id), [shown]);

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
        {/* 지연 청크가 실제로 도착했다는 표지 — `StaticRuleList`의 `static`과 짝이다. */}
        <ul className={ruleListClass} data-rule-list="sortable">
          <AnimatePresence initial={false} onExitComplete={onExitComplete}>
            {shown.map((modification) => (
              <SortableItem
                key={modification.id}
                modification={modification}
                paused={paused}
                open={openId === modification.id}
                reorderable={reorderable}
                onToggleEnabled={(enabled) => onToggleEnabled(modification, enabled)}
                onEdit={() => onEdit(modification)}
                onRemove={() => onRemove(modification)}
                formSlot={renderFormSlot(modification)}
              />
            ))}
          </AnimatePresence>
        </ul>
      </SortableContext>
    </DndContext>
  );
}
