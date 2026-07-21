import type { StatusSummary as StatusSummaryData } from '@/core/summary';
import { Alert } from '@/ui/alert';
import { useT } from '@/ui/i18n-context';
import { warningText } from './warning-text';

export interface StatusSummaryProps {
  summary: StatusSummaryData;
}

/**
 * 상태 요약 슬림 라인 (ADR 0004) — 카드 표면 없이 절제된 인라인 텍스트.
 * "지금 브라우저에 무엇이 걸려 있는가"는 항상 보이되 시선을 뺏지 않는다.
 * 경고·오류는 시맨틱 Alert로 아래에 남는다 — 조용한 실패 금지.
 */
export function StatusSummary({ summary }: StatusSummaryProps) {
  const t = useT();
  return (
    <section className="flex flex-col gap-1.5 text-xs">
      <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
        <span>
          <strong className="font-medium text-zinc-900 dark:text-zinc-100">
            {summary.ruleCount}
          </strong>{' '}
          {summary.applyError
            ? t('rulesNotApplied')
            : summary.ruleCount === 1
              ? t('activeRule')
              : t('activeRules')}
        </span>
        <span aria-hidden className="text-zinc-300 dark:text-zinc-700">
          ·
        </span>
        <span>
          <strong className="font-medium text-zinc-900 dark:text-zinc-100">
            {summary.activeProfileCount}
          </strong>{' '}
          {summary.activeProfileCount === 1 ? t('activeProfile') : t('activeProfiles')}
        </span>
        {(summary.paused || (!summary.hasProblems && !summary.paused)) && (
          <span aria-hidden className="text-zinc-300 dark:text-zinc-700">
            ·
          </span>
        )}
        {summary.paused && <span className="text-amber-600 dark:text-amber-400">{t('paused')}</span>}
        {!summary.hasProblems && !summary.paused && (
          <span className="text-green-600 dark:text-green-400">{t('noIssues')}</span>
        )}
      </div>

      {summary.applyError && (
        <Alert as="p" severity="danger" role="alert">
          {t('rulesCouldNotApply')} {summary.applyError}
        </Alert>
      )}

      {summary.warnings.length > 0 && (
        <ul className="flex flex-col gap-1">
          {summary.warnings.map((warning, i) => {
            const text = warningText(warning, t);
            return (
              <Alert
                as="li"
                key={`${warning.code}-${i}`}
                severity="warn"
                className="flex flex-col"
              >
                <span className="font-medium text-amber-700 dark:text-amber-300">
                  {text.label}
                </span>
                <span className="text-amber-600 dark:text-amber-400">{text.detail}</span>
              </Alert>
            );
          })}
        </ul>
      )}
    </section>
  );
}
