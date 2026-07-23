# ui-polish — 검증 증거 (Stage 5)

이 파일은 릴리스 게이트가 감사하는 증거다. 아래 실행은 전부 **아래 못박은 SHA에서, 이 문서를
쓰기 직전에 새로** 돌린 것이며, 이전 티켓 세션의 실행을 옮겨 적은 것이 아니다.

**이 문서는 릴리스 게이트 r1의 R-1 반영 뒤에 갱신됐다.** 첫 판은 `d2d751a`를 못박았는데,
R-1 수정 커밋이 붙으면서 그 증거가 무효가 됐다 — 전 스위트를 다시 돌려 새 트리로 바꿨다.

## 못박은 지점

| 항목 | 값 |
|---|---|
| Verified SHA | `386fc808e6f729b5506601ea92910a3a660ff7dc` |
| Verified tree | `725bce8438b6a1545580834dafcb9754518dcc80` |
| 브랜치 / base | `feature/ui-polish` / `main` = `6a0495f` |
| 워킹 트리 | 클린 (`git status --porcelain` 0줄) |
| 실행 기기 | `darwin/arm64 · Apple M5 Pro · 48GB` |
| 도구 | node v24.14.1 · bun 1.3.11 · vitest 4.1.10 |

이 문서 자체의 커밋은 위 SHA **다음**에 온다. 검증 대상은 `386fc80`의 트리이고, 이후 추가되는
것은 이 문서와 게이트 아티팩트뿐이다. 그 외 어떤 커밋이 붙어도 이 증거는 무효가 되며, 그때는
스위트를 다시 돌려 이 파일을 갱신해야 한다.

## 전 스위트 실행 결과

7단계 전부 **exit 0**. 실행 순서는 아래 표 그대로다(빌드 산출물이 있어야 smoke·ui-diag가 돈다).

| # | 명령 | exit | 결과 (출력 발췌) |
|---|---|---|---|
| 1 | `bun run check` | 0 | `tsc --noEmit` 에러 0 (출력 없음) |
| 2 | `bun run test` | 0 | `Test Files 24 passed (24)` / `Tests 203 passed (203)` |
| 3 | `bun run build` | 0 | `✔ Built extension` / `Σ Total size: 713.27 kB` |
| 4 | `bun run bundle-gate` | 0 | `popup 즉시 로드 합계 527.5KB = baseline 386KB + 141.5KB (한도 +143KB) — PASS` |
| 5 | `bun run smoke` | 0 | `101/101 passed` (FAIL 0줄) |
| 6 | `bun run storybook:build` | 0 | `Storybook build completed successfully` |
| 7 | `node scripts/ui-diag.mjs` | 0 | `overflow=0px, inner-scrollers=0` + 시작 지표 두 항목 PASS |

### 4. 번들 게이트 — 즉시/지연 분할

```
bundle gate: popup 즉시 로드 합계 527.5KB = baseline 386KB + 141.5KB (한도 +143KB) — PASS
  eager   (4): global-*.js 513.2KB, react-*.js 8.2KB, tokens-*.js 5.9KB, popup-*.js 0.2KB
  deferred(4): sortable-profile-list-*.js 44.2KB, motion-*.js 36.4KB, header-name-autocomplete-*.js 26.5KB, app-*.js 0.2KB
```

여유 **1.5KB** (R-1 수정으로 +0.1KB). 한도 +143KB의 경위(+120 → +135 재트리아지, 이후 계량
기준 확대에 따른 재표현)는 `decisions.md`의 `### bundle-gate 재트리아지`와 정본인
`.scratch/ui-polish/issues/02-scroll-area.md`에 있다.

### 7. ui-diag — 팝업 시작 지표

이 SHA에서의 기록 실행:

```
popup startup (표본 5 · 워밍업 1 폐기 · 중앙값)
  first paint  100.0ms  [176, 84, 88, 100, 192]
  dom ready    75.6ms   [150, 59, 58, 76, 164]
  device: darwin/arm64 · Apple M5 Pro · 48GB
  first paint 100.0ms vs 기준선 64.0ms → 상한 214.0ms = max(×1.3, +150ms) — PASS
  dom ready   75.6ms  vs 기준선 36.7ms → 상한 186.7ms = max(×1.3, +150ms) — PASS
shot 6: popup boundary (18 profiles, max-length names) — overflow=0px, inner-scrollers=0
```

두 지표 다 예산 안이지만 기준선(64.0 / 36.7)보다 올라가 있다. **절대값으로 판정하지 않고
교차 A/B로 귀속을 갈랐다** — 아래 참고.

#### 시작 지표 드리프트의 귀속 — 교차 A/B

이 세션 동안 first paint 중앙값이 64.0 → 76.0 → 100.0ms로 밀렸다. 같은 빌드에서 연달아
재실행하니 92.0 · 96.0 · 172.0ms로 나와 **동일 코드의 실행 간 산포가 1.9배**였다. 절대값이
이 상태면 회귀 판정의 근거가 못 되므로, 수정 전 트리(`547ac57`)를 워크트리에 빌드해
**같은 세션에서 번갈아** 쟀다.

| 라운드 | first paint 수정후 / 수정전 | dom ready 수정후 / 수정전 |
|---|---|---|
| 1 | 84.0 / 96.0 | 54.6 / 58.6 |
| 2 | 100.0 / 80.0 | 79.1 / 59.6 |
| 3 | 88.0 / 84.0 | 61.4 / 64.0 |
| 4 | 88.0 / 104.0 | 56.8 / 69.5 |

**부호가 라운드마다 뒤집히고**, 두 빌드 사이의 차이가 같은 빌드의 실행 간 산포보다 작다.
측정 시점 부하 평균은 10.69였다. 결론 — 이 드리프트는 **기기 몫이며 이 브랜치에 귀속되지
않는다.** 기준선을 다시 뜨지 않은 이유는 아래 "덮지 않는 것" 2번에 있다.

## 티켓별 수용 기준 → 증거

티켓 10개 전부 `Status: done`. 각 티켓의 수용 기준이 어느 명령에서 증명되는지의 매핑이다.
마지막 줄은 티켓이 아니라 릴리스 게이트 r1이 낳은 변경이다.

| 티켓 | 핵심 수용 기준 | 증명한 명령 | 증거 |
|---|---|---|---|
| 01 팝업 시작 계측·기준선 | 시작 지표 두 개를 재고 회귀 시 exit 1 / 앱 코드 무변경 | `node scripts/ui-diag.mjs` + `git diff` | 위 시작 지표 블록(두 항목 PASS). `git diff 5520d6e 8618db5 --stat -- src/` **빈 출력** = 계측 티켓이 `src/`를 안 건드렸음 |
| 02 스크롤 영역 통일 | 앱 스타일 스크롤바(다크 포함) / 가로 오버플로 0 / 번들 PASS | `bun run smoke`, `node scripts/ui-diag.mjs`, `bun run bundle-gate` | `N22a` light=`rgb(210,210,215)` dark=`rgb(81,81,84)` thumbs=1 · `N22b` thumbs=0 · `N22c` docScrolls=false · ui-diag `overflow=0px` |
| 03 헤더 이름 자동완성 | 앱 팝업 표면 / 접두 필터·사용자 항목 우선 / 화살표+Enter / Esc는 팝업만 / 지연 로드 | `bun run smoke`, `bun run bundle-gate`, `git diff` | `L2a` combobox=true, custom=`["X-Team-Custom"]` · `L2b` value=`X-Team-Custom` · `L2c` options=0 form=1 · `L2d` aria-expanded=false form=1 · 번들 deferred 목록에 `header-name-autocomplete-*.js 26.5KB` · `git diff main..HEAD -- src/core/autocomplete.ts src/core/autocomplete.test.ts` **빈 출력** |
| 04 버튼 모션 계약 | 누름·호버 spring / reduced-motion에서 **부재** / 감도 대조 | `bun run smoke` | `N21b`(대조) 다섯 표면 전부 hover `matrix(1.02…)` press `matrix(0.951…)` · `N21c` 다섯 표면 전부 `none/none` |
| 05 메뉴 순차 등장·삭제 전환 | 앞 항목이 뒤보다 앞섬 / 라벨 전환 / reduced-motion 즉시 완성 / 기능 회귀 0 | `bun run smoke` | `N23a` sequential=true settled=`[1,1]` reduced=`[1,1]` · `N23b` lively≈0.09 reduced=1 · `N23c` Esc·키보드·선택 정상 |
| 06 저장 중 상태 | 라벨 교체 / 양 버튼 비활성 / 재시도 중복 없음 / 거부 시 초안 유지 / 예외에도 안 갇힘 | `bun run smoke`, `bun run test` | `N24a` label=`Saving…` calls=1/1 rules=1 · `N24b` label 복귀, draft 유지, stored=0 · `N24bb` 예외 후 취소 가능 · `N24c` reduced≈22/29ms vs lively≈216/219ms · i18n parity는 vitest 203/203 |
| 07 셀렉트 폭 고정 | 모든 옵션에서 폭 동일 **+** 라벨 미절단 (en/ko) | `bun run smoke` | `N25` en 폭=136 미절단=true, ko 폭=136 미절단=true, 패턴 좌변=455, 팝업≥앵커=true |
| 08 검증 실패 포커스 | 여섯 경우 전부 첫 누락 입력으로 이동 + 그 자리에서 타이핑 | `bun run smoke` | `N26` 헤더 이름·쿠키 이름·Redirect 패턴·Redirect 치환·CSP(행 없음)·CSP(행 있음) 전부 ok, 오류표시=true |
| 09 아코디언 헤더 트리거 | 세 지점 클릭 토글 / 내부 focusable 0 / aria-expanded 추종 / 아이콘 회전 | `bun run smoke` | `N27` 제목:true 여백:false 아이콘:true (토글 교대), 내부 focusable=0, 높이=24px, 회전 `none→180deg`, 백업 패널도 동일 셸 |
| 10 레일 아이콘 툴팁 | 호버·포커스·Tab 툴팁 (en/ko) / 클릭 대상 유지 / 선택 표시 유지 | `bun run smoke` | `N28` 아이콘 6개 전부 ok, `32x28/icon16`, Tab 툴팁=true, 선택 배경 `rgba(0,0,0,0) → rgb(245,245,247)` (pressed=true) |
| **게이트 R-1** | 지연 교체가 포커스를 뺏지 않음 / 정상 교체에서 포커스를 잃지도 않음 / 실패 경로 계약 | `bun run smoke` | `L2e` 폴백 창=true 교체됨=true Value 포커스 유지=true · `L2f` 헤더 이름 포커스=true · `L2g` 폴백 datalist=true 저장=`X-Fallback-Works` 재개봉 role=null **요청누계=1** 새 문서 회복=true |

스펙의 Testing Decisions가 지목한 시임은 넷이고 전부 위에서 실행됐다 — smoke(주 시임),
vitest(core `suggestHeaderNames` 회귀 방지), ui-diag(오버플로 + 시작 지표), bundle-gate,
그리고 렌더 게이트로서 storybook build. **신규 시임은 만들지 않았다**(스펙 결정 그대로).
R-1이 추가한 세 시나리오도 기존 smoke 안이고, 프로덕션 코드에 테스트 훅은 없다 — 청크
요청을 Playwright 라우트로 가로챈다.

## 음성 대조 — 이번 세션에서 확인한 것

이번에 추가한 세 단언은 **되돌리면 실제로 FAIL하는 것까지 확인했다.**

| 단언 | 퇴화 조작 | 관측 |
|---|---|---|
| `L2e` 지연 교체가 포커스를 안 뺏음 | 가드 없는 수정 전 코드 | 교체 후 `activeElement`가 헤더 이름 combobox로 이동 — **FAIL** |
| `L2f` 정상 교체에서 포커스 유지 | 교체 시 `autoFocus`를 무조건 끔(예전에 되돌린 가드) | 교체 후 `activeElement`가 **BODY** — **FAIL** |
| `L2g` 실패 경로 계약 | 청크를 막지 않음 | `role=combobox`, datalist 없음 — **FAIL** |

`L2e`와 `L2f`는 서로 반대 방향의 퇴화를 막는다 — 한쪽만 있으면 반대쪽으로 퇴화한다.

## 재현 절차

```bash
git checkout 386fc80
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

1. **티켓 01~10 단언의 음성 대조는 이번 실행에서 재확인하지 않았다.** 모션·스크롤바·절단·
   포커스 검사는 "구현을 되돌리면 FAIL한다"를 각 티켓 구현 시점에 확인했고 그 기록은 해당
   티켓 파일에 있다(예: 04의 "모션을 없애 보니 N21b는 통과하고 N21c만 FAIL", 10의
   `size="md"` 제거 시 `24x24/icon14`로 FAIL). 이번 Stage 5 실행은 그 단언들에 대해
   **양성 통과만** 재확인했다. 위 "음성 대조" 표는 R-1이 추가한 세 건에만 해당한다. 다만
   `N21b`(감도 대조)와 `N22b`는 대조 자체가 스위트에 상주해 매 실행마다 함께 돈다.
2. **시작 지표의 절대값은 이 세션에서 신뢰 구간이 넓다.** 부하 평균 10.69에서 같은 빌드가
   92~172ms로 흔들렸다. 그래서 교차 A/B로 귀속만 갈랐고(위), 기준선은 다시 뜨지 않았다 —
   다시 뜨면 이 피처가 시작 시간에 준 영향을 잴 기준이 사라진다. 조용한 기기에서 재측정하면
   절대값은 달라질 수 있으나, **A/B의 결론(두 빌드 차이 없음)은 그와 무관하다.**
3. **번들 여유가 1.5KB뿐이다.** 다음 피처가 즉시 청크를 조금만 늘려도 한도에 닿는다.
4. **매치 방식 외 세 셀렉트의 미절단은 단언하지 않는다.** 스펙이 범위를 매치 방식으로 잡았고
   실측 여유가 넉넉해서다(티켓 07).
5. **청크 실패 시 같은 문서 안에서의 회복은 구현하지 않았다** — 브라우저 모듈 맵이 실패한
   fetch를 캐시해 재요청 자체가 불가능하기 때문이다(L2g가 요청 누계 1로 고정). 트리아지
   경위는 `decisions.md`의 `### release r1`에 있다.
6. **smoke·ui-diag는 실 브라우저 기반이라 이 기기에서만 돌았다.** CI 실행은 없다.
