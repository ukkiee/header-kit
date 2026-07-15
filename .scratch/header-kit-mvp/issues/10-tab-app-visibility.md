# 10 — 탭 앱과 적용 상태 가시성

Status: done
Blocked by: 04

## Parent

`.scratch/header-kit-mvp/spec.md`

## What to build

같은 SPA의 두 번째 마운트인 탭 앱과, "지금 브라우저에 무엇이 걸려 있는가"의 가시성.

- 탭 앱: 확장 내부 탭 페이지에 동일 SPA를 마운트. 팝업에서 "탭에서 열기" 진입점. 넓은 화면 레이아웃에서 Profile 대량 관리.
- 대형 편집기: 긴 regex·CSP·헤더 값을 위한 확장 편집 다이얼로그.
- 적용 상태 요약: 활성 Profile이 컴파일한 규칙 수, Compile이 반환한 경고 전체(항목 단위), 겹침 경고를 한 화면에서 확인.
- apply 시점 실패 채널: 재조정 큐의 onError(예: OR-join regex가 apply에서 거부되는 드문 경우)를 저장해 요약 뷰에 노출 — 이슈 05에서 이연된 항목 (조용한 실패 금지).

## Acceptance criteria

- [ ] 팝업과 탭 앱이 같은 상태를 보고 실시간으로 동기화된다
- [ ] 대형 편집기에서 편집한 값이 행에 반영된다
- [ ] 요약 화면의 규칙 수·경고가 Compile 반환값과 일치한다 (경고 시나리오 테스트)
- [ ] 탭 앱 레이아웃에 Storybook 스토리가 있다

## Blocked by

- 04-profile-lifecycle.md

## Comments

**2026-07-15 구현 완료.** 테스트 116/116, 실브라우저 스모크 33/33 (J1 요약 규칙 수 일치, J2 겹침 경고 노출, J3 대형 편집기 저장).

탭 앱은 entrypoints/app가 공유 App을 surface='tab'로 마운트(넓은 레이아웃), 팝업 '탭에서 열기'. StatusSummary(규칙 수·활성 Profile·경고·apply 오류), LargeEditor(긴 값 다이얼로그). 이슈 05 이연분(apply 실패 채널) 종료: replaceSessionRules 실패를 삼키지 않고 요약의 applyError로 노출.

2축 코드리뷰 반영:
- **요약 불일치 위험 (핵심, 양쪽 지적)**: UI가 독립적으로 재컴파일하면 background 적용분과 어긋남(다른 tabs 스냅샷·now, apply 실패 시 "N개 적용됨" 거짓 표시). → 요약을 background의 apply가 실제 적용한 그 result·snapshot에서 만들어 storage.session에 발행하고, UI는 읽기만 하도록 변경. reconciler.apply 시그니처를 (rules)→(result)로. apply 실패 시 요약이 "not applied"로 표시.
- **AC 24 (탭 앱 레이아웃 Storybook)**: StatusSummary만 있던 것에 AppLayout(탭 레이아웃)·LargeEditor 스토리 추가.
- LargeEditor 다이얼로그 열림 버그(Base UI Trigger onClick 충돌) → 제어형 open+onOpenChange로 draft 초기화 분리. glossary 회피어(refresh) 명명 정리.

기록: 요약이 background 발행값이므로 팝업/탭 앱 어느 마운트에서도 동일한 적용 상태를 본다.
