# Conductor log — header-kit-mvp

Feature: 프로필 기반 HTTP 헤더 수정 Chrome 확장 프로그램 — 레퍼런스 제품의 전체 기능 표면 커버 (header-kit)
Branch: `feature/header-kit-mvp` (base: `main`)
Tracker: local markdown — `.scratch/header-kit-mvp/`

## Progress

- stage 0 (preflight): done — 빈 리포라 `## Agent skills` 없음 → `/setup-matt-pocock-skills` 실행. AGENTS.md(SSOT) + CLAUDE.md(@import) + docs/agents/{issue-tracker,triage-labels,domain}.md 생성 후 `main`에 초기 커밋(base 확보), `feature/header-kit-mvp` 브랜치 생성. `.scratch/`는 트래커 본체라 gitignore 하지 않음.
- stage 1 (align): done — 리서치(기능 25개군 × MV3 실현가능성, 원본은 세션 스크래치패드) 후 그릴링 12문항 완료. 확정: 확장 단독 스코프·전기능 무료, 쿠키는 헤더 레벨만(ADR-0001), session rules 단일 경로(ADR-0002), 자체 스키마만(ADR-0003), Compile 시점 placeholder, Chromium 전용, 팝업+탭 앱, WXT+React+TS+Tailwind+Vitest+Bun+Storybook+BaseUI+CVA+Motion, 표시명 HeaderKit, 영어+한국어 i18n, 텔레메트리 제로+MIT. CONTEXT.md 용어 8개 확정.
- rename: done — 슬러그/브랜치 header-kit-mvp, 새 세션이 컨덕터 인계
- convention: 저장소 문서에는 레퍼런스 제품의 브랜드명을 쓰지 않는다 — 기능 중심으로 서술하고, 비교가 필요하면 "레퍼런스 제품"으로 지칭. 브랜드명·원출처 URL이 포함된 리서치 원본은 저장소 밖(세션 스크래치패드)에 보관.
