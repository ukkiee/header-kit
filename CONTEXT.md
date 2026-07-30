# HeaderKit

프로필 기반으로 HTTP 요청/응답을 수정하는 Chromium 확장 프로그램. 켜진 동안, 정해진 범위 안에서만 트래픽을 변조하고 끄면 흔적을 남기지 않는다.

## Language

**Profile**:
Modification의 이름 있는 묶음. 여러 Profile이 동시에 활성일 수 있다.
_Avoid_: preset, workspace, 설정 세트

**Modification**:
Profile에 속한 개별 수정 항목. 종류는 Request Header, Response Header, Request Cookie, Response Cookie, Redirect, User-Agent, Block, Header Removal 여덟 가지 (뒤 셋은 ADR 0015에서 추가). 자신의 URL 스코프(매치 방식 포함)와 Condition을 직접 들고 다닌다 (ADR 0010). CSP 종류는 ADR 0013에서 퇴역했다 — 저장·import된 CSP 수정은 검증 전에 조용히 버려진다.
_Avoid_: rule (브라우저의 net rule과 혼동), row, entry

**User-Agent**:
요청의 `User-Agent` 헤더를 바꾸는 Modification 종류. 값 하나만 받고 헤더 이름은 `User-Agent`로 고정된다 — Request Header의 특수 케이스지만 별도 종류로 둔다(ADR 0015). 사용자 대면 라벨은 'User-Agent 변경'.
_Avoid_: UA (라벨 층위에서 — 행 뱃지 UA는 유효)

**Block**:
매칭된 요청을 아예 차단하는 Modification 종류. declarativeNetRequest의 `block` 액션으로 컴파일되며 이름·값이 없다 — URL 스코프와 Condition만 갖는다(ADR 0015). 헤더를 고치는 다른 종류와 달리 요청 자체를 막으므로 스코프가 넓으면 페이지가 깨질 수 있다.
_Avoid_: cancel, deny

**Header Removal**:
이름이 같은 헤더를 요청·응답 **양쪽에서** 제거하는 Modification 종류. dNR 규칙 하나가 removeHeaders(request)+removeHeaders(response)를 함께 낸다 — 사용자가 요청/응답을 구분하지 않아도 되게 한 결정이다(ADR 0015). 값이 없고 헤더 이름만 받는다. 사용자 대면 라벨은 '헤더 삭제'.
_Avoid_: delete (스키마 kind 값·행 뱃지 DEL에서는 유효), del (라벨 층위에서)

**Response Cookie**:
Set-Cookie 응답 헤더를 수정하는 Modification 종류. 사용자 대면 라벨은 '응답 쿠키'로 Request Cookie와 대칭이고, 행 뱃지는 실제 헤더 이름인 SET-COOKIE(프로토콜 토큰)를 유지한다.
_Avoid_: set-cookie (라벨 층위에서 — 뱃지·스키마 kind 값에서는 유효)

**Condition**:
Modification 하나가 적용될 요청 범위를 좁히는 규칙 단위 조건 — 제외 도메인, Resource Type, Request Method, Initiator Domain, Tab Domain, 자동 해제 시각(expiresAt). 프로필 수준 Filter는 ADR 0010에서 퇴역했고, 그 이름은 레거시 데이터 마이그레이션에서만 쓰인다.
Initiator Domain의 ko 사용자 대면 라벨은 '요청 출처 도메인' — 요청을 실제로 보낸 쪽을 가리켜 '보고 있는 탭'인 Tab Domain과 대비된다. en 라벨 `Initiator domains`와 스키마 필드 `initiatorDomains`는 Chrome Network 패널 용어와 맞춰 그대로 둔다.
_Avoid_: filter (레거시 개념과 혼동), matcher, Initiator 도메인 (ko 라벨 층위에서 — en 라벨·스키마 필드에서는 유효)

**Scope Breadth**:
Block의 URL 스코프가 얼마나 넓은지의 판정 — narrow / wide / invalid. `wide`는 "잘못됐다"가 아니라 "**확인이 필요하다**"는 뜻이라 저장을 막지 않고 한 번 더 묻고, `invalid`만 저장을 막는다(그 패턴으로는 규칙이 아예 만들어지지 않아, 차단이 걸렸다고 믿는 채로 아무 일도 일어나지 않는다). 판정 기준은 스코프가 **어떤 호스트에 묶여 있는가** 하나이며, 호스트 자리에서 묶인 것만 센다 — 경로에 놓인 도메인꼴 조각은 모든 호스트에 걸리므로 묶은 것이 아니다.
_Avoid_: 안전함, 위험도 (가치 판단으로 읽힌다), 넓은 규칙 (판정이 아니라 규칙의 속성으로 오해된다)

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
Profile 전체의 스냅샷. **Sync 저장 스위치**(ADR 0015)에 따라 브라우저 계정 동기화 저장소(storage.sync, 기기 간 동기화)나 이 브라우저에만 남는 로컬 저장소(storage.local) 중 하나에 보관된다. 어느 쪽이든 외부 서버가 아니라 브라우저 벤더의 저장 채널만 쓴다.
_Avoid_: cloud sync (도메인·내부 층위에서 — 외부 서버 동기화로 오해될 수 있음. 단 **사용자 대면 라벨은 '클라우드 동기화'**로 두어 켜짐/꺼짐의 의미를 직관적으로 전한다, ADR 0015)

**Schema Version**:
저장 상태와 내보내기 파일의 포맷 번호. 새 Modification 종류가 더해지며 v1에서 v2로 올랐다(ADR 0015). 읽기는 지난 버전도 받아 올리지만(**Migration**), 이 버전이 이해 못 하는 것 — 더 새 포맷이거나 올릴 수 없는 구 포맷 — 은 **Blocked**로 판정한다.
_Avoid_: 버전 (다른 버전 개념과 혼동될 때)

**Blocked**:
저장된 상태를 읽을 수 없다는 판정. Blocked인 동안에는 그 위에 **아무것도 쓰지 않는다** — 로컬 저장도, 자동 Backup도. 읽을 수 없는 것을 기본 상태로 접어 저장하면 원본이 사라지므로, 판정 자체가 상태를 돌려주지 않는다. 사용자 데이터는 그대로 남아 복구 기회가 있다.
_Avoid_: invalid (형태 오류만 가리키는 것으로 좁게 읽힘), corrupt

**Writer Lane**:
영속 저장소를 고치는 단 하나의 줄 (ADR 0016). Profile 전이, Schema Version 마이그레이션 커밋, 자동 Backup, 스냅샷 삭제, 클라우드 삭제, 전체 초기화가 전부 이 줄을 지나며 **한 번에 하나만** 진행한다. 팝업·탭 화면은 이 줄에 들어올 수 없고 요청만 보낸다 — 화면과 배경이 같은 저장소를 동시에 고치면 둘 다 자기 판단이 최신이라고 믿은 채 서로의 쓰기를 지운다.
_Avoid_: 락, mutex, 큐 (명령 실행자의 것과 혼동), 트랜잭션 (되돌림을 함의하는데 이 줄은 되돌리지 않는다)

**쓰기 허가**:
Writer Lane을 쥐고 있다는 표시 — 줄이 작업에게 건네주는 것 말고는 만들 수 없고, 그 작업이 끝나면 죽는다 (ADR 0016, 타입 이름 `WritePermit`). **콜러는 이것을 받지 않는다**: 저장소를 고치려는 쪽은 쓰기 문(`StateWriter`)의 매소드를 부르고, 허가는 그 문의 구현 안에만 존재한다. 허가가 모듈 경계를 넘는 순간 그 자리가 "한 획득 안에서 병행 쓰기를 띄우는" 실수의 자리가 되기 때문이다.
_Avoid_: 토큰 (들고 다니는 물건으로 읽히는데 이것은 들고 다닐 수 없다), 락 (쥐고 놓는 물건이 아니라 자리의 증거다), 권한·permission (사용자 권한과 혼동)

**쓰기 문**:
영속 저장소를 고치는 유일한 입구 — 전이 명령·마이그레이션 커밋·전체 초기화가 이 매소드들을 지난다 (ADR 0016, 타입 이름 `StateWriter`). 매소드마다 Writer Lane의 작업 하나가 되므로 겹쳐 불러도 도착 순서대로 직렬화된다. 화면은 이 문을 얻을 수 없고 메시지로 요청만 보낸다.
_Avoid_: 저장소·store (읽기까지 포함하는 것으로 읽힌다 — 이 문은 쓰기만 맡는다), 리포지토리

**Theme**:
팝업·탭 앱의 명암 모드 — 다크 / 라이트 / 시스템 세 값. 사용자가 고르고 storage에 영속된다(ADR 0015가 ADR 0004의 '스위치 없음, 시스템 연동만' 결정을 개정). '시스템'은 `prefers-color-scheme`를 따른다. 다크가 기준 디자인이고 라이트는 그에 맞춰 파생된다.
_Avoid_: dark mode (세 값 중 하나를 가리킬 때만)
