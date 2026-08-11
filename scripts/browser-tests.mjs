#!/usr/bin/env node
// 브라우저를 띄우는 테스트 집합의 진입점.
//
// vitest를 게이트 명령으로 **직접** 걸 수 없다: 이 행은 `needs: build`라 러너가
// `--artifacts <경로>`를 넘기는데 vitest는 모르는 옵션이라고 거절한다(실측). 그렇다고
// `needs`를 떼면 이 픽스처들이 **디스크에 남아 있는 아무 빌드**를 복사해 비틀게 된다 —
// D4a가 없애러 온 바로 그 상태다.
//
// 그래서 계약을 지키는 얇은 껍질을 둔다: 인자를 받아 환경변수로 넘기고 vitest를 띄운다.
// 판정은 vitest의 종료 코드가 전부다(`verdict: exit`).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactsDirFrom, tokenFail } from './artifacts-arg.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = tokenFail('test-browser');

const parsed = artifactsDirFrom(process.argv.slice(2), path.join(REPO_ROOT, '.output', 'chrome-mv3'));
if (parsed.error) fail(parsed.error);

const result = spawnSync(
  process.execPath,
  [path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run'],
  {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      HK_TEST_BROWSER: '1',
      // 픽스처가 복사·변조할 확장. 러너를 통해 돌면 이 회차의 빌드다.
      HK_EXTENSION_DIR: path.isAbsolute(parsed.dir) ? parsed.dir : path.join(process.cwd(), parsed.dir),
    },
  },
);
process.exit(result.status ?? 1);
