# scope-race-hardening — Review Decision Log

## Stage 1 — 설계 확정 (2026-07-29, `/grilling` + `/domain-modeling`)

사람이 9개 결정을 확정했다. 아키텍처 결정의 정본은 `docs/adr/0016-single-writer-lane.md`.

1. 범위 = R-1 · R-2 · R-3 + smoke N43. followups T14-1(리비전 CAS) 제외.
2. 배리어 위치 = 런타임 소유자 객체, 컴포지션 루트에서 1회 인스턴스화. 모듈 최상단 락은
   스토어 모듈이 렌더러·서비스워커 양쪽에 실려 컨텍스트당 하나로 갈라지므로 물림.
3. 레인 입자 = 서비스워커 단일 레인, 요청 경계 한 층에서만 획득. 자원별 레인은 전체 초기화가
   셋을 쥐어 락 순서 규칙이 생기므로 물림.
4. 강제 = 브랜드 토큰 타입. 명령 실행자의 자체 tail 체인 제거, lost-update 테스트는 레인
   층위로 이동.
5. 렌더러 요청 채널 = 문 하나 + op 판별 유니온.
6. R-1 강도 = A안(갈래의 authority 자리에서만 호스트 증명). 측정: 기존 판정 테이블 단언
   뒤집힘 0행, 새는 모양 4/4 해결. B(정규식에만 앵커 요구)는 `contains`와 잣대가 반대로 서서
   물림. C(엄격)는 9행이 뒤집히고 그중 셋이 `contains`인데 ADR 0008이 폼 기본값을 `contains`로
   정했으므로 모든 신규 Block이 확인을 받게 되어 물림.
7. 테스트 시임 = 제어형 storage fake + 결정론적 스케줄러로 모든 인터리빙 소진.
8. 스모크 = N43 유지 + 겹친 삭제 끝단간 시나리오 추가.
9. 문서 = ADR 0016 + `CONTEXT.md` 용어 둘(Writer Lane, Scope Breadth). 커밋 `d9276b2`.

## Stage 2 — 시임 확인 (2026-07-29, `/to-spec`)

사람이 확정: 기존 경합 테스트 셋(상태 저장소 인터리빙 · 백업 저장소 삭제↔백업 · 부트스트랩
재진입)을 신규 통합 시임 S3로 **이동**한다(삭제 아님). 티켓이 옮긴 단언을 행 단위로 대응시켜
적어야 한다. 경합과 무관한 단위 테스트는 원래 자리에 남는다.

### plan r1

아티팩트: `docs/reviews/scope-race-hardening/plan-r1.json`
`ok:true` · `verdict: needs-attention` · `triageMode: human` · `ack: human-triage`
`reviewedSha: d9276b2658ad85533825ff63ba1e2e1d4c9734fe` ·
`reviewedPlanSha256: 6f081c59becc7b517c6771ce6dceb477f6124a19a404a7f8b50bfce6d9d7d9b6` ·
`headMovedDuringReview: false` · `planDriftDuringReview: false`
사람 결정: `as proposed` + R-3 갈래는 `(c) 안정 읽기 재시도`.
네 건의 코드 주장은 트리아지 전에 전부 저장소에서 직접 확인했다.

R-1 accept — Open question: Where do migration and non-message transitions enter the Writer Lane?
R-2 accept — Open question: How does the Writer Lane recover from a rejected job?
R-3 accept — The direct-read consistency invariant is false during Backup eviction
R-4 reject — Unanchored contains scopes can still bypass Block confirmation; 처방이 정확하다는 데는 이견이 없으나 Stage 1에서 측정 후 물린 선택지 C와 같다. 어느 형태로 조여도 기존 판정 9행이 뒤집히고 그중 셋이 `contains`인데 ADR 0008이 폼 기본값을 `contains`로 정했으므로 기본 경로로 만든 모든 Block이 확인을 받게 된다. 확인이 상시가 되면 사용자는 읽지 않고 누르고 진짜 넓은 규칙에 대해서도 가드레일이 죽는다 — 가드레일을 켜서 끄는 셈이다. 게이트가 더한 각도(URL 필터 문법의 `||` 도메인 앵커를 증명 수단으로)도 기존 테이블 어느 행도 그 앵커를 쓰지 않으므로 뒤집히는 행 수는 같다. 이 구멍은 릴리스 r1·r2·r3가 한 번도 제기하지 않았고 ADR 0008이 알고 받아들인 성질이라 이월한다. 다만 지적 중 "Solution이 과약속한다"는 부분은 옳아, 결정과 무관하게 한계를 Solution과 D1에 인라인으로 명시했다.

#### 적용 내역 (accept 3건, 워킹 트리 — 게이트 통과 전이라 미커밋)

- R-1 → D2에 레인 진입점 표(일곱 항목) 전수 추가. 실행자를 직접 부르는 넷(Pause 토글 ·
  만료 알람 · 재조정 중 만료 · 전체 초기화 내부 호출)과 부트스트랩 마이그레이션 커밋이
  목록에서 빠져 있던 것이 지적의 핵심이다. 마이그레이션은 읽기부터 커밋까지 토큰 하나 안에서
  돌 것과 enqueue 순서 규정을 추가. D5에 "이 결정은 D2의 두 조항에 전적으로 의존한다 —
  D2 없이 D5를 먼저 적용하면 릴리스 r3의 R-2가 그대로 되돌아온다"를 명시. S3에 양방향 순서와
  진입점 전수 확인을 수용 기준으로 추가.
- R-2 → D4에 레인의 실패 계약 둘("각 호출자는 자기 실패를 받는다", "레인은 언제나 전진한다")
  추가. 저장 경로가 설계상 던진다는 사실(Blocked 계약, 명령 검증 거부)을 함께 적어 이것이
  이론적 경로가 아님을 못 박음. S3에 거부-후-전진 수용 기준 추가. 사용자 스토리 36·37 추가.
- R-3 → D7의 거짓 주장 교정. (기제는 아래 `### plan r2`에서 한 번 더 바뀐다.)
  백업 계획의 사전 정리에 링에서 밀려나는 항목의 청크가 들어가고,
  그 청크들은 아직 커밋된 옛 매니페스트가 열거하는데 매니페스트 교체보다 먼저 지워진다는
  사실을 적었다. 해결은 안정 읽기 재시도. 물린 대안 둘(읽기를 레인으로 — 히스토리 화면마다
  워커 기동 지연 / 사전 정리를 커밋 뒤로 — 사전 정리의 존재 이유가 공간 확보라 없던 quota
  실패를 만든다)을 근거와 함께 기록. S3에 축출 중 읽기 수용 기준 추가. 사용자 스토리 38 추가.

### plan r2

아티팩트: `docs/reviews/scope-race-hardening/plan-r2.json`
`ok:true` · `verdict: needs-attention` · `triageMode: human` · `ack: human-triage`
`reviewedSha: d9276b2658ad85533825ff63ba1e2e1d4c9734fe` ·
`reviewedPlanSha256: fd4cd0d6d057076f3ed3ce30c3dc6806f533f56dc22991338430053377780771`
(r1의 `6f081c5…`에서 바뀌었다 — 리뷰가 수정된 스펙을 실제로 읽었다는 증거) ·
`headMovedDuringReview: false` · `planDriftDuringReview: false`

r1 재검증 결과: **R-1 resolved** (진입점 전수 표 · 단일 토큰 마이그레이션 · FIFO 순서 규정과
대응 테스트), **R-2 resolved** (실패 격리·레인 전진 계약과 거부-후-전진 커버리지),
**R-3 still open**. 픽스가 만든 신규 critical/high는 **없음**.

R-1 accept — R-3 still open: one retry does not establish a stable read

#### 적용 내역 (accept 1건)

D7의 기제를 **단순 재시도 → 매니페스트 변경 펜스(유계 타임아웃)** 로 교체. 재시도는 경합적
가정이었다 — 사전 정리 후 커밋 앞 창에 **두 읽기가 모두** 드는 순서가 존재하고, S3의 소진
스케줄러는 그 순서를 반드시 찾으므로 수용 기준을 원리적으로 만족시킬 수 없었다. 스펙 안의
모순이었고 플랜 게이트가 잡아야 할 정확히 그 종류다. 펜스는 모든 순서에 정의된 기대값을 준다.
S3 기준 4를 세 케이스(커밋 전 재시도 / 결국 커밋됨 / 사전 정리 후 워커 종료)로 재작성했고,
마지막 케이스는 펜스가 무한 대기로 구현되는 것을 막는다.

#### 게이트 종결

WAIVED by user: R-3 픽스의 재검증(라운드 3)을 면제한다. 근거 — 라운드 2가 high 두 건을
resolved로 확인했고 픽스가 만든 신규 critical/high가 0이며, 남은 것은 medium 한 건이다.
그 medium은 이 슬러그가 고치러 온 세 건이 아니라 플랜 게이트가 새로 발견한 항목이고,
기제 교체가 읽기 경로에만 닿아 쓰기 규약을 건드리지 않는다. Stage 4의 structure 게이트가
실제 첫 슬라이스를 브랜치 스코프로 보므로 잔여는 거기서 다시 읽힌다.

**plan 게이트 통과** (waiver). 다음 단계 진행 가능.

## structure 게이트

### structure r1

아티팩트: `docs/reviews/scope-race-hardening/structure-r1.json`
(`ok:true` / `verdict: needs-attention` / findings 1 / `reviewedSha` `ffff03b` /
`headMovedDuringReview: false` / `ack: human-triage` / `triageMode: human`)

R-1 accept — `Held` is an escapable, independently mintable token—not proof of active ownership

#### 트리아지 전 사실 확인

지적의 코드 주장을 저장소에서 직접 재현했고 **핵심 둘 다 사실이었다.**

1. **증표가 탈출한다.** `const escaped: Held = await createWriterLane().run(async (held) => held);`
   뒤에 `persistState(escaped, …)`를 두고 `bun run check`를 돌려 **exit 0**을 확인했다. `run<T>`의
   `T`가 `Held`로 추론되는 것을 막는 것이 없었다 — 타입 강제가 한 줄로 무력화됐다.
2. **구조 가드가 동적 import를 놓친다.** 렌더러 쪽에 `import()`가 셋 있고(`header-name-input.tsx:27`,
   `profile-sidebar.tsx:18`, `motion-provider.tsx:38`) 빌드가 지연 청크 4개를 낸다. 정규식은 정적
   import만 따라가므로 `await import('@/core/writer-lane')` 한 줄로 뚫렸다. entrypoint 하드코딩도
   같은 성질의 약점이었다.

`persistState(_held, …)`가 증표를 받기만 하고 검사하지 않는 것, `createWriterLane`이 공개
팩토리인 것도 사실 그대로였다.

#### 사람 결정

`as proposed` — accept, **권고의 "At minimum" 층위로.** 권고의 1차안("워커 소유 변이 서비스로
시임 교체")은 채택하지 않는다: 그것은 spec D3이 정한 증표 시임의 모양 자체를 바꾸는 일이고
D3는 플랜 게이트 r1·r2 두 라운드를 지나 승인됐다. 실증된 구멍 셋(탈출·무검사·가드 우회)은
아래 둘로 닫히므로 승인된 설계를 뒤집지 않고 같은 결과에 도달한다.

#### 적용 내역

- **증표에 유효 기간을 붙였다.** 작업마다 새 증표를 만들고 그 작업이 정착하는 순간 죽인다.
  증표가 `assertLive`를 스스로 들고 오고 `persistState`·`commitMigration`·`executor.execute`가
  쓰기 전에 부른다. 검사기를 따로 내보내지 않은 이유는 층이다 — 값으로 import하면 화면 번들이
  레인 모듈에 닿아 아래 게이트가 무의미해진다.
- **반환값을 통한 탈출을 컴파일에서 막았다.** `run`의 반환형이 `T extends Held`일 때
  대입 불가능한 타입이 되게 했다. 게이트가 실증한 그 한 줄이 이제 `TS2739`로 떨어지고,
  실제 호출부의 추론은 그대로다(전부 통과 확인).
- **구조 가드를 정규식에서 빌드 산출물로 교체했다.** `scripts/writer-lane-gate.mjs` —
  산출물의 모든 `.html`을 화면 표면으로 잡고 정적·동적 import를 모두 따라가 도달 청크에
  레인 표지가 없는지 본다. 서비스워커 번들에 표지가 **있는지도** 확인해, 표지가 사라진 상태와
  경계가 지켜진 상태를 구분한다(이 대조가 없으면 가드는 늘 통과한다). TypeScript 7의 Node API에는
  파서가 없고 vite의 전이 의존(es-module-lexer·oxc-parser)에 기대면 vite 업그레이드가 조용히
  가드를 무력화하므로, 번들러의 답을 읽는 쪽을 골랐다. 옛 vitest 가드는 삭제했다 —
  같은 성질을 보장하는 기계를 둘 두지 않는다.
- **S3에 런타임 계약을 단언했다**: 붙잡아 둔 증표로는 `persistState`·`commitMigration`이
  거부되고 저장소가 그대로다 / 작업이 도는 동안에는 같은 증표로 쓸 수 있다(검사가 정상 경로를
  막지 않는다). 타입 강제 블록에 탈출 케이스를 더했다.
- **ADR 0016에 결정을 기록했다** — 두 기제가 서로 다른 구멍을 맡는다는 것과, 남는 한계
  (`as unknown as Held` + 스텁 검사기)를 명시했다.

**남는 한계를 숨기지 않는다**: 이중 캐스트로 지어낸 증표는 두 기제 모두 통과한다. 캐스트 둘과
가짜 검사기를 같은 식에 쓰는 것은 우연히 나오지 않는 의도적 행위이고, 화면이 **유효한** 증표를
얻는 경로는 산출물 게이트가 막는다. 이 잔여는 대가로 받아들였다.

변이 확인 (전부 red): 화면에서 `createWriterLane()` 호출 → 산출물 게이트가 새는 청크를 짚어
FAIL / 탈출 한 줄 → `TS2739` / 옛 빌드로 게이트 실행 → 양성 대조가 잡아 FAIL.

#### structure r1 이후 — 자체 적대적 검증 두 라운드 (2026-07-30)

r1의 accept를 적용한 뒤 그 픽스를 스스로 공격했다(렌즈 8개, 주장 22건, 독립 재현 검증).
**두 라운드 모두 실제 결함을 냈고 둘 다 릴리스 r3의 R-2를 되살렸다.** 게이트가 낸 것이 아니라
자체 검증이 낸 것이므로 여기 함께 기록한다 — 사람이 방향을 정했다(2026-07-30).

1. **허가를 콜러에게 넘기던 형태** — 한 획득 안 `Promise.all`로 두 RMW가 겹쳤다. D4가 걷어낸
   실행자 tail 체인이 정확히 그 모양을 막고 있었으므로, D4의 "레인이 같은 성질을 보장한다"는
   주장이 거짓이었다.
2. **허가를 서비스에 가두었다고 믿은 형태** — 허가가 여전히 내보낸 dep 인터페이스의 파라미터라,
   컴포지션 루트가 그 슬롯에 넣는 래퍼가 살아 있는 허가를 쥐었다. 명령 채널은 성공과 새 상태를
   화면에 돌려주는데 저장소에는 옛 값이 남는 데이터 손실.

**사람 결정 (2026-07-30)**: 주입을 걷어낸다 — 쓰기 문의 구현이 저장소 어댑터를 직수입하고,
`runtime/executor.ts`를 흡수하며, 컴포지션 루트는 `StateWriter` 인스턴스를 주입받는다.
리뷰가 처음부터 권한 1차안의 전부다. spec D3·D4와 ADR 0016을 개정했다(원안은 `89be60a`).

이 라운드에서 배운 규칙을 게이트로 고정했다: **허가를 이름 부를 수 있는 파일을 못 박는다.**
허가가 모듈 경계를 넘는 순간 그 자리가 fan-out 자리가 되기 때문이다. dep 시그니처에 허가를
되살리는 변이로 이 검사가 실제로 red가 되는 것을 확인했다.

### structure r2

아티팩트: `docs/reviews/scope-race-hardening/structure-r2.json`
(`ok:true` / `verdict: needs-attention` / findings 2 / `reviewedSha` `f4e7b7e` /
`headMovedDuringReview: false` / `planDriftDuringReview: false` / `ack: human-triage` /
`triageMode: human`)

R-1 accept — R-1 still open: the gate counts files, not Writer Lane instances
R-2 accept — `fullReset` reopens a caller-supplied persistent-write boundary inside the lane

#### 트리아지 전 사실 확인

**R-1은 변이로 직접 반증했다.** 두 모양이 모두 게이트를 **통과**했다:
`platform/state-writer.ts` 안에서 `createWriterLane()`을 두 번 부르기 → PASS,
`createStateWriter(...)`를 두 번 구성하기(= 레인 둘) → PASS. 내 검사가 호출 수가 아니라
`createWriterLane(`을 담은 **파일 수**를 셌고, `createStateWriter` 구성은 아예 세지 않았다.
즉 r1의 "independently mintable"이 그대로 남아 있었다.

**R-2도 사실이다.** `FullResetEffects`가 `readBackupKV`·`removeBackupKeys`·`clearSummary`를
담고 있었고 구현이 레인을 쥔 채 그것들을 펼쳤다 — 호출부가 준 콜백이 레인 작업 안에서 도는,
없애기로 한 바로 그 슬롯이다. 그 셋이 `fullReset` 밖에서 쓰이지 않는다는 것도 확인했다
(`background-bootstrap.ts:325-327`이 전부).

#### 사람 결정

`as proposed` — 둘 다 accept.

#### 적용 내역

**R-1** — 게이트의 첫 검사가 **호출식 수**를 센다(파일 수가 아니다). 심볼 둘을 함께 센다:
`createWriterLane`과 `createStateWriter`, 각각 정확히 1(선언은 제외). 실패 메시지가 파일별
개수를 실어 어디가 둘인지 바로 보인다. 런타임 싱글턴으로 만들지 않은 이유: S3가 시나리오마다
문을 새로 만들어(수백 회) 하드 싱글턴은 테스트를 깨뜨린다 — 이 성질은 게이트가 지킨다.
변이 확인: 위 두 모양이 이제 **둘 다 red**다.

**R-2** — `FullResetEffects`를 폐기하고 공개 인자를 예약 정책 둘로 좁혔다
(`AutoBackupPolicy = Pick<ResetEffects, 'suspendAutoBackup' | 'resumeAutoBackup'>`).
`platform/state-writer.ts`가 `readBackupKV`·`removeBackupKeys`(`./backupStore`)와
`clearSummary`(`./stateStore`)를 직수입해 `ResetEffects`를 내부에서 완성한다. `BackgroundDeps`가
그 셋을 잃었고 entrypoint 배선에서도 빠졌다. 새 층 엔지는 없다(셋 다 `platform/` 같은 디렉터리).
경계가 D8이 이미 그어 둔 선("예약 정책은 레인이 대체하지 않는다")과 겹친다.

**부수 발견**: 이 경계는 타입으로도 강제된다. 공개 인자를 저장소 효과까지 다시 넓히면
구현의 스프레드 순서 때문에 `TS2783`("specified more than once, so this usage will be
overwritten")이 세 줄 난다 — 넓히는 실수가 조용히 통과하지 않는다.

**남는 한계를 적어 둔다**: `suspendAutoBackup`은 진행 중인 자동 Backup을 await하므로 그 백업의
`bk:` 쓰기가 레인 작업 중에 착지할 수 있다. 이것은 fan-out이 아니라 순차 드레인이고, 호출부가
임의의 저장소 조작을 **인자로 건네줄 수는 없게** 됐다 — R-2가 지적한 능력은 사라졌다. 남은
부분(자동 Backup을 레인에 넣기)은 티켓 02 소관이며, 이 변경이 그 자리를
`platform/state-writer.ts` 안으로 미리 옮겨 두어 나중에 공개 인터페이스를 깨지 않게 한다.

**테스트 재배치**: 부트스트랩 테스트의 문 대역이 초기화의 저장소 효과를 넘겨받았다
(`fakeWriter(overrides, storage)` · `failingReset(storage)`). 그 테스트들이 보는 것은 백업
중단·드레인·재예약 순서이므로 대역이 그 저장소 절반을 흉내내는 것이 맞고, 순서 자체는 여전히
진짜 `core/reset`이 돌린다.

#### 게이트 종결 (structure)

WAIVED by user: structure 게이트 라운드 3 재검증을 면제한다. 근거 — (1) r2가 낸 두 건은 새
결함이 아니라 **앞선 픽스의 미완성**이었다: R-1은 r1이 지목한 성질을 게이트가 파일 단위로 세어
놓친 것이고, R-2는 바로 앞 커밋이 스스로 세운 규칙("주입된 dep은 fan-out 자리")을 같은 커밋의
인터페이스가 어긴 것이다. (2) 두 픽스 모두 주장이 아니라 **기제**로 서 있고 각각 변이로 red를
확인했다(같은 파일 레인 둘 · 문 두 번 구성 · 공개 인자 되넓히기 → `TS2783`). (3) 전 게이트가
green이다: 타입 검사 · 단위 398/398 · 빌드 · 스모크 129/129 · writer-lane. (4) 잔여 위험은
Stage 5의 릴리스 게이트가 `main`..HEAD 전체를 보며 다시 읽는다 — 이 슬러그는 브랜치를
분기하지 않았으므로 그 렌즈가 이 시임을 한 번 더 통과한다.

**structure 게이트 통과** (waiver). 티켓 01 종결, 다음 티켓 진행 가능.

### release r1 (codex)

R-1 defer — Spec fidelity: overlapping resets cancel the successful reset's clean snapshot; 회귀가 아니고(테스트 주석이 "같은 계약"이라 이미 적어 둔 선재 동작), 스토리 24와 25가 이 겹침에서 충돌하는데 현재 코드가 24(실패 후 옛 프로필을 다시 스냅샷하지 않는다)를 고르는 것이 안전한 방향이라 순진한 픽스는 방금 지운 백업을 되살린다. 그 충돌을 스펙에서 결정하는 것은 자기 슬라이스와 리뷰를 받아야 할 설계 작업이고, 지금 결과는 데이터 손실이 아니라 깨끗한 스냅샷이 다음 상태 변경까지 미뤄지는 것이다.
R-2 accept — Full reset transport rejection bypasses all failure feedback

#### 사람 결정

`as proposed` (2026-07-30). 두 건의 코드 주장을 트리아지 전에 저장소에서 직접 확인했고 **2/2 사실**이었다.

R-2 적용: `sendCommand`가 왕복 거부를 삼켜 `{ok:false, error}`로 정착시킨다 — 형제 채널
`requestBackupMutation`이 티켓 03에서 먼저 세운 계약이고, 그때 이쪽을 두어 **같은 문 둘이 다른
약속을 하고 있었다.** 픽스를 그 층에 두어 `dispatchWithResult`·`resetEverything`을 포함한 모든
명령 호출부가 함께 덮인다. 테스트는 **두 채널을 한 곳에서** 단언한다 — 한쪽만 보면 비대칭이 다시
벌어져도 green이기 때문이다. 변이(catch 제거)로 명령 채널 두 건만 red, 백업 채널은 green 확인.

R-1 이월: 아래 `#### 이월 (release r1 R-1)`.

#### 이월 (release r1 R-1)

겹친 전체 초기화에서 첫 초기화가 성공해 예약한 깨끗한 스냅샷을, 둘째 초기화의 `suspendBackupWrites`
가 세대를 올리며 무효화한다. 둘째가 실패하면 `resumeBackupWrites({reschedule:false})`가 아무것도
예약하지 않아 스토리 25("끝까지 간 초기화는 **곧바로** 깨끗한 스냅샷")가 그 창에서 성립하지 않는다.

다시 열 때 먼저 결정해야 할 것: **스토리 24와 25 중 무엇이 이 겹침에서 우선하는가.** 24는 실패한
초기화 직후 옛 프로필이 다시 스냅샷되지 않기를 요구하고, 25는 성공한 초기화 직후의 즉시 스냅샷을
요구한다. 둘째가 실패했을 때 상태가 default인지 옛것인지 확정할 수 없는 것이 충돌의 뿌리다.
가능한 방향 둘: (a) 동시 초기화를 합치기(coalescing) — 충돌 자체를 없앤다, (b) "깨끗한 스냅샷
의무"를 단조롭게 들고 다니다 상태가 default임이 확인되는 시점에 이행. 게이트의 권고는 (b)에 가깝고
회귀 테스트(성공 하나 + 겹친 실패 하나 → 타이머 발화 → default 스냅샷 정확히 하나)를 함께 요구했다.

### release r2 (codex)

발견 0건. `ok:true` · **`verdict: approve`** · reviewedSha `39eb897` · headMoved·planDrift false ·
target `branch diff against main` (132 파일) · effort xhigh · triageMode human.

r1의 R-2 픽스가 resolved로 확인됐고, 그 픽스가 만든 새 critical/high는 없다.
트리아지할 행이 없으므로 결정도 없다.

#### 게이트 종결 (release)

**릴리스 게이트 통과 — waiver가 아니라 `approve`다.** 이 슬러그의 세 게이트 중 유일하게
사람 면제 없이 닫혔다.

| 게이트 | 라운드 | 결과 |
|---|---|---|
| plan | r2 | `ok:true` / needs-attention → 통과 **(waiver)** |
| structure | r2 | `ok:true` / needs-attention → 통과 **(waiver)** |
| release | r2 | `ok:true` / **approve** → 통과 |

이 릴리스 게이트는 Stage 0 결정에 따라 `main`..HEAD 전체(131 커밋)를 보았으므로 **사실상
`wide-ui-redesign`의 릴리스 라운드 4를 겸한다.** 그 슬러그가 2026-07-28에 정지된 사유였던
critical 셋은 이 슬러그의 티켓 01·02·03·05가 닫았고, 라운드 4에 해당하는 이 검토가 approve로
끝났다.
