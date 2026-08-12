import { Plus } from 'lucide-react';
import type { SuggestionHistory } from '@/core/autocomplete';
import type { Command } from '@/core/commands';
import type { Modification, Profile } from '@/core/schema';
import { Button } from '@/ui/press-button';
import { lazy, Suspense, useEffect, useState } from 'react';
import { AnimatePresence, MotionRow, useReducedMotion } from '@/ui/row-motion';
import { ruleFormIntentProps, RuleFormSlot, useRuleForm } from '@/features/modifications/lazy-rule-form';
import { expandedCard, StaticRuleList } from '@/features/modifications/rule-card';
import { useT } from '@/ui/i18n-context';

// dnd-kit은 이 lazy 청크에만 있다 — 팝업 초기 번들에서 제외된다(`sortable-profile-list`와
// 같은 규약). 도착 전에는 `Suspense`의 fallback인 정적 목록이 **같은 모양으로** 서 있다.
const SortableRuleList = lazy(() => import('@/features/modifications/sortable-rule-list'));

export interface ProfileSectionProps {
  profile: Profile;
  /** 전역 정지 — 행이 꺼진 것과 같은 흐림으로 읽힌다 (story 12). */
  paused: boolean;
  onCommand: (command: Command) => void;
  /** 규칙 삭제 — 스냅샷을 잡아 Undo 토스트를 띄운다 (ui-refine 07). */
  onDeleteRule: (profileId: string, modificationId: string) => void;
  /** 제안이 쓰는 사용 이력 셋 (티켓 08). */
  history?: SuggestionHistory;
  /** 규칙 저장 — 권위 실행 결과를 폼이 돌려받아 거부를 인라인으로 보여준다. */
  onCommandWithResult: (command: Command) => Promise<{ ok: boolean; error?: string }>;
  /**
   * 폼의 열림 상태는 **셸이 든다** (ADR 0017) — 여는 버튼이 본문 헤더로 갔기 때문이다.
   * 'new' = 생성, id = 그 규칙 편집, null = 목록만 (ADR 0006).
   */
  editingRule: 'new' | string | null;
  onEditingRuleChange: (next: 'new' | string | null) => void;
  /** 폼으로 가는 문 — 여는 즉시 청크를 부른다. */
  onOpenRuleForm: (target: 'new' | string) => void;
  /**
   * 규칙 순서 변경 — 드롭이 `move-modification` 명령으로 귀결된다(상태 전이는 앱 레이어).
   * 명령이 착지할 때까지의 약속을 돌려준다 — 드래그 목록의 낙관적 순서가 그것으로 수명을 정한다.
   */
  onReorderRule: (modificationId: string, toIndex: number) => Promise<void>;
}

export function ProfileSection({
  profile,
  paused,
  onCommand,
  onDeleteRule,
  history,
  onCommandWithResult,
  editingRule,
  onEditingRuleChange,
  onOpenRuleForm,
  onReorderRule,
}: ProfileSectionProps) {
  const t = useT();
  /*
   * 폼은 동적 청크에 있다 (티켓 07) — 도착 전에는 `null`이고 그 자리를 `RuleFormSlot`이 잡는다.
   * 상자 높이는 근사치라 정확히 맞지 않는다(근거는 그 컴포넌트 주석). 그래서 본선은 **상자가
   * 보이는 일 자체를 없애는 것**이다: 폼으로 가는 길목 셋에 `ruleFormIntentProps`를 붙여
   * 포인터가 닿거나 포커스가 들어오는 시점에 받기 시작한다. 실측으로 그 경로에서는 상자가
   * 한 프레임도 그려지지 않는다.
   */
  const RuleForm = useRuleForm();
  const reduce = useReducedMotion();
  const setEditingRule = onEditingRuleChange;
  const openRuleForm = onOpenRuleForm;

  /*
   * **새 규칙의 행은 폼이 다 접힌 뒤에 선다.**
   *
   * 저장하면 폼(400px)이 접히고 새 행(56px)이 목록에 들어온다. 둘이 동시에 움직이면 그
   * 차이만큼 아래 내용이 위로 당겨지면서, 무엇이 생겼는지보다 화면이 줄었다는 것이 먼저
   * 읽힌다 — 마지막 규칙을 지웠을 때 빈 상태가 성급히 서던 것과 같은 종류의 겹침이다.
   *
   * 그래서 방금 저장한 규칙 하나를 **폼이 사라질 때까지 목록에서 빼 둔다**. 붙잡는 것은 그
   * 하나뿐이라 다른 화면에서 들어온 규칙은 곧바로 보인다.
   *
   * reduced-motion에서는 접힘이 없어 기다릴 것도 없다 — 붙잡지 않는다(ADR 0012).
   */
  const [heldRowId, setHeldRowId] = useState<string | null>(null);

  /** 규칙 저장 — 원자 전송, 성공 시 폼 닫기. */
  const saveItem = async (item: Modification, op: 'add' | 'update') => {
    const command: Command =
      op === 'add'
        ? { type: 'add-modification', profileId: profile.id, modification: item }
        : { type: 'update-modification', profileId: profile.id, modification: item };
    const result = await onCommandWithResult(command);
    if (result.ok) {
      if (op === 'add' && !reduce) setHeldRowId(item.id);
      setEditingRule(null);
    }
    return result;
  };

  /*
   * 편집 중인 규칙을 목록 맨 위로 (티켓 10, 스펙 story 4). 목록 자체의 순서(상태)는
   * 건드리지 않는다 — 렌더 순서만 바꾸므로 폼을 닫으면 원래 자리로 돌아온다. 편집이
   * 저장으로 끝나든 취소로 끝나든 사용자가 기억하는 순서가 유지된다.
   */
  const editing = profile.modifications.find((m) => m.id === editingRule);
  const ordered = editing
    ? [editing, ...profile.modifications.filter((m) => m !== editing)]
    : profile.modifications;
  const orderedModifications = heldRowId ? ordered.filter((m) => m.id !== heldRowId) : ordered;

  /*
   * **빈 상태는 마지막 행이 다 접힌 뒤에 선다.**
   *
   * 예전에는 목록이 비는 그 순간 안내가 통째로 나타났다. 삭제한 행은 아직 260ms 동안 접히는
   * 중이라(`MotionRow`), 지우는 규칙 옆에 "아직 규칙이 없습니다"가 나란히 떠 있는 프레임이
   * 생긴다 — 규칙 하나짜리 프로필에서 특히 티가 났다. 화면이 사용자보다 먼저 결론을 말하는
   * 셈이라 빠른 것이 아니라 성급하게 읽힌다.
   *
   * 그래서 두 단계로 나눈다: 행이 접히고(260ms), 그다음 안내가 같은 모션으로 열린다.
   * 판단은 `onExitComplete` 하나가 내린다 — 시간을 재서 맞추면 모션 토큰이 바뀌는 날
   * 두 값이 조용히 어긋난다.
   *
   * `initial={false}`가 아래 안내에도 붙는 이유: 규칙이 원래 없는 프로필을 열 때는 기다릴
   * 퇴장이 없으므로 애니메이션 없이 곧바로 서야 한다. 첫 렌더에 이미 있는 자식은 그 prop이
   * 등장 모션을 건너뛰게 한다.
   *
   * reduced-motion에서는 퇴장이 없어 기다릴 것도 없다 — 감도 계약이 "전이의 부재"이므로
   * 순서도 함께 사라지는 것이 맞다(ADR 0012).
   */
  const listIsEmpty = profile.modifications.length === 0 && editingRule === null;
  const [emptyReady, setEmptyReady] = useState(listIsEmpty);
  useEffect(() => {
    // 목록이 다시 차면 다음 비움을 위해 되돌린다. 안내가 사라지는 것은 이 플래그가 아니라
    // `listIsEmpty`가 정하므로, 이 되돌림이 한 프레임 늦어도 화면에는 나타나지 않는다.
    if (!listIsEmpty) setEmptyReady(false);
    // 규칙이 원래 없던 프로필은 마운트 시점에 이미 참이라(useState) 여기서 건드리지 않는다.
    else if (reduce) setEmptyReady(true);
  }, [listIsEmpty, reduce]);

  /*
   * 붙잡아 둔 행의 안전망 — 폼이 **다시 열리면** 놓는다.
   *
   * 정상 경로에서는 `onExitComplete`가 놓아 준다. 그것이 오지 않는 경로(다음 저장이 앞선
   * 퇴장을 앞지르는 식)에서 붙잡은 채로 남으면 저장된 규칙이 목록에서 사라진 것처럼 보인다 —
   * 화면이 저장소와 다른 말을 하는 것은 어떤 모션보다 나쁘다.
   */
  useEffect(() => {
    if (editingRule !== null) setHeldRowId(null);
  }, [editingRule]);

  /*
   * 두 목록 구현이 **같은 것을 받는다** — 한쪽에만 prop을 더하면 도착 전후로 행이 달라진다.
   * 폼 자리는 콜백으로 넘긴다: 폼을 받아 오는 것과 저장 결과를 다루는 것은 셸의 일이다.
   */
  const ruleListProps = {
    modifications: orderedModifications,
    paused,
    openId: editingRule === 'new' ? null : editingRule,
    onToggleEnabled: (modification: Modification, enabled: boolean) =>
      onCommand({
        type: 'update-modification',
        profileId: profile.id,
        modification: { ...modification, enabled } as Modification,
      }),
    // 같은 버튼으로 열고 닫는다 (story 5) — 열려 있으면 누르는 것이 접기다.
    onEdit: (modification: Modification) =>
      editingRule === modification.id ? setEditingRule(null) : openRuleForm(modification.id),
    onRemove: (modification: Modification) => onDeleteRule(profile.id, modification.id),
    renderFormSlot: (modification: Modification) => (
      /* 폼이 행 **아래로** 펼쳐진다 — 열림에 height-in, 닫힘에 height-out (ui-refine 08).
         AnimatePresence가 없으면 닫힘이 즉시 사라진다. */
      <AnimatePresence initial={false}>
        {editingRule === modification.id && (
          <MotionRow key={`${modification.id}-form`}>
            <div className="border-t border-border py-2">
              {RuleForm ? (
                <RuleForm
                  initial={modification}
                  history={history}
                  onCancel={() => setEditingRule(null)}
                  onSave={(next) => saveItem(next, 'update')}
                />
              ) : (
                <RuleFormSlot />
              )}
            </div>
          </MotionRow>
        )}
      </AnimatePresence>
    ),
    onExitComplete: () => {
      if (listIsEmpty) setEmptyReady(true);
      // 폼이 사라졌다 — 붙잡아 둔 새 행을 이제 세운다.
      setHeldRowId(null);
    },
  };

  /**
   * 드래그를 받을 수 있는 조건 — 표시 순서가 권위 순서와 같을 때뿐이다. 편집 중이면 그 규칙이
   * 맨 위로 hoist되고, 붙잡은 행이 있으면 목록에서 하나가 빠져 있다. 그래서 이때만 드롭의
   * `toIndex`를 권위 배열의 인덱스로 그대로 쓸 수 있다.
   */
  const reorderable = editingRule === null && heldRowId === null;

  /*
   * **카드에 헤더가 없다** (ADR 0017, 티켓 04). 예전에는 이 자리에 이름·색·두 글자 라벨 입력과
   * ⋯ 메뉴(복제·삭제)가 있었다. 시안에 그 컨트롤들이 없으므로 넷 다 없앴고, 지금 보는 프로필의
   * 이름은 본문 헤더 바가 제목으로 든다(티켓 03). 되돌리는 유일한 길은 전체 초기화다 —
   * 값이 작지 않은 트레이드오프이고 ADR 0017에 그렇게 적혀 있다.
   *
   * **바깥 카드도 없다.** 헤더가 사라진 뒤로 그 `Card`가 하던 일은 규칙 카드 목록을 한 겹 더
   * 감싸는 것뿐이었고, 화면에서는 둥근 상자 안에 둥근 상자가 겹쳐 보였다. 목록의 단위는
   * 규칙 카드 하나이므로 그 위의 껍질은 뜻을 나르지 않는다 — 빈 상태 안내와 목록이 본문
   * 스크롤 영역의 직접 자식이 된다. 빈 상태를 목록과 **같은 flex 열에** 두는 것이 중요하다:
   * 따로 두면 규칙이 없을 때 비어 있는 목록 상자가 여전히 flex 항목이라 안내 아래에 죽은
   * 간격이 남는다.
   */
  return (
    <div className="flex flex-col gap-1.5">
      {/*
        아코디언 카드 목록 (ADR 0017, 스펙 story 1–7) — 규칙 하나가 카드 하나다.

        **행은 사라지지 않는다.** 예전에는 편집 중인 규칙의 행이 폼으로 교체돼, 무엇을 고치는
        중인지가 화면에서 없어졌다. 이제 행은 그대로 있고 그 아래로 폼이 펼쳐진다 — 그것이
        아코디언이라는 말의 뜻이고, 이 티켓의 이유다.

        펼쳐진 규칙은 **맨 위로 올라온다**(orderedModifications). 목록 자체의 순서(상태)는
        건드리지 않으므로 폼을 닫으면 원래 자리로 돌아온다 — 저장으로 끝나든 취소로 끝나든
        사용자가 기억하는 순서가 유지된다.
      */}
      <AnimatePresence
        initial={false}
        // 마지막 행이 다 접힌 그 순간이 빈 상태가 설 시점이다 (위 주석).
        onExitComplete={() => {
          if (listIsEmpty) setEmptyReady(true);
          // 폼이 사라졌다 — 붙잡아 둔 새 행을 이제 세운다.
          setHeldRowId(null);
        }}
      >
        {/*
          새 규칙 폼이 목록 **맨 위**에 카드로 열린다 (story 7). 예전에는 목록 아래에
          있어서, 규칙이 많으면 방금 만들기 시작한 것을 찾아 스크롤해야 했다.
        */}
        {editingRule === 'new' && (
          <MotionRow key="new-rule-form">
            <div className={`${expandedCard} p-2`}>
              {RuleForm ? (
                <RuleForm
                  history={history}
                  onCancel={() => setEditingRule(null)}
                  onSave={(next) => saveItem(next, 'add')}
                />
              ) : (
                <RuleFormSlot />
              )}
            </div>
          </MotionRow>
        )}
      </AnimatePresence>

      {/*
        규칙 목록 — 정적/드래그 두 구현이 `RuleCard` 하나를 공유하므로 도착 전후 모양이 같다.

        **도착한 뒤에는 정적으로 되돌아가지 않는다.** 되돌리면 컴포넌트가 바뀌어 행이 remount되고
        그 remount가 사용자가 입력 중인 폼을 파괴한다. 폼이 열려 있거나 방금 저장한 행을 붙잡고
        있는 동안은 목록을 그대로 두고 **드래그만** 끈다(`reorderable`).
      */}
      <Suspense fallback={<StaticRuleList {...ruleListProps} />}>
        <SortableRuleList {...ruleListProps} reorderable={reorderable} onReorder={onReorderRule} />
      </Suspense>

      {/*
        **빈 상태는 목록 아래에 있다.** 화면에서는 둘이 동시에 서는 일이 없으니 순서가
        안 보일 것 같지만, 전이 중에는 보인다: 위에 있으면 규칙 추가를 눌렀을 때 안내가
        접히는 만큼 그 아래의 폼이 위로 끌려 올라가, 폼이 펴지는 것이 아니라 아래에서
        솟아오르는 것으로 읽힌다. 아래로 내리면 폼은 제자리에서 아래로 펴지고 안내는 그
        밑에서 접힌다 — 움직이는 것이 하나뿐이라 눈이 쫓을 것도 하나다.
      */}
      <AnimatePresence initial={false}>
        {listIsEmpty && emptyReady && (
          <MotionRow key="empty-state">
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-6 text-center">
              <p className="text-xs text-muted-foreground">{t('noRulesYet')}</p>
              <Button size="sm" {...ruleFormIntentProps} onClick={() => openRuleForm('new')}>
                <Plus size={14} strokeWidth={1.75} className="mr-1" />
                {t('addRule')}
              </Button>
            </div>
          </MotionRow>
        )}
      </AnimatePresence>
    </div>
  );
}
