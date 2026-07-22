# 04 — 저장 검증 + 폼 정리 + 폼 키보드 UX

**What to build:** "저장되면 반드시 동작하는 규칙"만 통과한다 — 빈 필수 필드(헤더/쿠키 이름, CSP 디렉티브, Redirect 패턴·치환)로 Save를 누르면 해당 입력에 인라인 오류가 뜨고 저장되지 않는다(응답 쿠키의 빈 값은 차단 사용례라 유효). 폼도 종류별 의미에 맞게 다듬는다: 요청 쿠키의 이름 라벨은 '쿠키 이름', append 불가 요청 헤더에선 모드 선택이 보이지 않고, URL 필터 placeholder는 매치 방식별 예시로 바뀌며, 종류 라벨은 '응답 쿠키'(행 배지는 SET-COOKIE 유지)가 된다. 폼이 열리면 첫 입력에 포커스가 가고, Esc로 닫고 Cmd/Ctrl+Enter로 저장한다.

**Blocked by:** 01 — 폼 프리미티브 (검증 표시가 Base UI Field 시맨틱에 얹힘).

**Status:** done

- [x] core 순수 함수(missingRequiredFields)가 종류별 누락 필수 필드를 반환 — 헤더/쿠키 이름, CSP 디렉티브 최소 1개, Redirect 패턴·치환; 응답 쿠키는 빈 값 허용 (vitest 5)
- [x] 빈 필수 필드 Save → aria-invalid + 인라인 오류 + 스토리지 불변; Compile의 빈 이름 경고는 import·레거시 방어선으로 유지(compile.ts 미변경) (smoke N18a)
- [x] 쿠키 이름 라벨·모드 미노출·매치 방식별 placeholder·'응답 쿠키' 라벨(배지 SET-COOKIE 유지) 반영 (smoke N18b/c)
- [x] 폼 열림 시 첫 입력 autofocus, Esc 닫기, Cmd/Ctrl+Enter 저장 (smoke N18a/d)
- [x] 전 게이트 green — tsc 0 · vitest 197 · build · smoke 73/73 ×3 · storybook · diag

## 리뷰 반영 (2축)

- **버그 수정(Spec c):** 종류 전환 시 fieldErrors 미초기화 — 차단 Save 후 종류를 바꾸면 새 종류 필드에 스테일 오류가 뜨던 결함. switchKind에서 setFieldErrors([]) 추가, N18b가 스테일 오류 부재를 단언.
- **검증 갭 해소:** 열린 Select 팝업 안 Esc가 팝업만 닫고 폼은 유지함을 N18d가 검증(이중 닫힘 없음).
- 수정: CSP 오류 표시 중복 → 공유 FieldError 프리미티브로 흡수, rule-validation import `./model`→`./schema` 배럴 정렬, `error`→`saveError` 개명(인라인 검증 상태와 모호성 제거).
- 결정 명기(Spec b, 스코프): 쿠키 이름 입력이 HeaderNameInput(헤더 사전 autocomplete)→평문 Input. 쿠키 이름은 HTTP 헤더 사전과 무관해 자동완성이 무의미 — 티켓 #17의 라벨 변경을 넘지만 의도적. 유지.
- acceptable로 둠: autofocus 분산(종류별 첫 필드), 인라인 오류가 다음 Save까지 유지(라이브 피드백 대신 Save 시점 검증 — 폼 원자성 모델과 일관).
