# 01 — 워킹 스켈레톤: 최소 Request Header 경로

Status: done
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

## Comments

**2026-07-14 실브라우저 스모크 결과** (`bun run smoke`, Playwright + Chromium headless, 확장 로드 상태, 8/8 통과):

- **검증 항목 ① (allow vs modifyHeaders)**: 확인됨. 같은 조건에서 allow(priority 2) + modifyHeaders(priority 1) → 헤더 미적용. priority를 뒤집으면(modify 2, allow 1) 헤더 적용됨. **Exclude Filter를 "자기 대역 상단 allow 규칙"으로 구현하는 설계 전제 성립.** 단, allow는 자기보다 낮은 priority의 모든 modifyHeaders를 무효화하므로 PRD의 하향 전파 의미론도 실기기와 일치.
- **검증 항목 ② (5,000 규칙 전량 교체)**: 확인됨. 5,000개 modifyHeaders session rule 일괄 등록 596ms, 전량 교체(제거 5,000+재등록 5,000) 351ms, 전량 제거 23ms. **5,001번째 규칙은 "Session rule count exceeded" 오류로 거부** — session rule 상한은 정확히 5,000이며, quota 초과를 Compile 경고로 노출하는 PRD 결정이 필요함을 재확인.
- 상태→규칙 경로: storage 변경 → 재조정 큐 → session rule 반영이 100ms 폴링 내 수렴, Profile off 시 즉시 원상복구 확인.

**2026-07-14 코드리뷰 반영** (Standards/Spec 2축):

- 스모크 A를 실제 팝업 UI 조작(스위치 클릭)으로 교체 — 팝업→storage→규칙→실요청 전 구간이 이제 끝-끝으로 검증됨. C3/C4에 규칙 수 단언 추가(무단언 PASS 제거).
- 재조정 큐를 FIFO 체인 + 세대 스킵 방식으로 재구현 — 리뷰가 지적한 microtask 창의 lost-wakeup 가능성 제거, 코드도 더 단순해짐.
- `parseStoredState` 구조 검증 추가(전량 수용/거부, 위반 시 기본 상태) — 저장소 어댑터의 blind cast 제거, 이후 슬라이스가 확장할 검증 시임 마련.
- 유지 판단: `tabs`/`alarms` 권한(이슈 명세의 고정 목록), Profile.active vs Modification.enabled 구분(PRD 용어 그대로), reconciler onApplied는 소비자가 없어 제거.
