/**
 * 디자인 시스템 공유 클래스 조각 — 프리미티브들이 색·표면 토큰을 한 곳에서 참조한다.
 * 테마 변경(예: accent 색, 필드 표면)은 이 파일만 고치면 전 프리미티브에 반영된다.
 */

/**
 * 필드 포커스 — Input / Select 가 공유한다.
 * 보더 색이 툭 바뀌지 않도록 전이를 함께 둔다 — Button이 `transition-colors`로 하는 것과
 * 같은 규율이고, 길이도 같은 CSS 기본값이라 두 표면의 색 변화가 어긋나지 않는다.
 */
export const fieldFocus = 'outline-none transition-colors focus:border-ring';

/** ghost 상호작용 표면 — Button.ghost / Select.ghost 가 공유한다. */
export const ghostInteractive = 'text-muted-foreground hover:bg-accent hover:text-foreground';

/**
 * accent 배경 조각 — 활성·선택 표면이 공유한다.
 *
 * **시맨틱 `primary`를 쓴다** (raw `bg-blue-600`이 아니라). 베이스 blue 램프는 라이트가
 * 소비하므로, 활성 표면이 그 램프를 직접 참조하면 다크 리디자인 팔레트를 따라가지 못해
 * 같은 화면에서 버튼(#1d4ed8)과 스위치·칩(#0066cc)이 **다른 파랑**이 된다(구조 게이트 S2-1).
 * `--primary`는 라이트에서 blue-600, 다크에서 `--color-dark-accent`라 두 테마를 모두 맞춘다.
 * ToggleSwitch의 `data-[checked]:bg-primary`, ChipGroup의 `data-[pressed]:bg-primary`도
 * 같은 토큰을 탄다 (data 수식어는 문자열 조각과 합성 불가라 인라인 표기).
 */
export const accentBg = 'bg-primary';

/** 떠 있는 팝업 표면 — Menu / Select / Autocomplete 팝업이 공유한다 (보더+명도, 무그림자). */
export const popupSurface = 'rounded-lg border border-border bg-popover p-1';

/** 팝업 항목 — Menu / Select / Autocomplete 항목이 공유한다 (하이라이트는 data-highlighted). */
const popupItem =
  'flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs outline-none select-none data-[highlighted]:bg-accent';

/** 팝업 포지셔너 — 앵커에 붙는 떠 있는 레이어. Select / Autocomplete 가 공유한다. */
export const popupPositioner = 'z-50 outline-none';

/** 앵커 폭 이상으로 열리는 팝업 — 트리거보다 좁아 보이지 않게 한다. Select / Autocomplete 공유. */
export const popupAnchored = `min-w-[var(--anchor-width)] outline-none ${popupSurface}`;

/** 본문 색이 붙은 팝업 항목 — 값 목록(Select / Autocomplete)이 공유한다. */
export const popupItemText = `text-popover-foreground ${popupItem}`;

/**
 * 값 목록에서 **지금 고른 항목** — Select만 쓴다(Autocomplete에는 선택 상태가 없다).
 *
 * 체크 표시(✓) 대신 **면으로** 말한다. 이 앱에서 "고른 것"의 시각 언어는 이미 accent 면이다
 * (칩의 `data-[pressed]:bg-primary`, 레일의 선택 배경) — 목록만 글리프로 말하면 같은 뜻에
 * 두 문법이 생기고, 오른쪽 끝의 작은 체크는 라벨에서 멀어 어느 줄이 선택인지 눈이 한 번
 * 더 훑어야 한다. 체크 자리로 비워 두던 오른쪽 32px 여백도 함께 사라져 같은 폭에 더 긴
 * 라벨이 들어간다.
 *
 * 세 번째 규칙(`data-[selected]:data-[highlighted]:…`)이 두 가지를 한 번에 한다.
 *
 * 하나는 **하이라이트를 잃지 않는 것**이다. 고른 항목 위로 키보드 커서가 오면 accent 면이
 * accent 면을 덮어 아무 변화가 없고, 그러면 커서가 어디 있는지 목록에서 사라진다. 값을
 * `/80`으로 낮춘 것은 primary Button의 `hover:bg-primary/80`과 같은 값이라, "지금 가리키는
 * accent 면"이 앱 어디서나 같은 농도로 읽힌다.
 *
 * 다른 하나는 **순서가 아니라 특이도로 이기는 것**이다. `data-[selected]`와
 * `data-[highlighted]`는 둘 다 [attr] 하나짜리라 겹쳤을 때 승자가 Tailwind의 출력 순서에
 * 달리는데, 그건 소스에서 읽히지 않는 승부다. 속성 둘을 겹친 규칙은 항상 이긴다.
 *
 * 선택은 색만이 아니다 — `aria-selected`가 문자로 같은 말을 한다(Base UI가 붙인다).
 */
export const popupItemSelected =
  'data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:data-[highlighted]:bg-primary/80';

/** 툴팁 표면 — 반전 명도(라이트에서 어두운 배경). IconButton 계열이 공유한다. */
export const tooltipPopup =
  'rounded-md bg-zinc-900 px-2 py-1 text-[11px] text-white dark:bg-zinc-100 dark:text-zinc-900';

/** 앱 캔버스(본문 배경+글자색) — App main / Storybook 프리뷰 래퍼가 공유한다. 시맨틱 토큰(ADR 0015). */
export const canvas = 'bg-background text-foreground';


/** 작은 배지 알약 — 규칙 종류 배지·조건 배지가 색만 달리해 공유한다. */
export const badgePill = 'rounded px-1 py-px text-[10px] font-medium';

/**
 * 스크롤바 트랙 — ScrollArea가 쓴다. 스크롤바는 오버레이라 콘텐츠 폭을 잠식하지 않는다
 * (팝업이 760×580 고정이라 폭을 뺏기면 곧바로 좁아진다, ADR 0005).
 *
 * **이 둘은 지금 아무도 부르지 않는다** (티켓 10에서 실측). `scroll-area.tsx`가 자기 클래스를
 * 직접 쓰므로(`transition-colors` + `bg-border`) 아래 설계가 실제로 그려지는 것과 같은지
 * 확인되지 않았다. 지우면 그 어긋남의 증거까지 사라져 남긴다 — 살릴지(scroll-area가 이 토큰을
 * 쓰게) 지울지(문서를 실물에 맞추게)는 스크롤바 설계를 다시 보는 결정이라 철거 티켓이 조용히
 * 고를 일이 아니고, 릴리스 게이트로 넘겨 두었다(티켓 10 파일).
 *
 * 기본이 투명이 아니라 opacity-60인 이유 — Base UI는 스크롤 불가일 때 스크롤바를 DOM에서
 * 아예 뺀다(keepMounted 기본 false). 즉 이 트랙이 보인다는 것 자체가 "넘치는 내용이 있다"는
 * 신호라, 숨겨 두면 스크롤 가능하다는 어포던스를 잃는다. 호버·스크롤 중에만 진해진다.
 *
 * `motion-reduce:transition-none` — opacity 전이는 reduced-motion 계약 안이다(ADR 0012의
 * 경계: 색 전이는 밖, 움직임·opacity는 안). 전이만 끄고 opacity 값 자체(60→100)는 남긴다 —
 * 어포던스는 유지하되 페이드만 없앤다. smoke N33이 감도 대조와 함께 못박는다.
 */
export const scrollbarTrack =
  'flex w-1.5 justify-center rounded-full opacity-60 transition-opacity duration-150 motion-reduce:transition-none data-[hovering]:opacity-100 data-[scrolling]:opacity-100';

/** 스크롤바 썸 — 트랙과 짝. 다크 모드에서 명도가 뒤집힌다. */
export const scrollbarThumb = 'w-full rounded-full bg-zinc-300 dark:bg-zinc-600';

/**
 * 셀렉트의 고정 폭 — **앱의 모든 셀렉트가 이 하나를 쓴다** (SelectOptions가 늘 붙인다).
 *
 * 고정인 이유가 둘이다. (1) 선택한 값에 따라 트리거 폭이 변하면 같은 행의 옆 컨트롤이
 * 밀린다. (2) 팝업 폭은 앵커(=트리거) 폭에서 나오므로, 트리거가 `w-fit`으로 짧은 값에
 * 맞춰 줄면 **팝업이 그 폭에 갇혀 긴 라벨이 잘린다** — 종류 셀렉트의 ko
 * `User-Agent 변경`이 실제로 그렇게 20px 잘려 있었다.
 *
 * 값이 40(10rem = 160px)인 근거 — 두 박스를 함께 재야 한다.
 *   트리거: 좌우 패딩 18px(`pl-2.5 pr-2`) + 아이콘 16px + 간격 6px + 보더 2px = **42px**
 *   팝업 항목: `popupItemText`의 좌우 패딩 16px(`px-2`) = **16px**
 *     (팝업 셸과 List의 패딩은 0이고 `ring-1`은 box-shadow라 폭을 먹지 않는다. 체크 표시를
 *      면으로 바꾸면서 오른쪽 32px 여백도 사라졌다 — `popupItemSelected` 주석 참고.)
 * 둘 다 12px 글자를 담는다(항목도 트리거와 같은 `popupItemText`의 text-xs). 그래서 크롬이
 * 더 큰 **트리거가 언제나 구속 조건**이고, 최장 라벨은 en `Response header`(95.4px)라
 * 필요 폭은 42 + 95.4 = **137.4px**다. 160px은 그 위로 22.6px(16%)를 남긴다.
 *
 * 예전 값 152px은 지금은 없는 라벨(`Regex (advanced)`)로 계산된 수였고, 항목이 14px이던
 * 시절의 팝업 요구(149.3px)에는 2.7px밖에 못 남겼다.
 *
 * 라벨이 더 길어지면 폭보다 en/ko 미절단 스모크 단언(N25)이 먼저 깨져 알려 준다 — 그 단언은
 * 트리거뿐 아니라 **팝업 항목의 절단**도 두 셀렉트 모두에서 본다.
 */
export const selectFixedWidth = 'w-40';

/**
 * 키보드 포커스 링 — Button·IconButton·SwitcherChip·아코디언 헤더·사이드바 그립이 공유한다(offset 일관).
 * 색은 시맨틱 `ring` — accentBg와 같은 이유로 raw blue 램프를 쓰지 않는다(S2-1).
 */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
