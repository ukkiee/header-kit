# 03 — 매니페스트 불변식이 주석에서 검사로 바뀐다

**What to build:** 확장이 필요 이상의 권한을 요구하지 않는다는 것이 매 빌드마다 확인된다. `wxt.config.ts`는 이미 `alarms`·`tabs`를 왜 뺐는지 주석으로 적고 있다 — **테스트가 되기를 기다리는 주석**이고, 이 티켓이 그것을 검사로 만든다.

빌드된 매니페스트를 읽어 넷을 잰다: manifest version이 3인가, 권한 집합이 의도한 그대로인가, 최소 크롬 버전이 **선언된 하한과 정확히 같은가**, 프로덕션 CSP에 `unsafe-eval`이 없는가.

권한은 **정확한 일치**로 잰다. 부분집합으로 재면 권한이 늘어나는 것을 놓치는데 이 게이트의 존재 이유가 정확히 그것이다. 같은 이유로 최소 크롬 버전도 존재 검사가 아니라 정확한 일치다 — "선언돼 있는가"만 재면 하한보다 낮은 값이 통과하고, 그러면 dNR 세션 규칙과 응답 헤더 수정이 없는 브라우저에 설치가 허용된다.

Mozilla `addons-linter`는 쓰지 않는다. Chrome 전용 확장에 Firefox 요구사항 세 건을 오류로 내며, 그 셋을 억제하면 억제 목록 자체가 유지 대상이 된다.

**Blocked by:** 02

**Status:** done

- [x] 매니페스트 게이트가 `needs: build`로 등록되고, 러너가 넘긴 이 회차의 산출물을 읽는다
- [x] 권한 집합을 **정확한 일치**로 잰다. 권한이 하나 늘면 FAIL, 하나 빠져도 FAIL
- [x] 최소 크롬 버전이 선언된 하한과 정확히 같은지 잰다. 하한보다 낮으면 FAIL, 값이 숫자가 아니면 FAIL, 아예 없어도 FAIL, 하한과 같으면 통과 — 네 경우 모두 픽스처가 있다
- [x] manifest version이 3이 아니면 FAIL
- [x] 프로덕션 CSP에 `unsafe-eval`이 있으면 FAIL
- [x] 테스트가 게이트를 자식 프로세스로 띄우고 종료 코드와 상태 줄만 단언한다
- [x] **권한 추가가 FAIL인 것**이 픽스처로 확인된다 — 부분집합 비교였다면 통과했을 자리다
- [x] 게이트가 재는 것과 재지 않는 것의 경계가 표의 임계값 칸에 적혀 있다. 이 게이트는 "권한 집합이 선언과 같다"를 증명하지 "현재 권한 집합이 이 확장에 옳다"를 증명하지 않는다

## Comments

**닫음** — 커밋 86c4735. 수용 기준 8/8. 게이트 9행 전부 PASS(실브라우저 smoke 포함) · 스위트 743.

산출물: `scripts/manifest-gate.mjs`, `scripts/manifest-gate.test.mjs`(31 테스트),
`scripts/gates.txt`·`package.json`·`docs/agents/verification.md` 등록 세 자리.

**문면을 넘어선 자리 하나** — 재는 필드를 열거하는 대신 **최상위 키 집합을 잠갔다.** 적대적
검증이 `content_scripts`·`web_accessible_resources`·`externally_connectable`·
`devtools_page`로 권한 표면을 넓히면서 게이트를 통과하는 것을 실측으로 보였고, WXT가
`src/entrypoints/`에서 매니페스트를 생성하므로 `wxt.config.ts`를 한 글자도 건드리지 않는
경로가 실재한다. 근거·대가·기각한 대안은 `docs/reviews/agent-harness/decisions.md`의
티켓 03 절.

**남긴 위험 둘** (검증 문서의 "덮지 못하는 것"에 적었다):
- 러너의 자리 일치 검사가 `needs` 칸을 대조하지 않는다. 되돌리면 낡은 `.output`을 재면서
  회차 전체가 초록이 난다 — `needs: build`인 네 게이트에 함께 열린 구멍이고, 여기서는
  자기 행만 테스트로 못 박았다. 표 스키마를 고치는 것은 러너 설계(티켓 01·02)에 속한다.
- 이 게이트는 CSP에서 `unsafe-eval` 하나만 잰다. 개발용 CSP(`http://localhost:3001`)가
  프로덕션 산출물에 그대로 있어도 PASS다.
