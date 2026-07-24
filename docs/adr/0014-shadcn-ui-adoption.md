# shadcn/ui를 소스 그대로 받고, 앱 계약은 조합 래퍼가 진다

프리미티브를 shadcn/ui 소스로 교체한다. shadcn이 내려 준 파일(`src/ui/button.tsx`·`select.tsx`·`input.tsx`·`toast.tsx` 등)은 **수정하지 않고**, 이 저장소 고유의 계약(모션·시맨틱·크기·i18n)은 그 위에 얹는 **앱 레벨 조합 파일**이 진다.

- **맥락**: ADR 0011에서 프리미티브를 Base UI로 일원화했지만, 그 위의 스타일·변형·조합은 전부 자체 구현이었다(21개). 2026년 7월 shadcn/ui의 기본 프리미티브가 Radix에서 **Base UI로 바뀌면서** 두 계보가 하나가 됐다 — 예전이라면 shadcn 채택이 Radix라는 두 번째 프리미티브 계층을 들여왔겠지만, 이제는 이미 쓰는 Base UI 위에 얹힌다. 채택 비용의 가장 큰 항목이 사라졌다.

- **결정**: shadcn 소스를 원본 그대로 둔다. 재복사(`shadcn add`)가 곧 갱신이 되게 하기 위해서다. 소스를 고치기 시작하면 재복사할 때마다 같은 수정을 반복해야 하고, 그때부터 shadcn은 "업스트림"이 아니라 한 번 베껴 온 코드가 된다.

  대신 이 저장소가 포기할 수 없는 것들은 조합 파일로 흡수한다:
  - `press-button.tsx` — 누름·호버 모션(ADR 0012). shadcn 기본은 `translate-y-px`인데, 그것만 쓰면 **버튼만** 다른 감각이 된다(칩·아이콘버튼·메뉴 항목은 spring scale). Base UI `render` 합성으로 motion 요소를 끼운다.
  - `alert-banner.tsx` — `as` 시맨틱과 warn 단계. shadcn Alert는 div 고정이라 `<ul>`/`<li>`가 안 되고(가져오기 오류 목록이 목록 시맨틱을 잃는다), 변형도 default·destructive 둘뿐이라 '주의'가 없다.
  - `field-labeled.tsx` — 라벨-컨트롤 자동 연결(ADR 0011). shadcn Field는 순수 레이아웃 div라 호출부가 id/htmlFor를 직접 매야 하고 `aria-invalid`가 전파되지 않는다.
  - `text-field.tsx` — 크기 축(xs/sm/md). 팝업이 760×580 고정이라 필드 높이가 한 화면의 행 수를 정한다. shadcn 기본은 `h-8` 하나뿐이다.
  - `select-options.tsx` — options 배열 API와 팝업 위치·전이 규칙.
  - `toaster.tsx` — 액션 라벨(로케일마다 다르다)과 "닫기 버튼 없음" 규칙.

  덮어쓰기가 성립하는 것은 `cn`(clsx + tailwind-merge)을 함께 들였기 때문이다. 이 저장소는 오랫동안 tailwind-merge 없이 cva 축 분리로 같은 문제를 풀었는데, shadcn 소스를 그대로 받으려면 뒤에 오는 클래스가 앞을 이겨야 한다. 축 분리를 없애지는 않는다 — 축은 "이 프리미티브가 허용하는 변형"을 타입으로 못박는 장치이고, `cn`은 예외적 className이 조용히 겹치지 않게 하는 안전망이다.

- **토큰**: shadcn의 시맨틱 이름(`bg-primary`·`border-border`·`text-muted-foreground`)을 `@theme inline`으로 노출하되, 값은 기존 `@theme`의 zinc/blue 램프를 **참조한다**. 색의 단일 출처는 여전히 `@theme` 하나다. 다크 모드도 shadcn의 `.dark` 클래스 방식이 아니라 이 저장소의 `@variant dark`(시스템 `prefers-color-scheme` + 개발용 `data-theme` 오버라이드)를 유지한다 — 앱이 테마 스위치를 두지 않는다는 ADR 0004 결정을 shadcn 도입이 뒤집지 않는다.

- **트레이드오프**:
  - 번들이 늘었다. `tailwind-merge` 하나가 **+26.6KB**(min·비압축)로 추정치의 4배였다 — v4 클래스 그룹 테이블을 통째로 담는다. 게이트 한도를 143→175KB로 올렸다. 근거는 실측이다: 시작 지표(first paint)가 회귀하지 않았고, 확장은 로컬 로드라 네트워크 비용이 없다. 경위는 `.scratch/ui-stack-migration/issues/02-shadcn-infra.md`가 정본이다.
  - CSS도 늘었다(37.8 → 71.6KB). `tw-animate-css`와 shadcn 유틸이 들어온 몫이다. 번들 게이트는 JS만 재므로 이 증가는 게이트에 잡히지 않는다 — 알고 받아들인 비용이다.
  - shadcn 소스를 안 고치는 대가로 **호출부가 더 안다**. `min-h-0`(스크롤 성립), `text-xs`(폼 크기), `px-4`(폼 액션 여백)처럼 예전에는 프리미티브가 숨기던 것을 이제 호출부나 조합 파일이 명시한다.

- **경계**:
  - shadcn이 내려 준 파일 중 **쓰지 않는 것은 지운다**(11개). 저장소에 두면 재복사 대상만 늘고, Tailwind가 소스를 스캔하므로 쓰지 않는 컴포넌트의 클래스까지 CSS에 실린다(실측 -25KB). 필요해지면 `shadcn add`로 다시 받는다.
  - **`shadcn add`는 WXT 환경에서 저장소 밖에 쓴다.** `.wxt/tsconfig.json`의 `paths`(`@/*` → `../src/*`)를 프로젝트 루트 기준으로 해석해 `../src/ui/`에 파일을 만든다. 추가 후에는 반드시 생성 위치를 확인하고 옮긴다.
  - Tailwind 임의값에 **중첩 괄호를 넣지 않는다**. `ease-[var(--popup-ease,cubic-bezier(...))]`처럼 쓰면 스캐너가 그 문자열을 통째로 버려, 클래스는 소스에 있는데 CSS가 없어 전이가 조용히 죽는다(N30이 잡았다). 변수는 fallback 없이 참조하고 값은 MotionProvider가 올린다.
