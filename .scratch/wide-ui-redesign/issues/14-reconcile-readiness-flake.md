# 14 — 스위트 red 정지 해소 (마이그레이션 커밋 위치 + 스모크 준비 배리어)


## 배경 — 무엇이 확정됐고 무엇이 반증됐나

`preflight5` 3회 연속 red(121/124, 122/124, 121/124), 실패 집합은 매번 다르지만 **M2b는 3/3, 시그니처는 매번 `cookie=existing=preset`**. 같은 트리(`4e4d024`)에서 24분 전 `release-r1-R-3-suite.txt`는 124/124 green이었고 `git diff --stat 4e4d024 HEAD -- src scripts`는 비어 있다.

**반증된 것 (건드리지 말 것).** "M2b는 쿠키 오버라이드 동작의 제품 결함"은 반증됐다. `compile.ts:352-378`은 override를 `{header:'Cookie', operation:'set', value:'session=new'}`로 정확히 방출하고, `compile-issue03.test.ts:32`가 바로 그 계약을 검증하며 red 런에서도 `360 passed`였다. `existing=preset`은 **규칙이 아직 안 걸린 브라우저 원본값**이지 잘못 만들어진 값이 아니다. 같은 런의 M2c가 `session=new`(=M2b의 기댓값)를 관측한 것이 결정적이다. **`src/core/`는 이 티켓에서 한 줄도 고치지 않는다.**

**확정된 것.**

1. **제품 회귀 (R-3, `4e4d024`, `src/platform/stateStore.ts:28`).** `loadState()`가 읽을 때마다 `await persistState(read.state)`로 v1→v2 마이그레이션을 커밋한다. 스모크는 `seedProfiles`가 매번 `schemaVersion: 1`을 쓰므로(`scripts/smoke.mjs:334`, `SCHEMA_VERSION`은 2 — `src/core/format-version.ts:20`) **시드 58회 전부**가 `migrated`로 분류돼 그 쓰기가 매번 발화한다. 그 쓰기는 `reconciler.loadSnapshot` **안**에 있고(`background-bootstrap.ts:95`), `storage.local.set`이 `onStateChanged`(`stateStore.ts:62-65`)를 다시 때려 `converge()`(`background-bootstrap.ts:257`) → `latestGeneration += 1`이 되면서, 그 쓰기를 수행한 세대 자신이 `reconciler.ts:47`의 post-loadSnapshot 가드에서 **`apply()`/`replaceSessionRules()`를 부르지 못하고 물러난다.** 규칙은 다음 세대, 즉 저장소 왕복 한 번 뒤에야 걸린다. `app.tsx:83-89`의 팝업·탭앱도 같은 `loadState`를 쓰므로 시드 1회당 최대 3개 컨텍스트가 같은 마이그레이션을 각자 커밋한다 — `stateStore.ts:42`가 스스로 선언한 "쓰기 경로는 background 실행자와 마이그레이션 커밋뿐"이라는 불변식과 어긋난다.

   *근거(추정 아님):* 트리 3종 × M블록 60회 인터리브 — tip 18/60 실패, R-3 이전 0/60, R-2 이전 1/60 (Fisher p=5.2e-9; R-2 이전/이후 두 트리의 `background.js`는 **바이트 동일**, p=1.00). `stateStore.ts:28` **그 한 줄만** 주석 처리하면 9/30 → 0/30 (p=1.9e-3), "배리어 반환 시점에 규칙이 아직 이전 것" 81% → 0%.

2. **하네스 결함 (세 트리 모두에 있던 잠복 결함).** `pollSessionRuleCount`(`scripts/smoke.mjs:101-113`)는 `rules.length`만 본다. `replaceSessionRules`(`src/entrypoints/background.ts:23-29`)는 단일 원자 `updateSessionRules`라 개수가 0을 지나지 않으므로, **1개 → 1개 교체에서는 배리어가 `pollUntil`의 첫 프로브(`smoke.mjs:94`, 첫 sleep 전에 프로브한다)에서 이전 테스트의 규칙 세트로 즉시 만족된다.** 계측 결과 배리어는 시드 +2~3ms에 반환하고 그 시점 규칙 세트는 tip 96사이클 중 78회가 **이전 규칙**이었다. 그래서 단언이 정확히 한 테스트씩 밀린다(`M2b … existing=preset` / `M2c … session=new`). 하네스 저자도 `smoke.mjs:450-453`에 이 함정을 한국어로 적어놨지만 F1과 M4b에만 효과 폴링을 적용했다. `ADR 0002`가 "규칙 공백 수백 ms를 감수한다"고 명시한 이상, **준비 상태는 가정이 아니라 관측해야 한다.**

3. **N34b는 별개의 표본 추출 버그.** `smoke.mjs:2314`가 `emulateMedia` 후 고정 `waitForTimeout(150)`으로 색을 읽는데, 대상인 `src/ui/toggle-switch.tsx:12`의 `transition-colors`가 Tailwind 기본 150ms다. 관측값 `rgb(30, 80, 218)`은 다크 `#2563eb`(37,99,235)와 라이트 `#1d4ed8`(29,78,216) 사이의 **전이 중간 프레임**이다. 채널당 1~2 차이 = 프레임 하나 차이.

## 무엇을 바꾸나

### 작업 1 — 마이그레이션 커밋을 읽기 경로에서 내린다 (제품)

**R-3의 finding을 되돌리는 것이 아니다.** R-3(`4e4d024`)은 사람이 승인하고 sha 스탬프까지 찍힌 원장 행이며, 그 요구("검증 통과한 v1→v2를 메모리에만 두지 말고 권위 저장소에 커밋한다, 실패를 숨기지 않는다")는 **그대로 유지된다.** 바꾸는 것은 **커밋이 일어나는 위치**뿐이다. `stateStore.ts:28`을 그냥 지우면 안 된다 — 저장소가 영원히 v1로 남고 R-3이 다시 열린다.

- `loadState()`는 **순수 읽기**가 된다. `storage.local.set`이 단 한 번도 일어나지 않는다. `blocked`일 때 `StateLoadError`를 던지는 절반(`stateStore.ts:26`)은 **글자 그대로 유지**한다(기본 상태로 접지 않는다).
- `src/platform/stateStore.ts`에 명시적 커밋 진입점을 새로 만든다(예: `export async function commitMigration(): Promise<boolean>`). `readState()` 결과가 `migrated`일 때만 기존 `persistState`를 태우고(새 쓰기 경로를 열지 않는다), 이미 v2면 아무것도 쓰지 않으며, 실패는 삼키지 않고 호출자에게 전파한다.
- 호출부는 **background 컴포지션 루트 하나뿐**이다. `BackgroundDeps`에 주입하고 `bootstrap()` 안에서 **최초 `converge()` 앞에 한 번만** 실행한다. 실패는 `deps.logError`로 드러내되 수렴은 계속한다. 예:
  ```ts
  // 마이그레이션 커밋은 재조정 바깥에서 한 번만 — loadSnapshot 안에서 쓰면
  // 그 쓰기가 자기 세대를 무효화해 apply가 통째로 한 왕복 밀린다.
  void deps.commitMigration()
    .catch((error) => deps.logError('migration commit failed', error))
    .finally(() => { converge(); scheduleBackup(); });
  ```
- **MV3 제약:** `bootstrap()` 자체를 `await` 뒤로 미루지 말 것. 이벤트 리스너는 서비스워커 첫 턴에 동기 등록돼야 한다. 커밋은 리스너 등록이 끝난 뒤 `bootstrap()` **안**에서 돈다.
- `src/app/app.tsx`는 계속 `loadState()`만 부른다(이제 쓰지 않는다). **팝업·탭앱에 `commitMigration`을 주면 안 된다.** UI 표면은 읽기 전용이다. v1 상태에서 팝업을 먼저 열어도 화면은 마이그레이션된 메모리 상태를 정상 표시하고, 커밋은 SW가 한다 — 사용자 관측 동작은 변하지 않는다.
- **지켜야 할 불변식(리뷰가 이걸 본다):** `reconciler.loadSnapshot` 경로에서 `storage.local` 쓰기가 단 한 건도 발생하지 않는다.
- 사실과 어긋나게 되는 주석(`stateStore.ts:22-23`, `:27`, `:42`)을 새 배치에 맞게 고친다. 이 저장소는 "왜"를 담은 주석이 참인 상태로 유지되는 것을 전제한다.

### 작업 2 — 스모크 준비 배리어를 실제 신호로 바꾼다 (하네스)

- `pollSessionRuleCount`는 **지우지 않는다.** 개수가 실제로 바뀌는 자리(→0, →2, →3)에서는 여전히 유효하다.
- 옆에 `pollSessionRuleMatch(sw, predicate, label, timeoutMs)`를 추가한다: `chrome.declarativeNetRequest.getSessionRules()`를 폴링해 **규칙 내용**이 predicate를 만족할 때까지 기다린다(직렬화 문제를 피하려면 evaluate에서 규칙 배열을 그대로 받아 Node 쪽에서 매칭하는 편이 단순하다). 타임아웃이면 **마지막으로 본 규칙 세트를 직렬화해 담은 오류로 실패시킨다** — 진짜 회귀가 조용히 통과하면 안 된다.
- 적용 규칙(불변식): **`seedProfiles(...)` 뒤 네트워크 관측으로 값을 만드는 모든 `record(...)`는, 그 값을 읽기 전에 "이번 시드의 규칙이 실제로 살아 있다"는 양성 증거를 확보한다.** 둘 중 하나로:
  - **(a) 양성 단언** — 효과 자체를 폴링한다(F1 `smoke.mjs:454-458`, M4b `:1148-1160`의 기존 패턴). 예: K1은 `x-injected-resp === 'yes'`가 관측될 때까지 재요청.
  - **(b) 음성/부재 단언** — M2c(쿠키 제거), M2e(Set-Cookie 차단), M2d의 `!/server_cookie=base/` 절반, K2의 remove 절반. **부재를 폴링하면 절대 안 된다** — 이전(stale) 규칙 세트가 부재 조건을 즉시 만족시킨다. 반드시 `pollSessionRuleMatch`로 **새로 시드한 규칙의 내용**을 양성 확인한 뒤 한 번만 관측하거나, 같은 시드에 양성 센티널(예: `X-Barrier: <seq>` 요청 헤더 mod)을 함께 넣고 그 센티널이 관측될 때까지 효과 폴링한 뒤 **같은 응답에서** 음성을 단언한다.
- **최소 적용 대상** (개수 배리어가 무효인 자리 — 시드 직전 설치 개수가 이미 기대치와 같다): `K1`(smoke.mjs:764), `K2`(:775, 여기의 `setTimeout(300)`도 매직 넘버 배리어다), `K3`(:791), `M1`(:1027), `M2`(:1040), `M2b`(:1069), `M2c`(:1082), `M2d`(:1096), `M2e`(:1112), `M4`(:1130). 나머지 `pollSessionRuleCount` 호출부도 **직전 시드를 읽어** 개수가 실제로 바뀌는지 확인하고, 바뀌지 않는 자리가 더 있으면 같이 고친다(추측하지 말고 확인할 것). `L1`(:805)은 단언 자체가 네트워크 효과를 읽지 않으므로 선택 사항이다.
- **금지:** `record(` 삭제·약화, 단언의 동어반복화(`overridden === 'session=new'`를 정규식으로 느슨하게 바꾸는 등), 유일한 배리어로서의 맨 `waitForTimeout` 추가, `scripts/smoke.mjs`의 순 라인 감소.

### 작업 3 — N34b 표본 추출 (하네스)

- `smoke.mjs:2312-2314`의 고정 150ms 대기를 **안정화 폴링**으로 바꾼다(`pollStable(...)` 같은 이름): `getComputedStyle(el).backgroundColor`를 ≥50ms 간격으로 읽어 **연속 2회 동일**할 때까지 기다린 값을 표본으로 쓴다. 타임아웃(예: 2s)이면 마지막 값으로 **FAIL**시킨다.
- **기댓값을 향해 폴링하지 말 것.** "안정될 때까지"만 기다린다 — 그래야 단언 강도가 그대로 유지된다. `accLight.swBg === rgbOf(accLight.rootPrimary)` 등 단언식 3개는 손대지 않는다.
- **`src/ui/toggle-switch.tsx`는 고치지 않는다.** `transition-colors`를 빼는 것은 제품 동작 변경이고 이 티켓의 범위가 아니다.
- `smoke.mjs:2285`의 `emulateMedia({ colorScheme: 'light' })` 뒤 무대기 구간도 같은 폴링이 흡수하는지 확인한다.

### 작업 4 — 회귀 잠금 테스트 (기존 테스트는 지우지 않는다)

`src/platform/stateStore.test.ts`의 기존 `it(` 2건은 현재 **`loadState`가 커밋한다**를 단언한다. 이 두 건을 **삭제하지 말고** 새 진입점으로 **재조준**하되 단언 강도는 유지한다(① 검증 통과 v1은 저장소가 v2로 굳는다, ② 올릴 수 없는 v1은 아무것도 쓰지 않고 `StateLoadError`를 던진다). 여기에 최소 2건을 더한다:

- `loadState()`는 v1을 만나도 `storage.local.set`을 **0회** 호출한다(페이크 `set` 카운터로).
- `commitMigration()`은 v1에 대해 1회 쓰고, 두 번째 호출에서는 쓰지 않는다.

`src/runtime/background-bootstrap.test.ts`에 **메커니즘 잠금**을 추가한다: v1 저장 상태 + 마이그레이션 쓰기로 `onStateChanged`가 발화하는 페이크에서 `bootstrap()`을 태웠을 때, `replaceSessionRules`가 시드된 프로필에서 컴파일된 규칙으로 호출된다(세대 자기무효화로 apply가 통째로 스킵되지 않는다). 이 테스트가 있어야 회귀가 표본 수와 무관하게 잠긴다. `BackgroundDeps`에 dep이 추가되면 기존 페이크 헬퍼를 갱신한다(파일은 순 증가여야 한다).

### 작업 5 — 감사 스크립트 + 기록

- `scripts/audit-smoke-barriers.mjs`를 추가한다(설정 파일이 아니므로 추가 가능; `package.json`은 수정 금지이므로 `node scripts/audit-smoke-barriers.mjs`로 직접 돌린다). 동작: 위 최소 적용 대상 각 테스트 id에 대해, 그 `record('<id>:` 직전의 **마지막 `seedProfiles(`와 record 사이**에 `pollSessionRuleMatch(` / `pollUntil(` / `pollStable(` 중 하나가 존재하는지 확인하고, 없으면 목록을 출력하며 exit 1. `N34b`는 record 앞 60줄에 `pollStable(`이 있는지로 확인. **현재 HEAD에서 이 스크립트는 12개 전부를 flag하며 exit 1이어야 한다** — 먼저 그 상태를 확인하고(red) 고친 뒤 `OK` / exit 0으로 만든다.
- 7회 green 로그를 `.scratch/wide-ui-redesign/evidence/ticket-14-suite-run{1..7}.txt`로 남긴다.
- `docs/reviews/wide-ui-redesign/followups.md`에 범위 밖 항목 2건을 남긴다: (i) `persistState`의 가드가 `isBlockedFromOverwrite`(버전 가독성 검사)일 뿐 compare-and-swap이 아니어서, 늦게 도착한 쓰기가 더 새 상태를 덮을 수 있다(tip 런 1회에서 20s 내 미수렴 관측). 이 티켓은 동시 writer를 없애 그 창을 닫지만 가드 자체는 그대로다. (ii) 이번에 변환하지 않은 나머지 `pollSessionRuleCount` 호출부 목록.

## 건드리지 말 것

- `package.json`, `vitest.config.ts`, `tsconfig.json`, `wxt.config.ts`, `.gitignore` — 설정 가드. 손대면 파이프라인이 멈춘다.
- `src/core/**` 전부 — 쿠키/compile/persist/schema는 이 결함과 무관함이 증명됐다.
- `src/core/url-scope.ts` 및 R-2(`a711d57`) — 무죄가 증명됐다. `urlScopeBreadth`의 호출부는 `rule-validation.ts:64`(block 전용)와 `rule-form.tsx:179`(block 전용 확인 다이얼로그) 둘뿐이고 DNR 경로에 닿지 않는다. R-2 이전/이후 트리의 `background.js`는 바이트 동일하며 R-2가 추가한 N18j는 red 3런 모두 PASS였다. **되돌리지 말 것.**
- `src/ui/toggle-switch.tsx` — N34b는 하네스에서 고친다.
- `docs/reviews/wide-ui-redesign/decisions.md` — `[AUTO …]` 행과 `### release r1` 섹션은 `verify-ledger`가 검사하는 원장이다. 이 티켓의 기록은 이슈 파일과 evidence 디렉터리에 남긴다.
- 기존 `record(` 단언식의 의미 — 배리어만 바꾸고 기댓값은 그대로 둔다.
- 스모크의 `seedProfiles`가 `schemaVersion: 1`을 쓰는 것 자체 — 이것을 2로 바꾸면 증상은 사라지지만 **결함을 덮는 것**이다(E1이 레거시 마이그레이션을 따로 덮고 있고, 진짜 문제는 커밋 위치다). 시드 버전을 바꿔 green을 만드는 해법은 거부된다.

## 참고 좌표

| 무엇 | 어디 |
|---|---|
| 읽기 경로의 마이그레이션 쓰기 | `src/platform/stateStore.ts:24-30`, `:52-60`, `:62-66` |
| 자기무효화 지점 | `src/runtime/reconciler.ts:39-52` (`:47` 가드) |
| 재조정 배선 | `src/runtime/background-bootstrap.ts:95`, `:112`, `:257-260`, `:278-279` |
| 읽으면서 쓰는 UI | `src/app/app.tsx:83-89` |
| 원자적 규칙 교체 | `src/entrypoints/background.ts:23-29` |
| 무효 배리어 | `scripts/smoke.mjs:90-99`, `:101-113` |
| 하네스 저자의 경고 | `scripts/smoke.mjs:450-453` (그리고 올바른 패턴 `:454-458`, `:1148-1160`) |
| red 증거 | `.scratch/wide-ui-redesign/evidence/preflight5-suite{,-rerun1,-rerun2}.txt` (특히 `:91-92`) |
| green 기준선 | `.scratch/wide-ui-redesign/evidence/release-r1-R-3-suite.txt` (124/124) |
| 스위트 명령 | `docs/reviews/wide-ui-redesign/verification.md:16` |

**Blocked by:** None — can start immediately.

**Status:** done

티켓 11·12·13은 이 티켓을 기다린다 — 스위트가 red인 동안 그 셋의 스위트 검증이 무의미하기 때문이다. 그 대기는 각 티켓의 Blocked by 줄에 배선돼 있다.

- [ ] A1. `loadState()`가 순수 읽기다 — `src/platform/stateStore.test.ts`에 v1 저장 상태에서 `loadState()`를 부를 때 페이크 `browser.storage.local.set` 호출 횟수가 **0**임을 단언하는 테스트가 있고 통과한다. `blocked` 상태에서 `StateLoadError`를 던지는 기존 동작은 그대로 유지된다(기존 단언 유지).
- [ ] A2. 마이그레이션은 여전히 커밋된다 — `src/platform/stateStore.test.ts`가 (i) 새 커밋 진입점이 v1을 v2로 저장소에 굳히고 규칙을 보존한다, (ii) 두 번째 호출은 아무것도 쓰지 않는다, (iii) 올릴 수 없는 v1은 아무것도 쓰지 않고 `StateLoadError`를 던진다 를 단언한다. 파일의 `it(` 개수 ≥ 4 (현재 2), 그리고 `git diff --numstat 4f4b0a6 -- src/platform/stateStore.test.ts`의 추가 라인 > 삭제 라인.
- [ ] A3. 메커니즘 잠금 — `src/runtime/background-bootstrap.test.ts`에, v1 저장 상태이고 마이그레이션 쓰기가 `onStateChanged`를 발화시키는 페이크에서 `bootstrap()`을 태웠을 때 `replaceSessionRules`가 시드 프로필에서 컴파일된 규칙으로 호출됨을 단언하는 테스트가 있고 통과한다(세대 자기무효화로 apply가 스킵되지 않는다). `git diff --numstat 4f4b0a6 -- src/runtime/background-bootstrap.test.ts`의 추가 라인 > 삭제 라인.
- [ ] A4. 재조정 스냅샷 경로에 쓰기가 없다 — `loadState` 본문(함수 시작~닫는 중괄호)에 `persistState(` 또는 `storage.local.set` 호출이 나타나지 않는다. 확인: `awk '/export async function loadState/,/^}/' src/platform/stateStore.ts | grep -E 'persistState\(|storage\.local\.set'` 가 아무것도 출력하지 않는다(exit 1).
- [ ] A5. UI 표면은 읽기 전용 — `grep -nE 'commitMigration|persistState' src/app/app.tsx src/features src/ui -r` 가 아무것도 출력하지 않는다.
- [ ] A6. 배리어 감사 통과 — `node scripts/audit-smoke-barriers.mjs` 가 `OK`를 출력하고 exit 0. (같은 스크립트를 시작 SHA `4f4b0a6`의 `scripts/smoke.mjs`에 대해 돌리면 K1,K2,K3,M1,M2,M2b,M2c,M2d,M2e,M4,N34b 를 flag하며 exit 1이어야 한다 — 스크립트가 실제로 무언가를 검사한다는 증거로 이 red 출력도 evidence에 남긴다.)
- [ ] A7. 테스트가 약해지지 않았다 — `grep -c "  record(" scripts/smoke.mjs` ≥ 124 이고, `for id in K1 K2 K3 L1 M1 M2 M2b M2c M2d M2e M4 N34b F1 M4b; do grep -q "record('$id:" scripts/smoke.mjs || echo MISSING $id; done` 이 아무것도 출력하지 않는다. `git diff --numstat 4f4b0a6 -- scripts/smoke.mjs` 의 추가 라인 > 삭제 라인.
- [ ] A8. 범위 밖 파일 무변경 — `git diff --name-only 4f4b0a6 | grep -E '^(package\.json|vitest\.config\.ts|tsconfig\.json|wxt\.config\.ts|\.gitignore|src/core/|src/ui/toggle-switch\.tsx|src/core/url-scope\.ts|docs/reviews/wide-ui-redesign/decisions\.md)'` 가 아무것도 출력하지 않는다.
- [ ] A9. 타입 체크 — `bun run check` exit 0.
- [ ] A10. **전체 스위트 7회 연속 green.** `bun run build && bun run test && bun run smoke` 를 같은 머신에서 순차로 7회, 재시도·필터·부분 실행 없이 돌려 7회 모두 exit 0. 각 로그를 `.scratch/wide-ui-redesign/evidence/ticket-14-suite-run1.txt` … `run7.txt` 로 저장한다. 각 로그는 vitest `Tests <M> passed (<M>)` 에서 M ≥ 360 (새 유닛 테스트만큼 증가), 스모크 마지막 줄이 `N/N passed` 에서 N ≥ 124, 그리고 `FAIL ` 로 시작하는 줄이 0개여야 한다. **중간에 한 번이라도 red가 나오면 카운터는 0으로 리셋되고 처음부터 7회를 다시 채운다.** red 로그는 삭제하지 말고 보존한 뒤 이슈 파일 `## Comments` 에 실패 테스트 id·시그니처와 함께 분류를 적는다.
- [ ] A11. A10의 회수 근거를 이슈 파일에 적는다 — 관측된 3/3 red에서 런당 red 확률의 단측 95% 하한은 p ≥ 0.05^(1/3) = 0.368 이다. 그 하한이 남아 있다는 가설을 α=0.05로 기각하려면 (1−0.368)^N ≤ 0.05, 즉 N ≥ 6.53 → **N = 7** (0.632^7 = 0.040 < 0.05, 0.632^6 = 0.064 > 0.05). 과거 티켓당 플레이크 재실행 1~2회(런당 p ≈ 0.33~0.67)에 대해서도 7회 green의 우연 확률은 ≤ 6.1% 다. 런당 213~227초이므로 7회 ≈ 26분으로 무인 실행 가능하다. **정직한 한계도 함께 적는다: 7회 green은 p=0을 증명하지 않으며 잔존 p=0.10 은 47.8%(0.9^7) 확률로 통과한다 — 그래서 A3의 메커니즘 단위 테스트와 A6의 감사가 표본 수와 무관한 잠금 장치로 함께 요구된다.**
- [ ] A12. 후속 항목 기록 — `docs/reviews/wide-ui-redesign/followups.md` 에 (i) `persistState` 의 가드가 compare-and-swap 이 아니라는 점(`src/core/persist.ts:390-392`)과 (ii) 이번에 변환하지 않고 남긴 `pollSessionRuleCount` 호출부 목록이 추가돼 있다.

## Comments

> **출처(provenance) — 누가 썼고 무엇을 근거로 썼는가.**
>
> 아래 A10·A11 기록의 **내용**은 구현자가 작업 중 남긴 저널
> `.scratch/wide-ui-redesign/tickets/14.md`(gitignored)에 있던 것이고, 그 내용은 구현자가 아닌
> **독립 기준 감사자**가 `file:line`으로 검증했다.
>
> **전사한 주체는 컨덕터다.** 숨기지 않고 밝힌다. 원래 이 작업은 사람의 몫으로 배정돼 있었다 —
> `docs/reviews/wide-ui-redesign/decisions.md`의 `### ESCALATION criteria-unmet` 블록과
> `ESCALATION.md`의 옵션 (a)는 "루프는 자기 기준 증거를 스스로 쓰지 않는다"고 적고 있고, 그
> 판단은 **무인 루프**에 대한 것이다. 이 전사는 루프가 정지한 뒤(락 해제, `loop.stop` 기록됨)
> 사람이 옵션 (a)를 고르고 **기계적 이동 작업을 컨덕터에게 위임**해 이뤄졌다. 그 위임 사실은
> `.scratch/wide-ui-redesign/ESCALATION.md`의 `Resolved:` 줄에 사람 손으로 기록된다 — 그 줄은
> 루프 재진입(P8)의 전제이기도 하므로, 그것 없이는 이 전사가 후속 절차로 이어지지 않는다.
>
> **저작한 것이 아니라 옮긴 것이다.** 아래의 모든 수치는 전사 시점에 `evidence/`의 로그 8개에
> 대해 기계적으로 재확인했고, 시그니처는 로그 원문과 바이트 동일하다. 저널이 뒷받침하지 않는
> 주장은 넣지 않았다.
>
> **그리고 이 기록은 컨덕터의 자기 채점이 아니다.** 재진입 시 새 독립 감사자가 이 섹션을
> 다시 채점한다. 이 문단은 그 감사자가 출처를 추적할 수 있게 하려고 있는 것이다.

### A10 — 보존된 red 실행: 실패 id · 시그니처 · 분류

스트릭 도중 **1회 red**가 발생해 카운터가 0으로 리셋됐고, 고친 뒤 처음부터 7회를 다시 채웠다.
red 로그는 삭제하지 않고 `.scratch/wide-ui-redesign/evidence/ticket-14-suite-red1.txt`로 보존했다.

| 항목 | 값 |
|---|---|
| 로그 | `evidence/ticket-14-suite-red1.txt` |
| 실패 테스트 id | **N34b** (단일 실패 — `^FAIL ` 줄 1개) |
| 스모크 결과 | `123/124 passed` |
| 유닛 결과 | `Tests 363 passed (363)` — 유닛은 전부 green |

시그니처(로그 원문 그대로):

```
FAIL  N34b: 렌더된 활성 컨트롤이 시맨틱 accent를 탄다 (raw blue 우회 없음) — light: switch=rgb(29, 78, 216) primary=#1d4ed8, dark: switch=rgb(37, 99, 235) primary=#1d4ed8
```

**분류: 하네스 결함(작업 3에서 이번에 넣은 회귀). 제품 결함 아님.**

근거와 메커니즘 — `activeAccent`의 고정 `waitForTimeout(150)`을 `pollStable`로 교체하면서,
그 고정 대기가 **두 가지**를 덮고 있었다는 점을 놓쳤다: (a) 전이 중간 프레임 회피, (b)
`emulateMedia` → 앱의 matchMedia 수신 → 루트 `data-theme` 반전의 왕복. (b)가 사라지면서
`rootPrimary`를 `emulateMedia` 직후 무대기로 읽어 버렸고, 그 결과 **다크 표본을 뜨는 중에
라이트 `--primary`(`#1d4ed8`)를 읽었다.** 위 시그니처에서 `switch=rgb(37, 99, 235)`(다크)와
`primary=#1d4ed8`(라이트)가 짝이 맞지 않는 것이 정확히 그 증상이다.

고침 — (b)를 `data-theme === scheme`를 기다리는 **준비 배리어**로 분리했고(이 값은 N34b의
어떤 단언에도 쓰이지 않으므로 단언 강도는 불변), `rootPrimary`는 `pollStable`로 색이 안정된
**뒤에** 읽는다. 같은 이유로 N34의 `paletteProbe`가 아직 `waitForTimeout(150)`을 쓰는 것은
의도적 유지다(이 티켓 범위 밖).

교훈(→ `notes.md`에도 기록): 고정 대기를 배리어로 걷어낼 때는 그 대기가 덮던 **모든** 비동기를
열거할 것.

또 하나 기록해 둔다 — 위 red와 별개로, **첫 스트릭은 1회차 도중 폐기**했다. 최소 적용 대상만
고친 트리로 스트릭을 시작한 뒤에야 E2/E3/E5/E6의 개수 배리어도 무효임을 전수 대조로 확인했기
때문이다. A10이 요구하는 "같은 트리에서 연속 7회"를 지키려고 러너를 죽이고 로그를 지운 뒤
고친 트리에서 처음부터 다시 돌렸다. 아래 run1..7은 전부 최종 트리(`fd3610b`)의 것이다.

이 폐기에 대해 **A10의 보존 의무와의 관계를 명시해 둔다.** 폐기 사유는 red 결과가 아니라
트리를 더 고쳐야 했다는 것이고, 1회차 **도중** 러너를 죽였으므로 그 실행에는 완결된 결과
줄(`N/N passed`)도 `^FAIL ` 줄도 없다 — 즉 red 판정이 내려진 적이 없다. A10의 "red 로그는
삭제하지 말고 보존"은 red 실행에 걸리는 의무이므로 이 경우에 해당하지 않는다고 판단해
지웠다. **다만 지운 것은 사실이므로 그대로 밝힌다** — 그 로그가 없으므로 "그 실행이 red가
아니었다"는 것은 이 기록 외에 독립적으로 확인할 수단이 없다. 판단이 갈릴 수 있는 지점이라
감사자가 직접 판정할 수 있도록 사실만 적어 둔다. 실제로 red가 난 유일한 실행
(`ticket-14-suite-red1.txt`)은 지우지 않고 보존했다.

### A10 — 최종 7회 연속 green (전사 시점 기계 재확인)

`bun run build && bun run test && bun run smoke`, 같은 머신에서 순차 7회, 재시도·필터·부분 실행 없음.

**"같은 머신 / 순차"의 근거.** 로그에 hostname은 기록되지 않았으므로 이 조항은 다음 정황으로
확인한다(추론임을 밝힌다): ① 7개 로그 전부 동일한 vitest 배너
`RUN  v4.1.10 /Users/ukyi/workspace/header-kit` 를 담고 있다 — 같은 절대 경로의 같은 로컬 러너다.
② 8개 로그 전부 같은 로컬 디렉터리 `evidence/`에 mtime 09:15→09:43로 연속 기록됐다.
③ vitest `Start at` 이 09:17:04 / 09:20:49 / 09:24:34 / 09:28:16 / 09:32:00 / 09:35:45 / 09:39:31 로,
런 간 간격이 222~226초다. 런당 벽시계 213~227초와 맞물려 **겹침 없이 직렬**로 돌았음을 보인다.
④ 스트릭 창(09:17~09:44) 동안 `src`·`scripts`·`docs` 아래 어떤 파일도 수정되지 않았고
(`find … -newermt` 무출력), 7개 로그의 빌드 산출물 해시가 전부 동일하다 — **같은 트리**다.

| 로그 | 유닛 `Tests M passed (M)` | 스모크 `N/N passed` | `^FAIL ` 줄 |
|---|---|---|---|
| `evidence/ticket-14-suite-run1.txt` | 363 | 124/124 | 0 |
| `evidence/ticket-14-suite-run2.txt` | 363 | 124/124 | 0 |
| `evidence/ticket-14-suite-run3.txt` | 363 | 124/124 | 0 |
| `evidence/ticket-14-suite-run4.txt` | 363 | 124/124 | 0 |
| `evidence/ticket-14-suite-run5.txt` | 363 | 124/124 | 0 |
| `evidence/ticket-14-suite-run6.txt` | 363 | 124/124 | 0 |
| `evidence/ticket-14-suite-run7.txt` | 363 | 124/124 | 0 |

M = 363 ≥ 360, N = 124 ≥ 124, `^FAIL ` 0줄 — 7회 모두 A10의 문턱을 만족한다.

독립 확인 1건 추가: 컨덕터가 구현자와 별개로 `fd3610b`에서 같은 스위트를 1회 직접 실행해
`SUITE_EXIT=0`, `124/124 passed`를 얻었다 (`evidence/14-attempt2-suite.txt`). 이 실행은 A10의
7회에 포함되지 않는다 — 별개의 교차 확인이다.

### A11 — 회수(N=7) 근거와 한계

**관측.** 이 티켓을 세운 계기인 프리플라이트 5회차에서 전체 스위트가 **3/3 red**였다
(`evidence/preflight5-suite.txt`, `-rerun1.txt`, `-rerun2.txt`).

**하한.** 관측된 3/3 red에서 런당 red 확률의 단측 95% 하한은

    p ≥ 0.05^(1/3) = 0.368

**필요 회수.** 그 하한이 남아 있다는 가설을 α = 0.05로 기각하려면 (1 − 0.368)^N ≤ 0.05, 즉

    0.632^7 = 0.040 < 0.05   →  N = 7 로 기각된다
    0.632^6 = 0.064 > 0.05   →  N = 6 으로는 기각되지 않는다
    ⇒ N ≥ 6.53  →  N = 7

**과거 플레이크와의 대조.** 과거 티켓당 플레이크 재실행 1~2회 수준(런당
p ≈ 0.33~0.67)에 대해서도 7회 연속 green이 우연히 나올 확률은 ≤ 6.1%다.

**실행 가능성.** 런당 213~227초이므로 7회 ≈ 26분 — 무인 실행 안에서 소화된다.

**정직한 한계 (A11이 명시적으로 요구).** 7회 green은 **p = 0을 증명하지 않는다.**
잔존 확률 p = 0.10이 남아 있어도 7회 연속 green은 0.9^7 = **47.8%** 확률로 통과한다.
즉 이 표본만으로는 낮은 잔존 플레이크율을 배제하지 못한다. 그래서 이 티켓은 표본 수에
의존하지 않는 잠금 장치 두 개를 **함께** 요구한다 — **A3의 메커니즘 단위 테스트**(세대
자기무효화가 나면 실패하는 결정론적 테스트)와 **A6의 배리어 감사 스크립트**(개수 배리어의
재발을 정적으로 잡는다). 7회 green은 그 둘을 보조하는 통계적 증거이지 그 자체가 잠금이 아니다.

### A8 — 처분: 사람의 판정 (컨덕터 판단 아님)

**감사자에게.** A8의 지정 명령은 지금 `docs/reviews/wide-ui-redesign/decisions.md`를 출력한다.
그 원인은 구현자가 아니라 **컨덕터의 원장 부기 커밋**(`e9d0b33`·`63a367b`·`d1dd5d0`·`9e0a429`)
이며, A8이 base를 `4f4b0a6`으로 고정한 워킹트리 전체 diff이기 때문에 함께 잡힌다.

**2026-07-28, 사람이 이 건을 직접 판정했다: A8 met.** 판정 근거는 사람의 것이다 —

- A8의 목적은 "구현자가 범위 밖 파일을 건드렸는가"이다. 구현자 브리프의 NEVER 절이 이미
  `decisions.md` 쓰기를 금지하며, 구현자 커밋 `fd3610b`는 가드 경로를 하나도 건드리지 않는다:
  `diff-guard --since 63a367b` → `untouchable_touched: []`, `config_touched: []`.
- 원장에 정지·인간 결정 블록을 쓰는 것은 컨덕터 스킬이 **규정한** 동작이다(`ESCALATION.md`는
  gitignored라 정지 기록이 레포에 남는 유일한 경로가 원장이다). A8의 대상이 아니다.

컨덕터가 검토했으나 **집행하지 않은 대안**(사람이 함께 확인): ① 원장을 `4f4b0a6`으로 되돌리고
부기를 가드 밖으로 이동 — `### ESCALATION budget-insufficient`, `### 인간 결정 — WIP 처분`,
`### ESCALATION criteria-unmet` 의 감사 기록이 이동/소실되므로 거부. ② A8 문언 개정 — 채점
기준을 결과에 맞춰 고치는 일이라 컨덕터 권한 밖.

전체 경위는 `docs/reviews/wide-ui-redesign/decisions.md`의
`### 인간 결정 — A8 처분: 구현자 범위로 한정` 블록에 있다.
