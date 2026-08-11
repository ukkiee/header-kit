import { SELECTABLE_REQUEST_METHODS } from '@/core/rules';
import {
  expandResourceGroups,
  foldResourceTypes,
  RESOURCE_GROUPS,
  RESOURCE_GROUP_LABELS,
} from '@/core/resource-groups';
import type { RuleConditions } from '@/core/schema';
import { ChipGroup } from '@/ui/chip-group';
import { fieldCaption } from '@/ui/field-labeled';
import { useT } from '@/ui/i18n-context';

export interface RuleConditionsFieldsProps {
  conditions: RuleConditions;
  onChange: (next: RuleConditions) => void;
}

/**
 * 규칙 조건 편집 (ADR 0017) — **남은 것은 둘뿐**이다: 리소스 묶음 여덟 칩과 요청 메서드
 * 여섯 칩.
 *
 * 제외 도메인·요청 출처 도메인·탭 도메인·자동 해제 시각의 입력 넷은 함께 사라졌다. 티켓 02가
 * 저장 경로(`normalizeConditions`)에서 그 분기를 지웠으므로, 남겨 두면 사용자가 값을 넣고
 * 저장해도 아무 말 없이 버려진다 — 화면이 받겠다고 해 놓고 안 받는 것이 가장 나쁜 모양이다.
 *
 * **리소스는 브라우저의 열다섯 가지가 아니라 여덟 묶음으로 고른다** (story 25·26). 접기·펴기는
 * core의 리소스 묶음 모듈이 맡고 여기서는 부르기만 한다 — 행도 같은 모듈로 접으므로 폼과 행이
 * 같은 어휘를 쓴다.
 */
export function RuleConditionsFields({ conditions, onChange }: RuleConditionsFieldsProps) {
  const t = useT();
  // 칩 그룹 캡션은 span — ToggleGroup은 aria-label로 이름을 갖는다 (ADR 0011).
  const captioned = (labelKey: 'condResourceTypes' | 'condMethods', control: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <span className={fieldCaption}>{t(labelKey)}</span>
      {control}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {captioned(
        'condResourceTypes',
        <ChipGroup
          values={foldResourceTypes(conditions.resourceTypes ?? [])}
          options={RESOURCE_GROUPS.map((group) => ({
            value: group,
            label: t(RESOURCE_GROUP_LABELS[group]),
          }))}
          /*
           * 고른 묶음을 **그 자리에서 값으로 편다.** 묶음을 저장 상태로 들고 있다가 저장할 때
           * 펴면 저장된 것과 화면이 잠시 다른 것을 뜻하게 되고, 그 사이에 다른 코드가 조건을
           * 읽으면 아직 존재하지 않는 표현을 만난다.
           */
          onValuesChange={(groups) =>
            onChange({ ...conditions, resourceTypes: expandResourceGroups(groups) })
          }
          aria-label={t('condResourceTypes')}
        />,
      )}
      {captioned(
        'condMethods',
        <ChipGroup
          values={conditions.requestMethods ?? []}
          options={SELECTABLE_REQUEST_METHODS.map((method) => ({
            value: method,
            label: method.toUpperCase(),
          }))}
          onValuesChange={(requestMethods) => onChange({ ...conditions, requestMethods })}
          aria-label={t('condMethods')}
        />,
      )}
    </div>
  );
}
