# 04 — 저장 검증 + 폼 정리 + 폼 키보드 UX

**What to build:** "저장되면 반드시 동작하는 규칙"만 통과한다 — 빈 필수 필드(헤더/쿠키 이름, CSP 디렉티브, Redirect 패턴·치환)로 Save를 누르면 해당 입력에 인라인 오류가 뜨고 저장되지 않는다(응답 쿠키의 빈 값은 차단 사용례라 유효). 폼도 종류별 의미에 맞게 다듬는다: 요청 쿠키의 이름 라벨은 '쿠키 이름', append 불가 요청 헤더에선 모드 선택이 보이지 않고, URL 필터 placeholder는 매치 방식별 예시로 바뀌며, 종류 라벨은 '응답 쿠키'(행 배지는 SET-COOKIE 유지)가 된다. 폼이 열리면 첫 입력에 포커스가 가고, Esc로 닫고 Cmd/Ctrl+Enter로 저장한다.

**Blocked by:** 01 — 폼 프리미티브 (검증 표시가 Base UI Field 시맨틱에 얹힘).

**Status:** ready-for-agent

- [ ] core 순수 함수가 종류별 누락 필수 필드를 반환 — 헤더/쿠키 이름, CSP 디렉티브 최소 1개, Redirect 패턴·치환; 응답 쿠키는 빈 값 허용 (vitest)
- [ ] 빈 필수 필드 Save → aria-invalid + 인라인 오류 + 스토리지 불변; Compile의 빈 이름 경고는 import·레거시 방어선으로 유지 (smoke)
- [ ] 쿠키 이름 라벨·모드 미노출·매치 방식별 placeholder·'응답 쿠키' 라벨(배지 SET-COOKIE 유지) 반영 (smoke)
- [ ] 폼 열림 시 첫 입력 autofocus, Esc 닫기, Cmd/Ctrl+Enter 저장 (smoke)
- [ ] 전 게이트 green
