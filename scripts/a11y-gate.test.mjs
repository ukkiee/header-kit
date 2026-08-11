// 접근성 지문 베이스라인을 잰다. 게이트를 자식 프로세스로 띄우고 종료 코드와 상태 줄만
// 단언한다.
//
// 네 케이스 중 둘은 **서로 반대 방향**이라 한쪽만으로는 다른 쪽을 잡지 못한다:
//   - 하나가 사라지고 다른 하나가 생겨 **총계가 같은** 경우 → FAIL (개수 베이스라인이었다면 통과)
//   - 위반 **앞의 줄만 바뀌어 위치가 밀린** 경우 → 통과 (줄·열을 지문에 넣었다면 실패)
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO, runChild, tempDirs } from './test-support.mjs';

const GATE = join(REPO, 'scripts', 'a11y-gate.mjs');
const track = tempDirs();

/** `autoFocus`는 `no-autofocus`를, `div`에 단 `onClick`은 `no-static-element-interactions`를 낸다. */
const AUTOFOCUS = (n) => `export const A${n} = () => <input autoFocus={true} placeholder='a${n}' />;\n`;
const STATIC_CLICK = `export const S = () => <div onClick={() => {}}>hi</div>;\n`;
/** `alt` 없는 이미지. 요소 단위 규칙이라 스팬이 `<img …>`로 시작한다 — 식별자 폴백 경로다. */
const IMG_NO_ALT = (name = 'src') =>
  `export const I = ({ ${name} }: { ${name}: string }) => <img src={${name}} />;\n`;

/** 게이트가 스스로 센 진단 수. 픽스처의 "총계가 같다"를 주석이 아니라 **측정**으로 만든다. */
const totalOf = (out) => Number(/진단 (\d+)건/.exec(out)?.[1] ?? -1);

/**
 * 픽스처 저장소 하나. 게이트는 cwd를 저장소로 보고 `node_modules/.bin/oxlint`와
 * `scripts/a11y-baseline.txt`를 그 아래에서 찾으므로, 둘을 갖춘 트리를 만든다.
 */
function fixture(files) {
  const dir = track(mkdtempSync(join(tmpdir(), 'hk-a11y-')));
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'dir');
  // 저장소와 같은 모양으로 둔다 — 이것이 없으면 게이트가 심링크한 node_modules까지 훑는다.
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

const run = (dir, args = []) => runChild('node', [GATE, ...args], { cwd: dir });
const baselineOf = (dir) => readFileSync(join(dir, 'scripts', 'a11y-baseline.txt'), 'utf8');

/** 베이스라인을 그 트리의 지금 상태로 뜬다 — 취득 자체가 통과 경로다. */
function seeded(files) {
  const dir = fixture(files);
  const r = run(dir, ['--update']);
  expect(r.out).toMatch(/^PASS a11y-gate:/m);
  return dir;
}

describe('a11y 지문 베이스라인', () => {
  it('베이스라인을 뜬 직후에는 통과한다', () => {
    const dir = seeded({ 'src/a.tsx': AUTOFOCUS(1) });
    const r = run(dir);
    expect(r.out).toMatch(/^PASS a11y-gate:/m);
    expect(r.code).toBe(0);
  });

  it('지문에 줄·열이 없다', () => {
    const dir = seeded({ 'src/a.tsx': AUTOFOCUS(1) });
    // 있으면 포맷 커밋 하나가 모든 지문을 무효화한다.
    expect(baselineOf(dir)).not.toMatch(/:\d+:\d+/);
    expect(baselineOf(dir)).toContain('autoFocus');
  });

  it('새 지문이 하나라도 나타나면 FAIL이다', () => {
    const dir = seeded({ 'src/a.tsx': AUTOFOCUS(1) });
    writeFileSync(join(dir, 'src', 'b.tsx'), STATIC_CLICK);
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL a11y-gate:/m);
    expect(r.out).toContain('no-static-element-interactions');
    expect(r.code).toBe(1);
  });

  it('같은 지문의 개수가 늘어도 FAIL이다 — 구분 불가능한 진단은 개수까지가 지문이다', () => {
    const dir = seeded({ 'src/a.tsx': AUTOFOCUS(1) });
    writeFileSync(join(dir, 'src', 'a.tsx'), `${AUTOFOCUS(1)}${AUTOFOCUS(2)}`);
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL a11y-gate:/m);
    expect(r.out).toMatch(/늘어남/);
    expect(r.code).toBe(1);
  });

  it('기존 지문이 사라지면 통과하고, 무엇이 사라졌는지 말한다', () => {
    const dir = seeded({ 'src/a.tsx': AUTOFOCUS(1), 'src/b.tsx': STATIC_CLICK });
    writeFileSync(join(dir, 'src', 'b.tsx'), 'export const S = () => <button>hi</button>;\n');
    const r = run(dir);
    expect(r.out).toMatch(/^PASS a11y-gate:/m);
    expect(r.out).toMatch(/사라짐/);
    expect(r.code).toBe(0);
  });

  it('사라진 지문은 --update로 베이스라인에서 지워진다', () => {
    const dir = seeded({ 'src/a.tsx': AUTOFOCUS(1), 'src/b.tsx': STATIC_CLICK });
    writeFileSync(join(dir, 'src', 'b.tsx'), 'export const S = () => <button>hi</button>;\n');
    expect(baselineOf(dir)).toContain('no-static-element-interactions');
    expect(run(dir, ['--update']).out).toMatch(/^PASS a11y-gate:/m);
    expect(baselineOf(dir)).not.toContain('no-static-element-interactions');
    // 좁혀진 뒤에는 같은 위반이 다시 들어오면 FAIL이다 — 그것이 지우는 이유다.
    writeFileSync(join(dir, 'src', 'b.tsx'), STATIC_CLICK);
    expect(run(dir).out).toMatch(/^FAIL a11y-gate:/m);
  });

  it('하나가 사라지고 다른 하나가 생겨 총계가 같아도 FAIL이다 — 개수 베이스라인이었다면 통과했을 자리다', () => {
    // 한 규칙당 진단 **하나씩** 나는 짝을 쓴다. `<div onClick>` 은 규칙 둘(click-events·
    // static-element)을 한꺼번에 내서 총계가 조용히 어긋난다 — 앞선 판이 그 픽스처를 썼고,
    // 총계가 2가 아니라 3 → 4였다. 그래서 이 케이스는 아무것도 가르지 못했다(리뷰 실측).
    const before = { 'src/a.tsx': AUTOFOCUS(1), 'src/b.tsx': IMG_NO_ALT() };
    const after = {
      'src/a.tsx': 'export const A1 = () => <input placeholder="a1" />;\n',
      'src/b.tsx': IMG_NO_ALT(),
      'src/c.tsx': IMG_NO_ALT(),
    };

    // **전제를 측정한다**: 두 상태의 진단 총계가 정말 같아야 이 케이스가 개수 베이스라인과
    // 지문 베이스라인을 가른다. 주석으로만 두면 픽스처가 조용히 무효가 된다.
    const beforeTotal = totalOf(run(seeded(before), ['--update']).out);
    const afterTotal = totalOf(run(seeded(after), ['--update']).out);
    expect(beforeTotal).toBe(afterTotal);
    expect(beforeTotal).toBeGreaterThan(0);

    const dir = seeded(before);
    for (const [name, body] of Object.entries(after)) writeFileSync(join(dir, name), body);
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL a11y-gate:/m);
    expect(r.code).toBe(1);
  });

  it('같은 파일·같은 규칙이라도 붙은 요소가 다르면 교체가 FAIL이다', () => {
    // 릴리스 r1 F2: 식별자가 속성 이름뿐이면 `규칙 | 파일 | autoFocus` 한 버킷으로 접혀,
    // 같은 파일에서 하나를 지우고 하나를 만드는 교체가 개수까지 그대로라 통과했다.
    const dir = seeded({ 'src/a.tsx': `export const A = () => <input autoFocus={true} />;\n` });
    writeFileSync(join(dir, 'src/a.tsx'), `export const A = () => <textarea autoFocus={true} />;\n`);
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL a11y-gate:/m);
    expect(r.code).toBe(1);
  });

  it('지문이 붙은 요소를 담는다 — 속성 이름만으로 접히지 않는다', () => {
    const dir = seeded({ 'src/a.tsx': `export const A = () => <input autoFocus={true} />;\n` });
    expect(baselineOf(dir)).toContain('input.autoFocus');
  });

  it('요소까지 같으면 구분하지 못한다 — 덤지 못하는 자리를 못 박는다', () => {
    // 위치를 빼기로 한 결정(D13a)의 대가다. 같은 파일·규칙·요소의 두 위반은 위치 없이는
    // 구분할 수 없고, 그래서 개수까지가 지문이다. 덤지 못하는 것을 덤은 척하지 않기 위해
    // 이 케이스를 **통과로** 못 박는다 — 조용히 바뀌면 그때 이 단언이 말해 준다.
    const dir = seeded({
      'src/a.tsx': `export const A = () => <input autoFocus={true} placeholder='a' />;\nexport const B = () => <input autoFocus={true} placeholder='b' />;\n`,
    });
    writeFileSync(
      join(dir, 'src/a.tsx'),
      `export const A = () => <input placeholder='a' />;\nexport const B = () => <input autoFocus={true} placeholder='b' />;\nexport const C = () => <input autoFocus={true} placeholder='c' />;\n`,
    );
    const r = run(dir);
    expect(r.out).toMatch(/^PASS a11y-gate:/m);
    expect(r.code).toBe(0);
  });

  it('요소 단위 규칙의 지문도 이름이다 — 표현식 안의 변수만 바꿔도 통과한다', () => {
    // 스팬이 `<img src={src} />`로 시작하는 규칙군. 접두를 잘라 쓰던 판에서는 변수 이름만
    // 바꿔도 FAIL이었고, 앞 40자가 같은 서로 다른 위반은 한 지문으로 접혀 **새 위반이 숨었다**.
    const dir = seeded({ 'src/a.tsx': IMG_NO_ALT('src') });
    writeFileSync(join(dir, 'src', 'a.tsx'), IMG_NO_ALT('imageSource'));
    const r = run(dir);
    expect(r.out).toMatch(/^PASS a11y-gate:/m);
    expect(r.code).toBe(0);
  });

  it('--update 직후 다시 돌리면 통과한다 — 뜬 지문과 읽은 지문이 같아야 한다', () => {
    // 지문을 잘라 쓰면 끝에 공백이 남고, 읽을 때 trim되어 방금 뜬 베이스라인이 즉시 빨강이
    // 된다 — `--update`로도 풀리지 않는 자리였다(리뷰 실측).
    const dir = seeded({ 'src/a.tsx': `${IMG_NO_ALT()}${AUTOFOCUS(1)}${STATIC_CLICK}` });
    const r = run(dir);
    expect(r.out).toMatch(/^PASS a11y-gate:/m);
    expect(r.out).not.toMatch(/사라짐|새 지문/);
    expect(r.code).toBe(0);
  });

  it('베이스라인에 같은 지문이 두 줄이면 거절한다 — 뒤가 앞을 덮어 허용치가 넓어진다', () => {
    const dir = seeded({ 'src/a.tsx': AUTOFOCUS(1) });
    const path = join(dir, 'scripts', 'a11y-baseline.txt');
    const line = readFileSync(path, 'utf8')
      .split('\n')
      .find((l) => l.trim() !== '' && !l.startsWith('#'));
    writeFileSync(path, `${readFileSync(path, 'utf8')}99 ${line.replace(/^\d+ /, '')}\n`);
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL a11y-gate:/m);
    expect(r.out).toMatch(/두 번/);
    expect(r.code).toBe(1);
  });

  it('아무것도 재지 못하면 통과하지 않는다 — 위반이 없는 것과 재지 못한 것은 다르다', () => {
    // 훑을 파일이 없으면 oxlint가 먼저 거절하고, 파일은 훑었는데 진단이 0이면 게이트가
    // 거절한다. 어느 경로든 **초록이 아니어야** 한다 — 규칙군이 조용히 꺼지면 그 뒤로는
    // 무엇을 넣어도 통과하기 때문이다.
    const dir = seeded({ 'src/a.tsx': AUTOFOCUS(1) });
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\nsrc/\nscripts/\n');
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL a11y-gate:/m);
    expect(r.code).toBe(1);
  });

  it('베이스라인이 통째로 사라져도 통과하지 않는다 — 다 고친 것과 도구가 꺼진 것을 구분할 수 없다', () => {
    const dir = seeded({ 'src/a.tsx': AUTOFOCUS(1), 'src/b.tsx': IMG_NO_ALT() });
    writeFileSync(join(dir, 'src', 'a.tsx'), 'export const A1 = () => <input placeholder="a1" />;\n');
    writeFileSync(join(dir, 'src', 'b.tsx'), 'export const I = () => <img src="x" alt="x" />;\n');
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL a11y-gate:/m);
    expect(r.out).toMatch(/전부/);
    expect(r.code).toBe(1);
    // 확인한 뒤에는 --update가 그 사실을 적고, 그 다음부터 통과한다.
    expect(run(dir, ['--update']).out).toMatch(/^PASS a11y-gate:/m);
    expect(run(dir).out).toMatch(/^PASS a11y-gate:/m);
  });

  it('위반 앞의 줄만 바뀌어 위치가 밀려도 통과한다 — 줄·열을 지문에 넣었다면 실패했을 자리다', () => {
    const dir = seeded({ 'src/a.tsx': AUTOFOCUS(1) });
    // 위반은 그대로 두고 앞에 주석과 빈 줄만 넣는다. 전면 포맷이 하는 일과 같은 종류다.
    writeFileSync(join(dir, 'src', 'a.tsx'), `// 앞줄이 늘었다\n\n\n${AUTOFOCUS(1)}`);
    const r = run(dir);
    expect(r.out).toMatch(/^PASS a11y-gate:/m);
    expect(r.code).toBe(0);
  });

  it('베이스라인이 없으면 FAIL이고 무엇을 하라는지 말한다', () => {
    const dir = fixture({ 'src/a.tsx': AUTOFOCUS(1) });
    const r = run(dir);
    expect(r.out).toMatch(/^FAIL a11y-gate:/m);
    expect(r.out).toMatch(/--update/);
    expect(r.code).toBe(1);
  });

  it('알 수 없는 인자를 거절한다', () => {
    const dir = seeded({ 'src/a.tsx': AUTOFOCUS(1) });
    const r = run(dir, ['--refresh']);
    expect(r.out).toMatch(/^FAIL a11y-gate:/m);
    expect(r.code).toBe(1);
  });
});
