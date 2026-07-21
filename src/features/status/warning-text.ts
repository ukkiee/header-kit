import { format, type MessageKey, type Translator } from '@/core/i18n';
import type { WarningView } from '@/core/summary';

/**
 * compile 경고를 지역화된 라벨+상세 문자열로 옮기는 순수 매핑. UI(status-summary)에서
 * 분리해 두어 code→키 매핑과 {param} 보간을 단위 테스트로 못 박는다 — background는
 * 로케일을 모르고, 지역화는 전적으로 이 카탈로그 경유다.
 */

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
function detailKey(warning: WarningView): MessageKey {
  switch (warning.code) {
    case 'empty-header-name':
      return 'warnEmptyHeaderNameDetail';
    case 'header-overlap':
      return 'warnHeaderOverlapDetail';
    case 'regex-too-long':
      return 'warnRegexTooLongDetail';
    case 'quota-exceeded':
      return warning.params.quota === 'total-rules'
        ? 'warnQuotaTotalDetail'
        : 'warnQuotaRegexDetail';
    case 'missing-materialization':
      return 'warnMissingMaterializationDetail';
    case 'append-not-allowed':
      return 'warnAppendNotAllowedDetail';
  }
}

export interface WarningText {
  label: string;
  detail: string;
}

/** WarningView → 지역화된 라벨+상세({param} 보간 적용). */
export function warningText(warning: WarningView, translate: Translator): WarningText {
  return {
    label: translate(WARN_LABEL[warning.code]),
    detail: format(translate(detailKey(warning)), warning.params),
  };
}
