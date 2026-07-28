import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { GripVertical, Pause } from 'lucide-react';
import { format, type MessageKey, type Translator } from '@/core/i18n';
import type { Profile } from '@/core/schema';
import type { ProfileRowState, ProfileRowStatus } from '@/core/summary';
import { SwitcherChip } from '@/ui/switcher-chip';
import { ToggleSwitch } from '@/ui/toggle-switch';
import { focusRing } from '@/ui/tokens';

/**
 * 행 상태를 나르는 카탈로그 키 — 정지는 켬/끔을 덮어쓰는 **세 번째 값**이라 같은 자리에
 * 들어간다. 이름 형식(`Select profile {name} ({state})`)은 그대로라, 이 규약을 읽는
 * 호출부·단언이 상태 하나가 늘었다고 달라지지 않는다.
 */
const STATE_KEY: Record<ProfileRowState, MessageKey> = {
  on: 'ariaStateOn',
  off: 'ariaStateOff',
  paused: 'ariaStatePaused',
};

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
    state: t(STATE_KEY[state]),
  });
}

/**
 * 프로필 색 스와치 — 사이드바(양 표면)의 시각 언어 (티켓 10: 디자인의 색 스와치).
 *
 * **색은 정체성, 형태는 상태다.** 프로필 색은 활성 여부와 무관하게 늘 보여야 목록에서
 * 프로필을 색으로 짚을 수 있다(디자인의 스와치). 그러면서 활성은 **채운 사각**, 비활성은
 * **테두리만 남은 사각**이다(ui-review UI-07·UI-09) — 채움 대 테두리는 색을 지워도 남는
 * 차이라, 그레이스케일에서도 활성 프로필을 찾을 수 있다.
 *
 * 크기를 size-2.5로 키운 것도 같은 이유다 — 6px 도형에 얇은 테두리는 형태 차이가 뭉갠다.
 *
 * **대비는 사용자 색에 맡기지 않는다.** 비활성의 테두리는 프로필 색이라 흰색에 가까운
 * 색을 고르면 라이트 캔버스에서 도형이 사라진다(색은 `<input type="color">`에서 오므로
 * 아무 값이나 될 수 있다). 그래서 그 위에 `--input` 윤곽선을 한 겹 겹친다 — 이 토큰은
 * bg·surface·fill 어느 면 위에서도 3:1을 넘기도록(라이트 최저 3.18:1, 다크 3.20:1)
 * 고른 값이라, 상태를 나르는 비텍스트 요소의 하한이 색 선택과 무관해진다.
 *
 * 상태는 여기 말고도 두 곳에서 더 말한다: `profileSelectLabel`의 aria-label(문자열)과
 * 같은 행의 인라인 토글(손잡이 **위치**). 색 하나에 상태를 싣지 않는다(스펙 story 38).
 */
export function ProfileDot({ profile }: { profile: Pick<Profile, 'active' | 'color'> }) {
  return (
    <span
      aria-hidden
      className={`size-2.5 shrink-0 rounded-[3px] ${
        profile.active ? '' : 'border-2 outline-1 outline-input'
      }`}
      style={
        profile.active ? { backgroundColor: profile.color } : { borderColor: profile.color }
      }
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
export const sidebarRowClass = 'flex items-center gap-0.5';

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
 * 선택 버튼(칩) + 인라인 토글 (티켓 10) — 그립·토글과 가로 공간을 나눠 칩(w-full)이
 * 넘치지 않게 min-w-0 flex-1로 감싼다.
 *
 * 토글이 **목록 안에** 있는 이유: 켜고 끄려고 프로필을 먼저 골라 본문 편집기를 열 필요가
 * 없어야 한다(스펙 story 22). 그래서 이 스위치가 프로필 on/off의 단 하나의 컨트롤이다 —
 * 편집기 헤더에도 같은 이름의 스위치를 두면 같은 일을 하는 컨트롤이 화면에 둘이 된다.
 */
export function ProfileSelectRow({
  profile,
  status,
  selected,
  onSelect,
  onToggleActive,
  label,
  toggleLabel,
}: {
  profile: Profile;
  status: ProfileRowStatus;
  selected: boolean;
  onSelect: () => void;
  onToggleActive: (active: boolean) => void;
  label: string;
  toggleLabel: string;
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <SwitcherChip selected={selected} aria-label={label} onClick={onSelect}>
          <ProfileDot profile={profile} />
          <span className="min-w-0 truncate">{profile.name}</span>
          <ProfileRowMark status={status} />
        </SwitcherChip>
      </div>
      {/* 정지 중에도 토글은 살아 있다 — 정지는 표시만 덮으므로 저장된 on/off는 지금도 고른다. */}
      <ToggleSwitch checked={profile.active} onCheckedChange={onToggleActive} aria-label={toggleLabel} />
    </>
  );
}

/**
 * 행 오른쪽 끝의 상태 표식 — 켜진 규칙 수(스펙 story 22)와 전역 정지(story 25).
 *
 * **자리는 이름 칩 안이다.** 열 폭은 팝업 14rem·탭 16rem으로 못박혀 있으므로(ADR 0005,
 * 티켓 10 code-review R-5) 수를 행 바깥에 붙이면 열이 넓어지거나 이름 칩이 눌린다. 칩
 * 안에서 `ml-auto`로 오른쪽에 붙이면 좁아질 때 **이름만** truncate되고 행 폭은 그대로다.
 *
 * **정지는 색이 아니라 형태로 말한다.** 일시정지 아이콘(‖)이 수 앞에 서고 수는 muted로
 * 내려간다 — 그레이스케일에서도 "이 프로필의 N개가 지금 안 걸린다"가 읽힌다(story 38).
 * 수 자체는 깎지 않는다: 규칙이 사라진 게 아니라 멈춘 것이고, 재개하면 그대로 돌아온다.
 *
 * `aria-hidden`인 이유: 이 표식은 `aria-label`을 가진 버튼 **안**이라 어차피 낭독되지
 * 않는다. 상태는 그 이름(`profileSelectLabel`)이 문자열로 따로 나른다 — 표식과 이름이
 * 같은 사실을 두 번 말하면 낭독이 겹친다.
 */
function ProfileRowMark({ status }: { status: ProfileRowStatus }) {
  const paused = status.state === 'paused';
  return (
    <span
      aria-hidden
      className={`ml-auto flex shrink-0 items-center gap-0.5 font-mono text-[10px] tabular-nums ${
        paused ? 'text-muted-foreground' : ''
      }`}
    >
      {paused && <Pause size={9} strokeWidth={2} fill="currentColor" />}
      {status.ruleCount}
    </span>
  );
}
