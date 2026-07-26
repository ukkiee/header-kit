# 04 — Block 종류 + 최소 가드레일

**What to build:** 매칭된 요청을 통째로 차단하는 **Block** Modification 종류. 이름·값 없이 URL 스코프와 Condition만 갖고 declarativeNetRequest `block` 액션으로 컴파일된다. 요청을 막는 유일한 파괴적 종류라 최소 안전 계약을 함께 넣는다 — 넓은 스코프 차단은 경고로 막고, 실효 스코프를 항상 보여 주며, 전역 Pause가 탈출구가 된다.

**Blocked by:** 01 (다크 셸·RuleForm), 02 (v2 스키마).

**Status:** done

- [x] Block 종류: 스키마 union·model, compile이 `{ action: { type: 'block' } }`를 냄(조건 조립은 기존 조립기 재사용), 검증은 URL 스코프만 필수(이름·값 없음), 폼은 이름·값을 숨김
- [x] 넓은 스코프 판정 순수 함수: 전역 와일드카드(`*://*/*`·`<all_urls>`)·도메인 앵커 없는 정규식을 '넓음'으로, 도메인 한정을 '좁음'으로
- [x] 넓은 스코프 Block을 저장하려 하면 폼이 경고를 띄우고 명시적 확인을 요구한다
- [x] 규칙 행이 실효 URL 스코프를 항상 표시해 넓은 Block이 목록에서 드러난다
- [x] 전역 Pause가 Block도 함께 멈춘다(모든 종류 공통) — 페이지가 깨졌을 때 즉시 탈출구
- [x] core 테스트: block 액션 compile, 넓은 스코프 판정 표(잘못된/미지원 패턴 거부 포함)
- [x] smoke: 넓은 스코프 Block 저장 시 경고·확인이 뜬다
- [x] 전 게이트 그린. (보호 URL 허용목록·자동 복구는 범위 밖.)
