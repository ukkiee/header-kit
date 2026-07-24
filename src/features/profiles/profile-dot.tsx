import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { GripVertical } from 'lucide-react';
import { format, type Translator } from '@/core/i18n';
import type { Profile } from '@/core/schema';
import { SwitcherChip } from '@/ui/switcher-chip';
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
 * 프로필 on/off 도트 — 사이드바(양 표면)의 시각 언어.
 *
 * 활성은 **채운 원**, 비활성은 **테두리만 남은 원**이다(ui-review UI-07·UI-09). 예전에는
 * 둘 다 채운 원이고 색만 달라서 두 가지 문제가 있었다.
 * - 비활성 색 zinc-300(#d2d2d7)은 흰 배경 대비 **1.51:1**로, 상태를 나르는 비텍스트
 *   요소의 하한 3:1에 한참 못 미쳤다. zinc-400(#86868b, 3.62:1)으로 올린다.
 * - 상태가 색·명도로만 구분돼, 그레이스케일에서 활성 프로필을 찾을 수 없었다. 채움 대
 *   테두리는 색을 지워도 남는 차이다.
 *
 * 크기를 size-2로 키운 것도 같은 이유다 — 6px 원에 1px 테두리는 형태 차이가 뭉갠다.
 *
 * 상태 문자열 자체는 `profileSelectLabel`이 aria-label로 이미 전달한다. 여기 고친 것은
 * 시각 채널이다.
 */
export function ProfileDot({ profile }: { profile: Pick<Profile, 'active' | 'color'> }) {
  return (
    <span
      aria-hidden
      className={`size-2 shrink-0 rounded-full ${
        profile.active ? '' : 'border border-zinc-400 dark:border-zinc-500'
      }`}
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
export const sidebarRowClass = 'flex items-center gap-0.5';

const gripClass = `flex shrink-0 cursor-grab touch-none items-center text-zinc-300 hover:text-zinc-500 focus-visible:text-zinc-500 active:cursor-grabbing dark:text-zinc-600 dark:hover:text-zinc-400 ${focusRing}`;

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

/** 선택 버튼(칩) — 그립과 가로 공간을 나눠 칩(w-full)이 넘치지 않게 min-w-0 flex-1로 감싼다. */
export function ProfileSelectRow({
  profile,
  selected,
  onSelect,
  label,
}: {
  profile: Profile;
  selected: boolean;
  onSelect: () => void;
  label: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <SwitcherChip selected={selected} aria-label={label} onClick={onSelect}>
        <ProfileDot profile={profile} />
        <span className="min-w-0 truncate">{profile.name}</span>
      </SwitcherChip>
    </div>
  );
}
