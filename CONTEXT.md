# HeaderKit

프로필 기반으로 HTTP 요청/응답을 수정하는 Chromium 확장 프로그램. 켜진 동안, 정해진 범위 안에서만 트래픽을 변조하고 끄면 흔적을 남기지 않는다.

## Language

**Profile**:
Modification과 Filter의 이름 있는 묶음. 여러 Profile이 동시에 활성일 수 있다.
_Avoid_: preset, workspace, 설정 세트

**Modification**:
Profile에 속한 개별 수정 항목. 종류는 Request Header, Response Header, Request Cookie, Set-Cookie, CSP, Redirect 여섯 가지.
_Avoid_: rule (브라우저의 net rule과 혼동), row, entry

**Filter**:
Profile의 Modification이 적용될 요청 범위를 좁히는 조건. 종류는 URL, Exclude URL, Initiator Domain, Resource Type, Request Method, Tab, Tab Group, Window, Tab Domain, Time.
_Avoid_: condition, matcher

**Override / Append**:
Modification의 두 가지 적용 방식 — 기존 헤더 값을 통째로 대체(Override, 기본)하거나 기존 값 뒤에 덧붙임(Append).
_Avoid_: merge, add

**Compile**:
활성 Profile 전체를 브라우저가 적용하는 선언적 네트워크 규칙 집합으로 변환하는 것. 규칙 상태는 항상 저장된 Profile과 주어진 환경(열린 탭 스냅샷, 현재 시각, 실체화 구역)의 순수 함수다.
_Avoid_: sync, refresh

**Placeholder**:
Modification 값 템플릿 안에서 `{{uuid}}`처럼 쓰여 Profile이 활성화되는 시점(활성화 경계)에 한 번 실체화되는 토큰. 켜져 있는 동안 값이 유지되며, 요청마다 재평가되지 않는다.
_Avoid_: dynamic value, variable

**Pause**:
모든 Profile의 적용을 전면 중단하는 전역 스위치. 각 Profile·Modification의 활성 상태는 보존된다.
_Avoid_: disable, stop

**Backup**:
브라우저 계정 동기화 저장소에 보관되는 Profile 전체의 스냅샷. 외부 서버가 아니라 브라우저 벤더의 동기화 채널만 사용한다.
_Avoid_: cloud sync (외부 서버 동기화로 오해될 수 있음)
