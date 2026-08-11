import type { CompileResult } from './compile';
import type { CompileWarning } from './compile-warnings';
import type { MessageKey } from './i18n';
import type { Profile } from './schema';

/**
 * "지금 브라우저에 무엇이 걸려 있는가"의 사용자 대면 요약. Compile 반환값과
 * 어댑터의 apply 결과를 사람이 읽는 형태로 묶는다 — 조용한 실패를 두지 않는다.
 */

export interface WarningView {
  code: CompileWarning['code'];
  /** 라벨·상세 보간 인자 (header/limit/quota) — 로케일을 아는 UI가 카탈로그로 렌더. */
  params: Record<string, string | number>;
}

export interface StatusSummary {
  ruleCount: number;
  activeProfileCount: number;
  /**
   * 지금 걸려 있는 것들의 **대표 색** — 툴바 배지가 이것으로 칠해진다.
   *
   * 여럿이 켜져 있으면 **목록에서 가장 위**에 있는 활성 프로필의 색이다. 임의로 고른
   * 기준이 아니라 이 앱이 이미 쓰는 우선순위다: 같은 헤더를 여러 프로필이 건드리면 목록
   * 위쪽이 이긴다(`warnHeaderOverlap`). 배지가 그 승자의 색을 들면, 겹쳤을 때 실제로
   * 나가는 값이 어느 프로필의 것인지를 툴바만 보고도 알 수 있다.
   *
   * 정지 중이거나 켜진 프로필이 없으면 `null`이다 — `activeProfileCount`가 0으로
   * 떨어지는 것과 같은 규율이라, 요약 안에서 두 값이 어긋나지 않는다.
   */
  leadProfileColor: string | null;
  paused: boolean;
  /** 어댑터가 규칙을 실제 적용하다 실패한 메시지 (예: quota) — 없으면 null. */
  applyError: string | null;
  warnings: WarningView[];
  hasProblems: boolean;
}

function toView(warning: CompileWarning): WarningView {
  switch (warning.code) {
    case 'header-overlap':
      return { code: warning.code, params: { header: warning.header } };
    case 'regex-too-long':
      return { code: warning.code, params: { limit: warning.limit } };
    case 'quota-exceeded':
      return { code: warning.code, params: { quota: warning.quota, limit: warning.limit } };
    case 'append-not-allowed':
      return { code: warning.code, params: { header: warning.header } };
    default:
      return { code: warning.code, params: {} };
  }
}

export interface SummaryContext {
  profiles: Profile[];
  paused: boolean;
  /** 어댑터가 규칙 적용에 실패한 메시지 — 없으면 null. */
  applyError: string | null;
}

/** 프로필 행이 목록에서 읽히는 상태 — 저장된 on/off 위에 전역 정지가 덮인다. */
export type ProfileRowState = 'on' | 'off' | 'paused';

/**
 * 상태 하나당 낱말 하나 (티켓 04) — **행 메타에 보이는 말과 행 이름에 담기는 말이 같다**.
 *
 * 표를 여기 두는 이유는 이 파일이 `ProfileRowState`를 정의하는 곳이기 때문이다. 읽는 쪽이
 * 둘(메타 문구를 짓는 곳과 접근성 이름을 짓는 곳)이라, 각자 표를 들면 상태가 하나 늘거나
 * 낱말이 바뀌는 날 한쪽만 고쳐지고 그 어긋남은 WCAG 2.5.3 위반으로 나타난다.
 */
export const PROFILE_STATE_KEY: Record<ProfileRowState, MessageKey> = {
  on: 'profileStateOn',
  off: 'profileStateOff',
  paused: 'profileStatePaused',
};

export interface ProfileRowStatus {
  /** 그 프로필에 들어 있는 **켜진** Modification 수. */
  enabledModificationCount: number;
  state: ProfileRowState;
}

/**
 * 프로필 행의 표시값 (티켓 13, 스펙 story 22/25) — 목록만 보고도 "이 프로필에 규칙이
 * 몇 개 들어 있나"와 "지금 걸리고 있나"를 알게 한다.
 *
 * **컴파일 결과가 아니라 저장 상태에서 파생한다.** 컴파일은 프로필을 가로질러 하나의
 * 규칙 목록으로 접히므로(충돌 승자 하나만 남는다) 그 수를 프로필별로 되돌려 귀속시킬 수
 * 없다 — 시도하면 재컴파일이 하나 더 생기고, 겹친 규칙을 가진 프로필의 수가 사용자가 그
 * 프로필 안에서 세는 수와 어긋난다. 그래서 여기 수는 **그 프로필의 켜진 규칙 수**이고,
 * 레일 하단·툴바 배지의 "실제 적용 수"(`summarizeCompile`)와는 다른 질문의 답이다.
 *
 * **일시정지는 표시만 덮는다.** 저장된 `active`는 그대로 두고 상태만 'paused'로 읽게
 * 하므로, 정지 중에 인라인 토글을 만져도 그 값이 살아 있고 재개하면 직전 모습이 그대로
 * 돌아온다. 규칙 수도 깎지 않는다 — 규칙은 사라진 게 아니라 멈춘 것이다.
 */
export function profileRowStatus(
  profile: Pick<Profile, 'active' | 'modifications'>,
  paused: boolean,
): ProfileRowStatus {
  return {
    enabledModificationCount: profile.modifications.filter((m) => m.enabled).length,
    state: paused ? 'paused' : profile.active ? 'on' : 'off',
  };
}

export function summarizeCompile(result: CompileResult, context: SummaryContext): StatusSummary {
  const warnings = result.warnings.map(toView);
  const active = context.paused ? [] : context.profiles.filter((p) => p.active);
  return {
    ruleCount: result.rules.length,
    activeProfileCount: active.length,
    // 목록 순서가 곧 우선순위다 — 첫 활성 프로필이 겹침의 승자이고 배지의 색이다.
    leadProfileColor: active[0]?.color ?? null,
    paused: context.paused,
    applyError: context.applyError,
    warnings,
    hasProblems: warnings.length > 0 || context.applyError !== null,
  };
}
