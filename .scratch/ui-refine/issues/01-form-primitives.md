# 01 — 폼 프리미티브 Base UI 교체 (Select·Input·Checkbox·Field)

**What to build:** 종류·모드·빈 값·URL 매치 방식 등 모든 셀렉트가 OS 네이티브 팝업 대신 앱 스타일(라이트/다크)의 Base UI Select로 동작한다. 입력·체크박스·필드 셸도 Base UI 프리미티브 기반으로 교체되어, 이후 슬라이스(검증·툴팁·토스트)가 얹힐 단일 컴포넌트 계층이 선다 (ADR 0011). 사용자 흐름(규칙 추가·편집·저장)은 그대로다.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] 폼의 모든 셀렉트(종류/모드/빈 값/매치 방식 등)가 Base UI Select로 동작하고 팝업이 앱 스타일로 렌더 — 선택 결과가 기존과 동일하게 저장 (smoke)
- [x] 입력·체크박스·필드 셸이 Base UI 프리미티브 기반 — 기존 추가/편집/저장 흐름 회귀 없음 (smoke 전체 green)
- [x] 접근성 이름이 en/ko 카탈로그 경유로 유지 (ko 접근성 스모크 green) — 값 입력의 이름은 'Header value'→'Value'로 변경(Field 라벨 승계, 카탈로그 경유 유지)
- [x] 전 게이트 green — tsc 0 · vitest 192 · build · smoke 66/66 ×3 · storybook · diag(overflow 0)

## 리뷰 반영 (2축)

- 수정: 체크박스 표면 fieldSolid/fieldFocus 토큰 재사용, 팝업 표면·항목 popupSurface/popupItem 토큰 추출(Menu와 공유), 필드 캡션 fieldCaption 공유(스코프 행 span), tokens.ts 주석 정정, 불필요 boolean 코어션 제거.
- 기각: transfer-panel의 label 래핑 — 단일 컨트롤이라 호버 전파 문제 없음. 스토리 더미 args — Storybook 타입 요구.
- 이관: 칩 그룹의 Field 연결 부재 → 티켓 02(ToggleGroup 교체)가 해소.
