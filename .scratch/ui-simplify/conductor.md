# conductor — ui-simplify

목표: 현재 팝업/탭 UI가 복잡하게 느껴짐 → 레퍼런스 API 클라이언트 스타일(다크, 언더라인 탭, 테이블형 행, 보더 최소화)을 참고해 단순화. 레퍼런스 원본 이미지는 저장소 밖(브랜드 중립 원칙).

- preflight: done — branch feature/ui-simplify, tracker=.scratch(tracked), tree clean
- align: done — 범위 C(팝업 구조 개편+탭 앱 셸), 시스템 다크+라이트, 행 선택 시 확장, 칩 스위처+단일 뷰, 탭 앱 셸 제안대로. ADR 0004 기록
- spec: done — .scratch/ui-simplify/spec.md 발행 (ready-for-agent), seam 확인(기존 4, 신규 0)
- plan gate r1: done — needs-attention 3건(선택 재조정/인수 매트릭스/칩 overflow) 전부 accept·스펙 반영
- plan gate r2: done — R2-1 accept(매트릭스 story 18-22·25·28 보강), 재리뷰 WAIVED by user → 게이트 통과
- tickets: done — 9 슬라이스 발행 (01 골격 → 02 테마 → 03·04·05 체인 ∥ 06·07, 08←04, 09 마감), 전부 ready-for-agent
- implement 01: done — 8d2b2f5, smoke 53/53 (N1-N4 신규), vitest 168, code-review 2축 반영
- structure gate: done — r1 S-1(선택 커밋 경계) accept·반영, r2 approve. 티켓 02 프런티어 개방
- implement 02: done — 1165783, 다크+라이트 시스템 연동, 액센트 blue 단일 확인, storybook 테마 툴바
- implement 03: done — 088560c, 언더라인 탭+뱃지, 활성 탭 앱 레이어, smoke 55/55
- implement 04: done — 4b4e815, 테이블형 행+단일 확장, smoke 56/56. 프런티어: 05·06·07·08
- implement 05: done — 584873e, CSP·리다이렉트 테이블 행, ModRowShell 공유, smoke 58/58. 잔여: smoke 구형 폴러 5종 pollUntil 전환(09에서)
- implement 06: done — e38be3c, ⋯ 메뉴+헤더 정돈, smoke 59/59. 프런티어: 07·08
- implement 07: done — ebc4cb9, 상태 요약 슬림 라인+Card 축약, smoke 59/59. 주의: smoke 섹션 I(602행) 플레이크 빈발 — 09에서 폴러 정리 시 원인 조사 후보
