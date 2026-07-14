# 07 — Placeholder 실체화 수명주기

Status: ready-for-agent
Blocked by: 04

## Parent

`.scratch/header-kit-mvp/spec.md`

## What to build

`{{uuid}}`·`{{timestamp}}` Placeholder와 그 실체화(materialization) 수명주기 전체. PRD의 plan 게이트에서 가장 공들여 확정한 의미론이므로 문구 그대로 구현한다.

- 값 필드는 항상 템플릿만 보유. 실체화 값은 Modification 식별자를 키로 하는 별도 활성 상태 구역에 영속.
- 실체화는 Profile의 비활성→활성 전환 시점에만 발생. 탭 이벤트·알람 재컴파일과 재시작에서는 값 불변 — Compile은 소비만 한다.
- 활성 중 템플릿 편집 → 그 Modification만 즉시 재실체화. 활성→비활성 → 실체화 값 삭제.
- 불변식: 활성 Profile은 항상 완전한 실체화 상태를 동반한다. Compile은 위반 Profile을 규칙에서 제외하고 경고를 반환한다.
- UI에 "Profile을 켤 때 값이 생성되고 켜져 있는 동안 유지된다(요청마다 재평가되지 않음)"를 명시한다.

## Acceptance criteria

- [ ] 활성화할 때마다 새 값이 생성되고, 켜져 있는 동안 탭 이벤트·알람·재시작을 거쳐도 값이 유지된다 (수명주기 테스트 매트릭스)
- [ ] 활성 중 템플릿 편집이 그 항목만 재실체화한다
- [ ] 비활성 전환이 실체화 값을 삭제하고, 재활성 시 새 값이 나온다
- [ ] 실체화 상태가 누락된 활성 Profile은 규칙에서 제외되고 경고가 반환된다 (골든 테스트)
- [ ] Placeholder 의미 안내가 UI에 노출된다

## Blocked by

- 04-profile-lifecycle.md
