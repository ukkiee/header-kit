# PRD: HeaderKit — 프로필 기반 HTTP 트래픽 수정 확장 (MVP)

Status: ready-for-agent

## Problem Statement

웹 개발자와 QA 엔지니어는 개발·테스트 중에 특정 요청에만 인증 토큰을 붙이거나, CORS·CSP 응답 헤더를 바꿔 보거나, 운영 URL을 로컬 서버로 돌리는 등 HTTP 요청/응답을 일시적으로 변조해야 하는 일이 잦다. 이런 작업을 프록시 도구로 하면 설정이 무겁고, 코드로 하면 커밋에 실수로 섞여 들어간다. 브라우저 확장이 가장 가벼운 해법이지만, 이 영역의 기존 확장들은 과도한 데이터 수집 문제로 신뢰를 잃었거나 스토어에서 퇴출됐고, Manifest V3 전환 이후 반쯤만 동작하는 것이 많다. 지금 필요한 것은 **밖으로 아무것도 보내지 않음을 코드로 증명할 수 있고, MV3 위에서 정직하게 동작하는** 헤더 수정 도구다.

## Solution

HeaderKit은 Chromium 계열 브라우저용 MV3 확장 프로그램이다. 사용자는 **Profile**(Modification + Filter의 이름 있는 묶음)을 만들어 켜고 끄며, 켜진 동안에만 정해진 범위의 요청/응답이 변조되고 끄면 흔적이 남지 않는다. 모든 도메인 로직은 "저장된 Profile → 브라우저 선언적 규칙"의 순수한 **Compile** 함수로 모이고, 규칙 적용은 브라우저 네트워크 스택이 수행하므로 백그라운드 프로세스가 자고 있어도 동작한다. 텔레메트리는 전무하며 MIT 라이선스로 소스가 공개된다. UI는 툴바 팝업(빠른 토글·간단 편집)과 탭 앱(대형 편집·대량 관리) 두 마운트를 가진 단일 SPA다.

## User Stories

### Profile 관리

1. As a 웹 개발자, I want 여러 Profile을 만들어 작업 맥락별 수정 세트를 분리 저장하기를, so that 프로젝트를 오갈 때 설정을 다시 만들지 않아도 된다
2. As a 웹 개발자, I want Profile마다 이름·배지 색·짧은 라벨을 지정하기를, so that 어떤 Profile이 켜져 있는지 툴바 아이콘만 보고 식별할 수 있다
3. As a QA 엔지니어, I want 여러 Profile을 동시에 활성화하기를, so that 인증용·환경 전환용 수정 세트를 조합해 쓸 수 있다
4. As a 웹 개발자, I want Profile을 복제하기를, so that 기존 설정을 변형한 실험을 안전하게 시작할 수 있다
5. As a 웹 개발자, I want Profile 순서를 바꾸기를, so that 자주 쓰는 것을 앞에 둘 수 있다
6. As a 웹 개발자, I want Profile 삭제 시 확인 절차 또는 실행취소를, so that 실수로 설정을 잃지 않는다
7. As a 웹 개발자, I want 전역 Pause 스위치를, so that 개별 Profile 상태를 건드리지 않고 모든 변조를 즉시 멈출 수 있다
8. As a 웹 개발자, I want 툴바 배지에서 활성 Profile과 Pause 상태를 확인하기를, so that 변조가 걸린 채로 일반 브라우징을 하는 사고를 피할 수 있다

### Modification — 헤더

9. As a 웹 개발자, I want Request Header를 추가·교체·제거하기를, so that 인증 토큰이나 커스텀 헤더를 코드 수정 없이 실험할 수 있다
10. As a 웹 개발자, I want Response Header를 추가·교체·제거하기를, so that CORS·캐시 정책을 서버 배포 없이 실험할 수 있다
11. As a 웹 개발자, I want Modification마다 Override와 Append 중 적용 방식을 고르기를, so that 기존 값을 보존하면서 덧붙이는 경우를 표현할 수 있다 (Append는 브라우저가 허용하는 요청 헤더에만 UI에 노출된다)
12. As a 웹 개발자, I want 값을 비운 헤더의 의미(제거 vs 빈 값 전송)를 명시적으로 고르기를, so that 서버의 빈 헤더 처리를 테스트할 수 있다
13. As a 웹 개발자, I want Modification을 개별 enable/disable 하기를, so that 삭제하지 않고 잠시 꺼둘 수 있다
14. As a 웹 개발자, I want Modification에 comment를 달기를, so that 왜 넣었는지 나중에 알 수 있다
15. As a 웹 개발자, I want 헤더 이름·값 autocomplete(표준 헤더 + 내가 등록한 항목)를, so that 오타 없이 빠르게 입력할 수 있다
16. As a 웹 개발자, I want 헤더 값에 `{{uuid}}`·`{{timestamp}}` Placeholder를 쓰기를, so that Profile을 켤 때마다 새 추적 값이 들어가고 켜져 있는 동안에는 그 값이 바뀌지 않는다 (요청마다 재평가되지 않음이 UI에 명시된다)

### Modification — 쿠키·CSP·Redirect

17. As a QA 엔지니어, I want 요청에 쿠키를 추가(Append)하거나 Cookie 헤더 전체를 교체·제거하기를, so that 세션 상태별 동작을 테스트할 수 있다
18. As a QA 엔지니어, I want Set-Cookie 응답 헤더를 추가·통짜 교체·차단하기를, so that 쿠키 발급 시나리오를 통제할 수 있다 (기존 속성을 보존하는 부분 수정은 제공되지 않으며 그 이유가 도움말에 명시된다)
19. As a 보안 테스터, I want CSP 디렉티브를 항목 단위로 편집해 응답의 CSP 헤더로 합성하기를, so that 정책 변경의 영향을 배포 없이 검증할 수 있다
20. As a 웹 개발자, I want regex와 캡처 그룹 치환으로 URL을 Redirect 하기를, so that 운영 리소스를 로컬 개발 서버로 돌려 테스트할 수 있다

### Filter

21. As a 웹 개발자, I want URL Filter(regex, 복수 등록 시 OR)를, so that 특정 주소 패턴에만 Modification이 적용된다
22. As a 웹 개발자, I want Exclude URL Filter를, so that 특정 패턴만 적용에서 제외할 수 있다
23. As a 웹 개발자, I want Resource Type Filter를, so that XHR에만 또는 문서에만 적용하도록 좁힐 수 있다
24. As a 웹 개발자, I want Request Method Filter를, so that GET/POST 등 메서드별로 적용을 나눌 수 있다
25. As a 웹 개발자, I want Initiator Domain Filter를, so that 요청을 발생시킨 출처 도메인 기준으로 적용을 좁힐 수 있다
26. As a 웹 개발자, I want Tab Filter를, so that 지정한 탭에서 나가는 요청에만 적용되고 그 탭이 닫히면 자동 해제된다
27. As a 웹 개발자, I want Tab Group·Window Filter를, so that 작업 그룹/창 단위로 적용 범위를 나눌 수 있다
28. As a 웹 개발자, I want Tab Domain Filter를, so that 특정 도메인을 보고 있는 탭의 요청(그 탭의 서드파티 요청 포함)에만 적용되고 도메인을 벗어나면 자동으로 꺼진다
29. As a QA 엔지니어, I want Time Filter(만료 시각)를, so that 정해둔 시간이 지나면 Profile이 저절로 꺼져 변조를 잊고 방치하는 사고를 막는다

### 데이터 — Import/Export/Backup

30. As a 웹 개발자, I want 선택한 Profile들을 JSON으로 Export 하기를, so that 팀원과 설정을 공유할 수 있다
31. As a 웹 개발자, I want JSON 파일·붙여넣기로 Import 하기를, so that 받은 설정을 바로 쓸 수 있다
32. As a 웹 개발자, I want Import 시 스키마 검증과 항목 단위의 명확한 오류 메시지를, so that 깨진 파일이 조용히 반쯤 들어오는 일이 없다
33. As a 웹 개발자, I want 브라우저 계정 동기화 저장소로의 자동 Backup과 복원 목록을, so that 기기를 옮기거나 확장을 재설치해도 Profile을 되찾을 수 있다 (외부 서버는 관여하지 않는다)

### UX 전반

34. As a 웹 개발자, I want 팝업에서 Profile 토글과 간단 편집을, so that 흐름을 끊지 않고 빠르게 조작할 수 있다
35. As a 웹 개발자, I want 탭 앱에서 대형 편집기와 대량 관리를, so that 긴 regex·CSP 값을 넓은 화면에서 다룰 수 있다
36. As a 웹 개발자, I want 시스템 연동 다크 모드를, so that 눈이 편하다
37. As a 웹 개발자, I want 키보드 단축키(팝업 열기, Pause 토글)를, so that 마우스 없이 조작할 수 있다
38. As a 한국어 사용자, I want 영어·한국어 UI를, so that 모국어로 쓸 수 있다
39. As a 웹 개발자, I want 시크릿 창 지원(허용 방법 안내 포함)을, so that 시크릿 세션에서도 같은 수정을 쓸 수 있다
40. As a 웹 개발자, I want regex 오류·quota 초과 시 어느 Modification이 왜 적용되지 못했는지 보이는 경고를, so that 조용히 실패한 규칙을 찾아 헤매지 않는다
41. As a 웹 개발자, I want 활성 Profile이 만들어낸 적용 규칙 수와 경고 요약을 보기를, so that 지금 브라우저에 무엇이 걸려 있는지 신뢰할 수 있다
42. As a 사용자, I want 텔레메트리가 전혀 없고 소스가 공개된 도구를, so that 내 트래픽을 만지는 확장을 안심하고 쓸 수 있다

## Implementation Decisions

- **스택**: WXT(MV3 확장 프레임워크) + React + TypeScript + Tailwind + Base UI + CVA + Motion. 패키지 매니저·스크립트 러너는 Bun, 테스트는 Vitest, 컴포넌트 개발은 Storybook. UI는 팝업과 탭 앱 두 마운트를 가진 단일 SPA.
- **아키텍처**: 도메인 로직 전부를 순수 TS 모듈 `compile(profiles, env) → { rules, warnings }`에 집약한다(ADR-0002). `env`는 탭 상태(탭·그룹·창·URL), 현재 시각, Pause 여부. 브라우저 API 어댑터(규칙 등록, 탭·알람 이벤트 구독, 저장소 IO)는 로직 없는 얇은 글루로 유지한다.
- **규칙 관리**: declarativeNetRequest session rules 단일 경로. `storage.local`의 Profile이 단일 진실 원천이고, 변경·브라우저 시작·탭 이벤트·알람 시 전량 재컴파일해 교체한다(ADR-0002).
- **재컴파일 직렬화**: 모든 재컴파일 트리거는 단일 재조정 큐로 직렬화하고 단조 증가 세대 번호를 부여한다. 입력 스냅샷(저장소·탭 상태·Pause 여부)은 큐 처리 시점에 새로 읽으며, 최신 세대가 아닌 컴파일 결과의 적용은 거부한다 — Pause 직후 옛 스냅샷이 규칙을 되살리는 일이 없어야 한다.
- **충돌 의미론**: Profile 목록 순서가 우선순위다 — 목록 위쪽 Profile이 이긴다. 같은 요청의 같은 헤더를 겹쳐 수정하면 우선 Profile의 Override가 승리하고, Append는 우선순위 순서로 누적된다. Profile마다 분리된 priority 대역을 할당하고 대역 안에서는 Modification 목록 순서로 세분한다. Exclude Filter가 만드는 allow 규칙은 자기 Profile 대역의 상단에 놓이며, 플랫폼 의미론상 그보다 낮은 우선순위 Profile의 수정까지 해당 URL에서 함께 차단된다 — 이를 제품의 명시된 의미론으로 채택하고 도움말에 문서화한다. 서로 다른 활성 Profile이 같은 헤더 이름을 수정하는 정적 겹침은 정보성 경고로 노출한다.
- **쿠키**: Cookie/Set-Cookie 헤더에 대한 DNR 표현 가능 연산만 제공하고 쿠키 저장소는 건드리지 않는다(ADR-0001).
- **Exclude URL Filter**: regex lookahead에 의존하지 않고, 제외 패턴을 더 높은 priority의 allow 규칙으로 변환해 구현한다. 이 우선순위 상호작용은 워킹 스켈레톤에서 실기기 검증한다.
- **탭 계열 Filter**: 탭 URL·그룹·창 상태를 추적해 매칭 탭의 tabIds를 session rule 조건으로 전개한다. Initiator Domain·Request Method·Resource Type Filter는 DNR 네이티브 조건으로 직접 매핑한다.
- **Append 허용 목록**: 요청 헤더 Append는 브라우저 허용 목록(21종)에 있는 헤더에만 UI에서 노출해 불가능한 상태가 만들어지지 않게 한다. 응답 헤더는 제약 없음.
- **Placeholder**: 값의 실체화(materialization)는 Profile의 비활성→활성 전환 시점에만 일어나고, 실체화된 값은 활성 상태의 일부로 영속되어 탭 이벤트·알람 등 무관한 재컴파일과 service worker 재시작에도 유지된다. Compile은 저장된 실체화 값을 소비할 뿐 새로 생성하지 않는다. 활성 중에 템플릿이 편집되면 그 Modification만 즉시 재실체화하고, 활성→비활성 전환 시 실체화 값은 삭제된다. 요청별 치환은 제공하지 않는다.
- **스키마**: 자체 Profile 스키마 v1 단일 형식(ADR-0003). 필드는 Profile(식별자, 이름, 배지 라벨, 색, 활성 여부)·Modification 6종(종류, 이름, 값 템플릿, 적용 방식, 빈 값 의미, enable, comment)·Filter 9종(종류별 조건 값)·스키마 버전으로 구성하고, Import 시 전체 검증 후 전량 수용 또는 전량 거부한다. Modification의 값 필드는 항상 Placeholder 템플릿을 보유하며 실체화 값으로 덮어쓰지 않는다. 실체화 값은 Modification 식별자를 키로 하는 별도의 활성 상태 구역에 영속하고, Export에는 템플릿만 포함되며 실체화 상태는 Import 대상이 아니다. Import와 Backup 복원은 활성화 경계다 — 활성 플래그가 켜진 Profile이 저장소에 들어오는 모든 경로에서 비활성→활성 전환과 동일하게 모든 enabled Placeholder를 원자적으로 실체화한 뒤에야 규칙이 적용될 수 있다. 불변식: 활성 Profile은 항상 완전한 실체화 상태를 동반한다. Compile은 이 불변식이 깨진 Profile을 규칙에서 제외하고 경고를 반환한다.
- **Backup**: `storage.sync`에 102,400바이트·항목당 8KB quota를 고려한 분할 직렬화로 저장하고, 복원은 스냅샷 목록에서 선택한다. 보존은 고정 개수 링(오래된 것부터 삭제)으로 제한하고, 스냅샷은 불변 ID를 가지며 청크를 모두 쓴 뒤 매니페스트를 마지막에 기록하는 manifest-last 커밋으로 원자성을 확보한다. 무결성 메타데이터(청크 수·체크섬)로 손상 스냅샷을 감지해 복원 목록에 표시하고, 실패한 쓰기의 잔여 청크는 정리하며, 마지막 정상 스냅샷은 새 스냅샷 커밋이 완료되기 전까지 절대 삭제하지 않는다.
- **권한**: `declarativeNetRequest`, `storage`, `tabs`, `alarms` + 호스트 권한 `<all_urls>`. 그 외 권한은 요구하지 않는다. 외부 네트워크 전송 코드는 존재하지 않는다.
- **경고 체계**: regex 유효성은 브라우저 API로 사전 검증하고, quota 초과·미지원 조합은 Compile이 `warnings`로 반환해 UI에 항목 단위로 표시한다. 조용한 실패는 두지 않는다.
- **i18n**: 브라우저 표준 i18n 메시지 구조로 영어(기본)·한국어를 제공한다.
- **라이선스·신뢰**: MIT, 텔레메트리 제로.

## Testing Decisions

- 좋은 테스트는 외부 동작만 검증한다: "이 Profile 집합과 이 env가 주어지면 이 규칙 집합과 이 경고가 나온다". 내부 헬퍼 구조는 검증하지 않는다.
- **Compiler 시임(주)**: 필터 매핑, Exclude→allow 변환, Append 허용 목록, Placeholder 수명주기(무관한 재컴파일·재시작에서 값 불변, 비활성→재활성 시 재생성, 활성 중 템플릿 편집 시 해당 항목만 재실체화, Export/Import에 실체화 상태 불포함), quota 분할·경고, Pause·Time Filter 만료, 겹치는 활성 Profile의 충돌 의미론(Override 승자·Append 누적·Exclude 하향 전파·겹침 경고), 실체화 불변식이 깨진 Profile의 제외·경고를 모두 입력→출력 골든 테스트로 Vitest에서 검증한다. TDD의 본체.
- **재조정 수명주기**: 세대 번호 기반 stale 거부를 단위 검증하고, Pause·프로필 편집이 탭·알람 이벤트와 경합하는 시나리오를 스트레스 테스트로 검증한다.
- **Profile Store 시임**: 스키마 검증(수용/거부 경계), Export→Import 라운드트립 불변성, Backup 분할·복원 왕복에 더해 quota 고갈, 중단된 다중 항목 쓰기, 손상 청크의 감지·복구·정리를 검증한다. 활성 상태로 Export된 Placeholder 포함 Profile의 Import·복원이 활성화 경계로서 원자적 실체화를 수행하는지도 검증한다.
- **어댑터·UI**: 어댑터는 로직 제로로 유지해 단위 테스트를 두지 않고 실브라우저 스모크로 확인한다. UI 컴포넌트는 Storybook 스토리와 소수의 상호작용 테스트만 둔다.
- 신규 저장소라 기존 테스트 관례(prior art)는 없다 — 이 PRD의 테스트 결정이 관례의 시작점이 된다.

## Out of Scope

- 서버가 필요한 기능 전부: 공유 URL 생성, 조직 공유, SSO, 계정, 원격 프로필 폴링
- Firefox 등 비Chromium 브라우저 지원
- 쿠키 저장소 편집(도입 시 별도 기능으로 분리, ADR-0001)
- 요청별 Placeholder 재평가, Set-Cookie 속성 보존 부분 수정, regex 쿠키 이름 매칭
- 타사 확장 export 형식의 Import(ADR-0003)
- 유료 티어·기능 제한, 텔레메트리·오류 리포팅
- 엔터프라이즈 관리 저장소(정책 배포), 스토어 등록 자산·심사 대응

## Further Notes

- 워킹 스켈레톤에서 실기기 검증할 항목: ① 높은 priority allow 규칙이 낮은 priority 헤더 수정 규칙을 실제로 무효화하는지(Exclude Filter의 전제), ② session rules 전량 교체의 규칙 수 상한(5,000) 내 동작, ③ 응답 헤더 수정이 DevTools 네트워크 패널에 보이지 않을 수 있다는 한계의 문구화.
- regex 조건은 컴파일 후 2KB·타입별 1,000개 제한이 있으므로 복수 URL Filter의 OR 결합은 규칙 분할로 대응하고, 한도 초과는 경고로 노출한다.
- 최소 지원 브라우저 버전은 사용하는 DNR 기능(응답 헤더 Append 등)의 요구 버전으로 manifest에 명시한다.
