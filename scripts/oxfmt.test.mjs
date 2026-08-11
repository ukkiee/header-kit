// 포맷 게이트와 **재현 증명**을 잰다. 둘 다 자식 프로세스로 띄우고 종료 코드와 상태 줄만
// 단언한다.
//
// 재현 증명은 이 저장소에서 유일하게 "커밋이 무엇을 담았는가"를 재는 검사다. 그래서 증명
// 자체가 판정을 **가르는지**를 픽스처로 확인한다 — 의미 있는 한 줄을 섞은 커밋이 통과하면
// 이 증명은 `git show --stat`과 같은 값을 가진다.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO, runChild, tempDirs } from './test-support.mjs';

const OXFMT = join(REPO, 'node_modules', '.bin', 'oxfmt');
const PROOF = join(REPO, 'scripts', 'format-proof.mjs');
/** 이 저장소가 고정한 버전. 증명이 "그 커밋이 고정한 바로 그 버전"을 요구하므로 픽스처도 같아야 한다. */
const PINNED = JSON.parse(
  execFileSync('node', ['-p', "JSON.stringify(require('./package.json'))"], {
    cwd: REPO,
    encoding: 'utf8',
  }),
).devDependencies.oxfmt;

const track = tempDirs();

/** 포매터가 손대지 않는 모양(이미 포맷됨)과 손대는 모양(어긋남). */
const FORMATTED = 'export const greet = (name: string): string => `hi ${name}`;\n';
const MISFORMATTED = 'export  const greet=(name:string):string=>`hi ${name}`\n';

function fixtureDir(prefix) {
  const dir = track(mkdtempSync(join(tmpdir(), prefix)));
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'dir');
  // 끝 개행까지 맞춰 둔다 — 픽스처 자신이 어긋나 있으면 `--check .`가 그것을 잡아
  // 무엇을 재고 있는지가 흐려진다(실측으로 그렇게 됐다).
  writeFileSync(
    join(dir, '.oxfmtrc.json'),
    `${JSON.stringify({ printWidth: 110, singleQuote: true }, null, 2)}\n`,
  );
  return dir;
}

describe('format 게이트 — 어긋난 파일이 종료 코드 1을 낸다', () => {
  it('이미 포맷된 파일은 통과한다', () => {
    const dir = fixtureDir('hk-fmt-ok-');
    writeFileSync(join(dir, 'a.ts'), FORMATTED);
    const r = runChild(OXFMT, ['--check', '.'], { cwd: dir });
    expect(r.code).toBe(0);
  });

  it('어긋난 파일은 종료 코드 1이고 그 파일을 지목한다', () => {
    const dir = fixtureDir('hk-fmt-bad-');
    writeFileSync(join(dir, 'a.ts'), MISFORMATTED);
    const r = runChild(OXFMT, ['--check', '.'], { cwd: dir });
    expect(r.code).toBe(1);
    expect(r.out).toContain('a.ts');
  });
});

/**
 * 커밋 둘짜리 저장소를 만든다: 부모는 설정과 어긋난 코드, 자식은 포맷을 적용한 상태.
 * `extra`가 있으면 자식 커밋에 그 파일도 함께 담는다 — 포맷 말고 다른 것이 섞인 경우다.
 */
function repoWithFormatCommit({ pin = PINNED, extra = null } = {}) {
  const dir = fixtureDir('hk-proof-');
  const run = (args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  run(['init', '-q']);
  run(['config', 'user.email', 't@example.com']);
  run(['config', 'user.name', 'T']);
  // 부모: 설정·핀·어긋난 코드. (설정 커밋과 포맷 커밋을 가른 이 저장소의 모양 그대로다.)
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ devDependencies: { oxfmt: pin } }, null, 2)}\n`,
  );
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'a.ts'), MISFORMATTED);
  run(['add', '-A', '-f']);
  run(['commit', '-q', '-m', 'setup']);
  // 자식: 포매터를 돌린 결과만 담는다.
  execFileSync(OXFMT, ['.'], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
  if (extra) writeFileSync(join(dir, extra.path), extra.body);
  run(['add', '-A', '-f']);
  run(['commit', '-q', '-m', 'format']);
  return dir;
}

describe('재현 증명 — 포맷 커밋이 포맷만 담았는가', () => {
  it('포맷만 담은 커밋은 통과하고 트리 해시를 말한다', () => {
    const dir = repoWithFormatCommit();
    const r = runChild('node', [PROOF, '--commit', 'HEAD'], { cwd: dir });
    expect(r.out).toMatch(/^PASS format-proof:/m);
    expect(r.out).toMatch(/트리 [0-9a-f]{40}/);
    expect(r.code).toBe(0);
  });

  it('의미 있는 수정 한 줄이 섞이면 FAIL이다 — 이것이 없으면 증명은 git show --stat과 같다', () => {
    // 포맷 커밋 안에 새 로직 한 줄. 경로와 줄 수만 보는 증거라면 그대로 통과했을 자리다.
    const dir = repoWithFormatCommit({
      extra: { path: join('src', 'sneak.ts'), body: 'export const backdoor = (): boolean => true;\n' },
    });
    const r = runChild('node', [PROOF, '--commit', 'HEAD'], { cwd: dir });
    expect(r.out).toMatch(/^FAIL format-proof:/m);
    expect(r.code).toBe(1);
  });

  it('기존 파일을 한 줄 고쳐 섞어도 FAIL이다 — 새 파일만 잡는 것이 아니다', () => {
    const dir = fixtureDir('hk-proof-edit-');
    const run = (args) =>
      execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    run(['init', '-q']);
    run(['config', 'user.email', 't@example.com']);
    run(['config', 'user.name', 'T']);
    writeFileSync(
      join(dir, 'package.json'),
      `${JSON.stringify({ devDependencies: { oxfmt: PINNED } }, null, 2)}\n`,
    );
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'a.ts'), MISFORMATTED);
    run(['add', '-A', '-f']);
    run(['commit', '-q', '-m', 'setup']);
    execFileSync(OXFMT, ['.'], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
    // 포맷된 파일에 의미 한 줄을 덧댄다.
    writeFileSync(join(dir, 'src', 'a.ts'), `${FORMATTED}export const sneaked = 1;\n`);
    run(['add', '-A', '-f']);
    run(['commit', '-q', '-m', 'format']);

    const r = runChild('node', [PROOF, '--commit', 'HEAD'], { cwd: dir });
    expect(r.out).toMatch(/^FAIL format-proof:/m);
    expect(r.code).toBe(1);
  });

  it('버전이 범위 표기면 거절한다 — 범위로는 재현이 성립하지 않는다', () => {
    const dir = repoWithFormatCommit({ pin: `^${PINNED}` });
    const r = runChild('node', [PROOF, '--commit', 'HEAD'], { cwd: dir });
    expect(r.out).toMatch(/^FAIL format-proof:/m);
    expect(r.out).toMatch(/고정/);
    expect(r.code).toBe(1);
  });

  it('설치된 포매터가 커밋이 고정한 버전과 다르면 거절한다', () => {
    const dir = repoWithFormatCommit({ pin: '0.0.1' });
    const r = runChild('node', [PROOF, '--commit', 'HEAD'], { cwd: dir });
    expect(r.out).toMatch(/^FAIL format-proof:/m);
    expect(r.out).toMatch(/0\.0\.1/);
    expect(r.code).toBe(1);
  });

  it('알 수 없는 인자를 거절한다', () => {
    const r = runChild('node', [PROOF, '--commits', 'HEAD'], { cwd: REPO });
    expect(r.out).toMatch(/^FAIL format-proof:/m);
    expect(r.code).toBe(1);
  });
});
