import type { Profile } from '@/core/schema';
import { useT } from '@/ui/i18n-context';
import { SwitcherChip } from '@/ui/switcher-chip';
import { ProfileDot } from './profile-dot';

export interface ProfileChipsProps {
  profiles: readonly Profile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

/**
 * 프로필 칩 스위처 (ADR 0004) — 단일 프로필 뷰의 내비게이션. 도트가 on/off를,
 * 칩 순서가 겹침 우선순위를 표현한다. wrap+truncate로 420px에서 가로
 * 오버플로하지 않는다 (가로 스크롤·overflow 메뉴 없음 — 전 프로필 상태 가시 우선).
 * on/off는 aria-label에도 실어 smoke·스크린리더가 도트와 같은 상태를 읽는다.
 */
export function ProfileChips({ profiles, selectedId, onSelect, onCreate }: ProfileChipsProps) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1">
      {profiles.map((profile) => (
        <SwitcherChip
          key={profile.id}
          selected={profile.id === selectedId}
          aria-label={`Select profile ${profile.name} (${profile.active ? 'on' : 'off'})`}
          onClick={() => onSelect(profile.id)}
        >
          <ProfileDot profile={profile} />
          <span className="max-w-28 truncate">{profile.name}</span>
        </SwitcherChip>
      ))}
      <SwitcherChip className="text-zinc-500 dark:text-zinc-400" onClick={onCreate}>
        + {t('newProfile')}
      </SwitcherChip>
    </div>
  );
}
