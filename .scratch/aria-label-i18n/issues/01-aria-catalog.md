# 01 — aria-label 일괄 en/ko 카탈로그 경유

**What to build:** 스크린리더 사용자가 어떤 로케일에서도 일관된 언어로 컨트롤 이름을 듣는다. 현재 앱 전반의 aria-label(신규: 레일 `Show profiles/backups/preferences`, `Select profile X (on/off)`, `Search profiles`, `Profile menu`, `Toggle modification options` + 기존: `Toggle backups`, `Profile name`, `Header value` 등)이 하드코딩 영어다. 전부 en/ko 카탈로그 키로 옮기고, smoke 셀렉터를 동반 갱신한다(현재 셀렉터가 영어 라벨 문자열에 결합 — locale=en 고정이므로 기계적 치환 가능).

**Blocked by:** None — can start immediately. (ui-simplify release r1 R-1 defer에서 발행 — 부분 지역화의 비일관을 피하려 신규+기존을 한 단위로 묶음)

**Status:** done — commit 42fa097

- [x] 모든 aria-label이 en/ko 카탈로그를 경유한다 (aria* 키 45개, tsc parity 강제, 양측 검증)
- [x] ko 로케일에서 접근성 이름이 한국어임을 smoke로 단언 (N14 — 스위치/메뉴/칩/행 토글 4종)
- [x] 기존 smoke 전 항목 green — 66/66. 셀렉터 갱신 대신 **en 값 자구 보존** 전략으로 갱신 자체를 회피(유일 예외: Search profiles에 말줄임 추가 — 부분 문자열 매칭으로 무해)
- [x] 스크린리더 혼합 언어 잔여 없음 (grep 감사 0 — 도메인 용어 'Initiator 도메인'은 가시 라벨과 일관된 의도적 유지)

참고: code-review 2축 반영 — ko 어순(JSON 가져오기), 켬/끔 쌍 통일, 배지 표준 표기, profileSelectLabel 헬퍼 추출. 잔여(범위 밖, 기존): header-row의 'header' 폴백 혼합 표기, LargeEditor 기본 triggerLabel 'Expand'(스토리북 전용 노출).
