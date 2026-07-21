# Verification — ui-simplify

검증 시점: HEAD `3c8943890b99fff141b5b58dde0c9cb6883e918b` (tree `a1fc8ca8e03e7a2a81f2b18fde57fccde3972a25`), 브랜치 `feature/ui-simplify`.

## 실행 명령과 결과 (전부 위 HEAD에서 실행)

```
bun run check            # tsc --noEmit → exit 0
bun run test             # vitest → 171 passed (22 files)
bun run build            # wxt build → .output/chrome-mv3
bun run smoke            # Playwright 실브라우저 → 65/65 passed (N13 Export 포함)
bun run storybook:build  # → completed successfully
bun run build && node scripts/ui-diag.mjs
                         # 6샷: 420px+ko 라이트(접힘/패널 펼침) · 900px 탭 앱 라이트 ·
                         # 다크 팝업 · 다크 탭 앱 · 경계(18프로필+최대 길이 en/ko 이름)
                         # exit 0 — overflow=0px, inner-scrollers=0 (요소 수준 스캔)
```

## 슬라이스별 인수 (전 티켓 done, 커밋 참조)

| # | 슬라이스 | commit | 핵심 증거 |
|---|---|---|---|
| 01 | 단일 프로필 뷰+칩 스위처+선택 재조정 | `8d2b2f5` | smoke N1/N1b/N2/N3/N4, selection.test 9케이스, wrap+truncate 렌더 |
| S-1 | (structure r1) 선택 커밋 경계 | `b7e759b` | 전이 시퀀스 테스트 2종, structure r2 approve |
| 02 | 시스템 다크+라이트+액센트 1색 | `1165783` | @custom-variant dark, diag 다크 샷, storybook 테마 툴바 |
| 03 | 언더라인 탭+개수 뱃지 | `088560c` | smoke N5(뱃지·전환·키보드), N6(탭 경유 필터 CRUD) |
| 04 | 테이블형 행+선택 확장 | `4b4e815` | smoke N7(단일 확장·모드·주석), J3 확장 경유, 1줄 행 렌더 |
| 05 | CSP·리다이렉트 테이블 행 | `584873e` | smoke M3b/M4b(UI 편집→실응답·실리다이렉트), ModRowShell |
| 06 | 헤더 정돈+⋯ 메뉴 | `e38be3c` | smoke N8(이동→승자 실반영·키보드 복제), 메뉴 경로 삭제 |
| 07 | 상태 요약 슬림 라인 | `ebc4cb9` | smoke J1(수치 검증), ko 렌더(지역화 경고), Card 축약 |
| 08 | 탭 앱 셸 | `5833f7f` | smoke N9(검색·선택·레일)/N10(표면 동일성), 셸 렌더 |
| 09 | 키보드·경계·매트릭스 마감 | `60c3b0c` | N11/N12/N7b/J1 확장, 경계 스캔 exit-1 가드, 폴러 통일 |

## 인수 매트릭스

스펙의 20행 검증 상태 — 5-에이전트 병렬 검증(18/20) 후 gap 2행(헤더 편집 쓰기 경로 → N12, 활성 프로필 수 단언 → J1 확장)을 마감했고, release r1 R-2로 행 18의 Export 구멍을 N13(실다운로드 캡처→페이로드 검증)으로 마감 — **행동 커버리지 기준 20행 충족**.

단, 다음은 **충족으로 집계하지 않는 명시적 미충족/편차**다:

- **story 28 부분 미충족 (release r1 R-1, defer)**: 신규 aria-label(레일·칩·검색·메뉴·행 토글)이 en/ko 카탈로그를 우회한다 — 가시 라벨은 전부 카탈로그 경유이나 접근성 이름은 하드코딩 영어(앱 전반 관례). 후속 이슈 `.scratch/aria-label-i18n/issues/01-aria-catalog.md`로 신규+기존 일괄 해소 예정. 이 편차가 해소되기 전까지 story 28은 "가시 라벨 한정 충족"이다.
- story 8·11·16은 명명된 매트릭스 행 없이 렌더 감사·storybook·액센트 grep 감사로 커버 (티켓 02·04 기록).
- 상세: `.scratch/ui-simplify/issues/09-a11y-boundary-audit.md` 검증 기록.

## smoke 스위트 변화

merge-base 대비 48 → 65항목 순증(제거 0). 기존 시나리오는 새 UI 경로(칩 전환·탭 경유·확장 경유·메뉴 경유)로 갱신되어 green. 섹션 I의 역대 플레이크는 근본 수정(활성화 경계 경유 시드) — 이후 연속 green.
