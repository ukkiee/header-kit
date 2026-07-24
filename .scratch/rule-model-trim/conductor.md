# rule-model-trim conductor

- stage0 preflight: done — 브랜치 feature/rule-model-trim, 트래커 .scratch/rule-model-trim (base=main 9d19d7a). ui-polish 착지 직후 시작. 트래커는 .scratch 추적 규약(bookkeeping).
- stage1 align: done — 2개 변경 확정. (1) Initiator 라벨: ko "Initiator 도메인" → **"요청 출처 도메인"**, en "Initiator domains" 유지, 노트를 탭 도메인과 대조되게 다듬기(요청 보낸 쪽 vs 보는 탭). (2) **CSP 수정 종류 제거** — ADR 0013 작성. 마이그레이션은 로드·import 양 진입점에서 csp 규칙을 **조용히 버림**(사용자 결정, 데이터 손실 감수, v0.1.0이라 영향 미미). csp_report(리소스 타입)는 무관해 유지. 다음은 /to-spec
