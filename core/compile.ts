import type { Modification, Profile } from './schema';
import { ALL_RESOURCE_TYPES, type CompileWarning, type NetRule } from './rules';

export interface CompileEnv {
  paused: boolean;
}

export interface CompileResult {
  rules: NetRule[];
  warnings: CompileWarning[];
}

interface CompileContext {
  profileId: string;
  nextId: () => number;
  rules: NetRule[];
  warnings: CompileWarning[];
}

function compileModification(modification: Modification, ctx: CompileContext): void {
  switch (modification.kind) {
    case 'request-header': {
      const header = modification.name.trim();
      if (header === '') {
        ctx.warnings.push({
          code: 'empty-header-name',
          profileId: ctx.profileId,
          modificationId: modification.id,
          message: 'Header name is empty; the modification was skipped.',
        });
        return;
      }
      ctx.rules.push({
        id: ctx.nextId(),
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header, operation: 'set', value: modification.value }],
        },
        condition: { resourceTypes: [...ALL_RESOURCE_TYPES] },
      });
      return;
    }
    default:
      modification.kind satisfies never;
  }
}

/**
 * 저장된 Profile 전체를 선언적 네트워크 규칙 집합으로 변환하는 순수 함수.
 * 규칙 상태는 항상 이 함수 출력과 일치해야 한다 (ADR-0002).
 */
export function compile(profiles: Profile[], env: CompileEnv): CompileResult {
  const rules: NetRule[] = [];
  const warnings: CompileWarning[] = [];

  if (env.paused) {
    return { rules, warnings };
  }

  let id = 0;
  const nextId = () => ++id;

  for (const profile of profiles) {
    if (!profile.active) continue;

    const ctx: CompileContext = { profileId: profile.id, nextId, rules, warnings };
    for (const modification of profile.modifications) {
      if (!modification.enabled) continue;
      compileModification(modification, ctx);
    }
  }

  return { rules, warnings };
}
