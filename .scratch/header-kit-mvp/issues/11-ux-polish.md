# 11 — 보조 UX 마감

Status: ready-for-agent
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
