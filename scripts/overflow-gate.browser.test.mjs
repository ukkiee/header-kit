// 오버플로 게이트를 자식 프로세스로 띄우고 종료 코드와 상태 줄만 단언한다.
// **이 파일은 실제 크롬을 띄운다** — 그래서 이름이 `*.browser.test.mjs`이고 `bun run test`가
// 아니라 `bun run test:browser`가 돈다.
//
// 픽스처는 파일 트리가 아니라 **산출물 변조**다. 게이트가 스스로 시드하고 스스로 브라우저를
// 띄우므로, 검사 대상을 바꾸는 유일하게 정직한 길은 게이트가 로드할 확장을 바꾸는 것이다 —
// 게이트에 시험용 손잡이를 다는 것보다 낫다(그 손잡이는 프로덕션에 남는다).
import { cpSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO, runChild, tempDirs } from './test-support.mjs';

const GATE = join(REPO, 'scripts', 'overflow-gate.mjs');
/** 러너를 통해 돌면 이 회차의 빌드다(`scripts/browser-tests.mjs`가 넘긴다). 손으로 돌리면 기본 경로. */
const BUILD = process.env.HK_EXTENSION_DIR ?? join(REPO, '.output', 'chrome-mv3');
const track = tempDirs();

/** 실제 빌드를 복사한 뒤 `mutate`가 그것을 비튼다. 원본 산출물은 건드리지 않는다. */
function extension(mutate) {
  const dir = track(mkdtempSync(join(tmpdir(), 'hk-overflow-')));
  cpSync(BUILD, dir, { recursive: true });
  mutate?.(dir);
  return dir;
}

const run = (dir) => runChild('node', [GATE, '--artifacts', dir], { cwd: REPO });

/** 빌드된 CSS의 규칙 하나를 무력화한다 — 레이아웃·폰트 계약이 깨진 상태를 만드는 자리다. */
function neutralizeCss(dir, pattern, replacement) {
  const assets = join(dir, 'assets');
  for (const file of readdirSync(assets)) {
    if (!file.endsWith('.css')) continue;
    const path = join(assets, file);
    writeFileSync(path, readFileSync(path, 'utf8').replace(pattern, replacement));
  }
}

/**
 * popup.html의 앱 스크립트 **앞에** 코드를 심는다 — 앱이 뜨기 전에 환경을 바꿔야 한다.
 * 인라인이 아니라 파일로 심는 이유: MV3의 CSP가 인라인 스크립트를 막아 조용히 아무 일도
 * 일어나지 않는다(실측 — 주입이 무효인 채 게이트가 통과했다).
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

describe('overflow-gate — 준비 표지가 서야 훑는다', () => {
  it('넘치는 것이 없는 빌드는 통과하고, 무엇을 확인하고 훑었는지 말한다', () => {
    const r = run(extension());
    expect(r.out).toMatch(/^PASS overflow-gate:/m);
    expect(r.out).toMatch(/지연 목록 도착/);
    expect(r.code).toBe(0);
  }, 120_000);

  it('심은 최대 길이 이름이 레이아웃을 깨면 FAIL이다', () => {
    // 넘침을 **시드가 만들게** 한다. 넓은 블록을 하나 주입하면 스캐너가 돈다는 것만 증명되지,
    // 이 게이트가 겨냥한 "최대 길이 이름이 좁은 팝업을 깬다"는 재지 못한다.
    //
    // 그래서 축소 허용(`min-width: 0`)을 무력화한다 — flex 자식이 줄어들지 못하면 심어 둔 긴
    // 이름이 그대로 밀어낸다(실측 366px). `.truncate`만 지우면 넘치지 않는다: 앱이 두 겹으로
    // 막고 있고, 그 사실 자체가 이 픽스처가 무엇을 재현해야 하는지 말해 준다.
    const dir = extension((d) => neutralizeCss(d, /\.min-w-0\{[^}]*\}/g, '.min-w-0{}'));
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL overflow-gate:/m);
    expect(r.out).toMatch(/가로 오버플로 \d+px/);
    expect(r.code).toBe(1);
  }, 120_000);

  it('시드가 실패해 화면이 비면 훑지 않고 FAIL이다 — 빈 트리에는 넘치는 원소가 없다', () => {
    // 저장소 읽기를 **실패시킨다.** 빈 객체를 돌려주면 앱이 기본 상태(프로필 1개)로 떨어져
    // 화면이 비지 않는다(실측) — 그것도 게이트가 거절하지만, 티켓이 말한 "빈 화면"은 이쪽이다.
    // 고정 시간을 기다리는 게이트라면 이 화면을 훑고 "넘침 없음"으로 통과했을 자리다.
    const dir = extension((d) =>
      injectBeforeApp(
        d,
        `chrome.storage.local.get = async () => { throw new Error('hk-test: storage unavailable'); };`,
      ),
    );
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL overflow-gate:/m);
    expect(r.out).toMatch(/준비 표지가/);
    expect(r.out).toMatch(/렌더된 행=0\//);
    expect(r.code).toBe(1);
  }, 120_000);

  it('지연 로드가 끝나지 않으면 훑지 않고 FAIL이다 — 정적 fallback은 같은 모양을 그린다', () => {
    // 지연 청크를 **끝나지 않는 모듈**로 바꾼다(최상위 await). import가 실패하는 것과 다르다:
    // 실패하면 목록이 통째로 사라지지만(그건 빈 화면 케이스다), 매달리면 Suspense가 정적
    // fallback에 머물러 **행은 전부 그려진 채** 지연 목록만 없다. 개수만 세는 준비 표지였다면
    // 통과했을 자리다.
    const dir = extension((d) => {
      const chunks = join(d, 'chunks');
      for (const f of readdirSync(chunks)) {
        if (f.startsWith('sortable-profile-list-')) {
          writeFileSync(join(chunks, f), 'await new Promise(() => {});\nexport default null;\n');
        }
      }
    });
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL overflow-gate:/m);
    expect(r.out).toMatch(/지연 목록=아직 정적 fallback/);
    // 행은 다 그려졌다는 것까지 확인한다 — 이 케이스가 "빈 화면"과 다른 자리가 그것이다.
    expect(r.out).toMatch(/렌더된 행=14\/14/);
    expect(r.code).toBe(1);
  }, 120_000);

  it('폰트가 등록되지 않았으면 훑지 않고 FAIL이다 — check()만 봤다면 통과했을 자리다', () => {
    // `document.fonts.check()`는 그 패밀리가 **아예 없을 때도 참**이다(실측). 그 상태로 훑으면
    // 폴백 글자 폭으로 재면서 "폰트 확인"을 찍는다 — 검사하지 않으면서 초록이다.
    const dir = extension((d) => neutralizeCss(d, /@font-face\{[^}]*\}/g, ''));
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL overflow-gate:/m);
    expect(r.out).toMatch(/face=0개/);
    expect(r.code).toBe(1);
  }, 120_000);

  it('산출물이 없으면 브라우저를 띄우기 전에 FAIL이고 사유가 경로를 말한다', () => {
    const r = runChild('node', [GATE, '--artifacts', join(tmpdir(), 'hk-no-such-build')], { cwd: REPO });
    expect(r.out).toMatch(/^FAIL overflow-gate:/m);
    expect(r.out).toContain('hk-no-such-build');
    expect(r.code).toBe(1);
  });
});
