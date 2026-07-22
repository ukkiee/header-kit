# ui-refine gate decisions

### plan r1

- R-1 accept — Undo가 Placeholder의 원래 실행 상태를 복원한다는 계약이 정의되지 않았다
- R-2 accept — 키보드 재정렬은 필수 경로인데 테스트 계획에서 빠져 있다
- R-3 accept — 번들 크기 게이트가 측정법과 합격 기준 없이 선언돼 있다

### plan r2

- approve — 발견 0건 (R-1~R-3 반영 확인)

### structure r1

- S-1 accept — Select의 공개 계약이 옵션의 도메인 타입을 전부 지운다

### structure r2

- approve — 발견 0건 (S-1 반영 확인)

### release r0 (bundle gate re-triage, ui-refine 08)

- R-3 재설정 WAIVED by user: +60KB → +120KB 미만. 확정 라이브러리(Base UI 전면+dnd-kit+motion) 실측 +116KB, 이미 지연 로드 최적화 적용, motion 코어 59KB는 AnimatePresence 요구로 축소 불가. 로컬 팝업이라 파싱 비용 무시 가능 — motion 전면 유지.
