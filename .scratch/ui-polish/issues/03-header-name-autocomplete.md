# 03 — 헤더 이름 자동완성을 앱 팝업으로

**What to build:** 헤더 이름 자동완성이 브라우저 기본 UI가 아니라 앱의 다른 팝업과 같은 모양·같은 키보드 조작을 갖는다. 내가 등록한 이름이 표준 헤더보다 먼저 뜨고, 입력한 접두에 맞는 후보만 보이며, Esc는 제안 팝업만 닫고 편집 중인 폼은 유지된다.

**Blocked by:** 02 — 번들 여유가 ~3KB로 얇다. 스크롤 영역이 얼마를 먹었는지 알고 시작해야 대안이 필요한지 판단할 수 있다.

**Status:** done

- [x] 제안이 앱 팝업 표면으로 렌더되고 기존 `popupSurface`/`popupItem` 토큰을 쓴다 (smoke L2a가 `role=combobox`까지 확인 — datalist 상태로 검사하면 story 4를 안 보게 되므로)
- [x] 후보 산출 규칙이 core에 그대로 남고 **`autocomplete.ts`·`autocomplete.test.ts` 무수정** — `mode="none"`으로 Base UI의 자체 필터링·인라인 완성을 끈다
- [x] 화살표+Enter로 고른다 (smoke L2b)
- [x] Esc가 제안 팝업만 닫고 폼은 유지 (smoke L2c)
- [x] **초기 청크에 들어가지 않는다** — `header-name-autocomplete-*.js` **26.5KB, deferred**. 번들 게이트의 `MUST_BE_DEFERRED`에 등록해 즉시 집합에 새면 실패한다
- [x] 번들 델타·시작 지표 기록 — 아래
- [x] 번들 게이트 PASS (+139.4KB / 143KB) — 한도 재조정 없이 통과
- [x] 전 게이트 green — tsc 0 · vitest 203/203 · build · bundle-gate PASS · smoke **84/84** · storybook · ui-diag(overflow 0, 시작 지표 PASS)

## 측정치

- **번들:** 즉시 합계 523.8 → **525.4KB (+1.6KB)**. Autocomplete 본체 26.5KB는 지연 청크로 빠졌고, 늘어난 1.6KB는 두 청크가 공유하는 `tokens`가 별도 청크(5.8KB)로 추출되며 생긴 분할 비용이다(대신 global이 그만큼 줄었다). 즉시 로드했다면 +14.5KB였다.
  - 이 `tokens` 청크는 **즉시 집합에 새로 들어왔다** — 티켓 02에서 강화한 게이트(즉시 그래프 도출)가 아니었다면 `global`만 재던 옛 게이트에는 보이지 않았을 증가다.
- **시작 지표:** first paint 68/64/72ms, dom ready 45.7/40.3/44.6ms (기준선 64.0 / 36.7). 티켓 02에 기록한 변동 폭 안이다.

## 구현 과정에서 뒤집은 결정 셋 (전부 실측으로)

**1. `React.lazy`를 쓰지 않는다.** 처음엔 저장소 선행 예(`sortable-profile-list`)를 그대로 따라 `lazy` + `Suspense`로 짰다. 그런데 폼을 처음 열 때 datalist → 앱 팝업 교체가 **~250ms** 걸렸다. 모듈은 이미 100ms에 도착해 있었으므로(마커로 확인) 순수한 lazy 서스펜드/재시도 왕복이다. 헤더 이름은 autoFocus라 사용자는 그 250ms 동안 타이핑하며 브라우저 기본 UI를 보게 된다 — story 4가 없애려는 바로 그 경험이다. 받아 둔 컴포넌트를 모듈 스코프에 두고 동기 렌더하도록 바꾸니 **0~7ms**가 됐다.

**2. 유휴 프리로드를 넣었다가 뺐다.** `requestIdleCallback`으로 미리 받게 했더니 팝업 시작이 워낙 짧아 유휴 콜백이 **첫 페인트 전에** 끼어들었다 — first paint 중앙값이 ~62 → ~85ms, dom ready ~40 → ~58ms로 악화(각 3회 측정 비교). 교체가 이미 0~7ms라 얻을 것이 없어 제거했다. **티켓 01의 지표가 없었으면 이득으로 착각한 채 넘어갔을 변경이다.**

**3. autoFocus 가드를 넣었다가 뺐다.** 교체 시 포커스가 되돌아오는 것을 막으려 "이미 소비했으면 안 넘긴다" 가드를 뒀다. 교체가 빨라지자 fallback이 포커스를 쥔 채 사라지고 새 입력은 포커스를 안 받아 **폼을 열어도 아무 데도 포커스가 없었다**(smoke N18a가 잡음). 가드가 막으려던 250ms 창은 결정 1로 이미 사라졌으므로 되돌렸다.

## 기존 테스트 6곳을 고쳐야 했던 이유

헤더 이름 입력이 진짜 combobox가 되면서, 제안 목록이 열려 있는 동안 floating-ui가 **바깥 요소를 `aria-hidden` 처리**한다 (`FloatingFocusManager`의 `markOthers(insideElements, modal || isUntrappedTypeableCombobox)` — typeable combobox면 `modal=false`여도 적용된다). 그래서 폼의 다른 컨트롤을 role로 조준할 수 없어 N18c 등이 깨졌다.

확인해 본 결과 **기존 Select 팝업은 이 동작이 없다**(팝업 열림 시 다른 컨트롤 조회 가능). 즉 앱이 이미 싣고 있던 동작이 아니라 combobox 도입과 함께 들어온 것이다. 다만 이는 라이브러리가 의도한 combobox 접근성 규약이고 목록이 **열려 있는 동안만** 적용되며 Esc로 풀린다. 실제 사용자도 제안을 닫고 다음 필드로 가므로, 컴포넌트 대신 테스트에 `closeSuggestions` 헬퍼를 두어 조작 전에 닫게 했다(팝업이 닫힌 상태의 Esc는 폼을 닫으므로 열린 경우에만 누른다).

## 티켓 08(검증 실패 포커스)에 남기는 메모

스펙은 "헤더 이름은 HeaderNameInput을 거쳐 ref를 전달한다"고 정했다. 지금은 ref를 통과시키지 않는다(쓰는 곳이 없어 넣지 않았다). 08에서 추가할 때, 표현이 둘(팝업·datalist)이라 **양쪽 모두에 같은 ref가 닿아야** 한다는 점만 주의하면 된다.
