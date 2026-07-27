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
