# 조건은 전부 규칙의 속성이다 — 프로필 수준 필터 제거

프로필 수준 필터(적용 조건)를 제품에서 제거하고, 조건을 규칙(Modification)의 선택 필드로 옮긴다. 하나의 멘탈 모델: 규칙이 자기 스코프와 조건을 전부 들고 다닌다.

- **스키마**: 전 규칙 종류에 `conditions?: RuleConditions` — `{ excludedDomains?, resourceTypes?, requestMethods?, initiatorDomains?, tabDomains?, expiresAt? }`. `Profile.filters` 필드는 제거된다.
- **컴파일**: 규칙의 조건이 그 규칙의 DNR 조건으로 직접 내려간다(resourceTypes/requestMethods/initiatorDomains/excludedRequestDomains 네이티브, tabDomains는 탭 전개→tabIds). 프로필 필터 합성 기계(조인·exclude allow 규칙·프로필 tabIds)는 퇴역한다.
- **제외의 형태 변화**: 제외 URL(regex)은 규칙 단위 구현이 불가능하다 — DNR allow 규칙은 낮은 우선순위 전체를 게이트하는 전역 장치라 특정 규칙만 제외할 수 없고, RE2는 부정 룩어헤드가 없다. 대신 DNR 네이티브 `excludedRequestDomains` 기반 **제외 도메인** 조건을 제공한다. 기존 제외 URL regex 패턴은 마이그레이션에서 **소실**된다(도메인으로 기계 변환 불가).
- **자동 해제는 규칙 단위**: `conditions.expiresAt` — 만료 알람이 그 규칙만 `enabled=false`로 내리고 expiresAt을 소비(제거)한다. 컴파일도 지난 만료를 방출 가드한다.
- **탭/탭 그룹/창 피커 조건 삭제**: 수명 짧은 탭 id 묶기는 니치 — 탭 도메인 조건이 실수요를 커버한다.
- **마이그레이션**(로드·import 공통, 의미론 보존): 프로필 필터를 그 프로필의 모든 규칙에 복사한 뒤 필터를 제거한다 — URL 조인(OR)은 자체 urlFilter가 없는 규칙의 regex 스코프로, 리소스/메서드/initiator/탭 도메인은 conditions 배열로, 시간은 최솟값 expiresAt으로. 제외 URL·탭 피커는 소실(ADR 명시).

트레이드오프: 같은 조건을 여러 규칙에 반복 편집할 수 있다(복제가 완화). regex 제외 능력 상실. 얻는 것: 단일 멘탈 모델, 프로필 필터 UI·합성 기계·allow 게이트 전부 제거.
