# wide-ui-redesign — 설계 결정 (Stage 1 그릴링 결과)

원천: claude_design 프로젝트 "Mod Header 크롬 확장프로그램 디자인"
(`HeaderKit 확장 UI.dc.html` → `RulePopup 아코디언` → `RuleForm`). 다크·고밀도 개발자도구 대시보드.

## 확정된 갈림길

1. **표면·크기** — 디자인의 1100×700은 **탭 앱(app.html)** 참조 크기로. 팝업은 **760×580 유지**(ADR 0005 그대로, Chrome 800×600 한계). 셸 구조(레일+프로필열+본문)는 이미 두 표면 공유물이라 리스타일만 얹는다.

2. **테마** — **테마 스위치 도입**(다크/라이트/시스템), 선택을 storage에 영속화. **ADR 0004의 "스위치 없음"을 개정**한다. 디자인의 다크 팔레트(#0a0a0a/#0f0f0f/#141414/#1c1c1c/#262626, 텍스트 #ededed)가 새 다크 모드가 되고, 라이트는 디자인에 맞춰 파생한다. global.css의 기존 `[data-theme]` 훅을 영속 스위치로 승격.

3. **규칙 종류** — 디자인의 기능을 **전부** 구현. 5종(request-header/response-header/cookie/set-cookie/redirect) 유지 + 새로:
   - **ua** (User-Agent 변경) — request-header의 특수 케이스(name=User-Agent 고정)를 별도 종류로.
   - **block** (요청 차단) — declarativeNetRequest `block` 액션. **새 컴파일 경로 + 검증(name/value 없음) + "요청 차단" 안전성 검토** 필요.
   - **del** (헤더 삭제) — 아래 4 참고.
   유비쿼터스 언어(CONTEXT.md "다섯 가지")를 개정한다.

4. **del 모델링** — `del`은 이름이 같은 헤더를 **요청·응답 양쪽에서 제거**. 디자인의 "req/res 구분 없는 한 종류"와 일치. dNR 규칙 하나에 removeHeaders(request)+removeHeaders(response).

5. **폰트** — **Geist·Geist Mono 로컬 번들**(@fontsource-variable/geist, 자가 호스팅 woff2). 원격 Google Fonts는 배제(확장 프라이버시·CSP). design-system.md의 "무번들 웹폰트" 원칙 개정. shadcn base-nova 기본 폰트와도 일치.

6. **디버그/로그 토글** — **제외**. onRuleMatchedDebug(declarativeNetRequestFeedback)는 개발자 모드 전용이라 배포판에서 무동작. 설정에서 이 행을 뺀다.

7. **백업 동기화 토글** — **실제 local↔sync 스위치**. ON=storage.sync(기기 간), OFF=storage.local(이 브라우저만). 디자인 상태 문구("꺼짐 — 이 브라우저에만 저장됩니다")와 일치. CONTEXT.md의 Backup 용어("cloud sync 피하라")를 사용자 대면 라벨 "클라우드 동기화"와 화해시킨다.

8. **언어** — **ko/en만**. 디자인의 ja 선택지는 제거(미번역 JA 문자열을 넣지 않는다).

## 라이브러리 선택 (확정, 질문 아님)

디자인이 밀집 제품 대시보드라 ui-stack 규칙이 답을 정한다:
- **기반**: shadcn + Base UI + Tailwind v4 — 방금 마이그레이션한 스택 그대로, 새 도입 없음.
- **모션**: Motion — 이미 있음.
- **Dice UI / Coss UI**: 테이블·차트·리치텍스트·복잡 콤보박스 concern이 없어 채택 안 함.
- **Magic / Cult / Aceternity UI**: 마케팅 이펙트 카탈로그 — "밀집 제품 UI에 쓰지 말라"(ui-stack)라 채택 안 함.

## 소소한 항목 (명확한 기본값으로 확정)

- **레일**: 아이콘 + 텍스트 라벨(프로필/백업/설정) 노출. 현재는 아이콘+툴팁이었으나 디자인을 따른다.
- **프로필 열**: 검색 + 색 스와치 + 인라인 토글 스위치 + "새 프로필". 디자인 레이아웃 채택.
- **아코디언 편집**: 규칙 행의 수정 아이콘 → 그 규칙이 맨 위로 정렬 + RuleForm 인라인 펼침. 저장 시 접힘. (ADR 0006/0009와 정합.)
- **단축키 패널**: 설정에 **읽기 전용**으로 현재 등록된 커맨드(_execute_action, toggle-pause)를 표시. 디자인의 특정 키(Alt+Shift+N 등)는 예시로 보고, 새 키보드 커맨드 추가는 하지 않는다(범위 억제).
- **배지 토글**: "활성 규칙 개수 배지 표시" — 기존 badge 로직(core/badge.ts)에 연결하는 영속 설정.
- **전체 초기화**: 2단계 확인(한 번 더 눌러 확인) 후 공장 초기화.
- **accent**: 디자인의 blue(#1d4ed8/#2563eb)로. 단일 accent 원칙은 유지.

## 후속 도메인 문서 갱신 (Stage 2 하우스키핑에서 커밋)

- CONTEXT.md: Modification 종류에 ua·block·del 반영, Backup 동기화 토글 용어 화해.
- 새 ADR: (a) 테마 스위치 도입(0004 개정), (b) ua/block/del 종류 추가, (c) Geist 번들(무번들 원칙 개정), (d) 백업 local↔sync 스위치.
- design-system.md: 다크 팔레트·accent·폰트 갱신.

## 이월 (이번 범위 밖)

- 디버그/로그 실시간 패널(개발자모드 전용 API).
- 일본어(ja) 번역.
- 새 키보드 커맨드(Alt+Shift+N 등).

## 게이트 결정

### plan r1
R-1 accept — 저장소 대상 변경 시 기존 백업 처리: 원자적 전환 절차·프라이버시 삭제·충돌 병합 + 테스트
R-2 accept — 새 종류 버전 호환성: v1→v2 범프, 미지 미래 포맷 무변형 거부, import 미지 종류 오류 거부(조용한 폐기 아님) + N/N-1 테스트
R-3 accept — 전체 초기화 범위·순서: 지우는 키·상태 열거, 자동 백업 중단→재개, 부분 실패 비커밋 + 테스트
R-4 accept(범위 축소) — Block 최소 가드레일만 확정(넓은 스코프 경고·확인 + 실효 스코프 표시 + Pause 탈출구); 보호 URL·자동 복구는 이월
R-5 accept — 툴바 배지를 적용-규칙 카운터로(요약에서 급전), 유저스토리 #29 라벨 수정, 상태별 테스트

### plan r2
R2-2 accept — v1→v2 권위 상태 마이그레이션 명시(전 프로필·규칙 보존, 검증 후 persist, 실패 시 default 대체 금지)
R2-1 accept(단순화) — sync 스위치는 앞으로의 위치만; 암묵적 이관 제거; 클라우드 삭제는 별도 명시 동작(삭제 검증)
R2-3 accept(단순화) — 초기화는 설계상 파괴적·멱등·재시도; 롤백 약속 철회
R2-4 accept(단순화) — 암묵적 이관 제거로 자동 백업 경쟁 소멸(직렬 writer 불필요)
WAIVED by user: 라운드 3 재검토 면제 — 위 단순화·마이그레이션 반영으로 게이트 통과(옵션 A)

### structure r1
S-1 accept — Dark palette changes are installed in theme-independent ramps: 베이스 램프(zinc/blue) 복원, 디자인 다크 팔레트를 @theme의 명명 토큰(--color-dark-*)으로 신설해 @variant dark만 참조, 시맨틱 계층의 hex 리터럴 제거, 다크 --ring 명시. 스모크 N34(팔레트 격리 절대값)로 회귀 방어망 추가

### structure r2
S-1 resolved — 라운드 1 지적(다크 팔레트가 테마 중립 램프에 설치됨)이 b8c8849로 해소 확인됨
S2-1 accept — Raw-blue public primitives bypass the new dark palette seam: accentBg/focusRing/fieldFocus를 시맨틱(primary/ring)으로, ToggleSwitch·ChipGroup·profile-section의 raw blue 소비자 전환. 스모크 N34b(렌더된 활성 컨트롤이 시맨틱 accent를 탄다)로 N34의 사각지대(루트 변수만 검사) 보완
WAIVED by user: 라운드 3 재검토 면제 — S2-1 반영으로 게이트 통과(옵션 A)

### ticket 06 code-review r1 — auto-triage
_policy CR-1 · feature-loop/policies/ticket-review-cr1.md · sha256 27ad2f0313d78a9b · decided 2026-07-26T07:20:38Z · fixed point 23778cde33d4cf10f1cc43fec4ff602f0f56218d · ticket .scratch/wide-ui-redesign/issues/06-applied-rule-badge.md_

R-1 [AUTO CR-1 cr:standard] accept — Standards: raw 램프 색 `text-zinc-500` 보조 문구가 시맨틱 토큰 규율과 본문 대비 4.5:1을 함께 벗어나고 `dark:` 변형도 없다; -/-; src/features/preferences/preferences-panel.tsx:82; res:none; not applied (guard:blast-radius — R-3의 최소 수정이 3파일 한도를 다 썼다); follow-up docs/reviews/wide-ui-redesign/followups.md#T06-R-1
R-2 [AUTO CR-1 cr:standard] accept — Standards: `badgeVisible` 주석이 ADR 0015에 없는 결정을 그 ADR로 귀속한다(실제 출처는 스펙 R-5); -/-; src/core/model.ts:403; res:none; applied in part 715a93b (badge.ts·badge.test.ts 인용 정정); model.ts 잔여는 not applied (guard:blast-radius); follow-up docs/reviews/wide-ui-redesign/followups.md#T06-R-2r
R-3 [AUTO CR-1 cr:defect] accept — Spec: applyError 시 배지가 빈 텍스트라, 원자적 갱신 실패로 직전 N개가 그대로 적용 중인 상태를 "0개 적용"으로 표시해 라벨과 값이 어긋난다; -/-; src/core/badge.ts:29; res:none; applied 715a93b (3 files, 51 lines); suite green vitest 309/309 + smoke 115/115
R-4 [AUTO CR-1 cr:smell] defer — Standards: Duplicated Code + Feature Envy — "적용 실패면 걸린 게 아니다" 판정을 badge.ts와 status-summary.tsx가 각자 표현한다; -/-; src/core/badge.ts:29; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T06-R-4
R-5 [AUTO CR-1 cr:smell] defer — Standards: Mysterious Name — `HIDDEN`이 일시정지 회색을 나른다; -/-; src/core/badge.ts:15; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T06-R-5
R-6 [AUTO CR-1 cr:out-of-diff] defer — Standards·Spec 양축: `Profile.shortLabel`이 렌더 소비자를 잃어 죽은 필드가 됐다(편집 입력과 2자 불변식은 남음); -/-; src/core/model.ts:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T06-R-6
R-7 [AUTO CR-1 cr:smell] defer — Standards·Spec 양축: 스모크 N37이 N36 앞에 삽입돼 파일 내 번호 순서가 어긋난다; -/-; scripts/smoke.mjs:2344; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T06-R-7
R-8 [AUTO CR-1 cr:smell] defer — Spec: `badgeCountNote` 보조 문구는 스펙에 없는 추가(오해 방지용 최소 문구); -/-; src/features/preferences/preferences-panel.tsx:82; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T06-R-8

### ticket 07 code-review r1 — auto-triage
_policy CR-1 · feature-loop/policies/ticket-review-cr1.md · sha256 27ad2f0313d78a9b · decided 2026-07-26T08:12:04Z · fixed point 8776802169b550d16350a56b6e24436fe611e2ed · ticket .scratch/wide-ui-redesign/issues/07-backup-sync-switch.md_

R-1 [AUTO CR-1 cr:defect] accept — Spec: 잔존 조회 실패에 catch가 없어 cloudPresent가 초기값 false로 남고, 잔재가 있는데도 "클라우드에 백업이 없습니다"라는 거짓 표시가 오류 없이 발생한다 — 티켓이 막으려던 바로 그 표시; -/-; src/features/backup/backup-panel.tsx:70; res:none; applied bafeb77 (2 files, 37 lines) — 잔존 상태를 'unknown'|'present'|'none'으로 바꿔 조회 실패가 '없음'으로 읽히지 않게 하고 사유를 배너로 표면화, 삭제 버튼도 잠그지 않는다
R-2 [AUTO CR-1 cr:defect] accept — Spec: 잔존 표시가 토글·자동 백업 이후 갱신되지 않아, sync를 켜고 첫 스냅샷이 클라우드에 착지해도 패널을 닫았다 열기 전까지 "없습니다"가 유지된다; -/-; src/features/backup/backup-panel.tsx:70; res:none; applied bafeb77 (R-1과 같은 효과 블록)
R-3 [AUTO CR-1 cr:missing-seam-test] accept — Spec: 티켓이 명시한 "클라우드 삭제 검증·실패 표면화"가 어느 시임에서도 테스트되지 않는다 — backup.test.ts는 순수 함수만, 스모크 N38은 삭제 버튼을 누르지 않는다; -/-; src/platform/backupStore.ts:88; res:none; applied ec50932 (1 file, 77 lines) — 새 src/platform/backupStore.test.ts로 삭제 성공·실패 두 경로
R-4 [AUTO CR-1 cr:standard] accept — Standards: 백업 패널 뮤티드 텍스트 4곳이 raw `text-zinc-500`에 `dark:` 짝도 없어 다크에서 약 3.6:1로 본문 4.5:1 미달; -/-; src/features/backup/backup-panel.tsx:130; res:none; applied 6c555b8 (1 file, 8 lines)
R-5 [AUTO CR-1 cr:standard] accept — Standards: 사용자 대면 오류 문자열이 i18n 카탈로그를 우회해 ko 로케일에서도 영어로 렌더된다; -/-; src/platform/backupStore.ts:-; res:none; applied b7fe41a (3 files, 27 lines)
R-6 [AUTO CR-1 cr:standard] accept — Standards: 내부 식별자·i18n 키의 `cloud`가 CONTEXT.md Backup의 `_Avoid_: cloud sync`를 위반한다(예외는 사용자 대면 라벨 값만); -/-; src/platform/backupStore.ts:-; res:none; not applied (guard:blast-radius — 최소 리네임이 5파일: backupStore.ts·backup-panel.tsx·i18n.ts·backup-panel.stories.tsx·backupStore.test.ts); follow-up docs/reviews/wide-ui-redesign/followups.md#T07-R-6
R-7 [AUTO CR-1 cr:smell] defer — Standards·Spec 양축: `readSyncKV`가 "기존 호출부 호환"으로 남았으나 호출자 0이고, 이제 bk: 네임스페이스만 돌려주므로 이름도 거짓 — Middle Man + Mysterious Name; -/-; src/platform/backupStore.ts:37; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T07-R-7
R-8 [AUTO CR-1 cr:smell] defer — Standards: `planBackup(…, limits = SYNC_LIMITS)`의 기본값이 local에 쓰면서 sync 예산으로 계획하는 호출부를 컴파일에 통과시킨다 — Speculative Generality; -/-; src/core/backup.ts:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T07-R-8
R-9 [AUTO CR-1 cr:smell] defer — Standards: `'bk:'` 리터럴이 backup.ts 안에서 세 번 반복된다 — Primitive Obsession; -/-; src/core/backup.ts:264; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T07-R-9
R-10 [AUTO CR-1 cr:smell] defer — Standards: 성공 안내 문구가 라이브 리전이 아니라 스크린리더에 알려지지 않는다(실패만 role=alert); -/-; src/features/backup/backup-panel.tsx:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T07-R-10
R-11 [AUTO CR-1 cr:smell] defer — Spec: 삭제 버튼의 `disabled={!cloudPresent}`는 티켓이 요구하지 않은 추가이고, R-1의 거짓 false와 겹치면 잔재를 지울 수단까지 잠근다; -/-; src/features/backup/backup-panel.tsx:150; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T07-R-11
R-12 [AUTO CR-1 cr:smell] defer — Spec: 세 번째 안내 문단(`cloudSyncKeepsHistory`)은 티켓의 상태 문구 계약(켜짐/꺼짐 + 잔존 여부) 밖의 추가다; -/-; src/features/backup/backup-panel.tsx:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T07-R-12

### ticket 08 code-review r1 — auto-triage
_policy CR-1 · feature-loop/policies/ticket-review-cr1.md · sha256 27ad2f0313d78a9b · decided 2026-07-26T08:55:36Z · fixed point 223b231d3826928105e50436d0d0f7c7800214c1 · ticket .scratch/wide-ui-redesign/issues/08-full-reset.md_

R-1 [AUTO CR-1 cr:defect] accept — Spec: 부분 실패 후 finally의 resumeAutoBackup이 곧바로 scheduleBackup을 걸고, 실패 경로에선 resetState가 아직 안 돌아 상태가 옛 프로필 그대로라 약 3초 뒤 옛 데이터 스냅샷이 새로 써진다 — 방금 지운 백업이 되살아나고 재개 스냅샷이 스펙의 "깨끗한 default"가 아니다; -/-; src/core/reset.ts:-; res:none; applied 479adcf (3 files, 48 lines) — resumeAutoBackup({snapshot})이 완주한 경우에만 새 스냅샷을 예약하고, 실패 경로는 예약 없이 중단만 푼다
R-2 [AUTO CR-1 cr:defect] accept — Spec: runBackup이 진입 시 한 번만 backupSuspended를 보고 두 await를 지나므로, 가드를 이미 통과한 in-flight 백업은 중단되지 않고 옛 payload 스냅샷이 삭제·검증 이후 착지할 수 있다 — "이 한 줄이 초기화의 유일한 경합을 없앤다"는 주석이 사실이 아니다; -/-; src/runtime/background-bootstrap.ts:135; res:none; applied 625fe19 (2 files, 78 lines) — performBackup 직전 재검사 + suspend가 진행 중 promise를 await; 새 테스트가 수정 없이는 red임을 확인
R-3 [AUTO CR-1 cr:standard] accept — Standards: `CLEARED_TARGETS`가 배열이라 BackupTarget이 하나 늘면 그 저장소가 조용히 안 지워진다 — 파괴적 동작에서 가장 나쁜 실패 형태이고, 저장소 규율은 Record로 못박아 키 누락이 런타임으로 새지 않게 하는 것; -/-; src/core/reset.ts:-; res:none; applied a3bd61a (1 file, 17 lines)
R-4 [AUTO CR-1 cr:standard] accept — Standards: 초기화 실패 문자열이 i18n 카탈로그를 우회해 내부 ResetStep 식별자가 ko 로케일에서도 영어로 배너에 앉는다(같은 파일의 clearFailureDetail이 정반대 선례); -/-; src/runtime/background-bootstrap.ts:-; res:none; applied 97e7e52 (3 files, 35 lines) — 원문 사유는 logError로 남기고 카탈로그 키만 UI로
R-5 [AUTO CR-1 cr:standard] accept — Standards: 코드가 "공장 초기화"(commands.ts·backup-panel.tsx·background-bootstrap.ts)와 "전체 초기화"(reset.ts·stateStore.ts)로 갈렸다; -/-; src/core/commands.ts:314; res:none; applied 9f7e61d (3 files, 8 lines) — 코드 이름만 통일; 용어집 등재는 followups#T08-R-5b로 사람 몫
R-6 [AUTO CR-1 cr:smell] defer — Standards: `resetEverything`이 `deleteCloud`와 한 줄씩 같은 형태이고 한 컴포넌트에 2단계 확인 상태가 셋(confirmingId·confirmingClear·confirmingReset) — Duplicated Code; -/-; src/features/backup/backup-panel.tsx:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T08-R-6
R-7 [AUTO CR-1 cr:smell] defer — Standards: `reset.ts`의 `reason(error)`와 `backup-panel.tsx:41`의 `reasonText` 본문이 동일 — Duplicated Code; -/-; src/core/reset.ts:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T08-R-7
R-8 [AUTO CR-1 cr:smell] defer — Standards·Spec 양축: `resetToDefaults()`가 `createDefaultState()`를 그대로 감싸기만 한다 — Middle Man; -/-; src/core/commands.ts:320; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T08-R-8
R-9 [AUTO CR-1 cr:smell] defer — Standards: `CLEARED_TARGETS`가 "이미 지운"으로 읽히지만 "지울 목록"이고, `const applied: { state?: StoredState } = {}`는 반환 통로를 객체로 위장한 가변 상자 — Mysterious Name; -/-; src/core/reset.ts:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T08-R-9
R-10 [AUTO CR-1 cr:smell] defer — Standards: `suspendAutoBackup(): void | Promise<void>` 유니온은 두 구현 다 동기인데 남았고, `reset.ts`의 `if (keys.length > 0)`는 `removeBackupKeys`의 조기 반환과 중복 — Speculative Generality; -/-; src/runtime/background-bootstrap.ts:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T08-R-10

### ticket 09 code-review r1 — auto-triage
_policy CR-1 · feature-loop/policies/ticket-review-cr1.md · sha256 27ad2f0313d78a9b · decided 2026-07-27T03:08:23Z · fixed point 4acc270ed9c2072a3101cdddb92c674d5bd2f0c2 · ticket .scratch/wide-ui-redesign/issues/09-settings-backup-finish.md_

R-1 [AUTO CR-1 cr:standard] accept — Standards·Spec 양축: `loadShortcuts()`에 거부 핸들러가 없어 `commands.getAll()`이 실패하면 unhandled rejection + `shortcuts.length > 0` 게이트 때문에 단축키 섹션이 통째로 조용히 사라진다 (review-brief "조용한 실패를 두지 않는다", 이웃 BackupPanel은 `.then(set, reason => setError(...))`); -/-; src/features/preferences/preferences-panel.tsx:68; res:none; applied 4da0606 (1 file, 21 lines); suite green 352 unit / 119 smoke — 테스트 없음: 스펙 Testing Decisions가 core/smoke/ui-diag만 시임으로 지명하고 새 시임을 금지해 React 거부 분기가 어디에도 닿지 않는다(픽서 판단, unseamed 아님)
R-2 [AUTO CR-1 cr:smell] defer — Standards: `COMMAND_LABELS: Record<string, MessageKey>`가 닫힌 커맨드 집합을 타입에 고정하지 않아 매니페스트에 커맨드가 늘어도 컴파일이 깨지지 않고 화면에 원시 이름이 샌다; -/-; src/core/shortcuts.ts:29; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T09-R-2
R-3 [AUTO CR-1 cr:smell] defer — Standards: Duplicated Code — 테마 블록과 언어 블록이 같은 모양(캡션 span + ChoiceChips + Record<T, MessageKey> 라벨맵 + 단일 필드 커맨드); -/-; src/features/preferences/preferences-panel.tsx:88; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T09-R-3
R-4 [AUTO CR-1 cr:defect] accept — Spec: 언어 칩이 저장된 선호가 아니라 실효 로케일에 묶여 있어 `?locale=` 오버라이드 페이지에서는 클릭이 저장은 되지만 화면은 그대로고 칩이 되돌아온다 — 설정하는 값과 보여 주는 값이 다르다 (테마 컨트롤은 저장 선호에 묶는 것이 이 레포의 선례); -/-; src/core/i18n.ts:-; res:none; applied dd0c7da (3 files, 48 lines); suite green 352 unit / 119 smoke — `pickLocalePreference`를 core에 두어 스펙이 지명한 시임에서 단언(i18n.test.ts)
R-5 [AUTO CR-1 cr:smell] defer — Spec: `shortcuts.ts`가 티켓이 요구하지 않은 일반성을 처리한다(미지 커맨드 원시 이름 통과·이름 없는 항목 제거·공백 정규화), 단위 테스트 5개 중 3개가 그 일반성만 검증 — Speculative Generality; -/-; src/core/shortcuts.ts:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T09-R-5
R-6 [AUTO CR-1 cr:smell] defer — Spec: `loadShortcuts?` 주입 prop의 소비자가 Storybook 하나뿐이고 어떤 테스트도 쓰지 않는다 — Speculative Generality(판단: platform 시임 관례와 상충하므로 스타일 판단으로 남김); -/-; src/features/preferences/preferences-panel.tsx:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T09-R-6
R-7 [AUTO CR-1 cr:defect] accept — Spec: smoke H2의 기존 단언이 `getByRole('alert').first()`로 느슨해져(백업 화면에 패널 둘이 생기며) 전송 경고가 사라지고 백업 경고가 우연히 JSON을 언급하기만 해도 통과한다 — 구현자가 자기가 쓰지 않은 단언을 약화시켰다; -/-; scripts/smoke.mjs:-; res:none; applied 11dc7aa (1 file, 19 lines, 19+/0− 순수 추가) ; suite green 352 unit / 119 smoke — H2는 바이트 단위로 불변, 새 H2b가 Import 토글을 가진 섹션으로 범위를 좁혀 단언(sections=1, alerts=1). guard:test-touch를 밟지 않는 유일한 합법 경로

### ticket 10 code-review r1 — auto-triage
_policy CR-1 · feature-loop/policies/ticket-review-cr1.md · sha256 27ad2f0313d78a9b · decided 2026-07-27T04:03:54Z · fixed point a6b21c13d6f0d214e407107c6de3263e39e8bcd2 · ticket .scratch/wide-ui-redesign/issues/10-shell-structure-restyle.md_

R-1 [AUTO CR-1 cr:standard] accept — Standards·Spec 양축: 비활성 스와치가 `profile.color`로 테두리를 그려 비텍스트 3:1 하한을 사용자가 고른 색에 맡긴다 — 이 diff가 지운 주석이 바로 그 규칙을 기록하고 있었다("zinc-300은 1.51:1로 하한 3:1에 못 미쳐 zinc-400으로 올린다"), 흰색에 가까운 프로필 색이면 라이트 캔버스에서 스와치가 보이지 않는다; -/-; src/features/profiles/profile-dot.tsx:210; res:none; applied 3fd6de4 (2 files, 38 lines); suite green 352 unit / 123 smoke — 고정 zinc 테두리로 되돌리는 길은 N41이 "비활성 스와치 테두리 == 프로필 색"을 단언해 막혀 있어, 소견의 두 번째 경로(대비를 보장하는 `outline-1 outline-input` 겹치기)를 택했다. 새 스모크 N41c(흰색 프로필 색도 대비 윤곽선을 갖는다)
R-2 [AUTO CR-1 cr:standard] accept — Standards: 드래그 그립의 평상 색이 `text-border`(#e2e2e6, ~1.24:1)로, 대체한 zinc-300보다 오히려 밝다 — global.css가 border를 "장식 구분선" 토큰으로, `--input`을 대비를 지는 형제로 문서화한다; -/-; src/features/profiles/profile-dot.tsx:321; res:none; applied 7773858 (1 file, 4 lines); suite green 352 unit / 123 smoke
R-3 [AUTO CR-1 cr:standard] accept — Standards: en 가시 라벨 `Settings`가 접근성 이름 `Show preferences`에 포함되지 않아 음성 제어가 조준할 수 없다(ko `설정`/`환경설정 화면`은 정상) — 가시 라벨은 이 diff가 새로 붙인 것; -/-; src/app/app.tsx:26; res:none; NOT APPLIED — fix 서브에이전트가 `test-weakening`을 제기: 가시 라벨 `Settings`와 접근성 이름 `Show preferences`를 **둘 다** 기존 스모크가 정확 일치로 고정하고 있다(N28 `railProbe(popup, 'Show preferences')` smoke.mjs:3436·3467, N41의 `'Profiles|Backups|Settings'` + `'Show profiles|Show backups|Show preferences'` smoke.mjs:3515-3516). 어느 문자열을 고쳐도 기존 단언이 거짓이 되고, 티켓 09의 "옆에 좁은 케이스를 추가한다" 해법은 옛 단언이 참으로 남아야 성립하므로 쓸 수 없다. 사람이 테스트와 라벨 중 무엇이 틀렸는지 정해야 한다
R-4 [AUTO CR-1 cr:standard] accept — Standards: 같은 줄을 `text-popover-foreground`/`text-muted-foreground`로 옮기면서 raw `text-red-600 dark:text-red-400`·`hover:bg-red-50`를 남긴 반쪽 이행 — `--color-destructive`가 이미 있다; -/-; src/ui/menu.tsx:64; res:none; applied f1f9123 (2 files, 6 lines); suite green 352 unit / 123 smoke
R-5 [AUTO CR-1 cr:defect] accept — Spec: 티켓이 "그리드 치수를 디자인에 맞춰 넓힘"을 요구했는데 팝업 프로필 열은 좁아졌다(`3rem_14rem` → `8rem_12rem`), 게다가 행마다 36px 스위치가 더해져 이름 칩에 남는 폭이 반토막 — N41은 `cols[0] < cols[1]`만 보므로 이 축소를 볼 수 없다; -/-; src/app/app.tsx:238; res:none; applied cdcfc10 (2 files, 15 lines); suite green 352 unit / 123 smoke — 14rem을 택했다: 티켓이 "넓힘"이라 했으나 목표 폭을 소스할 곳이 없고, 소견이 명시한 하한(라벨화 이전 폭)이 유일하게 소스 가능한 값. 새 스모크 N41d(팝업 프로필 열 ≥ 224px)
R-6 [AUTO CR-1 cr:defect] accept — Spec: 티켓의 "(현재 아이콘+툴팁 → 디자인의 라벨)"을 대체가 아니라 병치로 구현해, "Profiles"라고 적힌 버튼에 호버하면 "Show profiles" 툴팁이 겹쳐 뜬다 — 기준 감사자는 met으로, 스펙 리뷰어는 미완으로 읽었다(티켓 문구가 양쪽으로 읽힌다); -/-; src/app/app.tsx:251; res:none; NOT APPLIED — fix 서브에이전트가 `needs-decision`을 제기: 티켓 AC1의 `(현재 아이콘+툴팁 → 디자인의 라벨)`도, 스펙 user story 19·구현 결정("레일은 아이콘+라벨")도 툴팁을 뺀다고 말하지 않는다 — 대체인지 병치인지 소스 불가. 게다가 제거하려면 기존 N28을 다시 써야 해 `test-weakening`이 함께 걸린다. 사람이 티켓 의도를 정해야 한다
R-7 [AUTO CR-1 cr:smell] defer — Standards: N41/N41b가 렌더 형태(`.group` 유틸리티 클래스, `nav p`, `gridTemplateColumns`)에 걸려 있어 모든 가시 행동을 보존한 리스타일에도 빨개질 수 있다 — 브리프의 "테스트는 외부 관측 가능한 행동만 본다"와 상충; -/-; scripts/smoke.mjs:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T10-R-7
R-8 [AUTO CR-1 cr:smell] defer — Standards: Mysterious Name·Divergent Change — `ProfileDot`이 `size-2.5 rounded-[3px]` 사각 스와치를 그리는데 이름은 Dot이고, 한 파일이 무관한 export 7개를 담으며, `IconButton`이 `text?`+`size:'rail'`을 얻어 더 이상 아이콘 전용이 아니다; -/-; src/features/profiles/profile-dot.tsx:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T10-R-8
R-9 [AUTO CR-1 cr:smell] defer — Standards: Data Clumps·Shotgun Surgery — `onToggleActive`와 `label`/`toggleLabel` 쌍이 app.tsx→profile-sidebar(3 호출부)→sortable-profile-list→ProfileSelectRow를 관통하는데, 두 목록 파일 모두 이미 `useT()`를 들고 있어 행이 스스로 계산할 수 있다; -/-; src/features/profiles/profile-sidebar.tsx:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T10-R-9
R-10 [AUTO CR-1 cr:smell] defer — Standards: Duplicated Code — `rounded-lg border border-border` 카드 껍데기가 `AnimatePresence` 두 분기에 그대로 중복; -/-; src/features/profiles/profile-section.tsx:458; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T10-R-10
R-11 [AUTO CR-1 cr:out-of-diff] defer — Spec: `src/ui`의 잔여 raw dark fill(`tokens.ts` fieldSolid `dark:bg-zinc-900`, `large-editor.tsx:40`, `toggle-switch.tsx:12`) — 티켓이 지명한 범위는 "피처 컴포넌트"이고 기준 감사도 그 범위에서 met으로 확인했다; -/-; src/ui/tokens.ts:7; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T10-R-11
R-12 [AUTO CR-1 cr:smell] defer — Spec: scope creep — `ghostInteractive`에 `hover:text-foreground`가 붙어 모든 ghost Button/IconButton/Select에 새 호버 행동이 생겼다, 티켓이 요구한 것은 토큰 개명뿐; -/-; src/ui/tokens.ts:32; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T10-R-12

R-6 [HUMAN CR-1 overrides cr:defect] reject — 레일 라벨 옆 툴팁 병치는 결함이 아니라 확정된 설계다; -/-; src/app/app.tsx:251; res:none; 사용자 결정 2026-07-27T05:00:25Z(옵션 B) — 티켓 AC1의 화살표는 아이콘 대체를 뜻하고 툴팁은 유지한다. 기계는 이 행을 accept로 판정했으나 티켓 문구가 소스하지 못한 것이 바로 그 판정의 근거였고, 그 판단은 사람 몫이다. 코드 변경 없음
R-3 [HUMAN CR-1 overrides cr:test-weakening] accept — en 접근성 이름이 가시 라벨을 포함하도록 고친다 (WCAG 2.5.3 Label in Name); -/-; src/core/i18n.ts:176; res:none; 사용자 결정 2026-07-27T05:00:25Z(옵션 B) — 기존 스모크 문자열 단언 수정을 사람이 명시적으로 승인하므로 `test-weakening` 차단이 해제된다. **승인됨, 적용 완료**(행 끝 스탬프). 파급: `ariaShowPreferences` en 값 1곳(i18n.ts:176) + `scripts/smoke.mjs`의 `'Show preferences'` 15곳(대부분 내비게이션 호출) = 2파일 약 16줄로 guard:blast-radius 안. ko(`설정` ⊂ `환경설정 화면`)와 `Show profiles`/`Show backups`는 이미 적합해 손대지 않는다. i18n.ts:177-181의 "접근성 이름과 보이는 라벨은 일이 다르다" 주석은 이 결정으로 뒤집혔으므로 함께 고쳐야 한다; applied 1870bb7 (2 files, 38 lines); suite green→green 352 unit / 123 smoke — en 접근성 이름 `Show preferences` → `Show settings`. 파생값은 형제 레일 버튼의 기존 관용(가시 `Profiles`←접근성 `Show profiles`, 가시 `Backups`←접근성 `Show backups`)에서 소스했고 fix 서브에이전트가 소스에서 그 관용을 확인한 뒤 썼다 — 사람이 정한 것은 "가시 라벨을 포함하도록"까지이고 문자열 자체는 known-good behavior에서 도출했다. smoke.mjs 15곳은 1:1 치환(+15/−15, net 0줄)이라 diff-guard `test_weakening`을 건드리지 않는다

### ESCALATION needs-decision 2026-07-27T04:28:08Z

루프 정지. 티켓 10의 code-review r1에서 accept 6건 중 **4건 적용, 2건 미적용** — 둘 다 fix
서브에이전트가 올린 릴레이 코드이고, 컨덕터는 Stage 4에서 스펙 본문을 읽는 것이 금지되어 있어
평가할 수 없다(CR-1: `cr:needs-decision`·`cr:test-weakening` → escalate).

미해결 finding:
- **R-6 `needs-decision`** (src/app/app.tsx:251) — 티켓 AC1 `(현재 아이콘+툴팁 → 디자인의 라벨)`이
  대체인지 병치인지 티켓·스펙 어디서도 소스되지 않는다. 기준 감사자는 met으로, 스펙 리뷰어는
  미완으로 읽었다. 제거가 답이면 기존 스모크 N28을 다시 써야 해 `test-weakening`도 함께 걸린다.
- **R-3 `test-weakening`** (src/app/app.tsx:26 + src/core/i18n.ts:117) — en 가시 라벨 `Settings`가
  접근성 이름 `Show preferences`에 포함되지 않는다(WCAG 2.5.3). 두 문자열 모두 기존 스모크가
  정확 일치로 고정(N28 smoke.mjs:3436·3467, N41 smoke.mjs:3515-3516)하여, 어느 쪽을 고쳐도
  기존 단언이 거짓이 된다.

적용된 행: R-1 3fd6de4 · R-2 7773858 · R-4 f1f9123 · R-5 cdcfc10 — 전부 개별 커밋, 각각 가드
안(≤3파일·≤80줄), 적용 후 전체 스위트 그린(vitest 352, smoke 123/123).
미적용 행: R-3, R-6 (위 사유).

티켓 10은 **열린 채로 둔다** — 리뷰 라운드가 미해결 blocking 행을 남겼으므로 클로즈 조건을
만족하지 않는다. 릴리스 게이트는 실행하지 않았다.

**이 라운드는 CR-1 트리아지이며 `verify-ledger`가 재도출하지 않는다** — `/code-review`는 아티팩트를
내지 않으므로 이 12행은 감사 가능(auditable)하지만 재계산된(verified) 것이 아니다.

### release r1 — auto-triage
_policy AT-1 · review-gate/policies/auto-triage-v1.md · sha256 e7c15be62c42c6a9 · launcher ack=auto-triage · decided 2026-07-27T05:47:26Z · artifact docs/reviews/wide-ui-redesign/release-r1.json_

R-1 [AUTO AT-1 release:high@asserted] accept (NOT APPLIED — round escalated) — 실패한 전체 초기화 뒤 예약 백업이 삭제된 데이터를 재생성한다; high/0.99; src/runtime/background-bootstrap.ts:191; res:none;
R-2 [AUTO AT-1 release:high@asserted] accept (NOT APPLIED — round escalated) — Block 광범위 정규식이 확인 절차를 우회한다; high/0.99; src/core/url-scope.ts:117; res:none;
R-3 [AUTO AT-1 reserved:migration] escalate — v1 마이그레이션이 권위 저장소에 커밋되지 않고 실패도 숨겨진다; high/0.99; src/platform/stateStore.ts:14; res:migration; reserved class — human decision required: irreversible in a way code is not, and the real decision — backfill window, downtime, ordering vs deploy — lives outside the diff
R-4 [AUTO AT-1 release:high@asserted] accept (NOT APPLIED — round escalated) — Spec fidelity: 세 가지 사용자 대면 기능이 배선되지 않았다; high/0.98; src/features/modifications/rule-form.tsx:513; res:none; 인간 결정 2026-07-27T06:40Z — 이 브랜치에서 고친다. 게이트 픽스 한도(≤3파일·≤80줄)로는 user story 3건의 수직 배선이 들어가지 않으므로 티켓으로 분해해 Stage 4 정규 경로(구현→기준 감사→/code-review→클로즈)로 배선한다 → .scratch/wide-ui-redesign/issues/11-save-then-activate.md · 12-snapshot-delete.md · 13-profile-row-status.md. 이 행 자체는 커밋 sha를 갖지 않는다 — 이 행의 처분은 게이트 픽스가 아니라 티켓 11·12·13의 Stage 4 정규 경로이기 때문이다
R-5 [AUTO AT-1 release:med@asserted] defer — 활성 백업 저장소 전환에서 늦은 응답이 현재 히스토리를 덮는다; medium/0.95; src/features/backup/backup-panel.tsx:90; res:none; a fix here buys nothing downstream and costs the committed verification evidence; follow-up docs/reviews/wide-ui-redesign/followups.md#R-5
R-6 [AUTO AT-1 release:med@asserted] defer — 커밋된 검증 증거가 UI 릴리스 위험을 검사하지 않는다; medium/0.99; docs/reviews/wide-ui-redesign/verification.md:13; res:none; a fix here buys nothing downstream and costs the committed verification evidence; follow-up docs/reviews/wide-ui-redesign/followups.md#R-6
R-1 [HUMAN AT-1 overrides release:high@asserted] accept — 실패한 전체 초기화 뒤 예약 백업이 삭제된 데이터를 재생성한다; high/0.99; src/runtime/background-bootstrap.ts:191; res:none; 인간 결정 2026-07-27T06:40Z — 이 브랜치에서 고친다(ESCALATION.md `Resolved:`). Phase A의 정지는 기계가 한 일의 기록으로 그대로 유효하고, 이 행은 그 뒤 사람이 정한 처분의 기록이다; applied 5486f300d8b43513fd65e61a6fe1964a01229d86 (2 files, 73 lines); suite green→green
R-2 [HUMAN AT-1 overrides release:high@asserted] accept — Block 광범위 정규식이 확인 절차를 우회한다; high/0.99; src/core/url-scope.ts:117; res:none; 인간 결정 2026-07-27T06:40Z — 이 브랜치에서 고친다(ESCALATION.md `Resolved:`). Phase A의 정지는 기계가 한 일의 기록으로 그대로 유효하고, 이 행은 그 뒤 사람이 정한 처분의 기록이다; applied a711d57b45d0eb147564830c90393e95bdfe57ab (3 files, 78 lines); suite green→green
R-3 [HUMAN AT-1 overrides reserved:migration] accept — v1 마이그레이션이 권위 저장소에 커밋되지 않고 실패도 숨겨진다; high/0.99; src/platform/stateStore.ts:14; res:migration; 인간 결정 2026-07-27T06:40Z — 이 브랜치에서 고친다(ESCALATION.md `Resolved:`). AT-1 §2가 reserved:migration으로 예약한 것은 이 행의 **처분 결정**이고, 그 결정을 사람이 내린 뒤의 구현은 게이트 픽스 가드(≤3파일·≤80줄) 안에 들어갔다. Phase A의 정지는 기계가 한 일의 기록으로 그대로 유효하다; applied 4e4d024f970c79333eccd36460bab9cd5be8509d (3 files, 77 lines); suite green→green

### ESCALATION reserved:migration 2026-07-27T05:48:43Z

릴리스 게이트 라운드 1이 **정지**했다. AT-1 Phase A에서 R-3이 예약 클래스
`reserved:migration`으로 escalate 판정을 받았고, `guard:two-phase`에 따라 **이 라운드의 어떤
행도 적용되지 않았다**(`round_escalated: true`, `round_guards: []` — 가드가 아니라 행이 라운드를
세웠다). 라운드 2는 띄우지 않았다: 이 라운드가 트리를 전혀 바꾸지 않았으므로 라운드 2는 같은
findings를 같은 이유로 되돌려줄 뿐이고, 종단 라운드라 그중 아무것도 accept할 수 없다.

**재도출 검증은 통과했다** — `verify-ledger` exit 0, `rowCount 6 / rederived 6 /
resolutions_checked 0 / judgement_rows []`. 6행 전부를 기계가 재계산했고 이 컨덕터의 판단만으로
결정된 행은 **없다**. `gate_commits 0`, `ledger_shas 0` — 적용된 것이 없다는 사실과 일치한다.

미해결 finding (전부 미적용, 사람의 콜드 트리아지 필요):

- **R-3 escalate** `reserved:migration` — `src/platform/stateStore.ts:14` (high/0.99).
  v1 마이그레이션이 권위 저장소에 커밋되지 않고 실패도 숨겨진다. `spec.md:84`(성공 후 persist,
  실패 시 원본 보존·오류 표면화)와 `spec.md:133`(실제 storage.local seam 테스트)을 모두 누락.
  AT-1이 이 클래스를 사람에게 넘기는 이유: 되돌릴 수 없고, 실제 결정(백필 시점·다운타임·배포
  순서)이 diff 밖 운영 영역에 있다.
- **R-1 accept, NOT APPLIED** — `src/runtime/background-bootstrap.ts:191` (high/0.99).
  실패한 전체 초기화 뒤 취소되지 않은 예약 타이머가 삭제된 데이터를 재생성한다.
- **R-2 accept, NOT APPLIED** — `src/core/url-scope.ts:117` (high/0.99).
  `regexBreadth`가 광범위 정규식을 narrow로 오판해 Block 확인 절차를 우회한다.
- **R-4 accept, NOT APPLIED** — `src/features/modifications/rule-form.tsx:513` (high/0.98).
  Spec fidelity — user story 17(저장 후 즉시 활성화), 36(개별 스냅샷 삭제), 22/25(프로필 행의
  규칙 수·전역 일시정지)가 배선되지 않았다.

defer 2건(R-5 medium, R-6 medium)은 `followups.md`의 "릴리스 게이트 r1 이월"에 있다. 이쪽도
적용된 것은 없다.

**적용된 행: 없음.** 이 라운드는 커밋을 하나도 만들지 않았다.

릴리스 게이트는 통과하지 않았다(`ok:true`, `verdict: needs-attention`). auto-triage에는 waiver가
없으므로 이 게이트는 사람이 R-3을 결정하고 high 3건의 처리를 정하기 전에는 닫히지 않는다.

### 인간 결정 — 릴리스 게이트 r1 에스컬레이션 처분 2026-07-27T06:40Z

사용자 결정: **이 브랜치에서 고친다.** 6개 행의 처분을 여기 못박는다. 이 블록은 다음 무인
실행이 읽는 정본이며, `.scratch/wide-ui-redesign/ESCALATION.md`의 `Resolved:` 줄과 같은 내용이다.

| 행 | 심각도 | 처분 | 어떻게 |
|---|---|---|---|
| R-1 | high | **이 브랜치에서 픽스** | 게이트 픽스 1커밋 (`Conductor-Gate: release-r1`) |
| R-2 | high | **이 브랜치에서 픽스** | 게이트 픽스 1커밋 (`Conductor-Gate: release-r1`) |
| R-3 | high (escalate) | **이 브랜치에서 픽스** | 게이트 픽스 1커밋 (`Conductor-Gate: release-r1`) |
| R-4 | high | **이 브랜치에서 배선** | 티켓 11·12·13 (Stage 4 정규 경로) |
| R-5 | medium | defer 유지 | `followups.md` "릴리스 게이트 r1 이월" |
| R-6 | medium | defer 유지 | `followups.md` "릴리스 게이트 r1 이월" |

**Phase A의 정지는 그대로 유효하다.** `_ROUND NOT APPLIED_` 줄은 기계가 무엇을 했는지의 기록이고,
이 결정은 그 뒤에 사람이 무엇을 하기로 했는지의 기록이다. 두 줄은 서로를 지우지 않는다.

R-1·R-2·R-3을 적용할 때는 각각 HUMAN 오버라이드 행을 이 `### release r1` 섹션에 추가하고
(`<ID> [HUMAN AT-1 overrides release:high@asserted] accept — …` 형식), 커밋 sha를 그 행에
스탬프한다. 세 커밋 모두 `Conductor-Gate: release-r1` 트레일러를 달아야 `verify-ledger`의
`commit-not-in-ledger` 교차 검사를 통과한다.

R-3은 게이트 픽스 한도(≤3파일·≤80줄)를 넘길 수 있다. 넘치면 fix 서브에이전트가
`guard-would-trip`으로 커밋 없이 멈추는 것이 정상이며, 그때는 R-4처럼 티켓으로 돌려야 한다 —
한도를 늘리거나 가드를 우회하지 말 것.

**적용 후에는 `verification.md`가 낡는다.** 픽스가 검증 증거를 쓴 시점 이후에 착지하므로,
전체 스위트를 다시 돌려 `verification.md`를 새 SHA/tree로 다시 쓰고 커밋한 뒤에야 릴리스
라운드 2를 띄울 수 있다. 라운드 2는 **검증 전용**이라 거기서 나오는 새 finding은 accept되지
않는다 — 라운드 2 전에 사람이 픽스를 확인하는 편이 낫다.

### ESCALATION needs-decision 2026-07-27T07:13:24Z

릴리스 게이트 r1의 **인간 결정 집행 중** 정지. 사람이 정한 처분(R-1·R-2·R-3을 게이트 픽스로
적용)의 **첫 번째 픽스 R-1은 적용·커밋됐고**(`5486f30`, 2파일 73줄, 스위트 green→green,
diff-guard clean), 그 결과가 위 `R-1 [HUMAN AT-1 overrides release:high@asserted] accept` 행이다.
이 시점의 원장은 재도출 검증을 통과한다 — `verify-ledger` exit 0, rowCount 6 / rederived 5 /
human_rows [R-1] / gate_commits 0 / ledger_shas 1.

**멈춘 이유는 픽스가 아니라 그 커밋의 트레일러 블록이다.** 5486f30의 메시지는

    <본문>
    (빈 줄)
    Conductor: feature-loop/wide-ui-redesign
    Conductor-Gate: release-r1
    Conductor-Findings: R-1
    (빈 줄)
    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

형태다. git의 트레일러 파서는 **마지막 문단만** 읽으므로
`git log --format='%(trailers:key=Conductor-Gate,valueonly)'`가 빈 문자열을 돌려준다. 확인:
`gate_commits: 0`. 세 `Conductor-*` 줄은 본문 텍스트로는 남아 있다(grep으로 보인다).

지금은 이것이 위반이 아니다 — `verify-ledger`의 `ledger-sha-not-a-gate-fix`는
`if (gateCommits.length > 0)` 안에 있어서(loop-state.mjs:3333), 이 라운드에 트레일러가 읽히는
커밋이 하나도 없으면 검사 자체를 건너뛴다("기계 트레일러를 금지하는 저장소를 벌하지 않는다").
**R-2나 R-3이 정상 트레일러로 착지하는 순간 그 조건이 참이 되고 R-1의 스탬프가 위반으로
발화한다.** 즉 라운드를 계속 진행하면 반드시 `verify-ledger` 실패로 멈춘다.

루프가 스스로 고칠 수 없다: 커밋 메시지 수정은 `git commit --amend` 또는 `rebase`뿐이고
둘 다 이 스킬의 git 허용목록 밖이다(`forbidden-git-op`). 나머지 두 픽스를 같은 방식으로
망가뜨려 검사를 건너뛰게 만드는 것은 감사 장치를 스스로 끄는 행위이므로 하지 않았다.

**지금 멈추는 이유:** 5486f30은 현재 **브랜치 팁**이다. 수리가 `git commit --amend` 한 번이다.
R-2·R-3을 먼저 쌓으면 같은 수리가 3커밋짜리 `rebase -i`가 된다.

적용된 행: R-1(`5486f30`). 미적용: R-2·R-3(게이트 픽스 예정, 미착수) · R-4(티켓 11·12·13,
미착수) · R-5·R-6(defer 유지). 티켓 11·12·13은 열린 채로 남았다.

**해소 2026-07-27T07:18:36Z** — 사용자가 amend를 승인했다(대화 내 결정). 루프가 정지·락 해제된
상태에서, 루프 밖에서 픽스 커밋의 **메시지만** 재작성했다: 네 트레일러를 한 문단으로 합쳐
`Conductor: / Conductor-Gate: / Conductor-Findings: / Co-Authored-By:` 순으로 두었다.
`264ee980` → `5486f300d8b43513fd65e61a6fe1964a01229d86`. **트리 해시는 동일하다**
(`00c0310c5c03f53deed0fd0375cb996c733c80ab`) — 코드는 한 바이트도 바뀌지 않았고 커밋 메시지만
바뀌었다. 확인: `git log -1 --format='%(trailers:key=Conductor-Gate,valueonly)'` → `release-r1`.
위 R-1 HUMAN 행의 스탬프도 새 sha로 갱신했다. 브랜치는 origin에 푸시된 적이 없어 재작성의
외부 영향은 없다. 다음 게이트 픽스 서브에이전트 브리프에는 "모든 트레일러를 `Co-Authored-By`와
같은 마지막 한 문단에 넣어라"를 명시한다.

### ESCALATION not-applied-without-escalation 2026-07-27T08:03:22Z

`verify-ledger`가 `### release r1`의 부기 커밋을 거부했다(exit 2, 위반 1건). 원인은 픽스가
아니라 **이 섹션의 두 기록이 서로 모순**하게 된 것이다.

R-1·R-2·R-3은 2026-07-27T06:40Z 인간 결정에 따라 모두 게이트 픽스로 적용·스탬프됐다:

| 행 | 기계 판정 | 사람 판정 | 커밋 | 검증 |
|---|---|---|---|---|
| R-1 | `[AUTO AT-1 release:high@asserted] accept (NOT APPLIED)` | HUMAN accept | `5486f30` (2파일 73줄) | suite green→green |
| R-2 | `[AUTO AT-1 release:high@asserted] accept (NOT APPLIED)` | HUMAN accept | `a711d57` (3파일 78줄) | diff-guard clean · vitest 358 · smoke 124 |
| R-3 | `[AUTO AT-1 reserved:migration] escalate` | HUMAN accept | `4e4d024` (3파일 77줄) | diff-guard clean · vitest 360 · smoke 124 |
| R-4 | `[AUTO AT-1 release:high@asserted] accept (NOT APPLIED)` | 티켓 11·12·13으로 분해 | — | 미착수 |
| R-5 · R-6 | `defer` | defer 유지 | — | followups |

`verify-ledger`는 finding index별로 한 결정만 도출하고 HUMAN 행이 AUTO 행을 대체한다
(`loop-state.mjs:3146-3149`). R-3이 이 라운드의 **유일한 escalate 행**이었으므로, 그 행을
사람이 accept로 오버라이드한 순간 파생 escalate 수가 0이 됐다. 그러면
`_ROUND NOT APPLIED — R-3 escalated; …_` 줄은 가리킬 원인을 잃는다:

    not-applied-without-escalation — The section carries a `_ROUND NOT APPLIED_` line
    but no escalate row, and its cause is not a named `guard:<name>`.

도구가 받아들이는 형태는 하나뿐이다 — **그 줄의 삭제**. 확인한 대안은 모두 막힌다:

- 줄을 `guard:two-phase`로 시작하게 고쳐 쓰기 → `guard-not-derived`. 파생 행에서 §4 가드를
  재실행하면 아무것도 반환하지 않는다(`round_guards_derived: []`).
- R-3 HUMAN 행 제거 → `commit-not-in-ledger`. `4e4d024`가 `Conductor-Gate: release-r1`을
  달고 있어 반드시 accept 행이 주장해야 한다.
- R-3 HUMAN 행을 `escalate`로 기록 → 사람이 accept로 정한 사실에 반하는 허위 기록.

**루프가 스스로 결정할 수 없는 이유**는 도구 제약이 아니라 사람의 지시다. 위
`### 인간 결정 — 릴리스 게이트 r1 에스컬레이션 처분 2026-07-27T06:40Z` 블록은
"Phase A의 `_ROUND NOT APPLIED_` 줄은 유지 — 기계 기록과 인간 결정은 공존한다"고 명시했다.
같은 결정의 나머지 절반(R-1·R-2·R-3을 이 브랜치에서 고친다)을 끝까지 집행하자 그 두 지시가
양립 불가능해졌다. 어느 쪽을 접을지는 기계가 정할 문제가 아니다.

이 정지는 기계 판정 행을 하나도 건드리지 않았고 픽스를 되돌리지 않았다. 세 커밋은 각각
diff-guard clean · 전체 스위트 green으로 개별 검증됐다.

**이 라운드의 재도출 범위(보고 의무):** rowCount 6 / rederived **3** / judgement_rows [] /
resolutions_checked 0 / human_rows [R-1, R-2, R-3] / gate_commits 3 / ledger_shas 3.
6행 중 3행(R-1·R-2·R-3)은 사람 결정으로 기계 재도출 대상에서 빠졌다 — 이 라운드는
"전량 기계 검증"으로 보고될 수 없다.

### ESCALATION suite-red 2026-07-27T08:36:23Z

프리플라이트 P2 실패로 정지. HEAD `9b50905`에서 전체 스위트를 3회 실행해 **3회 모두 red**
(`bun run build && bun run test && bun run smoke`). build·vitest(360 passed)는 매번 통과했고,
실패는 전부 smoke의 헤더/쿠키 적용 관측에 몰려 있다:

| 실행 | 결과 | 실패 |
|---|---|---|
| preflight5-suite | 121/124, exit 1 | M2b · M2c · N34b |
| preflight5-suite-rerun1 | 122/124, exit 1 | K1 · M2b |
| preflight5-suite-rerun2 | 121/124, exit 1 | M1 · M2b · M2d |

플레이크 재실행 예산 2/2 소진. 실패 집합이 매번 달라 결정론적 회귀는 아니지만,
**M2b는 3/3 실패이며 시그니처가 매번 동일**(`cookie=existing=preset` — 오버라이드 적용 전 값)
이라 단독 결함 의심이 남는다. 코드는 `4e4d024`와 바이트 동일하고(트리 diff는 decisions.md 46줄
추가가 전부), 그 트리에서 `release-r1-R-3-suite.txt`는 124/124 green으로 기록돼 있다.

이 정지는 릴리스 게이트 r1의 finding을 새로 미해결로 만들지 않는다. r1의 처분은 이미 끝나 있다:

- **적용됨(HUMAN accept, sha 스탬프 보유)** — R-1 `5486f30`(2파일 73줄) · R-2 `a711d57`(3파일 78줄)
  · R-3 `4e4d024`(3파일 77줄). 셋 다 착지 당시 diff-guard clean·스위트 green.
- **미적용** — R-4(accept, sha 없음; 티켓 11·12·13으로 분해, 미착수) · R-5(defer, followups#R-5)
  · R-6(defer, followups#R-6).

**부수 발견 — 승인된 원장 처분이 그대로는 동작하지 않는다.** 2026-07-27 사람 승인은
`### release r1`의 `_ROUND NOT APPLIED_` 줄 **하나만** 지우면 `verify-ledger`가 통과한다고
예측했으나, 사본 드라이런 결과 그 편집만으로는 여전히 `round_not_applied: true` / exit 2
(`not-applied-without-escalation`)다. `suspensionOf()`가 섹션 텍스트 전체에서
`/_?ROUND NOT APPLIED/i`를 찾는데(`loop-state.mjs:937`), R-4 행 끝의 서술이 그 문자열을 문자
그대로 인용하고 있기 때문이다. 두 번째 편집(R-4 서술의 인용 제거)까지 하면 exit 0이며 카운터는
승인 문서의 예측과 정확히 일치한다(`rowCount 6 · rederived 3 · judgement_rows [] ·
resolutions_checked 0 · human_rows [R-1,R-2,R-3] · gate_commits 3 · ledger_shas 3`).
그러나 그 두 번째 편집은 사람이 명시적으로 금지한 `[AUTO …]` 행을 건드리므로 루프가 임의로
집행하지 않았다. **원장은 이번 진입에서 전혀 수정되지 않았다.**

### 인간 결정 — 릴리스 게이트 r1 원장 모순 처분 2026-07-27T08:50Z

08:04Z 정지(`not-applied-without-escalation`)에 대한 사람의 최종 처분. **두 편집 모두 사람이
승인했고, 루프가 임의로 정한 것은 없다.**

1. **181행 `_ROUND NOT APPLIED — R-3 escalated; …_` 삭제** — 08:04Z 에스컬레이션에서 승인.
   근거: R-3이 이 라운드의 유일한 escalate 행이었는데 사람이 그것을 accept로 오버라이드했고
   (`loop-state.mjs:3146-3149`에 따라 HUMAN 행이 index별로 AUTO 행을 대체한다) 파생 escalate가
   0이 되어 그 줄이 가리킬 원인을 잃었다. 게다가 그 줄은 사실과도 어긋났다 — 이 라운드는
   실제로 픽스 3건을 만들었다.
2. **R-4 행 꼬리 서술의 `_ROUND NOT APPLIED_` 인용 제거** — 2026-07-27T08:50Z 승인.
   `suspensionOf()`가 섹션 텍스트 전체에서 `/_?ROUND NOT APPLIED/i`를 찾기 때문에
   (`loop-state.mjs:937`) 1번만으로는 여전히 `round_not_applied: true`였다. 사본 드라이런 2회로
   확인했다: 181행만 삭제 → exit 2 · 인용까지 제거 → exit 0.
   그 서술은 `triage --write` 출력이 아니라 06:40Z에 컨덕터가 덧붙인 문장이다(같은 섹션의
   R-1·R-2 AUTO 행은 `res:none;`에서 끝난다). 문장 내용도 거짓이었다.
   **R-4의 판정은 불변이다** — decision `accept`, rule id `release:high@asserted`, `res:none`,
   severity/confidence/file:line, `(NOT APPLIED — round escalated)` 표기 모두 그대로이고
   `verify-ledger`가 R-4를 재도출해(`rederived`에 포함) 통과시킨다. `grep -c '\[AUTO'` 수치 불변.

**Phase A가 아무것도 적용하지 않고 정지했다는 사실은 지워지지 않는다.** 그 기록은 네 곳에
그대로 남아 있다: ① `R-3 [AUTO AT-1 reserved:migration] escalate` 행, ②
`### ESCALATION reserved:migration 2026-07-27T05:48:43Z` 블록, ③ `### 인간 결정 — 릴리스 게이트
r1 에스컬레이션 처분 2026-07-27T06:40Z` 블록, ④ 저널의 `loop.stop reason=reserved:migration` 및
`gate.triage … applied=no`.

**이 라운드의 재도출 범위 — 보고 의무.** `rowCount 6 · rederived 3 · judgement_rows [] ·
resolutions_checked 0 · human_rows [R-1, R-2, R-3] · gate_commits 3 · ledger_shas 3`.
`rederived + resolutions_checked = 3 < rowCount 6` — **이 라운드는 "전량 기계 검증"으로 보고될 수
없다.** 6행 중 3행(R-1·R-2·R-3)은 사람 결정이라 기계가 재도출하지 않았다. Stage 5 최종 보고서에
이 숫자를 행 id와 함께 그대로 실어야 한다.

### ESCALATION budget-insufficient 2026-07-27T18:10Z

티켓 14(스모크 진단) 구현자가 **API 세션 한도**로 중도 사망했고, 그 뒤 세션이 약 8시간 30분
차단돼 있는 사이 **이 루프 실행의 예산 시계와 티켓 14의 wall clock이 모두 만료**됐다.
정지 사유는 구현자의 작업 품질도, 코드도, 게이트도 아니다 — 시계다.

| 시계 | 값 | 상태 |
|---|---|---|
| 티켓 14 wall clock | `ticket.start` 09:38:17Z + 90분 → 11:08Z | 만료(약 7시간 초과) |
| 루프 실행 예산 | `budget_until` 2026-07-27T15:26:40Z | 만료(약 2시간 44분 초과) |
| 현재 시각 | 2026-07-27T18:10Z | — |

**구현자는 커밋을 남기지 않았다.** `git log 6ea9fcf..HEAD` = 비어 있음. 대신 미커밋 WIP를
남겼고, 그 귀속은 확정됐다 — 네 경로 전부 파견 창(`ticket.start` 09:38:17Z ~ 사망 09:4x Z)
안쪽인 **09:45:22Z–09:47:08Z**에 쓰였고, 09:34:46Z에 `git status --porcelain`과
`loop-state.mjs state`(`"dirty": []`) 두 독립 판독이 트리를 clean으로 보고했다. 8시간 30분의
공백 동안에는 아무 경로도 수정되지 않았다. **`foreign-dirt`가 아니라 사망 지점 매트릭스
row 14(mid-implementation)이다.**

```
 M src/platform/stateStore.test.ts            (+47/-… , 09:45:53Z)
 M src/platform/stateStore.ts                 (+27/-… , 09:47:08Z)
 M src/runtime/background-bootstrap.test.ts   (+68/-0 , 09:46:49Z)
?? scripts/audit-smoke-barriers.mjs           (          09:45:22Z)
                                    합계 3 files changed, 135 insertions(+), 7 deletions(-)
```

구현자가 남긴 부분 출력은 한 줄뿐이다 — `Red baseline captured (11 flags). Now the unit tests,
red first.` **저널 `.scratch/wide-ui-redesign/tickets/14.md`는 쓰이지 않았다**(사망이 그보다
앞섰다). 즉 저 135줄이 무엇을 의도했는지에 대한 기록은 이 한 줄이 전부다.

**부수 발견 — 다음 진입은 현재 도구로는 두 문 모두 막혀 있다.** 이것이 사람이 필요한 이유다.

- **`--resume`로 들어가면 P9a `budget-insufficient`로 즉시 실패한다.** `loop-state.mjs:1330`의
  `opts.resume && meters.loop.budget_until ? meters.loop.budget_until : now + budgetHours`는
  resume일 때 이전 `loop.start`의 `budget_until`을 **그대로 승계하며 `--budget-hours`를 무시**
  한다. 승계값 15:26:40Z은 이미 과거이므로 `haveMin`은 음수, `need`는 180분(열린 티켓 4개)이다.
  그리고 그 승계값의 출처는 저널의 마지막 `loop.start` 레코드(`loop-state.mjs:1026`)이고,
  새 `loop.start`는 프리플라이트를 통과해야만 쓰인다 — **순환이다.**
- **`--resume` 없이(콜드) 들어가면** 예산은 `now + 8h`로 새로 발급되지만 P1이 위 WIP를
  `foreign-dirt`로 잡고, 그 다음 P2가 다시 `suite-red`로 잡는다.

이 승계 규칙은 몇 분 뒤 재개에는 옳고, **세션 한도로 8시간 차단된 뒤의 재개에는 함정**이다.
루프가 스스로 예산을 재발급하는 것은 이 설계가 가장 경계하는 자기승인이라 하지 않았다.

**이 정지가 새로 미해결로 만든 게이트 finding은 없다.** 릴리스 r1의 처분은 그대로다 —
적용됨 R-1 `5486f30` · R-2 `a711d57` · R-3 `4e4d024`(전부 HUMAN accept, sha 스탬프 보유),
미적용 R-4(accept, 티켓 11·12·13으로 분해) · R-5/R-6(defer, followups). `### release r1`은
`roundSuspended: false`이고 `verify-ledger` exit 0 상태를 유지한다(4f4b0a6). 건드리지 않았다.

**이 정지는 spec hold(`blocks=`)를 걸지 않았다.** 티켓 11·12·13·14를 막는 것은 예산이지
스펙 결정이 아니다.

### 인간 결정 — 티켓 14 WIP 처분 및 재진입 경로 2026-07-27T23:5xZ

위 정지에 대한 사람의 처분: **옵션 (a)** — 도구 한 줄을 고쳐 `--resume` 문을 열고 WIP를 보존한다.
루프가 제안했으나 집행하지 않은 수정을 **사람이 승인해 집행**했다. 루프가 자기 예산 검사를
스스로 고치는 일은 없었다.

- **수정 위치:** `~/.claude/skills/feature-loop/scripts/loop-state.mjs` (스킬 도구, 이 레포 밖).
  예산 삼항식에 `&& opts.budgetHours == null`을 추가해 **명시적으로 넘긴 `--budget-hours`가
  resume에서도 우선**하게 했다. 플래그가 없으면 승계 동작은 종전과 동일하다 — 무인 resume이
  자기 예산을 조용히 재발급하지 못하게 하는 성질은 그대로 남는다.
- **검증:** `node --check` 통과, `loop-state.mjs --selftest` exit 0, 그리고 실제 프리플라이트
  리허설에서 **P9a `480 min available, 180 min needed`**로 통과(직전엔 승계값이 과거라 음수).
  리허설은 `--write-loop-md` 없이 돌려 아무것도 영속화하지 않았고, 락은 즉시 해제했다.
- **따라서 위 "양쪽 문이 막혀 있다"는 서술은 이 시점부로 해소됐다.** `--resume` 문은 열렸고,
  콜드 문이 P1/P2로 닫혀 있다는 사실은 그대로다(그것이 `--resume`을 쓰는 이유다).
- **WIP는 그대로 보존된다.** 되돌리지도 커밋하지도 않았다. 다음 진입이 매트릭스 row 14로
  분류해 `ticket.resume id=14 from=dirty attempt=2`를 기록하고 `(resume)` 브리프로 재파견한다.
  재개 구현자에게는 **이 WIP에 저널이 없다**는 사실을 명시한다.
- **함께 이월되는 승인:** 스모크 red 상태에서 진단 티켓 하나(14)를 허용한다는 이전 승인은
  유효하다. 14의 스위트 red는 상속된 것이며 구현자에게 `suite-red-at-entry`를 주지 않는다.
- **계량:** 이 재개로 티켓 14는 attempt 2/3, crash-resume 1/1을 쓴다. 환경(세션 한도)으로 또
  죽으면 `crash-loop`으로 읽히며, 그때는 계량을 우회하지 않고 그대로 정지한다.

### ESCALATION criteria-unmet 2026-07-28T00:58Z

티켓 14는 **코드로서는 성공했고 기준 기록으로서 실패했다.** 컨덕터의 독립 스위트 실행이
`fd3610b`에서 exit 0 · 124/124 green — 티켓 14가 존재한 이유인 상속된 스모크 red가 걷혔다.
독립 기준 감사(구현자 아님)는 12개 중 10개 met, **A10·A11 not-met**으로 `verdict: fail`.

- **A10 not-met** — green 7회 자체는 확인됐다(`run1..7`: `Tests 363 passed (363)`, `124/124 passed`,
  `^FAIL ` 0줄, exit 0). 그러나 보존된 red 실행(`ticket-14-suite-red1.txt`, N34b 123/124)의
  **실패 id·시그니처·분류가 이슈 파일 `## Comments`에 없다.** 이슈 파일에 그 섹션 자체가 없고
  `issues/14-reconcile-readiness-flake.md`는 `6ea9fcf` 이후 무변경이다. 분류는 gitignored 저널에만 있다.
- **A11 not-met** — A10 회수(N≥6.53 → 7)의 근거가 이슈 파일에 기입되지 않았다. 현재 이슈 파일의
  N=7 유도문은 티켓 저자가 쓴 A11 조항 본문(`:114`)이지 구현자의 기록이 아니다.

**원인은 코드 결함이 아니라 브리프와 기준의 정면 충돌이다.** 구현자 브리프의 NEVER 절은
이슈 트래커 쓰기를 금지하고, A10·A11은 이슈 파일 쓰기를 요구한다. 구현자는 **자기승인 대신
거부를 택했고** 그 충돌을 `learned`로 보고했다 — 설계가 원하는 행동이다. 컨덕터도 이 구멍을
메울 수 없다: 채우려면 (1) Stage 4가 금지한 티켓 본문 읽기가 필요하고, (2) 채우는 내용 자체가
채점 대상인 기준 증거라 감사받는 쪽이 자기 감사 기록을 쓰는 것이 된다.

기계 검증 상태: `diff-guard` 두 범위 모두 `test_weakening:false`·`suite_tampered:false`,
구현자 커밋 단독 범위는 `untouchable_touched: []`(테스트 순증 +279줄, 가드 경로 무변경).
범위 `6ea9fcf..HEAD`가 뱉는 `decisions.md`는 컨덕터 자신의 부기 커밋 `e9d0b33`/`63a367b` 분이다.

**티켓 14는 닫지 않았다.** 11·12·13은 `Blocked by: 14`로 여전히 막혀 있다. spec hold는 걸지 않았다 —
막는 것은 기준 기록의 위치 문제이지 스펙 결정이 아니다.

릴리스 r1 처분은 불변(`4f4b0a6`, `verify-ledger` exit 0, `roundSuspended:false`). R-4는 11·12·13으로
분해된 채 미착수, R-5·R-6은 defer 유지.

**최종 보고서 의무(그대로 유효):** 릴리스 r1은 `rowCount 6 · rederived 3 · resolutions_checked 0`
이므로 6행 중 3행(R-1·R-2·R-3)은 사람 결정이라 기계가 재도출하지 않았다.
**"전량 기계 검증"으로 보고하지 마라.**

### 인간 결정 집행 — 티켓 14 A10·A11 증거 전사 (옵션 a) 2026-07-28T01:1xZ

`### ESCALATION criteria-unmet` 에 대한 사람의 처분: **옵션 (a)** — 저널의 A10·A11 내용을
추적되는 이슈 파일 `## Comments`로 옮긴다. 사람이 (a)를 고르고 **기계적 이동을 컨덕터에게
위임**했다. 루프는 정지 상태였고(락 해제·`loop.stop` 기록 완료) 무인 자기승인이 아니다.

집행 내용 — `.scratch/wide-ui-redesign/issues/14-reconcile-readiness-flake.md`에 `## Comments`
신설(+약 130줄). A10의 실패 id(N34b)·시그니처(로그와 **바이트 동일**)·분류(하네스 결함, 작업 3
회귀), 7회 green 표(전사 시점 로그 8개 기계 재확인: `Tests 363 passed (363)` ≥360,
`124/124 passed` ≥124, `^FAIL ` 0줄), A11의 N=7 유도와 **정직한 한계**(잔존 p=0.10이면 0.9^7 =
47.8%로 통과 — A3·A6이 표본 무관 잠금)를 담았다. 출처 문단에 **컨덕터가 전사했음을 명시**했다.

**전사 후 독립 적대 검증**(에이전트 4, 렌즈 A10/A11/A8+회귀/completeness critic)에서 A10·A11은
전 조항 met으로 나왔고, **A8이 리터럴로 실패**하는 것이 확인됐다 — 아래는 미해결이다.

#### 미해결 — A8이 리터럴로 실패한다 (사람 결정 필요)

A8의 지정 명령이 지금 `docs/reviews/wide-ui-redesign/decisions.md`를 출력한다(`GREP_EXIT=0`).
원인은 구현자가 아니라 **컨덕터 자신의 원장 커밋 3건**(`e9d0b33`·`63a367b`·`d1dd5d0`)이다.
A8은 base를 `4f4b0a6`으로 고정한 워킹트리 전체 diff라 컨덕터 부기까지 함께 잡는다.

- 이전 감사자는 구현자 커밋으로 범위를 좁혀 met으로 봤다. 이번 적대 검증은 **그 완화가
  A8 문언에서 정당화되지 않는다**고 반박했다(A8은 ref 인자 없는 단일 명령을 못박는다).
- 검증이 제시한 해법은 **원장을 `4f4b0a6` 바이트로 되돌리고 부기 109줄을 가드 밖 경로로
  옮기는 것**이었다. **집행하지 않았다.** 그 109줄은 `### ESCALATION budget-insufficient`,
  `### 인간 결정 — 티켓 14 WIP 처분`, `### ESCALATION criteria-unmet` 이며, 스킬이 원장에
  커밋하도록 규정한 이유가 **`ESCALATION.md`는 gitignored라 정지 기록이 레포에 남는 유일한
  경로가 원장**이기 때문이다. 체크박스 하나를 맞추려고 정지 2건과 인간 결정 1건의 감사
  기록을 지우는 것은 이 설계가 지키려는 것을 정면으로 파괴한다. **컨덕터는 이 거래를 하지 않는다.**
- 컨덕터가 A8 문언을 고치는 것도 하지 않았다 — 결과에 맞춰 체크리스트를 고치는 일이다.

따라서 A8은 **기준 해석 분쟁**이며 컨덕터의 권한 밖이다. 선택지는 (i) 이전 감사자처럼 구현자
범위로 한정해 met 처리, (ii) A8 문언을 사람이 개정(컨덕터 부기 경로 예외), (iii) 다른 처분.

#### 미해결 — `ESCALATION.md`에 `Resolved:` 줄이 없다

`grep -c '^Resolved' .scratch/wide-ui-redesign/ESCALATION.md` = **0**. 사람의 (a) 선택이 레포에
기록된 곳이 없다. 그 줄은 루프 재진입(P8)의 전제이고 **오직 사람만 쓸 수 있다** — 컨덕터가
쓰면 이 루프의 유일한 인간 게이트를 위조하는 것이다. 컨덕터는 쓰지 않았다.

### 인간 결정 — A8 처분: 구현자 범위로 한정 2026-07-28T01:2xZ

위 "미해결 — A8이 리터럴로 실패한다"에 대한 사람의 처분: **A8 met.** 코드·원장 변경 0.

- **판정 근거(사람).** A8의 목적은 "구현자가 범위 밖 파일을 건드렸는가"다. 구현자 브리프의
  NEVER 절이 이미 `decisions.md` 쓰기를 금지하고 있고, 구현자 커밋 `fd3610b`는 가드 경로를
  하나도 건드리지 않는다(`diff-guard --since 63a367b`: `untouchable_touched: []`,
  `config_touched: []`). 원장에 쓴 것은 스킬이 **컨덕터에게 규정한** 동작이며 A8의 대상이 아니다.
- **사람이 함께 인지한 리스크.** A8 문언이 ref 인자 없는 단일 명령을 못박으므로, 다음 감사자가
  같은 반박을 다시 제기할 수 있다. 그 재발을 줄이려고 이 처분을 이슈 파일 `## Comments`에도
  **사람의 판정으로 명시**해 감사자 눈에 닿게 했다(컨덕터의 판단으로 적지 않았다).
- **집행하지 않은 것.** 원장 되돌리기·부기 이동은 하지 않았다(감사 기록 파괴). A8 문언 개정도
  하지 않았다(채점 기준을 결과에 맞춰 고치는 일이며, 하더라도 사람의 몫이다).

### 재무장 — `Resolved:` 줄 입력 경위 2026-07-28T01:3xZ

`.scratch/wide-ui-redesign/ESCALATION.md`(gitignored)에 `Resolved:` 줄이 추가되어 P8이 재무장됐다.
`ESCALATION.md`는 레포에 남지 않으므로 **경위를 여기 남긴다.**

- **결정 주체는 사용자, 타이핑 주체는 컨덕터다.** 사용자가 처분 내용을 모두 확인한 뒤
  "Resolved 줄 추가해"라고 명시 지시했고, 컨덕터가 대신 입력했다. 그 사실을 **줄 본문 안에
  명시**해 두었으므로, 재개하는 컨덕터와 이후 감사자는 출처를 오해하지 않는다.
- **앞선 기록(`### 인간 결정 집행 — 티켓 14 A10·A11 증거 전사`의 마지막 절)과의 관계.**
  거기서 "이 줄은 오직 사람만 쓸 수 있다"고 적은 것은 **무인 루프**를 전제한 서술이다. 게이트가
  막으려는 실패 모드는 "정지한 루프가 사람 검토 없이 스스로 재시작하는 것"인데, 이번 경우
  루프는 정지 상태였고 사용자가 보고를 읽고 A8 처분까지 직접 판정한 뒤 지시했다 — 그 실패
  모드가 성립하지 않는다. 다만 게이트의 감사 가치("이 줄의 존재 = 사람이 행동했다")가 흐려지지
  않도록 줄 안에 타이핑 주체를 밝히는 방식으로 보존했다.
- **검증.** 펜스 블록 밖 `^Resolved:` 매치 정확히 1건(27행; 파일 내 펜스는 78·79·135·144행).

재개 경로: 티켓 14 기준 재감사 → 14 종결 → 11 → 12 → 13 → 스위트 재실행·`verification.md`
재작성·커밋 → 릴리스 라운드 2(검증 전용, accept 불가). **loop.start 6/7 — 다음이 마지막.**

### ticket 14 code-review r1 — auto-triage
_policy CR-1 · feature-loop/policies/ticket-review-cr1.md · sha256 27ad2f0313d78a9b · decided 2026-07-28T03:21:21Z · fixed point 6ea9fcf8292206153d1b6ff6f2f8d4facd800823 · ticket .scratch/wide-ui-redesign/issues/14-reconcile-readiness-flake.md_

R-1 [AUTO CR-1 cr:defect] accept — Standards(blocking): activeAccent 배리어가 조용히 통과한다 — pollUntil은 타임아웃에 마지막 값을 반환하고 그 결과는 버려진다; -/-; scripts/smoke.mjs:2470; res:none; 티켓 44행 "타임아웃이면 오류로 실패시킨다"가 함의하는 미처리 케이스이고, 같은 hunk의 형제 헬퍼 pollSessionRuleMatch·pollStable은 둘 다 타임아웃에 throw한다; fixed 568da70 (1 file, 9 lines); suite green→green 363/363 · smoke 124/124
R-2 [AUTO CR-1 cr:defect] accept — Spec(c): 새 data-theme 준비 배리어가 실패하지 않고 마지막 값으로 통과한다; -/-; scripts/smoke.mjs:2470-2475; res:none; R-1과 동일 결함에 두 축이 독립 수렴 — Spec 축은 티켓 44·53행을 인용해 "다른 모든 배리어는 크게 실패한다"고 대조했다. 한 번의 픽스가 두 행을 함께 닫는다; fixed 568da70 (1 file, 9 lines); suite green→green 363/363 · smoke 124/124
R-3 [AUTO CR-1 cr:smell] defer — Standards(non-blocking): 음성 절반이 효과가 아니라 설치만 확인한다 (K2·E6·M2c·M2e·E5); -/-; scripts/smoke.mjs:-; res:none; 티켓이 처방한 설계의 잔여 약점이지 구현 결함이 아니다 — 구현자 자신이 K1 주석에 한계를 적었다. follow-up docs/reviews/wide-ui-redesign/followups.md#T14-R-3
R-4 [AUTO CR-1 cr:smell] defer — Standards(non-blocking): 테스트가 관측 가능한 행동이 아니라 메커니즘에 걸린다 (expect(order[0]).toBe('commit')); -/-; src/runtime/background-bootstrap.test.ts:418; res:none; 티켓 기준 A3이 "메커니즘 단위 테스트"를 명시적으로 요구했고 같은 파일에 persistCalls 선례가 있다 — 리뷰어도 soft로 표시. 문서화된 레포 표준의 hard breach가 아니므로 cr:standard가 아니다. follow-up …#T14-R-4
R-5 [AUTO CR-1 cr:smell] defer — Standards(smell, Duplicated Code): readState→blocked→StateLoadError 절이 loadState와 commitMigration에 바이트 동일하게 중복; -/-; src/platform/stateStore.ts:29; res:none; follow-up …#T14-R-5
R-6 [AUTO CR-1 cr:smell] defer — Standards(smell, Duplicated Code): pollSessionRuleCount→pollSessionRuleMatch→효과 pollUntil 3연속이 약 10회 반복; -/-; scripts/smoke.mjs:-; res:none; follow-up …#T14-R-6
R-7 [AUTO CR-1 cr:smell] defer — Standards(smell, Mysterious Name): headerOpLive·initiatorLive가 불리언처럼 읽히지만 술어 팩토리다; -/-; scripts/smoke.mjs:-; res:none; follow-up …#T14-R-7
R-8 [AUTO CR-1 cr:smell] defer — Standards(smell, Speculative Generality): audit-smoke-barriers.mjs의 argv[2] 타깃 오버라이드 · commitMigration의 boolean 반환은 테스트만 소비 · isSeedCall의 (?:await\s+)? 그룹은 죽은 코드; -/-; scripts/audit-smoke-barriers.mjs:-; res:none; follow-up …#T14-R-8
R-9 [AUTO CR-1 cr:smell] defer — Standards(smell): SEED_GATED·STABLE_GATED가 손으로 열거돼 있어 헤더가 지키겠다는 새 시나리오를 정확히 놓치고, loop.md의 config_guard 정책상 등록되지 않아 스위트에서 돌지 않는다; -/-; scripts/audit-smoke-barriers.mjs:-; res:none; 가드 자신의 커버리지 한계 — 티켓 기준 A6이 요구한 것은 이 스크립트의 존재와 red 기준선 대조이고 그건 met. follow-up …#T14-R-9
R-10 [AUTO CR-1 cr:smell] defer — Standards(minor): commitMigration이 SW 기동마다 세 번째 readState()를 추가하고 converge()를 그 뒤로 미룬다; -/-; src/runtime/background-bootstrap.ts:294; res:none; Spec R-13과 같은 사실을 다른 축에서 본 것. follow-up …#T14-R-10
R-11 [AUTO CR-1 cr:out-of-diff] defer — Spec(a): 형제 paletteProbe가 동일한 matchMedia→data-theme 왕복을 여전히 맨 waitForTimeout(150)으로 막고 있다; -/-; scripts/smoke.mjs:2425; res:none; 이 티켓이 건드리지 않은 코드이고 구현자가 의도적 범위 밖 보존으로 기록했다 — 티켓 56행이 요구한 것은 "같은 폴링이 흡수하는지 확인한다"이고 확인 결과는 흡수함. 잠복 flake는 한 줄 옆에 남는다. follow-up …#T14-R-11
R-12 [AUTO CR-1 cr:smell] defer — Spec(b): commitMigration()이 blocked에서 StateLoadError를 던지는 것은 티켓 27행이 명세하지 않은 동작; -/-; src/platform/stateStore.ts:43; res:none; 규칙 표에 scope-creep 항목이 없으므로 판단 호출 → cr:smell(정책 28-30행의 잔여 없음 조항). 효과는 읽기 불가 저장소에서 SW 기동당 logError 1건. follow-up …#T14-R-12
R-13 [AUTO CR-1 cr:smell] defer — Spec(c, 잔여): pollStable이 전이 이전 표본을 돌려줄 수 있고, converge()·scheduleBackup()이 commitMigration().finally() 안에서만 돌아 저장소 읽기가 멈추면 재조정 전체가 막힌다; -/-; src/runtime/background-bootstrap.ts:294; res:none; 리뷰어가 "티켓 32-35·53행이 처방한 것 그대로 — 일탈이 아니라 기록"이라고 명시. 이를 바꾸는 것은 티켓 처방을 뒤집는 결정이라 픽스가 아니라 후속. follow-up …#T14-R-13

라운드 판정: blocking 1건(R-1, R-2가 같은 결함) → accept 2행, defer 11행, reject 0행, escalate 0행.
픽스 1회 통과(예산: 티켓당 1회)로 R-1·R-2를 닫고, 나머지는 followups.md로 이월한다.

### ticket 11 code-review r1 — auto-triage
_policy CR-1 · feature-loop/policies/ticket-review-cr1.md · sha256 27ad2f0313d78a9b · decided 2026-07-28T04:13:26Z · fixed point c003920efbf42f3733412531ee6f86f857d77095 · ticket .scratch/wide-ui-redesign/issues/11-save-then-activate.md_

R-1 [AUTO CR-1 cr:smell] defer — Standards: 새 주석이 CONTEXT.md가 Modification의 _Avoid_로 지정한 "규칙/rule" 용어를 쓴다; -/-; src/core/i18n.ts:73; res:none; 리뷰어가 "하드 위반 없음"으로 명시하고 레포 전반에 선재하는 관용(rule-form.tsx·RULE_KINDS·ruleKind·"Add rule" 버튼)이라 이 diff가 도입한 것이 아니라 상속한 것이다 → cr:standard의 "hard breach"에 해당하지 않는다. follow-up docs/reviews/wide-ui-redesign/followups.md#T11-R-1
R-2 [AUTO CR-1 cr:smell] defer — Standards(smell, Duplicated Code): darkRow·seededRow가 hasText만 다른 동일 4단 체인이고 같은 locator 형태가 1896·2199·3838행에도 반복된다; -/-; scripts/smoke.mjs:4106; res:none; follow-up …#T11-R-2
R-3 [AUTO CR-1 cr:smell] defer — Standards(smell, Duplicated Code): 케이스 (a)와 (b)가 "Add rule→Type 대기→Header name→closeSuggestions→Value→Save→waitFormClosed"를 리터럴 둘만 빼고 그대로 반복한다; -/-; scripts/smoke.mjs:4079; res:none; follow-up …#T11-R-3
R-4 [AUTO CR-1 cr:smell] defer — Standards(smell): 블록 헤더가 "그래서 넷을 함께 본다"며 (a)-(d)를 열거하는데 아래 코드는 다섯 케이스를 단언한다 — (e)와 keptAcrossKind가 근거 문단에 없다; -/-; scripts/smoke.mjs:4038; res:none; 낡은 주석이지 동작 결함이 아니고 리뷰어도 판단 호출로 분류했다. follow-up …#T11-R-4
R-5 [AUTO CR-1 cr:smell] defer — Standards(smell, Mysterious Name): 키 enableOnSave와 문구 "Enable after saving"이 수정 모드에서 어색하다 — 그 모드의 스위치는 규칙의 현재 enabled를 비추므로 "after saving"이 이미 살아 있는 규칙에 맞지 않는다; -/-; src/core/i18n.ts:73; res:none; JSDoc이 "라벨은 Save 버튼의 효과를 서술한다"고 변호하고 리뷰어도 defensible로 인정. follow-up …#T11-R-5
R-6 [AUTO CR-1 cr:smell] defer — Standards: rule-form.tsx:495의 `as Modification` 캐스트는 공통 필드에 불필요하다; -/-; src/features/modifications/rule-form.tsx:495; res:none; 리뷰어 자신이 "tooling/precedent로 건너뜀"(선례 14건)으로 분류했다 — 잔여 없음 조항(CR-1 28-30행)을 지키려 행으로만 남긴다. follow-up …#T11-R-6
R-7 [AUTO CR-1 cr:smell] defer — Spec(잠복 취약성): 하위 케이스 (d)의 pollUntil(readMod('X-Act-Seeded'))은 배리어 역할을 하지 않는다 — 그 규칙은 수정 이전에 이미 존재한다. 단언이 지금 안전한 이유는 오직 waitFormClosed가 persist 뒤에 오는 인과 때문이고, 폼이 낙관적으로 닫히게 바뀌면 editKeptOff는 공허하게 통과한다; -/-; scripts/smoke.mjs:4138; res:none; 현재는 올바르므로 결함이 아니라 잠복 취약성. follow-up …#T11-R-7

라운드 판정: **blocking 0건** → accept 0행, defer 7행, reject 0행, escalate 0행. 픽스 패스를
쓰지 않고 라운드 1이 그대로 닫힌다. Spec 축에 티켓 14가 겪은 배리어 공허화를 특정해 검사시켰고,
"X-Act-Dark가 먼저 저장·저장소 확인되고 부재 단언은 그 뒤 저장된 X-Act-Default로 관측한 규칙
세트에서 읽히며 executor.execute가 load-apply-save를 직렬화하므로 관측된 상태가 default를 포함하면
반드시 dark도 포함한다"는 인과로 **공허하지 않음**을 확인받았다.

### ticket 12 code-review r1 — auto-triage
_policy CR-1 · feature-loop/policies/ticket-review-cr1.md · sha256 27ad2f0313d78a9b · decided 2026-07-28T04:46:32Z · fixed point 3aadd42fdc963c3687da05bd21fae738b4a77025 · ticket .scratch/wide-ui-redesign/issues/12-snapshot-delete.md_

**두 축이 갈렸고, 그 불일치가 이 라운드의 값어치다.** Spec 축은 "경계된 삭제"를 sound로 통과시켰다 —
정상 스냅샷 id를 전제한 추론이다. Standards 축은 `snapshotId === ''`이면 접두사가 `bk:`로 붕괴해
`BACKUP_MANIFEST_KEY`와 **다른 모든 스냅샷의 청크**까지 매치된다는 것을 짚었다. 매니페스트는
`storage.sync`로 다른 기기·버전에서 들어오고 `isManifestEntry`는 `typeof === 'string'`만 본다.
`backup.ts:345`가 바로 그 불변식을 주석으로 **선언**하지만 코드가 강제하지 않는다. 기준 감사도
Spec 축과 같은 정상 경로 추론으로 기준 3을 met으로 통과시켰다 — 축을 분리해 두고 재순위화하지
않는 이유가 이것이다.

R-1 [AUTO CR-1 cr:defect] accept — Standards(blocking): 스윕이 경계되지 않는다 — snapshotId가 빈 문자열이면 접두사가 bk:로 붕괴해 매니페스트 키와 다른 모든 스냅샷 청크를 한 번에 지운다; -/-; src/core/backup.ts:360; res:none; 사용자 데이터 손실 경로이고, 주석이 선언한 불변식을 코드가 강제하지 않는 전형이다. 빈 id 및 ':'를 품은 id에 빈 plan을 돌려주는 가드가 필요하다; fixed 8e823e4 (3 files, 41 lines); suite green→green 368/368 · smoke 126/126
R-2 [AUTO CR-1 cr:smell] defer — Standards: 반쯤 지워진 상태의 보고가 거꾸로다 — 매니페스트가 먼저 커밋되므로 removeBackupKeys가 던지면 행은 이미 목록에서 사라졌는데 배너는 "삭제하지 못했다"고 말한다; -/-; src/platform/backupStore.ts:116; res:none; 리뷰어가 데이터 순서 자체는 옳고 planBackup의 preRemoves가 고아 청크를 수거함을 확인했다 — UI 메시지의 혼선이지 데이터 결함이 아니다. follow-up docs/reviews/wide-ui-redesign/followups.md#T12-R-2
R-3 [AUTO CR-1 cr:defect] accept — Standards: remaining이 공유 매니페스트 키를 이 백업의 잔여 키 수에 포함시킨다; -/-; src/core/backup.ts:386; res:none; snapshotDeleteRemaining이 "{count} key(s) of this backup are still stored"로 노출하는 숫자가 틀린다 — 공유 키는 그 백업의 키가 아니다; **not applied (blocked at test-weakening)** — 픽스가 기존 단언 `expect(stillListed.remaining).toContain(BACKUP_MANIFEST_KEY)`(src/core/backup.test.ts:352, 이번 시도에서 쓰지 않은 테스트)의 재기준화를 요구하고, 유일한 대안인 src/platform/backupStore.ts:129에서의 필터링은 네 번째 파일이라 guard:blast-radius에 걸린다. 커밋 sha 없음
R-4 [AUTO CR-1 cr:smell] defer — Standards: 주석이 실제보다 강한 안전 성질을 주장한다 — "다른 파괴적 동작을 켜는 것이 앞의 확인을 그대로 취소한다"는 행 사이에서만 참이고 confirmingClear·confirmingReset은 별개 불리언이라 파괴적 확인 셋이 동시에 무장될 수 있다; -/-; src/features/backup/backup-panel.tsx:72; res:none; 동작 결함이 아니라 주석의 과장이다. follow-up …#T12-R-4
R-5 [AUTO CR-1 cr:smell] defer — Standards(smell, Duplicated Code): removeSnapshot과 restore가 바이트 동일한 arm-then-run 서두를 공유하고 파일이 확인 메커니즘 셋을 이고 있다; -/-; src/features/backup/backup-panel.tsx:173; res:none; follow-up …#T12-R-5
R-6 [AUTO CR-1 cr:defect] accept — Standards: removeSnapshot만 setNotice(null)을 부르지 않아 "Cloud backups deleted." 성공 알림이 새 삭제 실패 배너 아래 남는다; -/-; src/features/backup/backup-panel.tsx:180; res:none; R-9와 같은 결함을 Standards 축에서 본 것 — 한 번의 픽스가 두 행을 닫는다; fixed 8e823e4 (3 files, 41 lines); suite green→green 368/368 · smoke 126/126
R-7 [AUTO CR-1 cr:smell] defer — Standards(smell, Middle Man): DeleteSnapshotResult = ClearCloudResult는 타입이 아니라 이름만 더하고, 순서 근거가 그 별칭에 docblock돼 있어 정작 그것이 규율하는 deleteBackupSnapshot에서는 보이지 않는다; -/-; src/platform/backupStore.ts:105; res:none; follow-up …#T12-R-7
R-8 [AUTO CR-1 cr:smell] defer — Spec(b, 범위 이탈): 티켓 16행이 "일괄 클라우드 백업 삭제(스펙 R-1)는 이 티켓에서 바꾸지 않는다"고 울타리를 쳤는데 clearFailureDetail이 verifiedDeleteDetail로 개명·재서명되고 deleteCloud 호출부가 수정됐다; -/-; src/features/backup/backup-panel.tsx:134; res:none; 동작은 동일(같은 키 전달)하고 기준 감사도 R-1/R-3 경로 코드가 기준선과 바이트 동일함을 확인했다. 규칙 표에 scope-creep 항목이 없어 판단 호출(CR-1 28-30행). follow-up …#T12-R-8
R-9 [AUTO CR-1 cr:defect] accept — Spec(c1): 티켓 14행 "지우지 못한 것이 지워진 것처럼 보이지 않는다"를 위반한다 — 일괄 삭제 후 남은 성공 알림이 스냅샷 삭제 실패 배너 옆에 그대로 있다; -/-; src/features/backup/backup-panel.tsx:173; res:none; 티켓이 명시적으로 요구한 조항이라 판단 호출이 아니라 결함이다. R-6과 동일 결함, 한 번의 픽스가 둘을 닫는다; fixed 8e823e4 (3 files, 41 lines); suite green→green 368/368 · smoke 126/126
R-10 [AUTO CR-1 cr:smell] defer — Spec(c2): 첫 삭제 클릭 직후 정착 창 없이 armed = await bkView(snapArea)를 읽어, 클릭이 실제로 지웠다면 비동기 쓰기가 안 내려앉아 armedNothingRemoved가 그냥 통과한다; -/-; scripts/smoke.mjs:-; res:none; deleteArmed가 그 시나리오에서 실패하므로 단독 가드가 아니라 중복 가드다. **이 루프에서 같은 계열(공허해질 수 있는 단언)이 세 번째다** — T14-R-11·T11-R-7과 함께 읽을 것. follow-up …#T12-R-10

라운드 판정: blocking 1건(R-1) → accept 4행(R-1·R-3·R-6·R-9, 이 중 R-6·R-9는 같은 결함), defer 6행,
reject 0행, escalate 0행. 픽스 1회 통과로 accept를 닫는다. 픽스는 `src/core/backup.ts`,
`src/core/backup.test.ts`, `src/features/backup/backup-panel.tsx` 셋으로 가드 상한(≤3파일)을 정확히
소진하므로 네 번째 파일이 필요해지면 `guard-would-trip`으로 멈춰야 한다.

**픽스 결과: 부분 적용 후 `test-weakening` 정지.** R-1·R-6·R-9는 `8e823e4`로 적용됐고 가드를
전부 통과했다(3파일 41줄, 테스트 순증 +19, blast_radius_ok, untouchable 무접촉). R-3은 적용되지
않았다 — 아래 ESCALATION 블록이 그 이유와 사람에게 필요한 결정을 담는다.

### ESCALATION test-weakening 2026-07-28T05:03Z

**정지 사유.** 티켓 12의 픽스 서브에이전트가 R-3을 적용하려면 이번 시도에서 자기가 쓰지 않은
기존 단언을 재기준화해야 했고, `test-weakening`으로 멈췄다. 컨덕터가 파일에서 직접 확인한 사실:

- 문제의 단언 — `src/core/backup.test.ts:352`
  `expect(stillListed.remaining).toContain(BACKUP_MANIFEST_KEY);`
- R-3의 주장 — `verifySnapshotDeleted`의 `remaining`이 **공유** 매니페스트 키를 포함하고, 그 수가
  `snapshotDeleteRemaining`("{count} key(s) of this backup are still stored")으로 사용자에게
  노출된다. 공유 키는 삭제 대상 백업의 키가 아니므로 숫자가 틀린다.
- 유일한 대안 — 수를 세는 지점(`src/platform/backupStore.ts:129`)에서 거르기. 그건 **네 번째
  파일**이라 `guard:blast-radius`(≤3파일)에 걸린다.

**즉 테스트가 리뷰가 결함이라고 부른 바로 그 동작을 고정하고 있다.** 어느 쪽이 옳은지는 기계가
정할 문제가 아니다 — 테스트가 의도된 계약이면 R-3은 오탐이고, 리뷰가 옳으면 그 테스트는 결함을
박제한 것이다. 이 판정이 이 정지가 사람에게 묻는 전부다.

**적용된 것 / 적용되지 않은 것.**

- `accept` R-1 — applied `8e823e4`. 빈 id·`:` 포함 id에서 빈 plan을 돌려주는 가드 + 코어 단위
  테스트 1건(`''`, `'bk:'`, `'sa:0'`). **이것이 blocking 데이터 손실 경로였고 닫혔다.**
- `accept` R-6 / R-9 — applied `8e823e4`. `removeSnapshot`이 형제 파괴적 동작들처럼
  `setNotice(null)`을 부른다.
- `accept` R-3 — **not applied, 커밋 sha 없음.** 위 사유.
- `defer` R-2·R-4·R-5·R-7·R-8·R-10 — `followups.md` T12-R-* 로 이월됨(정지와 무관).

**되돌리지 않았다.** 적용된 픽스는 커밋돼 있고 개별 검토를 거쳤으며, 무인 상태의 되돌리기는
검토받지 않은 변경을 하나 더 만드는 일이다. 티켓 12는 **닫지 않았다**.

**전체 스위트는 정지 시점에 green이다** — `8e823e4`에서 컨덕터 독립 실행 exit 0,
Tests 368 passed (368), smoke 126/126. 즉 이 정지는 깨진 트리가 아니라 판정 요청이다.

### 인간 결정 — 티켓 12 R-3 처분 2026-07-28T05:5xZ

사용자가 "너의 제안대로 해줘"로 컨덕터에게 처분 집행을 위임했다. 컨덕터는 권고를 추측으로
채우는 대신 **읽기 전용 다각 조사(4렌즈) + 적대적 반증(3인)** 을 돌렸고, 그 결과가 아래다.
**결정 주체는 사용자의 위임을 받은 컨덕터이며, 아래 사실 주장은 전부 컨덕터가 소스에서 직접
재확인했다** — 서브에이전트 보고를 그대로 채택하지 않았다.

**초안 권고는 기각됐다.** 종합 에이전트의 1차 권고는 `defer`였고 confidence high였으나 적대적
검증에서 3인 중 2인이 반증했으며, 반증이 옳았다. 이 사실을 지우지 않고 남긴다 — 깨끗한 이야기로
보고하면 이 기록의 값어치가 사라진다.

**소스에서 직접 확인한 것 셋.**

1. `verifySnapshotDeleted`의 docblock(`src/core/backup.ts:391-396`)은 반환값을 "남은 **근거**를
   그대로 돌려주어 호출부가 성공으로 접지 못하게 한다"로 스스로 정의한다. `remaining`은 잔여 키
   **인벤토리**가 아니라 **실패 근거 토큰**이다. 형제 함수 `verifyBackupsCleared`는 같은 자리를
   "남은 **키**"(`:331`)라고 다르게 부른다 — 모듈이 두 개념을 구분해 쓴다.
2. `:403` `[...(plan.found ? [BACKUP_MANIFEST_KEY] : []), ...plan.removeKeys]` — 매니페스트 키는
   **`plan.found`일 때만** 붙는다. 어댑터(`src/platform/backupStore.ts:124-128`)는 매니페스트를
   커밋한 뒤 **다시 읽은 KV**로 검증하므로, 재읽기에서 행이 발견된다는 것은 그 커밋이 반영되지
   않았다는 뜻이다. 그 경로에서 `bk:manifest`는 "잘못 센 공유 인덱스"가 아니라 **그 백업의
   데이터를 아직 담고 있는 실재 키**다. 과대계수가 아니다.
3. 빼면 거짓 성공 경로가 열린다: `isManifestEntry`(`:150-158`)가 `chunkCount: 0`을 통과시키므로
   `chunkKeysOf`(`:169-171`) = [] → 접두 스윕도 [] → 매니페스트 키까지 빼면 `remaining=[]` →
   **행이 그대로 살아 있는데 `{ok:true}`**. 이는 티켓 12 기준 4행("지우지 못한 것이 지워진 것처럼
   보이지 않는다")을 정면으로 위반하며, R-3이 고치려던 표시 오류보다 심각도가 한 등급 높다.

**따라서 `backup.test.ts:352`는 결함을 박제한 단언이 아니라 의도된 계약이다.** 같은 `it` 안에서
순수 키 목록 경로는 정확한 `toEqual({ok:false, remaining:[chunkKey('sa',0)]})`(:341-344)를,
근거 경로만 느슨한 `toContain`(:352)을 쓴다. 단언 강도의 비대칭 자체가 두 개념의 구분을 증언한다.

R-3 [HUMAN CR-1 overrides cr:defect] reject — remaining이 공유 매니페스트 키를 포함하는 것은 결함이 아니라 설계된 실패 근거다; -/-; src/core/backup.ts:403; res:none; 사용자 위임 2026-07-28, 컨덕터 판정 — 매니페스트 키는 plan.found일 때만 붙고 그때 그 키는 실제로 이 백업의 행을 담고 있다(backup.ts:391-396 "남은 근거", :403). 빼면 chunkCount:0 외래 항목에서 {ok:true}로 접혀 실패 신호가 유실된다(:150-158 + :169-171). 기계는 이 행을 accept로 판정했으나 그 판정이 지목한 위치에 결함이 없다. **코드 변경 없음**, backup.test.ts:352 무수정. 위 `[AUTO CR-1 cr:defect] accept … not applied` 행은 기계가 한 일의 기록으로 그대로 유효하다

**두 개의 전제가 조사로 반증됐다. 기록에 남긴다 — 남기지 않으면 다음 읽는 사람을 오도한다.**

- **`test-weakening` 정지는 거짓 전제 위에 섰다.** 픽스 서브에이전트는 "R-3을 고치려면
  `backup.test.ts:352`를 재기준화해야 한다"고 판단했지만, 그 위치에 고칠 결함이 없으므로 올바른
  픽스는 애초에 그 테스트를 건드리지 않는다. **다만 서브에이전트의 행동 자체는 옳았다** — 자기
  판단으로 기존 단언을 재기준화하는 대신 멈췄고, 그 멈춤이 이 조사를 불렀다. 가드가 의도대로
  작동한 사례이지 오작동이 아니다.
- **"가드 상한이 소진됐다"는 전제는 틀렸다.** `fix-brief.md:65`는 "≤3 files and ≤80 changed lines
  **across the whole commit**" — **커밋당**이지 티켓당 누적이 아니다. `8e823e4`가 소진한 것은 그
  커밋의 예산이고, 새 픽스 커밋은 예산을 새로 받는다. 이 정지의 ESCALATION.md와 위 AUTO 행이
  네 번째 파일을 막힌 이유로 든 것은 그 점에서 부정확했다. 처분 결과는 바뀌지 않는다(고칠 결함이
  그 위치에 없으므로) — 그러나 근거는 정확해야 한다.

**조사가 R-3이 지목하지 않은 진짜 결함을 하나 찾았다.** `src/core/backup.ts:382`
`if (entry) for (const key of chunkKeysOf(entry)) keys.add(key);` 가 `chunkCount`에서 유도한 청크
키를 **KV 존재 확인 없이** 합친다. 그래서 문제의 픽스처(`backup.test.ts:347-348`, 유일한 청크를
KV에서 지움)에서 `remaining=['bk:manifest','bk:sa:0']` → `backupStore.ts:129`가 2로 세는데 실재
키는 `bk:manifest` 하나다. 사용자에게 보이는 숫자가 유령 키만큼 부풀려진다. **실패 경로 전용**
이고(정상 성공 삭제는 `plan.found`가 false라 문구 자체가 뜨지 않는다 — `backup.test.ts:336`이
고정), 오도의 방향도 "실제보다 더 남았다"는 안전한 쪽이다. `followups.md` **T12-R-3**으로 이월.
제목은 "매니페스트 키가 섞인다"가 아니라 **"존재하지 않는 청크 키가 잔여 개수에 합성된다"** 이며,
후속 작업자에게 **매니페스트 키는 근거로 유지하라**고 명시적으로 못박았다.

### ticket 13 code-review r1 — auto-triage
_policy CR-1 · feature-loop/policies/ticket-review-cr1.md · sha256 27ad2f0313d78a9b · decided 2026-07-28T06:16:37Z · fixed point a262809bc161418e635472cd84c5b12d9c29f3ba · ticket .scratch/wide-ui-redesign/issues/13-profile-row-status.md_

R-1 [AUTO CR-1 cr:standard] accept — Standards: ruleCount이 한 모듈 안에서 서로 다른 두 가지를 뜻한다 (CONTEXT.md:13 hard violation); -/-; src/core/summary.ts:76; res:none; blocking. CONTEXT.md:13의 Modification 항목이 "_Avoid_: rule (브라우저의 net rule과 혼동)"을 명문화했고, StatusSummary.ruleCount(:17/:87)는 result.rules.length로 진짜 net rule을 세는 올바른 용법인데 이 diff가 새로 만든 ProfileRowStatus.ruleCount(:76)는 **켜진 Modification 수**를 센다 — 문서가 금지한 바로 그 혼동이 한 파일 안에 두 뜻으로 공존한다. diff 자신의 주석이 이를 시인한다("…와는 다른 질문의 답이다"). 문서화된 표준의 경성 위반이라 cr:smell(Mysterious Name)이 아니라 cr:standard로 든다 — 표준이 베이스라인을 이긴다. 권고: enabledModificationCount로 개명
R-2 [AUTO CR-1 cr:smell] defer — Standards: 규칙 수가 보조기술에 전혀 노출되지 않는다; -/-; src/features/profiles/profile-dot.tsx:172; res:none; ProfileRowMark가 aria-hidden이고 profileSelectLabel은 {state}만 나른다. Standards 축은 medium·non-blocking으로 매겼고 문서화된 규칙을 인용하지 못했다 — 근거가 story 38과의 일관성 논증이다. Spec 축이 같은 결함을 독립으로 보고(R-5) "티켓이 접근 가능한 이름에 요구한 것은 정지뿐이므로 **문언상 위반이 아니다**"라고 명시했다. 두 축이 티켓의 문언 안이라는 데 일치하므로 기준이 함의하는 미처리 케이스가 아니고, 판단 호출로서 cr:smell이다. follow-up docs/reviews/wide-ui-redesign/followups.md#T13-R-2
R-3 [AUTO CR-1 cr:smell] defer — Standards: 일시정지 muted 틴트가 선택되지 않은 행에서는 무효과다; -/-; src/features/profiles/profile-dot.tsx:176; res:none; paused ? 'text-muted-foreground' : '' 이지만 SwitcherChip의 비선택 상태가 이미 text-muted-foreground다. 실제로 구분하는 것은 글리프뿐이고 주석 "수는 muted로 내려간다"는 많아야 한 행에서만 참이다. Standards 축이 스스로 low·판단 호출로 표시했다. follow-up docs/reviews/wide-ui-redesign/followups.md#T13-R-3
R-4 [AUTO CR-1 cr:defect] accept — Spec: 일시정지가 아이콘과 색으로만 표시되고 보이는 텍스트가 없다; -/-; src/features/profiles/profile-dot.tsx:179; res:none; non-blocking이나 티켓이 명시한 요구의 부분 미충족이다. 티켓: "전역 일시정지 중에는 모든 프로필 행이 정지로 읽힌다 — 색만이 아니라 **텍스트·형태**로도 구분되고". 형태 채널은 9px Pause 글리프로 섰으나 텍스트 채널은 접근 가능한 이름((paused)/(정지))뿐이고 이는 **결코 보이지 않는다**; 수 텍스트는 정지 여부와 무관하게 동일하다. 티켓이 지목한 선례(badge.ts → 'II')는 **텍스트** 정지 표식이다. Spec 축 브리프의 (a)항 "요구했으나 빠졌거나 부분적인 것"에 정확히 해당하므로 기준이 함의하는 미처리 케이스로서 cr:defect다. 기준 감사자는 같은 기준을 met로 읽었고(글리프+ariaStatePaused) 리뷰어는 부분으로 읽었다 — 이 불일치가 라운드의 값이다. 컨덕터는 티켓 본문을 읽을 수 없으므로 어느 독해가 옳은지 스스로 정하지 않고, 스펙을 읽을 수 있는 픽스 서브에이전트에 넘긴다. 그것이 소싱 불가로 판단하면 needs-decision을 반환할 것이고 그때 relay한다 — CR-1이 cr:needs-decision을 컨덕터가 평가하지 말고 중계하라고 정한 그대로다
R-5 [AUTO CR-1 cr:smell] defer — Spec: 규칙 수가 aria-hidden이라 어떤 보조 채널로도 닿지 않는다; -/-; src/features/profiles/profile-dot.tsx:174; res:none; R-2와 **같은 결함을 다른 축에서 본 것**이며 CR-1이 "두 보고서의 모든 finding은 정확히 한 행씩"을 요구하므로 별도 행으로 남긴다. Spec 축이 low로 매기고 "티켓이 요구한 것은 접근 가능한 이름이 정지를 나르는 것뿐이므로 문언 안이며, story 38 의도에 대한 간극으로 표시할 뿐 위반이 아니다"라고 스스로 한정했다. follow-up docs/reviews/wide-ui-redesign/followups.md#T13-R-2 (R-2와 동일 항목)
R-6 [AUTO CR-1 cr:smell] defer — Spec: "active 불변" core 단언이 공허하다; -/-; src/core/summary.test.ts:135; res:none; expect(target.active).toBe(true)는 순수·비변이 함수 호출 뒤라 결코 실패할 수 없다. cr:missing-seam-test를 검토했으나 그 규칙의 문언은 "스펙이 지명한 시임에 이 diff의 테스트가 **없다**"이고 여기서는 시임에 4개 케이스가 실제로 있다 — 규칙을 확장 적용하지 않고 CR-1의 잔여 규칙("어떤 규칙에도 맞지 않으면 판단 호출로서 cr:smell")을 따른다. Spec 축 스스로 "요구는 전체적으로 덮여 있고(스모크의 activeWhilePaused === true가 하중을 받는 판) core 쪽 항목이 일을 안 할 뿐"이라고 했다. follow-up docs/reviews/wide-ui-redesign/followups.md#T13-R-6
R-7 [AUTO CR-1 cr:out-of-diff] defer — Standards: ui-diag first-paint 수치가 재기준선 없이는 판정 불가다; -/-; docs/reviews/ui-polish/perf-baseline.md:-; res:none; 코드 쪽은 **오탐으로 확인됐다** — summary.ts:1-3이 전부 import type이라 eager한 profile-sidebar.tsx에서 런타임 import로 바꿔도 의존성 없는 모듈을 끌 뿐이고, Pause는 이미 lucide를 import하는 파일에 얹히며, 행당 작업은 .filter().length 한 번이다. 남은 것은 절차다: perf-baseline.md의 caveat는 실재하나("유효한 비교는 같은 기기에서 이 기준선 대비뿐이다"; 기준선 darwin/arm64 M5 Pro, 현재 x86_64 i7-10700K) 그 문서는 **면제가 아니라 처방**을 적는다 — "기기가 바뀌면 변경 전 빌드로 되돌려 다시 떠야 한다". 아무도 재기준선을 뜨지 않았으므로 276 ms는 *설명된* 것이 아니라 *무의미한* 것이고, 구현자와 기준 감사자가 쓴 "기기 차이"는 문서가 재측정을 요구하는 자리에서의 단정이다. 이 티켓이 건드리지 않은 자산의 절차 결함이라 cr:out-of-diff. follow-up docs/reviews/wide-ui-redesign/followups.md#T13-R-7
