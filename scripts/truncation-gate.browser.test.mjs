// 말줄임 게이트를 자식 프로세스로 띄우고 종료 코드와 상태 줄만 단언한다.
// **이 파일은 실제 크롬을 띄운다** — 그래서 이름이 `*.browser.test.mjs`이고 `bun run test`가
// 아니라 `bun run test:browser`가 돈다.
//
// 픽스처는 파일 트리가 아니라 **산출물 변조**다 — `overflow-gate.browser.test.mjs`가 세운 그
// 규약을 따른다. 게이트가 스스로 시드하고 스스로 브라우저를 띄우므로, 검사 대상을 바꾸는
// 유일하게 정직한 길은 게이트가 로드할 확장을 바꾸는 것이다.
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO, runChild, tempDirs } from './test-support.mjs';

const GATE = join(REPO, 'scripts', 'truncation-gate.mjs');
/** 러너를 통해 돌면 이 회차의 빌드다(`scripts/browser-tests.mjs`가 넘긴다). 손으로 돌리면 기본 경로. */
const BUILD = process.env.HK_EXTENSION_DIR ?? join(REPO, '.output', 'chrome-mv3');
const track = tempDirs();

/** 실제 빌드를 복사한 뒤 `mutate`가 그것을 비튼다. 원본 산출물은 건드리지 않는다. */
function extension(mutate) {
  const dir = track(mkdtempSync(join(tmpdir(), 'hk-truncation-')));
  cpSync(BUILD, dir, { recursive: true });
  mutate?.(dir);
  return dir;
}

const run = (dir) => runChild('node', [GATE, '--artifacts', dir], { cwd: REPO });

/** 빌드된 CSS의 규칙 하나를 무력화한다. */
function neutralizeCss(dir, pattern, replacement) {
  const assets = join(dir, 'assets');
  for (const file of readdirSync(assets)) {
    if (!file.endsWith('.css')) continue;
    const path = join(assets, file);
    writeFileSync(path, readFileSync(path, 'utf8').replace(pattern, replacement));
  }
}

/** 번들 어디에 있든 그 문자열 리터럴을 바꾼다 — 카탈로그는 청크로 갈라져 파일명이 고정이 아니다. */
function replaceInChunks(dir, from, to) {
  let hits = 0;
  for (const sub of ['chunks', '.']) {
    const base = join(dir, sub);
    for (const file of readdirSync(base)) {
      if (!file.endsWith('.js')) continue;
      const path = join(base, file);
      const before = readFileSync(path, 'utf8');
      if (!before.includes(from)) continue;
      writeFileSync(path, before.replaceAll(from, to));
      hits += 1;
    }
  }
  return hits;
}

/**
 * popup.html의 앱 스크립트 **앞에** 코드를 심는다 — 인라인이 아니라 파일이어야 한다(MV3 CSP가
 * 인라인을 막아 조용히 아무 일도 일어나지 않는다).
 */
function injectBeforeApp(dir, code) {
  writeFileSync(join(dir, 'hk-test-inject.js'), code);
  const path = join(dir, 'popup.html');
  const html = readFileSync(path, 'utf8');
  writeFileSync(
    path,
    html.replace(
      '<script type="module"',
      '<script src="/hk-test-inject.js"></script>\n    <script type="module"',
    ),
  );
}

describe('truncation-gate — 앱이 스스로 하는 말이 칸에 들어가야 한다', () => {
  it('문구가 전부 들어가는 빌드는 통과하고, 어디를 몇 번 훑었는지 말한다', () => {
    const r = run(extension());
    expect(r.out).toMatch(/^PASS truncation-gate:/m);
    expect(r.out).toMatch(/훑기 \d+회/);
    expect(r.code).toBe(0);
  }, 180_000);

  it('카탈로그 문구가 칸을 넘기면 FAIL이고, 어느 문구가 몇 px 넘쳤는지 말한다', () => {
    /*
     * **문구를 길게 만든다.** 칸을 좁히거나 넓은 블록을 심으면 "스캐너가 돈다"만 증명되지,
     * 이 게이트가 겨냥한 "앱이 자기 칸보다 긴 말을 한다"는 재지 못한다. 프로필 행 메타의
     * 꺼짐 낱말이 실제로 물렸던 그 자리라 같은 자리를 되살린다(`off` → 옛 `not applied`).
     */
    const dir = extension((d) => {
      // 앵커에 **키 이름을 함께** 넣는다 — 값만으로 잡으면 번들 곳곳의 같은 낱말까지 바꾼다.
      // 번들은 문자열을 백틱으로 낸다(실측).
      const hits = replaceInChunks(d, 'profileStateOff:`off`', 'profileStateOff:`not applied at all`');
      if (hits === 0) throw new Error('픽스처의 앵커를 찾지 못했다 — 카탈로그 형태가 바뀌었다');
    });
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL truncation-gate:/m);
    expect(r.out).toMatch(/자기 칸에 들어가지 않는다/);
    expect(r.out).toMatch(/\d+px 넘침/);
    expect(r.code).toBe(1);
  }, 180_000);

  it('시드가 실패해 화면이 비면 훑지 않고 FAIL이다 — 빈 트리에는 잘린 원소가 없다', () => {
    // 이 게이트가 거꾸로 서는 자리다. 고정 시간을 기다렸다면 빈 화면을 훑고 "0종"으로 통과한다.
    const dir = extension((d) =>
      injectBeforeApp(
        d,
        `chrome.storage.local.get = async () => { throw new Error('hk-test: storage unavailable'); };`,
      ),
    );
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL truncation-gate:/m);
    expect(r.out).toMatch(/준비 표지가/);
    expect(r.out).toMatch(/렌더된 행=0\//);
    expect(r.code).toBe(1);
  }, 180_000);

  it('폰트가 등록되지 않았으면 훑지 않고 FAIL이다 — 폴백 글자 폭은 잘림 판정을 바꾼다', () => {
    const dir = extension((d) => neutralizeCss(d, /@font-face\{[^}]*\}/g, ''));
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL truncation-gate:/m);
    expect(r.out).toMatch(/face=0개/);
    expect(r.code).toBe(1);
  }, 180_000);

  it('훑어야 할 자리에 닿지 못하면 통과가 아니라 FAIL이다', () => {
    /*
     * 정지 토스트는 화면 전환으로 서지 않아 **직접 띄워야** 하는 유일한 자리다. 그 버튼을
     * 못 찾으면 그 자리를 재지 못한 것이고, 재지 못한 것은 통과가 아니다 — 이 단언이 없으면
     * 토스트를 놓친 게이트가 나머지만 훑고 초록을 찍는다.
     */
    const dir = extension((d) => {
      // en 카탈로그의 그 키만 바꾼다 — 라벨이 달라지면 게이트가 그 버튼에 닿지 못한다.
      const hits = replaceInChunks(d, 'pause:`Pause`', 'pause:`Pausx`');
      if (hits === 0) throw new Error('픽스처의 앵커를 찾지 못했다 — 정지 버튼 라벨이 바뀌었다');
    });
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL truncation-gate:/m);
    expect(r.out).toMatch(/정지 토스트를 띄우지 못했다/);
    expect(r.code).toBe(1);
  }, 180_000);

  it('산출물이 없으면 브라우저를 띄우기 전에 FAIL이고 사유가 경로를 말한다', () => {
    const r = runChild('node', [GATE, '--artifacts', join(tmpdir(), 'hk-no-such-build')], { cwd: REPO });
    expect(r.out).toMatch(/^FAIL truncation-gate:/m);
    expect(r.out).toContain('hk-no-such-build');
    expect(r.code).toBe(1);
  });
});
