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
