# wide-ui-redesign — 릴리스 검증 증거

이 문서는 릴리스 게이트가 읽는 커밋된 검증 증거다. 아래 SHA/tree에서 **실제로 실행한** 명령과
그 결과만 적는다. 실행하지 않은 것은 "덮지 않는 것"에 명시한다.

Verified-SHA: aaeebc828d006792eea5d140e7ddbd56087f4bc7
Verified-Tree: de2c754273ad5edeead9f350863d83610e52e94f
Branch: feat/wide-ui-redesign (base `main`, 110 commits)
Verified-At: 2026-07-28T10:06Z

## 실행한 명령과 결과

전체 스위트 — `.scratch/wide-ui-redesign/loop.md`의 `suite`와 글자 그대로 같다:

```
bun run build && bun run test && bun run smoke
```

| 단계 | 결과 |
|---|---|
| `bun run build` (wxt build) | 성공 — `.output/chrome-mv3`, 602 ms |
| `bun run test` (vitest run) | **390 passed / 390**, 33 test files |
| `bun run smoke` (scripts/smoke.mjs) | **129 passed / 129** |
| 종료 코드 | **0** (289 s) |

타입체크 — `loop.md`의 `typecheck`:

```
bun run check          # tsc --noEmit
```

종료 코드 **0**, 진단 없음.

원본 출력:

- `.scratch/wide-ui-redesign/evidence/release-verification3-suite.txt`
- `.scratch/wide-ui-redesign/evidence/release-verification3-typecheck.txt`

(두 파일은 gitignore 대상인 `.scratch/`에 있다 — 위 표가 커밋되는 요약본이다. 첫 줄에
`HEAD at run start: aaeebc82…`가 박혀 있어 실행 시점의 SHA가 위 `Verified-SHA`와 같음을
파일 자신이 증언한다.)

**이전 판(`0fbaef3`, 372/372 · smoke 128/128)은 stale이 되어 폐기했다** — 그 뒤 `ede178c`와
`e55fa19`가 코드를 움직였다. 수치가 372→390, 128→129로 오른 것은 티켓 15가 더한 회귀
테스트들이다(자세히는 아래).

## 스모크가 실제로 무엇을 구동하는가

`scripts/smoke.mjs`는 Playwright로 **빌드 산출물을 실제 Chromium에 로드한다** —
`chromium.launchPersistentContext('', { channel: 'chromium', … })`(`:13` `:182-183`)로 브라우저를
띄우고 `.output/chrome-mv3`(`:19`)를 확장으로 적재한 뒤, 진짜 `chrome-extension://<id>/popup.html`
(`:222`)을 열어 구동한다. 단언들은 실제 `chrome.storage.local`, `chrome.declarativeNetRequest`
(세션 규칙), `chrome.action` 배지 같은 **진짜 확장 API**를 통과한다. 렌더된 박스 크기를 재는
단언(N41f)도 실제 레이아웃 위에서 잰다.

이 문단은 릴리스 게이트 r1의 defer 행 **R-6**("커밋된 검증 증거가 UI 릴리스 위험을 검사하지
않는다", medium)이 지목한 자리에서 쓰였다. R-6이 옳았고, 그 이유는 증거가 약해서가 아니라
**증거를 설명하는 문서가 자기 스위트를 과소 기술했기** 때문이었다.

## 이 증거가 덮는 범위

- 티켓 **06–15** 열 개는 이 루프가 구현·리뷰·클로즈했고, 각각 신선한 서브에이전트의 독립
  기준 감사(`ticket.criteria result=pass`)와 적용 후 그린 스위트 기록을 갖는다. 그중 셋은
  한 번에 통과하지 않았고 그 사실을 지우지 않는다 — 티켓 **14**는 1차 감사 10/12 `fail` 후
  픽스를 거쳐 12/12 `pass`, 티켓 **13**은 픽스 2건 적용 후 전체 범위로 **재감사**해
  8 met / 1 not-verifiable / 0 not-met `pass`, 티켓 **15**는 감사는 1차 통과했으나
  `/code-review`가 블로킹 결함 1건(R-11)을 잡아 픽스 후 종결했다.
- 티켓 **01–05**는 이 루프가 시작되기 전에 이미 닫혀 있었다(최초 `loop.start`가
  `tickets_open=5`). 이 루프의 저널에 `ticket.start`도 `ticket.criteria`도 없고, `main..HEAD`의
  어떤 커밋도 `Conductor-Ticket: 01`–`05` 트레일러를 달고 있지 않다(트레일러가 붙은 티켓은
  06–15뿐이다). 위 스위트 결과는 그 다섯 티켓의 코드까지 포함한 브랜치 전체에서 나온 것이지만,
  **기준 감사는 06–15만 덮는다.** 01–05의 인수 기준 충족 여부는 이 문서가 주장하지 않는다.
- 릴리스 게이트 **r1의 accept 3행**은 게이트 픽스 커밋으로 적용됐고 각각 적용 후 스위트
  green이다 — R-1 `5486f30`, R-2 `a711d57`, R-3 `4e4d024`.
- 릴리스 게이트 **r1의 R-4**(spec fidelity, user story 3건 미배선)는 게이트 픽스 한도에 들어가지
  않아 사람의 결정으로 티켓 **11·12·13**으로 분해됐고, 세 티켓 모두 닫혔다.

### 릴리스 게이트 r2의 처분 — 이 판이 이전 판과 갈리는 지점

릴리스 게이트 **r2**는 `ok:true` / `needs-attention`으로 **critical 3건**을 돌려줬고, `AT-1`
Phase A가 **`guard:zero-accepts`** 로 라운드를 세웠다. 라운드 2는 종단 라운드라 accept가
불가능했고(검증할 라운드 3이 없으므로 픽스가 아무도 보지 않은 채 나간다), **적용된 행은 0,
`gate_commits` 0, `ledger_shas` 0이다.** `decisions.md`의 `### release r2 — auto-triage`에
`_ROUND NOT APPLIED_` 줄이 **그대로 남아 있고, 그것은 사실이다** — 그 세 행은 적용된 적이 없고
앞으로도 적용하지 않는다.

세 critical의 처분은 행 적용이 아니라 **티켓 15**다(사람의 결정, `decisions.md`의
`### 인간 결정 — 릴리스 r2 critical 3건 처분 2026-07-28T08:1xZ`):

| r2 finding | 무엇이었나 | 티켓 15에서 |
|---|---|---|
| **R-1** `url-scope.ts:109` | r1의 R-2 픽스(`a711d57`)가 불완전 — 그룹 안쪽에 있는 넓은 대안을 못 잡아 파괴적 Block이 첫 저장에 켜진다 | 문맥 분배 전개로 고침. 회귀 테스트 `url-scope.test.ts:129`가 `37b3c49`에서 **빨갛다** |
| **R-2** `stateStore.ts:42` | r1의 R-3 픽스(`4e4d024`)가 마이그레이션 스냅샷을 커맨드 실행기의 FIFO 밖에서 써서 새 쓰기 경합을 만들었다 | 어댑터 시임에 CAS. 회귀 테스트 `stateStore.test.ts:109`가 `37b3c49`에서 **빨갛다** |
| **R-3** `backupStore.ts:116` | 삭제가 매니페스트 전체를 자동백업과 직렬화 없이 교체 — 게다가 스모크 N43이 그 경합을 회피하도록 쓰여 있었다 | **Tier 2**: 삭제를 서비스워커로 옮겨 `bk:manifest` 단일 writer. 회귀 테스트 `backupStore.test.ts:126`이 `37b3c49`에서 **빨갛다**. N43 주석도 정정 |

**셋 다 `37b3c49`에서 실패하는 테스트를 갖는다**는 것을 독립 기준 감사자가 위치까지 지목해
확인했다. 이것이 이 티켓의 핵심 요건이었다 — r2가 문제 삼은 것이 "스모크 N43이 프로덕션 경합을
피해 가도록 쓰여 있다"였으므로, HEAD에서 실패하는 테스트 없이 나가는 픽스는 같은 실패 형태를
재생산했을 것이다.

티켓 15의 `/code-review`는 소견 12건을 냈고 `CR-1`로 accept 1 · defer 11로 처분됐다. accept
**R-11**은 기준 C-3이 명문 요구한 "재개는 무조건 다시 예약한다"가 중단 깊이 해제에서 떨어지는
결함이었고 `e55fa19`로 적용됐다(2파일/76줄, 적용 후 스위트 green). **이 12행은 기록됐을 뿐
검증되지 않았다** — `verify-ledger`는 `### <kind> r<n>` 게이트 섹션만 재도출하고
`/code-review`에는 재도출할 아티팩트가 없다.

## 이 증거가 덮지 않는 것

**아래는 실행되지 않았다. 스위트가 green이라는 사실이 이 항목들에 대해 말해 주는 것은 없다.**

1. **시각 회귀(visual regression)가 없다.** 이 브랜치는 넓은 UI 재디자인인데, 스크린샷 비교나
   픽셀 디프는 전혀 돌지 않는다. 색·간격·다크 모드 렌더링은 스모크가 **특정 계산값을 이름 들어
   고정한 자리에서만** 검사된다(예: N34/N34b의 팔레트 격리, N41c의 스와치, N41f의 렌더 박스).
   그 밖의 시각적 회귀는 이 증거로 잡히지 않는다.
2. **브라우저 매트릭스가 없다.** Playwright의 `channel: 'chromium'` 하나뿐이고 Chrome stable,
   Edge, Brave 등 실제 배포 대상 채널에서는 아무것도 돌지 않았다.
3. **사람의 수동 확인이 없다.** 실제 브라우저 세션에서의 육안 검수는 이 증거에 포함되지 않는다.
4. **성능 수치는 판정 불가 상태다.** `scripts/ui-diag.mjs`는 `loop.md`의 `test_globs`에 있으나
   **스위트 명령에는 들어 있지 않다** — 위 exit 0은 그것을 돌린 결과가 아니다. 마지막으로 관측된
   first-paint는 276 ms로 기준선 64 ms를 넘겼는데, `docs/reviews/ui-polish/perf-baseline.md`가
   기기가 바뀌면 **재기준선을 뜨라고 처방**하고(기준선 darwin/arm64, 현재 x86_64) 아무도 뜨지
   않았다. 따라서 그 수치는 *설명된* 것이 아니라 *판정 불가*다. `followups.md`의 **T13-R-7**로
   열려 있다.
5. **자동 접근성 감사가 없다.** 접근 가능한 이름과 가시 텍스트·형태 채널은 티켓이 요구한
   자리에서 단언된다(N14, N41c/N41e/N41f). 그러나 axe류의 전면 a11y 스윕은 돌지 않았다.
6. **티켓 15의 C-8 정착 대기 실측에 아티팩트가 없다.** 기준은 삭제 왕복이 늘어난 만큼
   `smoke.mjs`의 정착 대기 `8000`이 충분한지 실측하라고 했고, 구현자는 실측 후 값을 그대로
   뒀다고 보고했으나 그 측정 자체는 diff에 흔적이 없다. 반대 방향 증거로 스모크가 서로 독립된
   두 실행에서 129/129로 통과했음을 기록한다. `followups.md`의 **T15-R-8**로 열려 있다.
7. **이월된 후속 항목들은 고쳐지지 않았다.** `docs/reviews/wide-ui-redesign/followups.md`에
   릴리스 r1의 defer 2건(R-5·R-6)과 티켓 단위 `CR-1` defer 다수 — 티켓 15만 11건 — 이 근거와
   함께 열려 있다.
