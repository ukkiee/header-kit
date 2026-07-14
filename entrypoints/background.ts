import { computeBadge } from '@/core/badge';
import type { Command } from '@/core/commands';
import { compile } from '@/core/compile';
import { createCommandExecutor } from '@/core/executor';
import { createReconciler } from '@/core/reconciler';
import type { NetRule } from '@/core/rules';
import type { StoredState } from '@/core/schema';
import { loadState, onCommand, onStateChanged, persistState } from '@/storage/state';

async function replaceSessionRules(rules: NetRule[]): Promise<void> {
  const existing = await browser.declarativeNetRequest.getSessionRules();
  await browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: rules as Browser.declarativeNetRequest.Rule[],
  });
}

/** 저장 시점 검증: regex Filter는 플랫폼이 실제 지원하는지 확인 후에만 저장된다. */
async function validateCommand(command: Command): Promise<string | null> {
  if (command.type !== 'add-filter' && command.type !== 'update-filter') return null;
  const filter = command.filter;
  if (filter.kind !== 'url' && filter.kind !== 'exclude-url') return null;
  const pattern = filter.pattern.trim();
  if (pattern === '') return null;

  const { isSupported, reason } = await browser.declarativeNetRequest.isRegexSupported({
    regex: pattern,
  });
  return isSupported ? null : `Invalid regex pattern (${reason ?? 'unsupported'})`;
}

async function applyBadge(state: StoredState): Promise<void> {
  const badge = computeBadge(state);
  await browser.action.setBadgeText({ text: badge.text });
  await browser.action.setBadgeBackgroundColor({ color: badge.color });
}

export default defineBackground(() => {
  const reconciler = createReconciler({
    loadSnapshot: loadState,
    compile: (state) => compile(state.profiles, { paused: state.paused }),
    // 규칙과 배지를 같은 스냅샷·같은 세대 보증 아래 반영한다.
    apply: async (rules, snapshot) => {
      await replaceSessionRules(rules);
      await applyBadge(snapshot);
    },
    onError: (error) => console.error('[HeaderKit] reconcile failed', error),
  });

  // 상태 전이의 단일 권위 실행자 — 모든 쓰기는 이 큐를 거친다.
  const executor = createCommandExecutor({
    load: loadState,
    save: persistState,
    validate: validateCommand,
  });
  onCommand((command) => executor.execute(command));

  const converge = () => void reconciler.requestReconcile();
  onStateChanged(converge);
  browser.runtime.onStartup.addListener(converge);
  browser.runtime.onInstalled.addListener(converge);

  // Service worker가 깨어날 때마다 저장소 기준으로 수렴시킨다.
  converge();
});
