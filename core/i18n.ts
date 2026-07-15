/**
 * UI 문자열 카탈로그. 브라우저 확장의 표준 i18n(_locales)은 정적 JSON이라
 * 키 완전성을 코드로 검증하기 어렵다 — 카탈로그를 타입 있는 소스로 두고
 * 모든 로케일이 같은 키 집합을 갖도록 테스트로 강제한다. 모든 사용자 대면
 * 문자열은 이 카탈로그를 거친다.
 */

export const LOCALES = ['en', 'ko'] as const;
export type Locale = (typeof LOCALES)[number];

const en = {
  appName: 'HeaderKit',
  pause: 'Pause',
  resume: 'Resume',
  pausedNote: 'Paused — no modifications are applied.',
  newProfile: 'New profile',
  profiles: 'Profiles',
  requestHeaderShort: 'Req',
  responseHeaderShort: 'Res',
  requestHeader: 'Request header',
  responseHeader: 'Response header',
  addFilterMenu: 'Filter',
  filterUrl: 'URL filter',
  filterExcludeUrl: 'Exclude URL filter',
  filterResourceType: 'Resource type filter',
  filterRequestMethod: 'Request method filter',
  filterInitiatorDomain: 'Initiator domain filter',
  filterTab: 'Tab filter',
  filterTabGroup: 'Tab group filter',
  filterWindow: 'Window filter',
  filterTabDomain: 'Tab domain filter',
  filterTime: 'Time filter (auto-off)',
  export: 'Export…',
  import: 'Import…',
  importAction: 'Import',
  backups: 'Backups',
  preferences: 'Preferences',
  show: 'Show',
  hide: 'Hide',
  add: 'Add',
  cancel: 'Cancel',
  save: 'Save',
  restore: 'Restore',
  confirmReplaceAll: 'Replace all?',
  confirmDelete: 'Delete?',
  openInTab: 'Open in tab',
  headerName: 'Header name',
  value: 'Value',
  comment: 'comment',
  override: 'Override',
  append: 'Append',
  emptyArrow: 'empty →',
  remove: 'Remove',
  sendEmpty: 'Send empty',
  activeRules: 'active rules',
  activeRule: 'active rule',
  activeProfiles: 'active profiles',
  activeProfile: 'active profile',
  paused: 'paused',
  noIssues: 'no issues',
  rulesNotApplied: 'rule(s) — not applied',
  rulesCouldNotApply: 'Rules could not be applied:',
  noBackupsYet: 'No backups yet — they appear after profile changes.',
  corrupt: 'corrupt',
  autocompleteHeaders: 'Autocomplete header names',
  shortcutsHint: 'Keyboard shortcuts (Alt+Shift+H / Alt+Shift+P) can be changed at',
  incognitoAllowed: 'Incognito access is enabled.',
  incognitoBlocked:
    'Not enabled in incognito windows. Turn on “Allow in Incognito” on the extension details page to modify incognito traffic.',
  responsePanelNote:
    'Response header changes may not show in the DevTools Network panel, but they reach the page.',
  placeholderNote:
    'New value each time the profile activates — constant while it stays on, never re-evaluated per request.',
  pasteExportHere: 'Paste a HeaderKit export here…',
} as const;

export type MessageKey = keyof typeof en;

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  en,
  ko: {
    appName: 'HeaderKit',
    pause: '일시정지',
    resume: '재개',
    pausedNote: '일시정지됨 — 어떤 수정도 적용되지 않습니다.',
    newProfile: '새 프로필',
    profiles: '프로필',
    requestHeaderShort: '요청',
    responseHeaderShort: '응답',
    requestHeader: '요청 헤더',
    responseHeader: '응답 헤더',
    addFilterMenu: '필터',
    filterUrl: 'URL 필터',
    filterExcludeUrl: 'Exclude URL 필터',
    filterResourceType: '리소스 타입 필터',
    filterRequestMethod: '요청 메서드 필터',
    filterInitiatorDomain: 'Initiator 도메인 필터',
    filterTab: '탭 필터',
    filterTabGroup: '탭 그룹 필터',
    filterWindow: '창 필터',
    filterTabDomain: '탭 도메인 필터',
    filterTime: '시간 필터 (자동 종료)',
    export: '내보내기…',
    import: '가져오기…',
    importAction: '가져오기',
    backups: '백업',
    preferences: '환경설정',
    show: '펼치기',
    hide: '접기',
    add: '추가',
    cancel: '취소',
    save: '저장',
    restore: '복원',
    confirmReplaceAll: '전체 교체?',
    confirmDelete: '삭제?',
    openInTab: '탭에서 열기',
    headerName: '헤더 이름',
    value: '값',
    comment: '주석',
    override: '덮어쓰기',
    append: '덧붙이기',
    emptyArrow: '빈 값 →',
    remove: '제거',
    sendEmpty: '빈 값 전송',
    activeRules: '적용 규칙',
    activeRule: '적용 규칙',
    activeProfiles: '활성 프로필',
    activeProfile: '활성 프로필',
    paused: '일시정지',
    noIssues: '문제 없음',
    rulesNotApplied: '규칙 — 적용 안 됨',
    rulesCouldNotApply: '규칙을 적용할 수 없습니다:',
    noBackupsYet: '아직 백업이 없습니다 — 프로필 변경 후 생성됩니다.',
    corrupt: '손상됨',
    autocompleteHeaders: '자동완성 헤더 이름',
    shortcutsHint: '키보드 단축키(Alt+Shift+H / Alt+Shift+P)는 다음에서 변경할 수 있습니다',
    incognitoAllowed: '시크릿 창 접근이 허용되었습니다.',
    incognitoBlocked:
      '시크릿 창에서 활성화되지 않았습니다. 시크릿 트래픽을 수정하려면 확장 상세 페이지에서 “시크릿 모드에서 허용”을 켜세요.',
    responsePanelNote:
      '응답 헤더 변경은 DevTools 네트워크 패널에 보이지 않을 수 있으나 페이지에는 반영됩니다.',
    placeholderNote:
      '프로필을 켤 때마다 새 값이 생성되고, 켜져 있는 동안 유지되며, 요청마다 재평가되지 않습니다.',
    pasteExportHere: 'HeaderKit 내보내기 JSON을 여기에 붙여넣으세요…',
  },
};

export type Translator = (key: MessageKey) => string;

export function makeTranslator(locale: Locale): Translator {
  return (key) => MESSAGES[locale][key];
}

export function t(locale: Locale, key: MessageKey): string {
  return MESSAGES[locale][key];
}

/** 브라우저 UI 언어를 지원 로케일로 해석한다 (미지원은 en). */
export function resolveLocale(uiLanguage: string): Locale {
  const base = uiLanguage.toLowerCase().split('-')[0];
  return (LOCALES as readonly string[]).includes(base ?? '') ? (base as Locale) : 'en';
}
