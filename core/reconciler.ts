import type { CompileResult } from './compile';
import type { NetRule } from './rules';

export interface ReconcilerDeps<S> {
  loadSnapshot: () => Promise<S>;
  compile: (snapshot: S) => CompileResult;
  apply: (rules: NetRule[]) => Promise<void>;
  onApplied?: (info: { generation: number; result: CompileResult }) => void;
}

export interface Reconciler {
  /** Schedule a reconcile. Coalesces bursts; only the newest generation is ever applied. */
  requestReconcile: () => Promise<void>;
}

/**
 * 모든 재컴파일 트리거를 직렬화하는 단일 재조정 큐.
 * 각 요청은 단조 증가 세대를 받고, 스냅샷 로드 중 새 세대에 추월당한
 * 실행은 적용 없이 폐기된다 — stale 규칙이 최신 규칙을 덮는 일이 없다.
 */
export function createReconciler<S>(deps: ReconcilerDeps<S>): Reconciler {
  let latestGeneration = 0;
  let running: Promise<void> | null = null;
  let rerunRequested = false;

  async function drain(): Promise<void> {
    do {
      rerunRequested = false;
      const generation = latestGeneration;

      const snapshot = await deps.loadSnapshot();
      if (generation !== latestGeneration) continue;

      const result = deps.compile(snapshot);
      if (generation !== latestGeneration) continue;

      await deps.apply(result.rules);
      deps.onApplied?.({ generation, result });
    } while (rerunRequested);
  }

  return {
    requestReconcile() {
      latestGeneration += 1;
      if (running) {
        rerunRequested = true;
        return running;
      }
      running = drain().finally(() => {
        running = null;
      });
      return running;
    },
  };
}
