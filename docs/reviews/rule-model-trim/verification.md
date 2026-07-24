# rule-model-trim — 검증 증거 (Stage 5)

이 파일은 릴리스 게이트가 감사하는 증거다. 아래 실행은 전부 **아래 못박은 SHA에서, 이 문서를
쓰기 직전에 새로** 돌린 것이며, 티켓 세션의 실행을 옮겨 적은 것이 아니다.

## 못박은 지점

| 항목 | 값 |
|---|---|
| Verified SHA | `f02164e8a8936babd46dea6386527d776e1a058b` |
| Verified tree | `6ec17f309041d417e3e8bb95df9a6f0f07fca4ea` |
| 브랜치 / base | `feature/rule-model-trim` / `main` = `9d19d7a` |
| 워킹 트리 | 클린 (`git status --porcelain` 0줄) |
| 실행 기기 | `darwin/arm64 · Apple M5 Pro · 48GB` |
| 도구 | node v24.14.1 · bun 1.3.11 · vitest 4.1.10 |

이 문서 자체의 커밋은 위 SHA **다음**에 온다. 검증 대상은 `f02164e`의 트리이고, 이후 추가되는
것은 이 문서와 게이트 아티팩트뿐이다. 그 외 어떤 커밋이 붙어도 이 증거는 무효가 되며, 그때는
스위트를 다시 돌려 이 파일을 갱신해야 한다.

> **착지 시점 주의 — 위 `Verified SHA`는 더 이상 존재하지 않는다.** 착지 직전에 저장소 전
> 이력의 커밋 신원을 재작성해(회사 계정 → `ukkiee`) 213개 SHA가 전부 바뀌었다. `f02164e`에
> 해당하는 현재 커밋은 **`bb8176f`**이다 — 전체 매핑과 경위는 `identity-rewrite.md`.
> 위 `Verified tree`(`6ec17f30…`)는 **그대로 유효하다**: 트리는 내용 주소이고 신원 재작성은
> 내용을 바꾸지 않았다(`main^{tree}`가 재작성 전후 동일). 재작성 후 새 HEAD에서 아래 7단계를
> 전부 다시 돌렸고 결과도 동일했다(smoke 105/105 포함).

## 전 스위트 실행 결과

7단계 전부 **exit 0**. 실행 순서는 아래 표 그대로다(빌드 산출물이 있어야 smoke·ui-diag가 돈다).

| # | 명령 | exit | 결과 (출력 발췌) |
|---|---|---|---|
| 1 | `bun run check` | 0 | `tsc --noEmit` 에러 0 (출력 없음) |
| 2 | `bun run test` | 0 | `Test Files 24 passed (24)` / `Tests 200 passed (200)` |
| 3 | `bun run build` | 0 | `✔ Finished in 336 ms` / `Σ Total size: 706.22 kB` |
| 4 | `bun run bundle-gate` | 0 | `popup 즉시 로드 합계 519.1KB = baseline 386KB + 133.1KB (한도 +143KB) — PASS` |
| 5 | `bun run smoke` | 0 | `105/105 passed` (FAIL 0줄) |
| 6 | `bun run storybook:build` | 0 | `Storybook build completed successfully` |
| 7 | `node scripts/ui-diag.mjs` | 0 | `overflow=0px, inner-scrollers=0` + 시작 지표 두 항목 PASS |

### 2. vitest — 200건

관측값은 **200건**이다. 브랜치 시작 시점(`9d19d7a`) 대비 증감은 diff에서 확인했다
(`git diff 9d19d7a -- src | grep "it("`, `it.each` 변경 0건이므로 건수 delta가 정확하다):

- **제거 5건** — CSP 종류가 사라져 검증 대상 자체가 없어진 것들: `compile-issue03`의 CSP describe 2건
  (디렉티브 합성 / 빈 디렉티브), `compile.test`의 "CSP 규칙도 자체 urlFilter를 쓴다" 1건,
  `rule-validation.test`의 "CSP는 이름 있는 디렉티브가 최소 1개" 1건, `rule-summary.test`의
  "CSP: 디렉티브 나열 요약" 1건.
- **추가 2건** — 마이그레이션의 검증 전 필터를 진입점에서 관통 검증하는 신규 테스트
  (`schema.test.ts`의 `parseStoredState` 드롭, `transfer.test.ts`의 `parseImport` 드롭).

따라서 시작 시점은 203건이었다(200 = 203 − 5 + 2) — 이 값은 유도값이고, 직접 관측한 것은
이 SHA에서의 200건이다. 남은 종류(header·cookie·set-cookie·redirect)와 모든 조건 차원의
테스트는 하나도 건드리지 않았다.

### 4. 번들 게이트 — 즉시/지연 분할

```
bundle gate: popup 즉시 로드 합계 519.1KB = baseline 386KB + 133.1KB (한도 +143KB) — PASS
  eager   (4): global-BvHELOeQ.js 504.8KB, react-Ca03aNmg.js 8.2KB, tokens-BRYICXzz.js 5.9KB, popup--W1Qv5XI.js 0.2KB
  deferred(4): sortable-profile-list-tzYz8Cml.js 44.7KB, motion-BmkXu_WT.js 36.4KB, header-name-autocomplete-CKXZAkXk.js 26.5KB, app-CgO0-Fn9.js 0.2KB
```

여유 **9.9KB**(한도 529KB = baseline 386 + 143). 직전 기록인 `ui-polish`의 verification.md는
같은 게이트에서 521.1KB였으므로 약 **2KB 줄었다** — CSP 디렉티브 편집기 UI와 그 i18n 문자열이
걷힌 만큼이다(그 521.1KB는 이 실행에서 재측정한 값이 아니라 해당 문서의 기록이다).
번들을 늘린 변경이 아니므로 한도(+143KB) 재트리아지는 없다.

### 5. smoke — 105건

브랜치 시작 시점 **106건 → 105건**. 두 값 모두 실측이다 — 시작 시점은
`git show 9d19d7a:scripts/smoke.mjs | grep -c "record("` = 106, 현재는 이 실행의 `105/105`.
케이스 이름 단위 diff로 확인한 내역:

- **제거 3건** — CSP 종류가 사라져 대상이 없어진 것들: `M3`(CSP 디렉티브 합성 → 응답 헤더),
  `M3b`(UI 확장 편집으로 CSP 값 변경 → 실응답 반영), `N18e`(빈 CSP 디렉티브 이름 Save 차단).
- **추가 2건** — `N18f`(Type 셀렉트 옵션에 CSP 없음 + 남은 다섯 종류 유지),
  `N14b`(ko 조건 라벨 '요청 출처 도메인' + 옛 라벨 부재 + 대조 대상 '탭 도메인' 유지).
- **건수에 안 잡히는 제거** — `N26`의 CSP 포커스 서브케이스 2건(행 없음·행 있음). `N26`은
  서브케이스들을 한 `record`로 묶으므로 총 건수는 그대로고, 남은 포커스 매핑 4건은 유지된다.

새 번호 `N18f`는 폐기된 `N18e`와 뜻이 충돌하지 않도록 재사용을 피한 것이다(티켓 01 리뷰 반영).

M3b가 유일하게 덮던 "UI 확장 편집 → 실응답 반영" 경로는 `M4b`(redirect의 치환·패턴을 UI로
편집 → 실리다이렉트 반영)가 계속 지킨다 — 커버리지 공백 없음.

### 7. ui-diag — 팝업 시작 지표

이 SHA에서의 기록 실행:

```
popup startup (표본 5 · 워밍업 1 폐기 · 중앙값)
  first paint  68.0ms  [68, 68, 68, 68, 68]
  dom ready    41.5ms  [42, 42, 43, 40, 41]
  device: darwin/arm64 · Apple M5 Pro · 48GB
  first paint 68.0ms vs 기준선 64.0ms → 상한 214.0ms = max(×1.3, +150ms) — PASS
  dom ready   41.5ms vs 기준선 36.7ms → 상한 186.7ms = max(×1.3, +150ms) — PASS
shot 6: popup boundary (18 profiles, max-length names) — overflow=0px, inner-scrollers=0
```

두 지표 다 상한 안이고 표본 산포가 거의 없다(first paint 5회 전부 68ms). 기준선보다 각각
4.0ms · 4.8ms 높지만 상한(214.0 / 186.7)과는 큰 여유가 있고, 이 브랜치는 코드를 **덜어내기만**
했으므로 시작 경로에 추가된 작업이 없다 — `ui-polish`의 verification.md가 기록한 실행 간
산포(동일 코드에서 1.9배) 범위 안의 기기 노이즈로 본다.

## 스펙 시임과 증거의 대응

스펙 `Testing Decisions`가 지정한 시임별로, 이 실행의 어느 부분이 그것을 덮는지:

| 스펙이 지정한 시임 | 이 실행에서의 증거 |
|---|---|
| vitest core — 로드 드롭(`parseStoredState` 관통) | 2번, `src/core/schema.test.ts`의 신규 테스트. 필터를 빼면 전체 리셋으로 빨개진다 |
| vitest core — import 드롭(`parseImport` 관통, notice 없음) | 2번, `src/core/transfer.test.ts`의 신규 테스트. 필터를 빼면 파일 전량 거부로 빨개진다 |
| vitest core — 컴파일·검증의 CSP 테스트 정리 | 2번, 제거 5건(위 내역) |
| i18n parity (en/ko 키 대칭) | 2번, `src/core/i18n.test.ts` 4건 통과 — CSP 키 5개가 양쪽에서 대칭으로 빠지고 `condInitiator`/`condInitiatorNote` 키는 유지됨을 지킨다 |
| smoke — UI가 CSP를 더는 제공하지 않음 | 5번, `N18f` |
| smoke — ko 새 라벨 렌더 | 5번, `N14b` |
| tsc — 제거 누락 그물 | 1번, 에러 0 |
| storybook build — 렌더 게이트 | 6번 |

**신규 시임 0.** 스펙이 "신규 시임은 만들지 않는다"고 못박은 대로, 위 전부가 기존
vitest core · smoke · storybook · tsc 안에서 이뤄졌다.

## 게이트 이력

| 게이트 | 라운드 | 결과 |
|---|---|---|
| plan | r1 | needs-attention 1건 (R-1 검증 전 필터 순서) — accept, 로드 경로까지 확장 |
| plan | r2 | **approve**, 발견 0건 |
| structure | r1 | **approve**, 발견 0건 (reviewedSha `35db355`) |
| release | — | 이 문서를 커밋한 뒤 실행 |

structure r1의 환경 유의사항: Codex 샌드박스가 읽기 전용이라 **Vitest가 게이트 안에서
기동하지 못했다**(tsc는 통과). 그래서 테스트 증거는 게이트가 아니라 이 문서의 로컬 실행이
진다 — 위 2·5·7번이 그 공백을 메운다. 경위는 `decisions.md`의 `### structure r1`.
