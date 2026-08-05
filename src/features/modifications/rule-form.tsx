import { useId, useRef, useState, type RefObject } from 'react';
import { X } from 'lucide-react';
import { fieldIssues, type FieldIssue, type RequiredField } from '@/core/rule-validation';
import { urlScopeBreadth } from '@/core/url-scope';
import {
  ALL_MODIFICATION_KINDS,
  createModification,
  SAME_SITE_LABEL,
  type Modification,
  type ModificationKind,
  type SameSitePolicy,
  isRawSetCookie,
  toStructuredSetCookie,
  type SetCookieParts,
} from '@/core/schema';
import { RuleConditionsFields } from './rule-conditions-fields';
import {
  convergeDraft,
  initialMatchType,
  switchDraftKind,
  tidyDraft,
  visibleMatchType,
  type VisibleMatchType,
} from './rule-draft';
import { KIND_LABELS } from './rule-summary';
import { hasPlaceholders } from '@/core/placeholder';
import { AlertBanner } from '@/ui/alert-banner';
import { Button } from '@/ui/press-button';
import { ChoiceChips } from '@/ui/chip-group';
import { IconButton } from '@/ui/icon-button';
import { Input } from '@/ui/text-field';
import { LargeEditor } from '@/ui/large-editor';
import { NoteText } from '@/ui/note-text';
import { FieldLabeled, fieldCaption, InlineFieldError } from '@/ui/field-labeled';
import { SelectOptions } from '@/ui/select-options';
import { ToggleSwitch } from '@/ui/toggle-switch';
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

/**
 * SameSite에서 "안 정함"을 나타내는 칩 값 — 스키마에는 **부재**로 저장된다.
 *
 * 정하지 않은 것과 `None`을 고른 것은 서로 다른 쿠키가 나간다(`SameSite=None`이 붙는지가
 * 갈린다). 그래서 빈 선택을 허용하는 대신 "없음" 칩을 두고, 고르면 필드를 지운다.
 */
const UNSET = 'unset';

/** 칩이 고를 수 있는 값 — 정책 셋과 "안 정함". 타입으로 닫아 두면 오타가 컴파일에서 걸린다. */
type SameSiteChoice = SameSitePolicy | typeof UNSET;

/** 허용 집합의 단일 출처(`SAME_SITE_LABEL`)에서 순서째 파생한다 — 표가 둘이 되지 않게. */
const SAME_SITE_POLICIES = Object.keys(SAME_SITE_LABEL) as SameSitePolicy[];

/**
 * 규칙 폼 (ADR 0006) — 종류를 고르면 그 종류의 필드가 나타나고, Save가 규칙
 * 전체를 원자적으로 저장한다. 초안은 로컬 — 취소가 아무것도 흘리지 않는다.
 */
export function RuleForm({ initial, onSave, onCancel, userHeaders = [] }: RuleFormProps) {
  const t = useT();
  const [draft, setDraft] = useState<Modification>(() => initial ?? createModification('request-header'));
  /*
   * 폼이 **보여 주는** 매치 방식 — 스키마의 넷을 둘로 접은 값이다 (story 21). 별도 상태로
   * 두지 않는 것이 요점이다: 초안에서 파생하면 초안과 화면이 어긋날 자리가 아예 없고,
   * 사용자가 고르는 순간 초안이 바뀌므로 수렴이 저장할 값도 같은 곳에서 나온다.
   */
  const initialVisible = initialMatchType(initial);
  const visible = visibleMatchType(draft, initialVisible);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 진행 중 여부의 **권위 있는** 값. `saving` state는 이것을 렌더용으로 비출 뿐이다.
  // 같은 틱에 save()가 두 번 불리면 state는 아직 갱신 전이라 둘 다 통과하므로,
  // 재진입 차단은 반드시 ref로 해야 한다.
  const inFlight = useRef(false);
  // 저장 차단 검증 (ui-refine 04) — Save 시점에 계산, 다음 Save까지 유지.
  const [fieldErrors, setFieldErrors] = useState<readonly FieldIssue[]>([]);
  /**
   * 넓은 스코프 Block의 확인 대기 (티켓 04). Save를 눌렀는데 스코프가 어느 도메인에도
   * 묶여 있지 않으면 여기 불이 켜지고, 사용자가 한 번 더 명시적으로 눌러야 저장된다 —
   * 요청을 통째로 없애는 종류라 "실수로 눌렀다"와 "정말 원한다"를 구별해야 한다.
   */
  const [wideScopePending, setWideScopePending] = useState(false);

  /**
   * 필수 필드 → 그 값을 입력하는 요소. 저장이 검증으로 막히면 첫 누락 필드로 포커스를
   * 옮겨, 사용자가 어디를 고쳐야 하는지 찾지 않게 한다(stories 12~16).
   *
   * ref 객체를 종류별 렌더 분기와 **1:1로** 둔다 — 콜백 ref를 매 렌더 새로 만들면
   * React가 떼었다 붙이기를 반복하고, 맵 하나에 몰아넣으면 어느 분기가 어느 키를
   * 채우는지 읽어 낼 수 없다. `RequiredField`가 늘면 여기서 타입이 먼저 깨진다.
   */
  const nameRef = useRef<HTMLInputElement>(null);
  const patternRef = useRef<HTMLInputElement>(null);
  const substitutionRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);
  const urlFilterRef = useRef<HTMLInputElement>(null);
  // 다중 컨트롤 행이라 Field의 자동 연결을 못 쓴다 — 오류를 입력에 직접 이어 준다.
  const scopeErrorId = useId();
  const requiredFieldRefs: Record<RequiredField, RefObject<HTMLInputElement | null>> = {
    name: nameRef,
    pattern: patternRef,
    substitution: substitutionRef,
    value: valueRef,
    urlFilter: urlFilterRef,
  };
  /** 막힌 이유마다 다른 문구 — "필수"와 "이 패턴은 못 쓴다"는 사용자가 할 일이 다르다. */
  const fieldError = (field: RequiredField) => {
    const issue = fieldErrors.find((e) => e.field === field);
    if (!issue) return undefined;
    return issue.reason === 'required' ? t('requiredField') : t('unsupportedPattern');
  };

  const switchKind = (kind: ModificationKind) => {
    if (kind === draft.kind) return;
    setDraft(switchDraftKind(draft, kind));
    // 이전 종류의 검증 오류는 새 초안과 무관하다 — 아직 Save한 적 없는데 표시되면 안 된다.
    setFieldErrors([]);
    // 확인 대기도 이전 종류의 것이다 — Block에서 벗어나면 경고가 남아 있을 이유가 없다.
    setWideScopePending(false);
  };

  /**
   * 저장될 모양의 초안 — 정리한 뒤 **수렴**시킨다 (ADR 0017, 티켓 06).
   *
   * **검증보다 먼저** 이걸 만드는 것이 중요하다. 새 규칙의 `urlMatchType`은 셀렉트가
   * 기본값(와일드카드)을 보여 주기만 할 뿐 초안에는 아직 없는데, core는 부재를 regex로
   * 읽는다(ADR 0008 하위 호환). 정리 전 초안을 검증에 넘기면 화면은 "와일드카드"인데
   * 검증은 정규식으로 판정해, 멀쩡한 패턴이 "이 패턴은 못 쓴다"로 막힌다.
   *
   * 판단은 전부 `rule-draft`의 순수 함수가 한다 — 여기서는 부르기만 한다.
   */
  const normalizedDraft = (): Modification => convergeDraft(tidyDraft(draft), visible);

  /**
   * 초안 패치 (structure r1 S-2) — 응답 쿠키의 **재료를 건드리면 원시 보존에서 벗어난다**.
   *
   * 그러지 않으면 폼이 이름·값을 고쳐 저장하고 "성공"이라 말한 뒤에도 옛 줄이 계속 나간다.
   * 벗어나는 문은 `toStructuredSetCookie` 하나뿐이고 그것이 raw를 지운다. 벗어나기 전의
   * 줄은 아래 안내에 그대로 보이므로 무엇을 대신 놓는 중인지 보고 고칠 수 있다.
   */
  const patchDraft = (patch: Record<string, unknown>) => {
    if (draft.kind === 'set-cookie' && isRawSetCookie(draft)) {
      setDraft(toStructuredSetCookie(draft, { name: '', value: '', ...patch } as SetCookieParts));
      return;
    }
    setDraft({ ...draft, ...patch } as Modification);
  };

  const save = async (confirmedWideScope = false) => {
    // 이미 보낸 저장이 응답을 기다리는 중이면 아무것도 하지 않는다. 버튼의 disabled는
    // 포인터 경로만 막고, Cmd/Ctrl+Enter는 여기를 직접 부른다.
    if (inFlight.current) return;
    const toSave = normalizedDraft();
    // 빈 필수 필드는 저장을 통과하지 못한다 — 인라인 오류로 그 자리에서 알린다.
    const issues = fieldIssues(toSave);
    setFieldErrors(issues);
    // 첫 누락 항목으로 — Redirect에서 패턴·치환이 둘 다 비면 검증이 패턴을 먼저
    // 돌려주므로(rule-validation의 push 순서) 자연스러운 입력 순서를 따른다.
    const firstIssue = issues[0];
    if (firstIssue) {
      requiredFieldRefs[firstIssue.field].current?.focus();
      return;
    }
    /*
     * 넓은 스코프 Block은 한 번 더 물어본다 — 검증과 달리 저장을 금지하는 게 아니라,
     * 무엇이 일어날지 보여 주고 사용자가 다시 누르게 한다. 검증과 **같은 초안**을 보므로
     * 두 판정이 매치 방식을 다르게 읽는 일이 없다.
     */
    if (
      toSave.kind === 'block' &&
      !confirmedWideScope &&
      urlScopeBreadth(toSave.urlFilter, toSave.urlMatchType) === 'wide'
    ) {
      setWideScopePending(true);
      return;
    }
    inFlight.current = true;
    setSaving(true);
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

  // 고른 방식에 맞는 예시 — 정규식일 때 평문 예시가 오해를 만들지 않게 분기한다 (story 22).
  const scopePlaceholder: Record<VisibleMatchType, string> = {
    contains: 'api.example.com',
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

  const editing = initial !== undefined;
  const isCookieKind = draft.kind === 'cookie' || draft.kind === 'set-cookie';

  /** 캡션 + 택1 칩 — 캡션은 span이고 그룹이 aria-label로 이름을 갖는다 (ADR 0011). */
  const chipField = <T extends string>(
    caption: string,
    value: T,
    options: readonly { value: T; label: string }[],
    onPick: (picked: T) => void,
  ) => (
    <div className="flex flex-col gap-1">
      <span className={fieldCaption}>{caption}</span>
      <ChoiceChips value={value} options={options} onValueChange={onPick} aria-label={caption} />
    </div>
  );

  /** 끔/켬 두 칩 — 부재와 `false`는 같은 뜻이라(속성이 안 붙는다) 한 칩으로 접는다. */
  const boolOptions = [
    { value: 'off' as const, label: t('toggleOff') },
    { value: 'on' as const, label: t('toggleOn') },
  ];
  const boolChipValue = (flag: boolean | undefined) => (flag ? ('on' as const) : ('off' as const));

  return (
    <div className="@container flex flex-col gap-3 rounded-lg bg-secondary p-3" onKeyDown={onKeyDown}>
      {/*
        폼 맨 위 — 지금이 새 규칙인지 편집인지와 닫기 (story 19). 아코디언에서는 카드가
        어느 행 아래에 붙었는지로도 알 수 있지만, 새 규칙 폼은 붙을 행이 없다.
      */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">
          {t(editing ? 'editRuleTitle' : 'newRuleTitle')}
        </span>
        <div className="ml-auto">
          <IconButton label={t('ariaCloseForm')} icon={X} onClick={onCancel} disabled={saving} />
        </div>
      </div>

      {/* 첫 줄은 이름(메모)과 규칙 종류다 (story 20). */}
      <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
        <FieldLabeled label={t('ruleName')}>
          <Input
            value={draft.comment}
            onChange={(e) => setDraft({ ...draft, comment: e.target.value } as Modification)}
          />
        </FieldLabeled>
        <FieldLabeled label={t('ruleKind')}>
          <SelectOptions
            value={draft.kind}
            aria-label={t('ruleKind')}
            onValueChange={switchKind}
            options={ALL_MODIFICATION_KINDS.map((kind) => ({
              value: kind,
              label: t(KIND_LABELS[kind]),
            }))}
          />
        </FieldLabeled>
      </div>

      {/* 한 캡션 아래 두 컨트롤(매치 방식+패턴) — Field 라벨 자동 연결이 두 컨트롤에
          같은 이름을 주므로, 캡션은 span으로 두고 각 컨트롤이 자기 aria-label을 가진다. */}
      {draft.kind !== 'redirect' && (
        <div className="flex flex-col gap-1">
          <span className={fieldCaption}>{t('urlFilterScope')}</span>
          <div className="flex items-center gap-1.5">
            {/*
              고를 것은 **둘뿐**이다 (story 21). 스키마의 `domain`·`prefix`는 남아 있고
              여기서 와일드카드 쪽으로 접혀 보인다 — 저장하면 그때 수렴한다.
            */}
            <SelectOptions
              aria-label={t('ariaUrlMatchType')}
              // 옆의 패턴 입력과 같은 행이라, 폭이 값에 따라 변하면 입력이 밀린다.
              // width가 폭을 고정하고, 아래 shrink-0은 좁은 자리에서 눌리지 않게 지킨다.
              width="fixed"
              value={visible}
              onValueChange={(value) => {
                setDraft({ ...draft, urlMatchType: value } as Modification);
                // 같은 문자열도 매치 방식이 달라지면 폭이 달라진다 — 확인을 다시 받는다.
                setWideScopePending(false);
              }}
              className="shrink-0"
              options={[
                { value: 'contains', label: t('matchWildcard') },
                { value: 'regex', label: t('matchRegex') },
              ]}
            />
            <Input
              ref={urlFilterRef}
              // Block에서는 이 입력이 규칙의 전부라, 폼을 열면 여기부터 채우게 한다.
              autoFocus={draft.kind === 'block'}
              value={'urlFilter' in draft ? (draft.urlFilter ?? '') : ''}
              onChange={(e) => {
                setDraft({
                  ...draft,
                  urlFilter: e.target.value === '' ? undefined : e.target.value,
                } as Modification);
                // 스코프를 고치는 중이면 경고를 내린다 — 좁히려는 사람에게 낡은 경고를
                // 계속 보여 주면 확인 버튼을 누르는 쪽으로 떠민다.
                setWideScopePending(false);
              }}
              placeholder={scopePlaceholder[visible]}
              aria-label={t('urlFilterScope')}
              aria-invalid={fieldError('urlFilter') !== undefined || undefined}
              aria-describedby={fieldError('urlFilter') ? scopeErrorId : undefined}
              className="min-w-0 flex-1 font-mono"
            />
          </div>
          {/* Field 컨텍스트를 못 쓰는 다중 컨트롤 행이라 인라인 오류를 직접 놓는다 —
              모양·role은 FieldLabeled의 오류와 같은 것을 쓴다. */}
          {fieldError('urlFilter') && (
            <InlineFieldError id={scopeErrorId}>{fieldError('urlFilter')}</InlineFieldError>
          )}
        </div>
      )}

      {/*
        Block — 이름도 값도 묻지 않는다. 무엇을 막을지는 위의 URL 스코프가 전부 정하므로
        이 종류의 폼은 스코프 + 조건 + 메모뿐이다 (ADR 0015).
      */}
      {draft.kind === 'block' && <NoteText>{t('blockNote')}</NoteText>}

      {/*
        User-Agent — 값 하나만 받는다. 헤더 이름은 `User-Agent`로 고정이라 묻지 않는다
        (물으면 오타로 조용히 동작하지 않는 규칙이 생긴다, ADR 0015).
      */}
      {draft.kind === 'user-agent' && (
        <FieldLabeled label={t('userAgentValue')} error={fieldError('value')}>
          <Input
            ref={valueRef}
            autoFocus
            className="font-mono"
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
            placeholder="Mozilla/5.0 …"
          />
        </FieldLabeled>
      )}

      {/*
        Header Removal — 지울 이름만 받는다. 값·모드가 없다(요청·응답 양쪽에서 지우는
        것이 이 종류의 전부다).
      */}
      {draft.kind === 'header-removal' && (
        <FieldLabeled label={t('headerName')} error={fieldError('name')}>
          <HeaderNameInput
            ref={nameRef}
            autoFocus
            value={draft.name}
            onChange={(name) => setDraft({ ...draft, name })}
            userHeaders={userHeaders}
          />
        </FieldLabeled>
      )}

      {isValueKind && (
        <>
          <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
            {'name' in draft ? (
              <FieldLabeled
                label={isCookieKind ? t('cookieName') : t('headerName')}
                error={fieldError('name')}
              >
                {isCookieKind ? (
                  // 쿠키 이름은 헤더 사전 자동완성 대상이 아니다 — 평문 입력.
                  <Input
                    ref={nameRef}
                    autoFocus
                    value={draft.name ?? ''}
                    onChange={(e) => patchDraft({ name: e.target.value })}
                    placeholder="session_id"
                  />
                ) : (
                  <HeaderNameInput
                    ref={nameRef}
                    autoFocus
                    value={draft.name ?? ''}
                    onChange={(name) => patchDraft({ name })}
                    userHeaders={userHeaders}
                  />
                )}
              </FieldLabeled>
            ) : (
              <span />
            )}
            <FieldLabeled label={isCookieKind ? t('cookieValue') : t('value')}>
              <div className="flex items-center gap-1">
                <Input
                  autoFocus={draft.kind === 'set-cookie'}
                  value={draft.value}
                  onChange={(e) => patchDraft({ value: e.target.value })}
                  className="min-w-0 flex-1"
                />
                <LargeEditor
                  title={`${t('value')} — ${('name' in draft && draft.name) || t('headerName')}`}
                  value={draft.value ?? ''}
                  onCommit={(value) => patchDraft({ value })}
                />
              </div>
            </FieldLabeled>
          </div>

          {/*
            응답 쿠키 속성 (story 32~35) — Set-Cookie 문법을 외우지 않아도 되게 칸으로 나눈다.
            **비운 속성은 조립에 붙지 않으므로**(assembleSetCookie) 안 정한 것이 기본값으로
            박히는 일이 없다. 세 칸은 팝업에서 세로로 쌓인다.

            원시로 보존된 항목에는 속성이 없다 — 갈라 두지 않았으므로 채울 칸이 비어 있다.
            이름이나 값을 건드리면 그때 구조화되고(그 문은 `patchDraft` 하나) 여기가 나타난다.
          */}
          {draft.kind === 'set-cookie' && !isRawSetCookie(draft) && (
            <>
              <div className="grid grid-cols-1 gap-2 @xl:grid-cols-3">
                <FieldLabeled label={t('cookieDomain')}>
                  <Input
                    value={draft.domain ?? ''}
                    onChange={(e) => patchDraft({ domain: e.target.value || undefined })}
                    placeholder="example.com"
                  />
                </FieldLabeled>
                <FieldLabeled label={t('cookiePath')}>
                  <Input
                    value={draft.path ?? ''}
                    onChange={(e) => patchDraft({ path: e.target.value || undefined })}
                    placeholder="/"
                  />
                </FieldLabeled>
                <FieldLabeled label={t('cookieMaxAge')}>
                  <Input
                    value={draft.maxAge ?? ''}
                    onChange={(e) => patchDraft({ maxAge: e.target.value || undefined })}
                    placeholder="3600"
                  />
                </FieldLabeled>
              </div>
              <div className="grid grid-cols-1 gap-2 @xl:grid-cols-3">
                {/* '없음'은 값을 지운다 — 안 정한 것과 None을 고른 것은 다른 쿠키가 나간다. */}
                {chipField(
                  t('cookieSameSite'),
                  draft.sameSite ?? UNSET,
                  [
                    { value: UNSET, label: t('sameSiteUnset') },
                    ...SAME_SITE_POLICIES.map((policy) => ({
                      value: policy,
                      label: SAME_SITE_LABEL[policy],
                    })),
                  ],
                  (picked) => patchDraft({ sameSite: picked === UNSET ? undefined : picked }),
                )}
                {chipField(t('cookieSecure'), boolChipValue(draft.secure), boolOptions, (picked) =>
                  patchDraft({ secure: picked === 'on' || undefined }),
                )}
                {chipField(t('cookieHttpOnly'), boolChipValue(draft.httpOnly), boolOptions, (picked) =>
                  patchDraft({ httpOnly: picked === 'on' || undefined }),
                )}
              </div>
            </>
          )}

          {draft.kind === 'response-header' && <NoteText>{t('responsePanelNote')}</NoteText>}
          {hasPlaceholders(draft.value ?? '') && <NoteText>{t('placeholderNote')}</NoteText>}
          {/* 원시로 보존된 줄은 보이되 고칠 수 없다 — 재료를 채우면 그것이 이 줄을 대신한다. */}
          {draft.kind === 'set-cookie' && isRawSetCookie(draft) && (
            <NoteText>
              {t('rawCookieNote')} <code className="font-mono">{draft.raw}</code>
            </NoteText>
          )}
        </>
      )}

      {draft.kind === 'redirect' && (
        <>
          <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
            <FieldLabeled label={t('redirectPattern')} error={fieldError('pattern')}>
              <Input
                ref={patternRef}
                autoFocus
                className="font-mono"
                value={draft.pattern}
                onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
                placeholder="^https://prod\\.example\\.com/(.*)"
              />
            </FieldLabeled>
            {/* '이동할 URL' — 종류에 따라 라벨이 바뀐다 (story 24). */}
            <FieldLabeled label={t('redirectTo')} error={fieldError('substitution')}>
              <Input
                ref={substitutionRef}
                className="font-mono"
                value={draft.substitution}
                onChange={(e) => setDraft({ ...draft, substitution: e.target.value })}
                placeholder="http://localhost:3000/\\1"
              />
            </FieldLabeled>
          </div>
          <NoteText>{t('redirectCaptureNote')}</NoteText>
        </>
      )}

      {/*
        조건 — 리소스 묶음 여덟 칩과 요청 메서드 여섯 칩 (story 25~27).

        접이식 disclosure를 걷었다. 남은 것이 칩 두 줄뿐이라 접을 값이 없고, 시안은 이 둘을
        폼 본문에 그대로 세운다. 접어 두면 조건이 걸린 규칙을 열어도 무엇으로 좁혀져 있는지
        한 번 더 눌러야 보인다.
      */}
      <RuleConditionsFields
        conditions={draft.conditions ?? {}}
        onChange={(conditions) => setDraft({ ...draft, conditions } as Modification)}
      />

      {/*
        저장 후 바로 활성화 (티켓 11, story 17) — 초안의 `enabled`를 그대로 편집한다.

        새 커맨드도 스키마 변경도 없다: 저장 경로(add/update-modification)가 이미
        `Modification` 전체를 나르므로, 폼이 이 필드를 만질 수 있게 되는 것이 전부다.
        기본값은 `createModification`의 `enabled: true`라, 토글을 만지지 않은 사용자에게는
        이전과 완전히 같은 결과다 — 그 기본을 여기서 다시 정하면 두 곳이 갈린다.

        편집일 때는 `initial`이 초안이라 그 규칙의 현재 값을 그대로 비춘다. 종류 전환도
        `switchKind`가 `enabled`를 승계하므로(위) 선택이 살아남는다.
      */}
      <div className="flex items-center justify-between gap-2">
        <span className={fieldCaption}>{t('enableOnSave')}</span>
        <ToggleSwitch
          checked={draft.enabled}
          onCheckedChange={(enabled) => setDraft({ ...draft, enabled } as Modification)}
          aria-label={t('enableOnSave')}
        />
      </div>

      {saveError && (
        <AlertBanner severity="danger" role="alert">
          {saveError}
        </AlertBanner>
      )}

      {/*
        넓은 스코프 Block의 확인 (티켓 04) — 저장을 막는 것이 아니라 **한 번 더 묻는** 자리다.
        검증 오류(danger)와 톤을 갈라 warn을 쓰는 이유가 여기 있다: 이건 틀린 입력이 아니라
        되돌리기 비싼 입력이다. 확인 버튼을 Save와 따로 두어, 같은 자리를 두 번 누르다
        지나치는 일이 없게 한다.
      */}
      {wideScopePending && (
        <AlertBanner severity="warn" role="alert" as="div">
          <p>{t('wideScopeWarning')}</p>
          <div className="mt-1.5 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="px-4"
              onClick={() => void save(true)}
              disabled={saving}
            >
              {t('confirmWideScope')}
            </Button>
          </div>
        </AlertBanner>
      )}

      {/* 폼 액션 쌍 — 좌우 여백을 넓혀(px-4) 두 버튼이 같은 무게로 서게 한다. 모서리는
          shadcn size="sm"이 이미 8px로 맞춰 준다(`rounded-[min(var(--radius-md),12px)]`,
          이 저장소의 --radius-md가 8px이라 min이 8px). 예전에는 primary만 pill이라
          나란히 두면 모양이 갈렸는데, shadcn 기본은 둘 다 같은 모서리다.
          여백은 스모크 N31이 16px로 못박는다. */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" className="px-4" onClick={onCancel} disabled={saving}>
          {t('cancel')}
        </Button>
        {/* 저장 글자가 새 규칙인지 편집인지를 말한다 (story 29) — 같은 자리의 같은 버튼이
            무엇을 하는지 두 경우에 다르기 때문이다. */}
        <Button size="sm" className="px-4" onClick={() => void save()} disabled={saving}>
          {saving ? t('saving') : t(editing ? 'saveChanges' : 'save')}
        </Button>
      </div>
    </div>
  );
}
