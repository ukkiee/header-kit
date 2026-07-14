import { computeBadge } from '@/core/badge';
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
  const executor = createCommandExecutor({ load: loadState, save: persistState });
  onCommand((command) => executor.execute(command));

  const converge = () => void reconciler.requestReconcile();
  onStateChanged(converge);
  browser.runtime.onStartup.addListener(converge);
  browser.runtime.onInstalled.addListener(converge);

  // Service worker가 깨어날 때마다 저장소 기준으로 수렴시킨다.
  converge();
});
