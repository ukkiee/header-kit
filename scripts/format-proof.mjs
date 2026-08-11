#!/usr/bin/env node
// 포맷 커밋이 **포맷만** 바꿨다는 것을 재현으로 증명한다.
//
// `git show --stat`은 증거가 되지 못한다 — 경로와 줄 수만 보여 주므로 대량 포맷 커밋 안에
// 숨은 로직 수정이 그것을 그대로 만족시킨다. 그리고 그 증거는 리뷰어에게 **건너뛰라고**
// 말하는 데 쓰이므로, 틀린 증거 중에서도 가장 나쁜 자리에 있다.
//
// 대신 이렇게 잰다:
//   1. 대상 커밋의 **부모** 트리를 빈 디렉터리에 꺼낸다.
//   2. 그 커밋이 고정한 **바로 그 버전**의 포매터를 그 위에 돌린다.
//   3. 결과 트리 해시가 대상 커밋의 트리 해시와 **정확히 같은지** 본다.
//
// 같으면 그 커밋은 포매터가 만든 것 이상을 담지 않았다. 다르면 무엇이 더 들어갔는지가
// diff로 나온다 — 그리고 이 스크립트는 그 diff를 찍는다.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LABEL = 'format-proof';
const fail = (message) => {
  console.error(`FAIL ${LABEL}: ${message}`);
  process.exitCode = 1;
};

/** 인자 하나뿐이다. 오타가 조용히 기본값을 재게 두면 무엇을 증명했는지가 호출 문면에서 사라진다. */
function parseArgs(argv) {
  let commit = 'HEAD';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--commit') return { error: `알 수 없는 인자: ${argv[i]} — 받는 것은 --commit <ref> 뿐이다` };
    const v = argv[i + 1];
    if (v === undefined || v.trim() === '' || v.startsWith('-')) {
      return { error: `--commit에 ref가 없다 (받은 값: ${v === undefined ? '없음' : `"${v}"`})` };
    }
    commit = v;
    i += 1;
  }
  return { commit };
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

const parsed = parseArgs(process.argv.slice(2));
if (parsed.error) {
  fail(parsed.error);
  process.exit(1);
}

const repo = process.cwd();
let target;
let parent;
try {
  target = git(['rev-parse', `${parsed.commit}^{commit}`], repo);
  parent = git(['rev-parse', `${parsed.commit}^`], repo);
} catch (e) {
  fail(`커밋을 찾을 수 없다: ${parsed.commit} — ${String(e.message).split('\n')[0]}`);
  process.exit(1);
}

/**
 * 포매터는 **그 커밋이 고정한 버전**이어야 한다. 지금 설치된 것이 다른 버전이면 이 증명은
 * 다른 도구로 잰 것이 되고, 그러면 통과해도 실패해도 아무것도 말해 주지 않는다.
 */
const pinned = JSON.parse(git(['show', `${target}:package.json`], repo)).devDependencies?.oxfmt;
if (!pinned) {
  fail(`대상 커밋의 package.json에 oxfmt가 없다 — 이 커밋은 포맷 커밋이 아니다`);
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+$/.test(pinned)) {
  fail(`oxfmt 버전이 정확히 고정돼 있지 않다: ${pinned} — 범위 표기로는 재현이 성립하지 않는다`);
  process.exit(1);
}
const bin = join(repo, 'node_modules', '.bin', 'oxfmt');
if (!existsSync(bin)) {
  fail(`포매터가 없다: ${bin} — 먼저 의존성을 설치하세요`);
  process.exit(1);
}
const installed = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim().replace(/^\D+/, '');
if (installed !== pinned) {
  fail(`설치된 포매터(${installed})가 커밋이 고정한 버전(${pinned})과 다르다`);
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'hk-format-proof-'));
try {
  // 부모 트리를 **작업 트리 없이** 꺼낸다 — 지금 체크아웃 상태나 미커밋 변경이 섞이지 않는다.
  execFileSync('sh', ['-c', `git -C ${JSON.stringify(repo)} archive ${parent} | tar -x -C ${JSON.stringify(work)}`], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  execFileSync(bin, ['.'], { cwd: work, stdio: ['ignore', 'ignore', 'pipe'] });

  // 트리 해시로 비교한다. `git add`는 `.gitignore`를 존중하므로 `-f`로 강제한다 — 커밋된
  // 파일이 무시 패턴에 걸리면 파일 집합이 달라져 비교가 거짓 실패를 낸다.
  git(['init', '-q'], work);
  git(['add', '-A', '-f'], work);
  const rebuilt = git(['write-tree'], work);
  const expected = git(['rev-parse', `${target}^{tree}`], repo);

  if (rebuilt === expected) {
    console.log(
      `PASS ${LABEL}: ${target.slice(0, 7)}은 oxfmt ${pinned}가 만든 것 이상을 담지 않았다 ` +
        `(부모 ${parent.slice(0, 7)}에 재현 → 트리 ${rebuilt})`,
    );
  } else {
    // 무엇이 더 들어갔는지 보여 준다 — 실패가 "다르다"에서 끝나면 고칠 자리를 찾지 못한다.
    let extra = '';
    try {
      extra = execFileSync(
        'sh',
        ['-c', `git -C ${JSON.stringify(repo)} diff --stat ${expected} ${rebuilt} 2>/dev/null | tail -20`],
        { encoding: 'utf8' },
      );
    } catch {
      extra = '(diff를 만들지 못했다 — 두 트리가 같은 저장소에 없다)';
    }
    console.error(extra);
    fail(
      `재현 결과가 커밋의 트리와 다르다: 재현 ${rebuilt} ≠ 커밋 ${expected} — ` +
        `이 커밋은 포맷 말고 다른 것도 담고 있다`,
    );
  }
} catch (e) {
  fail(`재현 중 실패했다: ${String(e.message).split('\n')[0]}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
