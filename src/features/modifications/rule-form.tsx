import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { MessageKey } from '@/core/i18n';
import { isRequestAppendAllowed } from '@/core/rules';
import {
  createModification,
  normalizeConditions,
  type CspModification,
  type Modification,
  type ModificationKind,
  type UrlMatchType,
} from '@/core/schema';
import { RuleConditionsFields } from './rule-conditions-fields';
import { hasPlaceholders } from '@/core/placeholder';
import { Alert } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { LargeEditor } from '@/ui/large-editor';
import { NoteText } from '@/ui/note-text';
import { Field, fieldCaption } from '@/ui/field';
import { Select } from '@/ui/select';
import { useT } from '@/ui/i18n-context';
import { HeaderNameInput } from './header-name-input';

export interface RuleFormProps {
  /** 편집이면 기존 규칙, 생성이면 undefined. */
  initial?: Modification;
  /** 저장 — 권위 실행 결과를 돌려받아 거부(예: invalid regex)를 폼 안에서 보여준다. */
  onSave: (modification: Modification) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
  userHeaders?: readonly string[];
}

const RULE_KINDS: ModificationKind[] = [
  'request-header',
  'response-header',
  'cookie',
  'set-cookie',
  'csp',
  'redirect',
];

/**
 * 규칙 폼 (ADR 0006) — 종류를 고르면 그 종류의 필드가 나타나고, Save가 규칙
 * 전체를 원자적으로 저장한다. 초안은 로컬 — 취소가 아무것도 흘리지 않는다.
 */
export function RuleForm({ initial, onSave, onCancel, userHeaders = [] }: RuleFormProps) {
  const t = useT();
  const [draft, setDraft] = useState<Modification>(() => initial ?? createModification('request-header'));
  // 매치 방식 기본값: 기존 규칙에 필터가 있었으면 regex(하위 호환), 아니면 contains.
  const defaultMatchType: UrlMatchType =
    initial && 'urlFilter' in initial && initial.urlFilter ? 'regex' : 'contains';
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

  const switchKind = (kind: ModificationKind) => {
    if (kind === draft.kind) return;
    // 종류 전환은 새 초안 — 공유 가능한 건 id/enabled/메모/조건뿐이다.
    const next = createModification(kind, draft.id);
    setDraft({
      ...next,
      enabled: draft.enabled,
      comment: draft.comment,
      ...(draft.conditions ? { conditions: draft.conditions } : {}),
    } as Modification);
  };

  const save = async () => {
    setSaving(true);
    // 스코프 정리: 필터가 비면 매치 방식도 벗기고, 있으면 셀렉트 기본값을 확정한다.
    let toSave = draft;
    if (draft.kind !== 'redirect' && 'urlFilter' in draft) {
      if (!draft.urlFilter) {
        const { urlFilter: _f, urlMatchType: _m, ...rest } = draft;
        toSave = rest as Modification;
      } else if (!('urlMatchType' in draft) || draft.urlMatchType === undefined) {
        toSave = { ...draft, urlMatchType: defaultMatchType } as Modification;
      }
    }
    // 조건 정리: 빈 필드 제거, 전부 비면 conditions 자체를 벗긴다.
    const normalized = normalizeConditions(toSave.conditions ?? {});
    if (normalized) {
      toSave = { ...toSave, conditions: normalized } as Modification;
    } else if (toSave.conditions !== undefined) {
      const { conditions: _c, ...rest } = toSave;
      toSave = rest as Modification;
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
          onValueChange={(value) => switchKind(value as ModificationKind)}
          options={RULE_KINDS.map((kind) => ({ value: kind, label: t(KIND_LABELS[kind]) }))}
        />
      </Field>

      {/* 한 캡션 아래 두 컨트롤(매치 방식+패턴) — Field 라벨 자동 연결이 두 컨트롤에
          같은 이름을 주므로, 캡션은 span으로 두고 각 컨트롤이 자기 aria-label을 가진다. */}
      {draft.kind !== 'redirect' && (
        <div className="flex flex-col gap-1">
          <span className={fieldCaption}>{t('urlFilterScope')}</span>
          <div className="flex items-center gap-1.5">
            <Select
              variant="bordered"
              size="md"
              aria-label={t('ariaUrlMatchType')}
              value={('urlMatchType' in draft ? draft.urlMatchType : undefined) ?? defaultMatchType}
              onValueChange={(value) =>
                setDraft({ ...draft, urlMatchType: value as UrlMatchType } as Modification)
              }
              className="shrink-0"
              options={[
                { value: 'contains', label: t('matchContains') },
                { value: 'domain', label: t('matchDomain') },
                { value: 'prefix', label: t('matchPrefix') },
                { value: 'regex', label: t('matchRegex') },
              ]}
            />
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
        </div>
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
                onValueChange={(value) =>
                  setDraft({ ...draft, mode: value as 'override' | 'append' } as Modification)
                }
                disabled={!appendAllowed}
                options={[
                  { value: 'override', label: t('override') },
                  ...(appendAllowed ? [{ value: 'append', label: t('append') }] : []),
                ]}
              />
            </Field>
            <Field label={t('emptyValueMeans')}>
              <Select
                variant="bordered"
                size="md"
                value={draft.emptyMeans}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    emptyMeans: value as 'remove' | 'send-empty',
                  } as Modification)
                }
                options={[
                  { value: 'remove', label: t('remove') },
                  { value: 'send-empty', label: t('sendEmpty') },
                ]}
              />
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

      {/* 조건 (ADR 0010) — 접이식, 기존 조건이 있으면 펼쳐서 시작 */}
      <details open={draft.conditions !== undefined} className="group">
        <summary className="cursor-pointer list-none text-xs font-medium text-zinc-500 select-none hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
          {t('conditionsCaption')}
        </summary>
        <div className="pt-3">
          <RuleConditionsFields
            conditions={draft.conditions ?? {}}
            onChange={(conditions) => setDraft({ ...draft, conditions } as Modification)}
          />
        </div>
      </details>

      <Field label={t('comment')}>
        <Input
          value={draft.comment}
          onChange={(e) => setDraft({ ...draft, comment: e.target.value } as Modification)}
        />
      </Field>

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
