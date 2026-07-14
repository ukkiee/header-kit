# 10 — 탭 앱과 적용 상태 가시성

Status: ready-for-agent
Blocked by: 04

## Parent

`.scratch/header-kit-mvp/spec.md`

## What to build

같은 SPA의 두 번째 마운트인 탭 앱과, "지금 브라우저에 무엇이 걸려 있는가"의 가시성.

- 탭 앱: 확장 내부 탭 페이지에 동일 SPA를 마운트. 팝업에서 "탭에서 열기" 진입점. 넓은 화면 레이아웃에서 Profile 대량 관리.
- 대형 편집기: 긴 regex·CSP·헤더 값을 위한 확장 편집 다이얼로그.
- 적용 상태 요약: 활성 Profile이 컴파일한 규칙 수, Compile이 반환한 경고 전체(항목 단위), 겹침 경고를 한 화면에서 확인.

## Acceptance criteria

- [ ] 팝업과 탭 앱이 같은 상태를 보고 실시간으로 동기화된다
- [ ] 대형 편집기에서 편집한 값이 행에 반영된다
- [ ] 요약 화면의 규칙 수·경고가 Compile 반환값과 일치한다 (경고 시나리오 테스트)
- [ ] 탭 앱 레이아웃에 Storybook 스토리가 있다

## Blocked by

- 04-profile-lifecycle.md
