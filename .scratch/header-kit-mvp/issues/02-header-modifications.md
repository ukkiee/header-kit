# 02 — 헤더 Modification 완성

Status: ready-for-agent
Blocked by: 01

## Parent

`.scratch/header-kit-mvp/spec.md`

## What to build

Request Header 한 종류뿐인 스켈레톤을 헤더 계열 Modification의 전체 표면으로 확장한다.

- Response Header Modification: 추가·교체·제거.
- Override / Append 적용 방식 선택: 요청 헤더의 Append는 플랫폼 허용 목록(21종)에 있는 헤더에만 UI에 노출해 불가능한 상태가 만들어지지 않게 한다. 응답 헤더는 제약 없음.
- 빈 값의 의미를 명시적으로 선택: 헤더 제거 vs 빈 값 전송.
- Modification comment 필드와 표시.
- 응답 헤더 수정이 DevTools 네트워크 패널에 보이지 않을 수 있다는 한계를 UI 도움말로 문구화한다 (PRD 검증 항목 ③).

## Acceptance criteria

- [ ] 응답 헤더 추가·교체·제거가 실브라우저에서 확인된다 (패널 한계 문구 포함)
- [ ] 허용 목록 밖 요청 헤더에는 Append 옵션이 UI에 나타나지 않는다
- [ ] 빈 값 토글이 "제거"와 "빈 값 전송"을 구분해 동작하고 골든 테스트로 검증된다
- [ ] Override 승리·Append 누적 의미가 컴파일러 골든 테스트로 검증된다
- [ ] 새 행 종류와 옵션 UI에 Storybook 스토리가 있다

## Blocked by

- 01-walking-skeleton.md
