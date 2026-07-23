import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { MessageKey } from '@/core/i18n';
import { missingRequiredFields, type RequiredField } from '@/core/rule-validation';
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
import { Field, FieldError, fieldCaption } from '@/ui/field';
import { AnimatePresence, MotionRow } from '@/ui/motion-row';
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 진행 중 여부의 **권위 있는** 값. `saving` state는 이것을 렌더용으로 비출 뿐이다.
  // 같은 틱에 save()가 두 번 불리면 state는 아직 갱신 전이라 둘 다 통과하므로,
  // 재진입 차단은 반드시 ref로 해야 한다.
  const inFlight = useRef(false);
  // 조건 disclosure 열림 — 기존 조건이 있으면 펼쳐서 시작.
  const [condOpen, setCondOpen] = useState(draft.conditions !== undefined);
  // 저장 차단 검증 (ui-refine 04) — Save 시점에 계산, 다음 Save까지 유지.
  const [fieldErrors, setFieldErrors] = useState<readonly RequiredField[]>([]);
  const requiredError = (field: RequiredField) =>
    fieldErrors.includes(field) ? t('requiredField') : undefined;
  // CSP 디렉티브 필수 검증 — 이름 있는 디렉티브가 없으면 활성 (release r1 R-2).
  const cspError = fieldErrors.includes('directives');
  const CSP_ERROR_ID = 'csp-directives-error';

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
    // 이전 종류의 검증 오류는 새 초안과 무관하다 — 아직 Save한 적 없는데 표시되면 안 된다.
    setFieldErrors([]);
  };

  const save = async () => {
    // 이미 보낸 저장이 응답을 기다리는 중이면 아무것도 하지 않는다. 버튼의 disabled는
    // 포인터 경로만 막고, Cmd/Ctrl+Enter는 여기를 직접 부른다.
    if (inFlight.current) return;
    // 빈 필수 필드는 저장을 통과하지 못한다 — 인라인 오류로 그 자리에서 알린다.
    const missing = missingRequiredFields(draft);
    setFieldErrors(missing);
    if (missing.length > 0) return;
    inFlight.current = true;
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
    // onSave는 거부를 `{ ok: false }`로 돌려주기도 하지만, background 왕복이
    // 끊기면(워커 teardown, 확장 리로드, 컨텍스트 무효화) **던진다**. 그 경로에서
    // 진행 중 플래그가 풀리지 않으면 저장·취소·Escape가 모두 막힌 채 폼이 갇히고
    // 초안을 잃는다 — 이 변경 전에는 취소가 남아 있었으므로 회귀다.
    let result;
    try {
      result = await onSave(toSave);
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
    if (!result.ok) setSaveError(result.error ?? t('saveRejected'));
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

  const currentMatchType: UrlMatchType =
    ('urlMatchType' in draft ? draft.urlMatchType : undefined) ?? defaultMatchType;
  // 매치 방식별 예시 — 정규식일 때 평문 예시가 오해를 만들지 않게 분기한다 (ui-refine #9).
  const scopePlaceholder: Record<UrlMatchType, string> = {
    contains: 'api.example.com',
    domain: 'example.com',
    prefix: 'https://example.com/api',
    regex: '^https://.*\\.example\\.com/',
  };

  // 폼 키보드 (ui-refine 04): Esc 닫기, Cmd/Ctrl+Enter 저장 — 포털(셀렉트 팝업·대형
  // 편집기)의 Esc는 여기까지 버블되지 않는다.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      // 저장이 떠 있는 동안은 닫지 않는다 — 응답을 받을 폼이 사라진 뒤 명령이 착지하는
      // 창을 없앤다(취소 버튼을 비활성화하는 것과 같은 이유).
      if (!inFlight.current) onCancel();
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void save();
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900" onKeyDown={onKeyDown}>
      <Field label={t('ruleKind')}>
        <Select
          variant="bordered"
          size="md"
          value={draft.kind}
          aria-label={t('ruleKind')}
          onValueChange={switchKind}
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
              // 옆의 패턴 입력과 같은 행이라, 폭이 값에 따라 변하면 입력이 밀린다.
              width="fixed"
              value={('urlMatchType' in draft ? draft.urlMatchType : undefined) ?? defaultMatchType}
              onValueChange={(value) =>
                setDraft({ ...draft, urlMatchType: value } as Modification)
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
              placeholder={scopePlaceholder[currentMatchType]}
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
              <Field
                label={draft.kind === 'cookie' ? t('cookieName') : t('headerName')}
                error={requiredError('name')}
              >
                {draft.kind === 'cookie' ? (
                  // 쿠키 이름은 헤더 사전 자동완성 대상이 아니다 — 평문 입력.
                  <Input
                    autoFocus
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value } as Modification)}
                    placeholder="session_id"
                  />
                ) : (
                  <HeaderNameInput
                    autoFocus
                    value={draft.name}
                    onChange={(name) => setDraft({ ...draft, name } as Modification)}
                    userHeaders={userHeaders}
                  />
                )}
              </Field>
            ) : (
              <span />
            )}
            <Field label={t('value')}>
              <div className="flex items-center gap-1">
                <Input
                  autoFocus={draft.kind === 'set-cookie'}
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
            {/* append 불가면 모드는 선택지가 하나 — 컨트롤을 아예 숨긴다 (ui-refine #6). */}
            {appendAllowed && (
              <Field label={t('mode')}>
                <Select
                  variant="bordered"
                  size="md"
                  value={draft.mode}
                  onValueChange={(value) => setDraft({ ...draft, mode: value } as Modification)}
                  options={[
                    { value: 'override', label: t('override') },
                    { value: 'append', label: t('append') },
                  ]}
                />
              </Field>
            )}
            <Field label={t('emptyValueMeans')}>
              <Select
                variant="bordered"
                size="md"
                value={draft.emptyMeans}
                onValueChange={(value) =>
                  setDraft({ ...draft, emptyMeans: value } as Modification)
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
                autoFocus={i === 0}
                size="sm"
                value={directive.name}
                onChange={(e) =>
                  setCspDirectives(
                    draft.directives.map((d, j) => (j === i ? { ...d, name: e.target.value } : d)),
                  )
                }
                placeholder="default-src"
                aria-label={t('ariaCspDirectiveName')}
                // 디렉티브 필수(이름 있는 항목 ≥1) 검증 실패 시, 이름이 빈 입력을 invalid로 표시.
                aria-invalid={cspError && directive.name.trim() === '' ? true : undefined}
                aria-describedby={cspError ? CSP_ERROR_ID : undefined}
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
          {cspError && <FieldError id={CSP_ERROR_ID}>{t('requiredField')}</FieldError>}
        </div>
      )}

      {draft.kind === 'redirect' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('ariaRedirectPattern')} error={requiredError('pattern')}>
              <Input
                autoFocus
                font="mono"
                value={draft.pattern}
                onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
                placeholder="^https://prod\\.example\\.com/(.*)"
              />
            </Field>
            <Field label={t('ariaRedirectSubstitution')} error={requiredError('substitution')}>
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

      {/* 조건 (ADR 0010) — 접이식(controlled), 기존 조건이 있으면 펼쳐서 시작.
          열림에 height 전환을 주려고 native details 대신 상태+MotionRow로 제어한다 (ui-refine 08). */}
      <div>
        <button
          type="button"
          aria-expanded={condOpen}
          onClick={() => setCondOpen((v) => !v)}
          className="flex cursor-pointer items-center text-xs font-medium text-zinc-500 select-none hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <span className={`mr-1 inline-block transition-transform ${condOpen ? 'rotate-90' : ''}`}>›</span>
          {t('conditionsCaption')}
        </button>
        <AnimatePresence initial={false}>
          {condOpen && (
            <MotionRow>
              <div className="pt-3">
                <RuleConditionsFields
                  conditions={draft.conditions ?? {}}
                  onChange={(conditions) => setDraft({ ...draft, conditions } as Modification)}
                />
              </div>
            </MotionRow>
          )}
        </AnimatePresence>
      </div>

      <Field label={t('comment')}>
        <Input
          value={draft.comment}
          onChange={(e) => setDraft({ ...draft, comment: e.target.value } as Modification)}
        />
      </Field>

      {saveError && (
        <Alert severity="danger" role="alert">
          {saveError}
        </Alert>
      )}

      <div className="flex items-center justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          {t('cancel')}
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  );
}
