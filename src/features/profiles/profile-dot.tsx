import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { GripVertical } from 'lucide-react';
import { format, type Translator } from '@/core/i18n';
import type { Profile } from '@/core/schema';
import { SwitcherChip } from '@/ui/switcher-chip';
import { ToggleSwitch } from '@/ui/toggle-switch';
import { focusRing } from '@/ui/tokens';

/** 프로필 선택 컨트롤의 접근성 이름 — 양 표면 사이드바가 같은 규약을 공유한다. */
export function profileSelectLabel(
  profile: Pick<Profile, 'name' | 'active'>,
  t: Translator,
): string {
  return format(t('ariaSelectProfile'), {
    name: profile.name,
    state: t(profile.active ? 'ariaStateOn' : 'ariaStateOff'),
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

const gripClass = `flex shrink-0 cursor-grab touch-none items-center text-border hover:text-muted-foreground focus-visible:text-muted-foreground active:cursor-grabbing ${focusRing}`;

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
  selected,
  onSelect,
  onToggleActive,
  label,
  toggleLabel,
}: {
  profile: Profile;
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
        </SwitcherChip>
      </div>
      <ToggleSwitch checked={profile.active} onCheckedChange={onToggleActive} aria-label={toggleLabel} />
    </>
  );
}
