/**
 * UI 문자열 카탈로그. 브라우저 확장의 표준 i18n(_locales)은 정적 JSON이라
 * 키 완전성을 코드로 검증하기 어렵다 — 카탈로그를 타입 있는 소스로 두고
 * 모든 로케일이 같은 키 집합을 갖도록 테스트로 강제한다.
 */

export const LOCALES = ['en', 'ko'] as const;
export type Locale = (typeof LOCALES)[number];

export const MESSAGES = {
  en: {
    appName: 'HeaderKit',
    pause: 'Pause',
    resume: 'Resume',
    pausedNote: 'Paused — no modifications are applied.',
    newProfile: 'New profile',
    requestHeader: 'Request header',
    responseHeader: 'Response header',
    addFilter: 'Filter',
    export: 'Export…',
    import: 'Import…',
    backups: 'Backups',
    openInTab: 'Open in tab',
    activeRules: 'active rules',
    incognitoAllowed: 'Incognito access is enabled.',
    incognitoBlocked:
      'Not enabled in incognito windows. Turn on “Allow in Incognito” on the extension details page to modify incognito traffic.',
    responsePanelNote:
      'Response header changes may not show in the DevTools Network panel, but they reach the page.',
  },
  ko: {
    appName: 'HeaderKit',
    pause: '일시정지',
    resume: '재개',
    pausedNote: '일시정지됨 — 어떤 수정도 적용되지 않습니다.',
    newProfile: '새 프로필',
    requestHeader: '요청 헤더',
    responseHeader: '응답 헤더',
    addFilter: '필터',
    export: '내보내기…',
    import: '가져오기…',
    backups: '백업',
    openInTab: '탭에서 열기',
    activeRules: '적용 규칙',
    incognitoAllowed: '시크릿 창 접근이 허용되었습니다.',
    incognitoBlocked:
      '시크릿 창에서 활성화되지 않았습니다. 시크릿 트래픽을 수정하려면 확장 상세 페이지에서 “시크릿 모드에서 허용”을 켜세요.',
    responsePanelNote:
      '응답 헤더 변경은 DevTools 네트워크 패널에 보이지 않을 수 있으나 페이지에는 반영됩니다.',
  },
} as const;

export type MessageKey = keyof (typeof MESSAGES)['en'];

export function t(locale: Locale, key: MessageKey): string {
  return MESSAGES[locale][key];
}

/** 브라우저 UI 언어를 지원 로케일로 해석한다 (미지원은 en). */
export function resolveLocale(uiLanguage: string): Locale {
  const base = uiLanguage.toLowerCase().split('-')[0];
  return (LOCALES as readonly string[]).includes(base ?? '') ? (base as Locale) : 'en';
}
