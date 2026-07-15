# Verification — header-kit-mvp

전체 브랜치를 릴리스하기 전, HEAD에서 검증 스위트 전체를 실행한 결과.
(release 게이트 r1의 RL-1~4 + r2의 RL2-1 반영 후 재검증.)

- **Reviewed SHA**: `999640701a7e32ee53c4df1a0f3dc6ca6981b672`
- **Reviewed tree**: `a1b4c4d8c2c2fcf2a8b5d35926e83e5449ba813b`
- **Date**: 2026-07-15
- **Toolchain**: Bun 1.3.11, Node 24.14.1, WXT 0.20.27, Chromium (Playwright)

## Commands and results

| 명령 | 결과 |
|---|---|
| `bun run check` (tsc --noEmit) | 통과 (에러 0) |
| `bun run test` (Vitest) | **151 passed** (0 failed) |
| `bun run build` (wxt build, chrome-mv3) | 성공 |
| `bun run storybook:build` | 성공 |
| `bun run smoke` (Playwright, 확장 로드 실브라우저) | **48/48 passed** (3회 연속 확인) |

## 실브라우저 스모크 커버리지 (48 checks, A–M)

- **A** 팝업 토글 → storage → session rule → 실요청 헤더 적용/해제
- **B** allow vs modifyHeaders 우선순위 상호작용 (Exclude 설계 전제)
- **C** session rule 상한 5,000 실측 + 전량 교체
- **D** 다중 Profile 충돌 승자 · Pause · 배지
- **E** URL/Exclude(하향 전파)/Method/Resource Type/Initiator Domain Filter, 저장 시 invalid regex 거부
- **F** Tab/Tab Domain Filter(탭 닫힘·도메인 이탈 자동 해제), Time Filter 알람 만료
- **G** Placeholder 실체화 수명주기(활성화 경계·탭 이벤트 불변·재활성 갱신·활성 중 편집)
- **H** Import(id 재생성·탭 참조 정리·활성화 경계) · 불량 거부
- **I** 자동 Backup(manifest-last) · 복원(전체 교체·재실체화)
- **J** 탭 앱 · 상태 요약(규칙 수·경고) · 대형 편집기
- **K** Response Header · send-empty vs remove · Append 누적
- **L** Pause 단축키 등록 · autocomplete 사용자 항목 · 시크릿 미허용 안내
- **M** Request Cookie append/override/remove · Set-Cookie 주입/override/block(사전 존재 값 대조) · CSP 합성 · Redirect 캡처 그룹 치환 · invalid redirect 저장 거부

## release 게이트 r1 반영 (RL-1~4)

- **RL-1** Cookie/Set-Cookie/CSP/Redirect (이슈 03) 전 스택 구현 — 스모크 M(9건, Cookie/Set-Cookie 4종 연산 실기기 대조 포함)으로 실브라우저 검증.
- **RL-2** Exclude allow 규칙을 소유 Profile의 전체 Filter 스코프로 제한 (전역 누출 방지) — compile-tabs 골든 테스트로 고정.
- **RL-3** 백업 skip 판정 전 최신 스냅샷 무결성 검증 + self-healing — backup 회귀 테스트 추가.
- **RL-4** minimum_chrome_version 108 선언 — 빌드된 manifest에서 확인.

## 수동 QA 항목 (headless 자동화 불가)

- **시크릿 창 실적용** (이슈 11 AC L27): MV3 언팩 확장은 CLI로 시크릿 허용을 켤 수 없어 실제 시크릿 트래픽 자동 검증이 불가능하다. 규칙은 시크릿 여부와 무관하게 session rules로 적용되며(시크릿 전용 예외 없음) 미허용 안내는 스모크 L3로 확인됨. 확장 상세 페이지에서 "시크릿 모드에서 허용"을 켠 뒤 시크릿 창에서 활성 Profile의 헤더 수정이 적용되는지 수동 확인 필요.
- **시스템 다크 모드 전환**: 선언적 Tailwind `dark:` 클래스가 `prefers-color-scheme`를 따르므로 OS 다크 모드 토글 시 팝업·탭 앱 색상 반영을 육안 확인.
