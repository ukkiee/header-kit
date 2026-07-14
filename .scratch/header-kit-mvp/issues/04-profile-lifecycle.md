# 04 — Profile 라이프사이클과 충돌 의미론

Status: done
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

## Comments

**2026-07-15 구현 완료.** 테스트 42/42, 실브라우저 스모크 12/12 (D1: 충돌 승자 실요청 확인, D2/D3: 배지 개수·Pause 표시, D4: Resume 상태 복원).

- **AC "Append 누적 순서" 부분 이연**: append 연산은 이슈 02에서 스키마에 들어오므로, 이 이슈에서는 그 전제인 priority 대역 순서 보장까지 골든 테스트로 고정했고 append 누적 자체의 골든 테스트는 이슈 02에서 추가한다. (대역 설계상 DNR append는 priority 순으로 자동 누적된다.)
- 2축 코드리뷰 반영: ① 스키마 필드 추가가 기존 저장 상태를 전량 거부로 파괴하지 않도록 parse에 backfill 추가(SSOT 보호), ② 배지 갱신을 재조정 큐의 apply 안으로 이동(규칙과 같은 스냅샷·세대 보증 — stale 배지 차단), ③ 복제를 core 명령(duplicate-profile)으로 이동(ST-2 정신), ④ shortLabel 2자 불변식을 권위 경로(updateProfileMeta)에서 강제.
- 유지 판단: 삭제는 2단계 확인(이슈가 "확인 또는 실행취소" 허용), EXCLUDE_ALLOW_SLOTS 예약은 이슈 05의 문서화된 기반 작업.
