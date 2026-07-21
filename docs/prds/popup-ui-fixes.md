---
feature: popup-ui-fixes
invariant-class: feature
entry-track: feature
review-track: light
pipeline-stage: landed
prd-published: true
---

# PRD — 팝업 UI 레이아웃 수정

## Problem

팝업(`min-width: 420px`)에서 한국어 라벨 + 이전 디자인 테마 변경이 겹쳐 레이아웃이 깨진다. 420px + 한국어 + 실데이터 렌더 진단(`scripts/ui-diag.mjs`, 수정 5종·필터 4종·프로필 2개)으로 범위를 확정:

- **[치명적] ProfileSection 액션 행 붕괴** — `+ 요청 헤더`·`+ 응답 헤더` 버튼이 세로 한 글자씩 무너짐("요청헤더" 세로). 원인: (1) `Button` 기본 클래스에 `whitespace-nowrap` 부재로 압축 시 텍스트 줄바꿈, 한국어는 띄어쓰기가 줄바꿈점, (2) 액션 행 = `flex gap-1`(nowrap)에 8요소(요청/응답 버튼 + 더보기/필터 셀렉트 + spacer + ▲▼⧉✕)가 388px 유효폭에 안 맞아 flex가 텍스트 버튼을 콘텐츠 폭 아래로 압축. 두 프로필 카드 모두 발생.
- **[i18n] compile 경고가 ko에서도 영어** — background의 `summarizeCompile`가 만든 경고 라벨(`WarningView.label`, 예: "Placeholder not materialized")이 카탈로그를 거치지 않아 한국어 UI에 영어로 노출.
- **[감사 통과] 나머지 UI는 420px에서 견고** — 수정 행(요청/응답/쿠키/CSP/리다이렉트), 필터(URL/종류/탭도메인/시간), 종류 칩(자동 줄바꿈), 백업·환경설정 패널, 태그·입력 truncate 전부 정상. 이전 DS 리팩터 덕. → 리터치 안 함.

## Solution

렌더로 좁혀진 범위에 집중한 4 슬라이스(트레이서, 각 build+test+smoke+렌더 green):

- **S1 — nowrap 프리미티브 하드닝** (기반/skeleton): `Button`·`Chip`·`Select`·`KindLabel` 기본에 `whitespace-nowrap`. 라벨 버튼(Button)은 `shrink-0`도 추가해 콘텐츠 폭 아래 압축 금지. 세로 붕괴를 전역·근본 차단.
- **S2 — 액션 행 재설계** (핵심): 8요소가 420px에 맞도록 (a) 라벨 축약(`요청 헤더`→`요청`, `응답 헤더`→`응답` — 문맥상 "헤더" 중복) + (b) 행에 `flex-wrap`을 주어 좁으면 2줄로 접힘 + (c) 이동/복제/삭제 아이콘을 `shrink-0` 클러스터로 유지. nowrap(S1)과 결합해 절대 붕괴하지 않고 폭에 따라 접힘. (대안: 요청/응답/쿠키/csp/redirect를 단일 `+ 추가 ▾` 메뉴로 통합 — 원클릭 접근성을 잃으므로 비채택, 아래 결정 참조.)
- **S3 — compile 경고 i18n**: 경고를 코드→MessageKey로 지역화. background는 로케일을 모르므로 `WarningView`에 라벨 문자열 대신 **경고 code + 보간 인자**를 실어 보내고, UI(`StatusSummary`)가 활성 로케일로 라벨링. en/ko MessageKey 추가(tsc가 parity 강제).
- **S4 — 밀도 폴리시**: flex 자식 입력에 `min-w-0` 방어 추가(값 입력이 콘텐츠 폭 아래로 못 줄어드는 잠재 오버플로 예방), 감사 잔여 최종 렌더 확인.

## User Stories

- 한국어 사용자로서, 프로필 카드의 `+ 요청`/`+ 응답` 등 액션 버튼 라벨이 세로로 무너지지 않고 읽혀야 한다.
- 좁은 팝업(420px)에서 액션 행 전체(추가·필터·이동·복제·삭제)가 잘리지 않고 접근 가능해야 한다(필요 시 줄바꿈).
- 한국어 로케일에서 상태 요약의 경고 메시지가 한국어로 표시되어야 한다.

## Implementation Decisions

- **프리미티브 nowrap은 기본에 넣는다** — recipe 소비자(호출부)가 잊어도 안전하도록. 칩·라벨·셀렉트도 동일(짧은 텍스트라도 압축 시 붕괴 가능).
- **액션 행은 재설계가 아닌 "접힘 허용 + 라벨 축약"** — 원클릭 접근성(요청/응답이 가장 흔한 액션)을 유지하면서 붕괴만 제거. `+ 추가 ▾` 전면 통합은 클릭 수 증가로 비채택.
- **경고 라벨링을 background→UI로 이동** — 로케일을 아는 쪽(UI)이 라벨을 만든다. `summarizeCompile`는 code/인자만, `StatusSummary`가 `t()`로 라벨. 이러면 로케일 전환 시 경고도 따라감.
- 라벨 축약은 en/ko 양쪽(`요청`/`Req…` 정합) — 기존 `requestHeader`/`responseHeader` 키를 액션 버튼용 짧은 키로 분리하거나 기존 short 키 재사용 검토.

## Testing Decisions (seams)

- **프리미티브**: cva 클래스 출력에 `whitespace-nowrap` 포함 확인 + Storybook 시각.
- **액션 행 붕괴 해소**: `scripts/ui-diag.mjs` 재렌더(420px+ko)로 세로 붕괴 소멸 + 행이 폭에 맞게 접힘 스크린샷 증거.
- **i18n**: en/ko 키 parity(tsc `Record<MessageKey,string>` 강제) + `i18n.test`; 경고 code→라벨 매핑 단위 테스트.
- **회귀 안전망**: `smoke`(48) — 액션 행 변경이 add-modification/add-filter/move/duplicate/delete 조작 경로를 깨지 않는지(smoke의 프로필 UI 조작 + 실 규칙 경로).

## Out of scope

- 팝업 폭 확대(420px 유지). 탭 앱(wide surface) 변경 없음. 렌더 감사에서 OK 판정난 수정 행·필터·패널·칩 리터치 안 함. 새 수정/필터 종류 추가 없음.

## Questions

- 라벨 축약 시 `요청`/`응답`만으로 충분한지(아이콘 병기 불필요?) — S2 구현 중 렌더로 확정.
