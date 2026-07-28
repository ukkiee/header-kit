# wide-ui-redesign — 릴리스 검증 증거

이 문서는 릴리스 게이트가 읽는 커밋된 검증 증거다. 아래 SHA/tree에서 **실제로 실행한** 명령과
그 결과만 적는다. 실행하지 않은 것은 "덮지 않는 것"에 명시한다.

Verified-SHA: 0fbaef3da1508353b64085fb0d2320993ca48098
Verified-Tree: 606530c8416f5704ee62dbc0593ac690bc0a0cf9
Branch: feat/wide-ui-redesign (base `main`, 102 commits)
Verified-At: 2026-07-28T07:34Z

## 실행한 명령과 결과

전체 스위트 — `.scratch/wide-ui-redesign/loop.md`의 `suite`와 글자 그대로 같다:

```
bun run build && bun run test && bun run smoke
```

| 단계 | 결과 |
|---|---|
| `bun run build` (wxt build) | 성공 — `.output/chrome-mv3`, 592 ms |
| `bun run test` (vitest run) | **372 passed / 372**, 33 test files |
| `bun run smoke` (scripts/smoke.mjs) | **128 passed / 128** |
| 종료 코드 | **0** (251 s) |

타입체크 — `loop.md`의 `typecheck`:

```
bun run check          # tsc --noEmit
```

종료 코드 **0**, 진단 없음.

원본 출력:

- `.scratch/wide-ui-redesign/evidence/release-verification2-suite.txt`
- `.scratch/wide-ui-redesign/evidence/release-verification2-typecheck.txt`

(두 파일은 gitignore 대상인 `.scratch/`에 있다 — 위 표가 커밋되는 요약본이다.)

## 스모크가 실제로 무엇을 구동하는가 — 이전 판의 사실 오류 정정

**이전 판(`28f4950`, 2026-07-27T05:33Z)은 "`bun run smoke`는 확장 프로그램을 실제 Chrome에
로드해 돌리는 것이 아니라 스크립트가 구성한 환경에서 돈다"고 적었다. 그 문장은 틀렸고, 이
판에서 삭제한다.**

`scripts/smoke.mjs`는 Playwright로 **빌드 산출물을 실제 Chromium에 로드한다** —
`chromium.launchPersistentContext('', { channel: 'chromium', … })`(`:13` `:182-183`)로 브라우저를
띄우고 `.output/chrome-mv3`(`:19`)를 확장으로 적재한 뒤, 진짜 `chrome-extension://<id>/popup.html`
(`:222`)을 열어 구동한다. 단언들은 실제 `chrome.storage.local`, `chrome.declarativeNetRequest`
(세션 규칙), `chrome.action` 배지 같은 **진짜 확장 API**를 통과한다. 렌더된 박스 크기를 재는
단언(N41f)도 실제 레이아웃 위에서 잰다.

이 정정은 릴리스 게이트 r1의 defer 행 **R-6**("커밋된 검증 증거가 UI 릴리스 위험을 검사하지
않는다", `verification.md:13`, medium)이 지목한 자리다. R-6이 옳았고, 그 이유는 증거가 약해서가
아니라 **증거를 설명하는 문서가 자기 스위트를 과소 기술했기** 때문이었다.

## 이 증거가 덮는 범위

- 티켓 **06–14** 아홉 개는 이 루프가 구현·리뷰·클로즈했고, 각각 신선한 서브에이전트의 독립
  기준 감사(`ticket.criteria result=pass`)와 적용 후 그린 스위트 기록을 갖는다. 그중 둘은
  한 번에 통과하지 않았고 그 사실을 지우지 않는다 — 티켓 **14**는 1차 감사 10/12 `fail` 후
  픽스를 거쳐 12/12 `pass`, 티켓 **13**은 픽스 2건 적용 후 전체 범위로 **재감사**해
  8 met / 1 not-verifiable / 0 not-met `pass`.
- 티켓 **01–05**는 이 루프가 시작되기 전에 이미 닫혀 있었다(최초 `loop.start`가
  `tickets_open=5`). 이 루프의 저널에 `ticket.start`도 `ticket.criteria`도 없고, `main..HEAD`의
  어떤 커밋도 `Conductor-Ticket: 01`–`05` 트레일러를 달고 있지 않다(트레일러가 붙은 티켓은
  06–14뿐이다). 위 스위트 결과는 그 다섯 티켓의 코드까지 포함한 브랜치 전체에서 나온 것이지만,
  **기준 감사는 06–14만 덮는다.** 01–05의 인수 기준 충족 여부는 이 문서가 주장하지 않는다.
- 릴리스 게이트 **r1의 accept 3행**은 게이트 픽스 커밋으로 적용됐고 각각 적용 후 스위트
  green이다 — R-1 `5486f30`, R-2 `a711d57`, R-3 `4e4d024`.
- 릴리스 게이트 **r1의 R-4**(spec fidelity, user story 3건 미배선)는 게이트 픽스 한도에 들어가지
  않아 사람의 결정으로 티켓 **11·12·13**으로 분해됐고, 세 티켓 모두 위 목록에 있는 대로 닫혔다.
  즉 R-4의 처분은 완료됐으며 그 증거는 게이트 픽스 커밋이 아니라 세 티켓의 기준 감사다.

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
6. **이월된 후속 항목들은 고쳐지지 않았다.** `docs/reviews/wide-ui-redesign/followups.md`에
   릴리스 r1의 defer 2건(R-5·R-6)과 티켓 단위 CR-1 defer 다수가 근거와 함께 열려 있다.
