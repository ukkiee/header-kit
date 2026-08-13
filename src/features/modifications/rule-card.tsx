import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Modification } from '@/core/schema';
import { format, type Translator } from '@/core/i18n';
import { AnimatePresence, MotionRow } from '@/ui/row-motion';
import { focusRing } from '@/ui/tokens';
import { useT } from '@/ui/i18n-context';
import { ruleFormIntentProps } from './lazy-rule-form';
import { RuleRow } from './rule-row';
import { ruleView } from './rule-summary';

/**
 * 규칙 카드 하나와, 그것을 담는 **정적 목록**.
 *
 * **정적 목록과 드래그 목록이 이 파일의 것을 공유한다.** 두 목록이 각자 행을 그리면 지연 청크가
 * 도착하는 순간 모양이 갈라지고 그 갈라짐은 화면만 봐서는 알 수 없다 — 프로필 사이드바가 같은
 * 이유로 두 목록에 같은 클래스 상수를 쓴다(`profile-dot.tsx`의 `sidebarListClass`).
 */

/**
 * 목록 레이아웃 — 정적·드래그 두 목록이 반드시 같아야 한다(로드 후 시각 점프 금지).
 *
 * **행 사이 간격이 `gap`이 아니다.** flex의 `gap`은 애니메이트되지 않으므로, 퇴장하는 행의
 * 높이가 0까지 접혀도 그 행 몫의 간격은 그대로 남아 있다가 **언마운트되는 프레임에 통째로
 * 사라진다** — 실측으로 부드럽게 접히던 목록이 마지막에 6px을 툭 뛰었다(프로필 목록은
 * `gap-0.5`라 2px이었고, 그래서 규칙 쪽만 눈에 띄었다).
 *
 * 그래서 간격을 **접히는 것 안**으로 옮긴다: 각 행이 자기 아래 여백을 `ruleRowSpacing`으로
 * 들고, 높이가 접힐 때 그 여백도 함께 접힌다. 목록 끝에 남는 마지막 행의 여백은 `-mb-1.5`가
 * 되돌린다 — 그 값은 상수라 튀지 않는다.
 */
export const ruleListClass = 'flex flex-col -mb-1.5';

/** 행이 **스스로 드는** 아래 여백. `MotionRow` 안에 있어야 높이와 함께 접힌다. */
export const ruleRowSpacing = 'pb-1.5';

/**
 * 접힌 카드와 펼쳐진 카드가 **테두리와 배경 둘 다** 다르다 (ADR 0017 story 6).
 *
 * 하나만 다르면 열린 것을 알아보는 단서가 하나뿐이고, 그 하나가 색이면 색을 못 보는 사람에게
 * 아무 단서도 남지 않는다. 눌린 수정 아이콘까지 세면 세 겹이라 어느 하나가 죽어도 남는다.
 */
export const collapsedCard = 'rounded-lg border border-border';
export const expandedCard = 'rounded-lg border border-primary bg-secondary/40';

/**
 * 그립의 접근성 이름 — 규칙은 이름이 없으므로 요약의 제목을 쓴다(`ruleView`가 만드는 그것,
 * 행에 실제로 보이는 문자열이다). 보이는 말과 이름의 말이 같아야 음성 제어 사용자가 눈으로
 * 읽은 말로 그 컨트롤을 부를 수 있다(WCAG 2.5.3).
 */
export function ruleReorderLabel(modification: Modification, t: Translator): string {
  return format(t('ariaReorderRule'), { name: ruleView(modification, t).title });
}

// 평상 색은 `--input`이다 — `--border`는 장식 구분선용이라 대비를 지지 않는데(profile-dot의
// 같은 주석) 그립은 눌러 끄는 상호작용 요소다. 프로필 그립과 **같은 클래스**를 쓴다.
const gripClass = `flex shrink-0 cursor-grab touch-none items-center text-input hover:text-muted-foreground focus-visible:text-muted-foreground active:cursor-grabbing ${focusRing}`;

/**
 * 재정렬 그립 — dnd-kit attributes/listeners를 받으면 드래그 핸들이 되고, 없으면 정적(로드 전
 * fallback). 정적·드래그가 같은 모양이라 lazy 로드 후 시각 점프가 없다.
 *
 * **진짜 `<button>`이다.** div/span에 리스너를 붙이면 `a11y-gate`에 새 지문이 생기고(그 게이트의
 * 베이스라인은 지금 features 넷뿐이다), 무엇보다 키보드로 닿지 않는다.
 *
 * 그립은 **행 높이의 세로 중앙**에 선다 — 프로필 행의 그립과 같은 규약이다. 위에 붙이면
 * 규칙이 두 줄이든 세 줄이든 그립만 홀로 위쪽에 떠 있어 어느 행의 것인지가 형태로 읽히지 않는다.
 */
export function RuleGrip({
  label,
  attributes,
  listeners,
}: {
  label: string;
  attributes?: DraggableAttributes;
  listeners?: SyntheticListenerMap;
}) {
  return (
    <button type="button" aria-label={label} className={gripClass} {...attributes} {...listeners}>
      <GripVertical size={14} strokeWidth={1.75} />
    </button>
  );
}

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
  /** 재정렬 그립. 정적 목록은 기능 없는 것을, 드래그 목록은 바인딩을 받은 것을 넘긴다. */
  grip: ReactNode;
  /** 목록에서 이 행이 선 자리 — 바뀌면 삭제 무장이 풀린다 (`useArmedConfirm`). */
  index?: number;
}

export function RuleCard({
  modification,
  paused,
  open,
  onToggleEnabled,
  onEdit,
  onRemove,
  formSlot,
  grip,
  index,
}: RuleCardProps) {
  return (
    /*
     * 폼으로 가는 길목 셋째 — 행 어디에 포인터가 닿거나 포커스가 들어오면 청크를 받기
     * 시작한다. 연필 아이콘까지 뚫고 내려보내는 대신 여기에 두면 배선이 한 곳이고, 행에
     * 닿는 것 자체가 이미 편집 의도에 가깝다.
     */
    /*
     * `group`이 카드 전체를 덮는다 — 그립에 닿아도 편집·삭제가 서야 한다(프로필 행과 같다).
     *
     * `data-rule-card`는 **관측 표지**다(`data-rule-list`와 같은 결). 예전에는 스모크가
     * "`.group`을 품은 `rounded-lg border` 요소"로 카드를 집었는데, 그 `group`이 행에서
     * 카드로 옮겨 오자 그 선택자가 아무것도 못 찾아 **조용히 빈 배열을 쟀다** — 스타일
     * 클래스를 구조 표지로 쓰면 스타일을 옮기는 것만으로 검사가 무음이 된다.
     */
    <div
      data-rule-card={open ? 'expanded' : 'collapsed'}
      className={`group pr-2.5 pl-1 ${open ? expandedCard : collapsedCard}`}
      {...ruleFormIntentProps}
    >
      {/*
        그립이 행 **왼쪽 밖**에 서고 그 오른쪽을 행이 채운다. 행 안에 넣으면 규칙 요약이 그만큼
        줄어드는데, 요약은 이 목록에서 사용자가 실제로 읽는 유일한 것이다.

        카드의 좌측 padding을 2.5에서 1로 줄여 그립이 차지하는 폭을 되돌린다 — 그러지 않으면
        규칙 제목이 그립 폭만큼 잘려 `overflow-gate`가 재는 가로 폭에 영향을 준다.
      */}
      <div className="flex items-center gap-0.5">
        {grip}
        {/*
          `pl-2`가 그립과 내용 사이를 **프로필 행과 같은 10px**로 맞춘다 (사용자 요청).

          실측: 규칙은 그립 오른쪽 2px에서 제목이 시작했고 프로필은 컬러칩까지 10px이었다.
          차이 8px은 전부 프로필 이름 칩(`SwitcherChip`)의 `px-2`에서 온다 — 그쪽에는 그립
          옆에 padding을 가진 버튼이 서지만 여기에는 그런 버튼이 없다. 두 행이 공유하는
          `gap-0.5`를 건드리는 대신 같은 값(8px)을 이 자리에 준 이유가 그것이다.

          대가는 제목·칩 열이 256 → 248px로 좁아지는 것뿐이고, 전부 `min-w-0`+`truncate`라
          잘림으로 흡수된다 — 최대 길이 규칙을 심어 재도 가로 넘침은 0px이다.
        */}
        <div className="min-w-0 flex-1 pl-2">
          <RuleRow
            modification={modification}
            paused={paused}
            editing={open}
            onToggleEnabled={onToggleEnabled}
            onEdit={onEdit}
            onRemove={onRemove}
            index={index}
          />
        </div>
      </div>
      {formSlot}
    </div>
  );
}

/** 한 행에 필요한 것 — 두 목록이 같은 모양으로 받는다. */
export interface RuleListRowProps {
  paused: boolean;
  /** 열린 규칙의 id. `'new'`는 목록 밖 카드라 여기 오지 않는다. */
  openId: string | null;
  onToggleEnabled: (modification: Modification, enabled: boolean) => void;
  onEdit: (modification: Modification) => void;
  onRemove: (modification: Modification) => void;
  /** 그 규칙의 폼 자리 — 셸이 만든다. */
  renderFormSlot: (modification: Modification) => ReactNode;
}

export interface StaticRuleListProps extends RuleListRowProps {
  /** 표시 순서 — 편집 중인 규칙의 hoist가 이미 반영된 배열이다. */
  modifications: readonly Modification[];
  /** 마지막 행이 다 접힌 시점을 셸에 알린다(빈 상태 순서·붙잡은 행 해제). */
  onExitComplete: () => void;
}

/**
 * 정적 규칙 목록 — 드래그 청크가 도착하기 전, 그리고 폼이 열려 있는 동안의 목록.
 *
 * 그립은 **모양만** 있다. 기능 없이 두는 이유는 도착 전후로 자리와 크기가 같아야 시각 점프가
 * 없기 때문이고, 프로필 사이드바가 같은 규약을 쓴다.
 */
export function StaticRuleList({
  modifications,
  paused,
  openId,
  onToggleEnabled,
  onEdit,
  onRemove,
  renderFormSlot,
  onExitComplete,
}: StaticRuleListProps) {
  const t = useT();
  return (
    // `data-rule-list` — 어느 목록이 그려졌는지를 **관측 가능**하게 남긴다. 두 목록은 같은
    // 클래스로 같은 모양을 그리므로 화면만 봐서는 지연 청크가 도착했는지 알 수 없다.
    <ul className={ruleListClass} data-rule-list="static">
      <AnimatePresence initial={false} onExitComplete={onExitComplete}>
        {modifications.map((modification, index) => (
          // `MotionRow`가 `<li>` **안에** 있다 — 드래그 목록도 같은 배치라(그쪽은 `<li>`가
          // dnd-kit의 transform을 든다) 두 목록의 DOM 깊이가 같다. `AnimatePresence`의 직접
          // 자식은 키를 든 `<li>`이고, 그 안의 모션은 presence 컨텍스트로 참여한다.
          <li key={modification.id}>
            <MotionRow>
              {/* 여백이 `MotionRow` **안**에 있어야 높이와 함께 접힌다 — `ruleListClass` 주석. */}
              <div className={ruleRowSpacing}>
                <RuleCard
                  modification={modification}
                  paused={paused}
                  open={openId === modification.id}
                  onToggleEnabled={(enabled) => onToggleEnabled(modification, enabled)}
                  onEdit={() => onEdit(modification)}
                  onRemove={() => onRemove(modification)}
                  formSlot={renderFormSlot(modification)}
                  grip={<RuleGrip label={ruleReorderLabel(modification, t)} />}
                  index={index}
                />
              </div>
            </MotionRow>
          </li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
