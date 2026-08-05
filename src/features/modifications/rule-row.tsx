import { Pencil, Regex, Trash2 } from 'lucide-react';
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
}: RuleRowProps) {
  const t = useT();
  const view = ruleView(modification, t);
  // 꺼졌거나 전역 정지 중이면 제목·뱃지가 흐려진다 — 지금 걸리는 규칙과 구별하기 위해서다.
  const dim = !modification.enabled || paused;

  return (
    <div className="group flex items-start gap-2.5 py-2">
      {/* 스위치는 제목 줄 높이에 맞춘다 — 상단정렬 행에서 baseline 보정. */}
      <div className="mt-0.5">
        <ToggleSwitch
          checked={modification.enabled}
          onCheckedChange={onToggleEnabled}
          aria-label={t('ariaEnableModification')}
        />
      </div>

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
            <span
              key={i}
              className={`max-w-full truncate bg-secondary text-muted-foreground ${badgePill}`}
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      {/*
        편집·삭제는 **평소에도 보인다**(ui-review UI-03). 예전에는 opacity-0이라 호버 전에는
        존재 자체가 드러나지 않았고, 규칙 편집이 이 앱의 핵심 동작인데 그 경로를 우연히
        발견해야 했다 — 터치·펜에는 호버가 아예 없다.

        그렇다고 완전히 또렷하게 두면 읽기 모드의 소음이 된다(ADR 0006의 "읽기 요약 행"
        의도). 그래서 기본은 60%로 낮춰 존재만 알리고, 호버·포커스에서 100%가 된다.

        **폼이 열려 있는 동안은 예외다**: 눌린 상태를 흐리게 두면 어느 행이 열려 있는지
        아이콘만 봐서는 알 수 없어 story 4가 성립하지 않는다.
      */}
      <div
        className={`flex shrink-0 items-center gap-1 self-center transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${
          editing ? 'opacity-100' : 'opacity-60'
        }`}
      >
        <IconButton
          label={t('edit')}
          icon={Pencil}
          aria-pressed={editing}
          className={editing ? 'bg-secondary text-foreground' : ''}
          onClick={onEdit}
        />
        <IconButton label={t('menuDelete')} icon={Trash2} tone="danger" onClick={onRemove} />
      </div>
    </div>
  );
}
