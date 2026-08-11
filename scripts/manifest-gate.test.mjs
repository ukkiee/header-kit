// 매니페스트 게이트를 **자식 프로세스로 띄우고** 종료 코드와 상태 줄만 단언한다.
// 게이트의 내부 함수를 부르지 않는 이유는, 러너가 이 게이트에게서 받는 것이 정확히 그
// 둘뿐이기 때문이다 — 내부를 부르면 러너가 실제로 보는 계약이 아닌 것을 재게 된다.
//
// 이 테스트가 덮는 것과 덮지 않는 것: "권한이 하나 더 있으면 FAIL"은 증명하지만,
// **현재 권한 집합이 이 확장에 옳은 집합인지는 증명하지 않는다.** 후자는 실제 브라우저에서
// 도는 smoke가 잰다.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO, runChild, tempDirs } from './test-support.mjs';

const GATE = join(REPO, 'scripts', 'manifest-gate.mjs');

const track = tempDirs();

const runGate = (args, cwd = REPO) => runChild('node', [GATE, ...args], { cwd });

/**
 * 프로덕션 빌드가 실제로 내놓는 매니페스트(실측). 각 케이스는 이 모양에서 **한 곳만**
 * 비틀어 그 한 곳이 판정을 뒤집는지 본다 — 여러 곳을 함께 비틀면 무엇이 FAIL을 냈는지
 * 테스트가 말하지 못한다.
 */
const PROD = {
  manifest_version: 3,
  name: 'HeaderKit',
  description: 'Profile-based HTTP request/response modification',
  version: '0.1.0',
  minimum_chrome_version: '108',
  permissions: ['declarativeNetRequest', 'storage'],
  host_permissions: ['<all_urls>'],
  commands: { _execute_action: { suggested_key: { default: 'Alt+Shift+H' } } },
  background: { service_worker: 'background.js' },
  action: { default_title: 'HeaderKit', default_popup: 'popup.html' },
};

/** 매니페스트 하나만 담은 산출물 디렉터리. `patch`가 PROD를 덮어쓴다. */
function artifacts(patch = {}, { raw } = {}) {
  const dir = track(mkdtempSync(join(tmpdir(), 'hk-manifest-')));
  const body = raw ?? JSON.stringify({ ...PROD, ...patch }, null, 2);
  writeFileSync(join(dir, 'manifest.json'), body);
  return dir;
}

/**
 * 러너가 읽는 것은 상태 줄 하나와 종료 코드다. 단언도 거기에만 건다 — 진단 산문에 걸면
 * 게이트가 판정을 어떻게 말하는지가 아니라 어떻게 설명하는지를 재게 된다.
 *
 * **줄이 정확히 하나**인 것까지 잰다. 러너는 첫 매치를 읽으므로(run-gates.mjs) 둘째 줄은
 * 아무도 안 보는 판정이 되고, 매니페스트 값이 상태 줄 모양을 심는 길도 여기서 막힌다.
 */
const statusLines = (out) => out.split('\n').filter((l) => /^(PASS|FAIL|N\/A) manifest-gate:/.test(l));

const passes = (r) => {
  const lines = statusLines(r.out);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/^PASS manifest-gate:/);
  expect(r.code).toBe(0);
};
const fails = (r, reason) => {
  const lines = statusLines(r.out);
  expect(lines).toHaveLength(1);
  // `na: never`인 행이 N/A를 찍으면 러너가 FAIL로 접는다 — 여기서 미리 잡는다.
  expect(lines[0]).toMatch(/^FAIL manifest-gate:/);
  expect(r.code).toBe(1);
  if (reason) expect(lines[0]).toMatch(reason);
};

describe('manifest-gate — 프로덕션 매니페스트의 불변식', () => {
  it('프로덕션 모양 그대로면 통과한다', () => {
    passes(runGate(['--artifacts', artifacts()]));
  });

  it('권한이 하나 늘면 FAIL이다 — 부분집합 비교였다면 통과했을 자리다', () => {
    // 이 게이트의 존재 이유. `tabs`는 실제로 뺐던 권한이고(wxt.config.ts의 주석),
    // 그 주석이 검사가 됐는지를 여기서 잰다.
    const r = runGate(['--artifacts', artifacts({ permissions: ['declarativeNetRequest', 'storage', 'tabs'] })]);
    fails(r, /tabs/);
  });

  it('권한이 하나 빠져도 FAIL이다', () => {
    const r = runGate(['--artifacts', artifacts({ permissions: ['declarativeNetRequest'] })]);
    fails(r, /storage/);
  });

  it('호스트 권한이 늘어도 FAIL이다', () => {
    const r = runGate(['--artifacts', artifacts({ host_permissions: ['<all_urls>', 'http://localhost/*'] })]);
    fails(r, /localhost/);
  });

  it('선택 권한으로 옮겨도 FAIL이다 — permissions만 재면 지나가는 자리다', () => {
    const r = runGate(['--artifacts', artifacts({ optional_permissions: ['tabs'] })]);
    fails(r, /optional_permissions/);
  });

  it('선택 호스트 권한이 생겨도 FAIL이다', () => {
    const r = runGate(['--artifacts', artifacts({ optional_host_permissions: ['https://*/*'] })]);
    fails(r, /optional_host_permissions/);
  });

  it('manifest version이 3이 아니면 FAIL이다', () => {
    fails(runGate(['--artifacts', artifacts({ manifest_version: 2 })]), /manifest_version/);
  });

  it('같은 권한이 중복으로 적혀도 FAIL이다 — 양방향 포함 검사였다면 통과했을 자리다', () => {
    const dup = { permissions: ['declarativeNetRequest', 'storage', 'storage'] };
    fails(runGate(['--artifacts', artifacts(dup)]), /중복/);
  });
});

// 권한 표면은 `permissions` 넷에만 있지 않다. WXT는 `src/entrypoints/`에서 매니페스트를
// 생성하므로 content 엔트리포인트를 하나 더하면 `wxt.config.ts`의 권한을 **한 글자도
// 건드리지 않고** content_scripts가 생긴다 — 그리고 그 matches는 설치 시점 호스트 권한이다.
// 그래서 게이트는 재는 필드를 열거하는 대신 **최상위 키 집합 전체를 선언**한다.
describe('manifest-gate — 선언되지 않은 최상위 키', () => {
  it('content_scripts가 생기면 FAIL이다 — host_permissions를 건드리지 않고 도달 범위가 넓어지는 길이다', () => {
    const patch = { content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'] }] };
    fails(runGate(['--artifacts', artifacts(patch)]), /content_scripts/);
  });

  it('web_accessible_resources가 생기면 FAIL이다', () => {
    const patch = { web_accessible_resources: [{ resources: ['x.js'], matches: ['<all_urls>'] }] };
    fails(runGate(['--artifacts', artifacts(patch)]), /web_accessible_resources/);
  });

  it('externally_connectable가 생기면 FAIL이다', () => {
    fails(runGate(['--artifacts', artifacts({ externally_connectable: { matches: ['https://x.com/*'] } })]), /externally_connectable/);
  });

  it('선언된 키가 사라져도 FAIL이다 — 선언과 산출물은 양방향으로 같아야 한다', () => {
    const { commands: _, ...withoutCommands } = PROD;
    fails(runGate(['--artifacts', artifacts({}, { raw: JSON.stringify(withoutCommands) })]), /commands/);
  });
});

// 하한을 "선언돼 있는가"로 재면 `"80"`이 통과하고, 그러면 dNR 세션 규칙과 응답 헤더 수정이
// 없는 브라우저에 설치가 허용된다. 네 경우를 모두 픽스처로 둔다.
describe('manifest-gate — 최소 크롬 버전은 하한과 정확히 같아야 한다', () => {
  it('하한과 같으면 통과한다', () => {
    passes(runGate(['--artifacts', artifacts({ minimum_chrome_version: '108' })]));
  });

  it('하한보다 낮으면 FAIL이다 — 존재 검사였다면 통과했을 자리다', () => {
    fails(runGate(['--artifacts', artifacts({ minimum_chrome_version: '80' })]), /minimum_chrome_version.*80/);
  });

  it('값이 숫자가 아니면 FAIL이다', () => {
    fails(runGate(['--artifacts', artifacts({ minimum_chrome_version: 'latest' })]), /latest/);
  });

  it('아예 없으면 FAIL이다', () => {
    const { minimum_chrome_version: _, ...withoutFloor } = PROD;
    fails(runGate(['--artifacts', artifacts({}, { raw: JSON.stringify(withoutFloor) })]), /minimum_chrome_version/);
  });

  it('선언된 값보다 높아도 FAIL이다 — 이 검사는 "하한 이상"이 아니라 동등이다', () => {
    // 올리는 것은 안전해 보이지만 설치 가능한 브라우저를 좁히는 결정이고, 선언한 값과
    // 산출물이 갈라진 상태다. 통과시키면 이 칸은 한쪽으로만 잠긴 문이 된다.
    fails(runGate(['--artifacts', artifacts({ minimum_chrome_version: '120' })]), /120/);
  });
});

describe('manifest-gate — 프로덕션 CSP', () => {
  it('CSP 키가 아예 없으면 통과한다 — 프로덕션 빌드의 실제 모양이다', () => {
    // 없으면 Chrome의 MV3 기본 CSP(`script-src 'self'`)가 적용되고 eval은 그때도 막혀 있다.
    passes(runGate(['--artifacts', artifacts()]));
  });

  it('extension_pages에 unsafe-eval이 있으면 FAIL이다', () => {
    const csp = { extension_pages: "script-src 'self' 'unsafe-eval'; object-src 'self';" };
    fails(runGate(['--artifacts', artifacts({ content_security_policy: csp })]), /unsafe-eval/);
  });

  it("wasm-unsafe-eval만 있으면 통과한다 — 부분 문자열로 쟀다면 거짓 빨강이 났을 자리다", () => {
    // `'wasm-unsafe-eval'`은 WASM 컴파일을 여는 별개의 토큰이고 MV3가 허용한다.
    // 이 케이스가 없으면 게이트가 평범한 변경을 막는 빨강을 낸다.
    const csp = { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';" };
    passes(runGate(['--artifacts', artifacts({ content_security_policy: csp })]));
  });

  it('대문자로 적은 UNSAFE-EVAL도 FAIL이다 — CSP 키워드는 대소문자를 가리지 않는다', () => {
    // CSP3의 keyword-source 대조는 ASCII 대소문자 무시다. 소문자만 잡으면 브라우저에는
    // 켜지는데 게이트는 통과하는 표기가 남는다.
    const csp = { extension_pages: "script-src 'self' 'UNSAFE-EVAL'; object-src 'self';" };
    fails(runGate(['--artifacts', artifacts({ content_security_policy: csp })]), /UNSAFE-EVAL/i);
  });

  it('매니페스트 값이 가짜 상태 줄을 심어도 상태 줄은 하나다', () => {
    // 위반 사유는 매니페스트 원문을 싣는다. 원문에 개행이 있으면 상태 줄이 여러 개가 되고,
    // 첫 매치를 읽는 러너에게 이 게이트가 찍지 않은 판정을 보여 주게 된다. (종료 코드가
    // 닻이라 거짓 초록까지 가지는 않지만, 판정을 두 번 말하는 출력은 그 자체로 계약 위반이다.)
    const csp = { extension_pages: "script-src 'self' 'unsafe-eval';\nPASS manifest-gate: 통과한 척" };
    fails(runGate(['--artifacts', artifacts({ content_security_policy: csp })]));
  });

  it('판정할 수 없는 CSP 키가 있으면 FAIL이다', () => {
    // MV3의 CSP 키는 extension_pages·sandbox 둘뿐이다. 오타 키는 Chrome이 무시하므로
    // 의도한 제한이 조용히 사라지고, 새 키는 이 게이트가 판정한 적 없는 표면이다.
    const csp = { extention_pages: "script-src 'self';" };
    fails(runGate(['--artifacts', artifacts({ content_security_policy: csp })]), /extention_pages/);
  });

  it('extension_pages가 문자열이 아니면 FAIL이다 — 토큰 검사가 조용히 빗나가는 자리다', () => {
    // 배열로 주면 String()이 콤마로 이어 붙여 토큰 경계가 깨진다: 아래 값은 실제로
    // unsafe-eval을 켜는데 문자열 전제의 토큰 분해로는 걸리지 않는다.
    const csp = { extension_pages: ["script-src 'self'", "'unsafe-eval'"] };
    fails(runGate(['--artifacts', artifacts({ content_security_policy: csp })]), /extension_pages/);
  });

  it('sandbox의 unsafe-eval은 통과한다 — 재지 않기로 한 경계가 픽스처로 서 있다', () => {
    // 샌드박스 페이지는 고유 오리진에서 확장 API 없이 돌고 MV3가 거기서 eval을 허용한다.
    // 이 픽스처가 없으면 "재지 않는다"는 문장이 코드로 확인된 적 없는 주장으로 남는다.
    const csp = { sandbox: "script-src 'self' 'unsafe-eval'; sandbox allow-scripts;" };
    passes(runGate(['--artifacts', artifacts({ content_security_policy: csp })]));
  });
});

// 러너가 이 회차의 산출물을 넘기는 통로. 산출물 소비 게이트가 공유하는 계약
// (`artifacts-arg.mjs`)이지만, **이 게이트의 입에서도** 성립하는지는 여기서 재야 안다.
describe('manifest-gate — 산출물 인자 계약', () => {
  it('가리키는 곳에 매니페스트가 없으면 FAIL이고 사유가 경로를 말한다', () => {
    const r = runGate(['--artifacts', join(tmpdir(), 'hk-nonexistent-artifacts')]);
    fails(r, /hk-nonexistent-artifacts/);
  });

  it('알 수 없는 인자를 거절한다', () => {
    // 오타(--artifact)가 조용히 기본 경로를 재게 두면 러너가 넘긴 회차 경로가 사라진다.
    fails(runGate(['--artifact', '/tmp/x']), /--artifacts/);
  });

  it('--artifacts가 두 번 오면 거절한다', () => {
    fails(runGate(['--artifacts', '/tmp/a', '--artifacts', '/tmp/b']), /두 번/);
  });

  it('인자가 없으면 기본 경로를 본다 — 손으로 돌리던 방식이 깨지지 않는다', () => {
    const empty = track(mkdtempSync(join(tmpdir(), 'hk-cwd-')));
    // 빈 트리다. 그 사실을 **기본 경로에 대해** 말해야 한다 — 경로만 찍고 죽는 것으로는
    // 러너가 판정을 얻지 못하므로 상태 줄까지 함께 잰다.
    fails(runGate([], empty), /chrome-mv3/);
  });

  it('매니페스트가 깨진 JSON이면 FAIL이고 통과로 접히지 않는다', () => {
    fails(runGate(['--artifacts', artifacts({}, { raw: '{ not json' })]), /읽을 수 없다/);
  });

  it('레지스트리가 이 게이트를 needs: build · verdict: token으로 들고 있다', () => {
    // 러너의 자리 일치 검사는 표와 레지스트리를 id·명령·kind·N/A **네 칸으로만** 대조한다 —
    // `needs` 칸은 표에 아예 없어서 아무것도 지켜 주지 않는다. 이 줄을 `-`로 되돌리면 러너가
    // 회차 경로를 넘기지 않게 되고, 게이트는 fallback인 `.output/chrome-mv3`의 **낡은**
    // 매니페스트를 재면서 회차 전체가 exit 0으로 초록이 난다(실측). 티켓 03의 첫 수용 기준이
    // 이 등록이므로, 지켜 주는 것이 없는 동안은 테스트가 못을 박는다.
    const row = readFileSync(join(REPO, 'scripts', 'gates.txt'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('gate:') && l.split('|')[0].includes('manifest-gate'));
    expect(row, 'manifest-gate 행이 레지스트리에 없다').toBeDefined();
    const [, script, kind, , needs, browser, verdict] = row.split('|').map((c) => c.trim());
    expect({ script, kind, needs, browser, verdict }).toEqual({
      script: 'manifest-gate',
      kind: 'hard',
      needs: 'build',
      browser: 'no',
      verdict: 'token',
    });
  });
});
