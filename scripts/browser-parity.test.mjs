// 브라우저 테스트 **분류**를 잰다. 분류의 출처는 레지스트리의 `browser` 칸이지 import가
// 아니다 — 이 저장소의 seam은 게이트를 자식 프로세스로 띄우라고 요구하므로, 규정을 지킨
// 테스트는 playwright를 import하지 않는다. import를 세면 그 테스트가 브라우저를 안 쓰는
// 것으로 보이고, 이름을 잘못 달면 브라우저 없는 CI가 크롬을 띄우려다 죽는다. 오탐이 아니라
// **미탐**이고 하필 규정된 경로에서만 난다.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BROWSER_SUFFIX, browserGateScripts, parityViolations } from './browser-parity.mjs';
import { REPO } from './test-support.mjs';

const registry = readFileSync(join(REPO, 'scripts', 'gates.txt'), 'utf8');
const packageScripts = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).scripts;
const browserScripts = browserGateScripts(registry, packageScripts);

/** 규정을 지킨 모양: playwright를 import하지 않고 게이트를 자식 프로세스로 띄운다. */
const SPAWNS_BROWSER_GATE = `import { runChild } from './test-support.mjs';
runChild('node', ['scripts/overflow-gate.mjs']);
`;
const IMPORTS_PLAYWRIGHT = `import { chromium } from 'playwright';\nchromium.launch();\n`;

describe('브라우저 분류 — 레지스트리의 browser 칸에서 파생된다', () => {
  it('browser: yes인 게이트를 읽어 온다', () => {
    // 이 집합이 비면 아래 검사가 전부 조용히 통과한다 — 검사하지 않으면서 초록인 상태다.
    expect(browserScripts.size).toBeGreaterThan(0);
    expect([...browserScripts]).toContain('overflow-gate.mjs');
  });

  it('playwright를 import하지 않고 브라우저 게이트를 띄우는데 이름이 틀리면 잡는다', () => {
    // **핵심 케이스.** 이 저장소의 seam이 요구하는 그 모양이고, import를 세는 분류였다면
    // 그대로 통과했을 자리다.
    const v = parityViolations({ 'scripts/wrong-name.test.mjs': SPAWNS_BROWSER_GATE }, browserScripts);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toMatch(/browser: yes/);
  });

  it('playwright를 직접 import하면서 이름이 틀려도 잡는다', () => {
    const v = parityViolations({ 'scripts/direct.test.mjs': IMPORTS_PLAYWRIGHT }, browserScripts);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toMatch(/playwright/);
  });

  it('이름이 규약을 지키면 둘 다 통과한다', () => {
    const files = {
      [`scripts/ok-spawn${BROWSER_SUFFIX}`]: SPAWNS_BROWSER_GATE,
      [`scripts/ok-direct${BROWSER_SUFFIX}`]: IMPORTS_PLAYWRIGHT,
    };
    expect(parityViolations(files, browserScripts)).toHaveLength(0);
  });

  it('이 저장소의 테스트 파일이 전부 규약을 지킨다', () => {
    const files = {};
    const walk = (dir) => {
      for (const entry of readdirSync(join(REPO, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.test\.(mjs|ts|tsx)$/.test(entry.name)) files[rel] = readFileSync(join(REPO, rel), 'utf8');
      }
    };
    walk('scripts');
    walk('src');
    expect(Object.keys(files).length).toBeGreaterThan(30);
    expect(parityViolations(files, browserScripts)).toEqual([]);
  });
});

/**
 * 두 명령의 대상이 **서로 배타적**인지는 이름 규약만 봐서는 알 수 없다 — 설정이 그 규약에서
 * 파생되는지를 실제로 물어봐야 한다. `vitest list`가 각 명령이 고를 파일을 그대로 말한다.
 */
describe('두 명령의 대상이 배타적이다', () => {
  const list = (browserOnly) =>
    execFileSync('node', [join(REPO, 'node_modules', 'vitest', 'vitest.mjs'), 'list', '--filesOnly'], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, ...(browserOnly ? { HK_TEST_BROWSER: '1' } : {}) },
      maxBuffer: 16 * 1024 * 1024,
    })
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.endsWith('.mjs') || l.endsWith('.ts') || l.endsWith('.tsx'));

  const plain = list(false);
  const browser = list(true);

  it('브라우저 픽스처가 `bun run test`의 대상에서 빠진다', () => {
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.filter((f) => f.endsWith(BROWSER_SUFFIX))).toEqual([]);
  });

  it('같은 픽스처가 `bun run test:browser`의 대상으로 선택된다', () => {
    expect(browser.length).toBeGreaterThan(0);
    expect(browser.every((f) => f.endsWith(BROWSER_SUFFIX))).toBe(true);
    expect(browser).toContain(`scripts/overflow-gate${BROWSER_SUFFIX}`);
  });

  it('두 집합이 겹치지 않는다', () => {
    expect(plain.filter((f) => browser.includes(f))).toEqual([]);
  });
});
