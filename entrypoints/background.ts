import { compile } from '@/core/compile';
import { createReconciler } from '@/core/reconciler';
import type { NetRule } from '@/core/rules';
import { loadState, onStateChanged } from '@/storage/state';

async function replaceSessionRules(rules: NetRule[]): Promise<void> {
  const existing = await browser.declarativeNetRequest.getSessionRules();
  await browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: rules as Browser.declarativeNetRequest.Rule[],
  });
}

export default defineBackground(() => {
  const reconciler = createReconciler({
    loadSnapshot: loadState,
    compile: (state) => compile(state.profiles, { paused: state.paused }),
    apply: replaceSessionRules,
  });

  onStateChanged(() => void reconciler.requestReconcile());
  browser.runtime.onStartup.addListener(() => void reconciler.requestReconcile());
  browser.runtime.onInstalled.addListener(() => void reconciler.requestReconcile());

  // Service worker가 깨어날 때마다 저장소 기준으로 수렴시킨다.
  void reconciler.requestReconcile();
});
