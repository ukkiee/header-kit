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
  searchProfiles: 'Search profiles…',
  menuDelete: 'Delete',
  addRule: 'Add rule',
  edit: 'Edit',
  ruleDeleted: 'Rule deleted',
  undo: 'Undo',
  ruleKind: 'Type',
  kindRequestHeader: 'Request header',
  kindResponseHeader: 'Response header',
  kindUserAgent: 'User-Agent',
  /**
   * User-Agent 규칙의 **값 칸 라벨** (story 24) — 종류 이름과 역할이 다르다.
   *
   * 종류 이름(`kindUserAgent`)은 "User-Agent를 바꾸는 규칙"이라 ko에서 '변경'이 붙는데,
   * 값 칸은 무엇을 넣는 자리인지를 말해야 하므로 두 로케일 모두 헤더 이름 그대로다.
   * 한 키를 두 자리에 쓰다가 ko 폼이 "User-Agent 변경"을 값 칸 라벨로 내걸었다.
   */
  userAgentValue: 'User-Agent',
  kindHeaderRemoval: 'Remove header',
  kindBlock: 'Block request',
  removeBothSides: 'Removed from request and response',
  scopeAllUrls: 'All URLs',
  noRulesYet: 'No rules yet. Add one below.',
  condResourceTypes: 'Resource types',
  condMethods: 'Methods',
  /*
   * 리소스 묶음 여덟 개 (ADR 0017, 티켓 05) — 사용자가 고르는 이름이다. 브라우저의 열다섯
   * 가지 토큰(`main_frame` 등)은 이 카탈로그에 들어오지 않는다: 그것들은 지역화 대상이 아니라
   * 묶음이 감추는 구현 세부이고, 화면에 새면 여덟 개로 줄인 의미가 없어진다.
   */
  groupXhr: 'XHR',
  groupDocument: 'Document',
  groupImage: 'Image',
  groupScript: 'Script',
  groupStyle: 'Style',
  groupMedia: 'Media',
  groupFont: 'Font',
  groupOther: 'Other',
  /* 폼 시안 정합 (ADR 0017, 티켓 06). */
  newRuleTitle: 'New rule',
  editRuleTitle: 'Edit rule',
  ariaCloseForm: 'Close rule form',
  saveChanges: 'Save changes',
  ruleName: 'Name',
  /** 와일드카드 = 리터럴 포함 매치. 정규식과 둘뿐이다 (story 21). */
  matchWildcard: 'Wildcard',
  cookieValue: 'Cookie value',
  redirectTo: 'Redirect to',
  cookieDomain: 'Domain',
  cookiePath: 'Path',
  cookieMaxAge: 'Max-Age',
  cookieSameSite: 'SameSite',
  cookieSecure: 'Secure',
  cookieHttpOnly: 'HttpOnly',
  /** SameSite 첫 칩 — 정하지 않음. 나머지 셋(None·Lax·Strict)은 프로토콜 토큰이라 그대로 쓴다. */
  sameSiteUnset: 'Not set',
  toggleOff: 'Off',
  toggleOn: 'On',
  emptyMarker: '(empty)',
  saveRejected: 'Rejected.',
  urlFilterScope: 'URL filter (this rule only)',
  matchRegex: 'Regex',
  modCookie: 'Request cookie',
  modSetCookie: 'Response cookie',
  modRedirect: 'Redirect',
  redirectCaptureNote: 'Capture groups \\1–\\9 from the pattern can be reused in the substitution.',
  blockNote: 'Matching requests are blocked. The URL scope above decides what is blocked.',
  unsupportedPattern: 'The browser cannot build a rule from this pattern.',
  export: 'Export…',
  import: 'Import…',
  importAction: 'Import',
  backups: 'Backups',
  preferences: 'Preferences',
  add: 'Add',
  cancel: 'Cancel',
  save: 'Save',
  saving: 'Saving…',
  /**
   * 규칙 폼의 활성화 선택 (티켓 11, story 17) — 저장이 규칙을 켠 채로 남길지 꺼진 채로
   * 남길지. 라벨은 저장 **버튼이 할 일**을 말한다: 토글이 켜져 있으면 저장이 곧 활성화다.
   */
  enableOnSave: 'Enable after saving',
  restore: 'Restore',
  confirmReplaceAll: 'Replace all?',
  openInTab: 'Open in tab',
  headerName: 'Header name',
  cookieName: 'Cookie name',
  requiredField: 'Required.',
  value: 'Value',
  comment: 'comment',
  append: 'Append',
  remove: 'Remove',
  sendEmpty: 'Send empty',
  countRules: '{count} active rules',
  countRule: '{count} active rule',
  countProfiles: '{count} active profiles',
  countProfile: '{count} active profile',
  /*
   * 퇴역 공지 (티켓 02, ADR 0017). 수와 세는 단위를 카탈로그가 **함께** 드는 것은 부제와 같은
   * 이유다 — 붙는 자리가 언어마다 다르다. 문장이 말해야 하는 것은 "무엇이 사라졌나"가 아니라
   * **"그래서 무엇이 달라졌나"**다: 조건이 없어졌다는 사실만으로는 사용자가 자기 규칙이 전보다
   * 넓게 걸린다는 것을 짐작하지 못한다.
   */
  retirementNoticeRules: 'Some conditions are no longer supported and were removed — {count} rules now apply more broadly than before.',
  retirementNoticeRule: 'Some conditions are no longer supported and were removed — {count} rule now applies more broadly than before.',
  acknowledgeRetirement: 'Got it',
  activeRules: 'active rules',
  activeRule: 'active rule',
  activeProfiles: 'active profiles',
  activeProfile: 'active profile',
  paused: 'paused',
  noIssues: 'no issues',
  rulesNotApplied: 'rule(s) — not applied',
  rulesCouldNotApply: 'Rules could not be applied:',
  noBackupsYet: 'No backups yet — they appear after profile changes.',
  noProfilesYet: 'No profiles yet — create one with + New profile.',
  corrupt: 'corrupt',
  autocompleteHeaders: 'Autocomplete header names',
  theme: 'Theme',
  themeSystem: 'System',
  themeDark: 'Dark',
  themeLight: 'Light',
  language: 'Language',
  // 언어 이름은 두 로케일에서 같다 — 언어 선택지는 그 언어 자신의 이름으로 읽는 것이
  // 관례다(영어 화면의 '한국어'를 한국어 사용자가 알아볼 수 있어야 고를 수 있다).
  languageEn: 'English',
  languageKo: '한국어',
  shortcuts: 'Keyboard shortcuts',
  shortcutsReadOnly: 'Read-only here — rebind them on the browser’s extension shortcuts page.',
  shortcutOpenApp: 'Open HeaderKit',
  shortcutTogglePause: 'Pause or resume all modifications',
  shortcutUnset: 'Not set',
  badgeCount: 'Applied rule count',
  badgeCountNote: 'Shows how many rules are applied right now on the toolbar icon.',
  cloudSync: 'Cloud sync',
  cloudSyncOn: 'On — new backups go to your browser account.',
  cloudSyncOff: 'Off — new backups stay in this browser.',
  cloudBackupsPresent: 'The cloud still holds backups.',
  cloudBackupsNone: 'No backups in the cloud.',
  cloudBackupsUnknown: 'Cloud backup status unknown.',
  cloudSyncKeepsHistory: 'Switching does not move existing backups — each stays where it was made.',
  deleteCloudBackups: 'Delete cloud backups',
  confirmDeleteCloudBackups: 'Delete from cloud?',
  cloudBackupsDeleted: 'Cloud backups deleted.',
  cloudDeleteFailed: 'Could not delete cloud backups',
  cloudDeleteRemaining: '{count} backup key(s) still in the cloud.',
  // 히스토리 한 행 삭제 (티켓 12) — 일괄 클라우드 삭제와 다른 동작이라 문구도 갈라 둔다.
  confirmDeleteBackup: 'Delete backup?',
  snapshotDeleteFailed: 'Could not delete this backup',
  snapshotDeleteRemaining: '{count} key(s) of this backup are still stored.',
  resetEverything: 'Reset everything',
  confirmResetEverything: 'Erase everything?',
  resetEverythingNote:
    'Erases every profile, preference and backup — in this browser and in the cloud. This cannot be undone.',
  resetRetryNote: 'If a step fails, what is already erased stays erased — press again to finish the rest.',
  resetDone: 'Everything was reset to defaults.',
  resetFailed: 'Could not finish the reset',
  resetStoppedAtLocalBackups: 'stopped while erasing backups in this browser',
  resetStoppedAtSyncBackups: 'stopped while erasing backups in the cloud',
  resetStoppedAtState: 'stopped while restoring profiles and preferences',
  resetStoppedAtSummary: 'stopped while clearing the session summary',
  incognitoAllowed: 'Incognito access is enabled.',
  incognitoBlocked:
    'Not enabled in incognito windows. Turn on “Allow in Incognito” on the extension details page to modify incognito traffic.',
  responsePanelNote:
    'Response header changes may not show in the DevTools Network panel, but they reach the page.',
  placeholderNote:
    'New value each time the profile activates — constant while it stays on, never re-evaluated per request.',
  rawCookieNote:
    'Kept exactly as an older version stored it. Filling the fields above replaces this line:',
  pasteExportHere: 'Paste a HeaderKit export here…',
  // 필터 선택기 placeholder·힌트
  // Compile 경고 — 라벨 + 상세({param} 보간). background는 로케일 미인지, UI가 지역화.
  warnEmptyHeaderName: 'Empty header name',
  warnEmptyHeaderNameDetail: 'Header name is empty; the modification was skipped.',
  warnHeaderOverlap: 'Overlapping header across profiles',
  warnHeaderOverlapDetail: 'Multiple active profiles modify "{header}"; the highest profile in the list wins.',
  warnRegexTooLong: 'URL pattern too long',
  warnRegexTooLongDetail: 'URL pattern is longer than {limit} characters and was skipped.',
  warnQuotaExceeded: 'Rule limit exceeded',
  warnQuotaTotalDetail: 'Session rule limit ({limit}) exceeded; some modifications are not applied.',
  warnQuotaRegexDetail: 'Regex rule limit ({limit}) exceeded; some modifications are not applied.',
  warnMissingMaterialization: 'Placeholder not materialized',
  warnMissingMaterializationDetail:
    'An active profile has a placeholder without a materialized value; the whole profile was excluded from rules.',
  warnAppendNotAllowed: 'Header cannot be appended',
  warnAppendNotAllowedDetail: 'Request header "{header}" cannot be appended; it was set instead.',
  warnBlockWithoutScope: 'Block rule without a URL scope',
  warnBlockWithoutScopeDetail:
    'A block rule has no URL scope, which would block every request; it was skipped.',
  // 접근성 이름(aria-label) — en 값은 기존 하드코딩 문자열과 자구 동일(smoke 셀렉터 안정).
  ariaEnableModification: 'Enable modification',
  redirectPattern: 'Redirect pattern',
  ariaUrlMatchType: 'URL match type',
  ariaReorderProfile: 'Reorder {name}',
  ariaShowProfiles: 'Show profiles',
  ariaShowBackups: 'Show backups',
  ariaShowPreferences: 'Show settings',
  /*
   * 레일에 **보이는** 짧은 라벨 (티켓 10) — 접근성 이름(ariaShow*)은 이 가시 라벨을
   * 반드시 포함해야 한다(WCAG 2.5.3 Label in Name). 음성 제어는 사용자가 눈으로 읽은
   * 그 단어로 버튼을 부르므로, 가시 라벨이 접근성 이름 밖에 있으면 조준할 수 없다.
   */
  railProfiles: 'Profiles',
  railBackups: 'Backups',
  railSettings: 'Settings',
  /** 레일 하단 — 지금 브라우저에 실제로 걸려 있는 규칙 수의 캡션. */
  railApplied: 'applied',
  headerBackupsSub: 'Export · Import · Sync',
  headerSettingsSub: 'Theme, badge, language',
  ariaToggleBackups: 'Toggle backups',
  ariaTogglePreferences: 'Toggle preferences',
  ariaNewAutocompleteHeader: 'New autocomplete header',
  ariaAddAutocompleteHeader: 'Add autocomplete header',
  ariaRemoveName: 'Remove {name}',
  ariaImportJson: 'Import JSON',
  ariaImportFile: 'Import file',
  ariaRunImport: 'Run import',
  ariaRestoreBackup: 'Restore backup',
  ariaConfirmRestore: 'Confirm restore',
  ariaDeleteBackup: 'Delete backup',
  ariaConfirmDeleteBackup: 'Confirm delete backup',
  ariaSaveLargeEditor: 'Save large editor',
  ariaOpenLargeEditor: '{title} — open large editor',
  ariaToggleProfile: 'Toggle {name}',
  ariaSelectProfile: 'Select profile {name} ({state})',
  /*
   * 프로필 행의 상태 낱말 셋 (티켓 04) — 행 메타에 **보이고** 행 접근성 이름에도 들어간다.
   *
   * `aria*` 접두를 뗀 것이 그 승격이다. 예전에는 정지만 눈에 보였고 나머지 둘은 이름에만
   * 있었는데, 시안의 행 메타(`N개 규칙 · 적용`)가 셋 다 화면에 올렸다. 한 벌만 두는 이유는
   * WCAG 2.5.3(Label in Name)이다 — 보이는 낱말과 이름의 낱말이 갈라지면 음성 제어
   * 사용자가 눈으로 읽은 그 말로 행을 부를 수 없다.
   *
   * 전역 일시정지는 켬/끔을 덮어쓰는 **세 번째 값**이라 같은 자리에 들어간다 (스펙 story 25/38)
   * — 저장된 active는 그대로이고 표시만 정지다.
   */
  profileStateOn: 'applied',
  profileStateOff: 'not applied',
  profileStatePaused: 'paused',
  /** 프로필 행 메타의 앞자리 — 그 프로필에 들어 있는 **켜진** 규칙 수 (스펙 story 42). */
  profileRule: '{count} rule',
  profileRules: '{count} rules',
  /**
   * `＋ 새 프로필`이 붙이는 이름 (티켓 04, 스펙 story 45).
   *
   * 카탈로그를 거치는 이유는 이 이름이 **영구**이기 때문이다 — 이름 변경 컨트롤이 없어졌으므로
   * 만들 때 붙는 이름이 끝까지 남는다. 코드에 박아 두면 한국어 화면에도 영어 이름이 남는다.
   */
  newProfileName: 'Profile {n}',
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
    searchProfiles: '프로필 검색…',
    menuDelete: '삭제',
    addRule: '규칙 추가',
    edit: '편집',
    ruleDeleted: '규칙을 삭제했습니다',
    undo: '실행 취소',
    ruleKind: '종류',
    kindRequestHeader: '요청 헤더',
    kindResponseHeader: '응답 헤더',
    kindUserAgent: 'User-Agent 변경',
    userAgentValue: 'User-Agent',
    kindHeaderRemoval: '헤더 삭제',
    kindBlock: '요청 차단',
    removeBothSides: '요청·응답에서 삭제',
    scopeAllUrls: '모든 URL',
    noRulesYet: '아직 규칙이 없습니다. 아래에서 추가하세요.',
    condResourceTypes: '리소스 종류',
    condMethods: '메서드',
    groupXhr: 'XHR',
    groupDocument: '문서',
    groupImage: '이미지',
    groupScript: '스크립트',
    groupStyle: '스타일',
    groupMedia: '미디어',
    groupFont: '폰트',
    groupOther: '기타',
    newRuleTitle: '새 규칙',
    editRuleTitle: '규칙 편집',
    ariaCloseForm: '규칙 폼 닫기',
    saveChanges: '변경 저장',
    ruleName: '이름',
    matchWildcard: '와일드카드',
    cookieValue: '쿠키 값',
    redirectTo: '이동할 URL',
    cookieDomain: 'Domain',
    cookiePath: 'Path',
    cookieMaxAge: 'Max-Age',
    cookieSameSite: 'SameSite',
    cookieSecure: 'Secure',
    cookieHttpOnly: 'HttpOnly',
    sameSiteUnset: '없음',
    toggleOff: '끔',
    toggleOn: '켬',
    emptyMarker: '(비어 있음)',
    saveRejected: '거부되었습니다.',
    urlFilterScope: 'URL 필터 (이 규칙만 적용)',
    matchRegex: '정규식',
    modCookie: '요청 쿠키',
    modSetCookie: '응답 쿠키',
    modRedirect: '리다이렉트',
    redirectCaptureNote: '패턴의 캡처 그룹 \\1–\\9를 치환 문자열에서 재사용할 수 있습니다.',
    blockNote: '매칭된 요청이 차단됩니다. 무엇을 막을지는 위 URL 스코프가 정합니다.',
    unsupportedPattern: '이 패턴으로는 브라우저가 규칙을 만들지 못합니다.',
    export: '내보내기…',
    import: '가져오기…',
    importAction: '가져오기',
    backups: '백업',
    preferences: '환경설정',
    add: '추가',
    cancel: '취소',
    save: '저장',
    saving: '저장 중…',
    enableOnSave: '저장 후 바로 활성화',
    restore: '복원',
    confirmReplaceAll: '전체 교체?',
    openInTab: '탭에서 열기',
    headerName: '헤더 이름',
    cookieName: '쿠키 이름',
    requiredField: '필수 항목입니다.',
    value: '값',
    comment: '주석',
    append: '덧붙이기',
    remove: '제거',
    sendEmpty: '빈 값 전송',
    countRules: '{count}개 적용 규칙',
    countRule: '{count}개 적용 규칙',
    countProfiles: '{count}개 활성 프로필',
    countProfile: '{count}개 활성 프로필',
    retirementNoticeRules: '더 이상 지원하지 않는 조건이 걷혔습니다 — 규칙 {count}개가 전보다 넓게 걸립니다.',
    retirementNoticeRule: '더 이상 지원하지 않는 조건이 걷혔습니다 — 규칙 {count}개가 전보다 넓게 걸립니다.',
    acknowledgeRetirement: '확인',
    activeRules: '적용 규칙',
    activeRule: '적용 규칙',
    activeProfiles: '활성 프로필',
    activeProfile: '활성 프로필',
    paused: '일시정지',
    noIssues: '문제 없음',
    rulesNotApplied: '규칙 — 적용 안 됨',
    rulesCouldNotApply: '규칙을 적용할 수 없습니다:',
    noBackupsYet: '아직 백업이 없습니다 — 프로필 변경 후 생성됩니다.',
    noProfilesYet: '아직 프로필이 없습니다 — + 새 프로필로 시작하세요.',
    corrupt: '손상됨',
    autocompleteHeaders: '자동완성 헤더 이름',
    theme: '테마',
    themeSystem: '시스템',
    themeDark: '다크',
    themeLight: '라이트',
    language: '언어',
    languageEn: 'English',
    languageKo: '한국어',
    shortcuts: '키보드 단축키',
    shortcutsReadOnly: '여기서는 읽기 전용입니다 — 변경은 브라우저의 확장 단축키 페이지에서 합니다.',
    shortcutOpenApp: 'HeaderKit 열기',
    shortcutTogglePause: '모든 수정을 일시정지하거나 재개',
    shortcutUnset: '지정 없음',
    badgeCount: '적용 중인 규칙 수',
    badgeCountNote: '툴바 아이콘에 지금 적용 중인 규칙 수를 표시합니다.',
    cloudSync: '클라우드 동기화',
    cloudSyncOn: '켜짐 — 앞으로의 백업은 브라우저 계정에 저장됩니다.',
    cloudSyncOff: '꺼짐 — 앞으로의 백업은 이 브라우저에만 저장됩니다.',
    cloudBackupsPresent: '클라우드에 백업이 남아 있습니다.',
    cloudBackupsNone: '클라우드에 백업이 없습니다.',
    cloudBackupsUnknown: '클라우드 잔존 여부를 알 수 없습니다.',
    cloudSyncKeepsHistory: '스위치를 바꿔도 기존 백업은 옮겨지지 않고 만들어진 저장소에 남습니다.',
    deleteCloudBackups: '클라우드 백업 삭제',
    confirmDeleteCloudBackups: '클라우드에서 삭제?',
    cloudBackupsDeleted: '클라우드 백업을 삭제했습니다.',
    cloudDeleteFailed: '클라우드 백업을 삭제하지 못했습니다',
    cloudDeleteRemaining: '클라우드에 백업 키 {count}개가 남아 있습니다.',
    confirmDeleteBackup: '이 백업을 지울까요?',
    snapshotDeleteFailed: '이 백업을 삭제하지 못했습니다',
    snapshotDeleteRemaining: '이 백업의 키 {count}개가 아직 남아 있습니다.',
    resetEverything: '전체 초기화',
    confirmResetEverything: '전부 지울까요?',
    resetEverythingNote:
      '이 브라우저와 클라우드의 모든 프로필·선호값·백업을 지웁니다. 되돌릴 수 없습니다.',
    resetRetryNote: '한 단계가 실패해도 이미 지운 것은 되돌아오지 않습니다 — 다시 눌러 남은 단계를 마치세요.',
    resetDone: '모두 기본값으로 초기화했습니다.',
    resetFailed: '초기화를 끝내지 못했습니다',
    resetStoppedAtLocalBackups: '이 브라우저의 백업을 지우는 단계에서 멈췄습니다',
    resetStoppedAtSyncBackups: '클라우드 백업을 지우는 단계에서 멈췄습니다',
    resetStoppedAtState: '프로필·선호값을 기본값으로 되돌리는 단계에서 멈췄습니다',
    resetStoppedAtSummary: '세션 요약을 지우는 단계에서 멈췄습니다',
    incognitoAllowed: '시크릿 창 접근이 허용되었습니다.',
    incognitoBlocked:
      '시크릿 창에서 활성화되지 않았습니다. 시크릿 트래픽을 수정하려면 확장 상세 페이지에서 “시크릿 모드에서 허용”을 켜세요.',
    responsePanelNote:
      '응답 헤더 변경은 DevTools 네트워크 패널에 보이지 않을 수 있으나 페이지에는 반영됩니다.',
    placeholderNote:
      '프로필을 켤 때마다 새 값이 생성되고, 켜져 있는 동안 유지되며, 요청마다 재평가되지 않습니다.',
    rawCookieNote:
      '예전 버전이 저장한 그대로 보존된 줄입니다. 위 칸을 채우면 이 줄을 대신합니다:',
    pasteExportHere: 'HeaderKit 내보내기 JSON을 여기에 붙여넣으세요…',
    warnEmptyHeaderName: '헤더 이름 비어 있음',
    warnEmptyHeaderNameDetail: '헤더 이름이 비어 수정을 건너뛰었습니다.',
    warnHeaderOverlap: '프로필 간 헤더 겹침',
    warnHeaderOverlapDetail: '여러 활성 프로필이 "{header}"를 수정합니다 — 목록 상단 프로필이 우선합니다.',
    warnRegexTooLong: 'URL 패턴이 너무 김',
    warnRegexTooLongDetail: 'URL 패턴이 {limit}자를 넘어 건너뛰었습니다.',
    warnQuotaExceeded: '규칙 수 한도 초과',
    warnQuotaTotalDetail: 'session 규칙 한도({limit})를 초과해 일부 수정이 적용되지 않았습니다.',
    warnQuotaRegexDetail: 'regex 규칙 한도({limit})를 초과해 일부 수정이 적용되지 않았습니다.',
    warnMissingMaterialization: 'Placeholder 미실체화',
    warnMissingMaterializationDetail:
      '활성 프로필의 Placeholder에 실체화 값이 없어 해당 프로필 전체를 규칙에서 제외했습니다.',
    warnAppendNotAllowed: '헤더 덧붙이기 불가',
    warnAppendNotAllowedDetail: '요청 헤더 "{header}"는 덧붙일 수 없어 set으로 대체했습니다.',
    warnBlockWithoutScope: 'URL 스코프 없는 차단 규칙',
    warnBlockWithoutScopeDetail:
      '차단 규칙에 URL 스코프가 없어 모든 요청이 막히므로 건너뛰었습니다.',
    ariaEnableModification: '수정 활성화',
    redirectPattern: '리다이렉트 패턴',
    ariaUrlMatchType: 'URL 매치 방식',
    ariaReorderProfile: '{name} 순서 변경',
    ariaShowProfiles: '프로필 화면',
    ariaShowBackups: '백업 화면',
    ariaShowPreferences: '환경설정 화면',
    railProfiles: '프로필',
    railBackups: '백업',
    railSettings: '설정',
    railApplied: '적용 중',
    headerBackupsSub: '내보내기 · 가져오기 · 동기화',
    headerSettingsSub: '테마, 배지, 언어',
    ariaToggleBackups: '백업 펼치기/접기',
    ariaTogglePreferences: '환경설정 펼치기/접기',
    ariaNewAutocompleteHeader: '새 자동완성 헤더',
    ariaAddAutocompleteHeader: '자동완성 헤더 추가',
    ariaRemoveName: '{name} 제거',
    ariaImportJson: 'JSON 가져오기',
    ariaImportFile: '파일 가져오기',
    ariaRunImport: '가져오기 실행',
    ariaRestoreBackup: '백업 복원',
    ariaConfirmRestore: '복원 확인',
    ariaDeleteBackup: '백업 삭제',
    ariaConfirmDeleteBackup: '백업 삭제 확인',
    ariaSaveLargeEditor: '대형 편집기 저장',
    ariaOpenLargeEditor: '{title} — 대형 편집기 열기',
    ariaToggleProfile: '{name} 켬/끔',
    ariaSelectProfile: '{name} 프로필 선택 ({state})',
    profileStateOn: '적용',
    profileStateOff: '미적용',
    profileStatePaused: '정지',
    profileRule: '{count}개 규칙',
    profileRules: '{count}개 규칙',
    newProfileName: '새 프로필 {n}',
  },
};

export type Translator = (key: MessageKey) => string;

export function makeTranslator(locale: Locale): Translator {
  return (key) => MESSAGES[locale][key];
}

export function t(locale: Locale, key: MessageKey): string {
  return MESSAGES[locale][key];
}

/** `{key}` 자리표시자를 params 값으로 치환한다 (경고 상세 등 보간용). */
export function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

/** 브라우저 UI 언어를 지원 로케일로 해석한다 (미지원은 en). */
export function resolveLocale(uiLanguage: string): Locale {
  const base = uiLanguage.toLowerCase().split('-')[0];
  return (LOCALES as readonly string[]).includes(base ?? '') ? (base as Locale) : 'en';
}

export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

/**
 * 화면 언어의 단일 판단 지점 (티켓 09) — 세 출처의 우선순위를 여기 한 곳에서만 정한다.
 *
 * 1. URL `?locale=` 오버라이드: 한 화면만 특정 언어로 강제하는 도구용이라 무엇보다 앞선다.
 * 2. 저장된 선호: 사용자가 설정에서 고른 값. 브라우저 UI 언어를 이겨야 스위치가 뜻을 갖는다.
 * 3. 브라우저 UI 언어: 아무것도 고르지 않은 사용자의 기본 — 선호가 **없음**으로 남아 있는
 *    한 지금까지의 동작 그대로다. 필드를 필수로 만들어 'en'을 박으면 한국어 브라우저
 *    사용자가 이 티켓 하나로 영어 화면을 받게 된다.
 */
export function pickLocale(
  override: string | null,
  preference: Locale | undefined,
  uiLanguage: string,
): Locale {
  if (override !== null && override !== undefined) return resolveLocale(override);
  return preference ?? resolveLocale(uiLanguage);
}

/**
 * 언어 **컨트롤**이 짚을 값 — `pickLocale`에서 오버라이드만 뺀 것이다.
 *
 * 칩은 자기가 **설정하는** 값을 보여야 한다. 실효 로케일에 묶으면 `?locale=`로 열린
 * 화면에서 칩을 눌러도 저장만 되고 화면은 그대로라, 칩이 원래 자리로 튕겨 돌아온다 —
 * 설정하는 값과 보여 주는 값이 다른 컨트롤이 된다. 테마 컨트롤이 실효 테마가 아니라
 * 저장된 선호에 묶여 있는 것과 같은 결이다.
 *
 * 선호가 **없을** 때 UI 언어로 떨어지는 것은 남긴다: 부재는 "브라우저를 따른다"는 뜻이고
 * (model의 `locale?`), 그 상태를 빈 칩으로 그리면 아직 고른 적 없는 사용자에게 지금
 * 무슨 언어인지 말해 주지 않는 목록이 보인다.
 */
export function pickLocalePreference(preference: Locale | undefined, uiLanguage: string): Locale {
  return pickLocale(null, preference, uiLanguage);
}
