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

async function tick() {
  await new Promise((r) => setTimeout(r, 0));
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
  it('로드 도중 새 세대에 추월당한 스냅샷은 적용되지 않는다', async () => {
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
    await tick(); // 첫 요청의 로드가 시작된 상태에서
    const second = reconciler.requestReconcile(); // 새 세대가 추월

    loads[0]!.resolve({ tag: 'stale' });
    await tick();
    loads[1]!.resolve({ tag: 'fresh' });
    await Promise.all([first, second]);

    expect(applied).toEqual(['fresh']);
  });

  it('동기 버스트는 코얼레싱되어 마지막 세대만 로드·적용한다', async () => {
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

    expect(loadCount).toBe(1);
    expect(applied).toEqual(['load-1']);
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

    const bursts = Array.from({ length: 5 }, async (_, i) => {
      await new Promise((r) => setTimeout(r, i));
      return reconciler.requestReconcile();
    });
    await Promise.all(bursts);

    expect(maxInFlight).toBe(1);
  });

  it('요청 반환 promise는 해당 작업(또는 승계 확인)이 끝난 뒤 resolve된다', async () => {
    const applied: string[] = [];

    const reconciler = createReconciler<Snapshot>({
      loadSnapshot: async () => ({ tag: 'final' }),
      compile: compileTag,
      apply: async (rules) => {
        applied.push(rules[0]?.action.requestHeaders?.[0]?.value ?? '');
      },
    });

    await reconciler.requestReconcile();
    expect(applied).toEqual(['final']);

    await reconciler.requestReconcile();
    expect(applied).toEqual(['final', 'final']);
  });
});
