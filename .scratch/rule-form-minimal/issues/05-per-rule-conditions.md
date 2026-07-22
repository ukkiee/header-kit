# 05 — 조건의 완전한 규칙 단위화 (프로필 필터 제거)

**What to build:** ADR 0010. `conditions?`(제외 도메인/리소스 타입/메서드/initiator/탭 도메인/자동 해제)를 규칙에 추가하고 프로필 필터를 제거한다. 로드·import 마이그레이션이 기존 프로필 필터를 규칙으로 복사(의미론 보존, 제외 URL·탭 피커는 소실). 만료는 규칙 단위로 꺼진다. 폼에 조건 disclosure, '적용 조건' 섹션 퇴역.

**Blocked by:** None.

**Status:** done

- [x] 스키마·마이그레이션: 프로필 필터 → 규칙 conditions 복사(URL 조인/리소스/메서드/initiator/탭 도메인/시간 최솟값), filters 필드 제거 (vitest — schema.test 9, transfer.test 15)
- [x] 컴파일: 규칙 conditions → DNR 조건 직접 매핑 + 만료 방출 가드, 프로필 필터 기계 퇴역 (vitest — compile 22 · compile-filters 7 · compile-tabs 7)
- [x] 만료: 규칙 단위 자동 해제 — 알람이 규칙만 끄고 expiresAt 소비 (vitest expiry 8 + smoke F3)
- [x] 폼 조건 편집 + 요약 표시(`· Conditions: n`), '적용 조건' 섹션·필터 코드 퇴역 (smoke N5/N6)
- [x] 전 게이트 green — tsc 0 · vitest 192/192 · build · smoke 66/66 ×3 · storybook · ui-diag(overflow 0)

## 리뷰 반영 (2축)

- 수정: 만료 술어 단일화(compile이 expiry.ts `isRuleExpired` 공유 — expiresAt 0 미설정 규칙이 조용히 죽던 버그), condExpiresNote 카피 규칙 단위로 정정, filter\*Note → cond\*Note 리네임, import 공지 정확화(enabled 기준 + disabled 폐기 공지), normalizeConditions core 이동(expireRules 재사용), Command union 잔여 `;` 제거.
- 기각: 마이그레이션 병합의 규칙 자체 conditions 필드 우선 — 자체 스코프 우선(ADR 0007)과 일관된 의도적 선택.
- 보류: transfer 공지 en 하드코딩 — 같은 모듈의 기존 오류 메시지 패턴과 일관(카탈로그화는 별도 과제).
