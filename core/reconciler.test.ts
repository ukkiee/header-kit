import { describe, expect, it } from 'vitest';
import type { CompileResult } from './compile';
import { createReconciler } from './reconciler';

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
      apply: async (result) => {
        const rules = result.rules;
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
      apply: async (result) => {
        const rules = result.rules;
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

  it('apply 도중 새 세대가 도착해도 stale 규칙이 잔류하지 않는다 (후속 태스크가 즉시 덮음)', async () => {
    let currentTag = 'v1';
    const applied: string[] = [];
    const firstApplyGate = deferred<void>();
    let applyCalls = 0;

    const reconciler = createReconciler<Snapshot>({
      loadSnapshot: async () => ({ tag: currentTag }),
      compile: compileTag,
      apply: async (result) => {
        const rules = result.rules;
        applyCalls += 1;
        const isFirst = applyCalls === 1;
        applied.push(rules[0]?.action.requestHeaders?.[0]?.value ?? '');
        if (isFirst) await firstApplyGate.promise; // 브라우저 API 호출이 오래 걸리는 상황
      },
    });

    const first = reconciler.requestReconcile();
    await tick(); // 첫 태스크가 apply('v1')에 진입
    currentTag = 'v2'; // Pause/편집에 해당하는 상태 변화
    const second = reconciler.requestReconcile(); // apply 도중 새 세대 도착
    firstApplyGate.resolve();
    await Promise.all([first, second]);

    // stale('v1')은 설치될 수 있으나 최종 상태는 반드시 최신('v2')으로 수렴한다.
    expect(applied).toEqual(['v1', 'v2']);
  });

  it('apply가 실패해도 큐는 멈추지 않고 다음 요청을 처리한다', async () => {
    let failNext = true;
    const errors: unknown[] = [];
    const applied: string[] = [];

    const reconciler = createReconciler<Snapshot>({
      loadSnapshot: async () => ({ tag: 'ok' }),
      compile: compileTag,
      apply: async (result) => {
        const rules = result.rules;
        if (failNext) {
          failNext = false;
          throw new Error('quota exceeded');
        }
        applied.push(rules[0]?.action.requestHeaders?.[0]?.value ?? '');
      },
      onError: (error) => errors.push(error),
    });

    await reconciler.requestReconcile();
    expect(errors).toHaveLength(1);
    expect(applied).toEqual([]);

    await reconciler.requestReconcile();
    expect(applied).toEqual(['ok']);
  });

  it('스트레스: 편집·Pause·탭·알람 트리거가 뒤엉켜도 최종 적용은 최신 상태와 일치하고 순서가 역전되지 않는다', async () => {
    let version = 0;
    const applied: number[] = [];

    const reconciler = createReconciler<Snapshot>({
      loadSnapshot: async () => {
        // 트리거 종류별로 다른 로드 지연을 흉내낸다
        await new Promise((r) => setTimeout(r, version % 3));
        return { tag: String(version) };
      },
      compile: compileTag,
      apply: async (result) => {
        const rules = result.rules;
        await new Promise((r) => setTimeout(r, version % 2));
        applied.push(Number(rules[0]?.action.requestHeaders?.[0]?.value ?? '-1'));
      },
    });

    const bursts: Array<Promise<void>> = [];
    for (let i = 0; i < 25; i += 1) {
      version += 1;
      bursts.push(reconciler.requestReconcile());
      if (i % 4 === 0) await tick();
      if (i % 7 === 0) await new Promise((r) => setTimeout(r, 1));
    }
    await Promise.all(bursts);

    // 마지막 적용은 반드시 최종 상태(version 25)이고, 적용 순서는 단조 증가한다
    expect(applied.at(-1)).toBe(25);
    expect(applied).toEqual([...applied].sort((a, b) => a - b));
  });

  it('요청 반환 promise는 해당 작업(또는 승계 확인)이 끝난 뒤 resolve된다', async () => {
    const applied: string[] = [];

    const reconciler = createReconciler<Snapshot>({
      loadSnapshot: async () => ({ tag: 'final' }),
      compile: compileTag,
      apply: async (result) => {
        const rules = result.rules;
        applied.push(rules[0]?.action.requestHeaders?.[0]?.value ?? '');
      },
    });

    await reconciler.requestReconcile();
    expect(applied).toEqual(['final']);

    await reconciler.requestReconcile();
    expect(applied).toEqual(['final', 'final']);
  });
});
