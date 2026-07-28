import type { CompileResult } from './compile';
import type { CompileWarning } from './compile-warnings';
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

export function summarizeCompile(
  result: CompileResult,
  context: SummaryContext,
): StatusSummary {
  const warnings = result.warnings.map(toView);
  return {
    ruleCount: result.rules.length,
    activeProfileCount: context.paused ? 0 : context.profiles.filter((p) => p.active).length,
    paused: context.paused,
    applyError: context.applyError,
    warnings,
    hasProblems: warnings.length > 0 || context.applyError !== null,
  };
}
