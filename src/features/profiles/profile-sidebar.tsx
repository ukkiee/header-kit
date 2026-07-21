import { useState } from 'react';
import type { Profile } from '@/core/schema';
import { Input } from '@/ui/input';
import { SwitcherChip } from '@/ui/switcher-chip';
import { useT } from '@/ui/i18n-context';
import { ProfileDot } from './profile-dot';

export interface ProfileSidebarProps {
  profiles: readonly Profile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

/**
 * 탭 앱 사이드바 (ADR 0004) — 프로필 목록 + 검색. 선택은 팝업 칩 스위처와 같은
 * 재조정 불변식(앱 레이어 selectedId)을 공유하고, aria 규약도 동일하게 맞춰
 * smoke·스크린리더가 표면과 무관하게 같은 셀렉터를 쓴다.
 */
export function ProfileSidebar({ profiles, selectedId, onSelect, onCreate }: ProfileSidebarProps) {
  const t = useT();
  // 검색어는 사이드바 로컬 뷰 상태 — 다른 표면과 공유할 이유가 없다.
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = q ? profiles.filter((p) => p.name.toLowerCase().includes(q)) : profiles;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Input
        size="sm"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('searchProfiles')}
        aria-label="Search profiles"
      />
      <ul className="flex flex-col gap-0.5">
        {visible.map((profile) => (
          <li key={profile.id}>
            <SwitcherChip
              shape="row"
              selected={profile.id === selectedId}
              aria-label={`Select profile ${profile.name} (${profile.active ? 'on' : 'off'})`}
              onClick={() => onSelect(profile.id)}
            >
              <ProfileDot profile={profile} />
              <span className="min-w-0 truncate">{profile.name}</span>
            </SwitcherChip>
          </li>
        ))}
      </ul>
      <SwitcherChip
        shape="row"
        className="w-auto self-start text-zinc-500 dark:text-zinc-400"
        onClick={onCreate}
      >
        + {t('newProfile')}
      </SwitcherChip>
    </div>
  );
}
