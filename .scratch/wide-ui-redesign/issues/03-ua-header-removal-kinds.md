# 03 — User-Agent + Header Removal 종류

**What to build:** 두 단순 신규 Modification 종류를 end-to-end로. **User-Agent**는 값 하나만 받아 `User-Agent` 요청 헤더를 바꾼다. **Header Removal**은 헤더 이름만 받아 이름이 같은 헤더를 요청·응답 **양쪽에서** 제거한다. 사용자는 UA 위장 규칙과 이름만으로 헤더를 지우는 규칙을 만들어 실제 트래픽에 적용할 수 있다.

**Blocked by:** 01 (다크 셸·RuleForm), 02 (v2 스키마).

**Status:** done

- [ ] User-Agent 종류: 스키마 union·model 생성기 추가, compile이 `User-Agent` modifyHeaders를 냄, 값 필수 검증, 폼은 값만 노출, 요약 'UA …'·뱃지 UA
- [ ] Header Removal 종류: compile이 한 dNR 규칙에 요청·응답 removeHeaders를 함께 냄, 이름 필수·값 금지 검증, 폼은 이름만 노출, 요약 '삭제 <name>'·뱃지 DEL
- [ ] 두 종류의 필수-필드 포커스가 기존 흐름(첫 누락 입력으로 포커스)에 매핑된다
- [ ] core 테스트: 각 종류의 schema·model, compile 출력(UA 헤더 / remove 양쪽), validation (prior art: compile.test.ts·rule-validation.test.ts)
- [ ] smoke: 폼이 각 종류에 맞는 필드만 보인다(UA=값만, 삭제=이름만)
- [ ] 전 게이트 그린
