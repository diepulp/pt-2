# FIB-H — Financial Telemetry Phase 1.3 — UI Layer: Split Display + Labels

status: DRAFT
date: 2026-05-03
owner: Financial Telemetry (Cross-context)

predecessor_fib: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b-c/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-C-CONTRACT-EXPANSION.md
predecessor_phase: Phase 1.2B (Service Canonicalization + Contract Expansion — EXEC-074/075/076, closed 2026-05-03, commit ad6d1748 / e73879f4)

successor_slice: Phase 1.4 — Validation: Lint + Truth-Telling Tests. Requires its own FIB + PRD pair.

---

# Scope Guardrail Block

**Governance reference:** `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md`

**One-line boundary:**
This FIB normalizes existing financial UI surfaces so stable `FinancialValue` envelopes are rendered truthfully to operators by introducing shared display components and migrating all in-scope surface families; it does not change service output, API contracts, lint enforcement rules, or observability infrastructure.

**Primary change class:** Presentation (with semantic alignment)

**Migration class:** Surface normalization

**Coverage mode:** Full

Justification for Full mode (GOV-FIB-001 §6.3):
- This is the designated full-inventory Presentation rollout slice per ROLLOUT-ROADMAP.md §3 Phase 1.3.
- Representative coverage is insufficient: Phase 1.4's `no-unlabeled-financial-value` lint rule cannot activate without 100% surface migration — activating it against a partial migration would produce a flood of pre-existing violations that are not regressions.
- Partial migration fails the Phase 1.3 exit gate criterion "no unlabeled currency in any rendered surface" — a mixed state (some surfaces labeled, others not) is not internally consistent for the operator.
- The surface inventory is bounded and fixed: WAVE-1-SURFACE-INVENTORY.md §5.2 enumerates all in-scope surface families from Phase 1.0. This is not open-ended inventory expansion.
- GOV-FIB-001 §6.3 explicitly permits Full mode for a dedicated rollout/inventory slice that does not also introduce new semantics, transport shape, or infrastructure. This FIB introduces only Presentation work (components + label migrations).

**Migration posture:**
This phase is not feature delivery. It is a surface normalization migration and UI-layer semantic enforcement of an upstream contract. Review priority is consistency, uniformity, and semantic preservation over new UI flexibility or clever component abstraction. Reviewers must not treat this as cosmetic-only UI work: forbidden label correction, authority correction, completeness correction, and degradation behavior require semantic discipline. The work succeeds only if the last-mile rendering stops discarding or misrepresenting already-stable source-of-truth metadata.

**Primary layer:** UI

**Layer budget:**
- New shared components: 3 (`components/financial/FinancialValue.tsx`, `AttributionRatio.tsx`, `CompletenessBadge.tsx`)
- Surface files migrated: ~23–26 across 11 in-scope surface families (legacy `components/shift-dashboard/` and `app/review/shift-dashboard-v2/` excluded — confirmed dead code, no UI imports)
- DEF-006 component test births: 3
- Total files: ~29–32
- Directory boundaries: `components/financial/` (new), `components/shift-dashboard-v3/`, `components/pit-panels/`, `components/table/`, `components/player-360/`, `components/player-sessions/`, `components/cashier/`, `components/mtl/`, `components/admin-alerts/`, `components/loyalty/`, `components/rating-slip/`, `app/(landing)/floor-oversight/`, `app/review/pit-map/`

**§11 multi-boundary justification (GOV-FIB-001 §11):**
Scale exceeds the §11 single-directory default. Justification: (1) This is the explicitly designated full-inventory Presentation rollout phase; GOV-FIB-001 §6.3 permits Full mode. (2) Every file touched receives exactly one class of change: replace bare currency display with `<FinancialValue>` component call or birth shared component. (3) No file's change requires knowledge of another file's logic beyond the shared component API. (4) Scale is linear across surface families. (5) Splitting into component-birth + surface-migration sub-phases would produce an intermediate state where new components exist but no surface uses them — this fails the "ships as correct internal contract" test (GOV-FIB-001 §6.7): new unused components are not truthful delivery. (6) The surface inventory is bounded by Phase 1.0.

**Cause vs consequence split:**

| Category | This FIB | Next FIB |
|---|---|---|
| Service output integer-cents (cause) | Complete — Phases 1.2B-A/B/C | — |
| API contract documented (cause) | Complete — Phase 1.2B-C | — |
| Shared `<FinancialValue>` component birth (Presentation with semantic alignment) | In scope | — |
| Surface family migrations to `<FinancialValue>` (Presentation with semantic alignment) | In scope | — |
| Forbidden-label removal and authority/completeness alignment (UI semantic enforcement) | In scope | — |
| DEF-006 component test births | In scope | — |
| ESLint `no-unlabeled-financial-value` (Enforcement) | Not in scope | Phase 1.4 |
| ESLint `no-forbidden-financial-label` (Enforcement) | Not in scope | Phase 1.4 |
| Playwright DOM assertions for financial value presence (Enforcement) | Not in scope | Phase 1.4 |
| CI gate for envelope regression (Enforcement) | Not in scope | Phase 1.4 |
| I5 truth-telling harness subset (Validation) | Not in scope | Phase 1.4 |
| Attribution Ratio value computation changes (Semantics) | Not in scope | Service-layer concern |
| `lib/format.ts` export removal (Enforcement) | Not in scope | Phase 1.4 — requires lint guard first |

**Adjacent consequence ledger (GOV-FIB-001 §6.6):**

| Temptation removed from MUST | Why adjacent | Disposition |
|---|---|---|
| ESLint `no-unlabeled-financial-value` / `no-forbidden-financial-label` | Enforcement infrastructure that follows stable surface deployment; contract must be fully deployed before lint enforcement activates | Phase 1.4 — must encode the Phase 1.3 authority, completeness, and no-compliance-mixing constraints |
| Playwright DOM assertions: no currency rendered without visible authority label | Automated coverage of migrated surfaces; depends on stable component API | Phase 1.4 — Phase 1.3 exit gate uses dev-server walkthrough instead |
| CI gate for OpenAPI + envelope regression | Natural after surfaces, components, and lint rules are all stable | Phase 1.4 |
| I5 truth-telling harness subset | Validates completeness rendering under partial/unknown states; depends on stable `<FinancialValue>` component | Phase 1.4 |
| `lib/format.ts` exported helper removal (`formatDollars`, `formatCents`) | Formatter consolidation is internal to `<FinancialValue>`; removing exports breaks external consumers without lint guard | Phase 1.4 |
| Attribution Ratio value computation changes | Computing the actual ratio from data is a service-layer concern; `<AttributionRatio>` renders what the service provides | Out of scope — service concern, no Presentation work needed |
| Structured log events or runtime observability wiring | Adjacent while touching surface files; Observability is a different change class | Phase 1.4 |

At least three items explicitly removed from MUST; first, second, and fifth are different change classes (Enforcement, Validation, Observability) from Presentation.

**Atomicity test:**
1. Can this FIB ship without the deferred downstream work? Yes — after Phase 1.3 every PT-2 surface shows labeled financial values. Phase 1.4 lint rules and Playwright tests are independent tooling on top of the stable migration, but they must encode the semantic constraints established here to prevent regression.
2. Can the deferred downstream work begin after this FIB without rewriting it? Yes — Phase 1.4 takes the stable `<FinancialValue>` component API as its reference for lint rule generation. The component's props signature is the lint rule's target type.
3. Is the shipped FIB internally consistent and truthful? Yes — all surfaces migrated; no surface shows an unlabeled bare number; operator sees authority and completeness on every financial display; and each authority class has at least one source-of-truth sentinel correctness validation, not just a presence check.

**GOV-FIB-001 §7 red flags check:**
- "Must land atomically across service, API, UI, tests, and observability" — No. UI only (with scoped test births per DEF-006).
- "Includes both pattern proof and full inventory expansion" — No. This IS the full inventory rollout; there is no pattern-proof sub-phase.
- "Claims representative but uses full-inventory language" — No. Coverage mode is declared Full with justification.
- "Claims one primary class but includes logic work from another class" — No. Component births, label migrations, authority/completeness alignment, and DEF-006 component tests are UI-layer semantic enforcement of the already-stable upstream contract; no service/API semantics are changed.
- "Includes both a semantic change and the UI migration that consumes it" — No. Semantic changes are complete (Phase 1.2B). This FIB renders already-stable envelopes.
- All remaining red flags: Not triggered.

---

# A. Identity

**Feature name:** Phase 1.3 — UI Layer: Split Display + Labels

**Feature ID:** FIB-H-FIN-PHASE-1-3

**Related phase:** Wave 1 Phase 1.3 (successor to Phase 1.2B — all sub-phases closed)

**Requester / owner:** Vladimir Ivanov

**Date opened:** 2026-05-03

**Priority:** P1 — Wave 1 exit criterion "SRC envelope present on every production financial surface (API + UI)" cannot be met without labeled UI surfaces. Service and API layers have fully propagated the `FinancialValue` envelope; UI is the last unlabeled boundary.

**Target decision horizon:** Wave 1 Phase 1.3

---

# B. Operator Problem

Pit bosses and floor supervisors viewing financial data across PT-2 surfaces — shift dashboards, player 360, analytics panels, table rundown reports, floor oversight — see bare currency values with no visible indication of whether a figure is an authoritative PFT-sourced ledger amount, an estimated operational observation, a physical-count confirmation, or a compliance record. Some surfaces carry labels that actively misrepresent source authority: the analytics panel labels an estimated drop as `"Handle"` (a forbidden term per WAVE-1-FORBIDDEN-LABELS §2.A); the floor oversight page labels an attribution KPI as `"Coverage quality"` (renamed to `"Attribution Ratio"` per SRC §K1); the player 360 summary band renders a computed-theo placeholder as `$0` (SRC §F4 forbidden placeholder authority). The operator has no way to assess confidence in any displayed financial number without consulting external documentation. This is a direct violation of SRC §L1, which requires every rendered currency value to declare its authority visibly, at first glance, not buried in a tooltip.

---

# C. Pilot-fit / Current-Slice Justification

Labeled financial surfaces are a Wave 1 exit criterion (ROLLOUT-ROADMAP.md §10, criterion 1: "SRC envelope present on every production financial surface (API + UI)"; criterion 5: "Attribution Ratio renders correctly, distinct from completeness"). Without this phase, Wave 1 cannot close regardless of how clean the service and API layers are. Additionally, DEF-006 — component test births for `rating-slip-modal`, `start-from-previous`, and `start-from-previous-modal` — is a Phase 1.3 birth obligation deferred from Phase 1.1 because the DTO shape changed between Phase 1.1 and 1.2B. The service output is now stable (integer-cents `FinancialValue`) and the component test dirs can be born against the correct shape.

---

# D. Primary Actor and Operator Moment

**Primary actor:** Pit boss / floor supervisor

**When does this happen?** During active shift monitoring, player session review, shift handoff, and shift-end review — any time the operator opens a financial surface in the PT-2 UI.

**Primary surface:** Shift dashboard v3, analytics panel, player 360 summary band, table rundown, floor oversight KPI

**Trigger event:** The operator views any financial value in the PT-2 UI. The service already emits a `FinancialValue` envelope with `type`, `source`, and `completeness` metadata. The UI is not yet rendering the `type` badge or `completeness` status visibly — the metadata is being silently discarded at the component boundary.

---

# E. Feature Containment Loop

1. Developer births `components/financial/FinancialValue.tsx` using the stable `FinancialValue` type from `types/financial.ts` — renders `{ value, type, source, completeness }` with a visible authority badge (SRC §L2, badge must be visible at first glance; not tooltip-only) → shared Presentation primitive exists; all currency renders in PT-2 have a conformant path.

2. Developer freezes the `<FinancialValue>` props contract before surface rollout:
   - `value` must be the stable integer-cents value from a `FinancialValue` envelope or an explicitly documented non-value state when completeness is `unknown`.
   - `type` must be exactly one authority class: `actual | estimated | observed | compliance`.
   - `source` must be rendered or available through the visible label affordance without becoming tooltip-only authority.
   - `completeness.status` must be one of `complete | partial | unknown`; `unknown` must render explicitly and must not be converted to `$0`, blank, or inferred completeness.
   - `compliance` must not be accepted in any combined/mixed display variant; it requires a dedicated compliance render.
   - Mixed actual/observed/estimated displays must declare the degraded display authority according to D5 hierarchy and must not hide contributing authorities.
   → Phase 1.4 lint targets a frozen component API instead of chasing drift introduced during migration; if lint does not encode these constraints, the migration remains manual discipline and can regress.

3. Developer births `components/financial/AttributionRatio.tsx` — renders the Attribution Ratio KPI (SRC §K1 rename from "Coverage"); and `components/financial/CompletenessBadge.tsx` — renders `complete | partial | unknown` with appropriate visual weight → labeled KPI and completeness primitives exist.

4. Developer migrates shift-dashboard-v3 surfaces (`left-rail/**`, `center/metrics-table.tsx`, `right-rail/telemetry-rail-panel.tsx`) to `<FinancialValue>` — existing semantic badges are preserved and formalized through the component; unlabeled `secondary-kpi-stack.tsx:74,80` and `metrics-table.tsx:100–103` entries receive labels → shift-dashboard-v3 family fully conformant.

5. Developer migrates named violation surfaces and adjacent surface families:
   - `components/pit-panels/analytics-panel.tsx:169` — `label: 'Handle'` → `'Estimated Drop'`, wrap with `<FinancialValue type="estimated">`
   - `components/pit-panels/closed-sessions-panel.tsx` — currency renders wrapped
   - `components/table/rundown-summary-panel.tsx:205–218,229,242` — fills, credits, drop, win/loss; Pattern B for derived win/loss
   - `components/player-360/summary/summary-band.tsx:136–155` — `theoEstimate` stub renders envelope with `type: 'estimated'`, `completeness.status: 'unknown'`, "Not computed" badge (Q-A7 resolution)
   - `components/player-360/left-rail/filter-tile-stack.tsx:87` — currency wrapped
   - `components/player-sessions/start-from-previous.tsx:213,219,237` — `total_buy_in`, `total_cash_out`, `net` wrapped; Pattern B for `net`
   - `components/cashier/amount-display.tsx` and `cash-out-form.tsx:54` — committed amounts wrapped; pre-commit form input labeled "Draft"
   - `components/rating-slip/buy-in-threshold-indicator.tsx:171,174` — callers pass typed envelope; component reads `.type` + `.source`
   - `app/review/pit-map/components/table-card.tsx` — table session totals wrapped
   - `app/(landing)/floor-oversight/page.tsx` — `"Coverage quality"` → `"Attribution Ratio"`; KPI routes through `<AttributionRatio>`
   → All pit, table, player, cashier, rating-slip, pit-map, and floor-oversight surface families labeled.

6. Developer migrates compliance and monitoring surface families:
   - `components/mtl/gaming-day-summary.tsx:158–163,272,288`, `compliance-dashboard.tsx:132`, `entry-badge.tsx`, `agg-badge.tsx` → `<FinancialValue type="compliance">`; existing MTL badges formalized
   - `components/admin-alerts/alert-detail-card.tsx:104,110` → `<FinancialValue type="observed">`; existing "Observed" label formalized
   - `components/loyalty/comp-confirm-panel.tsx`, `entitlement-confirm-panel.tsx` → `<FinancialValue type="actual">` for comp face value cents; points remain bare
   → MTL, admin-alerts, and loyalty surface families labeled.

7. Developer births DEF-006 component tests:
   - `components/rating-slip-modal/__tests__/rating-slip-modal.test.tsx` — DTO shape from Phase 1.1/1.2B
   - `components/player-sessions/__tests__/start-from-previous.test.tsx` — integer-cents `FinancialValue` shape
   - `components/player-sessions/__tests__/start-from-previous-modal.test.tsx` — same
   → Phase 1.1/1.2B DTO shape changes have component-level test coverage; DEF-006 closed.

8. Developer runs dev server, walks every financial surface — confirms: no unlabeled bare number, no forbidden labels (`Handle`, `Coverage quality`, `Theo: 0`), Pattern A split display applied where rated + unrated appear together, `Compliance` authority never merged with other classes, and the semantic spot-check matrix passes:
   - Actual-only surface → remains `Actual`
   - Mixed `Actual` + `Estimated` surface → degrades to `Estimated`
   - Compliance surface → remains isolated and is never merged with operational authorities
   - Unknown completeness surface → explicitly renders `unknown` / "Not computed" instead of `$0`, blank, or inferred completeness
   → operator-facing visual verification complete; lead-architect manual walkthrough sign-off.

9. Developer validates at least one surface for each authority class (`actual`, `estimated`, `observed`, `compliance`) against source-of-truth data, confirming the rendered label and value are correct, not merely present. This is a sentinel check, not full correctness coverage for every migrated surface → gate prevents the highest-risk class of beautifully labeled misinformation without pretending Phase 1.3 has automated semantic coverage.

10. Developer runs `npm run type-check`, `npm run lint`, `npm run build` — all exit 0 → Phase 1.3 quality gates pass.

---

# F. Required Outcomes

- `<FinancialValue>`, `<AttributionRatio>`, `<CompletenessBadge>` shared components exist as the canonical rendering primitive for all financial values in the PT-2 UI
- `<FinancialValue>` props contract is frozen before rollout and documents allowed authority/completeness combinations for Phase 1.4 lint alignment
- Every currency value rendered in PT-2 carries a visible authority label (`actual | estimated | observed | compliance`) — visible at first glance, not tooltip-only (SRC §L2)
- Forbidden labels removed from production: `"Handle"` → `"Estimated Drop"`, `"Coverage quality"` → `"Attribution Ratio"`, `Theo: 0` placeholder → `status: 'unknown'` envelope with "Not computed" badge
- Pattern A split display applied wherever rated and unrated values appear together (SRC §8); mixed-authority aggregates degrade to lowest authority present (D5 hierarchy: Actual > Observed > Estimated); `Compliance` authority never merged with others
- Semantic spot-check matrix passes during walkthrough: actual-only stays Actual; mixed Actual + Estimated degrades to Estimated; Compliance is never merged; unknown completeness is explicitly rendered
- For each authority class (`actual`, `estimated`, `observed`, `compliance`), at least one migrated surface is explicitly validated against source-of-truth data as a sentinel correctness check, not full semantic coverage
- DEF-006 component tests born and passing for `rating-slip-modal`, `start-from-previous`, `start-from-previous-modal`
- Dev-server walkthrough clean: lead-architect sign-off on every labeled financial surface
- `npm run type-check`, `npm run lint`, `npm run build` all exit 0

---

# G. Explicit Exclusions

**Dead code (excluded — confirmed no UI imports):**
- `components/shift-dashboard/` (legacy) — production route `app/(protected)/shift-dashboard/page.tsx` imports `ShiftDashboardV3` exclusively; zero imports from legacy directory confirmed by grep (2026-05-03). No migration or deprecation action in Phase 1.3.
- `app/review/shift-dashboard-v2/` — dev preview; confirmed dead code per owner (2026-05-03). Excluded from scope.

**Phase 1.4 scope:**
- ESLint `no-unlabeled-financial-value` / `no-forbidden-financial-label` rules, including encoded constraints for authority ambiguity, hidden/unknown completeness, degradation behavior, and no compliance mixing
- Playwright DOM assertions: no currency rendered without visible authority label
- CI gate for envelope regression
- I5 truth-telling harness subset (completeness rendering under `partial`/`unknown` states)
- `lib/format.ts` exported helper removal (`formatDollars`, `formatCents`) — `<FinancialValue>` uses them internally; removing exports requires Phase 1.4 lint guard first
- Structured log events or runtime observability wiring per deprecated-label usage

**Service / API (prior phases — complete):**
- Service layer changes — Phases 1.1, 1.2A, 1.2B
- API contract / OpenAPI changes — Phase 1.2B-C (EXEC-076)

**Hard invariants (all phases):**
- `hold_percent` is never `FinancialValue` — bare ratio, DEF-NEVER
- `average_bet`, policy thresholds (`min_bet`, `max_bet`, `watchlistFloor`, `ctrThreshold`), loyalty points, `current_segment_average_bet` — not wrapped; operator inputs / non-currency / policy config per WAVE-1-CLASSIFICATION-RULES §6

**Out of Presentation scope:**
- Attribution Ratio value computation changes — service-layer concern; `<AttributionRatio>` renders what the service provides
- New financial fact classes or authority values — frozen ADR set governs
- `pit_cash_observation` authoring surfaces — taxonomy only in Wave 1 (ROLLOUT-ROADMAP non-goal)
- SQL migrations — Wave 2

---

# H. Adjacent Ideas Considered and Rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Wire ESLint `no-unlabeled-financial-value` alongside surface migration | Migration and lint enforcement feel like one operation | Lint rule requires stable surface deployment to exist. Authoring the rule while surfaces are mid-migration couples two independently merge-able artifacts and requires coordinated activation timing. Phase 1.4 is the Enforcement class; GOV-FIB-001 §4 requires lint rules to defer after the stable contract exists. |
| Generate Playwright screenshot baseline as part of Phase 1.3 | Manual walkthrough is labor-intensive; automation seems natural | Phase 1.3 exit gate uses dev-server walkthrough + lead-architect sign-off. Playwright baseline generation is Phase 1.4 — the automated harness must run against a stable, fully-migrated surface set, which this FIB produces. Bundling it here conflates Presentation and Enforcement. |
| Remove `lib/format.ts` exported `formatDollars` / `formatCents` helpers | `<FinancialValue>` renders through shared formatters; duplicates can be cleaned up | Removing exports breaks existing call sites not yet migrated through `<FinancialValue>`. The right sequence is: Phase 1.3 migrates all surfaces (internal use only), Phase 1.4 lint rule catches new usages of bare formatters, then the exports can be safely deprecated. Removing them in Phase 1.3 makes Phase 1.3 brittle to the migration order within the phase. |
| Include Attribution Ratio calculation change | Ratio = Rated / (Rated + Estimated) feels like it belongs with the label rename | Computation is service-side. `<AttributionRatio>` renders the ratio value the service already provides. Changing the computation is a Semantics-class change, not Presentation. GOV-FIB-001 §5 cross-class leakage rule. |

---

# I. Dependencies and Assumptions

- Phase 1.2B exit gate ✅ (EXEC-074/075/076, commits ad6d1748 / e73879f4, 2026-05-03): all service output is integer-cents `FinancialValue` envelope; BRIDGE-001 retired; `AnomalyAlertDTO`/`ShiftAlertDTO` promoted to discriminated union; API contract stable in OpenAPI
- `types/financial.ts` — `FinancialValue<T>`, `FinancialAuthority`, `CompletenessStatus` types shipped and tsc-clean (Phase 1.0)
- WAVE-1-SURFACE-INVENTORY.md §5.2 — enumerated surface families; exact file:line references from Phase 1.0 audit (provisional — Phase 1.3 EXEC-SPEC re-verifies during planning)
- WAVE-1-FORBIDDEN-LABELS.md — denylist and replace-with mapping (Phase 1.0, signed off)
- `lib/format.ts` — `formatCents` / `formatDollars` available for `<FinancialValue>` internal use; no changes to exported signature needed

---

# J. Out-of-Scope but Likely Next

- **Phase 1.4** — Validation: ESLint `no-unlabeled-financial-value`, `no-forbidden-financial-label`; Playwright DOM assertion suite; CI gate for envelope regression; I5 truth-telling harness subset. Uses the stable `<FinancialValue>` component API from Phase 1.3 as the reference type.
- **Phase 1.5** — Rollout & sign-off: staged deploy preview → staging → prod; operator UX validation (pit boss walkthrough); release notes citing the five frozen ADRs.

---

# K. Expansion Trigger Rule

Amend this brief if any downstream artifact proposes:
- Service or API layer changes (complete — prior phases)
- Lint rule authoring (Phase 1.4)
- Playwright DOM assertion suite authoring (Phase 1.4)
- Attribution Ratio value computation changes (service-layer concern)
- Wrapping `hold_percent` as `FinancialValue` (DEF-NEVER — hard invariant, all phases)
- Wrapping `average_bet`, policy thresholds, or loyalty points (WAVE-1-CLASSIFICATION-RULES §6 carve-outs)
- Adding new financial authority classes (frozen ADR set governs)
- Expanding surface families beyond those enumerated in WAVE-1-SURFACE-INVENTORY.md §5.2 without amendment

---

# L. Scope Authority Block

**Intake version:** v1

**Frozen for downstream design:** Yes

**Downstream expansion allowed without amendment:** No

**Open questions allowed to remain unresolved at scaffold stage:**
- None. Legacy `components/shift-dashboard/` confirmed dead code (grep 2026-05-03); excluded. `app/review/shift-dashboard-v2/` confirmed dead code per owner; excluded. Both questions resolved in this FIB — no scaffold-stage decisions outstanding.

**Human approval / sign-off:** Vladimir Ivanov / 2026-05-03
