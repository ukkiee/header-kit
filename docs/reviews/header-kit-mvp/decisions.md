# Review decisions — header-kit-mvp

### plan r1

- R-1 accept — Placeholder values change on unrelated recompilations (실체화는 활성 전환 시점에만, 값 영속으로 PRD 확정)
- R-2 accept — Conflicting active Profiles have no deterministic semantics (목록 순서 = 우선순위, 대역 할당·Exclude 하향 전파·겹침 경고 명문화)
- R-3 accept — Recompile-and-replace lifecycle permits stale rule sets to win (단일 재조정 큐 + 단조 세대 번호로 stale 적용 거부)
- R-4 accept — Automatic snapshot backup has no bounded retention or partial-write recovery (단순화 설계: 고정 링 보존 + manifest-last 커밋 + 무결성 메타데이터 + 정상본 보존)
