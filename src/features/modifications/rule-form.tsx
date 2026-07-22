import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { MessageKey } from '@/core/i18n';
import { isRequestAppendAllowed } from '@/core/rules';
import {
  createFilter,
  createModification,
  type CspModification,
  type Filter,
  type FilterKind,
  type Modification,
  type ModificationKind,
  type UrlMatchType,
} from '@/core/schema';
import type { TabPickerOptions } from '@/platform/tabs';
import { FilterEditor } from '@/features/filters/filter-editor';
import { FILTER_KIND_LABELS } from '@/features/filters/filter-summary';
import { hasPlaceholders } from '@/core/placeholder';
import { Alert } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { LargeEditor } from '@/ui/large-editor';
import { NoteText } from '@/ui/note-text';
import { Select } from '@/ui/select';
import { useT } from '@/ui/i18n-context';
import { HeaderNameInput } from './header-name-input';

/** 폼이 다루는 항목 — 규칙(Modification) 또는 적용 조건(Filter) (ADR 0009). */
export type FormItem = Modification | Filter;

export interface RuleFormProps {
  /** 편집이면 기존 항목, 생성이면 undefined. */
  initial?: FormItem;
  /** 저장 — 권위 실행 결과를 돌려받아 거부(예: invalid regex)를 폼 안에서 보여준다. */
  onSave: (item: FormItem) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
  userHeaders?: readonly string[];
  /** 탭 계열 조건 선택기의 표시 옵션. */
  pickerOptions?: TabPickerOptions;
}

const RULE_KINDS: ModificationKind[] = [
  'request-header',
  'response-header',
  'cookie',
  'set-cookie',
  'csp',
  'redirect',
];

const FILTER_KINDS: FilterKind[] = [
  'url',
  'exclude-url',
  'resource-type',
  'request-method',
  'initiator-domain',
  'tab',
  'tab-group',
  'window',
  'tab-domain',
  'time',
];

const RULE_KIND_SET = new Set<string>(RULE_KINDS);

/** Modification과 Filter는 kind 값 공간이 겹치지 않는다 — kind만으로 판별한다. */
export function isRuleItem(item: FormItem): item is Modification {
  return RULE_KIND_SET.has(item.kind);
}

/** 라벨 위, 입력 아래 — 폼 필드 공통 셸. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
      {label}
      {children}
    </label>
  );
}

/**
 * 규칙 폼 (ADR 0006) — 종류를 고르면 그 종류의 필드가 나타나고, Save가 규칙
 * 전체를 원자적으로 저장한다. 초안은 로컬 — 취소가 아무것도 흘리지 않는다.
 */
export function RuleForm({ initial, onSave, onCancel, userHeaders = [], pickerOptions }: RuleFormProps) {
  const t = useT();
  const [draft, setDraft] = useState<FormItem>(() => initial ?? createModification('request-header'));
  // 매치 방식 기본값: 기존 규칙에 필터가 있었으면 regex(하위 호환), 아니면 contains.
  const defaultMatchType: UrlMatchType =
    initial && isRuleItem(initial) && 'urlFilter' in initial && initial.urlFilter ? 'regex' : 'contains';
  const isRule = isRuleItem(draft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const KIND_LABELS: Record<ModificationKind, MessageKey> = {
    'request-header': 'kindRequestHeader',
    'response-header': 'kindResponseHeader',
    cookie: 'modCookie',
    'set-cookie': 'modSetCookie',
    csp: 'modCsp',
    redirect: 'modRedirect',
  };

  const switchKind = (kind: ModificationKind | FilterKind) => {
    if (kind === draft.kind) return;
    // 종류 전환은 새 초안 — 공유 가능한 건 id/enabled(+규칙 간 메모)뿐이다.
    if (RULE_KIND_SET.has(kind)) {
      const next = createModification(kind as ModificationKind, draft.id);
      const comment = isRuleItem(draft) ? draft.comment : '';
      setDraft({ ...next, enabled: draft.enabled, comment } as Modification);
    } else {
      const next = createFilter(kind as FilterKind, draft.id);
      setDraft({ ...next, enabled: draft.enabled } as Filter);
    }
  };

  const save = async () => {
    setSaving(true);
    // 스코프 정리: 필터가 비면 매치 방식도 벗기고, 있으면 셀렉트 기본값을 확정한다.
    let toSave = draft;
    if (isRuleItem(draft) && draft.kind !== 'redirect' && 'urlFilter' in draft) {
      if (!draft.urlFilter) {
        const { urlFilter: _f, urlMatchType: _m, ...rest } = draft;
        toSave = rest as Modification;
      } else if (!('urlMatchType' in draft) || draft.urlMatchType === undefined) {
        toSave = { ...draft, urlMatchType: defaultMatchType } as Modification;
      }
    }
    const result = await onSave(toSave);
    setSaving(false);
    if (!result.ok) setError(result.error ?? t('saveRejected'));
  };

  const isValueKind =
    draft.kind === 'request-header' ||
    draft.kind === 'response-header' ||
    draft.kind === 'cookie' ||
    draft.kind === 'set-cookie';
  const appendAllowed =
    draft.kind === 'cookie' ||
    draft.kind === 'set-cookie' ||
    draft.kind === 'response-header' ||
    (draft.kind === 'request-header' && isRequestAppendAllowed(draft.name));

  const setCspDirectives = (directives: CspModification['directives']) =>
    setDraft({ ...(draft as CspModification), directives });

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
      <Field label={t('ruleKind')}>
        <Select
          variant="bordered"
          size="md"
          value={draft.kind}
          aria-label={t('ruleKind')}
          onChange={(e) => switchKind(e.target.value as ModificationKind | FilterKind)}
        >
          <optgroup label={t('groupRules')}>
            {RULE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(KIND_LABELS[kind])}
              </option>
            ))}
          </optgroup>
          <optgroup label={t('conditionsCaption')}>
            {FILTER_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(FILTER_KIND_LABELS[kind])}
              </option>
            ))}
          </optgroup>
        </Select>
      </Field>

      {isRule && draft.kind !== 'redirect' && (
        <Field label={t('urlFilterScope')}>
          <div className="flex items-center gap-1.5">
            <Select
              variant="bordered"
              size="md"
              aria-label={t('ariaUrlMatchType')}
              value={('urlMatchType' in draft ? draft.urlMatchType : undefined) ?? defaultMatchType}
              onChange={(e) =>
                setDraft({ ...draft, urlMatchType: e.target.value as UrlMatchType } as Modification)
              }
              className="shrink-0"
            >
              <option value="contains">{t('matchContains')}</option>
              <option value="domain">{t('matchDomain')}</option>
              <option value="prefix">{t('matchPrefix')}</option>
              <option value="regex">{t('matchRegex')}</option>
            </Select>
            <Input
              font="mono"
              value={'urlFilter' in draft ? (draft.urlFilter ?? '') : ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  urlFilter: e.target.value === '' ? undefined : e.target.value,
                } as Modification)
              }
              placeholder="api.example.com"
              aria-label={t('urlFilterScope')}
              className="min-w-0 flex-1"
            />
          </div>
        </Field>
      )}

      {isValueKind && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {'name' in draft ? (
              <Field label={t('headerName')}>
                <HeaderNameInput
                  value={draft.name}
                  onChange={(name) => setDraft({ ...draft, name } as Modification)}
                  userHeaders={userHeaders}
                />
              </Field>
            ) : (
              <span />
            )}
            <Field label={t('value')}>
              <div className="flex items-center gap-1">
                <Input
                  value={draft.value}
                  onChange={(e) => setDraft({ ...draft, value: e.target.value } as Modification)}
                  aria-label={t('ariaHeaderValue')}
                  className="min-w-0 flex-1"
                />
                <LargeEditor
                  title={`${t('value')} — ${('name' in draft && draft.name) || t('headerName')}`}
                  value={draft.value}
                  onCommit={(value) => setDraft({ ...draft, value } as Modification)}
                />
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('mode')}>
              <Select
                variant="bordered"
                size="md"
                value={draft.mode}
                onChange={(e) =>
                  setDraft({ ...draft, mode: e.target.value as 'override' | 'append' } as Modification)
                }
                disabled={!appendAllowed}
              >
                <option value="override">{t('override')}</option>
                {appendAllowed && <option value="append">{t('append')}</option>}
              </Select>
            </Field>
            <Field label={t('emptyValueMeans')}>
              <Select
                variant="bordered"
                size="md"
                value={draft.emptyMeans}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    emptyMeans: e.target.value as 'remove' | 'send-empty',
                  } as Modification)
                }
              >
                <option value="remove">{t('remove')}</option>
                <option value="send-empty">{t('sendEmpty')}</option>
              </Select>
            </Field>
          </div>
          {draft.kind === 'response-header' && <NoteText>{t('responsePanelNote')}</NoteText>}
          {hasPlaceholders(draft.value) && <NoteText>{t('placeholderNote')}</NoteText>}
        </>
      )}

      {draft.kind === 'csp' && (
        <div className="flex flex-col gap-1.5">
          {draft.directives.map((directive, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                size="sm"
                value={directive.name}
                onChange={(e) =>
                  setCspDirectives(
                    draft.directives.map((d, j) => (j === i ? { ...d, name: e.target.value } : d)),
                  )
                }
                placeholder="default-src"
                aria-label={t('ariaCspDirectiveName')}
                className="w-32"
              />
              <Input
                size="sm"
                font="mono"
                value={directive.value}
                onChange={(e) =>
                  setCspDirectives(
                    draft.directives.map((d, j) => (j === i ? { ...d, value: e.target.value } : d)),
                  )
                }
                placeholder="'self'"
                aria-label={t('ariaCspDirectiveValue')}
                className="min-w-0 flex-1"
              />
              <Button
                variant="danger"
                size="sm"
                aria-label={t('ariaRemoveDirective')}
                onClick={() => setCspDirectives(draft.directives.filter((_, j) => j !== i))}
              >
                {t('remove')}
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setCspDirectives([...draft.directives, { name: '', value: '' }])}
          >
            <Plus size={14} strokeWidth={1.75} className="mr-1" />
            {t('addDirective')}
          </Button>
        </div>
      )}

      {draft.kind === 'redirect' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('ariaRedirectPattern')}>
              <Input
                font="mono"
                value={draft.pattern}
                onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
                placeholder="^https://prod\\.example\\.com/(.*)"
              />
            </Field>
            <Field label={t('ariaRedirectSubstitution')}>
              <Input
                font="mono"
                value={draft.substitution}
                onChange={(e) => setDraft({ ...draft, substitution: e.target.value })}
                placeholder="http://localhost:3000/\\1"
              />
            </Field>
          </div>
          <NoteText>{t('redirectCaptureNote')}</NoteText>
        </>
      )}

      {!isRule && (
        <FilterEditor
          filter={draft}
          onChange={(next) => setDraft(next)}
          pickerOptions={pickerOptions}
        />
      )}

      {isRule && (
        <Field label={t('comment')}>
          <Input
            value={draft.comment}
            onChange={(e) => setDraft({ ...draft, comment: e.target.value } as Modification)}
          />
        </Field>
      )}

      {error && (
        <Alert severity="danger" role="alert">
          {error}
        </Alert>
      )}

      <div className="flex items-center justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {t('save')}
        </Button>
      </div>
    </div>
  );
}
