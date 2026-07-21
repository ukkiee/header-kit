# Verification — popup-ui-fixes

트랙: light (release 게이트만). 진단·검증 도구: `scripts/ui-diag.mjs` (실 확장 로드 → 420px + ko + 실데이터 렌더 스크린샷).

## 실행 명령 (각 슬라이스 공통)

```
bun run check          # tsc --noEmit → exit 0
bun run test           # vitest → 157 passed (20 files)
bun run build          # wxt build → .output/chrome-mv3
bun run smoke          # Playwright 실브라우저 48/48 (build 선행)
bun run storybook:build
bun run build && node scripts/ui-diag.mjs   # 420px+ko 렌더 스크린샷
```

## 슬라이스별 인수 조건 충족

| 슬라이스 | commit | 증거 |
|---|---|---|
| 01 nowrap 프리미티브 | `20dad48` | Button/Chip/Select/KindLabel 기본에 `whitespace-nowrap`(grep 확인). 렌더: 액션 버튼 세로 붕괴 소멸. tsc0/test157/build/smoke48/storybook |
| 02 액션 행 재설계 | `d636a0b` | 렌더: 액션 행이 420px에서 2줄로 접힘(1줄 요청/응답/더보기, 2줄 필터+우측 아이콘 클러스터), 붕괴·클리핑 없음, 전 액션 접근 가능. 조작 경로 smoke 48/48 |
| 03 경고 i18n | `ebf9e2b` | 렌더(ko): 경고 Alert "Placeholder 미실체화 / 활성 프로필의 …제외했습니다"로 한국어 표시. en 동일. en/ko 키 parity(tsc)·i18n.test green. summary.test 갱신 |
| 04 밀도 폴리시 | `94beaf5` | flex-1 입력에 min-w-0. 렌더(매우 긴 토큰·regex): 어떤 행도 팝업 폭 오버플로/클리핑 없이 입력 내부 truncate |

## 범위 밖 (렌더 감사 결과 정상 → 무변경)

수정 행(요청/응답/쿠키/CSP/리다이렉트)·필터(URL/종류/탭도메인/시간)·종류 칩(자동 줄바꿈)·백업/환경설정 패널·태그 — 420px에서 견고, 리터치 안 함.

## 알려진 잔여 (범위 밖, 후속 후보)

- 프로필 삭제 확인 버튼의 `Delete?`/'Delete?' 및 일부 aria-label이 하드코딩 영어 — 앱 전반 aria 관례상 이번 범위 밖. i18n 후속 여지.
