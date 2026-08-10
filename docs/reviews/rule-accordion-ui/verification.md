# 검증 — rule-accordion-ui

`/feature` Stage 5. **커밋 전에 돌리고, 돌린 그대로 적는다.** 릴리스 게이트는 커밋된 내용만
보므로 고정되지 않은 로컬 실행은 증거가 되지 못한다.

## 무엇을 검증했는가

| | |
|---|---|
| 브랜치 | `feat/rule-accordion-ui` |
| 검증한 커밋 | `905baf0ff1408527288afbb863e01c5b01ae7ded` |
| 트리 객체 | `c6629d4f564590786dd44a368357b1baa24ad42e` |
| 워킹 트리 | 티켓 10 `Status:` 한 줄만 수정된 상태 — 이 문서와 함께 커밋되며, 게이트는 그 커밋 위에서 돈다 |
| 빌드 산출물 | `.output/chrome-mv3` — `*.js` 집계 해시 `5589f121ced9c2c6` |
| 기기 | darwin/x86_64 · Intel Core i7-10700K · 96GB · node v24.14.0 · bun 1.3.10 |

빌드가 **결정론적**임을 확인했다 — 같은 소스로 두 번 빌드해 위 집계 해시가 같았다. 그래서 이
문서의 결과는 위 트리 객체에 귀속된다.

## 릴리스 게이트가 보는 범위

`main`이 `7f8e26a`에 있고 그것이 이 브랜치의 merge-base다. 따라서 릴리스 렌즈가 보는 것은
**이 슬러그의 작업 그 자체**이며, 이전 슬러그가 섞여 들어오지 않는다.

```
7f8e26a(main)..HEAD   33 커밋 · 112 파일 · +8,655 / −3,727
```

티켓 10개(01·02·03·04·05·06·07·08·09·10) 전부 done이고, structure 게이트는 첫 티켓(01) 뒤에
r3 `approve`로 면제 없이 닫혔다.

## 돌린 명령과 결과

전부 위 커밋에서, 위 트리로 돌렸다.

| 명령 | 결과 |
|---|---|
| `bun run check` (`tsc --noEmit`) | exit 0 — 오류 0 |
| `bun run test` (`vitest run`) | **34 파일 / 622 테스트 전부 통과** |
| `bun run build` (`wxt build`) | 성공 — Σ 961.45 kB |
| `bun run smoke` (`scripts/smoke.mjs`) | **131/131 통과** |
| `bun run writer-lane-gate` | PASS — `createWriterLane` 1회 · `createStateWriter` 1회 · 허가 노출 4파일(전부 허용) · 산출물 16개 중 워커 밖 15개 검사 |
| `bun run bundle-gate` | PASS — popup 즉시 로드 489.0KB = baseline 386KB + 103.0KB (한도 +190KB) |
| `bun run storybook:build` | 성공 — Vite 2.53s |

번들 게이트의 지연 청크 여섯: `rule-form` 64.2KB · `sortable-profile-list` 44.4KB ·
`motion` 36.4KB · `suggest-autocomplete` 29.5KB · `useAnchoredPopupScrollLock` 21.8KB ·
`app` 0.2KB. 티켓 08이 `header-name-*`를 `suggest-*`로 일반화하며 `MUST_BE_DEFERRED`를
함께 갱신했고, 그 자리가 여기 그대로 서 있다.

## 이 릴리스에서 사라진 것 — 권한

`alarms`·`tabs`가 매니페스트에서 빠졌다. 남은 것은 `declarativeNetRequest`·`storage` 둘과
호스트 권한 `<all_urls>`다. N52가 **이 매니페스트로 실제 브라우저에서** 확인한다 —
`chrome.alarms` API 부재, 그리고 '탭에서 열기'가 여전히 동작함(탭 4→5).

`chrome.tabs.query`는 권한 없이도 함수로 잡히므로 N52는 그 부재를 **단언하지 않고 관측만**
남긴다(`tabs.query 부재=false`). 요구했다면 거짓 실패를 냈을 자리다. 권한 부재의 증거는
매니페스트 단언 쪽이 든다.

## 릴리스 게이트로 넘기는 것 셋 (티켓 10 파일에 기록)

이 셋은 **차단 사유가 아니라 게이트 입력**이다. 티켓이 조용히 고르면 안 되는 판단이라 남겼다.

1. **스크롤바 토큰이 실물과 어긋나 있을 수 있다.** `ui/tokens.ts`의 `scrollbarTrack`·
   `scrollbarThumb`는 소비자가 0인데 그 문서는 `opacity-60` · 호버/스크롤 중 진해짐 ·
   `motion-reduce:transition-none`을 설명한다. 정작 `ui/scroll-area.tsx`는 `transition-colors`
   + `bg-border`를 직접 쓴다. 지우면 어긋남의 증거까지 사라지므로 남겼다.
2. **헤더 이름 이력을 지우는 길이 전체 초기화뿐이다.** 세 이력(헤더·쿠키·UA)이 상한 없이
   자라고 지우는 화면이 없다. 티켓 08이 쿠키·UA에 대해 그 트레이드오프를 명시적으로 받아들였고
   티켓 09에서 헤더가 거기 합류한 것이라 **일관되지만**, 릴리스 전에 되짚을 값이다.
3. **백업 화면의 배너 자리.** 오류·공지 배너가 JSON 카드와 동기화 카드 사이에 서서, 복원
   공지가 그것을 일으킨 히스토리 카드에서 두 칸 떨어진다. 오류는 화면 전체(스냅샷 로드·클라우드
   조회)에서 오므로 히스토리 카드 안으로 옮기는 것도 정답이 아니다 — 자리를 정하는 판단이다.

## 스위트 수 변화 이력 (참고)

단위와 스모크 수가 티켓마다 오르내린 것은 표본이 옮겨 다녔기 때문이다. 특히 티켓 10의
철거에서 단위 641 → 622로 줄었는데, 만료 알람·탭 감시 서브시스템과 그 테스트가 함께
사라졌기 때문이다. 그 과정에서 잃을 뻔한 단언 하나(`규칙을 끄는 것은 활성화 경계가 아니다`)를
리뷰가 잡아 `materialization.test.ts`의 `update-modification` 경로로 복구했고, 돌연변이로
이빨을 확인했다.
