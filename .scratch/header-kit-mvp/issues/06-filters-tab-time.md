# 06 — Filter 2: 탭 추적과 시간

Status: ready-for-agent
Blocked by: 04, 05

## Parent

`.scratch/header-kit-mvp/spec.md`

## What to build

플랫폼에 직접 조건이 없어 탭 상태 추적으로 구현하는 Filter 네 종류와 Time Filter.

- Tab Filter: 지정 탭의 요청에만 적용(session rule의 tabIds 조건), 탭이 닫히면 자동 해제.
- Tab Group / Window Filter: 소속 탭을 열거해 tabIds로 전개, 탭의 그룹·창 이동을 이벤트로 반영.
- Tab Domain Filter: 탭의 현재 도메인 기준 — 그 탭에서 나가는 서드파티 요청까지 포함, 탭이 도메인을 벗어나면 자동 비활성.
- Time Filter: 만료 시각이 지나면 알람으로 Profile 전체 자동 off.
- 탭·알람 이벤트는 모두 재조정 큐를 통해 재컴파일을 트리거한다. Pause·프로필 편집이 탭·알람 이벤트와 경합하는 시나리오의 스트레스 테스트(PRD 재컴파일 직렬화 결정)를 여기서 완성한다.
- 편집 UI: 05의 Filter 편집기를 확장해 탭 선택기(열린 탭·그룹·창 목록), Tab Domain 입력, Time Filter 만료 시각 입력을 제공한다.

## Acceptance criteria

- [ ] Tab Filter가 지정 탭에만 적용되고 탭 닫힘 시 자동 해제된다 (실브라우저 확인)
- [ ] Tab Group·Window Filter가 탭 이동을 따라간다
- [ ] Tab Domain Filter가 서드파티 요청을 포함해 적용되고 도메인 이탈 시 꺼진다
- [ ] Time Filter 만료가 Profile을 끄고 배지에 반영된다
- [ ] 탭 상태를 env로 주입한 골든 테스트가 네 Filter의 tabIds 전개를 검증한다
- [ ] Pause·편집·탭·알람 경합 스트레스 테스트가 stale 적용 없음을 보인다
- [ ] 탭 선택기·만료 시각 입력 UI에 Storybook 스토리가 있다

## Blocked by

- 04-profile-lifecycle.md (배지 반영·Pause 경합 테스트의 전제)
- 05-filters-native.md
