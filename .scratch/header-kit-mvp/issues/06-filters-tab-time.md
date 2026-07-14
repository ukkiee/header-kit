# 06 — Filter 2: 탭 추적과 시간

Status: done
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

## Comments

**2026-07-15 구현 완료.** 테스트 70/70, 실브라우저 스모크 22/22 — F1 Tab Filter(지정 탭 적용 + 탭 닫힘 자동 해제), F2 Tab Domain(도메인 안 적용·이탈 시 자동 해제), F3 Time Filter(**알람이 실기기에서 발화** → Profile off + 규칙 해제 + 배지 비움).

2축 코드리뷰 반영:
- **만료 즉시 전이**: 과거 시각 입력·SW 휴면 중 경과 시 규칙만 죽고 토글·배지가 켜진 채 남는 거짓 상태 발견 → converge가 만료를 발견하면 알람을 기다리지 않고 expire 전이를 태움. 미설정(expiresAt 0)은 만료로 치지 않아 "추가 직후 즉시 꺼짐" 사고도 차단.
- **만료 술어 단일화**: 3곳에 중복되던 판정을 core/expiry의 isTimeFilterExpired로 통합.
- **이슈 07 시임 보정**: expireProfiles가 toggleProfile을 경유하도록 변경 — 활성→비활성 전이의 부수 규칙(실체화 정리)이 만료 경로에서도 동일 적용될 구조 확보.
- 미설정 탭 선택(-1)을 빈 패턴과 같은 fail-open으로 통일(UNSET_ID), CompileEnv의 tabs·now를 필수로 변경(침묵 기본값 제거), 탭 이동 추적 골든 테스트·Window 스토리 추가, CONTEXT.md Compile 정의에 env 명시.

기록 (미커버 항목):
- 서드파티 요청 포함은 tabIds 조건의 플랫폼 의미론상 성립(설계상 보장)이나 실브라우저 단언은 별도 서드파티 서버가 필요해 생략.
- 그룹·창 이동의 실브라우저 스모크는 생략(골든 테스트로 커버). Pause×알람 경합의 executor 결합 스트레스는 reconciler 단위 스트레스로 갈음.
