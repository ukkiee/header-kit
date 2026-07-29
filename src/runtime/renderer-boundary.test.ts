import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 화면은 권위 상태의 writer가 아니다 — **모듈 그래프로** 못 박는다 (ADR 0016).
 *
 * `persistState`가 증표를 요구하므로 증표 없이는 쓸 수 없다. 그런데 증표를 만드는
 * `createWriterLane`은 평범한 export라, 팝업·탭 코드가 자기 레인을 하나 만들어 쓰면 타입
 * 검사를 통과한다 — 컨텍스트마다 락이 하나씩 생겨 서로를 전혀 막지 않는 바로 그 모양이고,
 * ADR 0016이 `모듈 최상단 락`을 물린 이유다. 타입 하나로는 이 구멍을 닫을 수 없다.
 *
 * 그래서 여기서 닫는다: **화면 entrypoint의 import 그래프가 레인 모듈에 닿지 않는다.**
 * 닿지 않으면 화면은 증표를 만들 수 없고, 증표가 없으면 권위 상태를 쓸 수 없다 — 두 사실이
 * 합쳐져 "화면은 writer가 아니다"가 된다.
 *
 * 이것은 행동 시임이 아니라 번들 게이트와 같은 **구조 게이트**다. 세는 것은 실행이 아니라
 * 정적 import 그래프이므로 시나리오도 fake도 없다.
 *
 * `src/entrypoints/`가 아니라 여기 사는 이유: WXT는 그 디렉터리의 **모든 파일을 entrypoint로
 * 스캔**해 빌드에 물리므로, 테스트 파일을 두면 `wxt build`가 그것을 확장 진입점으로 읽으려다
 * 깨진다. 경계를 세우는 일은 컴포지션의 몫이라 `runtime`이 제자리이기도 하다.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));

/** 화면이 실려 도는 두 entrypoint. */
const RENDERER_ENTRYPOINTS = ['entrypoints/popup/main.tsx', 'entrypoints/app/main.tsx'];
/** 서비스워커 entrypoint — 여기서는 레인에 **닿아야** 한다(가드가 실제로 볼 수 있음을 증명). */
const WORKER_ENTRYPOINT = 'entrypoints/background.ts';

const LANE_MODULE = 'core/writer-lane.ts';

/**
 * `import`/`export … from`의 대상을 뽑는다. **`import type`은 세지 않는다** —
 * `verbatimModuleSyntax` 아래에서 그 문장은 통째로 지워져 런타임 간선이 아니다. 저장소
 * 어댑터가 증표 **타입**을 가져오는 것은 그래서 화면을 레인에 잇지 않는다.
 */
const SPECIFIER = /^(?:import|export)\s+(type\s+)?(?:[^;'"]*?\sfrom\s*)?['"]([^'"]+)['"]/gm;

function resolveModule(fromFile: string, specifier: string): string | null {
  const base =
    specifier.startsWith('@/') || specifier.startsWith('~/')
      ? resolve(SRC, specifier.slice(2))
      : specifier.startsWith('.')
        ? resolve(dirname(fromFile), specifier)
        : null; // 패키지 — 저장소 밖이라 따라가지 않는다
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(candidate) && !candidate.endsWith('/')) return candidate;
  }
  return null;
}

/** entrypoint에서 정적 import로 도달 가능한 저장소 안 모듈 전부 (저장소 상대 경로). */
function reachableFrom(entrypoint: string): Set<string> {
  const seen = new Set<string>();
  const queue = [resolve(SRC, entrypoint)];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined) continue;
    const key = relative(SRC, file);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!/\.tsx?$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(SPECIFIER)) {
      if (match[1] !== undefined) continue; // import type — 런타임 간선이 아니다
      const target = resolveModule(file, match[2] ?? '');
      if (target !== null) queue.push(target);
    }
  }
  return seen;
}

describe('화면과 서비스워커의 경계', () => {
  it('워커 entrypoint는 레인에 닿는다 — 이 가드가 실제로 레인을 볼 수 있다', () => {
    const reachable = reachableFrom(WORKER_ENTRYPOINT);
    expect(reachable).toContain(LANE_MODULE);
    // 걷기가 얕게 끝나지 않았는지 — 배선의 양 끝이 다 보여야 한다.
    expect(reachable).toContain('runtime/background-bootstrap.ts');
    expect(reachable).toContain('platform/stateStore.ts');
  });

  for (const entrypoint of RENDERER_ENTRYPOINTS) {
    it(`${entrypoint}는 레인 모듈에 닿지 않는다 — 화면은 증표를 만들 수 없다`, () => {
      const reachable = reachableFrom(entrypoint);
      // 걷기가 실제로 화면 그래프를 훑었다는 근거 — 저장소 어댑터까지는 닿는다(읽기·명령 전송).
      expect(reachable).toContain('platform/stateStore.ts');
      expect(reachable).not.toContain(LANE_MODULE);
    });
  }
});
