# 11 — 보조 UX 마감

Status: done
Blocked by: 10

## Parent

`.scratch/header-kit-mvp/spec.md`

## What to build

제품을 마감하는 보조 UX 묶음. 각각은 작지만 전부 사용자 가시적인 완결 기능이다.

- Autocomplete: 헤더 이름·값 입력에 표준 헤더 사전 + 사용자 등록 항목. 등록 관리 UI.
- 다크 모드: 시스템 설정 연동.
- 키보드 단축키: 팝업 열기, Pause 토글 — 브라우저 단축키 설정 페이지 안내 포함.
- i18n: 브라우저 표준 메시지 구조로 영어(기본)·한국어 전 UI 문자열.
- 시크릿 창 지원: 허용 방법 안내 UI + 허용 후 시크릿 세션에서 규칙이 실제 적용되는지 확인.

## Acceptance criteria

- [ ] 헤더 이름 입력에 표준 사전 autocomplete가 뜨고 사용자 항목을 등록·삭제할 수 있다
- [ ] 시스템 다크 모드 전환이 팝업·탭 앱 모두에 반영된다
- [ ] 단축키로 팝업 열기와 Pause 토글이 동작한다
- [ ] 모든 UI 문자열이 메시지 카탈로그를 거치고 en/ko 카탈로그가 완전하다 (누락 검사 테스트)
- [ ] 시크릿 모드 미허용 상태에서 안내가 노출된다
- [ ] 시크릿 접근 허용 후 시크릿 창에서 활성 Profile의 수정이 실제 적용됨이 확인되고 기록된다

## Blocked by

- 10-tab-app-visibility.md

## Comments

**2026-07-15 구현 완료.** 테스트 137/137, 실브라우저 스모크 39/39 (L1 단축키 등록+set-paused 중단, L2 autocomplete 사용자 항목 등록·datalist 노출, L3 시크릿 미허용 안내).

- autocomplete: core/autocomplete 순수 사전+병합, customHeaderNames(스키마·명령·backfill), HeaderNameInput datalist.
- 단축키: manifest commands(_execute_action Alt+Shift+H, toggle-pause Alt+Shift+P), background 핸들러가 단일 writer 명령 경유.
- i18n: core/i18n en/ko 카탈로그, LocaleProvider+useT로 전 컴포넌트 배선, ?locale= 오버라이드(언어 강제 겸 스모크 결정성).
- 시크릿: 미허용 배너, 다크모드: Tailwind dark:로 전 컴포넌트 대응.

2축 코드리뷰 반영 (핵심):
- **i18n 미완 (양쪽 hard 지적)**: App 일부만 배선되고 대부분 하드코딩 영어였음 — 번역 컨텍스트(LocaleProvider/useT)를 만들어 HeaderRow·ProfileSection·TransferPanel·BackupPanel·StatusSummary·LargeEditor·PreferencesPanel 전부 카탈로그 경유로 전환. 죽은 키 제거·확장. **i18n-coverage 정적 테스트 추가** — 컴포넌트 JSX에 카탈로그 우회 하드코딩 영문 문구가 없음을 강제(키-parity 테스트의 허점 보완).
- **toggle-pause lost-update**: 단축키 핸들러가 out-of-band read로 !paused를 계산하던 것을 togglePause 명령(권위 상태 기준 뒤집기)으로 변경.
- 중복 시크릿 메시지 제거(App 배너가 소유, PreferencesPanel은 허용 시 확인 문구만).

기록:
- **AC L27(시크릿 허용 후 실적용 확인) 한계**: MV3 언팩 확장은 `--load-extension`으로 시크릿 허용을 CLI로 켤 수 없어 headless에서 실제 시크릿 트래픽 자동 검증이 불가능하다. 규칙은 시크릿 창 여부와 무관하게 session rules에 적용되고(시크릿 전용 예외 로직 없음), 미허용 안내(L3)까지 확인됨 — 실제 시크릿 적용은 수동 QA 항목으로 남긴다. release 게이트 verification에 수동 확인 절차로 기록.
- StatusSummary의 경고 라벨(header-overlap 등)은 background 생성이라 로케일이 없어 영어 유지 — 후속 개선 후보.
- 다크모드는 선언적 dark: 클래스라 별도 단언 없음(PRD의 stories 커버 방침).
