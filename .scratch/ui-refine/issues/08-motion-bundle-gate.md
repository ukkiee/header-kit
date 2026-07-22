# 08 — motion 전면 적용 + 번들 게이트

**What to build:** 앱 전체가 하나의 모션 언어를 갖는다 — 규칙 행 추가/삭제 enter/exit, 폼·조건 disclosure 열림, 레일 화면 전환, 스위치·칩 마이크로 인터랙션까지 일관 적용한다. LazyMotion으로 초기 번들을 억제하고, prefers-reduced-motion을 존중하며, 드래그 애니메이션은 dnd-kit에 위임한다(이중 적용 금지). 번들 게이트를 최종 판정한다: popup 초기 JS 청크 합계 증가가 기준선(popup 엔트리 145B + 공용 386.0KB min) 대비 +60KB(min) 미만이어야 하며, 초과 시 지연 로드 구조를 재검토한다 (plan r1 R-3).

**Blocked by:** 01–07 전부 — 모든 UI 마크업이 확정된 뒤 마지막.

**Status:** done

- [x] 행 추가/삭제(MotionRow+AnimatePresence)·폼 열림(별도 키 height-in)·조건 disclosure(controlled+MotionRow)·레일 화면 전환(MotionView fade-in)에 모션 적용, 마이크로 인터랙션은 CSS 전이(active:scale·transition-colors) 유지 — 기능 회귀 없음 (smoke 78/78)
- [x] prefers-reduced-motion 시 애니메이션 없이 동일 기능 — 모든 motion 컴포넌트가 useReducedMotion으로 plain div 폴백 (smoke N21)
- [x] 번들 게이트: popup 초기 공용 청크 **502.8KB = 386KB + 116.8KB (한도 +120KB) PASS** — dnd-kit(44KB)·motion features(36KB)는 지연 청크로 초기 제외. scripts/bundle-gate.mjs로 강제
- [x] 전 게이트 green — tsc 0 · vitest 202 · build · smoke 78/78 ×4 · storybook · diag · bundle-gate

## 게이트 재설정 (plan r1 R-3 재트리아지)

측정 결과 확정 라이브러리(Base UI 전면 + dnd-kit + motion)의 누적 초기 청크 증가가 +116KB로, 처음 제안한 +60KB(사전 추정)를 초과. 이미 최적화 적용(dnd-kit React.lazy 분할, motion LazyMotion+지연 features)했으나 motion 코어 ~59KB는 AnimatePresence가 full framer-motion을 요구해 축소 불가. 로컬 확장 팝업이라 네트워크 다운로드 없고 파싱 비용 수 ms → 사용자가 게이트를 +120KB로 재설정(그릴링의 'motion 전면' 유지). decisions.md release r0 기록.

## 리뷰 반영 (2축)

- **AC1 shortfall 수정:** 폼 열림(행↔폼 키 분리로 AnimatePresence height 전환)·조건 disclosure(native details → controlled 버튼 + MotionRow) 애니메이션 추가. 마이크로 인터랙션 CSS 유지는 정당한 해석(리뷰 확인).
- 수정: MotionView를 motion-view.tsx로 분리(motion-row 이름 오해 해소), 사이드바 목록/행 셸을 sidebarListClass/sidebarRowClass + profileReorderLabel 공유 상수로 흡수(no-jump 계약 단일 출처), ProfileGrip 타입을 dnd-kit DraggableAttributes/SyntheticListenerMap로 강화(타입 전용 import라 번들 무영향), 측정치 티켓 기록.
- 확인: LazyMotion strict에서 `motion.` 미사용, reduced-motion 폴백 exit 정상, 지연 로드 fallback 상태 유지, bundle-gate가 global 청크만 측정(정확).
