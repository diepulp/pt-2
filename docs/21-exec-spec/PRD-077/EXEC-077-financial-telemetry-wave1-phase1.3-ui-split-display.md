---
prd: PRD-077
title: Financial Telemetry — Wave 1 Phase 1.3 — UI Split Display and Labels
status: draft
created: 2026-05-04
fib_h_ref: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-3/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-3-UI-SPLIT-DISPLAY.md
fib_s_ref: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-3/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-3-UI-SPLIT-DISPLAY.json
fib_s_loaded: true
complexity_prescreen: full
write_path_classification: none
gov010_check: "waived:Presentation-only dedicated rollout slice; FIB-H/FIB-S serve as scaffold + mechanism authority; frozen ADRs ADR-052–ADR-055"
inventory_deviations:
  - surface: "app/review/pit-map/components/table-card.tsx"
    status: NOT_FOUND
    note: "app/review/ directory is empty. No replacement birthed. FIB-S SURF-9 is a no-op. PRD §4.2 anticipated this branch."
  - surface: "components/rating-slip-modal/__tests__/rating-slip-modal.test.tsx"
    status: PATH_CORRECTED
    note: "FIB-S surface path is wrong. Component lives at components/modals/rating-slip/rating-slip-modal.tsx. Correct test path: components/modals/rating-slip/__tests__/rating-slip-modal.test.tsx."

workstreams:
  WS1_COMPONENTS:
    name: Shared Financial Display Component Births + Props Contract Freeze
    description: >
      Birth components/financial/FinancialValue.tsx, AttributionRatio.tsx,
      CompletenessBadge.tsx, and index.ts consuming types/financial.ts types
      (no changes to types/financial.ts). Freeze the <FinancialValue> props
      contract as a documented artifact before any surface migration begins.
      Birth shared component tests proving all 8 behavioral assertions per
      PRD §5.1.1 and FIB-S RULE-1, RULE-7, RULE-9. See Workstream Details §WS1
      for the full contract spec and test matrix.
    executor: frontend-design-pt-2
    executor_type: skill
    bounded_contexts: [financial-display]
    depends_on: []
    traces_to: [CAP-1, CAP-1A]
    outputs:
      - components/financial/FinancialValue.tsx
      - components/financial/AttributionRatio.tsx
      - components/financial/CompletenessBadge.tsx
      - components/financial/index.ts
      - components/financial/__tests__/FinancialValue.test.tsx
      - components/financial/__tests__/AttributionRatio.test.tsx
      - components/financial/__tests__/CompletenessBadge.test.tsx
    gate: test-pass
    estimated_complexity: medium

  WS2_SHIFT_V3:
    name: Shift Dashboard V3 Surface Migration
    description: >
      Migrate components/shift-dashboard-v3/left-rail/** (hero-win-loss-compact.tsx,
      secondary-kpi-stack.tsx), center/metrics-table.tsx, and
      right-rail/telemetry-rail-panel.tsx to use <FinancialValue> from
      components/financial/. Preserve existing ESTIMATE/AUTHORITATIVE/TELEMETRY
      semantic badges — replace the badge implementation with <FinancialValue>
      calls, do not remove semantic intent. Label unlabeled entries at
      secondary-kpi-stack.tsx:74,80 and metrics-table.tsx:100–103.
      left-rail/quality-summary-card.tsx: re-grep during execution; if no
      currency renders, record as confirmed-no-action. Legacy
      components/shift-dashboard/ and app/review/shift-dashboard-v2/ are
      confirmed dead code — no action.
    executor: frontend-design-pt-2
    executor_type: skill
    bounded_contexts: [shift-intelligence]
    depends_on: [WS1_COMPONENTS]
    traces_to: [CAP-2]
    outputs:
      - components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx
      - components/shift-dashboard-v3/left-rail/secondary-kpi-stack.tsx
      - components/shift-dashboard-v3/center/metrics-table.tsx
      - components/shift-dashboard-v3/right-rail/telemetry-rail-panel.tsx
    gate: type-check
    estimated_complexity: medium

  WS3_PIT_TABLE_FLOOR:
    name: Pit, Table, and Floor-Oversight Surface Migration
    description: >
      Migrate: analytics-panel.tsx (replace "Handle" label with "Estimated Drop",
      wrap with <FinancialValue type="estimated">; FIB-S RULE-2);
      closed-sessions-panel.tsx (wrap all FinancialValue currency renders);
      rundown-summary-panel.tsx:205–218,229,242 (fills/credits/drop/win-loss;
      Pattern B for derived table_win, declare inputs per SRC §C3);
      floor-oversight/page.tsx (rename "Coverage quality" → "Attribution Ratio",
      route KPI through <AttributionRatio>; FIB-S RULE-2).
      INVENTORY DEVIATION: app/review/pit-map/components/table-card.tsx NOT
      FOUND — app/review/ dir is empty. Record deviation; no action.
    executor: frontend-design-pt-2
    executor_type: skill
    bounded_contexts: [table-context, player-financial]
    depends_on: [WS1_COMPONENTS]
    traces_to: [CAP-3]
    outputs:
      - components/pit-panels/analytics-panel.tsx
      - components/pit-panels/closed-sessions-panel.tsx
      - components/table/rundown-summary-panel.tsx
      - app/(landing)/floor-oversight/page.tsx
    gate: type-check
    estimated_complexity: medium

  WS4_PLAYER:
    name: Player Surfaces Migration
    description: >
      Migrate: player-360/summary/summary-band.tsx (Q-A7 resolution — render
      theoEstimate as FinancialValue with type='estimated',
      completeness.status='unknown', explicit "Not computed" badge; must not
      render $0 or infer completeness; FIB-S RULE-2);
      player-360/left-rail/filter-tile-stack.tsx:87 (wrap currency render);
      player-sessions/start-from-previous.tsx:213,219,237 (wrap total_buy_in,
      total_cash_out; Pattern B for net with derivedFrom declaration;
      FIB-S RULE-7 — must use formatCents, not formatDollars on FinancialValue
      fields; DEF-004 migration from Phase 1.2B-B must not be regressed).
    executor: frontend-design-pt-2
    executor_type: skill
    bounded_contexts: [player-financial, player-sessions]
    depends_on: [WS1_COMPONENTS]
    traces_to: [CAP-4]
    outputs:
      - components/player-360/summary/summary-band.tsx
      - components/player-360/left-rail/filter-tile-stack.tsx
      - components/player-sessions/start-from-previous.tsx
    gate: type-check
    estimated_complexity: medium

  WS5_TRANSACTIONS:
    name: Operator Transaction Surfaces Migration
    description: >
      Migrate: cashier/amount-display.tsx (committed amount as FinancialValue);
      cashier/cash-out-form.tsx:54 (committed wraps as FinancialValue; pre-commit
      form input labeled "Draft" — NOT wrapped as FinancialValue per
      CLASSIFICATION-RULES §6.1 and FIB-S RULE-6);
      rating-slip/buy-in-threshold-indicator.tsx:171,174 (callers must pass typed
      FinancialValue envelope; component reads .type and .source for display —
      audit Stream B #3; caller-side changes may require touching upstream
      components that pass bare numbers to this component — grep callers during
      execution and record in implementation notes);
      loyalty/comp-confirm-panel.tsx and entitlement-confirm-panel.tsx
      (face value cents as FinancialValue type='actual'; loyalty points remain
      unwrapped per FIB-S RULE-6).
    executor: frontend-design-pt-2
    executor_type: skill
    bounded_contexts: [player-sessions, rating-slip, loyalty]
    depends_on: [WS1_COMPONENTS]
    traces_to: [CAP-5]
    outputs:
      - components/cashier/amount-display.tsx
      - components/cashier/cash-out-form.tsx
      - components/rating-slip/buy-in-threshold-indicator.tsx
      - components/loyalty/comp-confirm-panel.tsx
      - components/loyalty/entitlement-confirm-panel.tsx
    gate: type-check
    estimated_complexity: medium

  WS6_COMPLIANCE:
    name: Compliance and Monitoring Surface Migration
    description: >
      Migrate MTL surfaces under <FinancialValue type="compliance">:
      gaming-day-summary.tsx:158–163,272,288; compliance-dashboard.tsx:132;
      entry-badge.tsx; agg-badge.tsx. Formalize existing MTL labels —
      do not break current rendering, route through <FinancialValue>.
      FIB-S RULE-4 hard invariant: compliance authority must NEVER be merged
      with actual/estimated/observed; MTL amounts must remain in their own
      component and must not accept derivedFrom that includes operational
      authority labels.
      Migrate admin-alerts/alert-detail-card.tsx:104,110 (observedValue +
      baseline median) under <FinancialValue type="observed">.
    executor: frontend-design-pt-2
    executor_type: skill
    bounded_contexts: [mtl, shift-intelligence]
    depends_on: [WS1_COMPONENTS]
    traces_to: [CAP-6]
    outputs:
      - components/mtl/gaming-day-summary.tsx
      - components/mtl/compliance-dashboard.tsx
      - components/mtl/entry-badge.tsx
      - components/mtl/agg-badge.tsx
      - components/admin-alerts/alert-detail-card.tsx
    gate: type-check
    estimated_complexity: low

  WS7_DEF006:
    name: DEF-006 Component Test Births
    description: >
      Birth three test files asserting integer-cents FinancialValue shape on
      DTO fields changed in Phases 1.1/1.2B (FIB-S RULE-8):
        components/modals/rating-slip/__tests__/rating-slip-modal.test.tsx
        components/player-sessions/__tests__/start-from-previous.test.tsx
        components/player-sessions/__tests__/start-from-previous-modal.test.tsx
      NOTE: FIB-S surface path "components/rating-slip-modal/__tests__/..." is
      incorrect. Actual component: components/modals/rating-slip/rating-slip-modal.tsx.
      Correct test path: components/modals/rating-slip/__tests__/rating-slip-modal.test.tsx.
      components/player-sessions/__tests__/ does not exist — birth the directory.
      Depends on WS4+WS5 so tests assert against fully migrated component state.
      See Workstream Details §WS7 for the required test case matrix.
    executor: frontend-design-pt-2
    executor_type: skill
    bounded_contexts: [rating-slip, player-sessions]
    depends_on: [WS4_PLAYER, WS5_TRANSACTIONS]
    traces_to: [CAP-7]
    outputs:
      - components/modals/rating-slip/__tests__/rating-slip-modal.test.tsx
      - components/player-sessions/__tests__/start-from-previous.test.tsx
      - components/player-sessions/__tests__/start-from-previous-modal.test.tsx
    gate: test-pass
    estimated_complexity: medium

  WS8_GATES:
    name: Quality Gates, Sentinel Checks, and Lead-Architect Sign-Off
    description: >
      Forbidden-label sentinel grep across components/**/*.{ts,tsx} and
      app/**/*.{ts,tsx} (excluding test files): confirm "Handle", "Coverage
      quality", "Theo: 0", "Theo: $0", "Theo:0" are absent.
      Authority-class sentinel: one migrated surface per authority class
      (actual, estimated, observed, compliance) validated against source-of-truth
      data — label AND value correctness, not merely presence (FIB-S RULE-11).
      Semantic spot-check matrix (FIB-S RULE-10): actual-only surface stays
      Actual; mixed Actual + Estimated degrades to Estimated; Compliance isolated
      and never merged; unknown completeness renders explicitly (not $0 or blank).
      Run npm run type-check, npm run lint, npm run build — all must exit 0.
      Dev-server walkthrough across every migrated surface family with pass/fail
      checklist per surface for: authority visibility, completeness visibility,
      forbidden label absence, Pattern A/B correctness.
      Lead-architect sign-off recorded. Update ROLLOUT-TRACKER.json.
    executor: qa-specialist
    executor_type: skill
    bounded_contexts: [cross-cutting]
    depends_on: [WS2_SHIFT_V3, WS3_PIT_TABLE_FLOOR, WS4_PLAYER, WS5_TRANSACTIONS, WS6_COMPLIANCE, WS7_DEF006]
    traces_to: [CAP-8]
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
    gate: build
    estimated_complexity: low

execution_phases:
  - name: "Phase 1 — Foundation: Shared Component Births + Props Contract Freeze"
    parallel: [WS1_COMPONENTS]
    gate: gate-components-born
  - name: "Phase 2 — Surface Migrations (parallel — disjoint file sets)"
    parallel: [WS2_SHIFT_V3, WS3_PIT_TABLE_FLOOR, WS4_PLAYER, WS5_TRANSACTIONS, WS6_COMPLIANCE]
    gate: gate-surface-migrations
  - name: "Phase 3 — DEF-006 Test Births"
    parallel: [WS7_DEF006]
    gate: gate-def006-closed
  - name: "Phase 4 — Quality Gates and Sign-Off"
    parallel: [WS8_GATES]
    gate: gate-quality-signoff
---

# EXEC-077 — Financial Telemetry Wave 1 Phase 1.3 — UI Split Display and Labels

## Overview

Phase 1.3 is the UI presentation layer capstone of Wave 1 financial telemetry. It is not purely wiring: the work births three shared financial display primitives — `FinancialValue`, `AttributionRatio`, and `CompletenessBadge` — that structurally enforce the SRC §L2 first-glance visibility rule, and freezes a props contract that Phase 1.4 lint enforcement will target without rewriting. Once those primitives exist, five surface migration workstreams deploy them in parallel across every in-scope PT-2 production surface family, removing confirmed forbidden labels (`Handle`, `Coverage quality`, `Theo: 0`), resolving the Q-A7 Theo unknown rendering, and applying Pattern A split display and Pattern B derived labeling where the authority model requires it. DEF-006 component test births — deferred from Phase 1.1 due to DTO shape instability — close after the surface workstreams that affect those components complete. A final quality gate workstream runs sentinel grep verification, the semantic spot-check matrix, per-authority-class source-of-truth validation, `npm run type-check + lint + build`, and the dev-server walkthrough that satisfies lead-architect sign-off and Wave 1 exit criteria 1 and 5.

**This is a surface normalization migration and UI-layer semantic enforcement of an upstream contract, not cosmetic UI work.** Forbidden label correction, authority correction, completeness correction, and degradation behavior require semantic discipline. Reviewers must not treat display label changes as trivial: `Handle → Estimated Drop` is an authority correction, `Coverage quality → Attribution Ratio` is an SRC §K1 compliance fix, and `Theo: $0 → unknown envelope + Not computed badge` is a placeholder-authority removal.

**Precondition gate confirmed:** EXEC-074/075/076 closed 2026-05-03 (commits `ad6d1748` / `e73879f4`). `FinancialValue.value` is integer cents, `financialValueSchema.int()` enforced at service boundary, BRIDGE-001 retired, API contract stable. UI is the last unlabeled boundary.

**FIB-S authority:** `FIB-S-FINANCIAL-TELEMETRY-PHASE-1-3-UI-SPLIT-DISPLAY.json` — loaded 2026-05-04, anti-invention enforced. Note: FIB-S was amended between scaffold generation and execution; two amendments applied to WS1 (CAP-1A contract freeze) and WS8 (semantic spot-check matrix + sentinel correctness gate).

---

## Inventory Deviations

| Surface | FIB-S SURF-ID | Status | Action |
|---------|--------------|--------|--------|
| `app/review/pit-map/components/table-card.tsx` | SURF-9 | NOT FOUND — `app/review/` dir is empty | No action; recorded as deviation. PRD §4.2 anticipated this branch. Do not birth replacement. |
| `components/rating-slip-modal/__tests__/rating-slip-modal.test.tsx` | SURF-14 | PATH CORRECTED | Component lives at `components/modals/rating-slip/rating-slip-modal.tsx`. Correct test path: `components/modals/rating-slip/__tests__/rating-slip-modal.test.tsx`. |

These deviations must be recorded in implementation notes on the PR. They do not block execution.

---

## WS1 — Props Contract Freeze (CAP-1A gate)

Before any surface migration begins, the `<FinancialValue>` props contract must be documented as a review artifact. This is the document that Phase 1.4 lint rules target; drift introduced during the migration itself would make Phase 1.4 lint retarget a moving API.

**The frozen contract (must be recorded in implementation notes or code comment block in `components/financial/FinancialValue.tsx`):**

```
FinancialValue component — Phase 1.3 frozen contract
─────────────────────────────────────────────────────
Props:
  value: FinancialValue           — from types/financial.ts; value.value is integer cents
  label: string                   — caller-supplied display label
  variant?: 'inline' | 'stacked' | 'compact'
  derivedFrom?: readonly string[] — required when display declares a Derived summary
  className?: string

Allowed combinations (Phase 1.4 lint will enforce these):
  1. Single authority (actual | estimated | observed | compliance) — value.type drives badge
  2. Unknown completeness — renders "Not computed" (for theo) or "Unknown" default; never coerces to $0
  3. Derived (Pattern B) — derivedFrom required; degraded authority per D5 hierarchy (Actual > Observed > Estimated) MUST be computed and displayed visibly alongside the value; contributing authorities listed; Derived display without a visible degraded authority label is non-conformant

Pattern selection rule (Patch 3):
  - Pattern A (two <FinancialValue> instances side-by-side) MUST be used when multiple authority classes are displayed simultaneously
  - Pattern B (single Derived summary + derivedFrom + degraded authority label) MAY ONLY be used when a single summary is explicitly required AND both derivedFrom and degraded authority are declared
  - Default is Pattern A; Pattern B requires explicit opt-in with derivedFrom

Disallowed combinations:
  - compliance + derivedFrom containing operational authority labels — never merge compliance
  - Mixed compliance + actual/estimated/observed without explicit Derived label — hard rejection
  - tooltip-only authority — badge must be visible at first glance (SRC §L2)
  - tooltip-only, icon-only, or truncated source — value.source must render as visible text adjacent to value or as a standardized short label; non-conformant regardless of viewport size (Patch 2)
  - formatDollars on value.value — must use formatCents internally (RULE-7)
  - responsive or compact layout that hides or truncates authority/source labels — mobile variants must still show authority at first glance; CSS overflow-hidden or text-overflow on authority badge or source label is non-conformant (Patch 7)

DEF-NEVER: hold_percent is never passed as a FinancialValue; average_bet, min_bet, max_bet,
loyalty points, policy thresholds are never wrapped (CLASSIFICATION-RULES §6).
```

The contract freeze artifact must be present before WS2–WS6 begin execution.

---

## Workstream Details

### WS1_COMPONENTS — Shared Financial Display Component Births

**Files to create:**
```
components/financial/
├── FinancialValue.tsx
├── AttributionRatio.tsx
├── CompletenessBadge.tsx
├── index.ts
└── __tests__/
    ├── FinancialValue.test.tsx
    ├── AttributionRatio.test.tsx
    └── CompletenessBadge.test.tsx
```

**DO NOT TOUCH:**
- `types/financial.ts` — consumed, not changed
- `lib/format.ts` — `formatCents` is used internally by `FinancialValue.tsx`; no export removal
- Any surface migration files — those are WS2–WS6

**Implementation: `FinancialValue.tsx`**

Implement the frozen props contract from §WS1 above. Key requirements:
- `value.value` is integer cents — render through `formatCents` (from `lib/format.ts`), NOT `formatDollars`. A direct call to `formatDollars(value.value)` on a FinancialValue field is a hard blocker.
- `value.type`, `value.source`, `value.completeness.status` must all be visible at first glance in rendered text or adjacent badge text. Tooltip-only or icon-only authority disclosure is non-conformant (SRC §L2).
- `value.source` MUST render as visible text adjacent to the value or as a standardized short label (e.g., `"PFT"`). Tooltip-only, icon-only, or truncated source rendering is non-conformant regardless of viewport size. Raw path strings should be converted to short labels before rendering. (Patch 2)
- `completeness.status === 'unknown'`: render explicit "Unknown" or caller-supplied equivalent (e.g., "Not computed" for theo-specific callers). Never coerce to `$0`, blank, or inferred completeness.
- `derivedFrom` must be present when `variant` or caller semantics declare a Derived summary; it must map to real contributing fields, not free-text labels.
- When `derivedFrom` is present, the component MUST compute and display the degraded authority label visibly alongside the value per the D5 hierarchy (Actual > Observed > Estimated). Rendering a Derived value without a visible degraded authority label is non-conformant. (Patch 1)
- `compliance` type must not accept `derivedFrom` entries that include operational authority labels.
- Pattern A (split) and Pattern B (derived) are layout concerns — `FinancialValue` renders a single value with authority; split display is achieved by the caller rendering two `<FinancialValue>` instances side by side. Pattern A is the default; Pattern B requires explicit `derivedFrom` declaration. (Patch 3)
- Responsive layouts MUST NOT hide or truncate authority or source labels at any viewport width. Mobile and compact variants (`variant='compact'`) must still show authority at first glance. CSS `overflow: hidden` or `text-overflow: ellipsis` on the authority badge or source label is non-conformant. (Patch 7)

**Implementation: `AttributionRatio.tsx`**

Props contract per PRD §5.1.1:
```ts
export interface AttributionRatioProps {
  ratio: number | null;
  label?: 'Attribution Ratio';
  completenessStatus?: never;
  className?: string;
}
```
- Renders supplied ratio as percentage; does not compute numerator or denominator.
- Rendered label must be "Attribution Ratio" — never "Coverage" or "Coverage quality".
- Must not accept `completenessStatus` prop; must not render completeness wording.
- Must remain visually distinct from any adjacent `<CompletenessBadge>`.

**Implementation: `CompletenessBadge.tsx`**

Props contract per PRD §5.1.1:
```ts
export interface CompletenessBadgeProps {
  status: CompletenessStatus;
  coverage?: number;
  className?: string;
}
```
- `unknown` renders explicit visible text: "Unknown" default, "Not computed" when caller is theo-specific.
- `coverage` may supplement completeness but must not be labeled "Attribution Ratio".
- Must remain visually distinct from any adjacent `<AttributionRatio>`.

**Shared component tests — required assertions (PRD §5.1.1):**

`FinancialValue.test.tsx` must prove:
1. Integer-cents formatting: `value.value = 1050` renders as `"$10.50"` (not `"$10.50.00"` or `"$0.01050"`)
2. Visible authority: rendered output contains "Actual", "Estimated", "Observed", or "Compliance" text corresponding to `value.type`
3. Visible source text: `value.source` appears in rendered output
4. Visible completeness: `completeness.status` of `complete | partial | unknown` each renders distinct visible text
5. Unknown "Not computed" treatment: `completeness.status === 'unknown'` renders "Not computed" or "Unknown" — never `$0`, never blank
6. Compliance isolation: a `type='compliance'` value with `derivedFrom` containing operational authority labels throws or renders an error indicator — compliance is never merged
7. Pattern A split display behavior: caller rendering two `<FinancialValue>` instances side-by-side (rated vs unrated) produces distinct authority labels for each
8. Pattern B derived input declaration: `derivedFrom` is visible in rendered output when provided; a Derived display without `derivedFrom` when declaring Pattern B fails the contract

`AttributionRatio.test.tsx`: ratio `0.73` renders as `"73%"` or `"0.73"` with label "Attribution Ratio"; `null` renders a null/empty state; does not accept `completenessStatus` prop.

`CompletenessBadge.test.tsx`: each of `complete`, `partial`, `unknown` renders distinct visible text; `unknown` with theo-specific context renders "Not computed"; `coverage` renders without the label "Attribution Ratio".

**Acceptance criteria for WS1:**
- All 7 component files exist and compile
- Props contract freeze artifact is present in `FinancialValue.tsx` (comment block or linked doc)
- `npm run type-check` exits 0 on `components/financial/**`
- All 3 test files pass with all 8 behavioral assertions for `FinancialValue`
- No `formatDollars` call on `value.value` inside `FinancialValue.tsx`
- No tooltip-only authority rendering
- `value.source` renders as visible non-truncated text (not tooltip-only, not icon-only) — verified by `FinancialValue.test.tsx` assertion #3 (Patch 2)
- When `derivedFrom` is present, degraded authority label is visible in rendered output (D5 hierarchy computed, not implicit) — verified by `FinancialValue.test.tsx` assertion #8 (Patch 1)
- Pattern A is the default render path; Pattern B requires explicit `derivedFrom` declaration — enforced by props contract (Patch 3)
- No CSS truncation or overflow-hidden on authority badge or source label at any viewport — compact/mobile variant must still show authority at first glance (Patch 7)

---

### WS2_SHIFT_V3 — Shift Dashboard V3 Surface Migration

**Files to migrate:**
- `components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx` — wrap win/loss renders
- `components/shift-dashboard-v3/left-rail/secondary-kpi-stack.tsx` — label unlabeled entries at :74,:80
- `components/shift-dashboard-v3/center/metrics-table.tsx` — label unlabeled entries at :100–103
- `components/shift-dashboard-v3/right-rail/telemetry-rail-panel.tsx` — wrap all currency renders
- `components/shift-dashboard-v3/left-rail/quality-summary-card.tsx` — re-grep on entry; if no currency renders exist, record as "confirmed no-action" in implementation notes

**DO NOT TOUCH:**
- `components/shift-dashboard/` (dead code — confirmed zero UI imports)
- `app/review/shift-dashboard-v2/` (dead code — excluded)
- Any test files in `components/shift-dashboard-v3/__tests__/` — existing tests must continue to pass; if a test breaks due to the migration, fix the test

**Migration pattern:**
Replace local badge/formatter patterns with `<FinancialValue value={...} label="..." />`. Preserve all existing semantic intent. If a value already carries a semantic badge (e.g., "ESTIMATE", "AUTHORITATIVE", "TELEMETRY"), map that badge to the corresponding `FinancialValue.type` — do not silently discard the existing semantic.

**Acceptance criteria for WS2:**
- All four listed files compile with `FinancialValue` imports from `components/financial/`
- No bare formatter calls (`formatDollars`, `formatCents`, `.toFixed(2)`, `` `$`-prefix ``) on FinancialValue-typed values remain in these files
- `secondary-kpi-stack.tsx:74,80` and `metrics-table.tsx:100–103` entries are labeled
- Existing test files in `__tests__/` remain green
- `npm run type-check` exits 0

---

### WS3_PIT_TABLE_FLOOR — Pit, Table, and Floor-Oversight Surface Migration

**Files to migrate:**
- `components/pit-panels/analytics-panel.tsx` — Handle → Estimated Drop + wrap (FIB-S RULE-2, §5.1 violation at :169)
- `components/pit-panels/closed-sessions-panel.tsx` — wrap currency renders
- `components/table/rundown-summary-panel.tsx` — fills/credits/drop/win-loss; Pattern B for derived (see below)
- `app/(landing)/floor-oversight/page.tsx` — "Coverage quality" → "Attribution Ratio" + `<AttributionRatio>` (FIB-S RULE-2, §5.1 violation)

**INVENTORY DEVIATION:** `app/review/pit-map/components/table-card.tsx` — NOT FOUND. Record in implementation notes. No action.

**DO NOT TOUCH:**
- `components/pit-panels/bank-summary.tsx`, `chip-counts-display.tsx`, `chip-denomination.tsx`, `drop-events-display.tsx`, `exceptions-approvals-panel.tsx`, `fill-slips-display.tsx`, `inventory-panel.tsx`, `tables-panel.tsx` — unless re-grep reveals currency renders; record findings
- Any components outside the explicitly listed files

**Pattern B for `rundown-summary-panel.tsx`:**
`table_win_cents` is a derived value (inventory math: closing − opening − fills + credits). It must render with `<FinancialValue variant="stacked" derivedFrom={["opening_total_cents", "fills_total_cents", "credits_total_cents", "drop_total_cents"]} />` with a visible "Derived" or "Inventory Win" label. The degraded authority per D5 hierarchy applies: if any input is `estimated`, the derived result degrades to `estimated`.

**Acceptance criteria for WS3:**
- `analytics-panel.tsx` contains no "Handle" label; contains "Estimated Drop" with `<FinancialValue type="estimated">`
- `floor-oversight/page.tsx` contains no "Coverage quality"; KPI routes through `<AttributionRatio>`
- `rundown-summary-panel.tsx` Pattern B renders `derivedFrom` for derived win/loss
- Pit-map deviation recorded in implementation notes
- `npm run type-check` exits 0

---

### WS4_PLAYER — Player Surfaces Migration

**Files to migrate:**
- `components/player-360/summary/summary-band.tsx` — Q-A7 resolution; Theo migration
- `components/player-360/left-rail/filter-tile-stack.tsx:87` — wrap currency render
- `components/player-sessions/start-from-previous.tsx:213,219,237` — wrap totals + Pattern B for net

**DO NOT TOUCH:**
- `components/player-360/summary/summary-tile.tsx`, `time-lens-control.tsx` — unless re-grep reveals currency renders
- `components/player-360/left-rail/filter-tile.tsx`, `jump-to-nav.tsx` — unless re-grep reveals currency renders
- `components/player-sessions/player-list-panel.tsx` — unless re-grep reveals currency renders
- Service, DTO, API shape — no changes allowed in this workstream

**Q-A7 Theo migration (`summary-band.tsx`):**
The `theoEstimate` field was migrated in Phase 1.1 to emit `FinancialValue` with `type: 'estimated'`, `source: "rating_slip.theo"`, `completeness.status: 'unknown'`. Phase 1.3 changes the rendering only. The component must:
- Render the `FinancialValue` envelope with visible authority badge "Estimated"
- Render `<CompletenessBadge status="unknown" />` or equivalent "Not computed" text
- NOT render `$0` or a bare zero when `completeness.status === 'unknown'`
- NOT infer completeness as `complete` when it is `unknown`

**`start-from-previous.tsx` DEF-004 guard:**
DEF-004 (Phase 1.2B-B, EXEC-075) already migrated `start-from-previous.tsx` dollar fields to integer cents. This workstream must NOT reintroduce `formatDollars` calls on these fields. Verify the Phase 1.2B-B migration is intact before adding `<FinancialValue>` wrappers.

Pattern B for `net`: `net` is derived (`total_buy_in - total_cash_out`). Render with `derivedFrom={["total_buy_in", "total_cash_out"]}` and degraded authority per D5.

**Acceptance criteria for WS4:**
- `summary-band.tsx` renders Theo as `estimated/unknown` with explicit "Not computed" display; no `$0` for unknown completeness
- `start-from-previous.tsx` has no `formatDollars` calls on FinancialValue fields (DEF-004 not regressed)
- Pattern B net render has `derivedFrom` present
- `npm run type-check` exits 0

---

### WS5_TRANSACTIONS — Operator Transaction Surfaces Migration

**Files to migrate:**
- `components/cashier/amount-display.tsx` — committed amount as `<FinancialValue>`
- `components/cashier/cash-out-form.tsx:54` — committed wraps; pre-commit form input labeled "Draft"
- `components/rating-slip/buy-in-threshold-indicator.tsx:171,174` — caller-side changes
- `components/loyalty/comp-confirm-panel.tsx` — face value cents as `<FinancialValue type="actual">`
- `components/loyalty/entitlement-confirm-panel.tsx` — same

**DO NOT TOUCH:**
- Points fields in loyalty components — `pointsDelta`, `balanceAfter`, `currentBalance` are NOT FinancialValue (non-currency unit system per FIB-S RULE-6)
- `average_bet`, `min_bet`, `max_bet`, `watchlistFloor`, `ctrThreshold`, `current_segment_average_bet` — bare numbers per CLASSIFICATION-RULES §6
- Any service, API, or DTO file

**Draft badge for `cash-out-form.tsx`:**
Pre-commit form input fields are NOT wrapped as `FinancialValue` — they are operator drafts. The form input must carry a visible "Draft" label or badge indicating the value is uncommitted. Only the confirmed/committed post-submit amount is rendered as `<FinancialValue>`.

**`buy-in-threshold-indicator.tsx` caller scope:**
The component currently receives a bare `number` prop. Phase 1.3 requires callers to pass a typed `FinancialValue` envelope and the component reads `.type` and `.source` for display. Grep for all callers of `BuyInThresholdIndicator` (or its import path); for each caller that passes a bare number, update it to construct and pass a `FinancialValue` envelope. Record all caller files modified in implementation notes (these are additional modified files beyond the WS5 output list above).

**Acceptance criteria for WS5:**
- `cash-out-form.tsx` pre-commit form input has "Draft" label; committed display uses `<FinancialValue>`
- Loyalty components: face value renders as `<FinancialValue type="actual">`; points fields are unwrapped bare numbers
- `buy-in-threshold-indicator.tsx` accepts `FinancialValue` envelope; all callers enumerated via `grep -rn "BuyInThresholdIndicator\|buy-in-threshold-indicator" components/ app/` and the **complete caller list is recorded in implementation notes**; each caller passes a typed `FinancialValue` envelope — zero tolerance for partial migration; any caller still passing a bare number is a blocking failure (Patch 4)
- No loyalty points field wrapped as FinancialValue
- `npm run type-check` exits 0

---

### WS6_COMPLIANCE — Compliance and Monitoring Surface Migration

**Files to migrate:**
- `components/mtl/gaming-day-summary.tsx:158–163,272,288`
- `components/mtl/compliance-dashboard.tsx:132`
- `components/mtl/entry-badge.tsx`
- `components/mtl/agg-badge.tsx`
- `components/admin-alerts/alert-detail-card.tsx:104,110`

**DO NOT TOUCH:**
- `components/mtl/audit-note-form.tsx`, `entry-detail.tsx`, `entry-list.tsx`, `mtl-entry-form.tsx`, `mtl-entry-view-modal.tsx` — unless re-grep reveals currency renders
- `components/admin-alerts/` other files — unless re-grep reveals currency renders
- `CasinoThresholds.watchlistFloor`, `ctrThreshold` — policy thresholds, NOT FinancialValue (FIB-S RULE-6)

**Compliance isolation hard rule (FIB-S RULE-4):**
`compliance` authority must NEVER be merged with `actual`, `estimated`, or `observed` in a single aggregate display. MTL amounts must remain in their own component. `<FinancialValue type="compliance">` must never accept `derivedFrom` that includes operational authority labels.

**`admin-alerts/alert-detail-card.tsx`:**
Renders `observedValue` and `baselineMedian` from `AnomalyAlertDTO` / `ShiftAlertDTO`. These are `FinancialValue | null` for financial metric branches and bare `number | null` for ratio branches (DEF-NEVER: `hold_percent` never FinancialValue). Implement conditional rendering: if the value is a `FinancialValue` envelope (has `.type` property), render with `<FinancialValue type="observed">`; if bare number (ratio branch), render as labeled bare number. Do not cast or coerce.

**Acceptance criteria for WS6:**
- MTL surfaces use `<FinancialValue type="compliance">` for all currency renders
- Compliance amounts are never merged with operational authorities in any derived display
- `alert-detail-card.tsx` conditionally renders financial vs ratio branch correctly
- `watchlistFloor` and `ctrThreshold` remain bare numbers
- `npm run type-check` exits 0

---

### WS7_DEF006 — DEF-006 Component Test Births

**Files to create:**
```
components/modals/rating-slip/__tests__/rating-slip-modal.test.tsx  (birth)
components/player-sessions/__tests__/start-from-previous.test.tsx   (birth — dir needs creating)
components/player-sessions/__tests__/start-from-previous-modal.test.tsx (birth)
```

**PATH DEVIATION NOTE:** FIB-S surface `components/rating-slip-modal/__tests__/rating-slip-modal.test.tsx` is incorrect. Actual component lives at `components/modals/rating-slip/rating-slip-modal.tsx`. Use `components/modals/rating-slip/__tests__/rating-slip-modal.test.tsx`.

**`rating-slip-modal.test.tsx` — required assertions:**
Tests must assert against the Phase 1.1/1.2B DTO shape (`FinancialSectionDTO` with integer-cents fields):
1. `totalCashIn.value` is an integer (Phase 1.1 rename from dollar-float)
2. `totalCashIn.type === 'actual'` and `totalCashIn.source === 'PFT'`
3. `totalCashOut.value` is an integer (Phase 1.1 `totalChipsOut → totalCashOut` rename + integer-cents)
4. `netPosition.value` is an integer; `netPosition.type === 'actual'`
5. `netPosition` renders with `derivedFrom` declaration (Pattern B)
6. No field renders bare dollar-float values
7. Renders correctly when completeness is `partial` (open visit) vs `complete` (closed visit)

**`start-from-previous.test.tsx` — required assertions:**
1. `total_buy_in.value` is an integer (Phase 1.1 ×100 mapper conversion)
2. `total_buy_in.type === 'actual'` and `total_buy_in.source === 'PFT'`
3. `total_cash_out.value` is an integer
4. `net` renders with Pattern B `derivedFrom` declaration
5. No `formatDollars` called on any FinancialValue field (DEF-004 non-regression)
6. `completeness.status: 'partial'` (open visit) renders correctly; does not collapse to `$0`

**`start-from-previous-modal.test.tsx` — required assertions:**
1. Financial totals displayed in the modal carry visible authority labels (Actual)
2. `total_buy_in.value` is integer in modal display
3. Modal correctly handles `completeness.status: 'unknown'`
4. No bare currency renders in the modal

**Targeted Jest command (record in implementation notes):**
```bash
npx jest \
  "components/modals/rating-slip/__tests__/rating-slip-modal.test.tsx" \
  "components/player-sessions/__tests__/start-from-previous.test.tsx" \
  "components/player-sessions/__tests__/start-from-previous-modal.test.tsx" \
  --no-coverage 2>&1 | tee /tmp/exec077-def006-test-run.log
```

**Acceptance criteria for WS7:**
- All three test files exist and pass
- `rating-slip-modal.test.tsx` has 7+ assertions per the matrix above
- `start-from-previous.test.tsx` has 6+ assertions per the matrix above
- `start-from-previous-modal.test.tsx` has 4+ assertions per the matrix above
- `Number.isInteger()` used for value assertions, not key-presence only
- No test asserts on dollar-float values
- Targeted Jest command exits 0
- DEF-006 is closeable in ROLLOUT-TRACKER.json after this workstream completes

---

### WS8_GATES — Quality Gates, Sentinel Checks, and Lead-Architect Sign-Off

**Sentinel grep commands (run and record output in implementation notes):**
```bash
# Forbidden label sentinel — must return zero matches
grep -rn \
  --include="*.tsx" --include="*.ts" \
  --exclude="*.test.tsx" --exclude="*.spec.tsx" \
  -e '"Handle"' -e "'Handle'" \
  -e '"Coverage quality"' -e "'Coverage quality'" \
  -e 'Theo.*:.*0[^.]' -e 'Theo.*:\s*\$0' \
  components/ app/ 2>/dev/null | grep -v "\.test\." | grep -v "\.spec\."
```

Zero matches required. Any match is a blocking failure.

**Authority-class sentinel (FIB-S RULE-11 — source-of-truth validation):**
For each authority class, validate one migrated surface against actual data. Record the UI-rendered value, the corresponding service/API reference value, and the comparison result. A validation row that records only label presence without an actual data reference value is non-conformant. (Patch 5)

| Authority | Surface | UI value rendered | Service/API reference value | Authority label visible | Comparison result |
|-----------|---------|------------------|-----------------------------|-----------------------|-------------------|
| `actual` | `comp-confirm-panel.tsx` | _record here_ | `CompIssuanceResult.faceValueCents` (integer cents) | "Actual" (Y/N) | PASS / FAIL |
| `estimated` | `analytics-panel.tsx` | _record here_ | service `estimatedDropCents` output | "Estimated Drop" (Y/N) | PASS / FAIL |
| `observed` | `alert-detail-card.tsx` | _record here_ | `AnomalyAlertDTO.observedValue` | "Observed" (Y/N) | PASS / FAIL |
| `compliance` | `gaming-day-summary.tsx` | _record here_ | compliance total from MTL summary API | "Compliance" (Y/N) | PASS / FAIL |

All 4 rows must show PASS with a recorded reference value before this sentinel is considered closed.

**Semantic spot-check matrix (FIB-S RULE-10):**
Run dev server and manually verify:
- [ ] Actual-only surface (e.g., PFT cash-in on cashier) → renders "Actual" only
- [ ] Mixed Actual + Estimated surface (if present) → degrades to "Estimated"; Pattern A split shows both
- [ ] Compliance surface (MTL) → "Compliance" isolated; no operational authority label adjacent
- [ ] Unknown completeness surface (player-360 Theo) → renders "Not computed" or "Unknown"; no `$0`

**Dev-server walkthrough checklist (attach completed table to PR or implementation notes — Patch 6):**
Walk each migrated surface family. Record Y/N for each column. All cells must be Y before WS8 may be marked complete.

| Surface family | Authority visible (Y/N) | Completeness visible (Y/N) | Forbidden labels absent (Y/N) | Pattern A/B correct (Y/N) |
|---------------|------------------------|--------------------------|------------------------------|--------------------------|
| Shift dashboard v3 (left-rail, metrics-table, telemetry-rail) | | | | |
| Pit analytics panel (Estimated Drop) | | | | |
| Closed sessions panel | | | | |
| Rundown summary panel (Pattern B derived) | | | | |
| Floor oversight (Attribution Ratio) | | | | |
| Player-360 summary band (Theo, Not computed) | | | | |
| Player filter tile stack | | | | |
| Start-from-previous (Pattern B net) | | | | |
| Cashier amount display + cash-out form (Draft badge) | | | | |
| Rating slip buy-in threshold indicator | | | | |
| Loyalty comp-confirm + entitlement-confirm | | | | |
| MTL surfaces (compliance isolation) | | | | |
| Admin alerts alert-detail-card | | | | |

**Column definitions:**
- **Authority visible**: Authority label ("Actual", "Estimated", "Observed", "Compliance") renders at first glance — not tooltip-only, not truncated
- **Completeness visible**: Completeness badge/text renders where relevant to the surface
- **Forbidden labels absent**: No "Handle", "Coverage quality", or "Theo: 0/$0" in rendered output
- **Pattern A/B correct**: Multi-authority surfaces use Pattern A split; derived summaries use Pattern B with Derived label + degraded authority + derivedFrom declared

**Quality gate commands:**
```bash
npm run type-check 2>&1 | tail -5
npm run lint 2>&1 | tail -5
npm run build 2>&1 | tail -10
```
All must exit 0.

**ROLLOUT-TRACKER.json updates:**

1. Close `DEF-006` in `deferred_register`:
```json
"DEF-006": {
  "id": "DEF-006",
  "status": "closed",
  "closed_in": "EXEC-077",
  "commit_sha": "<WS7 commit SHA or commit_sha_pending: true>",
  "resolution": "Component tests born for rating-slip-modal, start-from-previous, and start-from-previous-modal asserting integer-cents FinancialValue shape from Phase 1.1/1.2B DTO migration."
}
```

2. Update `cursor`:
```json
"cursor": {
  "active_phase": "1.4",
  "phase_status": "not_started",
  "phase_label": "Phase 1.3 complete. Phase 1.4 (Validation: Lint + Truth-Telling Tests) pending.",
  "last_closed_phase": "1.3",
  "last_closed_date": "<merge date>",
  "last_closed_exec": "EXEC-077",
  "last_closed_commit": "<merge commit SHA or commit_sha_pending: true>"
}
```

If SHAs are not yet available at commit time, use `"commit_sha_pending": true` with a follow-up note. Phase 1.4 must not begin until real SHAs replace the pending marker.

**Acceptance criteria for WS8:**
- Sentinel grep returns zero matches for all forbidden labels
- Authority-class sentinel: all 4 surfaces pass label + value correctness check
- Semantic spot-check matrix: all 4 scenarios pass
- Dev-server walkthrough checklist complete with recorded pass/fail
- `npm run type-check`, `npm run lint`, `npm run build` all exit 0
- ROLLOUT-TRACKER.json updated with DEF-006 closure and cursor advance
- Lead-architect sign-off recorded in PR description or implementation notes

---

## Intake Traceability Audit

```
[INTAKE TRACEABILITY] EXEC-077 vs FIB-S FIB-S-FIN-PHASE-1-3
─────────────────────────────────────────────────────────────────
Capability coverage:    9/9 CAPs covered (8 original + CAP-1A from FIB-S amendment)
  CAP-1   → WS1_COMPONENTS (component births + shared component tests)
  CAP-1A  → WS1_COMPONENTS (props contract freeze — FIB-S amendment)
  CAP-2   → WS2_SHIFT_V3 (shift-dashboard-v3 migration)
  CAP-3   → WS3_PIT_TABLE_FLOOR (pit/table/floor migration)
  CAP-4   → WS4_PLAYER (player surfaces migration)
  CAP-5   → WS5_TRANSACTIONS (operator transactions migration)
  CAP-6   → WS6_COMPLIANCE (compliance/monitoring migration)
  CAP-7   → WS7_DEF006 (DEF-006 test births)
  CAP-8   → WS8_GATES (quality gates + sentinel + walkthrough)

Anti-invention (desc):  CLEAN
  WS1 — components/financial/ only (new, no existing files modified)
  WS2 — components/shift-dashboard-v3/ only
  WS3 — listed pit/table/floor files only; pit-map deviation recorded
  WS4 — listed player files only
  WS5 — listed transaction files + caller scope for buy-in-threshold-indicator
  WS6 — listed MTL + admin-alerts files only
  WS7 — test files only; path deviation recorded
  WS8 — ROLLOUT-TRACKER.json only; no code changes

Anti-invention (paths): 22/22 output paths verified against FIB-S surfaces
  All WS1 outputs → SURF-1 ✓
  WS2 outputs → SURF-2 ✓
  WS3 outputs → SURF-3, SURF-4, SURF-10 ✓; SURF-9 deviation recorded ✓
  WS4 outputs → SURF-5, SURF-6 ✓
  WS5 outputs → SURF-7, SURF-8, SURF-13 ✓
  WS6 outputs → SURF-11, SURF-12 ✓
  WS7 outputs → SURF-14 ✓ (path corrected: components/modals/rating-slip/__tests__/)
  WS8 output (ROLLOUT-TRACKER) → governance artifact ✓

Open questions:         0 open / 0 carried (none declared in FIB-S)
Hard rule visibility:   11/11 FIB-S rules in acceptance criteria
  RULE-1  → WS1 AC: visible authority badge at first glance (SRC §L2)
  RULE-2  → WS2/WS3/WS4 AC: forbidden labels removed; Handle, Coverage quality, Theo:0
  RULE-3  → WS3/WS4/WS5/WS6 AC: Pattern A split where rated+unrated appear together
  RULE-4  → WS6 AC: compliance never merged with actual/estimated/observed
  RULE-5  → WS1–WS8 AC: hold_percent never FinancialValue (DEF-NEVER)
  RULE-6  → WS5 AC: average_bet, points, thresholds unwrapped; Draft badge for inputs
  RULE-7  → WS1/WS3/WS4/WS5/WS6 AC: formatCents not formatDollars on FinancialValue.value
  RULE-8  → WS7 AC: DEF-006 tests born and passing
  RULE-9  → WS1 AC: props contract freeze documented before surface rollout
  RULE-10 → WS8 AC: semantic spot-check matrix passes
  RULE-11 → WS8 AC: per-authority-class sentinel source-of-truth validation
─────────────────────────────────────────────────────────────────
```

---

## Execution Plan

```
Phase 1 (sequential — foundational):
  WS1_COMPONENTS     → components/financial/ birth + props contract freeze + component tests

Phase 2 (parallel — fully disjoint file sets, all depend only on WS1):
  WS2_SHIFT_V3       → components/shift-dashboard-v3/
  WS3_PIT_TABLE_FLOOR → components/pit-panels/ + components/table/ + app/(landing)/floor-oversight/
  WS4_PLAYER          → components/player-360/ + components/player-sessions/start-from-previous.tsx
  WS5_TRANSACTIONS    → components/cashier/ + components/rating-slip/ + components/loyalty/
  WS6_COMPLIANCE      → components/mtl/ + components/admin-alerts/

Phase 3 (sequential — WS7 waits for WS4 + WS5 components to be in final migrated state):
  WS7_DEF006          → DEF-006 test births

Phase 4 (sequential — all prior phases complete):
  WS8_GATES           → sentinel grep + spot-check + type-check + lint + build + walkthrough
```

---

## Definition of Done

**Functionality**
- [ ] `FinancialValue.tsx`, `AttributionRatio.tsx`, `CompletenessBadge.tsx` exist in `components/financial/`
- [ ] Props contract freeze documented in `FinancialValue.tsx` before any surface migration
- [ ] Every in-scope production surface family renders `FinancialValue` envelope currency with visible authority and completeness
- [ ] "Handle", "Coverage quality", and `Theo: 0 / $0` placeholder displays absent from production UI paths
- [ ] Pattern A split display used wherever rated + unrated appear together
- [ ] Pattern B derived display declares contributing authorities and `derivedFrom` inputs
- [ ] Compliance authority isolated — never merged with operational authorities
- [ ] `app/review/pit-map/components/table-card.tsx` deviation recorded in PR

**Data & Integrity**
- [ ] No surface changes service output, DTO shape, API response shape, or database schema
- [ ] For each authority class (actual, estimated, observed, compliance), at least one surface validated against source-of-truth data
- [ ] `hold_percent`, `average_bet`, policy thresholds, loyalty points remain unwrapped

**Security & Access**
- [ ] No route handler, service, RLS policy, or tenant-scoping behavior changed
- [ ] Compliance authority never merged into operational authority displays

**Testing**
- [ ] Shared component tests born and passing for `FinancialValue`, `AttributionRatio`, `CompletenessBadge` (8 behavioral assertions for `FinancialValue`)
- [ ] DEF-006 component tests born and passing for `rating-slip-modal`, `start-from-previous`, `start-from-previous-modal`
- [ ] Sentinel grep confirms forbidden labels absent from `components/**/*.{ts,tsx}` and `app/**/*.{ts,tsx}` (excluding test files)
- [ ] Semantic spot-check matrix passes (4 scenarios per FIB-S RULE-10)
- [ ] `npm run type-check` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0

**Operational Readiness**
- [ ] Dev-server walkthrough covers every migrated surface family with recorded pass/fail checklist
- [ ] Lead-architect sign-off recorded
- [ ] ROLLOUT-TRACKER.json updated: DEF-006 closed, cursor advanced to Phase 1.4

**Documentation**
- [ ] Implementation notes record final migrated surface list and all inventory deviations
- [ ] ROLLOUT-TRACKER.json updated for Phase 1.3 closure
- [ ] Known limitations documented: Phase 1.4 owns lint enforcement, Playwright DOM assertions, CI gates, I5 truth-telling harness, formatter export cleanup

---

## Rollback

Revert: WS1 component births (7 files), WS2–WS6 surface migration changes (~22 files), WS7 test births (3 files + directory), WS8 tracker update (1 file). Approximately 33 files total. No migrations, no RLS changes, no API changes — rollback is a clean revert with no side effects.

---

## Phase 1.4 Handoff

This execution closes Phase 1.3 completely. The following remain for Phase 1.4:

| Item | Phase |
|------|-------|
| ESLint `no-unlabeled-financial-value` rule | Phase 1.4 |
| ESLint `no-forbidden-financial-label` rule | Phase 1.4 |
| Playwright DOM assertions: visible authority labels | Phase 1.4 |
| CI gate for envelope regression | Phase 1.4 |
| I5 truth-telling harness subset (partial + unknown completeness) | Phase 1.4 |
| `lib/format.ts` exported helper removal (`formatDollars`, `formatCents`) | Phase 1.4 |
| `hold_percent` FinancialValue wrapping | DEF-NEVER — all phases |
