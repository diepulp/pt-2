---
id: PRD-077
title: Financial Telemetry - Wave 1 Phase 1.3 - UI Split Display and Labels
owner: Lead Architect (spec steward); Engineering (implementation)
status: Draft
affects:
  - PRD-070
  - PRD-071
  - PRD-072
  - PRD-073
  - PRD-074
  - PRD-075
  - PRD-076
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
  - docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-SURFACE-INVENTORY.md
  - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-FORBIDDEN-LABELS.md
created: 2026-05-04
last_review: 2026-05-04
phase: Wave 1 Phase 1.3 - UI Layer: Split Display + Labels
pattern: Presentation-only; shared financial display components + full surface migration
http_boundary: false
parent_planning_ref: docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md
predecessor_prd: docs/10-prd/PRD-076-financial-telemetry-wave1-phase1.2b-c-contract-expansion-v0.md
fib_h: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-3/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-3-UI-SPLIT-DISPLAY.md
fib_s: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-3/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-3-UI-SPLIT-DISPLAY.json
sdlc_category: UI / Presentation
pipeline_chain: /prd-writer -> /lead-architect EXEC-077 -> /build-pipeline
---

# PRD-077 - Financial Telemetry - Wave 1 Phase 1.3 - UI Split Display and Labels

## 1. Overview

- **Owner:** Lead Architect (spec steward). Engineering owns implementation through `frontend-design-pt-2`, with `qa-specialist` validating gates.
- **Status:** Draft
- **Summary:** Phase 1.3 completes the operator-facing side of the Wave 1 financial telemetry contract. Service and API layers now emit stable integer-cents `FinancialValue` envelopes, but many PT-2 surfaces still render bare currency strings, forbidden labels, or placeholder values that hide authority and completeness metadata. This slice births shared financial display components, migrates every in-scope production surface family to visible authority/completeness rendering, removes the known forbidden labels, and births the DEF-006 component tests deferred from earlier phases. It does not change service output, OpenAPI contracts, lint rules, Playwright enforcement, CI gates, observability, or database schema.

## 2. Problem & Goals

### 2.1 Problem

Pit bosses and floor supervisors currently see financial values across shift dashboards, player 360, table rundown reports, cashier flows, MTL surfaces, loyalty confirmations, and floor oversight with inconsistent or missing authority labels. Some labels actively mislead operators: the analytics panel says "Handle" for an estimated drop, floor oversight says "Coverage quality" for what the SRC now names "Attribution Ratio", and player 360 can render an uncomputed theo placeholder as `$0`.

The upstream contract is already stable. The remaining problem is last-mile presentation: UI components discard or blur `FinancialValue.type`, `source`, and `completeness`, leaving operators unable to tell whether a number is actual, estimated, observed, or compliance-sourced. That blocks the Wave 1 exit criterion requiring the SRC envelope to be present on every production financial surface, API plus UI.

### 2.2 Goals

| Goal | Observable Signal |
|------|-------------------|
| **G1 - Shared primitives** | `FinancialValue.tsx`, `AttributionRatio.tsx`, and `CompletenessBadge.tsx` exist under `components/financial/` with frozen props for Phase 1.4 lint alignment |
| **G2 - Full surface migration** | Every in-scope production UI surface family from the Phase 1.0 inventory renders financial currency through visible authority/completeness labeling |
| **G3 - Forbidden labels removed** | "Handle", "Coverage quality", and uncomputed `Theo: $0` placeholder displays are absent from production UI code paths |
| **G4 - Truthful authority behavior** | Mixed operational authority degrades per hierarchy, Pattern A split display is used where rated and unrated values appear together, and compliance values are never merged with operational authorities |
| **G5 - DEF-006 closed** | Component tests are born for `rating-slip-modal`, `start-from-previous`, and `start-from-previous-modal` using the Phase 1.1/1.2B DTO shape |
| **G6 - Clean validation** | Dev-server walkthrough, semantic sentinel checks, `npm run type-check`, `npm run lint`, and `npm run build` pass |

### 2.3 Non-Goals

- No service, mapper, schema, DTO, or route handler changes. Those completed in Phases 1.1 through 1.2B.
- No OpenAPI or API contract changes. Phase 1.2B-C owns that boundary.
- No ESLint rule authoring for `no-unlabeled-financial-value` or `no-forbidden-financial-label`. That is Phase 1.4.
- No Playwright DOM assertion suite, screenshot baseline, I5 truth-telling harness, or CI gate. Those are Phase 1.4 validation and enforcement work.
- No `lib/format.ts` export removal. `<FinancialValue>` may use existing formatters internally, but export cleanup waits for lint enforcement.
- No Attribution Ratio value computation changes. `<AttributionRatio>` renders the value supplied by the service.
- No new financial authority values or financial fact classes.
- No wrapping of `hold_percent`, `average_bet`, policy thresholds, loyalty points, or `current_segment_average_bet` as `FinancialValue`.
- No SQL migrations or Wave 2 financial fact model work.
- No migration of confirmed dead code: `components/shift-dashboard/` legacy surfaces and `app/review/shift-dashboard-v2/`.

## 3. Users & Use Cases

- **Primary users:** Pit bosses and floor supervisors monitoring active shifts, reviewing player sessions, preparing shift handoff, and reviewing shift-end financial activity.
- **Secondary users:** Frontend engineers migrating UI surfaces; lead architect validating Wave 1 semantic closure; QA engineers confirming component test births and quality gates.

**Top Jobs:**

- As a **pit boss**, I need every displayed currency value to visibly tell me whether it is actual, estimated, observed, or compliance-sourced so I can judge confidence without opening implementation docs.
- As a **floor supervisor**, I need estimated and actual activity to remain visually distinct when reviewing table and player activity so I do not treat incomplete attribution as settled ledger data.
- As a **frontend engineer**, I need one shared financial display component contract so surface migrations do not invent local authority-label conventions.
- As a **lead architect**, I need all in-scope surface families migrated before Phase 1.4 lint rules activate, otherwise lint would report pre-existing migration debt instead of regressions.

## 4. Scope & Feature List

### 4.1 Precondition Gate

Phase 1.2B must be closed before implementation begins: service output is stable integer-cents `FinancialValue`, BRIDGE-001 is retired, route contracts are expanded, and the OpenAPI boundary is stable. If a surface still requires a service or API shape change to render truthfully, this PRD halts and requires FIB amendment.

### 4.2 In Scope

**Shared component births:**
- Birth `components/financial/FinancialValue.tsx` as the canonical currency rendering primitive for stable `FinancialValue` envelopes.
- Birth `components/financial/AttributionRatio.tsx` for SRC K1 "Attribution Ratio" displays.
- Birth `components/financial/CompletenessBadge.tsx` for `complete`, `partial`, and `unknown` status rendering.
- Freeze the `<FinancialValue>` props contract before rollout: integer-cents value, `actual | estimated | observed | compliance` authority, source visibility, completeness status, no hidden unknowns, and no mixed compliance display.

**Production surface migrations:**
- Before migrating surfaces, EXEC-077 must re-grep every in-scope surface path from the Phase 1.0 inventory, produce a confirmed list of migrated files, and record missing or removed surfaces as explicit inventory deviations. No surface may be silently excluded.
- Migrate `components/shift-dashboard-v3/**` left rail, center metrics, and telemetry rail financial renders to shared financial display primitives.
- Migrate `components/pit-panels/analytics-panel.tsx` and `components/pit-panels/closed-sessions-panel.tsx`; replace "Handle" with "Estimated Drop".
- Migrate `components/table/rundown-summary-panel.tsx` for fills, credits, drop, and derived win/loss displays.
- Migrate `components/player-360/summary/summary-band.tsx` and `components/player-360/left-rail/filter-tile-stack.tsx`; uncomputed theo renders as estimated/unknown with "Not computed", not `$0`.
- Migrate `components/player-sessions/start-from-previous.tsx` financial totals and derived net display.
- Migrate `components/cashier/amount-display.tsx` and `components/cashier/cash-out-form.tsx`; committed amounts render with authority, while pre-commit form input is visibly "Draft".
- Migrate `components/rating-slip/buy-in-threshold-indicator.tsx` so callers pass typed envelopes and the component reads authority/source.
- Re-verify pit-map review surface existence during EXEC-077 planning. If `app/review/pit-map/components/table-card.tsx` or an equivalent live table-card surface exists in the implementation branch, migrate table session totals; if no live file exists, record the inventory deviation and do not birth a replacement surface in this PRD.
- Migrate `app/(landing)/floor-oversight/page.tsx`; rename "Coverage quality" to "Attribution Ratio" and route the KPI through `<AttributionRatio>`.
- Migrate MTL compliance surfaces: `components/mtl/gaming-day-summary.tsx`, `components/mtl/compliance-dashboard.tsx`, `components/mtl/entry-badge.tsx`, and `components/mtl/agg-badge.tsx`.
- Migrate monitoring and loyalty surfaces: `components/admin-alerts/alert-detail-card.tsx`, `components/loyalty/comp-confirm-panel.tsx`, and `components/loyalty/entitlement-confirm-panel.tsx`.

**Semantic verification and test births:**
- Verify all authority classes through sentinel checks: one migrated surface each for `actual`, `estimated`, `observed`, and `compliance`.
- Verify mixed authority behavior: actual-only remains Actual; rated plus unrated values render as Pattern A split display; Pattern B derived summary is allowed only when explicitly labeled Derived and accompanied by an input declaration; compliance remains isolated; unknown completeness renders explicitly.
- Birth shared component tests for `components/financial/FinancialValue.tsx`, `components/financial/AttributionRatio.tsx`, and `components/financial/CompletenessBadge.tsx`.
- Birth DEF-006 component tests at `components/modals/rating-slip/__tests__/rating-slip-modal.test.tsx`, `components/player-sessions/__tests__/start-from-previous.test.tsx`, and `components/player-sessions/__tests__/start-from-previous-modal.test.tsx`.
- Run a dev-server walkthrough across every in-scope financial surface family and record lead-architect sign-off.

### 4.3 Out of Scope

- Legacy `components/shift-dashboard/` and `app/review/shift-dashboard-v2/` are excluded as confirmed dead code.
- Phase 1.4 enforcement and validation work is excluded even if it would catch this PRD's regressions later.
- Surface inventory expansion beyond Phase 1.0 must go through FIB amendment.

## 5. Requirements

### 5.1 Functional Requirements

1. `components/financial/FinancialValue.tsx` must render currency value, authority, source text, and completeness status from a stable `FinancialValue` envelope without relying on tooltip-only authority or source provenance.
2. `FinancialValue` must render `unknown` completeness explicitly and must not coerce unknown values to `$0`, blank, or inferred completeness.
3. `FinancialValue` must reject or avoid any display variant that merges `compliance` authority with operational `actual`, `observed`, or `estimated` values.
4. Mixed operational authority displays must follow SRC C1-C3 and the D5 hierarchy: actual-only remains Actual; observed/estimated contribution is visible; rated plus unrated values use Pattern A split display by default; a single summarized display is allowed only as Pattern B with a visible Derived label and visible input declaration.
5. Pattern A split display must be used wherever rated and unrated values appear together.
6. A Pattern B Derived display must explicitly declare contributing authority classes such as Actual plus Estimated, render the degraded authority label per D5 hierarchy, and include a visible `derivedFrom` input declaration that maps to real fields rather than free-text labels. A Derived display that does not declare both degraded authority and inputs is non-conformant.
7. `components/financial/AttributionRatio.tsx` must render the supplied Attribution Ratio KPI as a ratio/percentage display and must not compute or reinterpret the service value.
8. `components/financial/CompletenessBadge.tsx` must render `complete`, `partial`, and `unknown` with visible status text or equivalent visible affordance.
9. `AttributionRatio` and `CompletenessBadge` must not be visually merged into a single semantic indicator. Any layout placing them adjacently must preserve distinct labels and visual separation.
10. `FinancialValue.value` must be rendered using cents-aware formatting only. Direct usage of `formatDollars(value.value)` or equivalent dollar-based formatting on integer cents is forbidden. All formatting of `FinancialValue.value` must occur inside `FinancialValue.tsx` or its internal helpers.
11. All in-scope surface families listed in Section 4.2 must migrate away from bare currency display for `FinancialValue` envelope values.
12. Forbidden production labels must be removed: "Handle", "Coverage quality", standalone KPI "Coverage" where it means Attribution Ratio, and uncomputed theo rendered as authoritative `$0`.
13. Shared financial component tests must prove integer-cents formatting, visible authority, visible source text, visible completeness, unknown "Not computed" treatment, compliance isolation, Pattern A split display behavior, and Pattern B derived input declaration behavior.
14. DEF-006 component tests must be born against the integer-cents `FinancialValue` DTO shape.

### 5.1.1 Shared Component Contracts

`components/financial/FinancialValue.tsx` must export:

```ts
export interface FinancialValueProps {
  value: FinancialValue;
  label: string;
  variant?: 'inline' | 'stacked' | 'compact';
  derivedFrom?: readonly string[];
  className?: string;
}
```

- `value.value` is integer cents and must be rendered through cents-aware formatting inside this component or its internal helpers only.
- `value.type`, `value.source`, and `value.completeness.status` must be visible at first glance in rendered text or adjacent visible badge text. Tooltip-only, icon-only, or implied source disclosure is non-conformant.
- `derivedFrom` is required when the display label or caller semantics declare a Derived summary and must map to real contributing fields, not free-text labels.
- Derived displays must visibly declare contributing authority classes and the degraded authority label chosen under D5 hierarchy.
- `compliance` values must not accept `derivedFrom` entries that include operational authority labels.

`components/financial/AttributionRatio.tsx` must export:

```ts
export interface AttributionRatioProps {
  ratio: number | null;
  label?: 'Attribution Ratio';
  completenessStatus?: never;
  className?: string;
}
```

- The component renders the supplied ratio only; it must not compute numerator or denominator.
- The rendered label must be `Attribution Ratio`.
- The component must not render completeness wording or accept completeness props.
- The component must remain visually distinct from any adjacent completeness indicator.

`components/financial/CompletenessBadge.tsx` must export:

```ts
export interface CompletenessBadgeProps {
  status: CompletenessStatus;
  coverage?: number;
  className?: string;
}
```

- `unknown` must render explicit visible text, using `Unknown` by default and `Not computed` where the caller label is theo-specific.
- `coverage` may supplement completeness but must not be labeled as Attribution Ratio.
- The component must remain visually distinct from any adjacent Attribution Ratio indicator.

### 5.2 Non-Functional Requirements

1. `npm run type-check` must exit 0.
2. `npm run lint` must exit 0.
3. `npm run build` must exit 0.
4. New shared components must follow existing React 19, Next.js App Router, Tailwind v4, and shadcn/ui conventions.
5. UI changes must preserve current user journeys and page routing; this PRD changes semantic rendering, not navigation.
6. The migration must remain shippable before Phase 1.4 tooling exists.
7. Phase 1.4 must be able to target the frozen `<FinancialValue>` props contract without rewriting Phase 1.3.
8. No production `console.*`, `as any`, or direct database-type drift is introduced.

## 6. UX / Flow Overview

- Operator opens a production financial surface such as shift dashboard v3, player 360, table rundown, cashier, MTL, loyalty, pit map, or floor oversight.
- Currency values that come from `FinancialValue` envelopes render with visible authority: Actual, Estimated, Observed, or Compliance.
- Completeness appears alongside the value when relevant, including explicit Unknown or Not computed states.
- Rated and unrated or actual and estimated activity remains split by default; any single summarized value is visibly labeled Derived and declares its inputs instead of being collapsed into an unlabeled total.
- Attribution KPI surfaces read "Attribution Ratio", not "Coverage quality", and are visually distinct from completeness badges.
- Compliance amounts remain visually isolated from operational authorities.

## 7. Dependencies & Risks

### 7.1 Dependencies

- **Phase 1.2B exit gate:** EXEC-074/075/076 closed 2026-05-03; service output and API contracts are stable integer-cents `FinancialValue` envelopes.
- **Type source:** `types/financial.ts` provides `FinancialValue`, `FinancialAuthority`, and `CompletenessStatus`.
- **Surface inventory:** `WAVE-1-SURFACE-INVENTORY.md` provides the bounded full-mode surface family list.
- **Forbidden labels:** `WAVE-1-FORBIDDEN-LABELS.md` provides the denylist and replacement terms.
- **SRC:** `SURFACE-RENDERING-CONTRACT.md` governs authority, completeness, split display, and Attribution Ratio semantics.
- **Formatter availability:** `lib/format.ts` remains available for component-internal formatting; export removal is deferred.

### 7.2 Risks

| Risk | Mitigation |
|------|------------|
| Surface migration discovers a required service/API shape gap | Stop and amend the FIB; this PRD does not absorb service or API changes |
| Full-mode migration touches many files and invites local variations | Keep every surface change to the same operation: replace bare currency rendering with shared financial display primitives |
| Visual authority labels become tooltip-only or too subtle | Treat visible-at-first-glance authority as a functional requirement, not styling polish |
| Compliance values get merged into operational totals during component generalization | Require dedicated compliance rendering and sentinel verification |
| Phase 1.4 lint rules cannot target the component contract cleanly | Freeze and document the props contract before rollout |
| Dead-code surfaces consume migration time | Keep legacy shift-dashboard and shift-dashboard-v2 excluded unless imports prove they are live |
| Inventory references a stale or absent surface path | EXEC-077 must re-grep every in-scope path before implementation; absent files are recorded as inventory deviations, not recreated |

### 7.3 Open Questions for EXEC-077

- Exact file-line inventory must be re-verified during EXEC-SPEC planning because the Phase 1.0 inventory line numbers are provisional.
- Component visual treatment should follow existing PT-2 UI density and design conventions; no new product flow is needed.

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `FinancialValue.tsx`, `AttributionRatio.tsx`, and `CompletenessBadge.tsx` exist under `components/financial/`.
- [ ] Every in-scope production surface family in Section 4.2 renders `FinancialValue` envelope currency with visible authority and completeness treatment.
- [ ] "Handle", "Coverage quality", and uncomputed-theo `$0` placeholder displays are absent from production UI paths.
- [ ] Actual-only, Pattern A split, Pattern B derived, Compliance, and Unknown completeness sentinel scenarios render according to SRC rules.
- [ ] Sentinel validation confirms correctness of authority model implementation, not full surface correctness coverage.
- [ ] EXEC-077 records any stale inventory paths, including pit-map review surface presence or absence, before closure.

**Data & Integrity**
- [ ] No surface changes service output, DTO shape, API response shape, or database schema.
- [ ] For each authority class (`actual`, `estimated`, `observed`, `compliance`), at least one migrated surface is checked against source-of-truth data for both value and label correctness.
- [ ] `hold_percent`, `average_bet`, policy thresholds, loyalty points, and `current_segment_average_bet` remain unwrapped.

**Security & Access**
- [ ] No route handler, service authorization, RLS policy, or tenant-scoping behavior is changed.
- [ ] Compliance authority is never merged into operational authority displays.

**Testing**
- [ ] Shared component tests are born and passing for `FinancialValue`, `AttributionRatio`, and `CompletenessBadge`.
- [ ] DEF-006 component tests are born and passing for `components/modals/rating-slip/rating-slip-modal.tsx`, `start-from-previous`, and `start-from-previous-modal`.
- [ ] A semantic sentinel grep confirms forbidden production labels are absent from `components/**/*.{ts,tsx}` and `app/**/*.{ts,tsx}`, excluding test files.
- [ ] `npm run type-check` exits 0.
- [ ] `npm run lint` exits 0.
- [ ] `npm run build` exits 0.

**Operational Readiness**
- [ ] Dev server walkthrough covers every migrated financial surface family and records lead-architect sign-off.
- [ ] Dev-server walkthrough produces a checklist covering all surface families with pass/fail for authority visibility, completeness visibility, forbidden label absence, and Pattern A/B correctness, with artifact or notes attached to the PR or implementation commit.
- [ ] Rollback is defined as reverting the shared component births, surface migrations, DEF-006 test births, and any tracker/progress updates from the implementation commit.
- [ ] Phase 1.4 has a stable component API to target for lint and DOM assertion work.

**Documentation**
- [ ] Implementation notes record the final migrated surface list and any inventory deviations.
- [ ] `ROLLOUT-TRACKER.json` is updated to reflect Phase 1.3 closure or pending-SHA protocol after implementation.
- [ ] Known limitations are documented: Phase 1.4 owns lint enforcement, Playwright DOM assertions, CI gates, I5 truth-telling harness, and formatter export cleanup.

## 9. Related Documents

**FIB Intake Artifacts**
- `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-3/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-3-UI-SPLIT-DISPLAY.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-3/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-3-UI-SPLIT-DISPLAY.json`

**Predecessor PRDs and Execution**
- `docs/10-prd/PRD-070-financial-telemetry-wave1-phase1.1-service-dto-envelope-v0.md`
- `docs/10-prd/PRD-071-financial-telemetry-wave1-phase1.2-api-envelope-at-wire-v0.md`
- `docs/10-prd/PRD-072-financial-telemetry-wave1-phase1.1b-visit-anchored-cents-envelope-v0.md`
- `docs/10-prd/PRD-073-financial-telemetry-wave1-phase1.1c-shift-intelligence-authority-routing-v0.md`
- `docs/10-prd/PRD-074-financial-telemetry-wave1-phase1.2b-canonicalization-v0.md`
- `docs/10-prd/PRD-075-financial-telemetry-wave1-phase1.2b-b-render-migration-v0.md`
- `docs/10-prd/PRD-076-financial-telemetry-wave1-phase1.2b-c-contract-expansion-v0.md`
- `docs/21-exec-spec/PRD-074/EXEC-074-financial-telemetry-wave1-phase1.2b-canonicalization.md`
- `docs/21-exec-spec/PRD-075/EXEC-075-financial-telemetry-wave1-phase1.2b-b-render-migration.md`
- `docs/21-exec-spec/PRD-076/EXEC-076-financial-telemetry-wave1-phase1.2b-c-contract-expansion.md`

**Architecture, Data, Governance, and Quality**
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json`
- `docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-SURFACE-INVENTORY.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-FORBIDDEN-LABELS.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-CLASSIFICATION-RULES.md`
- `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md`
- `docs/issues/gaps/financial-data-distribution-standard/decisions/TRANSITIONAL-GOVERNANCE-CAVEAT.md`

---

## Appendix A: Scope Guardrail Summary

| Guardrail | Rule |
|-----------|------|
| Primary layer | UI |
| Primary change class | Presentation with semantic alignment |
| Coverage mode | Full |
| Expected file count | About 29-32 files |
| Shared component births | 3 |
| Surface family migrations | 11 in-scope families; dead legacy surfaces excluded |
| Secondary layers | None |
| Downstream expansion without amendment | Not allowed |

## Appendix B: Phase 1.4 Handoff

Phase 1.4 owns enforcement and validation after the migrated UI contract is stable:

- ESLint `no-unlabeled-financial-value` and `no-forbidden-financial-label`.
- Playwright DOM assertions for visible authority labels.
- CI gate for envelope regression.
- I5 truth-telling harness subset for `partial` and `unknown` completeness states.
- `lib/format.ts` export cleanup after lint prevents new bare formatter usage.
