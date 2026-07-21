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
