import type { StatusSummary as StatusSummaryData } from '@/core/summary';
import { AlertBanner } from '@/ui/alert-banner';
import { useT } from '@/ui/i18n-context';
import { warningText } from './warning-text';

export interface StatusSummaryProps {
  summary: StatusSummaryData;
  /**
   * 수 줄을 그릴지 (ADR 0017). 앱 셸에서는 본문 헤더가 그 수를 이미 말하므로 끈다 —
   * 같은 수를 두 번 그리면 어느 쪽이 최신인지 읽는 사람이 판단해야 한다. 경고·오류는
   * 이 값과 무관하게 언제나 남는다(조용한 실패 금지).
   */
  showCounts?: boolean;
}

/**
 * 상태 요약 슬림 라인 (ADR 0004) — 카드 표면 없이 절제된 인라인 텍스트.
 * "지금 브라우저에 무엇이 걸려 있는가"는 항상 보이되 시선을 뺏지 않는다.
 * 경고·오류는 시맨틱 Alert로 아래에 남는다 — 조용한 실패 금지.
 */
export function StatusSummary({ summary, showCounts = true }: StatusSummaryProps) {
  const t = useT();
  return (
    <section className="flex flex-col gap-1.5 text-xs">
      {showCounts && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>
            <strong className="font-medium text-foreground">{summary.ruleCount}</strong>{' '}
            {summary.applyError
              ? t('rulesNotApplied')
              : summary.ruleCount === 1
                ? t('activeRule')
                : t('activeRules')}
          </span>
          <span aria-hidden className="text-border">
            ·
          </span>
          <span>
            <strong className="font-medium text-foreground">{summary.activeProfileCount}</strong>{' '}
            {summary.activeProfileCount === 1 ? t('activeProfile') : t('activeProfiles')}
          </span>
          {(summary.paused || (!summary.hasProblems && !summary.paused)) && (
            <span aria-hidden className="text-border">
              ·
            </span>
          )}
          {summary.paused && <span className="text-amber-600 dark:text-amber-400">{t('paused')}</span>}
          {!summary.hasProblems && !summary.paused && (
            <span className="text-green-600 dark:text-green-400">{t('noIssues')}</span>
          )}
        </div>
      )}

      {summary.applyError && (
        <AlertBanner as="p" severity="danger" role="alert">
          {t('rulesCouldNotApply')} {summary.applyError}
        </AlertBanner>
      )}

      {summary.warnings.length > 0 && (
        <ul className="flex flex-col gap-1">
          {summary.warnings.map((warning, i) => {
            const text = warningText(warning, t);
            return (
              <AlertBanner as="li" key={`${warning.code}-${i}`} severity="warn" className="flex flex-col">
                <span className="font-medium text-amber-700 dark:text-amber-300">{text.label}</span>
                <span className="text-amber-600 dark:text-amber-400">{text.detail}</span>
              </AlertBanner>
            );
          })}
        </ul>
      )}
    </section>
  );
}
