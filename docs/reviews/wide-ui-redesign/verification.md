# wide-ui-redesign — 릴리스 검증 증거

이 문서는 릴리스 게이트가 읽는 커밋된 검증 증거다. 아래 SHA/tree에서 실제로 실행한 명령과
그 결과만 적는다.

Verified-SHA: 28f49503a8793e8355ff5a15aa073a53f631645b
Verified-Tree: 6e43fcf74adb57aaef768cfe51c136e1ba7bf49e
Branch: feat/wide-ui-redesign (base `main`)
Verified-At: 2026-07-27T05:33Z

## 실행한 명령과 결과

전체 스위트 — `.scratch/wide-ui-redesign/loop.md`의 `suite`와 글자 그대로 같다:

```
bun run build && bun run test && bun run smoke
```

| 단계 | 결과 |
|---|---|
| `bun run build` (wxt build) | 성공 |
| `bun run test` (vitest run) | **352 passed / 352**, 32 test files |
| `bun run smoke` (scripts/smoke.mjs) | **123 passed / 123** |
| 종료 코드 | **0** |

타입체크 — `loop.md`의 `typecheck`:

```
bun run check          # tsc --noEmit
```

종료 코드 **0**, 진단 없음.

원본 출력:

- `.scratch/wide-ui-redesign/evidence/release-verification-suite.txt`
- `.scratch/wide-ui-redesign/evidence/release-verification-typecheck.txt`

(두 파일은 gitignore 대상인 `.scratch/`에 있다 — 위 표가 커밋되는 요약본이다.)

## 이 증거가 덮는 범위

- 티켓 **06–10**은 이 루프가 구현·리뷰·클로즈했고, 각각 `ticket.criteria result=pass`와
  적용 후 그린 스위트 기록을 갖는다.
- 티켓 **01–05**는 이 루프가 시작되기 전에 이미 닫혀 있었다(최초 `loop.start`가
  `tickets_open=5`). 이 루프의 저널에 `ticket.start`도 `ticket.criteria`도 없고, `main..HEAD`의
  어떤 커밋도 `Conductor-Ticket: 01`–`05` 트레일러를 달고 있지 않다. 위 스위트 결과는 그 다섯
  티켓의 코드까지 포함한 브랜치 전체에서 나온 것이지만, **기준 감사(criteria audit)는 06–10만
  덮는다.** 01–05의 인수 기준 충족 여부는 이 문서가 주장하지 않는다.

## 스위트가 덮지 않는 것

`bun run smoke`는 확장 프로그램을 실제 Chrome에 로드해 돌리는 것이 아니라 스크립트가 구성한
환경에서 돈다. 실제 브라우저에서의 수동 확인은 이 증거에 포함되지 않는다.
