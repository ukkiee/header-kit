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
import type { Profile } from '@/core/schema';
import { useT } from '@/ui/i18n-context';
import {
  ProfileGrip,
  ProfileSelectRow,
  profileReorderLabel,
  profileSelectLabel,
  sidebarListClass,
  sidebarRowClass,
} from './profile-dot';

/**
 * 드래그 재정렬 목록 (ui-refine 06/08) — dnd-kit을 여기 몰아넣어 동적 import 대상으로
 * 삼는다(팝업 초기 청크에서 제외). 사이드바는 이 컴포넌트가 로드되기 전 같은 모양의
 * 정적 목록을 먼저 그리므로, 로드 후 그립이 기능만 얻고 시각 점프는 없다.
 */
export interface SortableProfileListProps {
  profiles: readonly Profile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (profileId: string, toIndex: number) => void;
}

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
      className={`${sidebarRowClass} ${isDragging ? 'z-10 opacity-70' : ''}`}
    >
      <ProfileGrip label={dragLabel} attributes={attributes} listeners={listeners} />
      <ProfileSelectRow profile={profile} selected={selected} onSelect={onSelect} label={profileSelectLabel(profile, t)} />
    </li>
  );
}

export default function SortableProfileList({
  profiles,
  selectedId,
  onSelect,
  onReorder,
}: SortableProfileListProps) {
  const t = useT();
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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={profiles.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <ul className={sidebarListClass}>
          {profiles.map((profile) => (
            <SortableItem
              key={profile.id}
              profile={profile}
              selected={profile.id === selectedId}
              onSelect={() => onSelect(profile.id)}
              dragLabel={profileReorderLabel(profile, t)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
