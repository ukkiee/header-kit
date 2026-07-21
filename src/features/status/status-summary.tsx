import { format, type MessageKey } from '@/core/i18n';
import type { StatusSummary as StatusSummaryData, WarningView } from '@/core/summary';
import { Alert } from '@/ui/alert';
import { Card } from '@/ui/card';
import { useT } from '@/ui/i18n-context';

export interface StatusSummaryProps {
  summary: StatusSummaryData;
}

/** compile 경고 code → 라벨 MessageKey. */
const WARN_LABEL: Record<WarningView['code'], MessageKey> = {
  'empty-header-name': 'warnEmptyHeaderName',
  'header-overlap': 'warnHeaderOverlap',
  'regex-too-long': 'warnRegexTooLong',
  'quota-exceeded': 'warnQuotaExceeded',
  'missing-materialization': 'warnMissingMaterialization',
  'append-not-allowed': 'warnAppendNotAllowed',
};

/** 경고 상세 MessageKey — quota는 total/regex를 params로 분기. */
function warnDetailKey(warning: WarningView): MessageKey {
  switch (warning.code) {
    case 'empty-header-name':
      return 'warnEmptyHeaderNameDetail';
    case 'header-overlap':
      return 'warnHeaderOverlapDetail';
    case 'regex-too-long':
      return 'warnRegexTooLongDetail';
    case 'quota-exceeded':
      return warning.params.quota === 'total-rules' ? 'warnQuotaTotalDetail' : 'warnQuotaRegexDetail';
    case 'missing-materialization':
      return 'warnMissingMaterializationDetail';
    case 'append-not-allowed':
      return 'warnAppendNotAllowedDetail';
  }
}

export function StatusSummary({ summary }: StatusSummaryProps) {
  const t = useT();
  return (
    <Card as="section" variant="filled" className="text-xs">
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
        <Alert as="p" severity="danger" role="alert">
          {t('rulesCouldNotApply')} {summary.applyError}
        </Alert>
      )}

      {summary.warnings.length > 0 && (
        <ul className="flex flex-col gap-1">
          {summary.warnings.map((warning, i) => (
            <Alert
              as="li"
              key={`${warning.code}-${i}`}
              severity="warn"
              className="flex flex-col"
            >
              <span className="font-medium text-amber-700 dark:text-amber-300">
                {t(WARN_LABEL[warning.code])}
              </span>
              <span className="text-amber-600 dark:text-amber-400">
                {format(t(warnDetailKey(warning)), warning.params)}
              </span>
            </Alert>
          ))}
        </ul>
      )}
    </Card>
  );
}
