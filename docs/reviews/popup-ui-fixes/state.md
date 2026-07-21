---
feature: popup-ui-fixes
invariant-class: feature      # >1 UI 동작 변경(버튼 줄바꿈·액션 행 오버플로·밀도)
entry-track: feature
review-track: standard        # UI 시각 변경 — prd-gate + release-gate (skeleton 배리어 불필요)
pipeline-stage: intake
issue-tracker: local-markdown # .scratch/popup-ui-fixes/
prd-published: false
worktree:
branch:
consent-scope:
spike-1:                      # 420px + ko 렌더 진단 (선택)
---

## Track note

팝업(min-width 420px)에서 한국어 라벨 + 디자인 테마 변경이 겹쳐 레이아웃이 깨짐. 확정된 근본 원인 2개(Button `whitespace-nowrap` 부재로 텍스트 세로 붕괴; ProfileSection 액션 행 8요소가 nowrap flex라 오버플로) + 추정 문제(HeaderRow 등 행의 420px 밀도, ko 라벨 폭). 파이프라인의 user-invoked owner(grill-with-docs/gated-prd-draft/to-issues) 미설치 → 컨덕터 구조를 따르되 owner 작업은 직접 수행(arch-sweep 선례). 현재 intake: 후보 접근 제시 → 사용자 승인 → PRD·이슈.
