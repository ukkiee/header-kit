import type { CompileResult } from './compile';
import type { NetRule } from './rules';

export interface ReconcilerDeps<S> {
  loadSnapshot: () => Promise<S>;
  compile: (snapshot: S) => CompileResult;
  /**
   * 컴파일된 규칙과 그 입력 스냅샷을 함께 받는다 — 배지처럼 같은 스냅샷에서
   * 파생되는 부수 반영도 동일한 직렬화·세대 보증 아래에서 일어난다.
   */
  apply: (rules: NetRule[], snapshot: S) => Promise<void>;
  /** 태스크 실패는 큐를 멈추지 않고 이 채널로 보고된다. */
  onError?: (error: unknown) => void;
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
 * 최신 세대가 아니면 로드·적용 없이 물러난다.
 *
 * apply는 진행 중인 브라우저 API 호출이라 중단할 수 없으므로, apply 도중
 * 도착한 새 세대는 자기 태스크로 즉시 뒤따라 덮어쓴다 — stale 규칙은 잔류하지
 * 않고 최신 상태로 수렴한다. 태스크 오류는 격리되어 다음 태스크가 계속 돈다.
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

        try {
          const snapshot = await deps.loadSnapshot();
          if (generation !== latestGeneration) return;

          const result = deps.compile(snapshot);
          if (generation !== latestGeneration) return;

          await deps.apply(result.rules, snapshot);
        } catch (error) {
          deps.onError?.(error);
        }
      });
      return tail;
    },
  };
}
