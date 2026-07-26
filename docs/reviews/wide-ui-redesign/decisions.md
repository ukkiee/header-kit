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

R-1 [AUTO CR-1 cr:defect] accept — Spec: 부분 실패 후 finally의 resumeAutoBackup이 곧바로 scheduleBackup을 걸고, 실패 경로에선 resetState가 아직 안 돌아 상태가 옛 프로필 그대로라 약 3초 뒤 옛 데이터 스냅샷이 새로 써진다 — 방금 지운 백업이 되살아나고 재개 스냅샷이 스펙의 "깨끗한 default"가 아니다; -/-; src/core/reset.ts:-; res:none; 
R-2 [AUTO CR-1 cr:defect] accept — Spec: runBackup이 진입 시 한 번만 backupSuspended를 보고 두 await를 지나므로, 가드를 이미 통과한 in-flight 백업은 중단되지 않고 옛 payload 스냅샷이 삭제·검증 이후 착지할 수 있다 — "이 한 줄이 초기화의 유일한 경합을 없앤다"는 주석이 사실이 아니다; -/-; src/runtime/background-bootstrap.ts:135; res:none; 
R-3 [AUTO CR-1 cr:standard] accept — Standards: `CLEARED_TARGETS`가 배열이라 BackupTarget이 하나 늘면 그 저장소가 조용히 안 지워진다 — 파괴적 동작에서 가장 나쁜 실패 형태이고, 저장소 규율은 Record로 못박아 키 누락이 런타임으로 새지 않게 하는 것; -/-; src/core/reset.ts:-; res:none; 
R-4 [AUTO CR-1 cr:standard] accept — Standards: 초기화 실패 문자열이 i18n 카탈로그를 우회해 내부 ResetStep 식별자가 ko 로케일에서도 영어로 배너에 앉는다(같은 파일의 clearFailureDetail이 정반대 선례); -/-; src/runtime/background-bootstrap.ts:-; res:none; 
R-5 [AUTO CR-1 cr:standard] accept — Standards: 코드가 "공장 초기화"(commands.ts·backup-panel.tsx·background-bootstrap.ts)와 "전체 초기화"(reset.ts·stateStore.ts)로 갈렸다; -/-; src/core/commands.ts:314; res:none; 
R-6 [AUTO CR-1 cr:smell] defer — Standards: `resetEverything`이 `deleteCloud`와 한 줄씩 같은 형태이고 한 컴포넌트에 2단계 확인 상태가 셋(confirmingId·confirmingClear·confirmingReset) — Duplicated Code; -/-; src/features/backup/backup-panel.tsx:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T08-R-6
R-7 [AUTO CR-1 cr:smell] defer — Standards: `reset.ts`의 `reason(error)`와 `backup-panel.tsx:41`의 `reasonText` 본문이 동일 — Duplicated Code; -/-; src/core/reset.ts:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T08-R-7
R-8 [AUTO CR-1 cr:smell] defer — Standards·Spec 양축: `resetToDefaults()`가 `createDefaultState()`를 그대로 감싸기만 한다 — Middle Man; -/-; src/core/commands.ts:320; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T08-R-8
R-9 [AUTO CR-1 cr:smell] defer — Standards: `CLEARED_TARGETS`가 "이미 지운"으로 읽히지만 "지울 목록"이고, `const applied: { state?: StoredState } = {}`는 반환 통로를 객체로 위장한 가변 상자 — Mysterious Name; -/-; src/core/reset.ts:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T08-R-9
R-10 [AUTO CR-1 cr:smell] defer — Standards: `suspendAutoBackup(): void | Promise<void>` 유니온은 두 구현 다 동기인데 남았고, `reset.ts`의 `if (keys.length > 0)`는 `removeBackupKeys`의 조기 반환과 중복 — Speculative Generality; -/-; src/runtime/background-bootstrap.ts:-; res:none; follow-up docs/reviews/wide-ui-redesign/followups.md#T08-R-10
