# 02 — 칩·패널 프리미티브 — ToggleGroup·Collapsible + 칩 호버 버그 해소

**What to build:** 리소스 종류·메서드 다중 선택 칩이 Base UI Toggle/ToggleGroup 기반이 되고, 캡션과 컨트롤 그룹을 분리해 "엉뚱한 영역 호버에 첫 칩이 반응"하는 라벨 호버 전파 버그를 구조에서 제거한다. 백업·환경설정 패널은 Base UI Collapsible로 교체되어 열림/닫힘 동작이 동일하게 유지된다 (ADR 0011).

**Blocked by:** None — can start immediately.

**Status:** done

- [x] 칩 그룹이 ToggleGroup 기반 — 캡션 영역 호버 시 첫 칩이 반응하지 않고, 올린 칩만 반응 (smoke N16)
- [x] 다중 선택 토글·aria-pressed 시맨틱과 저장 결과가 기존과 동일 — 2칩 동시 저장·해제 반영 포함 (smoke N16)
- [x] 백업·환경설정 패널이 Collapsible로 열림/닫힘 동작 동일 — banner는 Panel 밖 유지 (smoke I2/L2/N9 green)
- [x] 전 게이트 green — tsc 0 · vitest 192 · build · smoke 67/67 ×4 · storybook · diag

## 리뷰 반영 (2축)

- 수정: chip.tsx → chip-group.tsx 리네임(파일명=컴포넌트 관례), tokens.ts accentBg 소비자 목록 정정(+data 수식어 인라인 표기 사유 문서화), 칩 캡션 행 중복 → chipField 헬퍼 흡수, N16에 다중 선택·해제 검증 확장(Spec 축 커버리지 갭).
- 확인: data-[pressed] 인라인 accent는 ToggleSwitch 선례와 일치(위반 아님), Collapsible keepMounted 기본값이 기존 `{open && children}`과 동일 의미론, ToggleGroup push/splice가 구 toggleItem과 저장 순서 동일.
