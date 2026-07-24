# 03 — src/ui 프리미티브를 shadcn 소스로 교체

**What to build:** 자체 프리미티브를 shadcn/ui 소스로 바꾼다. shadcn 소스는 수정하지 않고, 이 저장소 고유 계약은 조합 파일이 진다(ADR 0014). 팝업의 크기·밀도·모션·접근성은 교체 전과 같아야 한다.

**Blocked by:** 02 — components.json·cn·시맨틱 토큰이 먼저 있어야 소스가 그대로 돈다.

**Status:** done

- [x] shadcn 컴포넌트 반입 후 실제로 쓰는 9개만 남김(button·badge·card·checkbox·input·scroll-area·select·textarea·toast)
- [x] 조합 파일 6개 신설 — `press-button` · `alert-banner` · `field-labeled` · `text-field` · `select-options` · `toaster`
- [x] 미사용 shadcn 11개 삭제(alert·collapsible·dialog·dropdown-menu·field·label·separator·switch·toggle-group·toggle·tooltip)
- [x] 죽은 코드 정리 — `kind-label.tsx`·스토리·`microCaption`(감사 #7)
- [x] 스토리 6개를 새 API로 갱신
- [x] 전 게이트 green

## 교체하며 드러난 것 — 조합 파일이 필요했던 지점

shadcn 소스를 그대로 받으면 **깨지는** 계약이 여섯 개 있었다. 전부 소스를 고치지 않고 조합으로 흡수했다.

1. **버튼 모션** — shadcn은 `active:translate-y-px`. 그것만 쓰면 버튼만 다른 감각이 된다(칩·아이콘버튼·메뉴 항목은 spring scale). N21b가 넷을 한 자리에서 대조한다. → `press-button.tsx`가 Base UI `render`로 motion 요소를 끼운다.
2. **배너 시맨틱** — shadcn Alert는 div 고정이라 `<ul>`/`<li>`가 안 되고 warn 단계도 없다. → `alert-banner.tsx`.
3. **라벨 자동 연결** — shadcn Field는 순수 레이아웃 div. → `field-labeled.tsx`가 Base UI Field.Root를 유지한다.
4. **필드 크기 축** — shadcn은 `h-8` 하나. 팝업이 760×580 고정이라 높이가 한 화면의 행 수를 정한다. → `text-field.tsx`.
5. **셀렉트 API·팝업 규칙** — options 배열, 아래로 열림·좌변 정렬. → `select-options.tsx`.
6. **토스트 액션 라벨** — shadcn `ToastList`는 `<ToastAction />`을 자식 없이 렌더해 버튼에 글자가 없다. 게다가 shadcn `ToastProvider`는 Viewport를 렌더하지 않아(그건 `Toaster`가 한다) 토스트가 아예 보이지 않았다. → `toaster.tsx`.

## 회귀 셋 — 스모크가 잡았다

교체 직후 스모크가 81/105에서 멈췄고, 세 개가 순서대로 드러났다.

**(1) 팝업 셸이 늘어났다 (가장 컸다).** 원본 ScrollArea는 Root에 `min-h-0`을 갖고 있었는데 shadcn Root에는 `relative`뿐이다. 그리드 자식의 기본 `min-height`는 `auto`라 칸보다 작아지지 않고, 그러면 뷰포트가 넘칠 일이 없어 **콘텐츠가 팝업 자체를 밀어낸다** — 760×580 고정(ADR 0005)이 깨져 690px로 늘었다. 진단 스크린샷으로 먼저 눈에 띄었고 호출부에 `min-h-0`을 주어 해결했다. 이 한 줄이 스모크 15개를 되살렸다(86 → 101).

주의: `ui-diag`는 **가로** 오버플로만 재므로 이 세로 증가를 잡지 못했다. 게이트가 비어 있는 축이다.

**(2) 셀렉트 라벨이 잘렸다.** shadcn Trigger 기본이 `text-sm`(14px)인데 이 앱 폼은 12px 계열이고, 14px에서는 매치 방식 최장 라벨(en `Regex (advanced)`)이 고정 폭을 넘었다. `text-xs`로 되돌리고, 그래도 shadcn Trigger의 여백이 예전보다 12px 넓어 `selectFixedWidth`를 136 → 152px로 올렸다(근거는 tokens.ts 주석).

**(3) 팝업이 앵커보다 좁았다.** `role="listbox"`를 갖는 것은 Popup이 아니라 **자식 List**인데 shadcn이 거기에 폭을 주지 않아 콘텐츠 폭으로 줄었다. `[&>[role=listbox]]:w-full`로 해결.

## 모션은 CSS로 옮겼다

Select 팝업의 열림·닫힘 전이는 조합 파일의 className이 아니라 `global.css`가 소유한다. Tailwind 임의값 `transition-[opacity,translate]`·`duration-[var(--popup-fade)]`가 **유틸로 생성되지 않아** 클래스는 소스에 있는데 스타일이 없었다 — 전이가 조용히 죽고 화면에서는 "팝업이 툭 나타남"으로만 보인다. 스캐너 판정에 기대지 않으려고 `[data-slot='select-content']` 규칙으로 옮겼다.

변수 fallback에 중첩 괄호를 넣은 것(`ease-[var(--popup-ease,cubic-bezier(...))]`)이 스캐너가 그 문자열을 통째로 버리게 한 원인 중 하나였다 — ADR 0014의 경계 항목에 남겼다.

## N30 단언 수정 — 동작이 아니라 측정이 틀렸다

전이를 CSS로 옮긴 뒤에도 N30만 계속 실패했다(`opacity 단계 기본=1`). Playwright로 팝업 삽입 순간부터 프레임 단위로 추적해 보니 **전이는 정상이었다**: `data-starting-style`이 붙은 t=0~5ms에 opacity 0, 이후 0 → 0.20 → 0.38 → … → 1로 9단계.

원인은 단언이 재는 대상이었다. 스모크는 `[role="listbox"]`의 opacity를 읽는데 shadcn 구조에서 그건 Popup이 아니라 자식 List이고, List는 항상 1이다. 측정 대상을 Popup(`[data-slot="select-content"]`)으로 바꾸고 예전 구조로의 fallback을 남겼다.

**계약을 무르게 한 것이 아니다** — 같은 임계값(`steps > 3`, reduced `<= 2`)을 그대로 두고 보는 곳만 고쳤다.

## N17a 단언 수정 — 계약이 바뀌었다

감사 #1을 반영해 행 액션의 기본 opacity가 0 → 0.6이 됐다. 단언을 `'0.6'`으로 바꾸고, **0이 아니라는 것이 계약의 핵심**이라는 이유를 주석에 남겼다.
