import type { ReactNode } from 'react';
import type { Modification } from '@/core/schema';
import { ruleFormIntentProps } from './lazy-rule-form';
import { RuleRow } from './rule-row';

/**
 * 규칙 카드 하나 — 행과 그 아래로 펼쳐지는 폼 자리.
 *
 * **정적 목록과 드래그 목록이 이 컴포넌트 하나를 공유하게 하려고 뽑았다.** 두 목록이 각자 행을
 * 그리면 지연 청크가 도착하는 순간 모양이 갈라지고, 그 갈라짐은 화면만 봐서는 알 수 없다 —
 * 프로필 사이드바가 같은 이유로 정적 목록과 드래그 목록에 같은 클래스 상수를 쓴다.
 *
 * `MotionRow`는 **여기 없다.** 등장·퇴장을 관리하는 `AnimatePresence`의 직접 자식이어야 하므로
 * 목록 쪽에 남긴다 — 여기로 들이면 키가 한 겹 안으로 들어가 그 관리가 흐트러진다.
 */
export interface RuleCardProps {
  modification: Modification;
  /** 전역 정지 — 행이 꺼진 것과 같은 흐림으로 읽힌다. */
  paused: boolean;
  /** 이 규칙의 폼이 열려 있는가. 테두리·배경과 수정 아이콘의 눌린 상태가 함께 바뀐다. */
  open: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
  /**
   * 행 아래로 펼쳐지는 폼. **부모가 `AnimatePresence`까지 감싸서 넘긴다** — 폼을 받아 오는
   * 것과 저장 결과를 다루는 것이 셸의 일이라 이 컴포넌트가 알 필요가 없다.
   */
  formSlot: ReactNode;
}

/**
 * 접힌 카드와 펼쳐진 카드가 **테두리와 배경 둘 다** 다르다 (ADR 0017 story 6).
 *
 * 하나만 다르면 열린 것을 알아보는 단서가 하나뿐이고, 그 하나가 색이면 색을 못 보는 사람에게
 * 아무 단서도 남지 않는다. 눌린 수정 아이콘까지 세면 세 겹이라 어느 하나가 죽어도 남는다.
 */
export const collapsedCard = 'rounded-lg border border-border';
export const expandedCard = 'rounded-lg border border-primary bg-secondary/40';

export function RuleCard({
  modification,
  paused,
  open,
  onToggleEnabled,
  onEdit,
  onRemove,
  formSlot,
}: RuleCardProps) {
  return (
    /*
     * 폼으로 가는 길목 셋째 — 행 어디에 포인터가 닿거나 포커스가 들어오면 청크를 받기
     * 시작한다. 연필 아이콘까지 뚫고 내려보내는 대신 여기에 두면 배선이 한 곳이고, 행에
     * 닿는 것 자체가 이미 편집 의도에 가깝다.
     */
    <div className={`px-2.5 ${open ? expandedCard : collapsedCard}`} {...ruleFormIntentProps}>
      <RuleRow
        modification={modification}
        paused={paused}
        editing={open}
        onToggleEnabled={onToggleEnabled}
        onEdit={onEdit}
        onRemove={onRemove}
      />
      {formSlot}
    </div>
  );
}
