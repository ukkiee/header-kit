/**
 * 산출물 소비 게이트의 공통 인자 계약: `--artifacts <디렉터리>` 하나뿐이다.
 *
 * 산출물을 읽는 게이트가 모두 같은 계약을 가져야 러너가 한 모양으로 넘길 수 있다
 * (누가 그 집합인지는 `scripts/gates.txt`의 `needs: build` 행이 정한다 — 여기에 이름을
 * 세어 두면 게이트가 하나 늘 때마다 이 문장이 조용히 낡는다). 알 수 없는 인자는 거절한다 — 오타(`--artifact`)가 조용히 기본
 * 경로를 재게 두면, 러너가 넘긴 회차 경로가 사라지고 낡은 산출물이 판정에 들어온다.
 *
 * 성공: `{ dir }` — 인자가 없으면 fallback. 손으로 돌리던 방식이 깨지지 않는다.
 * 실패: `{ error }` — 부르는 쪽이 자기 게이트 id로 FAIL 줄을 찍는다.
 */
export function artifactsDirFrom(argv, fallback) {
  let dir = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a !== '--artifacts') {
      return { error: `알 수 없는 인자: ${a} — 받는 것은 --artifacts <디렉터리> 뿐이다` };
    }
    if (dir !== null) {
      return { error: '--artifacts가 두 번 왔다 — 어느 쪽을 재라는 것인지 판정할 수 없다' };
    }
    const v = argv[i + 1];
    if (v === undefined || v.trim() === '' || v.startsWith('-')) {
      return { error: `--artifacts에 디렉터리가 없다 (받은 값: ${v === undefined ? '없음' : `"${v}"`})` };
    }
    dir = v;
    i += 1;
  }
  return { dir: dir ?? fallback };
}

/** 판정 발화의 공통 모양: `FAIL <id>: <사유>` 한 줄 + 종료 코드 1 — 러너의 verdict: token 계약. */
export const tokenFail = (id) => (message) => {
  console.error(`FAIL ${id}: ${message}`);
  process.exit(1);
};

/**
 * 산출물 부재의 공통 사유. 러너 경유(회차 빌드가 안 만들어짐)와 손 실행(빌드를 안 돌림)
 * 어느 쪽 독자에게도 다음 걸음을 준다 — 셋이 제각기 들고 있으면 곧 서로 어긋난다.
 */
export const missingArtifacts = (path) =>
  `빌드 산출물이 없다: ${path} — 러너가 이 회차의 빌드를 만들지 못했거나, ` +
  `직접 돌렸다면 먼저 \`bun run build\`를 실행하세요.`;

/**
 * 사유에 싣는 산출물 원문은 **한 줄로 접고** 길이를 자른다. 원문의 개행이 그대로 나가면
 * 판정을 두 번 말하는 출력이 되고(러너는 첫 매치를 읽는다), 사유는 무엇이 틀렸는지 가리키는
 * 자리이지 산출물을 옮겨 적는 자리가 아니다.
 *
 * 위 둘과 같은 이유로 여기 산다: 산출물을 읽는 게이트가 제각기 들고 있으면 곧 어긋난다.
 */
export const oneLine = (value) => {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  const flat = String(s).replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat;
};
