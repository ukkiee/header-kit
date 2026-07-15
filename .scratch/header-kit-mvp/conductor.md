# Conductor log — header-kit-mvp

Feature: 프로필 기반 HTTP 헤더 수정 Chrome 확장 프로그램 — 레퍼런스 제품의 전체 기능 표면 커버 (header-kit)
Branch: `feature/header-kit-mvp` (base: `main`)
Tracker: local markdown — `.scratch/header-kit-mvp/`

## Progress

- stage 0 (preflight): done — 빈 리포라 `## Agent skills` 없음 → `/setup-matt-pocock-skills` 실행. AGENTS.md(SSOT) + CLAUDE.md(@import) + docs/agents/{issue-tracker,triage-labels,domain}.md 생성 후 `main`에 초기 커밋(base 확보), `feature/header-kit-mvp` 브랜치 생성. `.scratch/`는 트래커 본체라 gitignore 하지 않음.
- stage 1 (align): done — 리서치(기능 25개군 × MV3 실현가능성, 원본은 세션 스크래치패드) 후 그릴링 12문항 완료. 확정: 확장 단독 스코프·전기능 무료, 쿠키는 헤더 레벨만(ADR-0001), session rules 단일 경로(ADR-0002), 자체 스키마만(ADR-0003), Compile 시점 placeholder, Chromium 전용, 팝업+탭 앱, WXT+React+TS+Tailwind+Vitest+Bun+Storybook+BaseUI+CVA+Motion, 표시명 HeaderKit, 영어+한국어 i18n, 텔레메트리 제로+MIT. CONTEXT.md 용어 8개 확정.
- rename: done — 슬러그/브랜치 header-kit-mvp, 새 세션이 컨덕터 인계
- convention: 저장소 문서에는 레퍼런스 제품의 브랜드명을 쓰지 않는다 — 기능 중심으로 서술하고, 비교가 필요하면 "레퍼런스 제품"으로 지칭. 브랜드명·원출처 URL이 포함된 리서치 원본은 저장소 밖(세션 스크래치패드)에 보관.
- stage 2 (prd): done — PRD 발행(.scratch/header-kit-mvp/spec.md, 스토리 42개 + 시임 2개 확정). plan 게이트 r1 4건 accept(Placeholder 실체화, 충돌 의미론, 재조정 큐, Backup 원자성) → r2 1건 accept(실체화 스키마 이원화) → r3 1건 accept(Import 활성화 경계) → r4 approve 0건. 결정 전부 decisions.md에 기록.
- stage 4 issue 01 (walking skeleton): done — compile 시임+FIFO 재조정 큐+어댑터+팝업, 테스트 15/15, 실브라우저 스모크 8/8 (allow 우선순위 확인, session rule 상한 5,000 실측). 2축 코드리뷰 반영(팝업 실조작 스모크, C3/C4 단언, parseStoredState, lost-wakeup 제거). 다음: structure 게이트.
- stage 4 issue 04 (profile lifecycle): done — priority 대역 충돌 의미론(위쪽 승리, allow 슬롯 예약)+겹침 경고, Profile CRUD/복제/이동/메타, Pause, 배지(재조정 큐 직렬화 경로). 테스트 42/42, 스모크 12/12. 리뷰 반영: parse backfill(SSOT 보호), 배지 세대 보증, duplicate-profile 명령화, shortLabel 권위 강제. Append 누적 골든 테스트는 이슈 02로 이연 기록.
- stage 4 issue 05 (native filters): done — Filter union 5종, AND/OR 합성, Exclude→allow 하향 전파, regex 분할·quota 항목 단위 경고, 권위 경로 저장 검증(isRegexSupported). 테스트 53/53, 스모크 18/18. 리뷰 반영: 패턴 입력 blur 커밋(타이핑 불가 버그), connect/other 메서드, CompiledFilters 개명. apply 실패 노출은 이슈 10으로 이연 기록.
- stage 4 issue 06 (tab/time filters): done — 탭 계열 4종(tabIds 전개, kind 간 교집합)+Time Filter(알람+만료 즉시 전이+방어층), 탭 이벤트 6종 구독, 경합 스트레스. 테스트 70/70, 스모크 22/22 (알람 실기기 발화 확인). 리뷰 반영: 만료 술어 단일화, expire→toggleProfile 경유(이슈 07 시임), UNSET_ID fail-open, env 필수화.
- stage 4 issue 07 (placeholder): done — 실체화 수명주기 전체(활성화 경계 실체화, 활성 중 편집 재실체화, 비활성 정리, addProfile 유입 경계, 만료 경로 정리), compile 소비+불변식 방어선, StoredState.materialized. 테스트 87/87, 스모크 26/26. 리뷰 반영: CONTEXT.md Placeholder 정의 드리프트 수정, UI 문구 명시, 재시작 왕복 테스트. 이슈 08에 id 재생성 필수 인계.
- stage 4 issue 08 (import/export): done — envelope v1, 선택 export(템플릿만), 전량 수용/거부 항목 단위 오류, id 전체 재생성+탭 참조 정리(권위 경로에서 재강제), 활성화 경계 실체화, TransferPanel. 테스트 99/99, 스모크 28/28. 리뷰 반영: 권위 경로 정규화 이동(hard), UI 거부 처리, regex 전 항목 수집.
- stage 4 issue 09 (backup/restore): done — 순수 planBackup(manifest-last 3단계, 링 보존, 정상본 보호, too-large), 손상 감지, restore-profiles(교체+활성화 경계), sync 어댑터, 디바운스 자동 백업. 테스트 111/111, 스모크 30/30. 리뷰 반영: quota 바이트 정직화(UTF-8/JSON), 손상 링 좀비 방지, 자동 백업 스로틀·코얼레싱·catch-up. 임계 경로 완주.
- stage 4 issue 10 (tab app + visibility): done — 탭 앱(공유 App surface='tab'), StatusSummary, LargeEditor, apply 실패 채널(이슈 05 이연 종료). 테스트 116/116, 스모크 33/33. 리뷰 반영: 요약을 background 적용 스냅샷에서 발행(UI 독립 재컴파일 불일치 제거), reconciler apply (rules)→(result), AC 24 스토리 추가. 남은 이슈: 02, 11.
- stage 4 issue 02 (header modifications): done — Response Header variant, Override/Append(요청 허용목록+set 폴백), 빈 값 remove/send-empty, comment, backfill(SSOT). 이슈 04 이연 Append 누적 골든 종료. 테스트 124/124, 스모크 36/36. 리뷰 반영: rename 시 stale append 복원, 가드 명료화, 스토리 확장. 남은 이슈: 11.
- structure gate: done — r1 high 3건 accept(ST-1 discriminated union 스키마, ST-2 전이 명령 모듈, ST-3 apply 경합 수렴+에러 격리) → r2 ST2-1 accept(단일 권위 실행자, background 유일 writer) → r3 approve 0건. 최종: 테스트 25/25, 스모크 8/8. 다음 unblocked: 02, 04, 05 (권장: 04 — 임계 경로 01→04→07→08→09).
- stage 3 (slice): done — 수직 슬라이스 11개 발행(.scratch/header-kit-mvp/issues/01~11, ready-for-agent). 사용자 브레이크다운 승인 후 적대적 검증 워크플로(검증 12 에이전트 중 7 완료, 5는 세션 한도로 미검증: 02/04/05/09/11 개별 심층검증 생략 — 전체 커버리지 감사는 완료). 반영: 01에 5,000 규칙 실기기 검증 추가, 06에 04 의존+편집 UI 명시, 08에 06 의존 추가, 11에 시크릿 실적용 확인 추가, 07 전이 의존 정리. 42개 스토리 전량 커버 확인, DAG 순환 없음.
