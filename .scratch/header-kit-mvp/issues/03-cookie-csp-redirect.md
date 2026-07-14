# 03 — 쿠키·CSP·Redirect Modification

Status: ready-for-agent
Blocked by: 02

## Parent

`.scratch/header-kit-mvp/spec.md`

## What to build

헤더 계열 위에 나머지 세 Modification 종류를 얹는다. 전부 헤더 레벨 연산이다(ADR-0001).

- Request Cookie Modification: 쿠키 추가(Append), Cookie 헤더 전체 교체, 제거.
- Set-Cookie Modification: 새 Set-Cookie 추가, 통짜 교체, 차단. 속성 보존 부분 수정이 제공되지 않는 이유(ADR-0001)를 도움말에 명시한다.
- CSP Modification: 디렉티브 단위 편집 UI로 합성해 응답의 CSP 헤더를 set 한다.
- Redirect Modification: regex 매칭 + 캡처 그룹 치환(`\1`~`\9` 문법)으로 URL을 재작성한다. regex는 저장 전에 플랫폼 API로 사전 검증한다.

## Acceptance criteria

- [ ] 쿠키 추가·Cookie 헤더 교체·제거가 실브라우저에서 확인된다
- [ ] Set-Cookie 추가·교체·차단이 실브라우저에서 확인되고, 부분 수정 미제공 사유가 도움말에 노출된다
- [ ] CSP 편집기에서 디렉티브를 조합하면 단일 CSP 헤더 값으로 컴파일된다 (골든 테스트)
- [ ] Redirect가 캡처 그룹 치환과 함께 동작한다 — 운영 URL을 로컬 서버로 돌리는 시나리오의 실브라우저 데모
- [ ] 유효하지 않은 regex는 저장 시점에 항목 단위 오류로 거부된다
- [ ] 네 종류 모두 컴파일러 골든 테스트와 Storybook 스토리가 있다

## Blocked by

- 02-header-modifications.md
