# rule-model-trim conductor

- stage0 preflight: done — 브랜치 feature/rule-model-trim, 트래커 .scratch/rule-model-trim (base=main 9d19d7a). ui-polish 착지 직후 시작. 트래커는 .scratch 추적 규약(bookkeeping).
- stage1 align: done — 2개 변경 확정. (1) Initiator 라벨: ko "Initiator 도메인" → **"요청 출처 도메인"**, en "Initiator domains" 유지, 노트를 탭 도메인과 대조되게 다듬기(요청 보낸 쪽 vs 보는 탭). (2) **CSP 수정 종류 제거** — ADR 0013 작성. 마이그레이션은 로드·import 양 진입점에서 csp 규칙을 **조용히 버림**(사용자 결정, 데이터 손실 감수, v0.1.0이라 영향 미미). csp_report(리소스 타입)는 무관해 유지. 다음은 /to-spec
- stage2 spec: done — 스펙 게시(.scratch/rule-model-trim/spec.md = docs/reviews 사본 동일). 시임 사용자 합의: vitest core 주 시임 + smoke CSP 케이스 제거 + tsc 그물 + storybook, 신규 0.
- stage2 plan gate r1: done — needs-attention 1건 R-1(high, 검증 전 필터 순서). accept + 로드 경로 확장. 스펙에 검증 전 필터·진입점 관통 테스트 명문화. 아티팩트·decisions 828a484
- stage2 plan gate r2: done — ok:true, verdict approve, 발견 0건 (R-1 양 경로 resolved 재검증, 신규 이슈 없음). 플랜 게이트 통과 — 다음은 /to-tickets
- stage3 slice: done — 티켓 2개 발행(issues/01 CSP 제거·워킹 스켈레톤·structure 게이트 대상, 02 Initiator 라벨·독립). 둘 다 blocker 없음. 사용자 승인. CSP는 tsc가 강제하는 단일 slice(쪼개면 게이트 사이 tsc 빨강), Initiator는 카피만.
- ticket 01 start: 1768beb
