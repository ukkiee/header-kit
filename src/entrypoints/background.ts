import type { BadgeSpec } from '@/core/badge';
import type { Command } from '@/core/commands';
import type { NetRule } from '@/core/rules';
import type { StoredState } from '@/core/schema';
import { createStateWriter } from '@/platform/state-writer';
import {
  loadState,
  onCommand,
  onBackupMutation,
  onStateChanged,
  publishSummary,
} from '@/platform/stateStore';
import { bootstrap } from '@/runtime/background-bootstrap';


// ── browser 효과 래퍼 — browser.* 를 만지는 유일한 지점. 배선 자체는 bootstrap이 한다. ──

async function replaceSessionRules(rules: NetRule[]): Promise<void> {
  const existing = await browser.declarativeNetRequest.getSessionRules();
  await browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: rules as Browser.declarativeNetRequest.Rule[],
  });
}

async function validateRegexPattern(pattern: string): Promise<string | null> {
  const trimmed = pattern.trim();
  if (trimmed === '') return null;
  const { isSupported, reason } = await browser.declarativeNetRequest.isRegexSupported({
    regex: trimmed,
  });
  return isSupported ? null : `Invalid regex pattern (${reason ?? 'unsupported'})`;
}

/** 저장 시점 검증: regex 스코프·Redirect 패턴은 플랫폼이 실제 지원하는지 확인 후에만 저장된다. */
async function validateCommand(command: Command): Promise<string | null> {
  if (command.type === 'add-modification' || command.type === 'update-modification') {
    if (command.modification.kind === 'redirect') {
      return validateRegexPattern(command.modification.pattern);
    }
    // 규칙 자체 URL 필터(ADR 0007) — regex 방식만 플랫폼 검증을 받는다 (ADR 0008).
    const mod = command.modification;
    if (mod.urlFilter !== undefined && (mod.urlMatchType ?? 'regex') === 'regex') {
      return validateRegexPattern(mod.urlFilter);
    }
    return null;
  }

  // Import도 전량 수용/거부 — regex 하나라도 플랫폼이 거부하면 전체를 거부하되,
  // 오류는 항목 단위로 전부 모아 알려준다.
  if (command.type === 'import-profiles') {
    const errors: string[] = [];
    for (const profile of command.profiles) {
      for (const [index, mod] of profile.modifications.entries()) {
        const pattern =
          mod.kind === 'redirect'
            ? mod.pattern
            : (mod.urlMatchType ?? 'regex') === 'regex'
              ? mod.urlFilter
              : undefined;
        if (pattern === undefined) continue;
        const error = await validateRegexPattern(pattern);
        if (error !== null) {
          errors.push(`"${profile.name}" ${mod.kind} #${index + 1}: ${error}`);
        }
      }
    }
    if (errors.length > 0) return errors.join('\n');
  }
  return null;
}

async function applyBadge(badge: BadgeSpec): Promise<void> {
  await browser.action.setBadgeText({ text: badge.text });
  await browser.action.setBadgeBackgroundColor({ color: badge.color });
}

export default defineBackground(() => {
  bootstrap({
    loadState,
    // 쓰기 문은 여기서 **한 번** 만들어진다 — 어댑터를 직수입하므로 허가가 이 배선에
    // 등장하지 않는다 (ADR 0016).
    stateWriter: createStateWriter({ validateCommand }),
    publishSummary,
    replaceSessionRules,
    applyBadge,
    now: () => Date.now(),
    setTimer: (callback, delayMs) => {
      setTimeout(callback, delayMs);
    },
    onStateChanged,
    onCommand,
    onBackupMutation,
    onStartup: (callback) => browser.runtime.onStartup.addListener(callback),
    onInstalled: (callback) => browser.runtime.onInstalled.addListener(callback),
    onTogglePause: (callback) =>
      browser.commands.onCommand.addListener((command) => {
        if (command === 'toggle-pause') callback();
      }),
    logError: (context, error) => console.error(`[HeaderKit] ${context}`, error),
  });
});
