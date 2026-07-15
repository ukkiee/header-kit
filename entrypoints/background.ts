import { computeBadge } from '@/core/badge';
import type { Command } from '@/core/commands';
import { compile, type TabInfo } from '@/core/compile';
import { createCommandExecutor } from '@/core/executor';
import { hasExpiredProfiles, nextExpiry } from '@/core/expiry';
import { createReconciler } from '@/core/reconciler';
import type { NetRule } from '@/core/rules';
import type { StoredState } from '@/core/schema';
import { loadState, onCommand, onStateChanged, persistState } from '@/storage/state';
import { performBackup } from '@/storage/backupStore';
import { onTabsChanged, queryTabInfos } from '@/storage/tabs';
import { exportProfiles, serializeExport } from '@/core/transfer';

const EXPIRY_ALARM = 'headerkit-expiry';

interface Snapshot {
  state: StoredState;
  tabs: TabInfo[];
  now: number;
}

async function replaceSessionRules(rules: NetRule[]): Promise<void> {
  const existing = await browser.declarativeNetRequest.getSessionRules();
  await browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: rules as Browser.declarativeNetRequest.Rule[],
  });
}

async function validateRegexPattern(pattern: string): Promise<string | null> {
  const trimmed = pattern.trim();
  if (trimmed === '') return null;
  const { isSupported, reason } = await browser.declarativeNetRequest.isRegexSupported({
    regex: trimmed,
  });
  return isSupported ? null : `Invalid regex pattern (${reason ?? 'unsupported'})`;
}

/** 저장 시점 검증: regex Filter는 플랫폼이 실제 지원하는지 확인 후에만 저장된다. */
async function validateCommand(command: Command): Promise<string | null> {
  if (command.type === 'add-filter' || command.type === 'update-filter') {
    const filter = command.filter;
    if (filter.kind !== 'url' && filter.kind !== 'exclude-url') return null;
    return validateRegexPattern(filter.pattern);
  }

  // Import도 전량 수용/거부 — regex 하나라도 플랫폼이 거부하면 전체를 거부하되,
  // 오류는 항목 단위로 전부 모아 알려준다.
  if (command.type === 'import-profiles') {
    const errors: string[] = [];
    for (const profile of command.profiles) {
      for (const [index, filter] of profile.filters.entries()) {
        if (filter.kind !== 'url' && filter.kind !== 'exclude-url') continue;
        const error = await validateRegexPattern(filter.pattern);
        if (error !== null) {
          errors.push(`"${profile.name}" ${filter.kind} filter #${index + 1}: ${error}`);
        }
      }
    }
    if (errors.length > 0) return errors.join('\n');
  }
  return null;
}

async function applyBadge(state: StoredState): Promise<void> {
  const badge = computeBadge(state);
  await browser.action.setBadgeText({ text: badge.text });
  await browser.action.setBadgeBackgroundColor({ color: badge.color });
}

/** 다음 Time Filter 만료에 알람을 건다 — 만료 예정이 없으면 알람을 지운다. */
async function scheduleExpiryAlarm(state: StoredState, now: number): Promise<void> {
  const when = nextExpiry(state, now);
  if (when === null) {
    await browser.alarms.clear(EXPIRY_ALARM);
  } else {
    await browser.alarms.create(EXPIRY_ALARM, { when });
  }
}

export default defineBackground(() => {
  const reconciler = createReconciler<Snapshot>({
    loadSnapshot: async () => ({
      state: await loadState(),
      tabs: await queryTabInfos(),
      now: Date.now(),
    }),
    compile: (snapshot) =>
      compile(snapshot.state.profiles, {
        paused: snapshot.state.paused,
        tabs: snapshot.tabs,
        now: snapshot.now,
        materialized: snapshot.state.materialized,
      }),
    // 규칙·배지·만료 알람을 같은 스냅샷·같은 세대 보증 아래 반영한다.
    apply: async (rules, snapshot) => {
      await replaceSessionRules(rules);
      await applyBadge(snapshot.state);
      await scheduleExpiryAlarm(snapshot.state, snapshot.now);
      // 이미 지난 만료(과거 시각 입력, SW 휴면 중 경과 등)는 알람을 기다리지
      // 않고 즉시 만료 전이를 태운다 — 규칙만 죽고 토글·배지가 켜진 채
      // 남는 거짓 상태를 방지 (만료 후에는 활성이 남지 않으므로 수렴).
      if (hasExpiredProfiles(snapshot.state, snapshot.now)) {
        void executor
          .execute({ type: 'expire-profiles', now: snapshot.now })
          .catch((error) => console.error('[HeaderKit] expiry failed', error));
      }
    },
    onError: (error) => console.error('[HeaderKit] reconcile failed', error),
  });

  // 상태 전이의 단일 권위 실행자 — 모든 쓰기는 이 큐를 거친다.
  const executor = createCommandExecutor({
    load: loadState,
    save: persistState,
    validate: validateCommand,
  });
  onCommand((command) => executor.execute(command));

  const converge = () => void reconciler.requestReconcile();

  // 자동 Backup — 변경 후 잠시 조용해지면 스냅샷을 만든다 (sync 쓰기 quota 보호).
  // planBackup이 내용 동일 스냅샷을 스킵하므로 중복·루프는 없다.
  let backupTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleBackup = () => {
    clearTimeout(backupTimer);
    backupTimer = setTimeout(() => {
      void loadState()
        .then((state) => {
          const text = serializeExport(
            exportProfiles(state, state.profiles.map((p) => p.id)),
          );
          return performBackup(text, state.profiles.length);
        })
        .catch((error) => console.error('[HeaderKit] backup failed', error));
    }, 3_000);
  };

  onStateChanged(() => {
    converge();
    scheduleBackup();
  });
  onTabsChanged(converge);
  browser.runtime.onStartup.addListener(converge);
  browser.runtime.onInstalled.addListener(converge);
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== EXPIRY_ALARM) return;
    // 만료 전이도 단일 writer 경로를 지난다 — 저장 변경이 재컴파일·배지를 촉발한다.
    void executor
      .execute({ type: 'expire-profiles', now: Date.now() })
      .catch((error) => console.error('[HeaderKit] expiry failed', error));
  });

  // Service worker가 깨어날 때마다 저장소 기준으로 수렴시킨다.
  converge();
});
