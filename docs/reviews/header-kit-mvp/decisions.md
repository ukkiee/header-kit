# Review decisions — header-kit-mvp

### plan r1

- R-1 accept — Placeholder values change on unrelated recompilations (실체화는 활성 전환 시점에만, 값 영속으로 PRD 확정)
- R-2 accept — Conflicting active Profiles have no deterministic semantics (목록 순서 = 우선순위, 대역 할당·Exclude 하향 전파·겹침 경고 명문화)
- R-3 accept — Recompile-and-replace lifecycle permits stale rule sets to win (단일 재조정 큐 + 단조 세대 번호로 stale 적용 거부)
- R-4 accept — Automatic snapshot backup has no bounded retention or partial-write recovery (단순화 설계: 고정 링 보존 + manifest-last 커밋 + 무결성 메타데이터 + 정상본 보존)

### plan r2

- R2-1 accept — Placeholder materialization has no schema representation (값 필드는 항상 템플릿, 실체화 값은 Modification ID 키의 별도 활성 상태 구역, Export/Import에서 제외; 사용자 지시로 r3 재리뷰 실행)

### plan r3

- R3-1 accept — Imported active profiles have no materialized placeholder state (Import·복원을 활성화 경계로 정의, 불변식 "활성 Profile은 완전한 실체화 상태 동반" + Compile 방어선; 사용자 지시로 r4 재리뷰 실행)

### plan r4

- verdict: approve, 발견 0건 — 게이트 통과
