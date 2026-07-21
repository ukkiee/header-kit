# 02 — ProfileSection 액션 행 재설계

Status: ready-for-agent
Blocked by: 01

## Parent

`.scratch/popup-ui-fixes/spec.md`

## What to build

액션 행(8요소)이 420px에 맞도록: 라벨 축약 + 접힘 허용 + 아이콘 클러스터. nowrap(01)과 결합해 절대 붕괴하지 않고 폭에 따라 접힌다.

- `src/features/profiles/profile-section.tsx` 액션 행(`flex items-center gap-1`):
  - 컨테이너에 `flex-wrap` 추가 → 좁으면 2줄로 접힘.
  - `+ 요청 헤더`→`+ 요청`, `+ 응답 헤더`→`+ 응답` 라벨 축약(문맥상 "헤더" 중복). 카탈로그 키 조정(en/ko 정합).
  - 이동/복제/삭제(▲▼⧉✕)를 `shrink-0` 아이콘 클러스터(`flex items-center gap-1 shrink-0`)로 묶어 우측 유지, `flex-1` spacer는 wrap 시 자연 처리.
- 대안(비채택): 요청/응답/쿠키/csp/redirect를 단일 `+ 추가 ▾` 메뉴로 — 원클릭 접근성 손실.

## Acceptance criteria

- [ ] `ui-diag.mjs` 렌더(420px+ko): 액션 행이 붕괴/클리핑 없이 폭에 맞게 접힘, 모든 액션 접근 가능 — 스크린샷 증거
- [ ] add-request/response/more/filter, move/duplicate/delete 조작 동작 불변
- [ ] `bun run check`·`test`·`build`·`smoke`(48, 프로필 조작 경로)·`storybook:build` green

## Blocked by

01 (nowrap 프리미티브).

## Comments
