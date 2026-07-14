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

### structure r1

- ST-1 accept — 스키마 v1이 Request Header 전용 구조를 공개 계약으로 고정 (modifications를 ordered discriminated union으로 재설계, kind='request-header' 첫 variant)
- ST-2 accept — UI가 저장 상태 전이 규칙을 우회해 직접 영속화 (core/commands 전이 명령 모듈 신설, mutateState 단일 쓰기 경로, saveState 비공개화)
- ST-3 accept — 새 세대가 apply 도중 도착하면 stale 규칙 적용을 막지 못함 (수렴 보증 방식: apply 중 추월 → 후속 태스크 즉시 덮음을 경합 테스트로 고정; 검토 중 발견된 체인 에러 전파로 인한 큐 영구 정지 버그도 태스크별 에러 격리로 수정)

### structure r2

- ST-1, ST-3 — 해결 확인 (재리뷰)
- ST2-1 accept — 동시 상태 전이가 서로의 변경을 유실 가능 (단일 권위 실행자: Command를 직렬화 데이터로, background가 유일 writer로 FIFO 실행·영속, UI는 sendMessage; lost-update 차단 경계 테스트 3건 추가; 사용자 지시로 r3 재리뷰 실행)
