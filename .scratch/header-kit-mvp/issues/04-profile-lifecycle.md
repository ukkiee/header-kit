# 04 — Profile 라이프사이클과 충돌 의미론

Status: ready-for-agent
Blocked by: 01

## Parent

`.scratch/header-kit-mvp/spec.md`

## What to build

단일 Profile 스켈레톤을 다중 Profile 제품으로 확장한다.

- Profile CRUD: 생성, 이름·배지 라벨·색 지정, 복제, 순서 변경, 삭제(확인 절차 또는 실행취소).
- 여러 Profile 동시 활성.
- 충돌 의미론(PRD 확정 사항): 목록 위쪽 Profile이 이긴다. Profile별 분리된 priority 대역, 대역 안에서 Modification 순서로 세분. 같은 헤더 겹침 시 우선 Profile의 Override 승리, Append는 우선순위 순 누적. Exclude allow 규칙의 하향 전파를 도움말에 문서화. 서로 다른 활성 Profile이 같은 헤더 이름을 수정하는 정적 겹침은 정보성 경고로 노출.
- 전역 Pause: 원클릭으로 모든 규칙 제거(빈 규칙 셋), Profile·Modification 상태는 보존.
- 툴바 배지: 활성 Profile의 배지 라벨·색 표시, Pause 상태 표시.

## Acceptance criteria

- [ ] Profile 생성·복제·순서 변경·삭제(확인/실행취소 포함)가 동작한다
- [ ] 두 활성 Profile이 같은 헤더를 Override 할 때 목록 위쪽이 승리한다 (골든 테스트 + 실브라우저 확인)
- [ ] Append 누적 순서와 겹침 경고가 골든 테스트로 검증된다
- [ ] Pause가 즉시 모든 변조를 멈추고, 해제 시 이전 상태 그대로 복원된다
- [ ] 툴바 배지가 활성 Profile과 Pause 상태를 반영한다
- [ ] Profile 관리 UI에 Storybook 스토리가 있다

## Blocked by

- 01-walking-skeleton.md
