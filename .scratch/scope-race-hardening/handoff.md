# handoff — scope-race-hardening (2026-07-30)

> **이 문서는 지나갔다 (2026-07-30, `db5c4eb`).** 여기 적힌 "다음에 할 일 1 — 티켓 05의
> `/code-review`"는 실행됐고 티켓 05는 **done**이다. 그 리뷰가 이 티켓이 만든 회귀를 잡아
> 픽스까지 커밋됐다(`db5c4eb`). 남은 티켓은 **06과 07**뿐이다.
> 정본 진행 로그는 언제나 `.scratch/scope-race-hardening/conductor.md`이고, 이 문서와
> 어긋나면 **conductor.md가 이긴다**. 아래는 그 세션 시점의 기록으로 남겨 둔다.

## 재개하는 방법

```
/feature
```

**`/code-review`나 `/implement`를 직접 치지 말 것.** 진행 로그를 읽고 게이트 빚을 확인하는 것은
`/feature` 재진입뿐이다. 맨손 `/implement`는 티켓을 닫지 않고 다음 막힌 것 없는 티켓을 고르지도
못한다.

진행 로그(정본): **`.scratch/scope-race-hardening/conductor.md`** — 스테이지·게이트 라운드마다 한
줄씩 append돼 있다. 결정의 영구 기록은 `docs/reviews/scope-race-hardening/decisions.md`.

## 지금 어디인가

`/feature` **Stage 4 (Build)**, 티켓 7개 중 5개 착수 · 4개 완료.

| # | 티켓 | Status | 비고 |
|---|---|---|---|
| 01 | Writer Lane 도입 + 마이그레이션 직렬화 | **done** | `ffff03b` → `f4e7b7e` → `c258e7e` → `167fd14` |
| 02 | `bk:` 쓰기를 레인 안으로 | **done** | `5e29529` |
| 03 | 클라우드 삭제 → SW, 문 하나 | **done** | `00f897c` |
| 04 | 축출 중 읽기 펜스 | **done** | `ff274b2` |
| 05 | Scope Breadth → authority 자리 | **ready-for-agent** | `54eb988` — 구현 완료, **리뷰 미실행** |
| 06 | 겹친 삭제 끝단간 스모크 | ready-for-agent | 막힌 것 없음 |
| 07 | 번들 게이트 초과분 처분 | ready-for-agent | 막힌 것 없음, **Stage 5보다 먼저** |

브랜치 `feat/wide-ui-redesign`, HEAD `54eb988`, 트리 clean.

## 다음에 할 일 — 순서대로

### 1. 티켓 05의 `/code-review` (빚)

구현과 전 게이트는 끝났지만 **`/implement`가 요구하는 per-ticket 리뷰가 안 돌았다** — 두 축
에이전트가 API 529(서버 과부하)로 죽었다. 작업 보존과 트리 clean을 위해 커밋했고, 티켓 Status는
일부러 `ready-for-agent`로 남겼다.

- **고정점: `ff274b2`** (브랜치 베이스가 아니다). `conductor.md`의 `ticket 05 start` 줄과 같다.
- 앞선 네 티켓 중 **셋에서 이 리뷰가 내가 만든 실제 결함을 찾았다.** 돌리기 전에 done으로
  넘기지 말 것.
- 리뷰가 특히 볼 만한 자리로 티켓 저널에 남겨 둔 것: `authoritySpan`의 경계 입력 여덟 개
  (이스케이프된 역슬래시 뒤 슬래시 · 클래스 안의 `://` · 스킴 상대 `//host/path` · 닫히지 않은
  클래스 · 빈 authority · 쿼리/프래그먼트가 경로보다 먼저 · 중첩 브래킷). 크래시하지 않는 것은
  확인했지만 **각 판정이 옳은지는 확인하지 않았다.** 그리고 `prefixBreadth`가 `authoritySpan`과
  같은 일을 다른 규칙으로 하고 있다(하나는 `indexOf('://')`+`split('/')`, 하나는 스캐너).

리뷰 findings를 적용한 뒤 `/feature`가 티켓 05를 done으로 닫는다.

### 2. 티켓 06 → 07

06(겹친 삭제 끝단간 스모크)과 07(번들 게이트 초과분)은 서로 독립이다. **07은 Stage 5보다 반드시
먼저** 끝나야 한다 — 릴리스 게이트가 `main`..HEAD를 보므로 그 초과가 거기서 걸린다.

### 3. Stage 5 (Ship)

열린 티켓이 없어지면: 전 스위트를 HEAD에서 돌려 `docs/reviews/scope-race-hardening/verification.md`에
명령·결과·검증한 SHA를 적고 **먼저 커밋**한 뒤 릴리스 게이트를 띄운다.

## 게이트 상태

| 게이트 | 결과 |
|---|---|
| plan r2 | `ok:true` / needs-attention → **통과 (waiver)** |
| structure r2 | `ok:true` / needs-attention → **통과 (waiver)** — 근거는 `decisions.md`의 `#### 게이트 종결 (structure)` |
| 릴리스 | 아직 안 돌림 (Stage 5) |

**structure 게이트는 종결됐다** — 티켓 06·07에서는 다시 돌리지 않는다.

현재 반복 게이트: 타입 검사 ✓ · 단위 **417/417** ✓ · 빌드 ✓ · 스모크 **130/130** ✓ ·
writer-lane ✓ · **번들 ✗**.

**번들 게이트 실패는 선재 건이다** — `1b7ddd8`에서도 청크별로 바이트 동일하다(popup 즉시 로드
590.2KB = baseline 386KB + 204.2KB, 한도 +190KB). `wide-ui-redesign`이 남긴 팝업 무게 문제이고
티켓 07이 그것을 맡는다. 티켓 01~05은 팝업 즉시 로드 경로에 0바이트를 더한다.

## 코드에서 읽히지 않는 맥락

### 이 슬러그의 기원

`wide-ui-redesign` 릴리스 게이트 r3가 남긴 critical 3건(R-1·R-2·R-3)을 떼어낸 것이다. 그 슬러그는
2026-07-28 사람 결정으로 **정지**됐다 — `wide-ui-redesign`에서 `/feature`를 재진입시키면 승인된
적 없는 릴리스 라운드 4가 뜬다. 브랜치는 분기하지 않았고(세 결함의 코드가 이 브랜치에만 있다),
게이트 베이스가 기본값 `main`이므로 **이 슬러그의 릴리스 게이트가 사실상 `wide-ui-redesign`의
릴리스 라운드 4를 겸한다.** 사용자가 그 대가를 알고 고른 선택이다.

닫힌 것: R-2(티켓 01) · R-3 서비스워커 절반(02) · R-3 나머지(03) · R-1(05, 리뷰 대기).
플랜 게이트가 새로 찾은 축출 창은 04.

### 세 번 반복된 실패 — 다음 세션이 가장 먼저 알아야 할 것

티켓 01에서 "이제 닫혔다"고 적은 문장이 **세 번 거짓**이었다.

| # | 주장 | 실제 | 잡은 주체 |
|---|---|---|---|
| 1 | 레인 밖에서 쓸 방법 없음 | `run(async h => h)` 한 줄로 증표 탈출 | structure r1 |
| 2 | 허가는 이 모듈 안에만 | 허가가 내보낸 dep 파라미터였다 | 자체 적대적 검증 |
| 3 | 지켜야 할 자리가 이 파일 하나 | 게이트가 파일을 셌고 `fullReset`이 콜백을 받았다 | structure r2 |

그래서 이 슬러그의 규율은 **주장하지 말고 변이로 red를 보이는 것**이다. 각 티켓 저널에 어떤
변이가 어떤 테스트를 red로 만들었는지 표로 적혀 있다. 새 기제를 넣으면 같은 표를 채울 것.

두 번째가 남긴 규칙이 설계를 정했다: **레인 작업 안에서 불리는 주입된 dep은 그 자체로 fan-out
자리다.** 능력은 허가라는 물건이 아니라 "작업 안에서 불린다"는 사실이므로, 허가를 시그니처에서
빼도 슬롯이 남으면 닫히지 않는다. 그래서 `platform/state-writer.ts`가 저장소 어댑터를 **직수입**한다.

### 현재 아키텍처 한 눈에

```
core/writer-lane.ts        레인 + WritePermit (유일한 발급처, 작업마다 새로 발급·정착 시 소멸·동결)
core/state-writer.ts       StateWriter 계약 + BackupMutation 유니온
platform/state-writer.ts   문의 구현 — 어댑터 직수입, 허가가 이 파일 밖으로 나가는 시그니처 0개
                           (레인 생성 지점이 여기 하나뿐)
platform/stateStore.ts     persistState / commitMigration — 허가 요구
platform/backupStore.ts    bk: 변이 전부 허가 요구 + 축출 중 읽기 펜스
runtime/background-bootstrap.ts  deps.stateWriter만 부른다 (허가 미등장)
scripts/writer-lane-gate.mjs     3층 구조 게이트
```

`runtime/executor.ts`는 티켓 01에서 문 안으로 흡수·삭제됐다.

### 게이트 스크립트가 지키는 것 (`bun run writer-lane-gate`)

1. `createWriterLane`·`createStateWriter` **호출식 수**가 각각 1 (파일 수가 아니다 — r2가 그것을 잡았다)
2. `WritePermit`을 이름 부를 수 있는 파일이 허용 목록 안 (경계를 넘으면 fan-out 자리가 된다)
3. 서비스워커에서 도달하는 파일 **밖에** 레인 표지가 없다 (빌드 산출물 — 표면 열거는 content
   script에 뚫렸다). 워커 쪽에 표지가 **있는지도** 본다: 그 양성 대조가 없으면 게이트는 늘 통과한다.

### S3 시임 (`src/runtime/service-worker.integration.test.ts`)

`bootstrap` + 진짜 저장소 어댑터 + 제어형 fake + **인터리빙 소진 스케줄러**. 스펙이 정한 유일한
새 시임이고, 옛 경합 테스트들이 여기로 이동했다(행 단위 대응은 각 티켓 저널). 하네스 함정 둘을
겪었으니 새 시나리오를 쓸 때 조심할 것:

- **`start`에서 `fireBackupTimers()`를 부르면 목록이 비어 있다** — 부트스트랩의 초기 예약은
  마이그레이션 커밋이 정착한 뒤에 걸린다. `harness.stateChanged()`로 먼저 하나 걸어야 한다.
  (이 함정에 두 번 빠졌다.)
- **초기화는 `syncBackup`을 기본값(true)으로 되돌린다** — 그 뒤 스냅샷은 local이 아니라 **sync**로
  간다. `harness.local`만 단언하면 조용히 통과한다.

## 이월된 항목

- `StoredState`에 리비전 카운터를 넣는 일반 CAS (followups T14-1) — 스키마 범프를 부른다.
- Scope Breadth의 앵커 요구(엄격안) — 플랜 게이트 r1 R-4에서 사람이 reject. 다시 열려면 ADR
  0008의 `contains` 폼 기본값을 함께 재검토해야 한다. 근거는 스펙 D1과 `decisions.md`의 `### plan r1`.
- `onBackupMutation`이 `onCommand`의 봉투를 재현한다(T15-R-2) · `stateStore.ts`의 Divergent
  Change(T15-R-6) — 둘 다 이월.
- `as unknown as WritePermit` + 지어낸 검사기 — ADR 0016이 대가로 수용한 잔여.
- `suspendAutoBackup`의 드레인 await로 자동 Backup의 `bk:` 쓰기가 레인 작업 중 착지 가능 — D8의
  예약 정책 경계이고 티켓 02가 그 자리를 `platform/state-writer.ts` 안으로 옮겨 두었다.
