/**
 * 게이트 테스트의 공통 배관. 게이트를 **자식 프로세스로 띄우고 산출물을 정리하는 일**은
 * 검사 대상마다 다르지 않으므로 한 자리에 둔다 — 셋으로 흩어져 있으면 곧 서로 어긋나고,
 * 실제로 어긋났다: `spawnSync`가 두 스트림을 함께 잡아야 하는 이유가 사본에 따라오지 않았다.
 *
 * `scripts/run-gates.test.mjs`는 아직 자기 사본을 쓴다. 그쪽은 `execFileSync`에 성공/실패
 * 경로를 따로 두는 다른 모양이고 픽스처 저장소까지 함께 만드는 헬퍼라, 옮기려면 그 파일의
 * 구조를 건드려야 한다 — 이 티켓에서 하지 않고 남은 중복으로 기록한다.
 */
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';

/** 저장소 루트. `scripts/`의 한 칸 위다. */
export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 자식 프로세스로 띄우고 **두 스트림을 언제나 함께** 돌려준다.
 *
 * 성공 종료일 때 stdout만 보는 방식이면 "FAIL을 stderr에 찍고 종료 코드 0으로 끝났다"가
 * 통과로 보인다 — 러너가 `verdict: token`으로 잡겠다고 선언한 바로 그 케이스가 테스트에는
 * 보이지 않게 된다. 종료 코드는 시그널로 죽은 경우(null)를 실패로 접는다: 죽은 것은 통과가
 * 아니다.
 */
export function runChild(bin, args, options = {}) {
  const r = spawnSync(bin, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/**
 * 만든 임시 디렉터리를 테스트마다 지운다. 케이스마다 새 트리를 쓰는 이유는, 하나가 남긴
 * 상태가 다음 판정에 섞이면 무엇이 그 판정을 만들었는지 테스트가 말하지 못하기 때문이다.
 */
export function tempDirs() {
  const made = [];
  afterEach(() => {
    for (const p of made.splice(0)) rmSync(p, { recursive: true, force: true });
  });
  return (dir) => {
    made.push(dir);
    return dir;
  };
}
