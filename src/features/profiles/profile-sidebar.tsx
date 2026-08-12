import { lazy, Suspense, useState } from 'react';
import type { Profile } from '@/core/schema';
import { profileRowStatus } from '@/core/summary';
import { Input } from '@/ui/text-field';
import { useT } from '@/ui/i18n-context';
import {
  ProfileGrip,
  ProfileSelectRow,
  profileDeleteLabels,
  profileEditLabel,
  profileReorderLabel,
  profileSelectLabel,
  profileToggleLabel,
  sidebarListClass,
  sidebarRowClass,
} from './profile-dot';
import { SwitcherChip } from '@/ui/switcher-chip';
import { AnimatePresence, MotionRow } from '@/ui/row-motion';

// dnd-kit은 이 lazy 청크에만 있다 — 팝업 초기 번들에서 제외된다 (ui-refine 08).
const SortableProfileList = lazy(() => import('./sortable-profile-list'));

export interface ProfileSidebarProps {
  profiles: readonly Profile[];
  selectedId: string | null;
  /** 전역 일시정지 — 행 표시만 정지로 덮는다(저장된 active는 불변, 티켓 13). */
  paused: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  /**
   * 순서 변경 — 드롭이 move-profile 명령으로 귀결된다 (상태 전이는 앱 레이어).
   * 명령이 착지할 때까지의 약속을 돌려준다 — 드래그 목록의 낙관적 순서가 그것으로 수명을
   * 정한다(`sortable-profile-list`의 주석).
   */
  onReorder: (profileId: string, toIndex: number) => Promise<void>;
  /** 인라인 on/off — 목록에서 바로 켜고 끈다 (티켓 10). */
  onToggleActive: (profileId: string, active: boolean) => void;
  /** 프로필 삭제 (ADR 0017 개정) — 행이 2단계 확인을 마친 뒤에만 불린다. */
  onDelete: (profileId: string) => void;
  /** 이름 변경 (ADR 0017 재개정) — 행이 정규화를 마친 뒤 Enter·blur에서 한 번만 부른다. */
  onRename: (profileId: string, name: string) => void;
  /** 색 변경 (같은 개정) — 팔레트를 누른 순간이나 자유 선택 팝오버가 닫힐 때 한 번만. */
  onRecolor: (profileId: string, color: string) => void;
}

/** 정적 목록 — dnd 로드 전 fallback(그립 정적) + 검색 중 목록(재정렬 비활성). */
function StaticList({
  profiles,
  selectedId,
  paused,
  onSelect,
  onToggleActive,
  onDelete,
  onRename,
  onRecolor,
  withGrip,
}: {
  profiles: readonly Profile[];
  selectedId: string | null;
  paused: boolean;
  onSelect: (id: string) => void;
  onToggleActive: (profileId: string, active: boolean) => void;
  onDelete: (profileId: string) => void;
  onRename: (profileId: string, name: string) => void;
  onRecolor: (profileId: string, color: string) => void;
  withGrip: boolean;
}) {
  const t = useT();
  return (
    /*
     * `data-profile-list` — 어느 목록이 그려졌는지를 **관측 가능**하게 남긴다. 두 목록은
     * 같은 클래스로 같은 모양을 그리므로(no-jump 계약) 화면만 봐서는 지연 청크가 도착했는지
     * 알 수 없고, 그러면 오버플로 게이트가 **아직 아무것도 안 그려진 화면**을 훑고 "넘침
     * 없음"을 보고한다 — 빈 트리가 가장 잘 통과하는 검사가 된다.
     */
    <ul className={sidebarListClass} data-profile-list="static">
      {/* 드래그 목록과 **같은 등장·퇴장 모션**이다 — 한쪽만 움직이면 lazy 로드 순간
          시각이 갈린다(sidebarRowClass가 지키는 no-jump 계약의 모션 쪽). */}
      <AnimatePresence initial={false}>
        {profiles.map((profile) => {
          // 드래그 목록과 **같은 파생**을 쓴다 — 한쪽만 다르면 lazy 로드 순간 수·정지 표식이
          // 튄다(sidebarRowClass가 지키는 no-jump 계약의 값 쪽).
          const status = profileRowStatus(profile, paused);
          return (
            <li key={profile.id}>
              <MotionRow>
                <div className={sidebarRowClass(profile.id === selectedId)}>
                  {withGrip && <ProfileGrip label={profileReorderLabel(profile, t)} />}
                  <ProfileSelectRow
                    profile={profile}
                    status={status}
                    selected={profile.id === selectedId}
                    onSelect={() => onSelect(profile.id)}
                    onToggleActive={(active) => onToggleActive(profile.id, active)}
                    onDelete={() => onDelete(profile.id)}
                    onRename={(name) => onRename(profile.id, name)}
                    onRecolor={(color) => onRecolor(profile.id, color)}
                    label={profileSelectLabel(profile, t, status.state)}
                    toggleLabel={profileToggleLabel(profile, t)}
                    editLabel={profileEditLabel(profile, t)}
                    {...profileDeleteLabels(profile, t)}
                  />
                </div>
              </MotionRow>
            </li>
          );
        })}
      </AnimatePresence>
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
  onDelete,
  onRename,
  onRecolor,
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
          onDelete={onDelete}
          onRename={onRename}
          onRecolor={onRecolor}
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
              onDelete={onDelete}
              onRename={onRename}
              onRecolor={onRecolor}
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
            onDelete={onDelete}
            onRename={onRename}
            onRecolor={onRecolor}
          />
        </Suspense>
      )}
      <SwitcherChip className="w-auto self-start text-muted-foreground" onClick={onCreate}>
        + {t('newProfile')}
      </SwitcherChip>
    </div>
  );
}
