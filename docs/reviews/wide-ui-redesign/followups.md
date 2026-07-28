# wide-ui-redesign — follow-ups

`/feature-loop`가 티켓·게이트 리뷰에서 **defer**로 판정한 항목. 각 항목의 판정 근거는
`docs/reviews/wide-ui-redesign/decisions.md`의 같은 ID 행에 있다.

## T06-R-4 — 적용-실패 판정의 중복 (badge.ts ↔ status-summary.tsx)
"applyError면 걸린 게 아니다"라는 같은 판단을 `src/core/badge.ts:29`와
`src/features/.../status-summary.tsx:24`가 각자 표현한다. 파생값(예: `appliedRuleCount`)을
`src/core/summary.ts`로 올리면 툴바와 패널이 한 답을 공유한다. — Fowler: Duplicated Code + Feature Envy.

## T06-R-5 — `HIDDEN` 이름이 색을 배신한다
`src/core/badge.ts:15`의 `const HIDDEN: BadgeSpec = { text: '', color: PAUSED_COLOR }` —
"숨김"이 일시정지 회색을 나른다. 세 사용처 중 둘에서 이름과 값이 어긋난다. — Fowler: Mysterious Name.

## T06-R-6 — `Profile.shortLabel`이 죽은 필드가 됐다
티켓 06이 툴바 배지를 프로필 표시기에서 카운터로 바꾸면서 `shortLabel`의 유일한 렌더
소비자가 사라졌다. 그런데 `profile-section.tsx:85`의 편집 입력과 `commands.ts:268`의 2자
불변식은 남아 있어, 사용자가 고쳐도 아무 데도 보이지 않는다. 퇴역시키거나 새 용처를 준다.
티켓 10(셸 구조 재작업)이 자연스러운 자리다.

## T06-R-7 — 스모크 N-시리즈 번호 순서
`scripts/smoke.mjs:2344`에서 N37이 N36 앞에 삽입돼 파일 내 번호 순서가 어긋난다. 동작에는
영향이 없다.

## T06-R-8 — `badgeCountNote` 보조 문구
설정의 배지 토글 아래 보조 설명은 티켓 06 스펙에 없는 추가다. "표시 여부만 제어"를
오해하지 않게 하는 최소 문구라 남기되, 문구 자체는 카피 리뷰 대상이다.

## T06-R-1 — 배지 보조 문구가 raw 램프 색이라 대비 미달 (accept 되었으나 미적용)
`src/features/preferences/preferences-panel.tsx:82`의 `text-zinc-500`은 시맨틱 토큰 규율을
벗어나고 다크에서 대비 약 3.8:1로 4.5:1 기준에 미달한다(`dark:` 변형도 없다). 같은 커밋의
스모크 N36이 `--muted-foreground` 토큰만 재기 때문에 raw zinc는 그 게이트를 통째로 빠져나간다.
고칠 값은 `text-muted-foreground`. **CR-1 r1에서 accept 되었지만 적용되지 못했다** — R-3의
최소 수정이 fix 커밋의 3파일 한도를 다 써서 `guard:blast-radius`에 걸렸다. 접근성 위반이므로
릴리스 게이트 전에 처리하는 것이 맞다.

## T06-R-2r — `badgeVisible` 주석의 ADR 오인용 잔여분 (accept 되었으나 미적용)
`715a93b`가 `badge.ts`·`badge.test.ts`의 인용은 스펙 R-5로 정정했지만, `src/core/model.ts`의
같은 주석은 같은 `guard:blast-radius` 때문에 남았다. ADR 0015에는 배지 카운터도 표시 토글도
없다 — 인용을 스펙으로 바꾸거나 ADR에 항을 더한다.

## T07-R-7 — `readSyncKV`가 호출자 없이 남았고 이름도 거짓
`src/platform/backupStore.ts:37`에 "기존 호출부 호환"으로 남았지만 리포 전체에 소비자가 없다
(전량 `readBackupKV`로 이동). 게다가 이제 sync 구역 전체가 아니라 `bk:` 네임스페이스만
돌려주므로 이름이 동작과 어긋난다. 삭제. — Fowler: Middle Man + Mysterious Name.

## T07-R-8 — `planBackup`의 limits 기본값이 잘못된 예산을 통과시킨다
`planBackup(…, limits: BackupLimits = SYNC_LIMITS)` — 프로덕션 호출부는 모두 명시로 넘기고
기본값은 기존 테스트만 먹인다. "종류·상태가 늘면 타입이 먼저 깨지게 한다"는 저장소 규율과
반대로, local에 쓰면서 sync 예산으로 계획하는 새 호출부가 컴파일을 통과한다. 기본값을 없애고
테스트가 넘기게. — Fowler: Speculative Generality.

## T07-R-9 — `'bk:'` 리터럴 반복
`src/core/backup.ts`에서 `chunkKey`, 264행, `backupNamespace` 세 곳에 흩어져 있다. 접두사
상수 하나로. — Fowler: Primitive Obsession.

## T07-R-10 — 성공 안내 문구가 라이브 리전이 아니다
백업 패널의 성공 문구 `{notice && <p>}`는 스크린리더에 알려지지 않는다. 실패만
`AlertBanner role=alert`를 탄다. 성공도 알려야 대칭이 맞는다.

## T07-R-11 — 삭제 버튼의 `disabled={!cloudPresent}`
티켓은 "자체 확인 + 삭제 검증"만 요구했고 잔존 여부로 버튼을 잠그라고 하지 않았다. T07-R-1의
거짓 false와 겹치면 잔재가 있는데도 지울 수단이 잠긴다. R-1 수정 후 이 잠금이 여전히 필요한지
다시 볼 것.

## T07-R-12 — `cloudSyncKeepsHistory` 세 번째 안내 문단
티켓의 상태 문구 계약은 "켜짐/꺼짐 + 클라우드 잔존 여부" 둘이다. 무해하지만 추가분이라
카피 리뷰 대상.

## T07-R-6 — 내부 식별자·i18n 키의 `cloud` (accept 되었으나 미적용)
`CONTEXT.md` Backup의 `_Avoid_: cloud sync`는 도메인·내부 층위를 덮고, 예외는 **사용자 대면
라벨 값**뿐이다. 그런데 `hasCloudBackups()`/`clearCloudBackups()`, props
`loadCloudPresence`/`clearCloud`, state `cloudPresent`/`cloudRevision`, i18n 키
`cloudSync`·`cloudBackupsPresent/None`·`deleteCloudBackups`·`cloudDeleteFailed` 등 10개에
박혀 있다. `hasSyncBackups`/`clearSyncBackups`, 키는 `syncBackup*`으로. ko/en 값은
'클라우드 동기화' 그대로 둔다. **CR-1 r1에서 accept 되었지만 최소 리네임이 5파일
(backupStore.ts · backup-panel.tsx · i18n.ts · backup-panel.stories.tsx · backupStore.test.ts)로
커밋당 3파일 한도를 넘어 `guard:blast-radius`에 걸렸다** — fix가 아니라 별도 변경으로 다뤄야
한다는 신호다.

## T08-R-6 — 백업 패널의 2단계 확인 상태가 셋
`resetEverything`은 `deleteCloud`와 한 줄씩 같은 형태다(확인 가드 → 확인 해제 → `setNotice(null)`
→ await → `setError`/`setNotice` → `setCloudRevision(n+1)` → 스냅샷 재로딩). 한 컴포넌트에
`confirmingId`·`confirmingClear`·`confirmingReset` 셋이 산다. 하나로 뽑을 것. — Fowler: Duplicated Code.

## T08-R-7 — 오류 사유 포맷터 중복
`src/core/reset.ts`의 `reason(error)`와 `src/features/backup/backup-panel.tsx:41`의 `reasonText`가
본문이 같다. — Fowler: Duplicated Code.

## T08-R-8 — `resetToDefaults()`가 위임만 한다
`src/core/commands.ts:320`이 `createDefaultState()`를 그대로 감싼다. — Fowler: Middle Man.

## T08-R-9 — `CLEARED_TARGETS` 이름과 `applied` 가변 상자
`CLEARED_TARGETS`는 "이미 지운"으로 읽히지만 실제로는 "지울 목록"이다.
`background-bootstrap.ts`의 `const applied: { state?: StoredState } = {}`는 반환 통로를 객체로
위장한 가변 상자다. — Fowler: Mysterious Name.

## T08-R-10 — `suspendAutoBackup`의 불필요한 유니온 + 중복 가드
`suspendAutoBackup(): void | Promise<void>`는 두 구현 다 동기이고 스펙에 비동기 요구가 없다.
`reset.ts`의 `if (keys.length > 0)`는 `backupStore.removeBackupKeys`의 조기 반환과 겹친다.
— Fowler: Speculative Generality.

## T08-R-5b — 전체 초기화 개념이 `CONTEXT.md` 용어집에 없다
티켓 08이 새 도메인 개념을 들여왔는데 `CONTEXT.md` 항목이 없다. 코드 쪽 이름 분열은 CR-1 r1의
R-5로 통일하지만, **용어집 등재와 `_Avoid_` 줄을 정하는 것은 도메인 결정이라 사람 몫으로 남긴다**
— 기계가 표준 문서를 자기 코드에 맞춰 쓰는 것은 스펙을 고치는 것과 같은 종류의 부식이다.

## T09-R-2 — `COMMAND_LABELS`가 커맨드 이름을 타입에 고정하지 않는다
`src/core/shortcuts.ts:29`의 `Record<string, MessageKey>`. 매니페스트 커맨드는 닫힌 집합인데
(`wxt.config.ts`: `_execute_action`, `toggle-pause`) 타입이 `string`이라, 커맨드가 늘어도 컴파일이
깨지지 않고 화면에 원시 기계 이름이 샌다. 레포 규율은 "종류·상태가 늘면 타입이 먼저 깨지게 한다".
미지 이름에 관대한 조회 자체는 유지한 채 `Record<CommandName, MessageKey>`로 좁히면 분리 가능.

## T09-R-3 — 테마 블록과 언어 블록의 중복
`preferences-panel.tsx:88-99` vs `119-127`. 캡션 span + `ChoiceChips` + `Record<T, MessageKey>`
라벨맵 + 단일 필드 커맨드로 모양이 같다 — Fowler: Duplicated Code. 두 번째 인스턴스는 임계일 뿐
강제는 아니지만, `<ChoiceSetting>` 하나로 접을 수 있다.

## T09-R-5 — `shortcuts.ts`의 요구되지 않은 일반성
티켓은 "등록된 두 커맨드를 표시"만 요구하는데 미지 커맨드 원시 이름 통과·이름 없는 항목 제거·
공백 정규화까지 다루고, 단위 테스트 5개 중 3개가 그 일반성만 검증한다 — Speculative Generality.

## T09-R-6 — `loadShortcuts?` 주입 prop의 소비자가 하나
소비자가 Storybook 하나뿐이고 어떤 테스트도 쓰지 않는다. 다만 `src/platform/` 시임 관례
(`backupStore.ts`·`stateStore.ts`·`tabs.ts`)와 상충하므로 스타일 판단으로 남긴다.

## T09-R-1b — `preferences-panel.tsx`의 `locale` prop JSDoc 첫 줄이 낡았다
R-4(dd0c7da)가 칩을 저장된 선호에 묶으면서 JSDoc 첫 줄이 실제와 어긋났다. 픽서가 같이 고치면
커밋이 4파일이 되어 `guard:blast-radius`를 밟기에 남겼다. 한 줄짜리 후속.

## T10-R-7 — N41/N41b가 렌더 형태에 걸려 있다
`.group`(Tailwind 유틸리티 클래스), `document.querySelector('nav p')`,
`nav.parentElement`의 `gridTemplateColumns`를 직접 읽는다. 모든 가시 행동을 보존한 리스타일에도
빨개질 수 있어, 브리프의 "테스트는 외부 관측 가능한 행동만 본다"와 상충한다. N41c·N41d도 같은 결.

## T10-R-8 — `ProfileDot` 이름과 파일 응집
`size-2.5 rounded-[3px]` 사각 스와치를 그리는데 이름은 Dot이고, 한 파일이 무관한 export 7개를
담으며(Divergent Change), `IconButton`이 `text?`+`size:'rail'`을 얻어 더 이상 아이콘 전용이 아니다.

## T10-R-9 — `onToggleActive`·라벨 쌍의 관통
`app.tsx` → `profile-sidebar`(3 호출부) → `sortable-profile-list` → `ProfileSelectRow`로
`label`/`toggleLabel`이 함께 흐른다. 두 목록 파일 모두 이미 `useT()`를 들고 있어 행이 스스로
계산할 수 있다 — Data Clumps + Shotgun Surgery.

## T10-R-10 — 카드 껍데기 중복
`rounded-lg border border-border`가 `profile-section.tsx`의 `AnimatePresence` 두 분기에 중복.

## T10-R-11 — `src/ui`의 잔여 raw dark fill
`tokens.ts:7` fieldSolid `dark:bg-zinc-900`, `large-editor.tsx:40`(형제 `popupSurface`는 이미
`bg-popover`로 옮겼다), `toggle-switch.tsx:12` 트랙. 티켓 10이 지명한 범위는 "피처 컴포넌트"라
범위 밖으로 미뤘다.

## T10-R-12 — `ghostInteractive`의 hover 추가
`tokens.ts:32`에 `hover:text-foreground`가 붙어 모든 ghost Button/IconButton/Select에 새 호버
행동이 생겼다. 티켓이 요구한 것은 토큰 개명뿐 — scope creep.

## ~~T10-R-3~~ — en 가시 라벨이 접근성 이름에 포함되지 않는다 (해소됨, 이월 아님)
`Settings`(가시) vs `Show preferences`(접근성) — WCAG 2.5.3 Label in Name 위반이고, 가시 라벨은
티켓 10이 새로 붙였다. 한때 미적용이었던 사유: 두 문자열을 기존 스모크가 정확 일치로 고정한다
(N28 smoke.mjs:3436·3467, N41 smoke.mjs:3515-3516) → `test-weakening`.
**2026-07-27 해소** — 사용자가 옵션 B로 기존 단언 수정을 명시 승인했고(`decisions.md`의
`R-3 [HUMAN CR-1 overrides cr:test-weakening]`), 접근성 이름을 `Show settings`로 고쳐 `1870bb7`로
착지했다. 스위트 그린(352/123). **릴리스 게이트 `--focus` 대상이 아니다.**

## ~~T10-R-6~~ — 레일 라벨 옆에 툴팁이 남았다 (결함 아님으로 확정, 이월 아님)
"Profiles" 라벨 버튼에 호버하면 "Show profiles" 툴팁이 겹친다. 한때 미적용이었던 사유: 티켓 AC1의
`(현재 아이콘+툴팁 → 디자인의 라벨)`이 대체인지 병치인지 스펙 어디서도 소스되지 않았다.
**2026-07-27 해소** — 사용자가 옵션 B로 병치를 확정된 설계로 판정했다(`decisions.md`의
`R-6 [HUMAN CR-1 overrides cr:defect] reject`). 화살표는 아이콘 대체를 뜻하고 툴팁은 유지한다.
코드 변경 없음. **릴리스 게이트 `--focus` 대상이 아니다.**

---

# 릴리스 게이트 r1 이월 (AT-1 defer, 2026-07-27)

아래 두 건은 릴리스 게이트 라운드 1에서 `release:med@asserted`로 defer 판정됐다. 라운드 자체는
R-3(`reserved:migration`) 때문에 정지됐고 **아무 행도 적용되지 않았다** — 이 두 건도 코드에
반영된 것이 없다. 원본은 `docs/reviews/wide-ui-redesign/release-r1.json`.

## R-5 — 활성 백업 저장소 전환에서 늦은 응답이 현재 히스토리를 덮는다
`src/features/backup/backup-panel.tsx:90` (medium/0.95). target이 바뀔 때마다 `loadSnapshots`를
시작하지만 이전 요청을 취소하거나 응답의 target을 확인하지 않는다. local/sync를 빠르게 전환해
이전 저장소 응답이 늦게 도착하면 현재 저장소 화면에 잘못된 목록이 뜨고, restore는
`backup-panel.tsx:150`에서 현재 target과 그 stale entry를 조합해 복원 실패나 잘못된 스냅샷
선택을 유발한다.
**권고**: effect cleanup의 ignore flag나 요청 generation으로 현재 target의 최신 응답만 반영하고,
두 deferred Promise를 역순 resolve하는 테스트를 추가한다.

## R-6 — 커밋된 검증 증거가 UI 릴리스 위험을 검사하지 않는다
`docs/reviews/wide-ui-redesign/verification.md:13` (medium/0.99). 검증 문서는 build·Vitest·smoke·
tsc만 기록한다. `spec.md:137`과 티켓 01/05/10이 요구한 ui-diag의 팝업 760×580, 탭 가로 overflow,
다크·라이트 스크린샷, 시작 지표 증거가 없고 Storybook·bundle-gate도 기록되지 않았다. 문서 자체가
티켓 01–05의 기준 감사를 하지 않았다고 명시하므로, 352/123 통과는 이 UI 리디자인의 레이아웃·
폰트·성능 위험을 승인하는 증거가 아니다.
**권고**: 최종 소스 트리에서 Storybook build·bundle-gate·ui-diag를 돌리고 양 테마 스크린샷,
overflow, 팝업 치수, 시작 지표를 커밋된 검증 증거에 추가한다.

---

# 티켓 14 이월 (2026-07-28)

티켓 14(`스위트 red 정지 해소`)가 범위 밖으로 남긴 두 건. 이 티켓은 읽기 경로의
마이그레이션 커밋을 `commitMigration`으로 내리고(제품) 스모크의 준비 배리어를 관측으로
바꿨다(하네스). 아래는 그 과정에서 드러났지만 이 티켓이 고치지 않은 것들이다.

## T14-1 — `persistState`의 가드는 compare-and-swap이 아니다
`src/core/persist.ts:390-392`의 `isBlockedFromOverwrite(existing)`는 저장된 값이 **이 버전이
읽을 수 있는가**만 본다(`readStoredState(existing).status === 'blocked'`). "내가 읽은 그
값 위에 쓰는가"는 보지 않으므로, 늦게 도착한 쓰기가 더 새 상태를 통째로 덮을 수 있다.
읽을 수 있는 두 v2 상태 사이에서는 가드가 항상 통과하기 때문이다.

관측: preflight5 tip 런 1회에서 20초 내 미수렴. 티켓 14는 **동시 writer를 없애** 그 창을
닫는다 — 읽기 경로(`loadState`)가 더 이상 쓰지 않고, 마이그레이션 커밋은 background
컴포지션 루트 한 곳에서 최초 `converge()` 앞에 한 번만 돈다. 팝업·탭앱은 읽기 전용이다.
**그러나 가드 자체는 그대로다.** 새 writer가 하나라도 더 생기면 같은 창이 다시 열린다.

**권고**: 쓰기 전 읽은 값의 신원(버전 스탬프·리비전 카운터·직전 스냅샷 동일성)을 함께
검사하는 compare-and-swap으로 바꾸고, 두 deferred 쓰기를 역순 resolve하는 테스트를 더한다.
지금은 "쓰기 경로가 하나뿐"이라는 **배치상의 성질**이 유일한 보호막이다.

## T14-2 — 변환하지 않고 남긴 `pollSessionRuleCount` 호출부
티켓 14는 `pollSessionRuleCount`를 지우지 않았다 — 개수가 실제로 바뀌는 자리(→0, →2, →3)
에서는 여전히 유효한 배리어다. **직전 시드의 설치 개수와 기대치가 같아** 배리어가 이전
규칙 세트로 즉시 만족되는 자리만 `pollSessionRuleMatch`/효과 폴링으로 바꿨다.

전수 확인 결과(추측 아님 — 파일 순서대로 직전 기대치와 대조), 기대치가 직전 설치 개수와
같아 배리어가 무효인 자리는 **17곳**이었고 그중 **16곳을 변환**했다: `E2` `E3` `E5` `E6`
`F1` `I1` `K2` `K3` `M2` `M2b` `M2c` `M2d` `M2e` `M4` `N8` `N20a` — 이 가운데 `F1` `I1`
`N8` `N20a`는 이미 효과 폴링을 갖고 있어 손대지 않았다. `K1`과 `M1`은 개수가 실제로
바뀌는 자리였지만(2→1, 0→1) 티켓의 최소 적용 대상이라 함께 내용·효과 배리어를 넣었다.

**남은 1곳: `L1`** — `record('L1: …')`의 단언식은 `shortcutRegistered`(= `chrome.commands
.getAll()`에 `toggle-pause`가 있는가)뿐이라 **네트워크 효과를 읽지 않는다.** 앞의
`pollSessionRuleCount(sw, 1)`은 이전 시드의 규칙 세트로도 만족될 수 있지만, 뒤따르는
`pollSessionRuleCount(sw, 0)`은 Pause가 실제로 규칙을 **0으로** 떨어뜨렸는지를 보므로
개수가 실제로 변한다. 즉 흔들림의 통로가 아니다.

**권고**: L1의 시드가 이 시나리오에서 하는 일이 없다면(단축키 등록만 본다면) 시드 자체를
빼는 편이 더 정직하다. 지금은 "규칙이 걸린 상태에서 Pause가 0으로 만든다"는 맥락을
제공하므로 남겨 두었다.

**감사 자동화**: 위 규율은 `node scripts/audit-smoke-barriers.mjs`가 지킨다 — 최소 적용
대상 11곳(`K1` `K2` `K3` `M1` `M2` `M2b` `M2c` `M2d` `M2e` `M4` `N34b`)에 대해 마지막
`seedProfiles(`와 `record(` 사이의 배리어 존재를 검사하고 없으면 exit 1. `package.json`은
설정 가드라 등록하지 않았다. 새 시나리오는 이 스크립트를 직접 돌려 확인한다.

## 티켓 14 `/code-review` r1 이월 (CR-1 defer, 2026-07-28)

라운드 1의 13행 중 accept 2행(R-1·R-2, 동일 결함)은 커밋 `568da70`으로 닫혔다. 아래 11행은
`docs/reviews/wide-ui-redesign/decisions.md`의 `### ticket 14 code-review r1 — auto-triage`
섹션에서 defer로 판정된 것이고, 전부 **판단 호출**이다(blocking 0건).

### T14-R-3 — 음성 절반이 효과가 아니라 설치만 확인한다
`K2` `E6` `M2c` `M2e` `E5`에서 `setTimeout(300)`을 `pollSessionRuleMatch(...)`로 바꿨는데,
이는 규칙이 **설치**됐음만 증명한다. 구현자 자신이 `K1` 주석에 "설치와 네트워크 반영 사이에도
지연이 있다"고 적었다. 음성 단언은 여전히 틀린 이유로 통과할 수 있고, 대체한 매직 넘버보다
여유가 적다. **권고**: 음성 자리에도 효과 폴링(요청을 실제로 한 번 태우고 헤더 부재를 읽는)
을 넣거나, 최소한 설치→반영 지연의 상한을 한 곳에 문서화한다. 티켓이 처방한 설계의 잔여
약점이지 구현 결함이 아니라 defer.

### T14-R-4 — 테스트가 관측 가능한 행동이 아니라 메커니즘에 걸린다
`src/runtime/background-bootstrap.test.ts:418`의 `expect(order[0]).toBe('commit')`. 테스트
주석 자신이 "메커니즘 잠금"이라 부른다. `review-brief.md`는 "테스트는 외부 관측 가능한
행동만 본다"를 요구한다. 다만 티켓 기준 **A3이 메커니즘 단위 테스트를 명시적으로 요구**했고
같은 파일에 `persistCalls` 선례가 있으며 리뷰어도 soft로 표시했으므로 문서화된 표준의 hard
breach가 아니다. 같은 테스트의 `X-Migrated` 규칙 형태 단언이 준수하는 쪽이다.
**권고**: A3의 잠금 의도를 유지하면서 순서 단언을 관측 가능한 결과(마이그레이션 커밋 전에는
재조정 결과가 관찰되지 않는다)로 바꿀 수 있는지 검토한다.

### T14-R-5 — `readState`→`blocked`→`StateLoadError` 절의 중복 (Duplicated Code)
`src/platform/stateStore.ts:29`. `loadState`와 `commitMigration`에 바이트 동일한 절이 있다.
**권고**: `readOrThrow()` 한 개로 뽑고 양쪽에서 부른다.

### T14-R-6 — 폴링 3연속 패턴의 반복 (Duplicated Code)
`scripts/smoke.mjs`. `pollSessionRuleCount(sw, 1)` → `pollSessionRuleMatch(...)` → 효과
`pollUntil(...)` 3연속이 약 10회 반복된다. 또 `pollSessionRuleCount`는 `pollSessionRuleMatch`
에 `r => r.length === n`을 준 것과 같고, 둘 다 poll→recheck→throw를 되풀이한다.
**권고**: `awaitSeedEffect(sw, {match, effect})` 한 개로 접는다.

### T14-R-7 — `headerOpLive`·`initiatorLive` 이름 (Mysterious Name)
`scripts/smoke.mjs`. 불리언처럼 읽히지만 **술어 팩토리**다.
**권고**: `headerOpMatcher` / `initiatorMatcher` 처럼 반환 종류가 드러나는 이름.

### T14-R-8 — 요구되지 않은 일반성 (Speculative Generality)
세 가지. `scripts/audit-smoke-barriers.mjs`의 `process.argv[2]` 타깃 오버라이드 — 호출부가
없다. `commitMigration`의 `boolean` 반환 — 테스트만 소비한다. `isSeedCall`의
`(?:await\s+)?` 그룹 — 정규식이 앵커되지 않아 추가로 매치하는 것이 없는 죽은 코드.
**권고**: 셋 다 지운다. 필요해지면 그때 되살린다.

### T14-R-9 — 가드가 지키지 못하는 범위
`scripts/audit-smoke-barriers.mjs`의 `SEED_GATED`·`STABLE_GATED`가 **손으로 열거**돼 있어,
헤더가 지키겠다고 선언한 "새 시나리오"가 정확히 이 가드가 놓치는 것이다. 또 `loop.md`의
설정 가드 정책상 `package.json`에 등록하지 않았으므로 스위트에서 자동으로 돌지 않는다.
티켓 기준 A6이 요구한 것은 스크립트의 존재와 red 기준선 대조이고 그것은 met — 여기 적는 것은
가드 **자신의 커버리지 한계**다. **권고**: 열거 대신 `record(` 앞의 마지막 `seedProfiles(`를
전수 스캔하는 방식으로 바꾸고, 스위트에 등록하는 문제는 설정 가드를 푸는 사람이 함께 정한다.

### T14-R-10 — SW 기동마다 늘어난 세 번째 `readState()`
`src/runtime/background-bootstrap.ts:294`. `commitMigration`이 읽기를 하나 더 추가하고
`converge()`를 그 뒤로 미룬다. T14-R-13과 같은 사실을 성능 쪽에서 본 것.

### T14-R-11 — 형제 `paletteProbe`가 여전히 맨 `waitForTimeout(150)`이다
`scripts/smoke.mjs:2425`. `activeAccent`와 **동일한** `matchMedia`→`data-theme` 왕복을 막고
있는데 폴링이 아니라 고정 대기다. 이 티켓이 건드리지 않은 코드라 `cr:out-of-diff`로 defer했고,
구현자도 의도적 범위 밖 보존으로 기록했다. 티켓 56행이 요구한 것은 "같은 폴링이 흡수하는지
확인한다"였고 확인 결과 `activeAccent` 배리어가 흡수한다. **그래도 잠복 flake는 한 줄 옆에
그대로 남아 있다** — 이번 라운드에서 `activeAccent`가 조용히 통과하던 결함(R-1)이 실제로
있었다는 점을 감안하면, 이건 다음에 터질 가장 유력한 자리다. **권고**: 다음 스모크 작업에서
`paletteProbe`도 같은 배리어로 바꾸고 `audit-smoke-barriers.mjs`의 대상에 넣는다.

### T14-R-12 — `commitMigration()`의 `blocked` 시 `StateLoadError` 던지기는 티켓이 명세하지 않았다
`src/platform/stateStore.ts:43`. 티켓 27행은 migrated→persist / already-v2→쓰기 없음 /
전파만 명세한다. 효과는 읽기 불가 저장소에서 SW 기동당 `logError` 1건 추가. 규칙 표에
scope-creep 항목이 없어 CR-1 §28-30의 "잔여 없음" 조항에 따라 판단 호출로 처리했다.
**권고**: 의도된 동작이면 티켓/스펙 문언에 반영하고, 아니면 조용히 무시하도록 되돌린다.

### T14-R-13 — `pollStable`의 전이 이전 표본과 `converge()`의 결합
두 가지. `pollStable`("연속 2회 동일", 티켓 53행)은 두 판독이 모두 전이 시작 전에 떨어지면
**전이 이전 표본**을 돌려줄 수 있다. 그리고 `converge()`·`scheduleBackup()`이
`commitMigration().finally()` 안에서만 돌기 때문에(`src/runtime/background-bootstrap.ts:294`)
저장소 읽기가 멈추면 재조정 전체가 막힌다. 리뷰어가 "티켓 32-35·53행이 처방한 것 그대로 —
일탈이 아니라 기록"이라고 명시했다. **바꾸는 것은 티켓 처방을 뒤집는 결정**이라 픽스가 아니라
후속이다. **권고**: `pollStable`에 최소 관측 창(첫 판독 전 1틱 대기)을 넣을지, `converge()`를
`commitMigration()`과 독립적으로 스케줄할지를 사람이 정한다.

## 티켓 11 `/code-review` r1 이월 (CR-1 defer, 2026-07-28)

라운드 1은 **blocking 0건**으로 픽스 패스 없이 닫혔다. 아래 7행은
`docs/reviews/wide-ui-redesign/decisions.md`의 `### ticket 11 code-review r1 — auto-triage`
섹션에서 defer로 판정된 것이고 전부 판단 호출이다.

### T11-R-1 — 새 주석이 `_Avoid_` 용어 "규칙/rule"을 쓴다
`src/core/i18n.ts:73`, `src/features/modifications/rule-form.tsx`. `CONTEXT.md`는 Modification의
`_Avoid_`로 "규칙/rule"을 지정한다. 다만 레포 전반에 선재하는 관용(`rule-form.tsx` 파일명 자체,
`RULE_KINDS`, `ruleKind`, "Add rule" 버튼)이라 이 diff가 도입한 것이 아니라 상속한 것이고,
리뷰어도 하드 위반이 아니라고 판정했다. **권고**: 용어 정리는 이 티켓이 아니라 레포 전역
리네이밍으로 한 번에 한다 — 부분적으로 고치면 두 용어가 공존해 더 나빠진다.

### T11-R-2 — `darkRow`·`seededRow`의 중복 (Duplicated Code)
`scripts/smoke.mjs:4106`. `hasText`만 다른 동일한 4단 체인이고, 같은
`.locator('.group').filter({ has: … 'Edit' … })` 형태가 `1896` `2199` `3838`행에도 있다.
**권고**: `ruleRowByText(popup, text)` 헬퍼 하나로 접는다.

### T11-R-3 — 케이스 (a)·(b)의 폼 조작 시퀀스 중복 (Duplicated Code)
`scripts/smoke.mjs:4079`. "Add rule → Type 콤보박스 대기 → Header name 입력 → `closeSuggestions`
→ Value 입력 → Save → `waitFormClosed`"가 리터럴 둘만 빼고 그대로 두 번 나온다.
**권고**: `addHeaderRule(popup, {name, value})` 헬퍼.

### T11-R-4 — 근거 문단이 다섯 케이스 중 넷만 열거한다
`scripts/smoke.mjs:4038`. 블록 헤더가 "그래서 넷을 함께 본다"며 (a)-(d)를 열거하는데 아래 코드는
다섯 케이스를 단언한다 — `(e) 종류를 바꿔도 선택이 남는다`와 `keptAcrossKind`가 근거에 없다.
동작 결함이 아니라 낡은 주석이다. **권고**: (e)를 헤더에 추가하고 "넷"을 "다섯"으로 고친다.
낡은 주석은 다음 사람이 근거를 신뢰하지 못하게 만드는 비용을 계속 물린다.

### T11-R-5 — `enableOnSave` 라벨이 수정 모드에서 어색하다 (Mysterious Name)
`src/core/i18n.ts:73`. 키 `enableOnSave` / 문구 "Enable after saving". 수정 모드의 스위치는
규칙의 **현재** `enabled`를 비추므로 이미 살아 있는 규칙에 "after saving"은 맞지 않는다.
JSDoc은 "라벨이 Save 버튼의 효과를 서술한다"고 변호하고 리뷰어도 defensible로 인정했다.
**권고**: 수정 모드에서만 다른 문구를 쓸지, 아니면 "활성 상태로 저장"처럼 두 모드에 다 맞는
문구로 바꿀지 결정한다.

### T11-R-6 — `as Modification` 캐스트
`src/features/modifications/rule-form.tsx:495`. 공통 필드에는 불필요하다. 리뷰어 자신이
"tooling/precedent로 건너뜀"(같은 파일에 선례 14건)으로 분류했으므로 단독으로 고칠 일이 아니다.
**권고**: 그 파일의 캐스트 15건을 함께 걷어내는 별도 작업.

### T11-R-7 — 하위 케이스 (d)의 배리어가 배리어가 아니다
`scripts/smoke.mjs:4138`. `pollUntil(readMod('X-Act-Seeded'), m => m !== null)`은 그 규칙이 수정
이전에 이미 존재하므로 아무것도 막지 않는다. 단언이 **지금** 안전한 이유는 오직 `waitFormClosed`가
persist 뒤에 온다는 인과(`saveItem`은 `result.ok`에서만 폼을 닫고 `executor`는 응답 전에 저장한다)
때문이다. **폼이 낙관적으로 닫히도록 바뀌는 순간 `editKeptOff`는 공허하게 통과한다.**
현재는 올바르므로 결함이 아니라 잠복 취약성이다. **권고**: 수정 후의 `enabled=false`를 저장소에서
읽는 폴링(값 자체를 보는 것)으로 바꿔 인과에 기대지 않게 한다. 티켓 14의 T14-R-11과 같은 계열의
"한 줄 옆에 남은 잠복 flake"다.

## 티켓 12 `/code-review` r1 이월 (CR-1 defer, 2026-07-28)

라운드 1은 blocking 1건(R-1, 경계되지 않은 삭제 스윕)을 accept해 픽스로 닫았다. 아래 6행은
`decisions.md`의 `### ticket 12 code-review r1 — auto-triage` 섹션에서 defer로 판정된 것이다.

### T12-R-2 — 반쯤 지워진 상태의 보고가 거꾸로다
`src/platform/backupStore.ts:116`. 매니페스트가 먼저 커밋되므로 `removeBackupKeys`가 던지면
행은 이미 목록에서 사라졌는데 배너는 "삭제하지 못했다"고 말한다. **데이터 순서 자체는 옳다** —
`planBackup`의 `preRemoves` 루프(`backup.ts:263-269`)가 고아 청크를 수거하고, `found:false`여도
고아 `removeKeys`를 돌려주므로 재시도가 멱등하게 동작한다. UI 메시지의 혼선이다.
**권고**: 청크 삭제 실패 시 배너 문구를 "행은 목록에서 지웠지만 저장소에 잔여가 있다"로 나누거나,
재시도 버튼을 제공한다.

### T12-R-4 — 주석이 실제보다 강한 안전 성질을 주장한다
`src/features/backup/backup-panel.tsx:72`. "다른 파괴적 동작을 켜는 것이 앞의 확인을 그대로
취소한다"는 **행 사이에서만** 참이다. `confirmingClear`와 `confirmingReset`은 별개 불리언이라
파괴적 확인 셋이 동시에 무장될 수 있다. 동작 결함이 아니라 주석의 과장이지만, 안전 성질을
주장하는 주석은 다음 사람이 그것을 믿고 설계하게 만든다. **권고**: 주석을 실제 범위로 좁히거나,
세 확인을 하나의 `Confirming` 유니온으로 합쳐 주장을 참으로 만든다(T12-R-5와 같이 처리하면 좋다).

### T12-R-5 — `removeSnapshot`·`restore`의 arm-then-run 중복 (Duplicated Code)
`src/features/backup/backup-panel.tsx:173`. 바이트 동일한 서두를 공유하고, 파일이 확인 메커니즘을
셋 이고 있다. **권고**: `armThenRun(entry, action, run)` 하나로 셋을 다 태운다.

### T12-R-7 — `DeleteSnapshotResult` 별칭 (Middle Man)
`src/platform/backupStore.ts:105`. `DeleteSnapshotResult = ClearCloudResult`는 타입이 아니라
이름만 더한다. 더 나쁜 것은 순서 근거(왜 매니페스트를 먼저 커밋하는가)가 그 **별칭**에 docblock돼
있어 정작 그것이 규율하는 `deleteBackupSnapshot`에서는 보이지 않는다는 점이다.
**권고**: 별칭을 지우고 근거 주석을 `deleteBackupSnapshot` 본문 위로 옮긴다.

### T12-R-8 — 티켓이 울타리 친 R-1 경로를 개명이 건드렸다
`src/features/backup/backup-panel.tsx:134`. 티켓 16행은 "일괄 '클라우드 백업 삭제'(스펙 R-1)…는
이 티켓에서 바꾸지 않는다"고 했는데 `clearFailureDetail`이 `verifiedDeleteDetail`로 개명·재서명되고
`deleteCloud` 호출부가 수정됐다. **동작은 동일**(같은 키 전달)하고 기준 감사도 R-1/R-3 경로 코드가
기준선과 바이트 동일함을 확인했으므로 결함은 아니다. 기록으로만 남긴다 — 울타리 친 경로는 이름도
건드리지 않는 편이 릴리스 게이트에서 설명하기 쉽다.

### T12-R-10 — 첫 삭제 클릭 뒤 정착 창 없는 음성 단언
`scripts/smoke.mjs`. `armed = await bkView(snapArea)`를 첫 클릭 직후 정착 창 없이 읽는다(같은
가드에 대해 N39는 `waitForTimeout(1000)`을 쓴다). 클릭이 실제로 지웠다면 비동기 쓰기가 아직
안 내려앉아 `armedNothingRemoved`가 그냥 통과한다. `deleteArmed`가 그 시나리오에서 실패하므로
**단독 가드가 아니라 중복 가드**여서 defer했다.

**이 루프에서 "공허해질 수 있는 단언"이 세 번째다** — T14-R-11(형제 `paletteProbe`의 고정 대기),
T11-R-7(인과에만 기댄 (d) 케이스), 그리고 이것. 셋 다 개별로는 "지금은 맞다"로 통과했다.
**권고**: 개별 수정보다, 스모크에 "음성 단언 앞에는 값을 직접 읽는 폴링을 둔다"는 규율을
`audit-smoke-barriers.mjs`가 기계적으로 강제하도록 확장하는 편이 값이 크다.