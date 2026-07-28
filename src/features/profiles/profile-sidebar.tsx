import { lazy, Suspense, useState } from 'react';
import type { Profile } from '@/core/schema';
import { profileRowStatus } from '@/core/summary';
import { Input } from '@/ui/text-field';
import { useT } from '@/ui/i18n-context';
import {
  ProfileGrip,
  ProfileSelectRow,
  profileReorderLabel,
  profileSelectLabel,
  profileToggleLabel,
  sidebarListClass,
  sidebarRowClass,
} from './profile-dot';
import { SwitcherChip } from '@/ui/switcher-chip';

// dnd-kit은 이 lazy 청크에만 있다 — 팝업 초기 번들에서 제외된다 (ui-refine 08).
const SortableProfileList = lazy(() => import('./sortable-profile-list'));

export interface ProfileSidebarProps {
  profiles: readonly Profile[];
  selectedId: string | null;
  /** 전역 일시정지 — 행 표시만 정지로 덮는다(저장된 active는 불변, 티켓 13). */
  paused: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  /** 순서 변경 — 드롭이 move-profile 명령으로 귀결된다 (상태 전이는 앱 레이어). */
  onReorder: (profileId: string, toIndex: number) => void;
  /** 인라인 on/off — 목록에서 바로 켜고 끈다 (티켓 10). */
  onToggleActive: (profileId: string, active: boolean) => void;
}

/** 정적 목록 — dnd 로드 전 fallback(그립 정적) + 검색 중 목록(재정렬 비활성). */
function StaticList({
  profiles,
  selectedId,
  paused,
  onSelect,
  onToggleActive,
  withGrip,
}: {
  profiles: readonly Profile[];
  selectedId: string | null;
  paused: boolean;
  onSelect: (id: string) => void;
  onToggleActive: (profileId: string, active: boolean) => void;
  withGrip: boolean;
}) {
  const t = useT();
  return (
    <ul className={sidebarListClass}>
      {profiles.map((profile) => {
        // 드래그 목록과 **같은 파생**을 쓴다 — 한쪽만 다르면 lazy 로드 순간 수·정지 표식이
        // 튄다(sidebarRowClass가 지키는 no-jump 계약의 값 쪽).
        const status = profileRowStatus(profile, paused);
        return (
          <li key={profile.id} className={sidebarRowClass}>
            {withGrip && <ProfileGrip label={profileReorderLabel(profile, t)} />}
            <ProfileSelectRow
              profile={profile}
              status={status}
              selected={profile.id === selectedId}
              onSelect={() => onSelect(profile.id)}
              onToggleActive={(active) => onToggleActive(profile.id, active)}
              label={profileSelectLabel(profile, t, status.state)}
              toggleLabel={profileToggleLabel(profile, t)}
            />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 프로필 사이드바 (ADR 0005) — 양 표면 공용 목록 + 검색 + 드래그 재정렬 (ui-refine 06).
 * 그립 드래그(PointerSensor)나 키보드(KeyboardSensor)로 순서를 바꾸며, 드롭은
 * move-profile 명령으로 귀결된다. 검색 중에는 재정렬을 끈다(부분 목록 순서 변경은
 * 의미가 모호). 드래그 목록은 dnd-kit을 쓰는 lazy 청크라, 로드 전엔 같은 모양의 정적
 * 목록(그립 정적)을 그려 초기 번들을 억제하면서 시각 점프를 피한다 (ui-refine 08).
 */
export function ProfileSidebar({
  profiles,
  selectedId,
  paused,
  onSelect,
  onCreate,
  onReorder,
  onToggleActive,
}: ProfileSidebarProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtering = q !== '';
  const visible = filtering ? profiles.filter((p) => p.name.toLowerCase().includes(q)) : profiles;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Input
        size="sm"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('searchProfiles')}
        aria-label={t('searchProfiles')}
      />
      {filtering ? (
        // 검색 중엔 그립 없는 정적 목록 — 비활성 그립 어포던스 오해 방지.
        <StaticList
          profiles={visible}
          selectedId={selectedId}
          paused={paused}
          onSelect={onSelect}
          onToggleActive={onToggleActive}
          withGrip={false}
        />
      ) : (
        <Suspense
          fallback={
            <StaticList
              profiles={profiles}
              selectedId={selectedId}
              paused={paused}
              onSelect={onSelect}
              onToggleActive={onToggleActive}
              withGrip
            />
          }
        >
          <SortableProfileList
            profiles={profiles}
            selectedId={selectedId}
            paused={paused}
            onSelect={onSelect}
            onReorder={onReorder}
            onToggleActive={onToggleActive}
          />
        </Suspense>
      )}
      <SwitcherChip className="w-auto self-start text-muted-foreground" onClick={onCreate}>
        + {t('newProfile')}
      </SwitcherChip>
    </div>
  );
}
