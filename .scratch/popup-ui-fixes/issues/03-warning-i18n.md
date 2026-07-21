# 03 — compile 경고 i18n

Status: ready-for-agent
Blocked by: None - can start immediately

## Parent

`.scratch/popup-ui-fixes/spec.md`

## What to build

background의 `summarizeCompile`가 만든 경고 라벨이 영어 고정이라 ko UI에 영어로 노출됨. 로케일을 아는 UI가 라벨을 만들도록 계약을 옮긴다.

- `src/core/summary.ts`: `WarningView`가 완성된 `label`/`detail` 문자열 대신 **경고 code + 보간 인자**를 싣도록 변경(또는 code를 유지하고 label 생성 책임을 UI로 이동). `WARNING_LABELS` 매핑을 UI/카탈로그로 이관.
- `src/core/i18n.ts`: 경고 code별 en/ko MessageKey 추가(tsc parity 강제). 보간이 필요한 경고(header 이름 등)는 인자 치환 방식 결정.
- `src/features/status/status-summary.tsx`: 경고를 `t(warningKey(code), args)`로 렌더.
- background는 로케일 미인지 유지 — 경고는 code/인자만 발행.

## Acceptance criteria

- [ ] ko 로케일에서 경고 Alert가 한국어로 표시(`ui-diag.mjs` 렌더: "Placeholder not materialized" → 한국어)
- [ ] en 로케일 문구는 기존과 동일(회귀 없음)
- [ ] en/ko 경고 키 parity(tsc) + `i18n.test` green; code→라벨 매핑 단위 테스트
- [ ] `bun run check`·`test`·`build`·`smoke` green

## Blocked by

None. 01·02와 독립(core/summary + status 컴포넌트).

## Comments
