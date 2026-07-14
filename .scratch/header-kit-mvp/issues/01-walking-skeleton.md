# 01 — 워킹 스켈레톤: 최소 Request Header 경로

Status: ready-for-agent
Blocked by: None - can start immediately

## Parent

`.scratch/header-kit-mvp/spec.md`

## What to build

프로젝트 스캐폴드와, 단일 Profile의 Request Header Override가 실브라우저에서 끝까지 동작하는 가장 얇은 완결 경로. 이후 모든 슬라이스가 이 뼈대 위에 쌓이므로 아키텍처의 형태(순수 Compile 시임, 재조정 큐, 로직 제로 어댑터, 두-마운트 SPA 구조의 팝업 쪽)를 여기서 확정한다.

- 스캐폴드: WXT + React + TypeScript + Tailwind + Base UI + CVA, Bun 스크립트, Vitest, Storybook. MIT LICENSE. manifest 권한은 `declarativeNetRequest`, `storage`, `tabs`, `alarms`, 호스트 `<all_urls>`로 고정하고 외부 네트워크 전송 코드는 존재하지 않는다.
- 스키마 v1의 최소 부분: Profile(식별자, 이름, 활성 여부) + Request Header Modification(이름, 값 템플릿, enable). 검증은 이후 슬라이스가 확장할 수 있는 형태로.
- Compile 시임: `compile(profiles, env) → { rules, warnings }` 순수 함수. 활성 Profile의 enabled Modification을 session rule로 변환.
- 재조정 큐 골격: 모든 재컴파일 트리거를 직렬화하는 단일 큐 + 단조 세대 번호, 최신 세대가 아닌 결과의 적용 거부.
- 어댑터: session rules 전량 교체, storage 변경 구독, 브라우저 시작 재컴파일 — 로직 제로 글루.
- 팝업 UI: Profile 활성 토글, Request Header Modification 행 추가/편집/enable 토글.
- 실브라우저 스모크에서 PRD 검증 항목 ①·②를 확인한다: ① 높은 priority allow 규칙이 낮은 priority 헤더 수정 규칙을 실제로 무효화하는지 (Exclude Filter 설계의 전제), ② 규칙 수 상한(5,000) 규모의 session rules 전량 교체가 실기기에서 동작하는지 (ADR-0002 전량 재컴파일 전제).

## Acceptance criteria

- [ ] Bun으로 의존성 설치 후 빌드·Vitest·Storybook이 각각 단일 명령으로 동작한다
- [ ] 팝업에서 Profile을 켜면 지정한 요청 헤더가 실제 요청에 적용되고, 끄면 즉시 사라진다 (실브라우저 스모크 기록)
- [ ] `compile()`이 브라우저 API 없이 입력→출력 골든 테스트로 검증된다
- [ ] 재조정 큐가 stale 세대의 적용을 거부하는 단위 테스트가 있다
- [ ] allow 규칙과 낮은 priority 헤더 수정의 우선순위 상호작용이 실기기에서 확인되고 결과가 이슈 코멘트로 기록된다
- [ ] 규칙 수 상한(5,000) 규모의 session rules 전량 교체가 실기기에서 동작함이 확인되고 결과가 이슈 코멘트로 기록된다
- [ ] MIT LICENSE 포함, manifest 권한이 위 목록과 정확히 일치한다
- [ ] UI 컴포넌트에 최소 1개 Storybook 스토리가 있다

## Blocked by

None - can start immediately
