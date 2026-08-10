import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { Check, GripVertical, Pause, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { format, type Translator } from '@/core/i18n';
import { IconButton } from '@/ui/icon-button';
import type { Profile } from '@/core/schema';
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

/**
 * 프로필 색 스와치 — 사이드바(양 표면)의 시각 언어 (티켓 10: 디자인의 색 스와치).
 *
 * **활성은 프로필 색으로 채운 사각, 비활성은 회색으로 채운 사각이다.** 둘 다 채움이고
 * 다른 것은 색뿐이다.
 *
 * 예전에는 비활성이 **테두리만 남은 사각**이었다 — "색은 정체성, 형태는 상태"를 지켜
 * 꺼진 프로필의 색도 목록에서 보이게 하려던 것이다. 그 대가가 두 가지였다. 화면에서는
 * 2.5px 도형 안이 뚫려 보여 색 얼룩처럼 읽혔고, 코드에서는 그 테두리가 **사용자 색**이라
 * (색은 `<input type="color">`에서 오므로 아무 값이나 될 수 있다) 흰색에 가까운 색을
 * 고르면 라이트 캔버스에서 도형이 통째로 사라졌다 — 그래서 `--input` 윤곽선을 한 겹 더
 * 겹쳐야 했다. 회색 채움 하나가 그 겹을 없앤다: 색이 사용자 값과 무관해지므로 대비가
 * 색 선택에 매이지 않는다.
 *
 * 채움 색이 `--input`인 이유는 그 토큰이 bg·surface·fill 어느 면 위에서도 3:1을 넘기도록
 * (라이트 최저 3.18:1, 다크 3.20:1) 고른 값이기 때문이다 — 상태를 나르는 비텍스트 요소의
 * 하한이 이걸로 선다.
 *
 * **트레이드오프**: 꺼진 프로필의 색이 목록에서 보이지 않는다. 색 채널 하나를 상태에
 * 내준 셈인데, 상태는 여기 말고도 세 곳에서 말한다 — `profileSelectLabel`의
 * aria-label(문자열), 같은 행의 인라인 토글(손잡이 **위치**), 이름 아래 메타의 낱말.
 * 색 하나에 상태를 싣지 않는다는 계약(스펙 story 38)은 그대로다.
 */
export function ProfileDot({ profile }: { profile: Pick<Profile, 'active' | 'color'> }) {
  return (
    <span
      aria-hidden
      className={`size-2.5 shrink-0 rounded-[3px] ${profile.active ? '' : 'bg-input'}`}
      style={profile.active ? { backgroundColor: profile.color } : undefined}
    />
  );
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
export const sidebarListClass = 'flex flex-col gap-0.5';

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
  label,
  toggleLabel,
  deleteLabel,
  confirmLabel,
}: {
  profile: Profile;
  status: ProfileRowStatus;
  selected: boolean;
  onSelect: () => void;
  onToggleActive: (active: boolean) => void;
  /** 두 번째 클릭에서만 불린다 — 되물음은 이 행이 스스로 든다. */
  onDelete: () => void;
  label: string;
  toggleLabel: string;
  deleteLabel: string;
  confirmLabel: string;
}) {
  // 되물음은 행마다 따로다 — 목록이 들면 어느 행이 무장했는지를 위에서 배선해야 한다.
  const [confirming, setConfirming] = useState(false);
  const t = useT();
  const paused = status.state === 'paused';
  /*
   * **면은 행(`sidebarRowClass`)이 든다** — 칩은 `filled={false}`로 내려놓고 글자만 바꾼다.
   * 둘 다 칠하면 면 위에 면이 겹쳐 모서리가 두 겹으로 보인다.
   */
  return (
    <>
      <div className="min-w-0 flex-1">
        <SwitcherChip filled={false} selected={selected} aria-label={label} onClick={onSelect}>
          <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <span className="flex w-full min-w-0 items-center gap-1.5">
              <ProfileDot profile={profile} />
              <span className="min-w-0 truncate">{profile.name}</span>
            </span>
            {/*
              메타는 `aria-hidden`이다 — `aria-label`을 가진 버튼 **안**이라 어차피 낭독되지
              않고, 상태는 그 이름이 문자열로 따로 나른다. 같은 사실을 두 번 말하면 낭독이 겹친다.
            */}
            <span
              aria-hidden
              className={`flex w-full min-w-0 items-center gap-1 truncate text-[10px] tabular-nums ${
                paused ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {paused && <Pause size={9} strokeWidth={2} fill="currentColor" className="shrink-0" />}
              <span className="min-w-0 truncate">{profileRowMetaText(status, t)}</span>
            </span>
          </span>
        </SwitcherChip>
      </div>
      {/*
        삭제 — **평소에는 숨어 있다가 행에 닿으면 나타난다** (ADR 0017 개정).

        규칙 행의 편집·삭제는 평소에도 60%로 보인다(ui-review UI-03). 여기서 다른 규약을
        쓰는 이유는 폭이다: 프로필 열은 264px에 못박혀 있고 그 안에 그립·이름·메타·스위치가
        이미 서 있어, 아이콘 하나가 상시로 더 들어오면 이름이 먼저 잘린다. 그리고 프로필
        삭제는 규칙 편집처럼 자주 하는 일이 아니다 — 이 앱의 핵심 동작은 규칙 쪽이다.

        **포커스에도 나타난다**(`group-focus-within`). 호버로만 드러내면 키보드·터치에서는
        도달할 수 없는 버튼이 된다 — 그건 숨김이 아니라 부재다.
      */}
      <div
        className={`shrink-0 transition-opacity ${
          confirming ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        }`}
        /*
         * 되물음은 **가리키는 동안만** 산다. 다른 행으로 옮기거나 포커스가 떠나면 풀린다 —
         * 안 그러면 무장한 채 숨은 행이 남아, 다음에 우연히 닿은 한 번의 클릭이 지운다.
         */
        onPointerLeave={() => setConfirming(false)}
        onBlur={() => setConfirming(false)}
      >
        <IconButton
          label={confirming ? confirmLabel : deleteLabel}
          tooltip={confirming ? t('confirmDeleteProfile') : t('menuDelete')}
          // 아이콘이 **모양으로도** 바뀐다 — 색만 바뀌면 무장 여부가 색각에 매인다.
          icon={confirming ? Check : Trash2}
          tone="danger"
          onClick={() => {
            if (!confirming) {
              setConfirming(true);
              return;
            }
            setConfirming(false);
            onDelete();
          }}
        />
      </div>
      {/* 정지 중에도 토글은 살아 있다 — 정지는 표시만 덮으므로 저장된 on/off는 지금도 고른다. */}
      <ToggleSwitch checked={profile.active} onCheckedChange={onToggleActive} aria-label={toggleLabel} />
    </>
  );
}
