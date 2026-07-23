# ui-polish — 검증 증거 (Stage 5)

이 파일은 릴리스 게이트가 감사하는 증거다. 아래 실행은 전부 **아래 못박은 SHA에서, 이 문서를
쓰기 직전에 새로** 돌린 것이며, 이전 티켓 세션의 실행을 옮겨 적은 것이 아니다.

## 못박은 지점

| 항목 | 값 |
|---|---|
| Verified SHA | `d2d751a607c27c5849f6fada7a2f28196e08ba96` |
| Verified tree | `cc46c6264e9810a03f92bc720fabb1db1fdf0d93` |
| 브랜치 / base | `feature/ui-polish` / `main` = `6a0495f` |
| 워킹 트리 | 클린 (`git status --porcelain` 0줄) |
| 실행 기기 | `darwin/arm64 · Apple M5 Pro · 48GB` |
| 도구 | node v24.14.1 · bun 1.3.11 · vitest 4.1.10 |

이 문서 자체의 커밋은 위 SHA **다음**에 온다. 검증 대상은 `d2d751a`의 트리이고, 이후 추가되는
것은 이 문서와 게이트 아티팩트뿐이다. 그 외 어떤 커밋이 붙어도 이 증거는 무효가 되며, 그때는
스위트를 다시 돌려 이 파일을 갱신해야 한다.

## 전 스위트 실행 결과

7단계 전부 **exit 0**. 실행 순서는 아래 표 그대로다(빌드 산출물이 있어야 smoke·ui-diag가 돈다).

| # | 명령 | exit | 결과 (출력 발췌) |
|---|---|---|---|
| 1 | `bun run check` | 0 | `tsc --noEmit` 에러 0 (출력 없음) |
| 2 | `bun run test` | 0 | `Test Files 24 passed (24)` / `Tests 203 passed (203)` |
| 3 | `bun run build` | 0 | `✔ Built extension in 339 ms` / `Σ Total size: 713.15 kB` |
| 4 | `bun run bundle-gate` | 0 | `popup 즉시 로드 합계 527.4KB = baseline 386KB + 141.4KB (한도 +143KB) — PASS` |
| 5 | `bun run smoke` | 0 | `98/98 passed` (FAIL 0줄) |
| 6 | `bun run storybook:build` | 0 | `Storybook build completed successfully` |
| 7 | `node scripts/ui-diag.mjs` | 0 | `overflow=0px, inner-scrollers=0` + 시작 지표 두 항목 PASS |

### 4. 번들 게이트 — 즉시/지연 분할

```
bundle gate: popup 즉시 로드 합계 527.4KB = baseline 386KB + 141.4KB (한도 +143KB) — PASS
  eager   (4): global-yqdgNG2o.js 513.1KB, react-Ca03aNmg.js 8.2KB, tokens-E3eymE1o.js 5.9KB, popup-Cvmh5Aj6.js 0.2KB
  deferred(4): sortable-profile-list-C3uvnxAB.js 44.2KB, motion-C41l09d_.js 36.4KB, header-name-autocomplete-DIBKxriR.js 26.5KB, app-BKJVlT_g.js 0.2KB
```

여유 **1.6KB**. 한도 +143KB의 경위(+120 → +135 재트리아지, 이후 계량 기준 확대에 따른 재표현)는
`decisions.md`의 `### bundle-gate 재트리아지`와 정본인 `.scratch/ui-polish/issues/02-scroll-area.md`에 있다.

### 7. ui-diag — 팝업 시작 지표

```
popup startup (표본 5 · 워밍업 1 폐기 · 중앙값)
  first paint  76.0ms  [100, 60, 116, 64, 76]
  dom ready    48.9ms  [49, 39, 89, 42, 51]
  device: darwin/arm64 · Apple M5 Pro · 48GB
  first paint 76.0ms vs 기준선 64.0ms → 상한 214.0ms = max(×1.3, +150ms) — PASS
  dom ready   48.9ms vs 기준선 36.7ms → 상한 186.7ms = max(×1.3, +150ms) — PASS
shot 6: popup boundary (18 profiles, max-length names) — overflow=0px, inner-scrollers=0
```

두 지표 다 예산 안이지만 기준선보다 올라가 있고 표본 산포가 크다(first paint 60~116ms). 이
수치의 한계는 아래 "이 증거가 덮지 않는 것"에 적었다.

## 티켓별 수용 기준 → 증거

티켓 10개 전부 `Status: done`. 각 티켓의 수용 기준이 어느 명령에서 증명되는지의 매핑이다.

| 티켓 | 핵심 수용 기준 | 증명한 명령 | 증거 |
|---|---|---|---|
| 01 팝업 시작 계측·기준선 | 시작 지표 두 개를 재고 회귀 시 exit 1 / 앱 코드 무변경 | `node scripts/ui-diag.mjs` + `git diff` | 위 시작 지표 블록(두 항목 PASS). `git diff 5520d6e 8618db5 --stat -- src/` **빈 출력** = 계측 티켓이 `src/`를 안 건드렸음 |
| 02 스크롤 영역 통일 | 앱 스타일 스크롤바(다크 포함) / 가로 오버플로 0 / 번들 PASS | `bun run smoke`, `node scripts/ui-diag.mjs`, `bun run bundle-gate` | `N22a` light=`rgb(210,210,215)` dark=`rgb(81,81,84)` thumbs=1 · `N22b` thumbs=0 · `N22c` docScrolls=false · ui-diag `overflow=0px` |
| 03 헤더 이름 자동완성 | 앱 팝업 표면 / 접두 필터·사용자 항목 우선 / 화살표+Enter / Esc는 팝업만 / 지연 로드 | `bun run smoke`, `bun run bundle-gate`, `git diff` | `L2a` combobox=true, custom=`["X-Team-Custom"]` · `L2b` value=`X-Team-Custom` · `L2c` options=0 form=1 · `L2d` aria-expanded=false form=1 · 번들 deferred 목록에 `header-name-autocomplete-*.js 26.5KB` · `git diff main..HEAD -- src/core/autocomplete.ts src/core/autocomplete.test.ts` **빈 출력** |
| 04 버튼 모션 계약 | 누름·호버 spring / reduced-motion에서 **부재** / 감도 대조 | `bun run smoke` | `N21b`(대조) 다섯 표면 전부 hover `matrix(1.02…)` press `matrix(0.951…)` · `N21c` 다섯 표면 전부 `none/none` |
| 05 메뉴 순차 등장·삭제 전환 | 앞 항목이 뒤보다 앞섬 / 라벨 전환 / reduced-motion 즉시 완성 / 기능 회귀 0 | `bun run smoke` | `N23a` lively=`[0.0728828, 0]` sequential=true settled=`[1,1]` reduced=`[1,1]` · `N23b` lively=0.0902251 reduced=1 · `N23c` Esc·키보드·선택 정상 |
| 06 저장 중 상태 | 라벨 교체 / 양 버튼 비활성 / 재시도 중복 없음 / 거부 시 초안 유지 / 예외에도 안 갇힘 | `bun run smoke`, `bun run test` | `N24a` label=`Saving…` calls=1/1 rules=1 disabled-transform=none · `N24b` label 복귀, draft 유지, stored=0 · `N24bb` 예외 후 취소 가능 · `N24c` reduced=22/29ms vs lively=216/219ms · i18n parity는 vitest 203/203 |
| 07 셀렉트 폭 고정 | 모든 옵션에서 폭 동일 **+** 라벨 미절단 (en/ko) | `bun run smoke` | `N25` en 폭=136 미절단=true, ko 폭=136 미절단=true, 패턴 좌변=455, 팝업≥앵커=true |
| 08 검증 실패 포커스 | 여섯 경우 전부 첫 누락 입력으로 이동 + 그 자리에서 타이핑 | `bun run smoke` | `N26` 헤더 이름·쿠키 이름·Redirect 패턴·Redirect 치환·CSP(행 없음)·CSP(행 있음) 전부 ok, 오류표시=true |
| 09 아코디언 헤더 트리거 | 세 지점 클릭 토글 / 내부 focusable 0 / aria-expanded 추종 / 아이콘 회전 | `bun run smoke` | `N27` 제목:true 여백:false 아이콘:true (토글 교대), 내부 focusable=0, 높이=24px, 회전 `none→180deg`, 백업 패널도 동일 셸 |
| 10 레일 아이콘 툴팁 | 호버·포커스·Tab 툴팁 (en/ko) / 클릭 대상 유지 / 선택 표시 유지 | `bun run smoke` | `N28` 아이콘 6개 전부 ok, `32x28/icon16`, Tab 툴팁=true, 선택 배경 `rgba(0,0,0,0) → rgb(245,245,247)` (pressed=true) |

스펙의 Testing Decisions가 지목한 시임은 넷이고 전부 위에서 실행됐다 — smoke(주 시임),
vitest(core `suggestHeaderNames` 회귀 방지), ui-diag(오버플로 + 시작 지표), bundle-gate,
그리고 렌더 게이트로서 storybook build. **신규 시임은 만들지 않았다**(스펙 결정 그대로).

## 재현 절차

```bash
git checkout d2d751a
bun install
bun run check
bun run test
bun run build
bun run bundle-gate
bun run smoke
bun run storybook:build
node scripts/ui-diag.mjs
```

## 이 증거가 덮지 않는 것

정직하게 남긴다 — 릴리스 게이트가 이 항목들을 발견으로 올리면 재트리아지 대상이다.

1. **부재 단언의 음성 대조는 이번 실행에서 재확인하지 않았다.** 모션·스크롤바·절단·포커스
   검사는 "구현을 되돌리면 FAIL한다"를 각 티켓 구현 시점에 확인했고 그 기록은 해당 티켓
   파일에 있다(예: 04의 "모션을 없애 보니 N21b는 통과하고 N21c만 FAIL", 07의 두 퇴화 경로,
   10의 `size="md"` 제거 시 `24x24/icon14`로 FAIL). 이번 Stage 5 실행은 **양성 통과만**
   재확인한 것이며, 브랜치를 변형해 되돌리는 실험은 하지 않았다. 다만 `N21b`(감도 대조)와
   `N22b`(넘치지 않으면 스크롤바 없음)는 대조 자체가 스위트에 상주하므로 매 실행마다 함께
   돈다.
2. **시작 지표는 기기 의존적이고 이번 실행에서 위로 드리프트했다** — first paint 64.0 →
   76.0ms, dom ready 36.7 → 48.9ms. 둘 다 예산(×1.3 또는 +150ms 중 큰 값) 안이지만 표본
   산포가 크다(60~116ms). 기준선은 변경 전 빌드에서 같은 기기로 떴고 다시 뜨지 않았다 —
   다시 뜨면 이 피처가 시작 시간에 준 영향을 잴 기준이 사라지기 때문이다. 판정 근거는
   절대값이 아니라 직전 빌드와의 A/B이며 티켓별 측정치가 그 흐름을 남긴다.
3. **번들 여유가 1.6KB뿐이다.** 다음 피처가 즉시 청크를 조금만 늘려도 한도에 닿는다.
4. **매치 방식 외 세 셀렉트의 미절단은 단언하지 않는다.** 스펙이 범위를 매치 방식으로 잡았고
   실측 여유가 넉넉해서다(티켓 07).
5. **smoke·ui-diag는 실 브라우저 기반이라 이 기기에서만 돌았다.** CI 실행은 없다.
