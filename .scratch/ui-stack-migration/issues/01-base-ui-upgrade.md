# 01 — Base UI를 @base-ui/react 1.6으로 승격

**What to build:** `@base-ui-components/react@1.0.0-rc.0`을 정식 패키지 `@base-ui/react@1.6.0`으로 올린다. 팝업·탭 앱의 동작과 모양은 그대로여야 한다.

**Status:** done

- [x] 패키지 교체 + `src`의 13개 서브패스 import 경로 갱신(select, menu, field, checkbox, input, switch, toggle, toggle-group, dialog, tooltip, toast, scroll-area, autocomplete)
- [x] 전 게이트 green — tsc 0 · vitest 200/200 · build · bundle-gate PASS · **smoke 105/105** · ui-diag(가로 오버플로 0, 시작 지표 PASS)

## 관측

**코드 수정이 import 경로 변경뿐이었다.** rc.0(2025-12-04)과 1.0.0(2025-12-11) 사이에 문서화된 breaking change는 패키지 rename 하나이고, 그 뒤 1.6까지의 마이너에서도 이 저장소가 쓰는 13개 컴포넌트의 API가 바뀌지 않았다. 타입체크가 한 번에 통과했고 스모크 105개가 전부 그대로 지나갔다.

`date-fns` 계열이 peerDependencies에 새로 보이지만 전부 `optional: true`다(Calendar 등 새 컴포넌트용). 설치하지 않았고 번들 영향도 없다.

## 측정치

번들 즉시 합계 **519.1 → 527.0KB (+7.9KB)**. 이 시점 한도는 143KB였고 여유가 9.9 → 2.0KB로 줄었다. 이어지는 티켓 02가 이 여유를 다 쓰고 재트리아지로 넘어간다 — 수치 정본은 02다.

시작 지표는 회귀 없음(first paint 80.0ms, 기준선 64.0ms 대비 변동 폭 안).
