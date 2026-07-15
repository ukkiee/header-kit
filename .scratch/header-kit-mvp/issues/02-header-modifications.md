# 02 — 헤더 Modification 완성

Status: done
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

## Comments

**2026-07-15 구현 완료.** 테스트 124/124, 실브라우저 스모크 36/36 (K1 Response Header 실응답 적용, K2 send-empty vs remove 대조, K3 append 누적).

스키마를 HeaderModificationBase + request-header/response-header variant로 확장(mode·emptyMeans·comment), 기존 저장/export 데이터는 backfill로 보존(SSOT). compile이 target별 request/responseHeaders 분기, 빈 값 remove vs 빈 문자열, 요청 append 허용목록(21종) 밖은 set 폴백+경고. **이슈 04에서 이연한 Append 누적 골든 테스트를 여기서 종료**. DevTools 패널 한계는 UI 도움말로 문구화(검증 항목 ③).

2축 코드리뷰 반영:
- rename으로 요청 append가 허용목록 밖으로 벗어나면 stale append mode가 숨겨진 채 남던 UX 흠집 → 이름 변경 시 mode를 override로 자동 복원.
- header-overlap 가드를 문자열 suffix 트릭에서 명시적 빈 이름 체크로, resolveHeaderInfo 데이터 클럼프(header·isRequest 중복 인자) 정리.
- AC 26 스토리 확장: Response·Append 노출/숨김·빈값 토글 스토리 추가.

기록: backfill로 구버전 빈 값 Modification은 emptyMeans=remove가 되어 이전 "빈 값 전송" 동작이 "제거"로 바뀜(의도된 기본값). 두-규칙 append 런타임 누적은 골든(컴파일)+K3(단일 append 실측)으로 커버, DNR 문서상 누적 보장.
