# 커밋 신원 재작성 기록 (2026-07-24)

`rule-model-trim` 착지 직전에 저장소 **전 이력의 커밋 신원**을 재작성했다. 이 문서는 그
경위와, 그로 인해 끊긴 SHA 참조를 잇는 매핑을 남긴다.

## 왜

**첫 커밋부터 213개 전부**가 회사 신원으로 기록돼 있었다. 이 저장소는 개인 계정
(`github.com/ukkiee/header-kit`)의 것이므로 회사 계정이 contributor로 남으면 안 된다.

원인은 설정 부재가 **아니었다.** 개발 환경에는 이미 계정 분리가 구성돼 있다 —
`~/.gitconfig`의 `[includeIf "gitdir:~/personal/"]`가 `~/personal/` 하위 저장소에
`ukkiee <ukkiee90@gmail.com>`을 자동 적용하고, `[url "git@github-personal:"] insteadOf`가
SSH remote를 개인 키 alias로 치환한다. 그런데 이 저장소가 **`~/workspace/header-kit`에
있어 `gitdir:~/personal/` 패턴에 걸리지 않았고**, 그래서 글로벌(회사) 설정이 그대로 먹었다.
HTTPS remote도 한몫했다 — `insteadOf` 치환을 우회해 gh credential helper에 의존하게 되고,
그 활성 계정이 회사 계정으로 되돌아가 푸시 403이 반복됐다.

author 정보는 커밋 객체 안에 들어 있어서 새 저장소로 옮겨도 따라간다 — contributor에서
없애는 방법은 전 커밋의 author·committer 재작성뿐이다.

**재발 방지는 신원을 손으로 고정하는 게 아니라 위치와 프로토콜을 맞추는 것이다:** 개인
저장소는 `~/personal/` 아래에 두고 remote는 `git@github.com:...`(SSH)로 쓴다. 그러면
includeIf와 insteadOf가 신원·인증을 모두 자동 처리한다. `git config --local user.*`를
직접 넣으면 오히려 그 기전을 덮어써 가려 버린다.

## 무엇을

```
전:  이상욱 <sanguk.lee@imweb.me>   × 213 (author·committer)
후:  ukkiee <ukkiee90@gmail.com>    × 213 (author·committer)
```

- 재작성 도구: `git filter-branch --env-filter`, 대상 `-- --branches`
- **작성 시각(author/committer date)은 보존**했다 — 신원만 바꿨다.
- 재발 방지로 `.git/config`에 로컬 `user.name`/`user.email`을 고정했다.

## 내용이 안 바뀌었다는 증거

신원 재작성은 커밋 메타데이터만 건드리므로 트리(내용)는 그대로여야 한다. 실제로 그렇다:

| | 값 |
|---|---|
| 재작성 **전** `main^{tree}` | `f2f8c0dbdcb8bdb73b1b4e0dfd9ef3d0ee525310` |
| 재작성 **후** `main^{tree}` | `f2f8c0dbdcb8bdb73b1b4e0dfd9ef3d0ee525310` |
| 커밋 수 | 213 → 213 |

재작성 후 새 HEAD에서 전 스위트를 다시 돌렸고 7단계 전부 exit 0이다 —
`bun run check`(에러 0) · `test`(200/200) · `build` · `bundle-gate`(519.1KB PASS) ·
`smoke`(**105/105**, FAIL 0줄) · `storybook:build` · `ui-diag`(시작 지표 2항목 PASS).

## SHA 매핑 — 문서가 참조하는 지점

213개 SHA가 전부 바뀌었다. 이 피처의 문서·게이트 아티팩트가 이름으로 부르는 지점만 옮긴다:

| 문맥 | 재작성 전 | 재작성 후 |
|---|---|---|
| 브랜치 base (`main`) | `9d19d7a` | `cc2ea2c` |
| 티켓 01 시작점 (code-review 고정점) | `1768beb` | `b58b1b4` |
| 티켓 01 구현 커밋 | `bbd3d4b` | `adfc9f1` |
| structure 게이트 `reviewedSha` | `35db355` | `2879310` |
| 티켓 02 시작점 (code-review 고정점) | `ba60c6c` | `0ebd251` |
| 티켓 02 구현 커밋 | `61b3619` | `264c490` |
| `verification.md`의 Verified SHA | `f02164e` | `bb8176f` |
| release 게이트 `reviewedSha` | `83f8621` | `37f12c6` |
| 착지 시점 `main` | `3a4027e` | `25469be` |

### 게이트 아티팩트는 고치지 않았다

`structure-r1.json`·`release-r1.json`의 `reviewedSha`/`reviewedTree`는 **Codex가 그 실행에서
남긴 기록**이다. 손으로 고치면 그 실행이 실제로 무엇을 봤는지에 대한 증거가 아니게 되므로
원문 그대로 둔다 — 위 표가 그 값을 현재 이력으로 잇는다.

`reviewedTree` 값은 재작성 후에도 **그대로 유효하다**. 트리는 내용 주소이고 신원 재작성이
내용을 바꾸지 않았기 때문이다. 즉 게이트가 무엇을 리뷰했는지는 `reviewedTree`로 지금도
정확히 확인할 수 있다.

`verification.md`의 `Verified tree`(`6ec17f30…`)도 같은 이유로 유효하다 — 끊긴 것은 그
문서의 `Verified SHA` 한 줄뿐이고, 위 표가 잇는다.

## 원격에 반영한 경로 — force-push가 아니라 새 저장소

처음에는 기존 저장소에 force-push 했다(`9d19d7a...a216e51`). 하지만 force-push는 낡은 커밋
객체를 GitHub에 dangling 상태로 남긴다 — contributors에는 안 뜨지만 옛 SHA를 아는 사람은
GC 전까지 직접 URL로 볼 수 있다. 회사 신원을 확실히 없애기 위해 **같은 이름의 새 저장소로
옮기는** 쪽을 택했다:

1. 기존 `ukkiee/header-kit`을 **private으로 전환** → 공개 노출 즉시 차단
2. `ukkiee/header-kit-legacy`로 이름 변경 → 원래 이름 확보
3. `ukkiee/header-kit`을 새로 생성(public, MIT)하고 재작성된 214개 커밋을 푸시

새 저장소에는 회사 신원 객체가 **애초에 들어간 적이 없다**. 검증: contributors는 `ukkiee`
단독(214), 최초 커밋(`4825e1e`)부터 최신(`a216e51`)까지 전부 `ukkiee90@gmail.com`,
`author-email:sanguk.lee@imweb.me` 커밋 검색 결과 0건.

이미 병합돼 고유 커밋이 0개였던 `feature/ui-polish`(stale) 브랜치는 옮기지 않았다.

**남은 정리:** `ukkiee/header-kit-legacy`(private)에는 재작성 전 이력이 그대로 있다. 삭제해야
회사 신원이 GitHub에서 완전히 사라진다 — 토큰에 `delete_repo` 스코프가 없어 웹 UI 또는
`gh auth refresh -h github.com -s delete_repo` 후 삭제가 필요하다.

## 되돌리기

재작성 직전 상태를 번들로 떠 뒀다(세션 스크래치패드의 `pre-rewrite-backup.bundle`, 1.0MB,
전 ref 포함). 로컬에는 `refs/original/refs/heads/*`가 재작성 전 ref를 들고 있다 — 결과에
만족하면 이것도 지워야 로컬에서 회사 신원 객체가 사라진다.
