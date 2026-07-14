import { describe, expect, it } from 'vitest';
import type { CompileResult } from './compile';
import { createReconciler } from './reconciler';
import type { NetRule } from './rules';

interface Snapshot {
  tag: string;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function compileTag(snapshot: Snapshot): CompileResult {
  return {
    rules: [
      {
        id: 1,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header: 'X-Tag', operation: 'set', value: snapshot.tag }],
        },
        condition: { resourceTypes: ['xmlhttprequest'] },
      },
    ],
    warnings: [],
  };
}

describe('createReconciler', () => {
  it('연속 요청을 직렬화하고, 로드 중 추월당한 세대는 적용하지 않는다', async () => {
    const loads: Array<ReturnType<typeof deferred<Snapshot>>> = [];
    const applied: string[] = [];

    const reconciler = createReconciler<Snapshot>({
      loadSnapshot: () => {
        const d = deferred<Snapshot>();
        loads.push(d);
        return d.promise;
      },
      compile: compileTag,
      apply: async (rules: NetRule[]) => {
        applied.push(rules[0]?.action.requestHeaders?.[0]?.value ?? '');
      },
    });

    const first = reconciler.requestReconcile();
    const second = reconciler.requestReconcile();

    // 첫 로드가 끝나기 전에 두 번째 요청이 들어왔다 → 첫 스냅샷은 stale
    loads[0]!.resolve({ tag: 'stale' });
    await Promise.resolve();
    loads[1]!.resolve({ tag: 'fresh' });
    await Promise.all([first, second]);

    expect(applied).toEqual(['fresh']);
  });

  it('버스트 요청을 코얼레싱해 마지막 상태만 적용한다', async () => {
    let loadCount = 0;
    const applied: string[] = [];

    const reconciler = createReconciler<Snapshot>({
      loadSnapshot: async () => ({ tag: `load-${++loadCount}` }),
      compile: compileTag,
      apply: async (rules) => {
        applied.push(rules[0]?.action.requestHeaders?.[0]?.value ?? '');
      },
    });

    await Promise.all([
      reconciler.requestReconcile(),
      reconciler.requestReconcile(),
      reconciler.requestReconcile(),
    ]);

    expect(applied.length).toBeLessThan(3);
    expect(applied.at(-1)).toBe(`load-${loadCount}`);
  });

  it('apply는 절대 겹쳐 실행되지 않는다', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const reconciler = createReconciler<Snapshot>({
      loadSnapshot: async () => ({ tag: 't' }),
      compile: compileTag,
      apply: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
      },
    });

    await Promise.all(
      Array.from({ length: 5 }, () => reconciler.requestReconcile()),
    );
    await reconciler.requestReconcile();

    expect(maxInFlight).toBe(1);
  });

  it('적용 완료 시 onApplied가 최종 세대 정보와 함께 호출된다', async () => {
    const generations: number[] = [];

    const reconciler = createReconciler<Snapshot>({
      loadSnapshot: async () => ({ tag: 't' }),
      compile: compileTag,
      apply: async () => {},
      onApplied: ({ generation }) => {
        generations.push(generation);
      },
    });

    await reconciler.requestReconcile();
    await reconciler.requestReconcile();

    expect(generations.length).toBeGreaterThanOrEqual(1);
    const last = generations.at(-1)!;
    expect(generations).toEqual([...generations].sort((a, b) => a - b));
    expect(last).toBeGreaterThanOrEqual(2);
  });
});
