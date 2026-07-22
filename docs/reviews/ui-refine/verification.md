# ui-refine — 검증 증거 (Stage 5)

**Verified SHA:** `8da717cdeee6de25e829985c2affcdae8f638f72` (feature/ui-refine, 8개 티켓 전부 done)

## 실행한 명령과 결과 (HEAD에서)

| 게이트 | 명령 | 결과 |
|---|---|---|
| 타입체크 | `bun run check` | 0 errors |
| 단위 테스트 | `bunx vitest run` | 24 files, **202 passed** |
| 빌드 | `bun run build` | 성공 |
| 번들 게이트 | `bun run bundle-gate` | global 502.8KB = 386 + **116.8KB (한도 +120KB) PASS** |
| E2E 스모크 | `node scripts/smoke.mjs` | **78/78 passed** (안정성 반복 포함 다회 green) |
| Storybook | `bun run storybook:build` | 성공 |
| UI 진단 | `node scripts/ui-diag.mjs` | 가로 오버플로 0, 내부 스크롤러 0 |

## 티켓별 커버리지 (스모크 시나리오)

- 01 폼 프리미티브: N5–N7·N15 등 셀렉트/입력/체크박스 상호작용 (Base UI)
- 02 칩·패널: N16 (캡션 호버 비전파·다중 토글·해제)
- 03 아이콘·툴팁: N17a/b (호버 액션·툴팁·환경설정 정리)
- 04 저장 검증·폼 정리: N18a–d (빈 필드 차단·라벨·모드 숨김·키보드)
- 05 조건 배지·빈 상태: N19a/b (배지 줄 높이 불변·CTA)
- 06 드래그 재정렬: N8 (마우스·키보드·Esc 취소·메뉴 이동 제거)
- 07 삭제 Undo: N20a/b (Placeholder 값 보존 원자 복원·미클릭 유지)
- 08 motion·번들: N21 (reduced-motion 무결성) + bundle-gate

## 게이트 이력

- plan gate: r1 needs-attention(3건 accept) → r2 approve
- structure gate: r1 needs-attention(S-1 accept) → r2 approve
- 번들 게이트 R-3: +60KB → +120KB 재설정 (release r0, 사용자 재트리아지 waiver)
