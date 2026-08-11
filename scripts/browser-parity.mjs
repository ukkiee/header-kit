/**
 * 브라우저를 띄우는 테스트의 분류를 **레지스트리에서 파생한다.**
 *
 * import를 세어 판정하지 않는다. 이 저장소의 seam은 게이트를 **자식 프로세스로** 띄우라고
 * 요구하므로, 규정을 지킨 테스트는 playwright를 import하지 않는다 — import를 세면 그 테스트가
 * 브라우저를 안 쓰는 것으로 보이고, 이름을 잘못 달면 브라우저 없는 CI가 크롬을 띄우려다
 * 죽는다. 오탐이 아니라 **미탐**이고, 하필 규정된 경로에서만 난다.
 *
 * 그래서 판정의 출처는 `scripts/gates.txt`의 `browser` 칸이다: `browser: yes`인 게이트의
 * 스크립트를 부르는 테스트 파일은 `*.browser.test.mjs`여야 한다. playwright를 직접 import하는
 * 파일도 마찬가지다(그쪽은 seam을 벗어난 경우이므로 함께 잡는다).
 */

export const BROWSER_SUFFIX = '.browser.test.mjs';

/** `browser: yes`인 게이트가 부르는 스크립트 파일 이름들. */
export function browserGateScripts(registryText, packageScripts) {
  const files = new Set();
  for (const raw of registryText.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('gate:')) continue;
    const [, script, , , , browser] = line
      .slice('gate:'.length)
      .split('|')
      .map((c) => c.trim());
    if (browser !== 'yes') continue;
    const command = packageScripts[script] ?? '';
    for (const m of command.matchAll(/scripts\/([\w.-]+\.mjs)/g)) files.add(m[1]);
  }
  return files;
}

/**
 * 어긋난 파일들. 각 항목은 `{ file, reason }`이다.
 *
 * `files`는 `{ 경로: 내용 }`이고 경로는 저장소 기준 상대경로다.
 */
/**
 * 주석을 걷어낸다. 주석에 스크립트 이름을 **적기만 해도** 위반이 되면, 그것을 푸는 유일한
 * 길이 파일 이름을 바꿔 CI 집합에서 빼는 것이 된다 — 평범한 것을 막는 빨강이다.
 */
const withoutComments = (text) => text.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

/** 이 검사 자신을 재는 파일. **정확한 경로**로 면제한다 — 이름 끝만 보면 `evil-browser-parity.test.mjs`나 다른 디렉터리의 같은 이름까지 함께 빠진다. */
const SELF = 'scripts/browser-parity.test.mjs';

export function parityViolations(files, browserScripts) {
  const violations = [];
  for (const [file, raw] of Object.entries(files)) {
    const named = file.endsWith(BROWSER_SUFFIX);
    // 자기 자신을 재는 파일은 픽스처로 그 이름들을 들고 있을 수밖에 없다.
    if (file === SELF) continue;
    const text = withoutComments(raw);

    const spawned = [...browserScripts].filter((script) => text.includes(script));
    if (spawned.length > 0 && !named) {
      violations.push({
        file,
        reason: `browser: yes인 게이트를 부른다(${spawned.join(', ')}) — 이름이 \`*${BROWSER_SUFFIX}\`여야 한다`,
      });
    }
    if (/from '(node:)?playwright'|require\('playwright'\)/.test(text) && !named) {
      violations.push({
        file,
        reason: `playwright를 직접 import한다 — 이름이 \`*${BROWSER_SUFFIX}\`여야 한다`,
      });
    }
  }
  return violations;
}
