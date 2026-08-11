# header-kit

HTTP 요청/응답 헤더를 프로필 기반 규칙으로 수정하는 Chrome 확장 프로그램.

## Agent skills

### Issue tracker

이슈와 스펙(PRD)은 `.scratch/<feature-slug>/` 아래 마크다운 파일로 관리한다. See `docs/agents/issue-tracker.md`.

### Triage labels

기본 5개 역할 라벨(`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`)을 그대로 사용한다. See `docs/agents/triage-labels.md`.

### Domain docs

단일 컨텍스트 — 루트 `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

<!-- core:begin -->

# Harness Core

Target 100 lines

이 구간은 **모든 태스크에 항상 로드된다.** 여기 사는 것은 태스크 종류와 무관하게 적용되거나,
**없으면 틀린 일을 완료로 보고하게 만드는** 것뿐이다. 나머지는 `CONTEXT.md`·`docs/adr/`·게이트가
갖는다 (ADR 0018).

## Precedence

1. 이번 대화에서 사용자가 준 지시.
2. 이 코어.
3. `CONTEXT.md`(도메인 언어)와 `docs/adr/`(결정과 그 이유).
4. 게이트와 그 설정.

**숫자와 목록은 게이트가 소유한다.** 산문이 임계값을 말하는데 게이트가 다른 값을 재면 게이트가
맞다 — 낡은 것은 산문이다. 충돌을 발견하면 한쪽을 조용히 고르지 말고 말한다.

## Task classes

- **조사** — 파일을 바꾸지 않는다. 완료는 답이지 커밋이 아니다.
- **변경** — 코드·설정·문서를 바꾼다. 게이트를 돌린 판정 없이는 완료가 아니다.

`scripts/gates.txt`(레지스트리)·게이트 표·`package.json`·`.github/workflows/gate.yml` 중 하나를
건드리면 나머지도 함께 본다 — 러너가 네 자리 일치를 검사하고, 하나만 고치면 FAIL이다.

## Package manager

`bun`이다. `bun run <script>`로 부르고 락파일은 `bun.lock`이다. npm·yarn·pnpm을 쓰지 않는다.
**설치 뒤에는 `bun run check`를 바로 돌린다** — `node_modules`가 깨진 채 다음 걸음을 딛는 사고가
이 저장소에서 두 번 났고, 두 번 다 설치 시점이 아니라 한참 뒤에 다른 얼굴로 나타났다.

## Layer direction

`core → runtime → platform → ui → features → app → entrypoints`.

**뒤가 앞을 import하고 그 반대는 없다.** 층을 건너뛰어 아래를 부르는 것은 위반이 아니다. `core`는
교차 import가 0인 순수 leaf다. 테스트와 스토리에도 예외가 없다 — 예외를 두면 그 둘이 레이어를
영구히 뚫는다. 강제는 `lint` 게이트가 한다.

## Invariants no gate catches

모르고 고치면 **사용자 데이터가 사라지는데 게이트는 초록일 수 있는** 것들이다.

- **Writer Lane** (ADR 0016) — 영속 저장소를 고치는 단 하나의 줄. 저장소를 고치는 경로는 **전부** 이
  줄을 지나며 한 번에 하나만 진행한다(어느 것들인지는 `CONTEXT.md`가 갖는다 — 여기 세어 두면 곧
  갈라선다). 팝업·탭 화면은 이 줄에 들어올 수 없고 메시지로 요청만 보낸다. 쓰기 허가(`WritePermit`)는
  쓰기 문(`StateWriter`) 구현 안에만 살고 **모듈 경계를 넘지 않는다**.
- **Schema Version / Blocked** — 읽기는 지난 포맷을 받아 올리지만(Migration), 이 버전이 이해 못 하는
  것(더 새 포맷이거나 올릴 수 없는 구 포맷)은 **Blocked**로 판정한다. Blocked인 동안 그 위에
  **아무것도 쓰지 않는다**(로컬 저장도, 자동 Backup도) — 읽을 수 없는 것을 기본 상태로 접어 저장하면
  원본이 사라진다. 그래서 판정 자체가 상태를 돌려주지 않는다.

## Gates

**게이트는 실행 가능한 명령과 결정론적 임계값을 가진 검사다.** 명령이 없으면 게이트가 아니라
리뷰어 체크리스트 항목이다. 판정은 넷 — `PASS` / `FAIL` / `N/A` / `BLOCKED`.

- **돌리지 않은 검사를 `PASS`로 적지 않는다.**
- `N/A`는 "잴 대상이 없다"이지 "커버되지 않는다"가 아니다.
- `BLOCKED`은 선행이 통과하지 못해 판정 자체를 얻지 못한 것이고, `FAIL`이나 `N/A`로 접지 않는다.
- **실패했을 때 고치는 것은 코드다** — 게이트도, 임계값도, 그 설정도 아니다.
- 행의 `kind`가 `advisory`면 그 FAIL은 **완료를 막지 않는다.** 기기에 매인 측정처럼 하드로 걸면
  거짓 실패를 내고, 그것을 고치는 유일한 길이 임계값 완화가 되는 자리에 쓴다. 어느 행이 그런지는 표가 정한다.

표는 `docs/agents/verification.md`가 소유한다. 전부 돌리는 것은 `bun run gate`.

이미 게이트가 있는 규칙은 여기에 **이름만** 둔다. 숫자와 목록은 그 게이트 한 곳에만 산다.

- UI 문자열은 메시지 카탈로그를 지난다 — `test` 게이트.
- 팝업 즉시 로드 예산과 지연 청크 계약 — `bundle-gate`.
- 접근성 진단이 늘지 않는다 — `a11y-gate`.

## Done means

돌린 게이트의 판정이 있고 **hard 행이 전부 통과**일 때 완료다. advisory 행의 FAIL은 막지 않되 보고에
남는다. 막힌 부분이 있으면 **나머지를 끝내고 무엇을 왜 남겼는지 말한다** — 범위를 줄이는 것은 사람이
정한다.

## Reporting

바꾼 것 · 잰 것(명령과 그 판정) · 하지 않은 것과 그 이유. 재지 않은 것을 잰 것처럼 적지 않는다.

## Amending this core

들어올 자격은 위 첫 문단이 정한다. 자격이 없는 것은 `CONTEXT.md`·ADR·게이트 표로 간다.

예산을 넘기면 **올리지 말고 옮긴다.** 순서는:

1. 이미 게이트가 있는 것 — 임계값과 목록을 지우고 게이트 이름만 남긴다.
2. 한 종류의 태스크에만 필요한 것 — ADR이나 게이트 문서로.
3. 그래도 넘치면 그때 예산을 다시 정하고, 왜 늘렸는지를 ADR에 적는다.

<!-- core:end -->
