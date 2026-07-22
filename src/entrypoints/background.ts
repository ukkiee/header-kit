import { computeBadge } from '@/core/badge';
import type { Command } from '@/core/commands';
import { nextExpiry } from '@/core/expiry';
import type { NetRule } from '@/core/rules';
import type { StoredState } from '@/core/schema';
import { performBackup } from '@/platform/backupStore';
import {
  loadState,
  onCommand,
  onStateChanged,
  persistState,
  publishSummary,
} from '@/platform/stateStore';
import { onTabsChanged, queryTabInfos } from '@/platform/tabs';
import { bootstrap } from '@/runtime/background-bootstrap';

const EXPIRY_ALARM = 'headerkit-expiry';

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

/** 저장 시점 검증: regex Filter·Redirect 패턴은 플랫폼이 실제 지원하는지 확인 후에만 저장된다. */
async function validateCommand(command: Command): Promise<string | null> {
  if (command.type === 'add-filter' || command.type === 'update-filter') {
    const filter = command.filter;
    if (filter.kind !== 'url' && filter.kind !== 'exclude-url') return null;
    return validateRegexPattern(filter.pattern);
  }

  if (command.type === 'add-modification' || command.type === 'update-modification') {
    if (command.modification.kind === 'redirect') {
      return validateRegexPattern(command.modification.pattern);
    }
    // 규칙 자체 URL 필터(ADR 0007)도 같은 저장 시점 검증을 받는다.
    if (command.modification.urlFilter !== undefined) {
      return validateRegexPattern(command.modification.urlFilter);
    }
    return null;
  }

  // Import도 전량 수용/거부 — regex 하나라도 플랫폼이 거부하면 전체를 거부하되,
  // 오류는 항목 단위로 전부 모아 알려준다.
  if (command.type === 'import-profiles') {
    const errors: string[] = [];
    for (const profile of command.profiles) {
      for (const [index, filter] of profile.filters.entries()) {
        if (filter.kind !== 'url' && filter.kind !== 'exclude-url') continue;
        const error = await validateRegexPattern(filter.pattern);
        if (error !== null) {
          errors.push(`"${profile.name}" ${filter.kind} filter #${index + 1}: ${error}`);
        }
      }
      for (const [index, mod] of profile.modifications.entries()) {
        const pattern = mod.kind === 'redirect' ? mod.pattern : mod.urlFilter;
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

async function applyBadge(state: StoredState): Promise<void> {
  const badge = computeBadge(state);
  await browser.action.setBadgeText({ text: badge.text });
  await browser.action.setBadgeBackgroundColor({ color: badge.color });
}

/** 다음 Time Filter 만료에 알람을 건다 — 만료 예정이 없으면 알람을 지운다. */
async function scheduleExpiryAlarm(state: StoredState, now: number): Promise<void> {
  const when = nextExpiry(state, now);
  if (when === null) {
    await browser.alarms.clear(EXPIRY_ALARM);
  } else {
    await browser.alarms.create(EXPIRY_ALARM, { when });
  }
}

export default defineBackground(() => {
  bootstrap({
    loadState,
    persistState,
    publishSummary,
    queryTabInfos,
    performBackup,
    replaceSessionRules,
    applyBadge,
    scheduleExpiryAlarm,
    validateCommand,
    now: () => Date.now(),
    setTimer: (callback, delayMs) => {
      setTimeout(callback, delayMs);
    },
    onStateChanged,
    onCommand,
    onTabsChanged,
    onStartup: (callback) => browser.runtime.onStartup.addListener(callback),
    onInstalled: (callback) => browser.runtime.onInstalled.addListener(callback),
    onTogglePause: (callback) =>
      browser.commands.onCommand.addListener((command) => {
        if (command === 'toggle-pause') callback();
      }),
    onExpiryAlarm: (callback) =>
      browser.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === EXPIRY_ALARM) callback();
      }),
    logError: (context, error) => console.error(`[HeaderKit] ${context}`, error),
  });
});
