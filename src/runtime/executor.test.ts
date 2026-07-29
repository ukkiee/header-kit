import { describe, expect, it } from 'vitest';
import { createCommandExecutor } from './executor';
import type { StoredState } from '@/core/schema';
import { SCHEMA_VERSION } from '@/core/schema';
import { createWriterLane } from '@/core/writer-lane';

/*
 * 실행자는 이제 **직렬화를 하지 않는다** (ADR 0016, D4) — 레인을 쥔 증표를 요구하고
 * read-modify-write만 한다. 그래서 경합 성질을 겨누던 세 건은 여기서 사라지고, 레인이 실제로
 * 배선된 자리(`service-worker.integration.test.ts`, S3)에서 같은 성질을 단언한다:
 *
 *   · `겹쳐 도착한 두 전이가 모두 최종 상태에 남는다 (lost update 차단)` (본디 31행)
 *     → S3 `겹쳐 도착한 두 전이가 모두 최종 상태에 남는다 — 어떤 순서에서도`
 *   · `명령은 도착 순서대로 적용된다` (본디 55행)
 *     → S3 `명령은 도착 순서대로 적용된다 — 레인은 우선순위가 없다`
 *   · `실패한 명령은 뒤 명령을 막지 않는다` (본디 104행)
 *     → S3 `설계된 거부 뒤에도 레인이 전진하고, 실패는 그것을 요청한 쪽에만 간다`
 *       (입력이 지어낸 오류에서 **설계된 거부 경로**로 바뀌었다)
 *   · `validate가 거부한 명령은 상태를 바꾸지 않고, 큐는 계속 동작한다` (본디 71행)
 *     → 앞 절(상태를 바꾸지 않는다)은 경합과 무관한 단위 성질이라 아래에 남고,
 *       뒷 절(큐는 계속 동작한다)은 레인의 계약이 되어 위 S3 건으로 갔다.
 */

function initialState(): StoredState {
  return {
    schemaVersion: SCHEMA_VERSION,
    paused: false,
    theme: 'system',
    badgeVisible: true,
    syncBackup: true,
    profiles: [
      { id: 'p1', name: 'One', active: false, shortLabel: '1', color: '#2563eb', modifications: [] },
      { id: 'p2', name: 'Two', active: false, shortLabel: '2', color: '#16a34a', modifications: [] },
    ],
    materialized: {},
    customHeaderNames: [],
  };
}

describe('createCommandExecutor', () => {
  it('명령을 적용해 저장하고 그 결과를 돌려준다', async () => {
    let stored = initialState();
    const executor = createCommandExecutor({
      load: async () => structuredClone(stored),
      save: async (_held, state) => {
        stored = state;
      },
    });

    const next = await createWriterLane().run((held) =>
      executor.execute(held, { type: 'toggle-profile', profileId: 'p1', active: true }),
    );

    expect(next.profiles[0]?.active).toBe(true);
    expect(stored.profiles[0]?.active).toBe(true);
  });

  it('validate가 거부한 명령은 상태를 바꾸지 않는다', async () => {
    let stored = initialState();
    const executor = createCommandExecutor({
      load: async () => structuredClone(stored),
      save: async (_held, state) => {
        stored = state;
      },
      validate: async (command) =>
        command.type === 'add-modification' && command.modification.kind === 'redirect'
          ? 'Invalid regex'
          : null,
    });

    const lane = createWriterLane();
    await expect(
      lane.run((held) =>
        executor.execute(held, {
          type: 'add-modification',
          profileId: 'p1',
          modification: {
            kind: 'redirect',
            id: 'm1',
            pattern: '(',
            substitution: '',
            comment: '',
            enabled: true,
          },
        }),
      ),
    ).rejects.toThrow('Invalid regex');
    expect(stored.profiles[0]?.modifications).toEqual([]);
  });
});
