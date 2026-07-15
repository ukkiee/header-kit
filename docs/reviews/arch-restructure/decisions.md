# Review Decisions — arch-restructure

### design r1
R-1 accept — "Slice 1 points Storybook at a stylesheet not moved until slice 7" (HIGH). Fixed in design.md: App/css wiring made incremental — slice 1 keeps preview.ts → `src/entrypoints/popup/style.css` and both main.tsx keep relative imports; only slice 7 hoists to `src/app/styles/global.css` and retargets to `@/app/*`. configChanges 표를 "최종 상태 + 슬라이스1 잠정/슬라이스7 확정"으로 명시. 목표 아키텍처 불변.
R-2 defer — "Design declares thin entrypoints but leaves background orchestration there" (MEDIUM). 과장 문구 정정: entrypoints는 popup/app 얇은 마운트 + background 컴포지션 루트(엔트리 경계에 정당히 위치)로 서술 변경. 부트스트랩 추출은 behavior-adjacent이므로 이번 behavior-preserving 패스 밖 — 명명된 후속 슬라이스 9로 이연(schema 분리·CompileWarning 추출·FilterRow와 동급 seam).

### design r2
PASS — verdict `approve`, 발견 0건. R-1 수정(증분 App/css 배선) 재검증 완료, R-2는 이연대로 재제기 없음. 설계 게이트 통과 → 이슈 발행 진행.

### code-review 04~06 (DS 체인, since ae5fb6f)
Standards/Spec 2축. 대부분 수용·수정(commit aa263f2): Select ghost 포커스 outline·Card as·Pill 톤별 text·tokens 문서. forwardRef는 폼 프리미티브 관용으로 reject(유지).
DEFER — PanelSection이 티켓 05의 controlled CollapsiblePanel(open/onOpenChange 흡수)보다 축소됨. 3패널 게이팅 모델이 달라(show/hide vs mode) 셸만 흡수하는 PanelSection으로 구현, open은 호출자 소유. Standards축이 명명 승인. Backup·Prefs의 show/hide 토글 중복 흡수(controlled 판)는 선택적 후속으로 이연 — 필요 시 별도 슬라이스.
