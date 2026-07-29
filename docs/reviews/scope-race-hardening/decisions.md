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
