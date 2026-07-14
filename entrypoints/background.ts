import { compile } from '@/core/compile';
import { createCommandExecutor } from '@/core/executor';
import { createReconciler } from '@/core/reconciler';
import type { NetRule } from '@/core/rules';
import { loadState, onCommand, onStateChanged, persistState } from '@/storage/state';

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
    onError: (error) => console.error('[HeaderKit] reconcile failed', error),
  });

  // 상태 전이의 단일 권위 실행자 — 모든 쓰기는 이 큐를 거친다.
  const executor = createCommandExecutor({ load: loadState, save: persistState });
  onCommand((command) => executor.execute(command));

  onStateChanged(() => void reconciler.requestReconcile());
  browser.runtime.onStartup.addListener(() => void reconciler.requestReconcile());
  browser.runtime.onInstalled.addListener(() => void reconciler.requestReconcile());

  // Service worker가 깨어날 때마다 저장소 기준으로 수렴시킨다.
  void reconciler.requestReconcile();
});
