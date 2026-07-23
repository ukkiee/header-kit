# ui-polish conductor

- stage0 preflight: done — 브랜치 feature/ui-polish, 트래커 .scratch/ui-polish (main=6a0495f)
- stage1 align: done — 8개 항목 결정(셀렉트 폭 고정·Autocomplete+기존 필터·ScrollArea 양쪽·ref 포커스·모션 전면·아코디언 헤더·레일 툴팁), ADR 0012 작성
- stage2 spec: done — .scratch/ui-polish/spec.md 게시, 시임 확인(기존 5개, 신규 0)
- stage2 plan gate r1: done — needs-attention 4건, 인간 트리아지 전부 accept 확정. 스펙 반영(sync)은 미완 — 다음 세션에서 R-1~R-4 적용 후 r2 재검증
- stage2 spec sync: done — R-1~R-4 스펙 반영(reduced-motion 부재 단언 계약·셀렉트 en/ko 미절단 단언·저장 중 상태 계약+지연 저장 테스트·ui-diag 팝업 시작 지표). 두 사본 동일, 트래커 사본 커밋·리뷰 사본 미커밋. plan r2 미실행
- stage2 plan gate r2: done — ok:true, verdict approve, 발견 0건 (R-1~R-4 resolved 재검증, 신규 이슈 없음). 플랜 게이트 통과 — 다음은 /to-tickets
- stage3 slice: done — 티켓 10개 발행(.scratch/ui-polish/issues/01~10). 사용자 확정 3건: (a) 리스크 우선 순서 — 번들 압박 ScrollArea(02)·Autocomplete(03)를 앞으로, (b) 세분도 10개 유지, (c) **structure 게이트는 01이 아니라 02 완료 후** — 01은 앱 코드를 안 건드리는 계측 티켓이라 워킹 스켈레톤이 아니다. 01은 기준선 티켓이라 반드시 첫 번째(변경 전 빌드에서 측정해야 유효)
- ticket 01 start: 5520d6e
- ticket 01 done: 8618db5 — 팝업 시작 성능 계측 + 기준선(first paint 64.0ms / dom ready 36.7ms @ M5 Pro). 리뷰 2축 반영(cwd 상대 경로가 게이트를 무장 해제하던 결함 포함). 전 게이트 green. **structure 게이트는 아직 — 02 뒤에 돌린다**
- ticket 02 start: 8618db5
