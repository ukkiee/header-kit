# Design — arch-restructure

프로필 기반 HTTP 헤더 수정 확장(header-kit)의 아키텍처 전면 개편 설계.
두 목표: **(1) cva 적극 도입** — 인라인 Tailwind 중복을 cva 기반 디자인 시스템으로 흡수, **(2) 디렉토리 구조 전면 개편** — `src/` 루트 6레이어 단방향 아키텍처.

- Slug: `arch-restructure`
- Base branch: `feature/header-kit-mvp` (main 대비 38커밋, 미머지)
- Kind: behavior-preserving 구조 재편 + 마지막 슬라이스만 behavior-adjacent(이연)
- Status: 설계 확정, 게이트 대기

## 현재 상태 (스캔 결과)

- 디렉토리는 완전 플랫: `core/`(순수 도메인, 14 모듈), `storage/`(어댑터 3), `components/`(12 컴포넌트 + stories), `entrypoints/`(background/app/popup).
- `cva`(^0.7.1)는 이미 의존성에 있으나 **`components/Button.tsx` 단 한 곳**에서만 사용. 나머지 컴포넌트 className은 약 128회 인라인 Tailwind 중복.
- 구조적 냄새 3건:
  - 공유 `App.tsx` + `style.css`가 `entrypoints/popup/` 안에 살고, `entrypoints/app/main.tsx`가 `../popup/App`로 **교차 import**.
  - `core/executor.ts`·`reconciler.ts`는 도메인이 아니라 **동시성 정책**(주입 deps를 받는 FIFO/세대 코얼레싱). core의 순수성을 흐림.
  - `components/AppLayout.stories.tsx`는 동명 컴포넌트 없는 **고아 스토리**(meta.title은 이미 `App/TabLayout`).
- core/storage DAG는 이미 무순환·단방향(storage→core만). 이 부분은 이동만.

## 확정된 결정 (사용자 승인)

| 결정 | 선택 | 근거 |
|---|---|---|
| `src/` 루트 도입 | **예** | 사용자 지시 "디렉토리 전면 개편". `srcDir:'src'`로 WXT가 `@/`를 `src/`로 자동 재생성 |
| feature-first 도메인 폴더 | **예** | 도메인 변경이 한 폴더에 모임. 단 DS(`ui/`)는 flat 타입 버킷 유지 |
| `runtime/` 분리 | **예** | executor·reconciler는 동시성 정책 — core에서 분리하면 core가 "순수 도출"로 증명됨 |
| `storage/` → `platform/` 리네임 | **예** | 어댑터 경계를 정직하게 명명. state.ts→stateStore.ts |
| FilterRow 내부 분해 + i18n 수리 | **이연(슬라이스 8)** | behavior-adjacent — 순수 구조 패스와 분리해 리뷰·롤백 용이 |
| Codex 설계 게이트 | **실행** | 공유 모듈·다수 호출부 변경이라 티켓 전 적대적 리뷰 1회 |

## 목표 구조

```
src/
├── core/        # 순수 도메인 (그대로 이동; intra-core는 전부 ./relative → 무손상)
│   └── rules schema placeholder expiry transfer backup commands compile badge summary autocomplete i18n (+ *.test.ts)
├── runtime/     # 동시성/오케스트레이션 (core에서 lift)
│   └── executor(.test) reconciler(.test)
├── platform/    # 브라우저 API 어댑터 (구 storage/)
│   └── stateStore(구 state) tabs backupStore
├── ui/          # ★ 디자인 시스템(deep) + 교차 컨텍스트
│   ├── tokens.ts index.ts(barrel)
│   ├── Button Input Select Chip Checkbox ToggleSwitch   # form controls
│   ├── Alert Pill KindLabel NoteText                     # display
│   ├── Card CollapsiblePanel LargeEditor                 # containers/editor
│   ├── i18n-context.tsx                                  # LocaleProvider/useT
│   └── i18n-coverage.test.ts                             # 재귀 스캔으로 재작성
├── features/    # 도메인 조합 (feature-first)
│   ├── profiles/       ProfileSection(+stories)
│   ├── modifications/  HeaderRow HeaderNameInput CspRow RedirectRow (+stories)
│   ├── filters/        FilterRow(+stories)  # 이번 패스는 통째 이동
│   ├── status/         StatusSummary(+stories)
│   ├── transfer/       TransferPanel(+stories)
│   ├── backup/         BackupPanel(+stories)
│   └── preferences/    PreferencesPanel(+stories)
├── app/         # 공유 셸 (entrypoints 밖으로 hoist)
│   ├── App.tsx  TabLayout.stories.tsx(구 AppLayout.stories)
│   └── styles/global.css (구 popup/style.css)
└── entrypoints/ # popup/app은 얇은 마운트(3줄) + background는 컴포지션 루트
    ├── background.ts   # 212줄 컴포지션 루트 — 엔트리 경계에 정당히 위치(부트스트랩 추출은 슬라이스 9로 이연)
    ├── popup/  index.html main.tsx   # main → @/app/App + @/app/styles/global.css
    └── app/    index.html main.tsx   # main → @/app/App (surface='tab')
```

**의존 방향 (단방향, 하향만):** `core`(순수 도출) → `runtime`(동시성 정책) → `platform`(어댑터 경계) → `ui`(deep DS + 유일한 교차 컨텍스트, features보다 아래) → `features`(deep core+ui 위의 얇은 조합) → `app`(셸) → `entrypoints`(popup/app 마운트 + background 컴포지션 루트). features는 절대 상향 import 안 함.

## cva 디자인 시스템

`ui/tokens.ts`를 **먼저** 추출 — 모든 프리미티브가 여기서 import:
```
fieldSolid      = 'border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900'
fieldFocus      = 'outline-none focus:border-blue-500'
ghostInteractive= 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
accentBg        = 'bg-blue-600'
```

12 프리미티브 (className-recipe = 호출자가 element/ref/layout 유지 / component = 구조까지 흡수):

| 프리미티브 | 종류 | 흡수 대상 | cva 시그니처 요지 |
|---|---|---|---|
| **tokens** | fragments | 위 4개 조각 반복 | fieldSolid/fieldFocus/ghostInteractive/accentBg |
| **Button** | recipe(이전) | 기존 cva 원본 이동 | variant{primary,ghost,danger}×size{sm,md} |
| **Input** | recipe | field 16곳(Csp×2,Filter×4,Header×2,Redirect×2,Prefs,Profile×2,textarea들) | variant{solid,ghost}×size{xs,sm,md}×font{sans,mono}×align — 레이아웃 className append-only |
| **Chip** | component | `HeaderRow.chip`≡`FilterRow.chipClass` **바이트 동일 2개→1개** + 6 호출부 | active{true,false}, aria-pressed 부여 |
| **Alert** | component | severity 배너 8곳(App/Status/Transfer/Backup) | severity{info,warn,danger}×size{xs,sm}, polymorphic as=p/ul |
| **Select** | recipe | 4곳(Filter,Header,Profile×2) | variant{bordered=Input토큰,ghost=Button토큰}×size{sm,md} |
| **Card** | recipe | Profile카드/Status카드/row 컨테이너 3곳 | variant{outlined,filled,row} |
| **CollapsiblePanel** | component | 3패널 section+header+show/hide **구조 9곳** | props{title,actions?,open,onOpenChange,children} controlled |
| **Checkbox** | recipe | 5곳 | offset{none,row}, accent-blue-600 공유 |
| **ToggleSwitch** | Base UI wrapper | ProfileSection 스위치 | checked/onCheckedChange, data-[checked]:bg-blue-600 |
| **Pill** | recipe | Backup corrupt/Prefs 제거가능 태그 | tone{danger,neutral} |
| **KindLabel** | recipe | 대문자 종류 라벨 4곳 | offset{none,filter} |
| **NoteText** | recipe | 힌트 텍스트 7곳 | indent{none,row,inline} |

- **흡수 규모:** 인라인 className ~128 중 카탈로그된 ~70개가 11 프리미티브로 수렴. 나머지 ~58개는 진짜 일회성 flex 레이아웃 유틸(`flex-1`,`pl-6`,`w-32`) — 인라인 유지, 프리미티브화 금지.
- **드리프트 정규화(공짜):** RedirectRow `text-xs`→`text-sm`, StatusSummary `bg-red-100/rounded`→`bg-*-50/rounded-md`, PreferencesPanel 누락 text-size — cva default가 한 값으로 통일.
- **경계 원칙:** 호출부는 레이아웃 유틸만 className으로 **append**(override 아님) → last-wins 의존 없음 → **tailwind-merge 불필요**.

## 빌드 배선 변경 (필수 — 크리티컬)

각 변경은 반드시 해당 파일 이동과 **같은 커밋**에 착지(한 커밋이라도 지연 시 green인 채 조용히 실패). **아래 표는 최종 상태다** — 슬라이스는 증분이므로 파일이 실재하는 시점에만 배선한다. 특히 App/css 배선은 슬라이스 1(잠정: `src/entrypoints/popup/`에 colocated 유지)과 슬라이스 7(확정: `src/app/`으로 hoist)로 나뉜다:

| 파일 | 변경 |
|---|---|
| `wxt.config.ts` | `srcDir: 'src'` 추가 → `.wxt/tsconfig.json` 자동 재생성(`@/~`→src). `.wxt` 직접수정 금지. Tailwind v4 자동스캔이라 content glob 불필요 |
| `vitest.config.ts` | `include: ['src/**/*.test.ts?(x)']` + **`resolve.alias { '@','~' → ./src }` 추가**(vitest는 WXT alias 안 읽음). 이동과 동일 커밋 필수. `environment:'node'` 유지 |
| `src/ui/i18n-coverage.test.ts` | `collectFiles()`를 **재귀로 재작성** + `../features`와 `.`(ui) 둘 다 워크. flat readdir면 도메인 행을 못 훑어 **vacuous pass** → 가드 소멸. 재작성 후 심은 하드코딩 문자열에서 여전히 fail하는지 검증 |
| `.storybook/main.ts` | `stories: ['../src/**/*.stories.tsx']` + viteFinal alias `@`,`~`→`../src` |
| `.storybook/preview.ts` | CSS import 재타겟. 슬라이스1(잠정): `../src/entrypoints/popup/style.css` → 슬라이스7(확정): `../src/app/styles/global.css`. 시트의 세 번째 importer |
| `src/entrypoints/popup/main.tsx` | 슬라이스1~6: `./App`·`./style.css` 상대 유지(App·css가 popup에 colocated) → 슬라이스7: `@/app/App`·`@/app/styles/global.css`. index.html의 `./main.tsx`는 항상 상대 유지 |
| `src/entrypoints/app/main.tsx` | 슬라이스1~6: `../popup/App`·`../popup/style.css` 상대 유지 → 슬라이스7: `@/app/App`·`@/app/styles/global.css`(교차 import 냄새 제거) |
| `src/entrypoints/background.ts` | (슬라이스2에서) `@/core/executor`→`@/runtime/executor`, reconciler 동일, `@/storage/*`→`@/platform/*`(state→stateStore). 슬라이스1에서는 `@/core/*`·`@/storage/*`가 폴더명 유지로 그대로 해석됨 |
| `tsconfig.json` | 수정 불필요(`.wxt` include `../**/*`가 src 커버). exclude 유지, verify만 |
| `package.json` | 무변경 — cva 이미 있음. tailwind-merge/clsx 미추가(append-only 경계) |

- `src/ui/index.ts` barrel은 `verbatimModuleSyntax:true`이므로 타입 재export를 반드시 `export type { ... }`로.
- `@/storage/*` importer 전수: background·BackupPanel·ProfileSection·App·해당 stories — **부분 열거 금지, grep으로 전수 치환**.

## 슬라이스 (트레이서 불릿 — 각 슬라이스 build+test+storybook green + 확장 로드)

1. **순수 이동** — `core/ storage/ components/ entrypoints/` → `src/*`(폴더명 유지), `srcDir:'src'` + vitest glob·alias + storybook glob·alias. preview css는 **잠정으로 `../src/entrypoints/popup/style.css`**(아직 hoist 전), popup/app main.tsx는 상대 import 유지, background import 무변경. **로직·스타일 0변경.** 워킹 스켈레톤.
2. **runtime/ 분리 + platform/ 리네임** — executor·reconciler→runtime, storage→platform(state→stateStore). background + 이동 테스트 2 + BackupPanel/App/ProfileSection type import만.
3. **DS 씨앗** — `ui/tokens.ts` + Button 이동 + Chip 신설. `HeaderRow.chip()`·`FilterRow.chipClass()` **삭제**, 두 곳 Chip 채택. 첫 프리미티브 E2E 증명.
4. **Input + Select** — 전 행/패널/HeaderNameInput(내부 Input 소비)/LargeEditor·TransferPanel textarea 채택. Storybook에서 의도된 정규화 diff 확인.
5. **Alert + Card + CollapsiblePanel** — 3패널·StatusSummary·App 셸 배너.
6. **나머지 얇은 프리미티브** — Checkbox·Pill·KindLabel·NoteText·ToggleSwitch. grep으로 카탈로그 문자열이 feature에서 사라졌는지 확인.
7. **feature 폴더 재편** — `features/{profiles,modifications,filters,status,transfer,backup,preferences}`, App+global.css→`src/app`, AppLayout.stories→app/TabLayout.stories, preview css·양 main.tsx를 `@/app/*` 확정값으로 재타겟, 교차 import 제거, i18n-coverage 재귀화.
8. **(이연·behavior-adjacent, 별도 리뷰)** FilterRow 내부 분해(DraftInput→ui, PickerSelect+FilterEditor→features/filters) + 하드코딩 영어 useT 라우팅(en/ko MessageKey 추가).
9. **(이연·behavior-adjacent, 별도 리뷰)** background 컴포지션 루트 추출 — regex 검증·세션규칙 교체·badge/alarm·백업 스케줄·리스너·reconciliation 배선을 `entrypoints` 밖 부트스트랩 모듈(runtime·platform 명시 의존)로 옮기고 `background.ts`는 그 부트스트랩만 호출. runtime/platform/컴포지션 루트 책임 경계 명시. **주의:** 컴포지션 루트가 엔트리 경계에 사는 것 자체는 정당한 패턴 — 이 슬라이스의 목적은 배선 로직의 테스트가능성 확보이지 엔트리 축출이 아님.

## 비목표 (의도적 이연)

- `schema.ts` → model/persist 분리 (map이 식별한 진짜 seam이나 behavior-adjacent)
- `CompileWarning` → `compile/warnings.ts` 추출
- FilterRow 내부 분해·i18n 수리 (슬라이스 8)
- background 컴포지션 루트 부트스트랩 추출 (슬라이스 9 — 이번 behavior-preserving 패스 밖)
- ProfileSection→ProfileEditor 리네임, tabs.ts 집계 로직 core 이관 (cosmetic follow-up)

## 리스크 & 완화 (critique 반영)

| 리스크 | 완화 |
|---|---|
| 형제 상대 import(`./Button`,`./i18n-context`) 전수 미치환 → tsc fail | 슬라이스마다 `from './'`·`from '@/storage/'` grep 전수 치환, moves 표 부분열거 의존 금지 |
| vitest/storybook glob이 이동보다 늦게 착지 → green인 채 테스트 미실행 | 배선을 **동일 커밋**에 착지 (must-fix) |
| i18n-coverage flat 스캔 → vacuous pass로 가드 소멸 | 재귀 재작성 + features/ui/app 워크, 심은 문자열로 fail 검증 |
| barrel 타입 재export가 verbatimModuleSyntax 위반 | `export type` 강제 |
| App hoist가 WXT 엔트리 감지 깨뜨림 | index.html이 엔트리 키 — App은 비예약 co-located 모듈이라 안전(검증됨) |

## 검증

`bun run check`(tsc) · `bun run test`(vitest 151) · `bun run build`(wxt) · `bun run smoke`(48) · `bun run storybook:build` — 각 슬라이스에서 green. 슬라이스 1은 추가로 "0 diff except moves" 성질(로직/스타일 불변)을 증명.
