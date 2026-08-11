// 린트 설정이 **실제로 거절하는지** 잰다. 설정 파일을 읽어 쌍을 세는 방식은 쓰지 않는다 —
// 그것은 표가 완전한지만 보고 표가 실제로 무는지는 보지 못한다. 대신 픽스처 트리를 만들고
// `oxlint`를 자식 프로세스로 띄워 **무엇이 보고되는가**만 단언한다.
//
// 어떤 스위치가 빠지면 무엇이 조용히 통과하는지는 `docs/agents/verification.md`의
// "`lint`가 재는 것과 재지 않는 것"이 표로 갖는다. 여기 픽스처가 그 표의 각 행을 문다.
import { copyFileSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO, runChild, tempDirs } from './test-support.mjs';
const OXLINT = join(REPO, 'node_modules', '.bin', 'oxlint');
/**
 * 픽스처는 저장소 **밖**에 만들고 `node_modules`만 심링크로 이어 준다. 세 제약이 이 모양을
 * 강제한다(전부 실측):
 *   - 저장소 안에 두면 저장소 린트가 **일부러 위반하는 코드**를 훑어 게이트가 자기 픽스처에
 *     걸린다. 그것을 피하려고 `.gitignore`에 넣거나 점으로 시작하는 이름을 쓰면, 이번엔
 *     oxlint가 그 트리를 아예 보지 않는다("No files found to lint", `--no-ignore`로도 같다).
 *   - `options.typeAware`는 **루트 설정에서만** 허용된다 — 저장소 설정을 하위 디렉터리에
 *     복사해 넣는 방식은 오류로 거절된다. 픽스처 트리의 루트가 되어야 통한다.
 *   - tsgolint는 cwd에서 위로 올라가며 `node_modules`를 찾는다 — 심링크가 그 길을 준다.
 */
const FIXTURE_ROOT = tmpdir();

/** 층 순서. 뒤가 앞을 import하고 그 반대는 없다 — 이 배열이 기대값의 단일 출처다. */
const LAYERS = ['core', 'runtime', 'platform', 'ui', 'features', 'app', 'entrypoints'];

const track = tempDirs();

/**
 * 픽스처 트리 하나. **저장소의 설정 파일을 그대로 복사한다** — 손으로 옮겨 적으면 재는 것이
 * 저장소의 설정이 아니라 테스트가 지어낸 설정이 된다. 중첩 설정은 상위를 상속하지 않고
 * 완전히 대체하므로(실측), 이 복사본이 이 트리에 적용되는 설정의 전부다.
 */
function fixture(files) {
  const dir = track(mkdtempSync(join(FIXTURE_ROOT, 'hk-lint-')));
  copyFileSync(join(REPO, '.oxlintrc.json'), join(dir, '.oxlintrc.json'));
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'dir');
  // 별칭 해석은 tsconfig의 paths에 달려 있다 — 없으면 `import/no-cycle`이 `@/` import를
  // 조용히 무시하고, type-aware는 픽스처를 타입 프로그램에 넣지 못한다.
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        skipLibCheck: true,
        paths: { '@/*': ['./src/*'] },
      },
      include: ['src/**/*.ts'],
    }),
  );
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

/**
 * 진단만 돌려준다. 규칙은 `<플러그인>/<규칙>`으로 적는다 — 플러그인을 떼면 어느 규칙이
 * 물었는지가 이름만으로 갈리지 않는다(`import/no-cycle` vs 다른 플러그인의 같은 이름).
 *
 * **형식을 `-f json`으로 못박는다.** 기본 형식은 환경에 따라 달라진다(실측: macOS에서는
 * `파일:줄:열: error 규칙(이름)` 한 줄, 리눅스 컨테이너에서는 여러 줄짜리 그래픽 출력).
 * 사람이 읽는 형식을 정규식으로 긁던 이전 방식은 그래픽 출력에서 **한 줄도 매치하지 않아
 * 진단이 0건으로 접혔고**, "진단이 있어야 한다"는 케이스 열 개가 CI에서 통째로 빨강이 됐다.
 * 더 나쁜 방향도 같은 문에 있었다: 형식이 바뀌면 "진단이 없어야 한다"는 케이스는 **영원히
 * 초록**이라 규칙이 꺼져도 아무도 모른다. `a11y-gate`가 이미 `-f json`을 쓰는 이유가 같다.
 *
 * 파싱이 깨지면 조용히 0건으로 접지 않고 **던진다.** 우리가 방금 겪은 실패 모양이 침묵이었다.
 */
function lint(dir) {
  const { code, out, stdout } = runChild(OXLINT, ['-f', 'json', 'src'], { cwd: dir });
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    throw new Error(`oxlint의 JSON을 읽을 수 없다 (exit ${code}) — 출력 전문:\n${out}`);
  }
  const rows = (report.diagnostics ?? []).map((d) => {
    const m = /^(\w+)\(([a-z-]+)\)$/.exec(d.code ?? '');
    return {
      file: (d.filename ?? '').replaceAll('\\', '/'),
      rule: m === null ? (d.code ?? '') : `${m[1]}/${m[2]}`,
    };
  });
  return { code, out, rows };
}

describe('레이어 방향 — 상향만 거절된다', () => {
  it('42쌍 트리에서 상향 21쌍이 전부 보고되고 하향은 하나도 보고되지 않는다', () => {
    // 층마다 다른 여섯 층을 각각 import하는 파일을 하나씩 둔다. 한 번만 돌려 **무엇이
    // 보고되는가**를 통째로 본다 — 설정에서 한 줄이 빠지면 그 쌍이 목록에서 사라져 빨강이다.
    const files = {};
    for (const layer of LAYERS) {
      files[`src/${layer}/mod.ts`] = `export const ${layer} = '${layer}';\n`;
      for (const other of LAYERS) {
        if (other === layer) continue;
        files[`src/${layer}/from_${other}.ts`] =
          `import { ${other} } from '@/${other}/mod';\nexport const used = ${other};\n`;
      }
    }
    const { rows } = lint(fixture(files));

    const reported = new Set(
      rows
        .filter((r) => r.rule === 'eslint/no-restricted-imports')
        .map((r) => r.file.replace(/^.*\/src\//, 'src/')),
    );
    const upward = [];
    const downward = [];
    for (const [i, layer] of LAYERS.entries()) {
      for (const [j, other] of LAYERS.entries()) {
        if (i === j) continue;
        (j > i ? upward : downward).push(`src/${layer}/from_${other}.ts`);
      }
    }
    expect(upward).toHaveLength(21);
    expect(downward).toHaveLength(21);
    // 빠진 쌍이 무엇인지 실패 메시지가 그대로 말하도록 정렬된 배열로 비교한다.
    const byPath = (a, b) => a.localeCompare(b);
    expect([...reported].sort(byPath)).toEqual([...upward].sort(byPath));
  });

  it('중첩 경로와 벗은 별칭도 거절된다 — 패턴을 하나만 적었다면 새어나갔을 자리다', () => {
    // `@/ui/*` 하나만 쓰면 이 둘이 통과한다(실측). 이 저장소는 `@/features/profiles/...` 꼴을
    // 실제로 쓰므로, 이 케이스가 없으면 상향 쌍의 상당수가 조용히 새어나간다.
    const { rows } = lint(
      fixture({
        'src/ui/deep/nested/mod.ts': 'export const deep = 1;\n',
        'src/ui/index.ts': 'export const bare = 1;\n',
        'src/core/from_deep.ts': "import { deep } from '@/ui/deep/nested/mod';\nexport const a = deep;\n",
        'src/core/from_bare.ts': "import { bare } from '@/ui';\nexport const b = bare;\n",
      }),
    );
    const restricted = rows.filter((r) => r.rule === 'eslint/no-restricted-imports').map((r) => r.file);
    expect(restricted.filter((f) => f.endsWith('from_deep.ts'))).toHaveLength(1);
    expect(restricted.filter((f) => f.endsWith('from_bare.ts'))).toHaveLength(1);
  });

  it('상대경로 상향도 거절된다 — 별칭만 막았다면 그대로 지나갔을 자리다', () => {
    // 실측: `@/` 패턴만 있을 때 `../platform/mod`도 `../../platform/mod`도 무보고였다.
    const { rows } = lint(
      fixture({
        'src/platform/mod.ts': 'export const p = 1;\n',
        'src/core/rel.ts': "import { p } from '../platform/mod';\nexport const a = p;\n",
        'src/core/deep/rel.ts': "import { p } from '../../platform/mod';\nexport const b = p;\n",
      }),
    );
    expect(rows.filter((r) => r.rule === 'eslint/no-restricted-imports')).toHaveLength(2);
  });

  it('다른 별칭 철자도 거절된다 — WXT는 같은 모듈에 네 가지 철자를 준다', () => {
    // `.wxt/tsconfig.json`이 `@`·`~`·`@@`·`~~`를 전부 정의한다. `@/`만 막으면 나머지 셋이
    // 컴파일되는 상향 import 경로로 남는다(실측).
    const { rows } = lint(
      fixture({
        'src/ui/mod.ts': 'export const ui = 1;\n',
        'src/core/tilde.ts': "import { ui } from '~/ui/mod';\nexport const a = ui;\n",
        'src/core/root.ts': "import { ui } from '@@/src/ui/mod';\nexport const b = ui;\n",
      }),
    );
    expect(rows.filter((r) => r.rule === 'eslint/no-restricted-imports')).toHaveLength(2);
  });

  it('테스트와 스토리 파일도 같은 규칙 아래 있다 — 예외를 두면 그 둘이 레이어를 영구히 뚫는다', () => {
    const { rows } = lint(
      fixture({
        'src/ui/mod.ts': 'export const ui = 1;\n',
        'src/core/thing.test.ts': "import { ui } from '@/ui/mod';\nexport const a = ui;\n",
        'src/core/thing.stories.tsx': "import { ui } from '@/ui/mod';\nexport const b = ui;\n",
      }),
    );
    expect(rows.filter((r) => r.rule === 'eslint/no-restricted-imports')).toHaveLength(2);
  });
});

describe('순환 import — 규칙이 실제로 돈다', () => {
  it('상대경로 2-모듈 순환이 FAIL이다', () => {
    const { code, rows } = lint(
      fixture({
        'src/core/a.ts': "import { b } from './b';\nexport const a = b;\n",
        'src/core/b.ts': "import { a } from './a';\nexport const b = a;\n",
      }),
    );
    expect(rows.filter((r) => r.rule === 'import/no-cycle').length).toBeGreaterThan(0);
    expect(code).toBe(1);
  });

  it('별칭(@/)을 지나는 순환도 FAIL이다 — tsconfig paths 해석에 기대는 자리다', () => {
    // 별칭을 못 따라가면 이 저장소에서는 사실상 아무것도 못 잡으면서 초록이 된다(실측:
    // tsconfig를 못 찾으면 경고 없이 조용히 넘어간다).
    const { code, rows } = lint(
      fixture({
        'src/core/a.ts': "import { b } from '@/core/b';\nexport const a = b;\n",
        'src/core/b.ts': "import { a } from '@/core/a';\nexport const b = a;\n",
      }),
    );
    expect(rows.filter((r) => r.rule === 'import/no-cycle').length).toBeGreaterThan(0);
    expect(code).toBe(1);
  });

  it('타입 전용 순환도 FAIL이다 — ignoreTypes 기본값(true)이었다면 통과했을 자리다', () => {
    // 이 저장소는 verbatimModuleSyntax를 켜서 층간 타입 참조가 전부 `import type`이다.
    // 기본값을 그대로 뒀다면 이 케이스가 통과하고, 그러면 규칙이 사실상 아무것도 안 잡는다.
    const { code, rows } = lint(
      fixture({
        'src/core/a.ts': "import type { B } from './b';\nexport type A = { b?: B };\n",
        'src/core/b.ts': "import type { A } from './a';\nexport type B = { a?: A };\n",
      }),
    );
    expect(rows.filter((r) => r.rule === 'import/no-cycle').length).toBeGreaterThan(0);
    expect(code).toBe(1);
  });

  it('자기 자신 import가 FAIL이다 — no-cycle은 이것을 잡지 못한다', () => {
    const { code, rows } = lint(
      fixture({
        'src/core/self.ts': "import { x } from './self';\nexport const x = 1;\nexport const y = x;\n",
      }),
    );
    expect(rows.filter((r) => r.rule === 'import/no-self-import').length).toBeGreaterThan(0);
    expect(code).toBe(1);
  });

  it('순환이 없으면 통과한다 — 규칙이 아무 import에나 걸리는 것이 아니다', () => {
    const { code, rows } = lint(
      fixture({
        'src/core/a.ts': "import { b } from './b';\nexport const a = b;\n",
        'src/core/b.ts': 'export const b = 1;\n',
      }),
    );
    expect(rows).toHaveLength(0);
    expect(code).toBe(0);
  });
});

describe('type-aware — 규칙이 목록에 있는 것과 도는 것은 다르다', () => {
  it('await되지 않은 프로미스가 FAIL이고, 사유가 그 규칙 이름을 말한다', () => {
    // **종료 코드만 보면 안 된다.** tsgolint가 없을 때도 exit 1이 나므로(실측), 그때는
    // 픽스처를 고쳐도 여전히 빨강이라 게이트로서 아무 의미가 없다. 규칙 이름이 출력에
    // 있는지까지 봐야 "type-aware가 실제로 돌았다"가 증명된다.
    const { code, rows, out } = lint(
      fixture({
        'src/floating.ts':
          "export async function work(): Promise<string> {\n  return 'x';\n}\nexport function caller(): void {\n  work();\n}\n",
      }),
    );
    expect(rows.some((r) => r.rule === 'typescript/no-floating-promises')).toBe(true);
    expect(out).not.toContain('Failed to find tsgolint');
    expect(code).toBe(1);
  });

  it('같은 코드를 await하면 통과한다 — 픽스처가 판정을 실제로 가른다', () => {
    const { code, rows } = lint(
      fixture({
        'src/floating.ts':
          "export async function work(): Promise<string> {\n  return 'x';\n}\nexport async function caller(): Promise<void> {\n  await work();\n}\n",
      }),
    );
    expect(rows).toHaveLength(0);
    expect(code).toBe(0);
  });
});
