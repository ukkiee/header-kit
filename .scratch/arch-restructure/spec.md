# arch-restructure — Spec

SSOT 설계 문서는 **`docs/reviews/arch-restructure/design.md`** 다 (중복 방지 — 여기서 재기술하지 않는다).
설계 게이트: r2 `approve` (`docs/reviews/arch-restructure/design-r2.json`), triage 기록은 `docs/reviews/arch-restructure/decisions.md`.

## 한 줄 목표

header-kit을 `src/` 루트 6레이어(**core → runtime → platform → ui → features → app → entrypoints**, 단방향 하향)로 재편하고, 인라인 Tailwind 중복 ~70개를 cva 디자인 시스템(tokens + 12 프리미티브)으로 흡수한다. 슬라이스 01~07은 behavior-preserving, 08~09는 behavior-adjacent(별도 리뷰).

## 슬라이스 / 이슈

| # | 슬라이스 | 성격 |
|---|---|---|
| 01 | 순수 이동 (src/ 루트) — 워킹 스켈레톤 | 이동만 |
| 02 | runtime/ 분리 + platform/ 리네임 | 레이어 교정 |
| 03 | DS 씨앗: tokens + Button 이동 + Chip | DS |
| 04 | Input + Select 채택 | DS |
| 05 | Alert + Card + CollapsiblePanel | DS |
| 06 | 나머지 얇은 프리미티브 | DS |
| 07 | feature 폴더 재편 + App/css hoist + i18n 재귀화 | 구조 |
| 08 | (이연) FilterRow 내부 분해 + i18n 수리 | behavior-adjacent |
| 09 | (이연) background 컴포지션 루트 부트스트랩 추출 | behavior-adjacent |

**블로킹 DAG:** 01 → {02, 03}; 03→04→05→06; {02,06}→07; 07→08; 02→09.

## 검증 (모든 이슈 공통)

각 슬라이스 종료 시 `bun run check` · `bun run test` · `bun run build` · `bun run smoke`(build 선행) · `bun run storybook:build` 전부 green. 슬라이스 01은 추가로 "이동 외 0 diff", DS 슬라이스는 Storybook 시각 확인, 07은 i18n-coverage가 재귀 후에도 하드코딩 문자열에서 fail하는지 검증.
