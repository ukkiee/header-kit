import { Plus } from 'lucide-react';
import type { SuggestionHistory } from '@/core/autocomplete';
import type { Command } from '@/core/commands';
import type { Modification, Profile } from '@/core/schema';
import { Button } from '@/ui/press-button';
import { AnimatePresence, MotionRow } from '@/ui/motion-row';
import {
  ruleFormIntentProps,
  RuleFormSlot,
  useRuleForm,
} from '@/features/modifications/lazy-rule-form';
import { RuleRow } from '@/features/modifications/rule-row';
import { useT } from '@/ui/i18n-context';

/**
 * 접힌 카드와 펼쳐진 카드가 **테두리와 배경 둘 다** 다르다 (story 6).
 *
 * 하나만 다르면 열린 것을 알아보는 단서가 하나뿐이고, 그 하나가 색이면 색을 못 보는 사람에게
 * 아무 단서도 남지 않는다. 눌린 수정 아이콘까지 세면 세 겹이라 어느 하나가 죽어도 남는다.
 */
const collapsedCard = 'rounded-lg border border-border';
const expandedCard = 'rounded-lg border border-primary bg-secondary/40';

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
  const setEditingRule = onEditingRuleChange;
  const openRuleForm = onOpenRuleForm;

  /** 규칙 저장 — 원자 전송, 성공 시 폼 닫기. */
  const saveItem = async (item: Modification, op: 'add' | 'update') => {
    const command: Command =
      op === 'add'
        ? { type: 'add-modification', profileId: profile.id, modification: item }
        : { type: 'update-modification', profileId: profile.id, modification: item };
    const result = await onCommandWithResult(command);
    if (result.ok) setEditingRule(null);
    return result;
  };

  /*
   * 편집 중인 규칙을 목록 맨 위로 (티켓 10, 스펙 story 4). 목록 자체의 순서(상태)는
   * 건드리지 않는다 — 렌더 순서만 바꾸므로 폼을 닫으면 원래 자리로 돌아온다. 편집이
   * 저장으로 끝나든 취소로 끝나든 사용자가 기억하는 순서가 유지된다.
   */
  const editing = profile.modifications.find((m) => m.id === editingRule);
  const orderedModifications = editing
    ? [editing, ...profile.modifications.filter((m) => m !== editing)]
    : profile.modifications;

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
      {profile.modifications.length === 0 && editingRule === null && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-6 text-center">
          <p className="text-xs text-muted-foreground">{t('noRulesYet')}</p>
          <Button size="sm" {...ruleFormIntentProps} onClick={() => openRuleForm('new')}>
            <Plus size={14} strokeWidth={1.75} className="mr-1" />
            {t('addRule')}
          </Button>
        </div>
      )}

      {/*
        아코디언 카드 목록 (ADR 0017, 스펙 story 1–7) — 규칙 하나가 카드 하나다.

        **행은 사라지지 않는다.** 예전에는 편집 중인 규칙의 행이 폼으로 교체돼, 무엇을 고치는
        중인지가 화면에서 없어졌다. 이제 행은 그대로 있고 그 아래로 폼이 펼쳐진다 — 그것이
        아코디언이라는 말의 뜻이고, 이 티켓의 이유다.

        펼쳐진 규칙은 **맨 위로 올라온다**(orderedModifications). 목록 자체의 순서(상태)는
        건드리지 않으므로 폼을 닫으면 원래 자리로 돌아온다 — 저장으로 끝나든 취소로 끝나든
        사용자가 기억하는 순서가 유지된다.
      */}
      <AnimatePresence initial={false}>
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

        {orderedModifications.map((modification) => {
          const open = editingRule === modification.id;
          return (
            // 규칙 행 추가/삭제 시 fade+height enter/exit (ui-refine 08) — reduced-motion 존중.
            <MotionRow key={modification.id}>
              {/* 폼으로 가는 길목 셋째 — 행 어디에 포인터가 닿거나 포커스가 들어오면 청크를
                  받기 시작한다. 연필 아이콘까지 뚫고 내려보내는 대신 여기에 두면 배선이 한
                  곳이고, 행에 닿는 것 자체가 이미 편집 의도에 가깝다. */}
              <div
                className={`px-2.5 ${open ? expandedCard : collapsedCard}`}
                {...ruleFormIntentProps}
              >
                <RuleRow
                  modification={modification}
                  paused={paused}
                  editing={open}
                  onToggleEnabled={(enabled) =>
                    onCommand({
                      type: 'update-modification',
                      profileId: profile.id,
                      modification: { ...modification, enabled } as Modification,
                    })
                  }
                  // 같은 버튼으로 열고 닫는다 (story 5) — 열려 있으면 누르는 것이 접기다.
                  onEdit={() => (open ? setEditingRule(null) : openRuleForm(modification.id))}
                  onRemove={() => onDeleteRule(profile.id, modification.id)}
                />
                {/* 폼이 행 **아래로** 펼쳐진다 — 열림에 height-in, 닫힘에 height-out
                    (ui-refine 08). AnimatePresence가 없으면 닫힘이 즉시 사라진다. */}
                <AnimatePresence initial={false}>
                  {open && (
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
              </div>
            </MotionRow>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
