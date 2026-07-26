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
