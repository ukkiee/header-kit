# 07 — 상태 요약 슬림 라인 + 하단 푸터 정돈

**What to build:** 상태 요약(규칙 수·활성 프로필 수·경고)이 상단 슬림 라인으로 정돈되고, compile 경고는 지역화된 라벨+상세를 유지한다. 일시정지/재개는 원클릭 그대로. 하단의 내보내기/가져오기/백업/환경설정은 접이 구조를 유지하되 새 디자인 언어(보더 최소, 명도 구분)로 정돈된다.

**Blocked by:** 02 — 시스템 테마. (03·04 체인과 병렬 가능)

**Status:** done — commit ebc4cb9

- [x] 규칙 수·활성 프로필 수가 슬림 라인에 표시된다 (smoke J1 텍스트 유지, ko 렌더 `0 적용 규칙 · 3 활성 프로필`)
- [x] compile 경고가 지역화된 라벨+상세로 표시된다 (warning-text 단위 테스트 유지 + ko 렌더 감사, smoke J2)
- [x] 일시정지 원클릭 → 세션 규칙 0, 재개 → 복원 (smoke D3/D4 green)
- [x] 내보내기/가져오기/백업 접근 경로 유지 (smoke H1/H2·I1/I2 green — 푸터 시각 정돈은 테마 슬라이스에서 선반영)
- [x] 전 게이트 green (tsc0·vitest170·build·smoke59/59·storybook)

참고: code-review 2축 반영 — Card 단일값 variant 축 제거, 상태 스팬 `·` 구분 일관화. 잔여 후보: mutedText 토큰 추출(2회 사용, rule-of-three 미달로 보류).
