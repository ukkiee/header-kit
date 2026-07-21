# 02 — 시스템 다크+라이트 테마 + 액센트 1색 토큰

**What to build:** OS가 다크 모드면 팝업과 탭 앱 전체가 다크로 렌더된다(수동 스위치 없음, 시스템 연동만). 디자인 토큰에 다크 값을 확정하고 액센트를 1색으로 통일한다 — 구분은 보더 대신 명도·여백. 이후 슬라이스의 신규 프리미티브가 전부 처음부터 양 테마로 만들어지도록 하는 기초 작업.

**Blocked by:** 01 — 단일 프로필 뷰 골격.

**Status:** done — commit 1165783

- [x] prefers-color-scheme 다크에서 팝업·탭 앱이 다크로 렌더된다 (diag 4·5 감사, body/main 토큰 정합)
- [x] 토큰에 다크 값이 정의되고 액센트가 1색으로 통일된다 — @theme 겸용 램프 + blue 단일(시맨틱 success/warn/danger만 잔존), canvas 토큰 추출
- [x] 렌더 감사에 다크 스크린샷 시나리오가 추가된다 (diag-4 팝업 / diag-5 탭 앱)
- [x] Storybook에서 양 테마 상태를 확인할 수 있다 (테마 툴바 + data-theme 오버라이드, 네이티브 위젯 포함)
- [x] tsc·vitest170·build·smoke53/53·storybook green

참고: code-review 2축 반영 — 원시 CSS의 data-theme 미준수(@variant dark로 통일), 캔버스 클래스 3중 중복 해소, design-system.md 경로 정정.
