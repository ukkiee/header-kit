# 05 — 테마 스위치 (다크/라이트/시스템)

**What to build:** 설정에서 테마를 다크/라이트/시스템 중 고르고, 그 선택이 다시 열어도 유지된다. '시스템'은 OS의 `prefers-color-scheme`를 따른다. ADR 0004의 "스위치 없음"을 개정한다(ADR 0015).

**Blocked by:** 01 (다크 팔레트가 이미 있어야 라이트를 그 짝으로 파생).

**Status:** done

- [x] StoredState에 theme 선호값(`'dark' | 'light' | 'system'`, 기본 `'system'`)을 더하고 커맨드로 바꿔 persist에 저장한다
- [x] 테마 해석 순수 함수 `(pref, systemPrefersDark) → 'dark' | 'light'`
- [x] 앱 셸이 해석 결과를 루트 `data-theme`로 반영한다(global.css의 기존 `[data-theme]` 훅 재사용), '시스템'일 때만 prefers-color-scheme를 구독
- [x] 라이트 팔레트를 디자인 다크를 기준으로 파생하고, 두 테마 모두 대비 기준(본문 4.5:1, 비텍스트 3:1)을 지킨다
- [x] 설정 화면의 다크/라이트/시스템 칩으로 고른다
- [x] core 테스트: 해석 순수 함수 표 (prior art: i18n.test.ts)
- [x] smoke: 스위치가 실제로 색을 바꾸고 다시 열어도 유지된다, ui-diag 다크·라이트 양 테마 스크린샷
- [x] 전 게이트 그린
