/**
 * 산출물 소비 게이트의 공통 인자 계약: `--artifacts <디렉터리>` 하나뿐이다.
 *
 * 셋(bundle-gate·writer-lane-gate·smoke)이 같은 계약을 가져야 러너가 한 모양으로
 * 넘길 수 있다. 알 수 없는 인자는 거절한다 — 오타(`--artifact`)가 조용히 기본
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
    const v = argv[i + 1];
    if (v === undefined || v.trim() === '' || v.startsWith('-')) {
      return { error: `--artifacts에 디렉터리가 없다 (받은 값: ${v === undefined ? '없음' : `"${v}"`})` };
    }
    dir = v;
    i += 1;
  }
  return { dir: dir ?? fallback };
}
