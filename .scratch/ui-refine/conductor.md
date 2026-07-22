# ui-refine conductor

- stage0 preflight: done — 브랜치 feature/ui-refine, 트래커 .scratch/ui-refine
- stage1 align: done — 15개 항목 + 추가 4종 합의 (Base UI 전면, 검증 전 종류, dnd 메뉴 대체, 배지 줄, 응답 쿠키 라벨, motion 전면), CONTEXT.md 반영
- stage2 spec: done — .scratch/ui-refine/spec.md 게시, 시임 확인(기존 4 + 검증 순수 함수 1)
- stage2 plan gate: done — r1 needs-attention(3건 accept) → r2 approve
- stage3 slice: done — 티켓 8개 발행 (01 스켈레톤 → 구조 게이트 예정)
- stage4 ticket 01: done — Base UI Select/Input/Checkbox/Field 교체, 팝업·캡션 토큰화, smoke 66/66 ×3
- stage4 structure gate: done — r1 needs-attention(S-1 accept: Select 제네릭화) → r2 approve
- stage4 ticket 02: done — ChipGroup(ToggleGroup)·Collapsible 교체, 호버 버그 구조 해소, smoke 67/67
- stage4 ticket 03: done — IconButton+Tooltip(4대상), 호버 액션, 환경설정 정리, smoke 69/69
- stage4 ticket 04: done — 저장 검증(core 순수 함수)+폼 정리+키보드, 스테일 오류 버그 수정, smoke 73/73
- stage4 ticket 05: done — 조건 배지 줄(6차원)+빈 상태 CTA, 만료 표기 단일화, AC2 실질 검증, smoke 75/75
- stage4 ticket 06: done — dnd-kit 드래그·키보드 재정렬(Esc 취소 포함), 메뉴 이동 제거, smoke 75/75. 번들 +109KB는 티켓 08 게이트로 이월
- stage4 ticket 07: done — 삭제 Undo 토스트(restore-modification 원자 복원, Placeholder 값 보존), Close 제거, smoke 77/77
