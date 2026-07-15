import type { StatusSummary as StatusSummaryData } from '@/core/summary';
import { useT } from './i18n-context';

export interface StatusSummaryProps {
  summary: StatusSummaryData;
}

export function StatusSummary({ summary }: StatusSummaryProps) {
  const t = useT();
  return (
    <section className="flex flex-col gap-1.5 rounded-lg bg-zinc-50 p-2.5 text-xs dark:bg-zinc-900">
      <div className="flex items-center gap-3">
        <span>
          <strong>{summary.ruleCount}</strong>{' '}
          {summary.applyError
            ? t('rulesNotApplied')
            : summary.ruleCount === 1
              ? t('activeRule')
              : t('activeRules')}
        </span>
        <span>
          <strong>{summary.activeProfileCount}</strong>{' '}
          {summary.activeProfileCount === 1 ? t('activeProfile') : t('activeProfiles')}
        </span>
        {summary.paused && <span className="text-amber-600 dark:text-amber-400">{t('paused')}</span>}
        {!summary.hasProblems && !summary.paused && (
          <span className="text-green-600 dark:text-green-400">{t('noIssues')}</span>
        )}
      </div>

      {summary.applyError && (
        <p role="alert" className="rounded bg-red-100 px-2 py-1 text-red-700 dark:bg-red-950 dark:text-red-300">
          {t('rulesCouldNotApply')} {summary.applyError}
        </p>
      )}

      {summary.warnings.length > 0 && (
        <ul className="flex flex-col gap-1">
          {summary.warnings.map((warning, i) => (
            <li key={`${warning.code}-${i}`} className="flex flex-col rounded bg-amber-50 px-2 py-1 dark:bg-amber-950">
              <span className="font-medium text-amber-700 dark:text-amber-300">{warning.label}</span>
              <span className="text-amber-600 dark:text-amber-400">{warning.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
