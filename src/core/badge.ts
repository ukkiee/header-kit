import type { StatusSummary } from './summary';

export interface BadgeSpec {
  text: string;
  color: string;
  /** 그 배경 위에서 읽히는 글자색 — 배경이 프로필 색이라 흰색으로 고정할 수 없다. */
  textColor: string;
}

const PAUSED_COLOR = '#6b7280';
/** 켜진 프로필의 색을 모를 때의 기본 — 이 앱의 accent 파랑. */
const APPLIED_COLOR = '#2563eb';

const WHITE = '#ffffff';
const BLACK = '#000000';

/** 아무것도 말하지 않는 배지 — 빈 텍스트면 툴바 아이콘에 배지가 그려지지 않는다. */
const HIDDEN: BadgeSpec = { text: '', color: PAUSED_COLOR, textColor: WHITE };

/**
 * 배지 배경 위에서 더 잘 읽히는 글자색 — 흰색과 검은색 중 대비가 큰 쪽.
 *
 * 배경이 고정 파랑이던 시절에는 흰 글자로 충분했다. 지금은 **프로필 색**이 배경이고 그 색은
 * 사용자 데이터다 — 카탈로그에서 고른 열 가지일 수도, 예전 버전이나 import가 남긴 아무
 * 값일 수도 있다. 노란색 배지에 흰 글자면 수가 안 보이는데, 배지는 이 확장이 켜져 있다는
 * 것을 말하는 유일한 상시 표시다.
 *
 * 못 읽는 값이면 흰색으로 물러난다 — 어댑터가 배경도 함께 못 칠했을 테니 브라우저 기본
 * (어두운 배경 + 흰 글자)에 맞추는 쪽이 맞다.
 */
export function readableTextColor(background: string): string {
  const luminance = relativeLuminance(background);
  if (luminance === null) return WHITE;
  const onWhite = 1.05 / (luminance + 0.05);
  const onBlack = (luminance + 0.05) / 0.05;
  return onWhite >= onBlack ? WHITE : BLACK;
}

/** `#rgb`·`#rrggbb`만 읽는다 — 못 읽으면 `null`이고 호출부가 물러난다. */
function relativeLuminance(hex: string): number | null {
  const body = hex.trim().replace(/^#/, '');
  // 3자리를 6자리로 펴는 자리. 문자열을 코드포인트로 나누는 것이 맞고, 이모지·서로게이트가
  // 들어와도 바로 다음 줄의 6자리 hex 검사가 전부 거절해 판정은 null이 된다.
  // oxlint-disable-next-line typescript/no-misused-spread
  const full = body.length === 3 ? [...body].map((c) => c + c).join('') : body;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const channels = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

/**
 * 툴바 배지 내용을 계산하는 순수 함수 — 어댑터는 결과를 그대로 반영만 한다.
 *
 * 배지가 세는 것은 **지금 실제로 걸려 있는 규칙 수**다
 * (티켓 06, `docs/reviews/wide-ui-redesign/spec.md` R-5). 설정의 라벨이
 * "적용 중인 규칙 수"이므로 값도 그것이어야 한다 — 저장된 규칙 수나 활성 프로필 수를 보여
 * 주면 라벨과 값이 어긋난다. 그래서 입력은 저장 상태가 아니라 **재조정이 실제로 적용한
 * 그 결과의 요약**이다: quota·컴파일로 빠진 규칙은 애초에 여기 세어져 있지 않다.
 *
 * 적용이 실패한 재조정에는 이 값을 쓰지 않는다 — `drawsBadge`를 먼저 보라.
 *
 * **색은 지금 걸려 있는 프로필의 것이다** (`leadProfileColor`). 툴바 배지와 사이드바 스와치가
 * 같은 색을 들면 "지금 무엇이 걸려 있나"를 팝업을 열지 않고도 안다 — 여럿이 켜져 있으면
 * 겹침의 승자, 즉 목록 맨 위 활성 프로필의 색이다(그 우선순위는 요약이 정한다). 정지는
 * 프로필과 무관한 전역 상태라 회색을 그대로 쓴다.
 */
export function computeBadge(summary: StatusSummary, visible: boolean): BadgeSpec {
  // 표시 토글은 표시 여부만 정한다 — 꺼져 있으면 일시정지 표시도 나가지 않는다.
  if (!visible) return HIDDEN;
  if (summary.paused) return { text: 'II', color: PAUSED_COLOR, textColor: WHITE };
  if (summary.ruleCount === 0) return HIDDEN;
  const color = summary.leadProfileColor ?? APPLIED_COLOR;
  return { text: String(summary.ruleCount), color, textColor: readableTextColor(color) };
}

/**
 * 이번 재조정 결과를 배지에 반영해야 하는가 — 아니면 직전 배지를 그대로 둘 것인가.
 *
 * 적용이 실패하면(`applyError`) 세션 규칙은 **하나도 바뀌지 않는다**:
 * `updateSessionRules`가 원자적이라 직전 규칙 세트가 그대로 걸려 있다. 그래서 그때
 * 실제 적용 수는 0이 아니라 직전 N이고, 직전 배지가 여전히 그 수를 말하고 있다. 다시
 * 그리면 브라우저에 N개가 걸린 채로 "적용 없음"(빈 배지)이나 "일시정지"를 주장하게 된다 —
 * 게다가 빈 배지는 활성 규칙이 없는 상태와 구분되지 않아 실패가 침묵이 된다.
 *
 * 표시를 끈 경우만 예외다: 토글은 표시 여부만 정하므로 실패 중에도 배지를 지운다.
 */
export function drawsBadge(summary: StatusSummary, visible: boolean): boolean {
  return !visible || summary.applyError === null;
}
