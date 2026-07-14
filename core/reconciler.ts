import type { CompileResult } from './compile';
import type { NetRule } from './rules';

export interface ReconcilerDeps<S> {
  loadSnapshot: () => Promise<S>;
  compile: (snapshot: S) => CompileResult;
  apply: (rules: NetRule[]) => Promise<void>;
}

export interface Reconciler {
  /**
   * Schedule a reconcile. Requests run strictly one at a time in FIFO order;
   * a request superseded by a newer generation is skipped (burst coalescing),
   * and a snapshot loaded for a superseded generation is never applied.
   */
  requestReconcile: () => Promise<void>;
}

/**
 * 모든 재컴파일 트리거를 직렬화하는 단일 재조정 큐 (PRD 재컴파일 직렬화 결정).
 * 각 요청은 단조 증가 세대를 받아 체인 뒤에 자기 작업을 붙이고, 실행 시점에
 * 최신 세대가 아니면 로드·적용 없이 물러난다 — stale 규칙이 최신 규칙을 덮지 않는다.
 */
export function createReconciler<S>(deps: ReconcilerDeps<S>): Reconciler {
  let latestGeneration = 0;
  let tail: Promise<void> = Promise.resolve();

  return {
    requestReconcile() {
      latestGeneration += 1;
      const generation = latestGeneration;

      tail = tail.then(async () => {
        if (generation !== latestGeneration) return;

        const snapshot = await deps.loadSnapshot();
        if (generation !== latestGeneration) return;

        const result = deps.compile(snapshot);
        if (generation !== latestGeneration) return;

        await deps.apply(result.rules);
      });
      return tail;
    },
  };
}
