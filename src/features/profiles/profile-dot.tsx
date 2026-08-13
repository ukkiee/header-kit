import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { Check, GripVertical, Pause, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { format, type Translator } from '@/core/i18n';
import { IconButton } from '@/ui/icon-button';
import { Input } from '@/ui/text-field';
import { normalizeProfileName, type Profile } from '@/core/schema';
import { useArmedConfirm } from '@/ui/use-armed-confirm';
import { ProfileColorField } from './profile-color-field';
import { PROFILE_STATE_KEY, type ProfileRowState, type ProfileRowStatus } from '@/core/summary';
import { profileRowMetaText } from '@/features/status/status-text';
import { useT } from '@/ui/i18n-context';
import { SwitcherChip } from '@/ui/switcher-chip';
import { ToggleSwitch } from '@/ui/toggle-switch';
import { focusRing } from '@/ui/tokens';

/**
 * 프로필 선택 컨트롤의 접근성 이름 — 양 표면 사이드바가 같은 규약을 공유한다.
 *
 * 상태를 프로필이 아니라 **행 상태**에서 받는 이유: 전역 일시정지는 저장된 `active`를
 * 바꾸지 않으므로(티켓 13), profile만 보면 정지 중에도 "on"이라고 말하게 된다 — 화면은
 * 정지인데 접근성 이름만 켜짐인 어긋남이 색각·저시력 사용자에게만 생긴다(스펙 story 38).
 */
export function profileSelectLabel(
  profile: Pick<Profile, 'name'>,
  t: Translator,
  state: ProfileRowState,
): string {
  return format(t('ariaSelectProfile'), {
    name: profile.name,
    state: t(PROFILE_STATE_KEY[state]),
  });
}

/** 재정렬 그립의 접근성 이름 — 정적/draggable 목록이 같은 규약을 공유(로드 후 시각 불변). */
export function profileReorderLabel(profile: Pick<Profile, 'name'>, t: Translator): string {
  return format(t('ariaReorderProfile'), { name: profile.name });
}

/**
 * 사이드바 목록/행 레이아웃 클래스 — 정적 fallback(profile-sidebar)과 draggable
 * 목록(sortable-profile-list)이 반드시 같은 모양이어야(로드 후 시각 점프 방지) 하므로
 * 두 파일이 이 상수를 공유한다. 한쪽만 바뀌면 no-jump 계약이 깨지는 것을 막는다.
 */
export const sidebarListClass = 'flex flex-col -mb-0.5';

/**
 * 행이 **스스로 드는** 아래 여백 — `MotionRow` 안에 있어야 높이와 함께 접힌다.
 *
 * flex의 `gap`이 아닌 이유는 규칙 목록의 같은 자리(`ruleListClass`)가 적는다: gap은
 * 애니메이트되지 않아 퇴장하는 행의 간격이 언마운트 프레임에 통째로 사라진다(실측 2px).
 * 규칙 쪽이 6px이라 먼저 눈에 띄었을 뿐, 규약은 하나여야 한다.
 */
export const sidebarRowSpacing = 'pb-0.5';

/**
 * 행 셸 — **선택 면이 그립부터 스위치까지 한 덩어리로 덮는다.**
 *
 * 예전에는 이름 칩만 면을 칠했다. 그러면 고른 행이 둥근 상자 하나가 아니라 상자 + 그 좌우에
 * 떠 있는 그립·스위치 세 조각으로 보인다. 셋 다 그 프로필의 것이므로 한 면 안에 있어야
 * 어디까지가 한 행인지가 형태로 읽힌다.
 *
 * 함수인 이유는 이 클래스가 **정적 fallback과 draggable 목록 두 곳**에서 쓰이기 때문이다
 * (로드 후 시각 점프 금지 계약). 선택 여부가 면을 정하게 되면서 상수로는 그 계약을 지킬 수
 * 없어졌다 — 두 호출부가 같은 함수를 부르는 것으로 옮겼다.
 */
export function sidebarRowClass(selected: boolean): string {
  return `group flex items-center gap-0.5 rounded-md pr-1.5 pl-1 transition-colors ${
    selected ? 'bg-secondary' : 'hover:bg-accent'
  }`;
}

// 평상 색은 `--input`이다 — `--border`는 **장식 구분선**용이라(global.css의 보더 두 종)
// 대비를 지지 않는데(라이트 #e2e2e6 ≈ 1.24:1), 그립은 눌러 끄는 상호작용 요소다.
const gripClass = `flex shrink-0 cursor-grab touch-none items-center text-input hover:text-muted-foreground focus-visible:text-muted-foreground active:cursor-grabbing ${focusRing}`;

/**
 * 재정렬 그립 — dnd-kit attributes/listeners를 받으면 드래그 핸들이 되고, 없으면
 * 정적(로드 전 fallback). 정적/draggable이 같은 모양이라 lazy 로드 후 시각 점프가 없다.
 */
export function ProfileGrip({
  label,
  attributes,
  listeners,
}: {
  label: string;
  attributes?: DraggableAttributes;
  listeners?: SyntheticListenerMap;
}) {
  return (
    <button type="button" aria-label={label} className={gripClass} {...attributes} {...listeners}>
      <GripVertical size={14} strokeWidth={1.75} />
    </button>
  );
}

/** 인라인 토글의 접근성 이름 — 프로필 편집기가 쓰던 그 이름을 목록이 이어받는다. */
export function profileToggleLabel(profile: Pick<Profile, 'name'>, t: Translator): string {
  return format(t('ariaToggleProfile'), { name: profile.name });
}

/**
 * 삭제 버튼의 두 이름 — 누르기 전과 되물음 (ADR 0017 개정).
 *
 * 이름에 프로필 이름을 담는 이유는 목록에 같은 버튼이 여러 개 서기 때문이다. `삭제`만으로는
 * 스크린리더·음성 제어에서 어느 행의 것인지 가릴 수 없다. 재정렬 그립이 같은 이유로 같은
 * 모양의 이름을 쓴다.
 */
export function profileDeleteLabels(
  profile: Pick<Profile, 'name'>,
  t: Translator,
): { deleteLabel: string; confirmLabel: string } {
  return {
    deleteLabel: format(t('ariaDeleteProfile'), { name: profile.name }),
    confirmLabel: format(t('ariaConfirmDeleteProfile'), { name: profile.name }),
  };
}

/**
 * 편집 버튼의 접근성 이름 — 삭제·재정렬과 같은 이유로 프로필 이름을 담는다.
 *
 * `이름 변경`이 아니라 `편집`인 이유: 이 버튼이 여는 것은 이름 입력 **하나가 아니다.**
 * 열려 있는 동안 색 스와치도 함께 눌러진다(ADR 0017 재개정) — 라벨이 이름만 말하면 색을
 * 고칠 수 있다는 사실이 화면 어디에도 없다. 포커스가 이름으로 먼저 가는 것은 그대로다.
 */
export function profileEditLabel(profile: Pick<Profile, 'name'>, t: Translator): string {
  return format(t('ariaEditProfile'), { name: profile.name });
}

/**
 * 선택 버튼(칩) + 인라인 토글 (티켓 04) — 시안의 행: 스와치 · 이름 · `N개 규칙 · 적용` · 스위치.
 *
 * 토글이 **목록 안에** 있는 이유: 켜고 끄려고 프로필을 먼저 골라 본문을 열 필요가 없어야
 * 한다(스펙 story 43). 그래서 이 스위치가 프로필 on/off의 단 하나의 컨트롤이다.
 *
 * **메타는 이름 아래 줄이다.** 열 폭은 264px로 못박혀 있고(ADR 0005·0017) 그 안에서 그립과
 * 스위치가 자리를 먼저 가져가므로, 메타를 이름과 한 줄에 두면 가장 긴 문구
 * (`12 rules · not applied`)가 이름을 예닐곱 자로 눌러 버린다 — 목록에서 프로필을 짚는 단서가
 * 곧 그 이름인데 그것이 먼저 잘리는 셈이다. 두 줄로 나누면 열도 넓어지지 않고 이름도 남는다.
 * 예전 한 줄 배치(`ml-auto` + 수 한두 자)는 붙는 것이 낱말이 아니라 숫자였을 때의 해법이다.
 *
 * **정지는 세 채널로 말한다** (티켓 AC6, 스펙 story 44): 일시정지 아이콘(형태) · 메타 끝의
 * 낱말(문자) · 글자 세기(색). 어느 하나가 죽어도 남는다 — 9px 글리프의 관용을 모르는
 * 사람에게도, 색을 못 보는 사람에게도 정지가 읽혀야 한다.
 *
 * 색 채널이 **정지 쪽을 진하게** 만드는 것은 대비 때문이다 (code-review). 메타는 평상시
 * 보조 텍스트라 이미 muted인데, 정지를 더 흐리게 하려면 muted 아래로 내려가야 하고 그러면
 * 10px 글자가 `global.css`가 못 박은 본문 4.5:1을 깬다. 위로 올리면 채널이 살면서 대비도
 * 함께 오른다 — 지금 아무것도 안 걸리고 있다는 사실은 눈에 띄어도 되는 종류다.
 *
 * 낱말 값은 행 접근성 이름이 쓰는 그 값이라(`PROFILE_STATE_KEY`) 이름이 `(정지)`로 끝난다 —
 * **상태 낱말**이 양쪽에서 같다는 뜻이고, 그래서 음성 제어 사용자가 눈으로 읽은 그 말로 행을
 * 부를 수 있다. 규칙 수까지 이름에 담기지는 않는다: 그것은 라벨이 아니라 곁들인 정보다.
 *
 * **수는 정지 중에도 깎지 않는다** — 규칙이 사라진 게 아니라 멈춘 것이고 재개하면 돌아온다.
 */
export function ProfileSelectRow({
  profile,
  status,
  selected,
  onSelect,
  onToggleActive,
  onDelete,
  onRename,
  onRecolor,
  index,
  label,
  toggleLabel,
  deleteLabel,
  confirmLabel,
  editLabel,
}: {
  profile: Profile;
  status: ProfileRowStatus;
  selected: boolean;
  onSelect: () => void;
  onToggleActive: (active: boolean) => void;
  /** 두 번째 클릭에서만 불린다 — 되물음은 이 행이 스스로 든다. */
  onDelete: () => void;
  /**
   * 이름 변경 — **정규화를 통과한 새 이름일 때만** 불린다. 빈 이름이거나 지금과 같으면
   * 이 행이 조용히 접고 부르지 않는다(아래 `commitRename`).
   */
  onRename: (name: string) => void;
  /**
   * 색 변경 — 팔레트를 누른 순간, 또는 자유 선택 팝오버가 닫히는 순간에 **한 번만** 불린다
   * (`profile-color-field`의 커밋 주석). 값은 이미 `#rrggbb`로 접혀 있다.
   */
  onRecolor: (color: string) => void;
  /** 목록에서 이 행이 선 자리 — 바뀌면 삭제 무장이 풀린다 (`useArmedConfirm`). */
  index?: number;
  label: string;
  toggleLabel: string;
  deleteLabel: string;
  confirmLabel: string;
  editLabel: string;
}) {
  // 되물음은 행마다 따로다 — 목록이 들면 어느 행이 무장했는지를 위에서 배선해야 한다.
  /*
   * 되물음의 무장은 이 행의 **자리**에 매인다 — 규칙 행과 같은 규약이고 근거도 같다
   * (`useArmedConfirm`). 프로필 목록도 재정렬·다른 표면의 삭제로 행이 이사한다.
   */
  const confirm = useArmedConfirm(index);
  /**
   * 이름 편집 (ADR 0017 재개정) — 열려 있으면 초안 문자열, 닫혀 있으면 `null`.
   *
   * 두 값(열림 여부 · 초안)을 하나로 두는 이유는 그 둘이 **함께만 뜻이 있기** 때문이다.
   * 따로 두면 "닫혔는데 초안이 남아 있다"가 표현 가능해지고, 그 상태에서 다시 열면 지난번
   * 타이핑이 되살아난다.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * 편집 셸의 경계 — **어디로 포커스가 갔는가**를 판정하려고 든다.
   *
   * 색 팝오버를 열려면 포커스가 이름 입력에서 스와치 버튼으로 옮겨 가는데, 그것을 blur
   * 커밋으로 치면 편집이 닫히면서 **팝오버 트리거 자체가 사라진다** — 실측으로 팝오버가
   * 아예 열리지 않았다. 셸 안에서의 이동은 "편집을 마쳤다"가 아니다.
   */
  const editorRef = useRef<HTMLDivElement>(null);
  const t = useT();
  const paused = status.state === 'paused';
  const renaming = draft !== null;

  // 열리는 순간 포커스를 넣고 전체를 고른다 — 고치러 온 사람이 대개 통째로 바꾼다.
  // `autoFocus` 속성 대신 여기서 하는 이유는 그 속성이 jsx-a11y 진단을 하나 새로 만들고,
  // `a11y-gate`의 베이스라인이 개수 증가를 FAIL로 잡기 때문이다.
  useEffect(() => {
    if (!renaming) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming]);

  const openRename = () => {
    confirm.disarm(); // 두 가지가 동시에 무장해 있지 않게 한다
    setDraft(profile.name);
  };

  /**
   * 커밋 — **명령은 여기서 한 번만** 나간다.
   *
   * 키를 칠 때마다 보내면 타이핑 한 번에 dNR 재컴파일과 백업 스냅샷이 연달아 예약된다
   * (`onStateChanged`가 `converge(); scheduleBackup();`을 함께 부른다).
   *
   * 거절과 무변화는 **조용히 접는다.** 빈 이름을 실패 배너로 알릴 일이 아니다 — 맞는 응답은
   * 지운 이름을 되돌려 주는 것이고, 초안을 버리면 칩이 권위 이름을 다시 그리므로 그 되돌림이
   * 저절로 일어난다.
   */
  const commitRename = () => {
    if (draft === null) return;
    const next = normalizeProfileName(draft);
    setDraft(null);
    if (next === null || next === profile.name) return;
    onRename(next);
  };

  /**
   * 포커스가 편집 셸 **밖으로** 나갔을 때만 커밋한다.
   *
   * 핸들러가 입력이 아니라 셸에 붙어 있는 이유는 셸을 떠나는 한 번을 언제나 잡기 위해서다.
   *
   * **색 팝오버를 예외로 두지 않는다.** 스와치가 칩 밖으로 나와 항상 서 있게 되면서, 편집이
   * 닫혀도 그 트리거가 사라지지 않는다 — 예전에는 사라져서 팝오버가 아예 열리지 않았다.
   * 그래서 색을 누르면 이름이 커밋되고 편집이 닫힌 뒤 팝오버가 열린다: blur가 커밋이라는
   * 규칙에 예외를 만들지 않는 편이 예측 가능하다.
   */
  const handleEditorBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && editorRef.current?.contains(next)) return;
    commitRename();
  };

  /*
   * 메타 줄 — 편집 중에도 **같은 자리에 그대로 선다.**
   *
   * 칩을 통째로 입력으로 갈아 끼우면 두 줄이 한 줄이 되어 행 높이가 줄고, 목록 전체가
   * 위로 당겨진다. 바뀌는 것은 첫 줄의 이름뿐이므로 둘째 줄은 양쪽 분기가 공유한다.
   */
  const metaLine = (
    <span
      aria-hidden
      data-profile-meta=""
      className={`flex w-full min-w-0 items-center gap-1 truncate text-[10px] tabular-nums ${
        paused ? 'text-foreground' : 'text-muted-foreground'
      }`}
    >
      {paused && <Pause size={9} strokeWidth={2} fill="currentColor" className="shrink-0" />}
      <span className="min-w-0 truncate">{profileRowMetaText(status, t)}</span>
    </span>
  );

  /*
   * **면은 행(`sidebarRowClass`)이 든다** — 칩은 `filled={false}`로 내려놓고 글자만 바꾼다.
   * 둘 다 칠하면 면 위에 면이 겹쳐 모서리가 두 겹으로 보인다.
   */
  return (
    <>
      {/*
        컬러 스와치는 **항상 버튼이다** (사용자 결정).

        예전에는 이름 편집 중에만 버튼이 됐다. 그 근거("264px 열에 아이콘을 상시로 더할 수
        없다")는 여전히 맞지만, 이 스와치는 **더해지는 아이콘이 아니라 이미 거기 있던
        사각형**이라 자리가 늘지 않는다. 대가는 목록을 훑다 잘못 누를 수 있다는 것뿐이고,
        그때 열리는 것은 팝오버일 뿐 색이 바뀌지는 않는다.

        칩 **밖**으로 나온 이유는 버튼 안에 버튼을 넣을 수 없기 때문이다(중첩 상호작용 —
        클릭의 주인이 둘이 된다. 입력을 뺄 때와 같은 이유다). 그 김에 커서도 참이 된다:
        예전에는 이 사각형 위의 포인터가 칩에서 빌린 값이라 눌러도 색이 아니라 프로필
        선택이 돌았다(실측).

        **메타 줄이 이름 아래로 정렬된다.** 사각형이 칩 안에 있던 시절에는 메타가 사각형의
        왼쪽 끝에서 시작했는데, 이제 이름과 같은 x에서 시작한다 — 사각형은 행 전체의 표지가 된다.
      */}
      <ProfileColorField profile={profile} onCommit={onRecolor} />

      <div className="min-w-0 flex-1">
        {renaming ? (
          /*
            편집 셸 — 칩과 **같은 padding·글자 크기**를 쓴다(`px-2 py-1.5 text-xs`). 칩의
            클래스를 재사용하지 않고 베낀 이유는 칩이 `<button>`이기 때문이다: 버튼 안에
            입력을 넣을 수 없다(중첩 상호작용 — 클릭과 포커스의 주인이 둘이 된다).

            입력은 `ghost`다 — 값이 글자처럼 읽히다가 포커스에서만 경계가 드러난다. 높이와
            좌우 여백을 지워(`h-auto px-0 py-0`) 이름이 서 있던 그 자리에 그대로 앉힌다.

            **`border-0`까지 지운다.** `ghost`는 테두리 **색**만 투명하게 하고 1px 폭은 남기는데,
            그 상하 2px이 그대로 행 높이가 된다 — 실측으로 편집을 열 때 행이 43 → 45px로 튀었고
            목록 전체가 그만큼 밀렸다. 폭을 0으로 두어도 포커스 표시는 남는다: 그것을 그리는
            것은 테두리가 아니라 3px 링이다.
          */
          <div
            ref={editorRef}
            onBlur={handleEditorBlur}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs"
          >
            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
              <Input
                ref={inputRef}
                variant="ghost"
                size="xs"
                aria-label={t('profileNameLabel')}
                /*
                  `md:text-xs`가 함께 있어야 한다 — shadcn `Input`이 `md:text-sm`을 얹는데
                  `text-xs`는 **같은 modifier가 아니라** 그것을 지우지 못한다(twMerge의 규칙).
                  팝업은 760px라 `md`(768px)가 안 물어 보이지 않았고, 탭 화면(≥1200px)에서만
                  글자가 12px → 14px로 커져 **행 높이가 45.3 → 49.3px로 튀었다**(실측).
                */
                className="h-auto min-w-0 flex-1 border-0 px-0 py-0 text-xs md:text-xs"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                // blur 커밋은 **셸이 든다**(`handleEditorBlur`) — 여기 걸면 색 팝오버로
                // 옮겨 가는 포커스가 편집을 닫아 팝오버 트리거까지 함께 사라진다.
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitRename();
                  }
                  // Escape는 **버린다** — blur 커밋을 타고 나가지 않도록 먼저 닫는다.
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setDraft(null);
                  }
                }}
              />
              {metaLine}
            </span>
          </div>
        ) : (
          <SwitcherChip filled={false} selected={selected} aria-label={label} onClick={onSelect}>
            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
              {/*
                이름 글자 위에서는 **텍스트 커서**이고, 더블클릭이 편집을 연다 (사용자 결정).

                커서가 뜻하는 것은 "글자를 고를 수 있다"가 아니라 **"이 글자는 고칠 수 있다"**다 —
                이 span은 선택 버튼 안이라 드래그 선택이 애초에 안 되고(실측), 억지로 켜면 그
                드래그가 버튼 클릭을 그대로 발화한다. 단일 클릭은 지금처럼 프로필을 고른다.

                연필 버튼은 그대로 남는다 — 더블클릭은 아는 사람에게 빠른 길이지 유일한 길이
                아니고, 키보드·터치에는 그 길이 없다.
              */}
              <span
                data-profile-name=""
                className="w-full min-w-0 cursor-text truncate"
                onDoubleClick={openRename}
              >
                {profile.name}
              </span>
              {/*
                메타는 `aria-hidden`이다 — `aria-label`을 가진 버튼 **안**이라 어차피 낭독되지
                않고, 상태는 그 이름이 문자열로 따로 나른다. 같은 사실을 두 번 말하면 낭독이 겹친다.
              */}
              {metaLine}
            </span>
          </SwitcherChip>
        )}
      </div>
      {/*
        이름 변경과 삭제 — **평소에는 숨어 있다가 행에 닿으면 나타난다** (ADR 0017 개정).

        규칙 행의 편집·삭제는 평소에도 60%로 보인다(ui-review UI-03). 여기서 다른 규약을
        쓰는 이유는 폭이다: 프로필 열은 264px에 못박혀 있고 그 안에 그립·이름·메타·스위치가
        이미 서 있어, 아이콘이 상시로 더 들어오면 이름이 먼저 잘린다. 그리고 프로필을 고치는
        일은 규칙 편집처럼 자주 하는 일이 아니다 — 이 앱의 핵심 동작은 규칙 쪽이다.

        **포커스에도 나타난다**(`group-focus-within`). 호버로만 드러내면 키보드·터치에서는
        도달할 수 없는 버튼이 된다 — 그건 숨김이 아니라 부재다.

        **순서는 이름 변경 → 삭제다.** 스모크 N54가 켬/끔 스위치에서 Shift+Tab 한 번에 삭제
        버튼에 닿는 것을 전제하므로, 새 버튼은 삭제 **앞**에 서야 그 전제가 유지된다.
      */}
      <div
        className={`flex shrink-0 items-center gap-0.5 transition-opacity ${
          // 편집 중에도 100%다 — 입력이 열려 있는데 그 옆의 버튼들이 흐려지면, 지금 무엇을
          // 하는 중인지가 화면에서 반쯤 사라진다.
          confirm.armed || renaming
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        }`}
        /*
         * 되물음은 **가리키는 동안만** 산다. 다른 행으로 옮기거나 포커스가 떠나면 풀린다 —
         * 안 그러면 무장한 채 숨은 행이 남아, 다음에 우연히 닿은 한 번의 클릭이 지운다.
         */
        /*
         * **마우스일 때만 푼다.** 펜은 버튼을 떠나도 `pointerleave`가 오지 않고(실측), 터치는
         * `pointerup` 직후에 와서 무장과 실행 **사이**에 떨어진다 — 지금 터치에서 2단 확인이
         * 성립하는 것은 React가 그 해제를 click 전에 커밋하지 않는 스케줄링 우연 덕이다.
         * 우연 위에 계약을 세우지 않는다. 그 둘의 바닥은 훅의 시간 초과가 깐다.
         */
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') confirm.disarm();
        }}
        onBlur={(event) => {
          // 편집과 삭제 **사이**의 포커스 이동은 떠난 것이 아니다.
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next)) return;
          confirm.disarm();
        }}
      >
        {/*
          편집 중에는 눌린 상태로 선다 — 어느 행을 고치는 중인지가 아이콘에도 남는다.
          이미 열려 있을 때의 클릭은 **아무것도 하지 않는다**: 그 클릭의 mousedown이 입력을
          blur시켜 이미 커밋했으므로, 여기서 다시 열면 방금 닫은 것이 곧바로 되열린다.
        */}
        <IconButton
          label={editLabel}
          tooltip={t('edit')}
          icon={Pencil}
          aria-pressed={renaming}
          className={renaming ? 'bg-secondary text-foreground' : ''}
          onClick={() => {
            if (renaming) return;
            openRename();
          }}
        />
        <IconButton
          label={confirm.armed ? confirmLabel : deleteLabel}
          tooltip={confirm.armed ? t('confirmDeleteProfile') : t('menuDelete')}
          // 아이콘이 **모양으로도** 바뀐다 — 색만 바뀌면 무장 여부가 색각에 매인다.
          icon={confirm.armed ? Check : Trash2}
          tone="danger"
          onClick={() => confirm.press(onDelete)}
        />
      </div>
      {/* 정지 중에도 토글은 살아 있다 — 정지는 표시만 덮으므로 저장된 on/off는 지금도 고른다. */}
      <ToggleSwitch checked={profile.active} onCheckedChange={onToggleActive} aria-label={toggleLabel} />
    </>
  );
}
