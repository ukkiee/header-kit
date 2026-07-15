# Review Decisions — arch-restructure

### design r1
R-1 accept — "Slice 1 points Storybook at a stylesheet not moved until slice 7" (HIGH). Fixed in design.md: App/css wiring made incremental — slice 1 keeps preview.ts → `src/entrypoints/popup/style.css` and both main.tsx keep relative imports; only slice 7 hoists to `src/app/styles/global.css` and retargets to `@/app/*`. configChanges 표를 "최종 상태 + 슬라이스1 잠정/슬라이스7 확정"으로 명시. 목표 아키텍처 불변.
R-2 defer — "Design declares thin entrypoints but leaves background orchestration there" (MEDIUM). 과장 문구 정정: entrypoints는 popup/app 얇은 마운트 + background 컴포지션 루트(엔트리 경계에 정당히 위치)로 서술 변경. 부트스트랩 추출은 behavior-adjacent이므로 이번 behavior-preserving 패스 밖 — 명명된 후속 슬라이스 9로 이연(schema 분리·CompileWarning 추출·FilterRow와 동급 seam).

### design r2
PASS — verdict `approve`, 발견 0건. R-1 수정(증분 App/css 배선) 재검증 완료, R-2는 이연대로 재제기 없음. 설계 게이트 통과 → 이슈 발행 진행.
