import type { Modification, Profile } from './schema';
import { ALL_RESOURCE_TYPES, type CompileWarning, type NetRule } from './rules';

export interface CompileEnv {
  paused: boolean;
}

export interface CompileResult {
  rules: NetRule[];
  warnings: CompileWarning[];
}

/** Profile 대역 상단에 Exclude Filter의 allow 규칙이 들어갈 자리 (이슈 05). */
const EXCLUDE_ALLOW_SLOTS = 1;

interface ModificationContext {
  profileId: string;
  priority: number;
  ruleId: number;
}

interface CompileOutput {
  rules: NetRule[];
  warnings: CompileWarning[];
  /** headerLower → 그 헤더를 수정하는 활성 Profile id들 (목록 순서). */
  headerUse: Map<string, string[]>;
}

function compileModification(
  modification: Modification,
  ctx: ModificationContext,
  out: CompileOutput,
): void {
  switch (modification.kind) {
    case 'request-header': {
      const header = modification.name.trim();
      if (header === '') {
        out.warnings.push({
          code: 'empty-header-name',
          profileId: ctx.profileId,
          modificationId: modification.id,
          message: 'Header name is empty; the modification was skipped.',
        });
        return;
      }

      const headerLower = header.toLowerCase();
      const users = out.headerUse.get(headerLower) ?? [];
      if (!users.includes(ctx.profileId)) users.push(ctx.profileId);
      out.headerUse.set(headerLower, users);

      out.rules.push({
        id: ctx.ruleId,
        priority: ctx.priority,
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
 *
 * 충돌 의미론 (PRD): 목록 위쪽 Profile이 이긴다. 활성 Profile마다 분리된
 * priority 대역을 아래에서 위로 할당하고(폭 = enabled Modification 수 +
 * Exclude allow 슬롯), 대역 안에서는 앞선 Modification이 더 높은 priority를
 * 받는다. 서로 다른 활성 Profile의 같은 헤더 수정은 정보성 경고로 노출한다.
 */
export function compile(profiles: Profile[], env: CompileEnv): CompileResult {
  const out: CompileOutput = { rules: [], warnings: [], headerUse: new Map() };

  if (env.paused) {
    return { rules: out.rules, warnings: out.warnings };
  }

  const active = profiles.filter((p) => p.active);

  const bandBase = new Map<string, number>();
  let cursor = 1;
  for (let i = active.length - 1; i >= 0; i -= 1) {
    const profile = active[i]!;
    bandBase.set(profile.id, cursor);
    cursor +=
      profile.modifications.filter((m) => m.enabled).length + EXCLUDE_ALLOW_SLOTS;
  }

  let ruleId = 0;
  for (const profile of active) {
    const enabled = profile.modifications.filter((m) => m.enabled);
    const base = bandBase.get(profile.id)!;

    enabled.forEach((modification, index) => {
      compileModification(
        modification,
        {
          profileId: profile.id,
          priority: base + enabled.length - 1 - index,
          ruleId: ++ruleId,
        },
        out,
      );
    });
  }

  for (const [header, profileIds] of out.headerUse) {
    if (profileIds.length > 1) {
      out.warnings.push({
        code: 'header-overlap',
        header,
        profileIds,
        message: `Multiple active profiles modify "${header}"; the highest profile in the list wins.`,
      });
    }
  }

  return { rules: out.rules, warnings: out.warnings };
}
