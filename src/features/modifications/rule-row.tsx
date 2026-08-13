import { Check, Pencil, Regex, Trash2 } from 'lucide-react';
import { useArmedConfirm } from '@/ui/use-armed-confirm';
import type { Modification } from '@/core/schema';
import { IconButton } from '@/ui/icon-button';
import { ToggleSwitch } from '@/ui/toggle-switch';
import { badgePill } from '@/ui/tokens';
import { useT } from '@/ui/i18n-context';
import { ruleView, type ScopeChip } from './rule-summary';

/**
 * 둘째 줄 맨 앞 — 이 규칙이 **어디에** 걸리는가 (ADR 0017, story 13).
 *
 * 다른 칩과 톤을 달리한다: 스코프는 조건이 아니라 규칙의 대상이고, 시안이 그것을 맨 앞에
 * 둔 이유가 "어디에 걸리는지가 가장 중요하다"이기 때문이다. 정규식이면 표시가 함께 선다 —
 * 와일드카드와 헷갈리면 왜 안 걸리는지 알 길이 없다 (story 16).
 */
function ScopeChipView({ scope }: { scope: ScopeChip }) {
  const t = useT();
  return (
    <span
      className={`inline-flex max-w-full items-center gap-0.5 bg-secondary font-mono text-foreground ${badgePill}`}
    >
      {scope.regex && <Regex size={10} strokeWidth={2} aria-label={t('matchRegex')} />}
      <span className="truncate">{scope.label}</span>
    </span>
  );
}

export interface RuleRowProps {
  modification: Modification;
  /**
   * 전역 정지 중 (story 12) — 규칙이 켜져 있어도 지금은 걸리지 않는다. 꺼진 것과 같은
   * 흐림으로 그리는 이유는 사용자가 알아야 하는 것이 같기 때문이다: 이 규칙은 지금 안 건다.
   */
  paused?: boolean;
  /** 이 규칙의 폼이 펼쳐져 있는가 (story 4) — 수정 아이콘이 눌린 상태로 선다. */
  editing?: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
  /**
   * 목록에서 이 행이 선 **자리**. 바뀌면 삭제 무장이 풀린다 — 근거는 `useArmedConfirm`이
   * 적는다. 목록 밖에서 홀로 그리는 카드(새 규칙 폼)는 넘기지 않아도 된다.
   */
  index?: number;
}

/**
 * 규칙 한 줄의 읽기 요약 (ADR 0006/0017) — 토글 스위치 + 제목·뱃지 + 칩 줄 + 편집·삭제.
 *
 * 티켓 05에서 시안 구성이 됐다: 체크박스가 토글 스위치로(시안의 다른 스위치들과 같은 동작),
 * 한 줄 요약 문자열이 스코프 칩 + 효과·조건 칩 줄로 바뀌었다. 예전에 있던 `ItemRow` 한 겹은
 * 걷었다 — 프로필 수준 조건 행이 ADR 0010에서 퇴역해 호출부가 이 행 하나만 남았고, 그
 * 뒤로는 두 층을 뚫고 프롭을 내려보내는 비용만 남아 있었다.
 */
export function RuleRow({
  modification,
  paused = false,
  editing = false,
  onToggleEnabled,
  onEdit,
  onRemove,
  index,
}: RuleRowProps) {
  const t = useT();
  /*
   * 되물음은 **행마다 따로**이고, 그 무장은 이 행의 **자리**에 매인다.
   *
   * `index`를 훅에 넘기는 것이 좌표 함정을 닫는 유일한 자리다: 무장한 행이 hoist나 다른
   * 표면의 삭제로 위치를 옮기면 그 체크 버튼이 **다른 규칙의 삭제 버튼이 있던 좌표**로
   * 들어오고, 그 자리를 한 번 누른 클릭이 엉뚱한 규칙을 지운다(실측). 자리가 바뀌면
   * 무장부터 푼다.
   */
  const confirm = useArmedConfirm(index);
  const view = ruleView(modification, t);
  // 꺼졌거나 전역 정지 중이면 제목·뱃지가 흐려진다 — 지금 걸리는 규칙과 구별하기 위해서다.
  const dim = !modification.enabled || paused;

  /*
   * 행 구성이 **프로필 행과 같아졌다** (사용자 결정): 왼쪽부터 그립(카드가 든다) · 내용 ·
   * 편집·삭제 · 켬/끔 스위치. 예전에는 스위치가 맨 왼쪽에 있고 편집·삭제만 오른쪽이었다.
   *
   * 두 목록이 같은 자리에 같은 것을 두는 값이 그 근거다 — 사이드바에서 배운 "오른쪽 끝이
   * 켬/끔, 그 왼쪽이 손대는 것"이 본문에서도 그대로 통한다. 세로 정렬도 `items-center`로
   * 바뀐다: 스위치가 제목 줄에 매여 있을 이유가 없어졌고, 그립이 이미 중앙에 선다.
   */
  return (
    <div className="flex items-center gap-2.5 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`truncate text-sm font-medium ${dim ? 'text-muted-foreground' : ''}`}>
            {view.title}
          </span>
          <span
            className={`shrink-0 tracking-wide bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 ${badgePill} ${
              dim ? 'opacity-60' : ''
            }`}
          >
            {view.badge}
          </span>
        </div>

        {/* 스코프가 맨 앞이고, 그 뒤로 효과·(응답 쿠키 속성)·리소스 묶음·요청 메서드가 잇는다. */}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <ScopeChipView scope={view.scope} />
          {view.chips.map((chip, i) => (
            <span key={i} className={`max-w-full truncate bg-secondary text-muted-foreground ${badgePill}`}>
              {chip}
            </span>
          ))}
        </div>
      </div>

      {/*
        편집·삭제는 **행에 닿아야 나타난다** (사용자 결정 — 프로필 행과 같은 규약).

        예전에는 평소에도 60%로 보였다(ui-review UI-03). 그 근거는 "규칙 편집이 이 앱의 핵심
        동작인데 경로를 우연히 발견해야 한다"였는데, 두 목록이 다른 규약을 쓰는 값을 치르고
        있었다 — 사이드바에서 배운 것이 본문에서 통하지 않는다. 발견 문제는 **연필이 사라진
        것이 아니라 행에 닿으면 선다**로 풀린다(호버·포커스 둘 다 건다: 호버로만 드러내면
        키보드·터치에서는 도달할 수 없는 버튼이 된다).

        **폼이 열려 있거나 삭제가 무장한 동안은 예외다**: 그때 흐려지면 지금 무엇을 하는
        중인지가 화면에서 반쯤 사라진다.
      */}
      <div
        className={`flex shrink-0 items-center gap-1 transition-opacity ${
          editing || confirm.armed
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        }`}
        /*
         * 마우스가 떠나면 무장을 푼다 — **마우스일 때만.** 펜은 버튼을 떠나도 `pointerleave`가
         * 오지 않고(실측), 터치는 `pointerup` 직후에 와서 무장과 실행 사이에 떨어진다. 그 둘까지
         * 이 핸들러에 맡기면 2단 확인이 스케줄링 순서에 매달린다. 나머지 입력 방식의 바닥은
         * 훅의 시간 초과가 깐다.
         */
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') confirm.disarm();
        }}
        onBlur={(event) => {
          // 연필과 휴지통 **사이**의 포커스 이동은 떠난 것이 아니다.
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next)) return;
          confirm.disarm();
        }}
      >
        <IconButton
          label={t('edit')}
          icon={Pencil}
          aria-pressed={editing}
          className={editing ? 'bg-secondary text-foreground' : ''}
          // 같은 행의 다른 조작은 삭제 무장을 푼다 — 두 가지가 동시에 무장해 있지 않게 한다
          // (프로필 행의 `openRename`이 같은 규약이다).
          onClick={() => {
            confirm.disarm();
            onEdit();
          }}
        />
        {/*
          삭제는 **두 번 눌러야 지워진다** (ADR 0017 재개정, ui-refine 07을 뒤집는다).
          예전에는 한 번에 지우고 되돌리기를 토스트가 들었다. 앱 안의 파괴적 동작이 전부
          2단 확인인데 규칙 삭제만 달랐고, 규약이 갈리면 어느 클릭이 되돌릴 수 없는지를
          매번 다시 배워야 한다. 아이콘이 **모양으로도** 바뀐다(휴지통 → 체크).

          무장이 스스로 풀리는 규약과 그 근거는 `useArmedConfirm`이 갖는다.
        */}
        <IconButton
          label={confirm.armed ? t('ariaConfirmDeleteRule') : t('menuDelete')}
          tooltip={confirm.armed ? t('confirmDeleteRule') : t('menuDelete')}
          icon={confirm.armed ? Check : Trash2}
          tone="danger"
          onClick={() => confirm.press(onRemove)}
        />
      </div>

      {/* 켬/끔은 **오른쪽 끝**이다 — 프로필 행과 같은 자리(사용자 결정). */}
      <ToggleSwitch
        checked={modification.enabled}
        onCheckedChange={(enabled) => {
          confirm.disarm();
          onToggleEnabled(enabled);
        }}
        aria-label={t('ariaEnableModification')}
      />
    </div>
  );
}
