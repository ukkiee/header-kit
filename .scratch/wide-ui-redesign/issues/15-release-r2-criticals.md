# 15 — 릴리스 게이트 r2의 critical 3건: 넓은 스코프 오판정과 저장소 쓰기 경합 둘

**What to build:** 릴리스 게이트 라운드 2가 낸 critical 3건을 닫는다. 셋은 파일도 실패 종류도 겹치지 않지만 사람의 결정으로 **한 티켓에 담겼다**(2026-07-28). 셋 다 "스위트는 green인데 그 green이 결함에 대해 아무것도 말하지 않는" 상태이며, **그중 둘은 이 루프가 스스로 적용한 게이트 픽스의 결함**이다.

- **A. 그룹 안에 숨은 대안이 넓은 스코프 판정을 뚫는다** — `src/core/url-scope.ts:122`(소비처 :146). `topLevelAlternatives`는 `depth === 0`일 때만 `|`를 자르므로 `^(https://ads\.example\.net/|https://.*\.com/)`는 조각이 하나뿐이고, 그 안의 호스트꼴 토큰 하나가 모든 HTTPS `.com`을 삼키는 둘째 갈래까지 '좁음'으로 증명한다. 탐침 URL(:60)은 `.invalid` 호스트라 그 갈래에 걸리지 않는다. 폼은 `'wide'`에만 확인을 요구하므로(`src/features/modifications/rule-form.tsx:177-184`) **파괴적 Block이 확인 없이 첫 저장에 켜진다.** 라운드 1 픽스(`a711d57`)가 최상위 `|`는 닫았고 이 구멍만 남았다.
- **B. 마이그레이션 커밋이 더 새 상태를 덮는다** — `src/platform/stateStore.ts:42-49`. `commitMigration`이 :43에서 마이그레이션된 스냅샷을 쥐고 await를 둘 더 지나(:47 → `persistState`의 get :72, set :78) 무조건 쓴다. 커맨드 리스너는 마이그레이션보다 **먼저** 등록되고(`src/runtime/background-bootstrap.ts:262` vs :294) 커맨드 FIFO(`src/runtime/executor.ts:24-42`)를 이 커밋만 지나지 않는다. 유일한 가드 `isBlockedFromOverwrite`(`src/core/persist.ts:390-392`)는 "이 버전이 읽을 수 있는가"만 묻고 "내가 읽은 그 값 위에 쓰는가"는 묻지 않아, 읽을 수 있는 두 v2 사이에서는 항상 통과한다. 라운드 1 픽스(`4e4d024`)가 만든 창이다.
- **C. 스냅샷 삭제가 동시 자동 Backup을 조용히 지운다** — `src/platform/backupStore.ts:116-133`. `bk:manifest`에 writer가 둘이고 **서로 다른 JS 컨텍스트에 산다** — 자동 Backup은 서비스워커(`backupStore.ts:60` ← `background-bootstrap.ts:201`), 삭제는 팝업·탭 렌더러(`src/features/backup/backup-panel.tsx:86`). 삭제는 :121에서 읽고 :125에서 매니페스트를 **통째로 교체**하므로 그 사이 커밋된 스냅샷이 사라지는데, 사후 검증(:128 → `src/core/backup.ts:398-406`)은 **지운 id의 부재만** 보므로 `{ok:true}`가 나온다. 전량 쓰기를 부분 술어로 검사하는 이 비대칭이 손실을 조용하게 만드는 전부다. `browser.storage`에 CAS가 없고 writer가 두 컨텍스트에 있으므로 **인프로세스 락으로는 원리적으로 못 고친다.**

**이 티켓의 경계는 "빨간 테스트"다.** 세 결함 모두, HEAD에서 **실패하고** 픽스 뒤 통과하는 테스트를 남긴다. 라운드 2의 가장 무거운 지적이 "커밋된 증거(N43)가 경합을 피해 가도록 쓰여 있다"였고, 통과만 하는 테스트를 더하는 것은 그 지적을 반복하는 것이다.

**Blocked by:** None — 필요한 사람 결정 셋(시임 지명·Tier 2 승인·`guard:test-touch` 승인)은 모두 2026-07-28에 내려졌고 `docs/reviews/wide-ui-redesign/decisions.md`에 기록돼 있다. 즉시 시작 가능.

**Status:** ready-for-agent

## 공통

- [ ] 1. **세 결함 각각에 대해, HEAD에서 실패하는 테스트가 최소 하나씩 있다.** 구현자는 픽스 전에 그 테스트가 빨간지 실제로 확인하고 저널에 그 출력을 남긴다. 통과만 하는 테스트로 기준을 채우지 않는다 — 이 티켓이 존재하는 이유가 그것이다
- [ ] 2. 스펙이 지명한 시임만 쓴다. 2026-07-28 개정으로 **어댑터 단위(`src/platform/*.test.ts`)와 런타임 조율(`src/runtime/*.test.ts`)이 정식 시임이 되었다**(spec.md Testing Decisions). 새 시임·새 테스트 파일은 만들지 않는다 — 필요한 네 파일(`url-scope.test.ts`·`schema-version.test.ts`·`stateStore.test.ts`·`background-bootstrap.test.ts`)과 `scripts/smoke.mjs`는 모두 이미 있다
- [ ] 3. 기존 단언은 한 줄도 바꾸지 않는다 — **예외는 아래 C-8이 지목한 `smoke.mjs` 두 자리뿐**이고 그것은 사람이 명시 승인했다. 그 밖에서 기존 테스트를 고쳐야 한다면 그것은 구현이 틀렸다는 신호이므로 정지한다
- [ ] 4. 새 사용자 대면 문구를 만들지 않는다 — 기존 카탈로그 키만 쓰므로 ko/en parity가 그대로다
- [ ] 5. 전 게이트 그린 (`bun run check`, `bun run build && bun run test && bun run smoke`)

## A — 넓은 스코프 판정 (`src/core/url-scope.ts`)

- [ ] A-1. 그룹 안에 호스트에 묶이지 않은 갈래를 숨긴 Block 정규식은 **첫 Save에서 저장되지 않고** 확인을 요구한다 — `^(https://ads\.example\.net/|https://.*\.com/)`(리뷰 반례)와 `^https://(ads\.example\.net/|.*\.com/)`(스킴 뒤 그룹) 둘 다 (spec.md의 "넓은 스코프 Block 저장 시 경고·확인이 뜨는지")
- [ ] A-2. **전개는 문맥을 분배한다.** `^https://(ads|cdn)\.example\.com/`는 `^https://ads\.example\.com/`·`^https://cdn\.example\.com/` 두 갈래로 펼쳐져 **여전히 '좁음'**이다. 모든 `|`를 그냥 자르는 순진한 구현은 이 패턴을 `^https://(ads`와 `cdn)\.example\.com/`로 찢어 `url-scope.test.ts:120`의 기존 단언을 뒤집는다 — **기준 위반이자 `guard:test-touch` 사유**다. 리뷰어 권고문("every alternative at every nesting level")을 글자 그대로 구현하지 말 것
- [ ] A-3. 포기 경로는 **전부 넓음으로** 떨어진다 — 갈래 수 상한 초과, 대안 그룹 바로 뒤의 수량자(`(a|b)?`처럼 빈 매칭이 되는 모양), 괄호 불일치·파싱 실패 어디서도 `'narrow'`가 나오지 않는다. 상한은 **이름 붙은 상수**로 코드에 적고 주석이 이유를 말한다
- [ ] A-4. 대안이 아닌 `|`는 건드리지 않는다 — 이스케이프(`a\|b`), 문자 클래스(`[a|b]`), `|`가 없는 그룹은 원문 그대로 실려 인라인 플래그 `(?i)`(`url-scope.test.ts:145`)와 선택 그룹 `^https://(ads\.example\.com)?`(:79) 판정이 지금과 같은 답을 낸다
- [ ] A-5. core 테스트: 그룹 반례 넷(리뷰 반례·스킴 뒤 그룹·비캡처 `(?:`·중첩 이중 괄호) → wide, 회귀 방지 행 `^https://(ads|cdn)\.example\.com/` → narrow, 포기 경로 둘(갈래 상한 초과·`(ads|cdn)?`) → wide. 기존 `describe('대안이 여럿이면 전부 호스트에 묶여야 좁다 (release R-2)')`(`url-scope.test.ts:103-127`) **뒤에 새 describe로 순수 추가**
- [ ] A-6. smoke: 그룹 안에 갈래를 숨긴 Block도 첫 Save에서 저장되지 않는다 — N18h/N18j와 **같은 눈**(배너가 아니라 저장된 block 개수)으로 보고 기존 헬퍼 `blockRuleCount`(`smoke.mjs:2073-2077`)를 그대로 쓰며, 취소로 닫아 뒤따르는 개수 단언을 흔들지 않는다. N18j(`smoke.mjs:2112-2134`) 뒤에 순수 추가
- [ ] A-7. **폼·검증·컴파일은 바꾸지 않는다** — `rule-form.tsx:177-184`의 `'wide'` 게이트와 `rule-validation.ts:64-67`의 "넓음은 막지 않는다"는 그대로다. 순수 함수가 진실을 말하면 두 호출부는 이미 옳다. 보호 URL 허용목록·차단 자동 복구(spec.md Out of Scope)도 범위 밖

## B — 마이그레이션 커밋 (`src/platform/stateStore.ts`)

- [ ] B-1. **판정은 `persistState`가 :72에서 이미 읽은 그 값으로 하고, 판정과 `set`(:78) 사이에 `await`가 없다.** `commitMigration`이 따로 한 번 더 읽어 판정하는 구현은 **기준 위반**이다 — 그 사이 await 둘이 창을 다시 연다. 창을 닫는 것은 재읽기 자체가 아니라 **읽기와 쓰기 사이에 await가 없다는 사실**이다
- [ ] B-2. 저장값이 두 읽기 사이에 편집된 v2로 바뀌면 `commitMigration`은 쓰지 않고 물러나며, **최종 저장값이 그 편집본 그대로**다(v1에서 올라온 스냅샷이 아니다). 물러남은 오류가 아니다 — `false`를 돌려주고 던지지 않아 정상 동작에서 `background-bootstrap.ts:296`의 'migration commit failed' 로그가 뜨지 않는다
- [ ] B-3. **주입 인터페이스의 시그니처를 바꾸지 않는다.** `BackgroundDeps.persistState`는 `(state) => Promise<void>`(`background-bootstrap.ts:46`) 그대로 둔다 — `Promise<boolean>`은 `Promise<void>`에 **대입 불가**이고(`error TS2322`, 이 저장소의 tsc로 실증됨) 바꾸면 `background-bootstrap.test.ts`의 fake 다섯 곳과 `src/entrypoints/background.ts:98` 배선이 함께 움직여 기존 테스트 수정과 blast-radius를 동시에 밟는다. compare-and-swap은 같은 get/가드/set 몸통을 공유하는 **별도 함수**(예: `persistIfStill(state, expected): Promise<boolean>`)에 둔다
- [ ] B-4. 기존 계약 셋은 그대로다 — `persistState`의 `isBlockedFromOverwrite` 검사(`stateStore.ts:73`)를 새 술어로 대체·합병하지 않고(`src/core/schema-version.test.ts:174-186`이 그 가드를 주어로 삼는다), 이미 v2인 저장소에는 여전히 아무것도 쓰지 않으며(`stateStore.test.ts:59-65`의 `writes`), 올릴 수 없는 v1에서는 여전히 `StateLoadError`를 던지고 0회 쓴다(:46-52)
- [ ] B-5. **어댑터 시임에 두 writer를 손으로 인터리빙하는 회귀 테스트를 더한다 — 이 테스트는 HEAD에서 실패한다.** `stateStore.test.ts`에 `get`/`set` 해결을 **지연**시키는 storage fake를 세우고: v1 픽스처에서 `commitMigration()`을 시작해 첫 읽기를 공중에 띄운 채 커맨드의 `persistState(편집된 v2)`를 착지시킨 뒤 마이그레이션을 풀어, `commitMigration`이 `false`를 돌려주고 최종 저장값이 편집본인지 단언한다. 기존 `seedLocal`(:21-33)은 즉시 resolve라 인터리빙을 표현할 수 없으므로 **지연 변형을 새로 세우되 기존 헬퍼는 건드리지 않는다**(순수 추가). 2026-07-28 시임 개정이 이 자리를 지명했다
- [ ] B-6. 판단 규칙은 `src/core`의 순수 술어로도 선다 — "이 저장된 값 위에 마이그레이션 결과를 굳혀도 되는가"가 `src/core/persist.ts`의 `isBlockedFromOverwrite`(:390-392) 옆에 표로 단언 가능하게 서고, `commitMigration`이 **실제로 그것을 호출**하며 거짓이면 `browser.storage.local.set`을 부르지 않는다(호출부는 `stateStore.ts:47`·:78). 쓰이지 않는 export로 이 기준을 채울 수 없다
- [ ] B-7. core 테스트: 술어 표 — `'migrated'`(v1) 위에는 굳힌다, `'ok'`(이미 v2)·`'reset'`(빈 저장소·우리 모양 아님)·`'blocked'`(더 새 버전) 위에는 굳히지 않는다. 기존 `describe('isBlockedFromOverwrite — 쓰기 가드')`(`schema-version.test.ts:174-186`) 뒤에 순수 추가
- [ ] B-8. 큐를 지난다고 적어 둔 낡은 주석을 정정한다 — `src/runtime/executor.ts:21-22`("read-modify-write를 한 줄로 직렬화해 lost update를 차단한다")와 `background-bootstrap.ts:93`("모든 쓰기는 이 큐를 거친다")은 마이그레이션 커밋에 대해 사실이 아니다. 커밋이 어떻게 물러나는지를 그 자리에 적는다
- [ ] B-9. **남는 가정을 티켓과 코드에 명시한다** — 이 픽스는 `storage.local`이 발행 순서대로 get/set을 처리한다는 가정 위에서만 창을 닫는다(`persistState:72-77`의 기존 가드가 이미 하는 가정과 같다). `StoredState`에 리비전 카운터를 넣는 일반 CAS(followups.md T14-1)는 스키마 범프를 부르는 별건이고 이 티켓 밖이다

## C — 스냅샷 삭제 ↔ 자동 Backup (`src/platform/backupStore.ts` 외)

- [ ] C-1. 삭제는 **서비스워커 한 곳**이 집행한다. 기계적으로 확인 가능한 형태로: **`deleteBackupSnapshot`을 import하는 파일은 `src/entrypoints/background.ts`(배선)와 `src/platform/backupStore.ts`(정의)뿐이고 `src/features/**`에는 남지 않는다.** 렌더러(`backup-panel.tsx:86`)는 메시지로 요청한다
- [ ] C-2. **중단은 카운팅이어야 한다.** `backupSuspended`(`background-bootstrap.ts:155`)는 단순 boolean이고 현재 유일한 사용자는 `fullReset`(:227-237)이다. 삭제를 두 번째 사용자로 그냥 얹으면 먼저 끝난 쪽이 `backupSuspended = false`로 되돌려 다른 쪽의 창이 열린 채 남는다 — **spec.md가 막으려던 바로 그 실패를 새로 만든다.** 중단 깊이 카운터로 바꾸거나(`suspendDepth`), `bk:`를 건드리는 모든 작업을 `createCommandExecutor`의 `tail`(`executor.ts:26`)과 같은 형태의 단일 FIFO 뒤에 세운다. 어느 쪽이든 **재진입 안전함을 테스트로 단언한다**
- [ ] C-3. **재개는 무조건 다시 예약한다.** `suspendAutoBackup`은 `backupGeneration`을 올리고 `backupScheduled = false`로 만든다(:228-235). 이미 무장된 타이머는 세대 불일치로 **쓰지도 재예약하지도 않고** 돌아간다(:213-216). 전체 초기화는 상태가 바뀌어 `onStateChanged` → `scheduleBackup()`이 뒤따르므로 복구되지만, **스냅샷 삭제는 `storage.local.state`를 건드리지 않아 그 복구가 없다** — 재개가 되살리지 않으면 그 백업은 영구히 사라진다. 전체 초기화의 `snapshot` 조건부와 다르게 처리한다
- [ ] C-4. 삭제 도중 **이미 진행 중이던**(중단 플래그를 이미 통과한) 자동 Backup이 매니페스트 읽기와 쓰기 사이에 착지해도 **그 스냅샷 항목과 청크가 남는다.** 이 테스트는 HEAD의 삭제 경로에 대해 **실패한다** — 중단-우선 오케스트레이터에서 조기 반환하는 틱을 쓰는 하네스는 이 기준을 채우지 못한다(그런 틱은 모든 설계에서 통과한다)
- [ ] C-5. **반대 방향도 닫힌다** — 삭제 전에 KV를 읽은 자동 Backup이 나중에 커밋해 지운 행을 '손상됨'으로 되살리는 경로가 없다. 하네스의 틱은 **읽기와 쓰기가 분리 가능**해야 한다(읽기는 삭제 전, 커밋은 삭제 후). 원자적 틱으로는 이 방향을 표현할 수 없다. 쓰기 직전 재읽기·병합만으로는 이 방향이 열린 채라 그것은 이 티켓의 답이 아니다
- [ ] C-6. C-4·C-5의 증거는 2026-07-28 개정이 지명한 **런타임 조율 시임**(`src/runtime/background-bootstrap.test.ts`, `fakeDeps`·`readGate`/`releaseRead` 기법 :285-390) 또는 **어댑터 시임**(`src/platform/backupStore.test.ts`, `installFakeStorage`)에 순수 추가로 선다. 조율 **순서** 자체를 `src/core` 순수 오케스트레이터로 내리는 것은 좋지만, **그것만으로 C-4·C-5를 채울 수 없다**
- [ ] C-7. 검증도 함께 넓힌다 — 읽은 시점에 있던 다른 스냅샷이 쓰기 뒤에 없으면 성공으로 접지 않는다. 다만 `verifySnapshotDeleted`를 **그 자리에서 바꾸지 않고 새 순수 함수를 더한다** — `src/core/backup.test.ts:332-354`가 그 함수의 `remaining`을 정확히 못박고 있고, 매니페스트 키가 섞이는 것은 설계된 실패 근거다(followups.md T12-R-3 경고)
- [ ] C-8. **N43의 회피를 정정한다 (사람 승인 완료, 2026-07-28).** `scripts/smoke.mjs:4273-4277`의 주석을 "픽스처는 결정론을 위해 늦은 자동 Backup을 재우는 장치이고 이 경합의 증거는 어댑터·런타임 시임에 있다"로 고쳐 적는다. **그리고** 삭제가 메시지 왕복을 하나 더 타므로 정착 대기(`smoke.mjs:4390`의 `8000`)가 충분한지 실측하고 모자라면 그 값만 올린다. **두 편집 모두 단언 0줄 변경이지만 순수 추가가 아니라 `guard:test-touch`에 걸리며, 둘 다 승인됐다.** 클론 픽스처(:4278-4341)는 지우지 않고 새 시나리오·새 번호도 만들지 않는다
- [ ] C-9. 실패 보고가 얇아지지 않는다 — 잔여 개수가 렌더러까지 그대로 도착해 `snapshotDeleteFailed`·`snapshotDeleteRemaining`(`backup-panel.tsx:187`)이 지금과 같은 문구를 낸다. 개수를 오류 문자열에 접어 넣지 않는다(`CommandResult`는 `error: string`뿐이다, `stateStore.ts:116-118`)
- [ ] C-10. **일괄 클라우드 삭제·전체 초기화·복원 경로는 바꾸지 않는다** — `clearCloudBackups`(`backupStore.ts:135-146`)·`performFullReset`(`src/core/reset.ts`)·복원(`backup-panel.tsx:192-`)은 그대로다. `backup-panel.tsx:90`의 저장소 전환 경합(릴리스 r1 R-5 이월)도 범위 밖

## 근거 문서

- 게이트 아티팩트: `docs/reviews/wide-ui-redesign/release-r2.json` (finding 본문 전문)
- 원장: `docs/reviews/wide-ui-redesign/decisions.md` — `### release r2 — auto-triage`, `### ESCALATION guard:zero-accepts 2026-07-28T07:50Z`, `### 인간 결정 — 릴리스 r2 critical 3건 처분 2026-07-28`
- 스펙 개정: `docs/reviews/wide-ui-redesign/spec.md` Testing Decisions (어댑터·런타임 시임 지명) 및 Out of Scope (`bk:` 단일 writer는 이관 트랜잭션 제외 대상이 아님)
