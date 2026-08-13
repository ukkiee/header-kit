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
  pausedNote: 'Paused. No modifications are applied right now.',
  newProfile: 'New profile',
  profiles: 'Profiles',
  searchProfiles: 'Search profiles…',
  menuDelete: 'Delete',
  addRule: 'Add rule',
  edit: 'Edit',
  profilesRestored: 'Profiles restored',
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
  emptyMarker: '(empty)',
  saveRejected: 'The save was rejected.',
  urlFilterScope: 'URL filter (this rule only)',
  matchRegex: 'Regex',
  modCookie: 'Request cookie',
  modSetCookie: 'Response cookie',
  modRedirect: 'Redirect',
  redirectCaptureNote: 'Capture groups \\1–\\9 from the pattern can be reused in the redirect URL.',
  blockNote: 'Matching requests are blocked. The URL filter above decides what gets blocked.',
  unsupportedPattern: 'The browser cannot build a rule from this pattern.',
  /** 카드 머리의 두 토글 — 누르면 그 본문이 펴진다(그래서 말줄임표). */
  export: 'Export…',
  import: 'Import…',
  /** 본문 안의 **실행** 버튼 둘 — 여기서는 말줄임표를 떼야 한다(더 물을 것이 없다). */
  exportAction: 'Export',
  importAction: 'Import',
  backups: 'Backups',
  /** 백업 화면의 카드 넷 제목 (티켓 09, 스펙 story 73–77) — 클라우드 동기화·전체 초기화는 기존 키를 쓴다. */
  transferJson: 'JSON export & import',
  backupHistory: 'Backup history',
  /**
   * 마지막으로 백업된 시각 (스펙 story 75) — 동기화 카드가 저장 **위치** 옆에 말하는 값.
   * 기기 수는 말하지 않는다: 브라우저가 알려 주지 않는 값이라 셀 방법이 없다.
   */
  /*
   * 시각 문구는 **어느 저장소인지 말한다** (code-review).
   *
   * `lastBackupAt`은 지금 활성 저장소의 목록만 본다 — 히스토리 카드가 보여 주는 그 목록이다.
   * 저장소를 밝히지 않으면 동기화를 끈 직후 로컬이 비었을 때 "아직 백업 없음" 바로 아래에
   * "클라우드에 백업이 남아 있습니다"가 나란히 서서 카드가 자기모순을 말한다.
   * 히스토리 카드의 빈 상태(`noBackupsYet`)와도 다른 문장이라 같은 화면에 같은 문구가
   * 두 번 서지 않는다.
   */
  lastBackupAt: 'Last backup in {store}: {time}',
  lastBackupNever: 'Nothing backed up in {store} yet.',
  storeCloud: 'your browser account',
  storeLocal: 'this browser',
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
  openInTab: 'Open in tab',
  headerName: 'Header name',
  cookieName: 'Cookie name',
  requiredField: 'Required.',
  value: 'Value',
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
  retirementNoticeRules:
    'Some conditions are no longer supported and were removed. {count} rules now apply more broadly than before.',
  retirementNoticeRule:
    'Some conditions are no longer supported and were removed. {count} rule now applies more broadly than before.',
  acknowledgeRetirement: 'Got it',
  activeRules: 'active rules',
  activeRule: 'active rule',
  activeProfiles: 'active profiles',
  activeProfile: 'active profile',
  paused: 'paused',
  noIssues: 'no issues',
  ruleNotApplied: '{count} rule not applied',
  rulesNotApplied: '{count} rules not applied',
  rulesCouldNotApply: 'Rules could not be applied:',
  noBackupsYet: 'No backups yet. One is made after you change a profile.',
  noProfilesYet: 'No profiles yet. Press + New profile below to make one.',
  corrupt: 'corrupt',
  theme: 'Theme',
  themeSystem: 'System',
  themeDark: 'Dark',
  themeLight: 'Light',
  language: 'Language',
  // 언어 이름은 두 로케일에서 같다 — 언어 선택지는 그 언어 자신의 이름으로 읽는 것이
  // 관례다(영어 화면의 '한국어'를 한국어 사용자가 알아볼 수 있어야 고를 수 있다).
  languageEn: 'English',
  languageKo: '한국어',
  badgeCount: 'Applied rule count',
  badgeCountNote: 'Shows how many rules are applied right now on the toolbar icon.',
  cloudSync: 'Cloud sync',
  cloudSyncOn: 'On. New backups go to your browser account.',
  cloudSyncOff: 'Off. New backups stay in this browser.',
  cloudBackupsPresent: 'The cloud still holds backups.',
  cloudBackupsNone: 'No backups in the cloud.',
  cloudBackupsUnknown: "Can't tell whether the cloud still holds backups.",
  cloudSyncKeepsHistory:
    'Switching does not move backups you already made. Each one stays where it was written.',
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
    'Erases every profile, preference and backup, both in this browser and in the cloud. This cannot be undone.',
  resetRetryNote: 'If a step fails, what is already erased stays erased. Press again to finish the rest.',
  resetDone: 'Everything was reset to defaults.',
  resetFailed: 'Could not finish the reset',
  resetStoppedAtLocalBackups: 'stopped while erasing backups in this browser',
  resetStoppedAtSyncBackups: 'stopped while erasing backups in the cloud',
  resetStoppedAtState: 'stopped while restoring profiles and preferences',
  resetStoppedAtSummary: 'stopped while clearing the session summary',
  incognitoBlocked:
    'Not enabled in incognito windows. Turn on “Allow in Incognito” on the extension details page to modify incognito traffic.',
  responsePanelNote:
    'Response header changes may not show up in the DevTools Network panel, but they do reach the page.',
  placeholderNote:
    'A new value is made each time the profile turns on, and it stays the same until the profile turns off.',
  rawCookieNote:
    'Kept exactly as an older version stored it. Fill the fields above and this line is sent instead:',
  /** 가져오기 드롭 존 — 붙여넣기 칸이 사라지고 파일 하나만 받는다. */
  dropExportHere: 'Drop an export file here, or click to pick one',
  importFileChosen: 'Selected file: {name}',
  /*
   * 가져오기 오류·공지 (ADR 0014의 카탈로그 계약). `{where}`는 파일 안의 자리를 가리키는
   * 좌표(`profiles[0] ("Work")`)라 번역하지 않고 그대로 끼운다.
   */
  importInvalidJson: "That file isn't valid JSON.",
  importNewerFormat:
    'This file comes from a newer HeaderKit (format v{found}). This version reads v{readable} and older.',
  importNotExportFile:
    'That does not look like a HeaderKit export. A HeaderKit file carries a "headerkit" version (v{readable} or older) and a "profiles" list.',
  importEntryNotObject: '{where}: this entry is not an object.',
  importFieldNotText: '{where}: "{field}" must be text.',
  importBadColor: '{where}: "color" must look like #rrggbb.',
  importActiveNotBoolean: '{where}: "active" must be true or false.',
  importModificationsNotList: '{where}: "modifications" must be a list.',
  importUnreadableRule: '{where}: rule {index} is not a rule this version can read.',
  importFiltersNotList: '{where}: "filters" must be a list.',
  importUnreadableLegacyFilter: '{where}: legacy filter {index} is not one this version can read.',
  importFiltersMoved: '"{name}": moved the old profile filters onto each rule.',
  importDroppedLostFilter:
    '"{name}": dropped {count} filter that no per-rule condition can express (excluded URLs, tab, group, window).',
  importDroppedLostFilters:
    '"{name}": dropped {count} filters that no per-rule condition can express (excluded URLs, tab, group, window).',
  importDroppedDisabledFilter: '"{name}": dropped {count} switched-off filter.',
  importDroppedDisabledFilters: '"{name}": dropped {count} switched-off filters.',
  importRuleLostConditions:
    '"{name}": {count} rule lost conditions this version no longer supports (excluded, initiator and tab domains, auto-off, and the HEAD/CONNECT/OTHER methods), so it now applies more broadly.',
  importRulesLostConditions:
    '"{name}": {count} rules lost conditions this version no longer supports (excluded, initiator and tab domains, auto-off, and the HEAD/CONNECT/OTHER methods), so they now apply more broadly.',
  // 필터 선택기 placeholder·힌트
  // Compile 경고 — 라벨 + 상세({param} 보간). background는 로케일 미인지, UI가 지역화.
  warnEmptyHeaderName: 'Empty header name',
  warnEmptyHeaderNameDetail: 'The header name is empty, so this modification was skipped.',
  warnHeaderOverlap: 'Overlapping header across profiles',
  warnHeaderOverlapDetail: 'Several active profiles modify "{header}". The one highest in the list wins.',
  warnRegexTooLong: 'URL pattern is too long',
  warnRegexTooLongDetail: 'The URL pattern is longer than {limit} characters, so it was skipped.',
  warnQuotaExceeded: 'Rule limit exceeded',
  warnQuotaTotalDetail:
    'The session rule limit ({limit}) was exceeded, so some modifications are not applied.',
  warnQuotaRegexDetail: 'The regex rule limit ({limit}) was exceeded, so some modifications are not applied.',
  warnMissingMaterialization: 'Placeholder not materialized',
  warnMissingMaterializationDetail:
    'An active profile has a placeholder with no value yet, so the whole profile was left out of the rules.',
  warnAppendNotAllowed: 'Header cannot be appended',
  warnAppendNotAllowedDetail:
    'The request header "{header}" cannot be appended, so it was overwritten instead.',
  warnBlockWithoutScope: 'Block rule without a URL filter',
  warnBlockWithoutScopeDetail:
    'A block rule has no URL filter. That would block every request, so it was skipped.',
  // 접근성 이름(aria-label) — en 값은 기존 하드코딩 문자열과 자구 동일(smoke 셀렉터 안정).
  ariaEnableModification: 'Enable modification',
  redirectPattern: 'Redirect pattern',
  ariaUrlMatchType: 'URL match type',
  ariaReorderProfile: 'Reorder {name}',
  /** 규칙 재정렬 그립 — 순서가 적용 우선순위라 이름에 '순서'가 들어간다. */
  ariaReorderRule: 'Reorder {name}',
  /** 프로필 삭제 — 2단계 확인이라 두 이름이 필요하다(누르기 전 / 되물음). */
  ariaDeleteProfile: 'Delete {name}',
  ariaConfirmDeleteProfile: 'Confirm delete {name}',
  confirmDeleteProfile: 'Delete this profile?',
  /**
   * 이름 변경 (ADR 0017 재개정) — 버튼과 그것이 여는 입력.
   *
   * 버튼 이름에 프로필 이름이 들어가는 이유는 삭제·재정렬과 같다: 목록에 같은 버튼이 여러 개
   * 서므로 `이름 변경`만으로는 어느 행의 것인지 가릴 수 없다. 입력 쪽은 반대로 이름을 담지
   * 않는다 — 한 번에 하나만 열리고, 그 이름이 곧 지금 고치는 중인 값이라 이름표에 실으면
   * 타이핑할 때마다 접근성 이름이 바뀐다.
   */
  ariaEditProfile: 'Edit {name}',
  profileNameLabel: 'Profile name',
  /**
   * 색 고르기 — 편집 중에만 서는 스와치 버튼과 그 안의 팔레트 (ADR 0017 재개정).
   *
   * 스와치 한 칸의 이름이 hex 값 그대로인 이유: 팔레트 열 칸은 **보이는 것이 색뿐**이라
   * 이름에 담을 다른 말이 없다. `파랑`처럼 부르면 열 개 중 넷이 같은 낱말을 나눠 갖는다.
   */
  /**
   * 규칙 삭제의 되물음 (ADR 0017 재개정) — 누르기 전 이름은 `menuDelete`를 그대로 쓴다.
   *
   * 무장한 쪽만 이름을 갈라 두는 이유: 목록에는 삭제 버튼이 여럿 서지만 되물음은 한 번에
   * 하나뿐이라(포인터가 떠나면 풀린다) `삭제 확인` 하나로 가리킬 대상이 정해진다. 누르기
   * 전 이름까지 규칙 제목을 담게 하면 스모크 여덟 자리가 함께 흔들리는데, 그 값은 이
   * 변경이 사는 자리가 아니다.
   */
  ariaConfirmDeleteRule: 'Confirm delete',
  confirmDeleteRule: 'Delete this rule?',
  ariaProfileColor: 'Color for {name}',
  ariaProfileColorSwatch: 'Color {color}',
  profileColorCustom: 'Custom color',
  profileColorPalette: 'Palette',
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
  headerSettingsSub: 'Theme · Badge · Language',
  ariaImportFile: 'Import file',
  ariaRunImport: 'Run import',
  ariaRestoreBackup: 'Restore backup',
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
   * WCAG 2.5.3(Label in Name)이다 — 보이는 **상태 낱말**과 이름의 그것이 갈라지면 음성 제어
   * 사용자가 눈으로 읽은 그 말로 행을 부를 수 없다.
   *
   * 전역 일시정지는 켬/끔을 덮어쓰는 **세 번째 값**이라 같은 자리에 들어간다 (스펙 story 44)
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
  newProfileName: 'New profile {number}',
} as const;

export type MessageKey = keyof typeof en;

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  en,
  ko: {
    appName: 'HeaderKit',
    pause: '일시정지',
    resume: '재개',
    pausedNote: '일시정지 중입니다. 지금은 어떤 수정도 적용되지 않습니다.',
    newProfile: '새 프로필',
    profiles: '프로필',
    searchProfiles: '프로필 검색…',
    menuDelete: '삭제',
    addRule: '규칙 추가',
    edit: '편집',
    profilesRestored: '프로필을 복원했습니다',
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
    ariaCloseForm: '규칙 편집 닫기',
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
    sameSiteUnset: '지정 안 함',
    emptyMarker: '(비어 있음)',
    saveRejected: '저장이 거부되었습니다.',
    urlFilterScope: 'URL 필터 (이 규칙에만 적용)',
    matchRegex: '정규식',
    modCookie: '요청 쿠키',
    modSetCookie: '응답 쿠키',
    modRedirect: '리다이렉트',
    redirectCaptureNote: '패턴의 캡처 그룹 \\1–\\9를 이동할 URL에서 다시 쓸 수 있습니다.',
    blockNote: '조건에 맞는 요청이 차단됩니다. 무엇을 막을지는 위 URL 필터가 정합니다.',
    unsupportedPattern: '이 패턴으로는 브라우저가 규칙을 만들지 못합니다.',
    export: '내보내기…',
    import: '가져오기…',
    exportAction: '내보내기',
    importAction: '가져오기',
    backups: '백업',
    transferJson: 'JSON 내보내기·가져오기',
    backupHistory: '백업 히스토리',
    lastBackupAt: '{store}의 마지막 백업: {time}',
    lastBackupNever: '{store}에는 아직 백업이 없습니다.',
    storeCloud: '브라우저 계정',
    storeLocal: '이 브라우저',
    preferences: '환경설정',
    add: '추가',
    cancel: '취소',
    save: '저장',
    saving: '저장 중…',
    enableOnSave: '저장 후 바로 활성화',
    restore: '복원',
    openInTab: '탭에서 열기',
    headerName: '헤더 이름',
    cookieName: '쿠키 이름',
    requiredField: '필수 항목입니다.',
    value: '값',
    append: '덧붙이기',
    remove: '제거',
    sendEmpty: '빈 값 전송',
    countRules: '적용 중인 규칙 {count}개',
    countRule: '적용 중인 규칙 {count}개',
    countProfiles: '활성 프로필 {count}개',
    countProfile: '활성 프로필 {count}개',
    retirementNoticeRules:
      '더 이상 지원하지 않는 조건을 제거했습니다. 규칙 {count}개가 전보다 넓은 범위에 적용됩니다.',
    retirementNoticeRule:
      '더 이상 지원하지 않는 조건을 제거했습니다. 규칙 {count}개가 전보다 넓은 범위에 적용됩니다.',
    acknowledgeRetirement: '확인',
    activeRules: '적용 규칙',
    activeRule: '적용 규칙',
    activeProfiles: '활성 프로필',
    activeProfile: '활성 프로필',
    paused: '일시정지',
    noIssues: '문제 없음',
    ruleNotApplied: '적용하지 못한 규칙 {count}개',
    rulesNotApplied: '적용하지 못한 규칙 {count}개',
    rulesCouldNotApply: '규칙을 적용할 수 없습니다:',
    noBackupsYet: '아직 백업이 없습니다. 프로필을 바꾸면 그때 하나 만들어집니다.',
    noProfilesYet: '아직 프로필이 없습니다. 아래 + 새 프로필을 눌러 만드세요.',
    corrupt: '손상됨',
    theme: '테마',
    themeSystem: '시스템',
    themeDark: '다크',
    themeLight: '라이트',
    language: '언어',
    languageEn: 'English',
    languageKo: '한국어',
    badgeCount: '적용 중인 규칙 수',
    badgeCountNote: '툴바 아이콘에 지금 적용 중인 규칙 수를 표시합니다.',
    cloudSync: '클라우드 동기화',
    cloudSyncOn: '켜짐. 새로 만드는 백업은 브라우저 계정에 저장됩니다.',
    cloudSyncOff: '꺼짐. 새로 만드는 백업은 이 브라우저에만 저장됩니다.',
    cloudBackupsPresent: '클라우드에 백업이 남아 있습니다.',
    cloudBackupsNone: '클라우드에 백업이 없습니다.',
    cloudBackupsUnknown: '클라우드에 백업이 남아 있는지 확인할 수 없습니다.',
    cloudSyncKeepsHistory: '스위치를 바꿔도 이미 만든 백업은 옮겨지지 않고 처음 저장된 곳에 그대로 남습니다.',
    deleteCloudBackups: '클라우드 백업 삭제',
    confirmDeleteCloudBackups: '클라우드에서 지울까요?',
    cloudBackupsDeleted: '클라우드 백업을 삭제했습니다.',
    cloudDeleteFailed: '클라우드 백업을 삭제하지 못했습니다',
    cloudDeleteRemaining: '클라우드에 백업 키 {count}개가 남아 있습니다.',
    confirmDeleteBackup: '이 백업을 지울까요?',
    snapshotDeleteFailed: '이 백업을 삭제하지 못했습니다',
    snapshotDeleteRemaining: '이 백업의 키 {count}개가 아직 남아 있습니다.',
    resetEverything: '전체 초기화',
    confirmResetEverything: '전부 지울까요?',
    resetEverythingNote: '이 브라우저와 클라우드의 모든 프로필·선호값·백업을 지웁니다. 되돌릴 수 없습니다.',
    resetRetryNote:
      '한 단계가 실패해도 이미 지운 것은 돌아오지 않습니다. 다시 누르면 남은 단계부터 이어서 진행합니다.',
    resetDone: '모두 기본값으로 초기화했습니다.',
    resetFailed: '초기화를 끝내지 못했습니다',
    resetStoppedAtLocalBackups: '이 브라우저의 백업을 지우는 단계에서 멈췄습니다',
    resetStoppedAtSyncBackups: '클라우드 백업을 지우는 단계에서 멈췄습니다',
    resetStoppedAtState: '프로필·선호값을 기본값으로 되돌리는 단계에서 멈췄습니다',
    resetStoppedAtSummary: '세션 요약을 지우는 단계에서 멈췄습니다',
    incognitoBlocked:
      '시크릿 창에서 활성화되지 않았습니다. 시크릿 트래픽을 수정하려면 확장 상세 페이지에서 “시크릿 모드에서 허용”을 켜세요.',
    responsePanelNote:
      '응답 헤더 변경은 DevTools 네트워크 패널에 안 보일 수 있지만 페이지에는 그대로 반영됩니다.',
    placeholderNote: '프로필을 켤 때마다 새 값이 만들어지고, 끌 때까지 그 값이 그대로 쓰입니다.',
    rawCookieNote:
      '예전 버전이 저장한 그대로 남아 있는 줄입니다. 위 칸을 채우면 이 줄 대신 그 값이 나갑니다:',
    dropExportHere: '내보낸 파일을 여기에 끌어다 놓거나, 눌러서 고르세요',
    importFileChosen: '고른 파일: {name}',
    importInvalidJson: '올바른 JSON 파일이 아닙니다.',
    importNewerFormat:
      '더 새 버전의 HeaderKit이 내보낸 파일입니다(포맷 v{found}). 이 버전은 v{readable}까지 읽습니다.',
    importNotExportFile:
      'HeaderKit이 내보낸 파일로 보이지 않습니다. 그 파일에는 "headerkit" 버전(v{readable} 이하)과 "profiles" 목록이 들어 있습니다.',
    importEntryNotObject: '{where}: 이 항목이 객체가 아닙니다.',
    importFieldNotText: '{where}: "{field}"는 문자열이어야 합니다.',
    importBadColor: '{where}: "color"는 #rrggbb 형태여야 합니다.',
    importActiveNotBoolean: '{where}: "active"는 true 또는 false여야 합니다.',
    importModificationsNotList: '{where}: "modifications"는 목록이어야 합니다.',
    importUnreadableRule: '{where}: {index}번째 규칙을 이 버전이 읽지 못합니다.',
    importFiltersNotList: '{where}: "filters"는 목록이어야 합니다.',
    importUnreadableLegacyFilter: '{where}: {index}번째 옛 필터를 이 버전이 읽지 못합니다.',
    importFiltersMoved: '"{name}": 프로필에 걸려 있던 옛 필터를 각 규칙으로 옮겼습니다.',
    importDroppedLostFilter:
      '"{name}": 규칙 조건으로 옮길 수 없는 옛 필터 {count}개를 버렸습니다(제외 URL·탭·그룹·창).',
    importDroppedLostFilters:
      '"{name}": 규칙 조건으로 옮길 수 없는 옛 필터 {count}개를 버렸습니다(제외 URL·탭·그룹·창).',
    importDroppedDisabledFilter: '"{name}": 꺼져 있던 옛 필터 {count}개를 버렸습니다.',
    importDroppedDisabledFilters: '"{name}": 꺼져 있던 옛 필터 {count}개를 버렸습니다.',
    importRuleLostConditions:
      '"{name}": 규칙 {count}개가 이 버전이 더는 지원하지 않는 조건을 잃어 전보다 넓은 범위에 적용됩니다(제외·요청 출처·탭 도메인, 자동 해제, HEAD/CONNECT/OTHER 메서드).',
    importRulesLostConditions:
      '"{name}": 규칙 {count}개가 이 버전이 더는 지원하지 않는 조건을 잃어 전보다 넓은 범위에 적용됩니다(제외·요청 출처·탭 도메인, 자동 해제, HEAD/CONNECT/OTHER 메서드).',
    warnEmptyHeaderName: '헤더 이름 없음',
    warnEmptyHeaderNameDetail: '헤더 이름이 비어 있어 이 수정을 건너뛰었습니다.',
    warnHeaderOverlap: '프로필 간 헤더 겹침',
    warnHeaderOverlapDetail:
      '여러 활성 프로필이 "{header}"를 수정합니다. 목록에서 위에 있는 프로필이 이깁니다.',
    warnRegexTooLong: 'URL 패턴 길이 초과',
    warnRegexTooLongDetail: 'URL 패턴이 {limit}자를 넘어 이 수정을 건너뛰었습니다.',
    warnQuotaExceeded: '규칙 수 한도 초과',
    warnQuotaTotalDetail: '세션 규칙 한도({limit})를 넘어 일부 수정이 적용되지 않았습니다.',
    warnQuotaRegexDetail: '정규식 규칙 한도({limit})를 넘어 일부 수정이 적용되지 않았습니다.',
    warnMissingMaterialization: 'Placeholder 값 없음',
    warnMissingMaterializationDetail:
      '활성 프로필의 Placeholder에 아직 값이 없어 그 프로필 전체를 규칙에서 제외했습니다.',
    warnAppendNotAllowed: '헤더 덧붙이기 불가',
    warnAppendNotAllowedDetail: '요청 헤더 "{header}"는 덧붙일 수 없어 덮어쓰기로 대신했습니다.',
    warnBlockWithoutScope: 'URL 필터 없는 차단 규칙',
    warnBlockWithoutScopeDetail:
      '차단 규칙에 URL 필터가 없으면 모든 요청이 막히므로 이 규칙을 건너뛰었습니다.',
    ariaEnableModification: '수정 활성화',
    redirectPattern: '리다이렉트 패턴',
    ariaUrlMatchType: 'URL 매치 방식',
    ariaReorderProfile: '{name} 순서 변경',
    ariaReorderRule: '{name} 순서 변경',
    ariaDeleteProfile: '{name} 삭제',
    ariaConfirmDeleteProfile: '{name} 삭제 확인',
    confirmDeleteProfile: '이 프로필을 지울까요?',
    ariaEditProfile: '{name} 편집',
    profileNameLabel: '프로필 이름',
    ariaConfirmDeleteRule: '삭제 확인',
    confirmDeleteRule: '이 규칙을 지울까요?',
    ariaProfileColor: '{name} 색',
    ariaProfileColorSwatch: '색 {color}',
    profileColorCustom: '직접 고르기',
    profileColorPalette: '팔레트',
    ariaShowProfiles: '프로필 화면',
    ariaShowBackups: '백업 화면',
    ariaShowPreferences: '환경설정 화면',
    railProfiles: '프로필',
    railBackups: '백업',
    railSettings: '설정',
    railApplied: '적용 중',
    headerBackupsSub: '내보내기 · 가져오기 · 동기화',
    headerSettingsSub: '테마 · 배지 · 언어',
    ariaImportFile: '가져올 파일 고르기',
    ariaRunImport: '가져오기 실행',
    ariaRestoreBackup: '백업 복원',
    ariaDeleteBackup: '백업 삭제',
    ariaConfirmDeleteBackup: '백업 삭제 확인',
    ariaSaveLargeEditor: '대형 편집기 저장',
    ariaOpenLargeEditor: '{title} — 대형 편집기 열기',
    ariaToggleProfile: '{name} 켜고 끄기',
    ariaSelectProfile: '{name} 프로필 선택 ({state})',
    profileStateOn: '적용',
    profileStateOff: '미적용',
    profileStatePaused: '정지',
    profileRule: '규칙 {count}개',
    profileRules: '규칙 {count}개',
    newProfileName: '새 프로필 {number}',
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
