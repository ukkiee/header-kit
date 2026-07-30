# 검증 — scope-race-hardening

`/feature` Stage 5. **커밋 전에 돌리고, 돌린 그대로 적는다.** 릴리스 게이트는 커밋된 내용만
보므로 고정되지 않은 로컬 실행은 증거가 되지 못한다.

## 무엇을 검증했는가

| | |
|---|---|
| 브랜치 | `feat/wide-ui-redesign` |
| 검증한 커밋 | `22d52dc8fec3bb5d627491ed143db5b631e12c5a` |
| 트리 객체 | `a1b888f19d7825dcb9d189365ce9bd73973988ed` |
| 워킹 트리 | clean (`git status --porcelain` 무출력) |
| 빌드 산출물 | `.output/chrome-mv3` — `*.js` 집계 해시 `0e58e5036d3d90e9` |
| 기기 | darwin/x64 · Intel Core i7-10700K · 96GB |

빌드가 **결정론적**임을 확인했다 — 같은 소스로 두 번 빌드해 위 집계 해시가 같았다. 그래서 이
문서의 결과는 위 트리 객체에 귀속된다.

## 릴리스 게이트가 보는 범위

Stage 0 결정으로 이 슬러그는 브랜치를 분기하지 않았고 게이트 베이스를 기본값(`main`)으로 두었다.
따라서 릴리스 렌즈가 보는 것은 이 슬러그의 14 커밋이 아니라 **`main`..HEAD 전체**다.

```
d142ec3(main)..HEAD   129 커밋 · 130 파일 · +16,602 / −6,858
  그중 scope-race-hardening   14 커밋 (1b7ddd8~1..HEAD)
  나머지 115 커밋             wide-ui-redesign (2026-07-28 사람 결정으로 정지된 슬러그)
```

**이 게이트는 사실상 `wide-ui-redesign`의 릴리스 라운드 4를 겸한다.** 사용자가 그 대가를 알고
고른 구성이고, 근거는 `.scratch/scope-race-hardening/conductor.md`의 Stage 0 결정에 있다.
아래 스위트는 `main`..HEAD 전체 코드에 대해 도는 것이지 이 슬러그의 diff에만 도는 것이 아니다.

## 돌린 명령과 결과

전부 위 커밋에서, 워킹 트리 clean 상태로 돌렸다.

| 명령 | 결과 |
|---|---|
| `bun run check` (`tsc --noEmit`) | **통과** — 무출력, exit 0 |
| `bun run test` (`vitest run`) | **432/432 통과** · 테스트 파일 33/33 · 8.06s |
| `bun run build` (`wxt build`) | **통과** — Σ 978.3 kB, 746ms |
| `bun run smoke` (`node scripts/smoke.mjs`) | **131/131 통과** |
| `bun run writer-lane-gate` | **PASS** — `createWriterLane` 1회 · `createStateWriter` 1회 · 허가 노출 4파일(전부 허용) · 산출물 16개 중 워커 밖 15개 검사 |
| `bun run bundle-gate` | **PASS** — popup 즉시 로드 531.7KB = baseline 386KB + 145.7KB (한도 +190KB), 여유 44.3KB |
| `node scripts/audit-smoke-barriers.mjs` | **OK** — 11 barriers verified |

`bundle-gate`의 즉시/지연 분해:

```
eager   (7): global 332.9KB · useOpenInteractionType 112.6KB · i18n-context 29.9KB ·
             is-svg-component 29.9KB · useValueChanged 18.0KB · react 8.2KB · popup 0.2KB
deferred(6): rule-form 59.9KB · sortable-profile-list 44.4KB · motion 36.4KB ·
             header-name-autocomplete 29.5KB · resolveAriaLabelledBy 1.9KB · app 0.2KB
```

**번들 게이트는 이 슬러그에서 처음 통과했다.** 티켓 01~06 동안 계속 FAIL이었고(선재 초과
14.8KB) 티켓 07이 한도를 올리지 않고 규칙 폼을 지연 청크로 옮겨 통과시켰다.

## 이 슬러그가 닫은 것

`wide-ui-redesign` 릴리스 게이트 r3가 남긴 critical 셋 + 플랜 게이트가 새로 찾은 하나.

| | 결함 | 닫은 티켓 |
|---|---|---|
| R-1 | Scope Breadth가 경로에 놓인 도메인꼴 조각을 호스트로 세어, 모든 사이트에 걸리는 Block이 확인 없이 저장됐다 | 05 |
| R-2 | Schema Version 마이그레이션 커밋과 사용자 편집이 겹쳐 편집이 유실됐다 | 01 |
| R-3 | 백업 네임스페이스 writer가 두 실행 컨텍스트에 서서, 겹친 삭제가 목록에는 있고 데이터는 없는 행을 만들었다 | 02·03 |
| (신규) | 축출 사전 정리가 매니페스트 교체보다 먼저 일어나 멀쩡한 백업이 '손상됨'으로 보였다 | 04 |

배선 확인(06)과 번들 처분(07)이 뒤따랐다.

## 검증이 덮지 못하는 것 — 알고 남긴 한계

이 목록은 릴리스 렌즈가 스스로 찾기 전에 먼저 적는다.

- **첫 페인트 지표.** 전용 기준선(`docs/reviews/ui-polish/perf-baseline.md`)이 **다른 기기**
  (arm64 Apple M5 Pro)에서 떠 있어 이 기기(x86_64)에서는 판정에 쓸 수 없다 — 그 문서 스스로
  "다른 기기에서 뜬 기준선으로 판정하면 통과도 실패도 의미가 없다"고 적는다. 티켓 07이 즉시
  집합을 59KB 줄였으므로 기준선을 다시 뜨기 좋은 시점이지만 이 슬러그의 일이 아니다. 이월.
- **지연 청크 로드 실패의 저하 경로.** 규칙 폼 청크가 실패하면 폼 자리에 빈 상자가 남는다.
  막다른 길은 아니고(레일·프로필 전환이 `ProfileSection`을 리마운트해 목록이 돌아온다 — 리뷰가
  청크를 abort하고 실측 확인) 그 사실을 모듈 주석에 적었지만, 선례(`header-name-input.tsx` +
  스모크 `L2g`)가 요구하는 **보이는 출구와 계약 테스트**는 없다. 이월.
- **Scope Breadth의 앵커 없는 부분 문자열.** `contains: ads.example.com/path`는 여전히 `narrow`다.
  이 판정이 증명하는 것은 패턴 문자열 안에서의 위치이지 실제 URL 안에서의 위치가 아니다. 플랜
  게이트 r1이 R-4로 제기했고 **사람이 reject**했다 — 어느 형태로 조여도 기존 9행이 뒤집히고
  그중 셋이 `contains`인데 ADR 0008이 폼 기본값을 `contains`로 정했으므로 확인이 상시가 되어
  가드레일이 죽는다. 근거는 스펙 D1과 `decisions.md`의 `### plan r1`.
- **`StoredState` 리비전 카운터(일반 CAS).** 스키마 범프를 부르고, 상태의 두 writer가 같은
  실행 컨텍스트에 살아 지금은 필요하지 않다. 스펙 Out of Scope에 근거가 있다.
- **스모크는 동시성을 두 시나리오에서만 본다** — N43(단일 삭제 확인 흐름)과 N44(겹친 삭제).
  인터리빙 소진은 단위 시임 S3(`src/runtime/service-worker.integration.test.ts`)가 맡는다.

## 이 증거의 성질

각 티켓이 **변이로 red를 보인 기록**을 저널에 남겼다 — "고쳤다"는 주장 대신 "그 가드를 걷어내면
어느 테스트가 빨개지는가"를 적는다. 이 슬러그에서 "닫혔다"가 **네 번 거짓**이었기 때문에 생긴
규율이고(티켓 01의 세 번 + 티켓 05의 회귀), 대표적인 것 둘:

- 티켓 07의 N44 대응: `mutateBackup`이 Writer Lane을 우회하도록 임시 변이 → **N44만 FAIL
  (130/131), N43은 통과**. 겨눈 시나리오만 정확히 빨개졌다.
- 티켓 05: 스킴 구분자·종결 문자·리터럴 독법 세 가드를 각각 걷어내는 변이 넷이 각각 4·3·4·3건을
  red로 만들었다.
