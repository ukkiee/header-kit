# popup-ui-fixes — Spec

SSOT: `docs/prds/popup-ui-fixes.md`. 트랙: **light** (release 게이트만). invariant: feature.
진단: `scripts/ui-diag.mjs` (420px + ko + 실데이터 렌더). 문제는 액션 행 붕괴 + 경고 i18n에 집중, 나머지 UI는 감사 통과.

## 슬라이스

| # | 슬라이스 | Blocked by |
|---|---|---|
| 01 | nowrap 프리미티브 하드닝 (Button·Chip·Select·KindLabel) | None |
| 02 | ProfileSection 액션 행 재설계 (라벨 축약 + flex-wrap + 아이콘 클러스터) | 01 |
| 03 | compile 경고 i18n (summarizeCompile 라벨 → UI 지역화) | None |
| 04 | 밀도 폴리시 (입력 min-w-0 + 감사 잔여) | 02 |

**DAG:** 01→02→04; 03 독립. 검증: 각 슬라이스 `bun run check/test/build/smoke` + `ui-diag.mjs` 렌더로 420px+ko 확인.
