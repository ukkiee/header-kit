# 09 — (이연·behavior-adjacent) background 컴포지션 루트 부트스트랩 추출

Status: ready-for-agent
Blocked by: 02

## Parent

`.scratch/arch-restructure/spec.md` (설계 SSOT: `docs/reviews/arch-restructure/design.md` — 슬라이스 9, 설계 게이트 R-2 이연 결정)

## ⚠️ 성격

**behavior-adjacent — 별도 리뷰 필수.** 서비스워커 배선 재구성이므로 순수 구조 패스(01~07)와 분리해 독립 리뷰·롤백한다. 설계 게이트 design-r1의 R-2(defer)에서 나온 후속 작업. 02(runtime/platform seam) 이후 언제든 가능하나 이연 tail로 마지막에 착수 권장.

**주의:** 컴포지션 루트가 엔트리 경계에 사는 것 자체는 정당한 패턴이다. 이 슬라이스의 목적은 엔트리에서 로직을 **축출**하는 게 아니라, 212줄 배선 로직을 **테스트 가능**하게 만드는 것이다.

## What to build

- `entrypoints` 밖에 background 부트스트랩 모듈 정의(예: `src/app/background/bootstrap.ts` 또는 `src/runtime/backgroundBootstrap.ts`) — runtime·platform에 **명시적 의존**을 받는 형태.
- 현재 `src/entrypoints/background.ts`(212줄: regex 검증, 세션 규칙 교체, badge/alarm 적용, 백업 스케줄링, 이벤트 리스너, reconciliation 배선)의 로직을 그 부트스트랩으로 이동.
- `src/entrypoints/background.ts`는 `defineBackground(() => bootstrap(deps))`처럼 **부트스트랩 호출만** 남김.
- runtime / platform / 컴포지션 루트의 책임 경계를 부트스트랩 모듈 상단 주석 또는 ADR로 명시.
- 부트스트랩 로직에 대한 단위 테스트 추가(주입 deps로 브라우저 API 없이 검증) — 이 슬라이스의 핵심 이득.

## Acceptance criteria

- [ ] `src/entrypoints/background.ts`가 부트스트랩 호출 + defineBackground 래핑만 담음(수십 줄 이내)
- [ ] 배선 로직이 주입 deps 기반 부트스트랩 모듈로 이동, 브라우저 API 없이 단위 테스트됨
- [ ] 세션 규칙 교체·badge·alarm·백업·reconciliation 동작이 이전과 동일(smoke green)
- [ ] `bun run check`·`test`·`build`·`smoke` green
- [ ] **별도 리뷰 게이트 통과**

## Blocked by

02 — runtime/platform seam이 존재해야 함. (이연 tail: 07·08 이후 착수 권장.)

## Comments
