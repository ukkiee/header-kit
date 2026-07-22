import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useState } from 'react';
import { format } from '@/core/i18n';
import type { Profile } from '@/core/schema';
import { Input } from '@/ui/input';
import { SwitcherChip } from '@/ui/switcher-chip';
import { focusRing } from '@/ui/tokens';
import { useT } from '@/ui/i18n-context';
import { ProfileDot, profileSelectLabel } from './profile-dot';

export interface ProfileSidebarProps {
  profiles: readonly Profile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  /** 순서 변경 — 드롭이 move-profile 명령으로 귀결된다 (상태 전이는 앱 레이어). */
  onReorder: (profileId: string, toIndex: number) => void;
}

/** 드래그 가능한 사이드바 항목 하나 — 그립 + 선택 버튼. */
function SortableItem({
  profile,
  selected,
  onSelect,
  dragLabel,
}: {
  profile: Profile;
  selected: boolean;
  onSelect: () => void;
  dragLabel: string;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: profile.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-0.5 ${isDragging ? 'z-10 opacity-70' : ''}`}
    >
      {/* 그립: PointerSensor·KeyboardSensor를 이 핸들에 건다 — 선택 버튼 클릭과 분리. */}
      <button
        type="button"
        aria-label={dragLabel}
        className={`flex shrink-0 cursor-grab touch-none items-center text-zinc-300 hover:text-zinc-500 focus-visible:text-zinc-500 active:cursor-grabbing dark:text-zinc-600 dark:hover:text-zinc-400 ${focusRing}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} strokeWidth={1.75} />
      </button>
      <SelectRow profile={profile} selected={selected} onSelect={onSelect} label={profileSelectLabel(profile, t)} />
    </li>
  );
}

/** 정적 항목(검색 중) — 그립 없이 선택 버튼만. 그립을 렌더하면 비활성 어포던스가 오해를 준다. */
function StaticItem({
  profile,
  selected,
  onSelect,
}: {
  profile: Profile;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useT();
  return (
    <li className="flex items-center gap-0.5">
      <SelectRow profile={profile} selected={selected} onSelect={onSelect} label={profileSelectLabel(profile, t)} />
    </li>
  );
}

/** 선택 버튼(칩) — 그립과 가로 공간을 나눠 칩(w-full)이 넘치지 않게 min-w-0 flex-1로 감싼다. */
function SelectRow({
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

/**
 * 프로필 사이드바 (ADR 0005) — 양 표면 공용 목록 + 검색 + 드래그 재정렬 (ui-refine 06).
 * 그립을 드래그하거나(PointerSensor) 그립에 포커스해 Space→화살표→Space로(KeyboardSensor)
 * 순서를 바꾼다. 드롭은 move-profile 명령으로 귀결된다. 검색 중에는 재정렬을 끈다
 * (필터된 부분 목록에서의 순서 변경은 의미가 모호하다).
 */
export function ProfileSidebar({
  profiles,
  selectedId,
  onSelect,
  onCreate,
  onReorder,
}: ProfileSidebarProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtering = q !== '';
  const visible = filtering ? profiles.filter((p) => p.name.toLowerCase().includes(q)) : profiles;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const toIndex = profiles.findIndex((p) => p.id === over.id);
    if (toIndex !== -1) onReorder(String(active.id), toIndex);
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Input
        size="sm"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('searchProfiles')}
        aria-label={t('searchProfiles')}
      />
      {/* 검색 중이면 그립 없는 정적 목록 — 부분 목록 재정렬은 의미가 모호하고,
          비활성 그립 어포던스가 오해를 주므로 아예 렌더하지 않는다. */}
      {filtering ? (
        <ul className="flex flex-col gap-0.5">
          {visible.map((profile) => (
            <StaticItem
              key={profile.id}
              profile={profile}
              selected={profile.id === selectedId}
              onSelect={() => onSelect(profile.id)}
            />
          ))}
        </ul>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={profiles.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-0.5">
              {visible.map((profile) => (
                <SortableItem
                  key={profile.id}
                  profile={profile}
                  selected={profile.id === selectedId}
                  onSelect={() => onSelect(profile.id)}
                  dragLabel={format(t('ariaReorderProfile'), { name: profile.name })}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <SwitcherChip
        className="w-auto self-start text-zinc-500 dark:text-zinc-400"
        onClick={onCreate}
      >
        + {t('newProfile')}
      </SwitcherChip>
    </div>
  );
}
