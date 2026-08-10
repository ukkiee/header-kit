import { format, type MessageKey, type Translator } from '@/core/i18n';
import type { ImportIssue } from '@/core/transfer';

/**
 * 가져오기 오류·공지를 지역화된 문장으로 옮기는 순수 매핑 — 컴파일 경고의 `warning-text`와
 * 같은 자리, 같은 이유다.
 *
 * `core/transfer`는 로케일을 모른다. 파일을 읽고 무엇이 잘못됐는지 판정하는 것과 그것을
 * 사용자의 말로 옮기는 것은 다른 일이고, 후자만 카탈로그를 안다. 예전에는 core가 영어
 * 문장을 직접 만들어 한국어 화면에도 영어가 그대로 떴다 — JSX만 훑는 i18n 커버리지 테스트가
 * 볼 수 없는 자리라 조용히 어겨져 있었다.
 *
 * **수를 세는 셋은 키를 둘 받는다** (`countRule`/`countRules`가 하는 그것). 한국어는 굴절하지
 * 않지만 영어는 하므로, 단복수 선택을 코드가 아니라 카탈로그가 지게 둔다 — `filter(s)` 같은
 * 표기는 그 선택을 사용자에게 떠넘기는 것이다.
 */

/** 수와 무관한 것들 — 코드 하나에 문구 하나. */
const SIMPLE_KEY: Partial<Record<ImportIssue['code'], MessageKey>> = {
  'invalid-json': 'importInvalidJson',
  'newer-format': 'importNewerFormat',
  'not-export-file': 'importNotExportFile',
  'entry-not-object': 'importEntryNotObject',
  'field-not-text': 'importFieldNotText',
  'bad-color': 'importBadColor',
  'active-not-boolean': 'importActiveNotBoolean',
  'modifications-not-list': 'importModificationsNotList',
  'unreadable-rule': 'importUnreadableRule',
  'filters-not-list': 'importFiltersNotList',
  'unreadable-legacy-filter': 'importUnreadableLegacyFilter',
  'filters-moved': 'importFiltersMoved',
};

/** 수를 세는 것들 — 하나일 때와 여럿일 때의 키 쌍. */
const COUNTED_KEY: Partial<Record<ImportIssue['code'], { one: MessageKey; many: MessageKey }>> = {
  'dropped-lost-filters': { one: 'importDroppedLostFilter', many: 'importDroppedLostFilters' },
  'dropped-disabled-filters': {
    one: 'importDroppedDisabledFilter',
    many: 'importDroppedDisabledFilters',
  },
  'rules-lost-conditions': { one: 'importRuleLostConditions', many: 'importRulesLostConditions' },
};

/** ImportIssue → 지역화된 한 줄({param} 보간 적용). */
export function importIssueText(issue: ImportIssue, translate: Translator): string {
  const counted = COUNTED_KEY[issue.code];
  const key = counted
    ? translate(issue.params.count === 1 ? counted.one : counted.many)
    : translate(SIMPLE_KEY[issue.code] ?? 'saveRejected');
  return format(key, issue.params);
}
