---
id: PRD-080
title: "Financial Telemetry — Pre-Wave-2 Surface Debt Closure"
owner: Lead Architect
status: Draft
affects:
  - ADR-052 (Financial Fact Model)
  - ADR-053 (Financial System Scope Boundary)
  - ADR-054 (Financial Event Propagation & Surface Contract)
  - ADR-055 (Cross-Class Authoring Parity)
  - PRD-070 (Wave 1 Phase 1.1 — Service DTO Envelope)
  - PRD-074 (Wave 1 Phase 1.2B — Canonicalization)
  - PRD-079 (Wave 1 Phase 1.5 — Rollout & Sign-off)
created: 2026-05-06
last_review: 2026-05-06
phase: Pre-Wave-2 Prerequisite Slice
http_boundary: true
---

# PRD-080 — Financial Telemetry: Pre-Wave-2 Surface Debt Closure

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Parent planning doc:** `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md` §3 (Phase 1.5 "Recommended Pre-Wave-2 Surface-Debt Review")
- **Initiation directive:** `docs/issues/gaps/financial-data-distribution-standard/wave-2/pre-phase-2-surface-debt-initiation-directive.md`
- **Field inventory:** `docs/issues/gaps/financial-data-distribution-standard/actions/PRE-WAVE-2-SURFACE-DEBT-INVENTORY.md`
- **Field dispositions:** `docs/issues/gaps/financial-data-distribution-standard/actions/PRE-WAVE-2-SURFACE-DEBT-DISPOSITIONS.md`

Wave 1 closed with 12 financial DTO fields excluded from full `FinancialValue` envelope assertion coverage. These are the Phase 1.5 "cut surfaces." They are not bugs — they are a deliberate pre-production deferral. They become a blocking prerequisite before Wave 2 schema and outbox implementation begins.

This PRD delivers closure of all 12 fields: 6 Class A (Ledger) bare-number fields wrapped as canonical `FinancialValue`, and 6 compliance-class fields wrapped with compliance-parallel `FinancialValue`. No field exits this PRD as an unclassified bare-number currency value.

Scope is exactly the 12 fields enumerated below. No opportunistic cleanup. No Wave 2 schema work. No new tables or migrations.

---

## 2. Problem & Goals

### Problem

Phase 1.5 merged with two routes explicitly excluded from `FinancialValue` envelope assertions:

- `GET /api/v1/rating-slips/[id]/modal-data` — `FinancialSectionDTO.{totalCashIn, totalCashOut, netPosition}` are bare-number cents
- `GET /api/v1/visits/[visitId]/financial-summary` — `VisitFinancialSummaryDTO.{total_in, total_out, net_amount}` are bare-number cents

Six additional MTL compliance fields (`MtlEntryDTO.amount`, five `MtlGamingDaySummaryDTO` aggregates) were deferred from Phase 1.1 and remain bare-number cents.

This creates a dangerous transitional state: the system's spine has moved to canonical financial semantics, but these extremities still speak legacy bare-number currency. Wave 2 must not lay outbox rails under surfaces that still lie, drift, or silently imply authority. The directive prohibits starting Wave 2 until these holes are closed.

### Core Invariant — Boundary Truthfulness

No financial value may cross a service or HTTP boundary without an explicit declaration of:

- authority (`type`)
- origin (`source`)
- completeness (`completeness.status`)

Exceptions: none within the scope of this PRD.

Any DTO or route response violating this invariant is non-conformant.

### Goals

1. Wrap `VisitFinancialSummaryDTO.total_in/total_out/net_amount` as `FinancialValue` with `actual / "PFT"` authority and visit-lifecycle-aware completeness.
2. Wrap `FinancialSectionDTO.totalCashIn/totalCashOut/netPosition` as `FinancialValue` pass-through from the above, with contextual completeness set by the modal BFF.
3. Wrap `MtlEntryDTO.amount` as `FinancialValue` with `compliance / "mtl_entry" / complete` classification.
4. Wrap `MtlGamingDaySummaryDTO.total_in/total_out/max_single_in/max_single_out/total_volume` as `FinancialValue` with `compliance / "mtl_entry"` and gaming-day-lifecycle completeness.
5. Update all named bare-number consumer callsites for the 12 fields; confirm no surface presents authority-bearing currency without envelope.
6. Align OpenAPI entries for the two affected routes to the wrapped shapes.
7. Update the rollout tracker to record closure and unblock Wave 2 entry.

### Non-Goals

- No schema changes, no new tables, no migrations.
- No Wave 2 outbox, dual-layer authoring, or projection work.
- No opportunistic cleanup of adjacent non-currency fields.
- No wrapping of operator-input DTOs (`CreateMtlEntryInput.amount`, `CreateFinancialTxnInput.amount`) — §6.1 carve-outs.
- No wrapping of filter thresholds, counts, ratios, loyalty points, or `hold_percent`.
- No changes to `FinancialTransactionDTO.amount` — that is a separate deferral tracked in the deferred register; it is not in scope here.
- No resolution of Wave 2 open questions Q1–Q4.

---

## 3. Users & Use Cases

### Primary users

**Engineering lead / lead architect**
- Needs Wave 2 entry criteria formally met so schema and outbox work can begin without semantic debt underneath.

**Pit bosses / floor supervisors** (indirect — via UI changes)
- Need the rating slip modal to surface authority and completeness on buy-in/cashout totals. A pit boss deciding whether to add a buy-in deserves to know if the shown total is current (complete) or may have outstanding transactions (partial/unknown).

**Compliance officers** (indirect — via MTL UI changes)
- Need MTL transaction amounts and gaming-day aggregates labeled as compliance-class, never implied to be reconcilable with operational ledger values.

### Use cases

**UC-1:** Pit boss opens the rating slip modal mid-session. The financial section now shows buy-in and cashout totals with authority label (`Actual`) and completeness (`Partial` — visit open). The pit boss knows the total may still grow.

**UC-2:** After a visit closes, the financial summary route returns `completeness.status: 'complete'` on all three currency fields. Downstream consumers (player360 mappers, hooks) can render without an uncertainty badge.

**UC-3:** Compliance officer reviews an MTL patron summary. Gaming-day aggregate fields are labeled `compliance / mtl_entry` and rendered in a separate compliance section — never combined with ledger buy-in totals.

**UC-4:** An OpenAPI consumer (external or internal) calling `GET /api/v1/visits/[visitId]/financial-summary` receives a response with `FinancialValue` shape on all three currency fields. The contract is explicit, not implicit.

---

## 4. Scope & Feature List

The following are all in scope. Nothing outside this list is in scope.

**Group A — `VisitFinancialSummaryDTO` (3 fields)**

- [ ] `VisitFinancialSummaryDTO.total_in` wrapped as `FinancialValue`: `type: 'actual'`, `source: "PFT"`, completeness per visit lifecycle.
- [ ] `VisitFinancialSummaryDTO.total_out` wrapped as `FinancialValue`: same classification.
- [ ] `VisitFinancialSummaryDTO.net_amount` wrapped as `FinancialValue`: same classification.
- [ ] `toVisitFinancialSummaryDTO` mapper updated. Default completeness: `'unknown'`. Routes with visit-status context may override.
- [ ] `financialValueSchema` applied at the service-layer outbound boundary on these fields.
- [ ] All named consumers of the three fields updated (inventory: 5 callsites for `total_in`, 4 for `total_out`, 2 for `net_amount`).

**Group B — `FinancialSectionDTO` / modal-data route (3 fields)**

- [ ] `FinancialSectionDTO.totalCashIn/totalCashOut/netPosition` types changed to `FinancialValue`.
- [ ] `modal-data/route.ts` pass-through updated: fields from `VisitFinancialSummaryDTO` pass through as-is; route sets `completeness.status` contextually using slip/visit lifecycle knowledge.
- [ ] `rating-slip-modal.tsx` and `form-section-cash-in.tsx` updated: `/100` removed, `formatCents(field.value)` used, authority label rendered.
- [ ] Local arithmetic (`computedChipsOut`, `computedNetPosition`) remains bare-number — these are UI-local derived values, not emitted financial facts.
- [ ] `financialValueSchema` applied at modal-data route boundary.

> **Modal Route Constraint — Projection Only**
>
> The `modal-data` route is a projection layer.
>
> It MAY:
> - pass through `value`, `type`, and `source` unchanged
> - override `completeness.status` using visit/slip lifecycle context
>
> It MUST NOT:
> - modify `value`
> - modify `type` or `source`
> - recompute or reinterpret financial authority
>
> All arithmetic performed in the modal (e.g. `computedChipsOut`, `computedNetPosition`) remains UI-local and MUST NOT be emitted as `FinancialValue`.

**Group C — `MtlEntryDTO.amount` (1 field)**

- [ ] `MtlEntryDTO.amount` type changed to `FinancialValue`: `type: 'compliance'`, `source: "mtl_entry"`, `completeness.status: 'complete'` per row.
- [ ] MTL service mapper updated.
- [ ] All 13 named consumer callsites (6 files) updated to read `.amount.value` and render with compliance label.
- [ ] `financialValueSchema` applied at service-layer outbound boundary.
- [ ] Compliance isolation confirmed: no component merges `MtlEntryDTO.amount` with PFT or grind values in a single aggregate.

**Group D — `MtlGamingDaySummaryDTO` aggregate fields (5 fields)**

- [ ] `total_in`, `total_out`, `max_single_in`, `max_single_out`, `total_volume` types changed to `FinancialValue` (or `FinancialValue | null` for `max_single_in/out`).
- [ ] Classification: `type: 'compliance'`, `source: "mtl_entry"`, completeness follows gaming-day lifecycle (open → `'partial'`, closed → `'complete'`, boundary ambiguous → `'unknown'`).
- [ ] MTL gaming-day-summary service mapper updated.
- [ ] All named consumer callsites updated (inventory: `gaming-day-summary.tsx:272,288`, `compliance-dashboard.tsx:132`, `use-patron-daily-total.ts:125,126`).
- [ ] `max_single_in` and `max_single_out` are `FinancialValue | null` to preserve nullable semantics.
- [ ] `financialValueSchema` applied at service-layer outbound boundary for non-null values.

**Group E — Enforcement and transport**

- [ ] OpenAPI `GET /api/v1/visits/[visitId]/financial-summary` path entry updated: `total_in`, `total_out`, `net_amount` reference `$ref: '#/components/schemas/FinancialValue'`.
- [ ] OpenAPI `GET /api/v1/rating-slips/[id]/modal-data` path entry updated: `financial.totalCashIn/totalCashOut/netPosition` reference `$ref: '#/components/schemas/FinancialValue'`.
- [ ] Route-boundary tests updated for both routes: shape assertions include `value`, `type`, `source`, `completeness.status`.
- [ ] Rollout tracker (`ROLLOUT-TRACKER.json`) updated: pre-Wave-2 surface debt status closed, Wave 2 entry cursor updated.

> **OpenAPI Constraint — No Parallel Legacy Fields**
>
> For all updated routes:
> - No legacy bare-number currency fields may coexist with `FinancialValue` fields representing the same value.
> - Each financial field must have a single canonical representation.
>
> Any duplicate representation (e.g. `total_in` and `totalIn` as separate fields) is non-conformant.

---

## 5. Requirements

### Functional

**F-1 — No bare-number currency at any boundary in scope.** Every field listed in §4 Groups A–D must be `FinancialValue` at the service-layer outbound boundary and at the HTTP wire. Bare `number` for any of these 12 fields at any boundary is a DoD failure.

**F-2 — Classification correctness.** `type` and `source` values must match the field's fact class:
- Class A (PFT aggregates): `type: 'actual'`, `source: "PFT"`
- Compliance class (MTL): `type: 'compliance'`, `source: "mtl_entry"`

**F-3 — Completeness is never silently omitted.** Every `FinancialValue` emission must include `completeness.status`. The three valid values are `'complete'`, `'partial'`, `'unknown'`. Silence is not valid.

**F-4 — Visit-lifecycle completeness rule.** `VisitFinancialSummaryDTO` and `FinancialSectionDTO` fields emit `'unknown'` when visit lifecycle is not available at the emission point. The modal-data BFF, which has slip context, must set completeness based on slip/visit status. The standalone `/financial-summary` route emits `'unknown'` — this is correct.

**F-5 — Gaming-day completeness rule.** `MtlGamingDaySummaryDTO` fields emit `'partial'` while the gaming day is open, `'complete'` when closed, `'unknown'` at ambiguous boundary. The MTL service mapper must receive gaming-day status or default to `'unknown'`.

**F-6 — Compliance isolation.** No component, hook, or route may aggregate `type: 'compliance'` values with `type: 'actual'` or `type: 'estimated'` values in a single financial total. This is an invariant across all phases. After wrapping, type-level enforcement must replace convention-level enforcement.

**F-7 — Local UI arithmetic remains bare-number.** The modal's `computedChipsOut` and `computedNetPosition` are derived from UI-local inputs. They are not `FinancialValue`. They remain bare `number` and are not emitted to any API or DTO.

**F-8 — No opportunistic consumer changes.** Only the named consumers in the inventory are in scope. If a grep during implementation discovers additional consumers, add them to a delta list and bring it to lead-architect before expanding scope.

**F-9 — Completeness source of truth.** Completeness for visit-based aggregates MUST derive from `visit.status` only.

Rules:
- `OPEN` → `'partial'`
- `CLOSED` → `'complete'`
- lifecycle unavailable → `'unknown'`

No inference from transaction counts, timestamps, or derived arithmetic. All completeness decisions must be traceable to lifecycle state, not inferred heuristics.

**F-10 — Cross-context consumer discipline.** All consumers reading wrapped financial fields MUST:

- explicitly unwrap via `.value` before arithmetic
- never pass `FinancialValue` objects into arithmetic operations
- never rely on implicit coercion

Violation of this rule is a correctness bug, even if TypeScript permits compilation.

**F-11 — Compliance isolation enforcement.** `type: 'compliance'` values MUST NOT be aggregated with `type: 'actual'` or `type: 'estimated'` values.

Minimum enforcement requirement: at least one integration or unit test asserting that compliance values are rendered separately from operational/ledger aggregates. This replaces convention-based separation with test-enforced isolation.

### Non-Functional

**NF-1 — Type check.** `npm run type-check` must exit 0 after all changes.

**NF-2 — Lint.** `npm run lint` must exit 0 including financial-enforcement rules.

**NF-3 — Build.** `npm run build` must exit 0.

**NF-4 — No `as any`.** No TypeScript escape hatches in any of the 12 field change paths.

**NF-5 — INV-ERR-DETAILS.** Any error handling in modified service methods must use `safeErrorDetails(error)`, not raw Error objects.

**NF-6 — UI rendering pattern.** All wrapped financial values MUST be rendered using the shared formatting pattern:

- `formatCents(field.value)` for value display
- visible authority label (`type`)
- visible completeness indicator (`completeness.status`)

Ad-hoc formatting (`toFixed`, manual `/100`, inline math formatting) is forbidden for wrapped values at any named consumer callsite.

---

## 6. UX / Flow Overview

Changes are primarily service and API layer. UI impact is limited to the named consumer callsites.

**Rating slip modal — after wrap:**
1. Pit boss opens modal. `GET /modal-data` returns `financial.totalCashIn.value`, `financial.totalCashIn.type === 'actual'`, `completeness.status === 'partial'` (visit open) or `'complete'` (visit closed).
2. Modal renders total using `formatCents(totalCashIn.value)`, adds a compact authority badge.
3. Form section renders the same value via `formatCents`, not `toFixed(2)`.
4. The pending chips arithmetic (`computedChipsOut`) continues to use local bare-number arithmetic — it does not need a `FinancialValue` wrapper.

**Player financial summary — after wrap:**
1. Any consumer calls `GET /api/v1/visits/[visitId]/financial-summary`.
2. Response contains `{ total_in: { value, type, source, completeness }, ... }`.
3. Completeness is `'unknown'` from the standalone route (visit status not resolved at service layer).
4. Player360 mapper and MTL hooks read `.total_in.value` for arithmetic, not `.total_in` directly.

**MTL entry list / detail — after wrap:**
1. MTL entry list renders `amount.value` via `formatCents`, displays `type === 'compliance'` label.
2. Compliance isolation: MTL monetary values are displayed in the compliance section, not alongside PFT buy-in totals.

**MTL gaming day summary — after wrap:**
1. Summary renders `total_in.value`, `total_out.value` via `formatCents`, `completeness.status` badge.
2. Gaming-day badge logic (`agg_badge_in`, `agg_badge_out`) is unaffected — these are enum fields, not currency.

---

## 7. Dependencies & Risks

### Prerequisites

| Prerequisite | Status |
|---|---|
| Wave 1 Phase 1.5 sign-off | Complete (2026-05-06, commit `f29e32ef`) |
| `PRE-WAVE-2-SURFACE-DEBT-INVENTORY.md` | Complete (2026-05-06) |
| `PRE-WAVE-2-SURFACE-DEBT-DISPOSITIONS.md` | Complete (2026-05-06) |
| `types/financial.ts` — `FinancialValue` canonical type | Complete (Phase 1.0) |
| `financialValueSchema` in `services/*/schemas.ts` | Complete (Phases 1.1–1.2B) |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MTL consumer blast radius (13+ callsites) causes unexpected compile errors | Medium | Low–Medium | Enumerate all callsites before starting WS4; compile-check after each file |
| Visit lifecycle unavailable in `toVisitFinancialSummaryDTO` mapper causes completeness to be always `'unknown'` | Certain | Low | Intentional: `'unknown'` is the correct honest default. Modal-data BFF overrides. Tracker records as Wave 2 refinement. |
| Player360 dashboard mappers use arithmetic on `.total_in` / `.net_amount` — these become object references after wrap | Medium | Medium | Inventory already identifies `services/player360-dashboard/mappers.ts`. Update to use `.total_in.value`. |
| MTL hooks (`use-patron-daily-total.ts`) cross-context consume `VisitFinancialSummaryDTO.total_in` — this is a cross-bounded-context read | Low | Low | The hook reads `.total_in` for arithmetic. After wrap it reads `.total_in.value`. No design change required — boundary is already crossed. Note for Wave 2 SRM review. |
| Scope creep into FinancialTransactionDTO.amount | Medium | Medium | That field is a separate deferral with different consumer blast radius (cashier domain). Explicitly out of scope. Block if proposed. |

### Open Questions

**OQ-1 — Gaming-day status for `MtlGamingDaySummaryDTO` completeness:** Does the MTL gaming-day-summary service mapper receive gaming-day close status from the `mtl_gaming_day_summary` view, or must it default to `'unknown'`? EXEC-SPEC must resolve this before implementing WS5. Resolution path: inspect view definition; if gaming-day status is not in view, default to `'unknown'`.

**OQ-2 — `max_single_in / max_single_out` null semantics:** These are `number | null` today. After wrap they become `FinancialValue | null`. A `null` means no transactions of that direction exist on the gaming day. This is not a completeness concern — `null` means "not applicable." Confirm no consumer treats `null` as `'unknown'` completeness; null and unknown are distinct states.

### Wave 2 Dependency — Completeness Refinement

The use of `completeness.status = 'unknown'` for visit-based aggregates (standalone `/financial-summary` route) is a deliberate temporary constraint, not a permanent state.

Wave 2 MUST introduce lifecycle-aware projections such that standalone routes can emit `'partial'` vs `'complete'` without requiring BFF override. This is a tracked Wave 2 prerequisite.

Action: add to `WAVE-2-PREP-DECISIONS.md` (ROLLOUT-ROADMAP.md §6) at PRD-080 closure.

---

## 8. Definition of Done

The release is **Done** when all of the following are true:

**Field closure (12 fields)**
- [ ] `VisitFinancialSummaryDTO.total_in` is `FinancialValue` at service-layer boundary — `type: 'actual'`, `source: "PFT"`, completeness present.
- [ ] `VisitFinancialSummaryDTO.total_out` — same.
- [ ] `VisitFinancialSummaryDTO.net_amount` — same.
- [ ] `FinancialSectionDTO.totalCashIn` is `FinancialValue` — passes through from above; modal-data BFF sets completeness contextually.
- [ ] `FinancialSectionDTO.totalCashOut` — same.
- [ ] `FinancialSectionDTO.netPosition` — same.
- [ ] `MtlEntryDTO.amount` is `FinancialValue` — `type: 'compliance'`, `source: "mtl_entry"`, `completeness.status: 'complete'`.
- [ ] `MtlGamingDaySummaryDTO.total_in` is `FinancialValue` — `type: 'compliance'`, `source: "mtl_entry"`, completeness per gaming-day lifecycle.
- [ ] `MtlGamingDaySummaryDTO.total_out` — same.
- [ ] `MtlGamingDaySummaryDTO.max_single_in` is `FinancialValue | null`.
- [ ] `MtlGamingDaySummaryDTO.max_single_out` is `FinancialValue | null`.
- [ ] `MtlGamingDaySummaryDTO.total_volume` is `FinancialValue`.

**Consumer updates**
- [ ] All inventory-named bare-number consumer callsites for the 12 fields are updated. No callsite reads a wrapped field as a bare `number`.
- [ ] Rating slip modal renders `type` and `completeness.status` labels on financial totals. No bare `$X.XX` without authority context.
- [ ] MTL UI renders `type: 'compliance'` label on monetary values. No MTL monetary value appears in the same aggregate display as PFT values.

**Transport and enforcement**
- [ ] `financialValueSchema` (`z.number().int()`) enforced at outbound boundary for all 12 fields.
- [ ] OpenAPI `GET /api/v1/visits/[visitId]/financial-summary` path entry reflects `FinancialValue` shape on the three currency fields.
- [ ] OpenAPI `GET /api/v1/rating-slips/[id]/modal-data` path entry reflects `FinancialValue` shape on `financial.totalCashIn/totalCashOut/netPosition`.
- [ ] Route-boundary tests for both routes assert `FinancialValue` shape (value, type, source, completeness.status present).
- [ ] At least one integration or unit test asserts that compliance (`type: 'compliance'`) values are not co-aggregated with `type: 'actual'` values (F-11 enforcement).
- [ ] No FinancialValue is logged, serialized, or stored with missing fields (`type`, `source`, or `completeness.status`) at any boundary, including debug logs and error payloads.

**Build gates**
- [ ] `npm run type-check` exit 0.
- [ ] `npm run lint` exit 0 (financial-enforcement rules pass).
- [ ] `npm run build` exit 0.
- [ ] No `as any` in any modified file.

**Tracker and Wave 2 gate**
- [ ] `ROLLOUT-TRACKER.json` updated: pre-Wave-2 surface debt fields marked closed.
- [ ] `cursor.next_action` updated to Wave 2 entry criteria check.
- [ ] Wave 2 roadmap (`WAVE-2-ROADMAP.md`) may now be drafted — this PRD's closure is a prerequisite.

---

## 9. Related Documents

| Doc | Relationship |
|---|---|
| `docs/issues/gaps/financial-data-distribution-standard/actions/PRE-WAVE-2-SURFACE-DEBT-INVENTORY.md` | Field inventory — consumed by this PRD as authoritative field list and consumer callsite reference |
| `docs/issues/gaps/financial-data-distribution-standard/actions/PRE-WAVE-2-SURFACE-DEBT-DISPOSITIONS.md` | Binding A/B/C/D dispositions — this PRD implements the A and D decisions |
| `docs/issues/gaps/financial-data-distribution-standard/wave-2/pre-phase-2-surface-debt-initiation-directive.md` | Governing directive — defines the mandatory scope and Definition of Done for this slice |
| `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-ROADMAP.md` | Parent planning doc — §3 Phase 1.5 cut-surfaces table, §2.5 execution protocol |
| `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json` | Current rollout state — must be updated at PRD-080 closure |
| `docs/issues/gaps/financial-data-distribution-standard/decisions/ADR-FINANCIAL-FACT-MODEL.md` | Frozen decision — two fact classes, table-first anchoring |
| `docs/issues/gaps/financial-data-distribution-standard/decisions/ADR-FINANCIAL-SYSTEM-SCOPE.md` | Frozen decision — no authoritative totals, no reconciliation |
| `docs/issues/gaps/financial-data-distribution-standard/decisions/ADR-FINANCIAL-EVENT-PROPAGATION.md` | Frozen decision — surface rendering contract, completeness semantics |
| `docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md` | SRC — mandatory `FinancialValue` envelope, completeness rules |
| `docs/issues/gaps/financial-data-distribution-standard/decisions/TRANSITIONAL-GOVERNANCE-CAVEAT.md` | No active bridges after Phase 1.2B — BRIDGE-001 retired |
| `types/financial.ts` | Canonical `FinancialValue` type |
| `docs/25-api-data/api-surface.openapi.yaml` | OpenAPI spec — `FinancialValue` component at line 2181 |

---

## Appendix A: Disposition Summary

| Field | Disposition | type | source | completeness |
|---|---|---|---|---|
| `VisitFinancialSummaryDTO.total_in` | A | `actual` | `"PFT"` | visit lifecycle |
| `VisitFinancialSummaryDTO.total_out` | A | `actual` | `"PFT"` | visit lifecycle |
| `VisitFinancialSummaryDTO.net_amount` | A | `actual` | `"PFT"` | visit lifecycle |
| `FinancialSectionDTO.totalCashIn` | A | `actual` | `"PFT"` | modal BFF sets contextually |
| `FinancialSectionDTO.totalCashOut` | A | `actual` | `"PFT"` | modal BFF sets contextually |
| `FinancialSectionDTO.netPosition` | A | `actual` | `"PFT"` | modal BFF sets contextually |
| `MtlEntryDTO.amount` | D | `compliance` | `"mtl_entry"` | `'complete'` per row |
| `MtlGamingDaySummaryDTO.total_in` | D | `compliance` | `"mtl_entry"` | gaming-day lifecycle |
| `MtlGamingDaySummaryDTO.total_out` | D | `compliance` | `"mtl_entry"` | gaming-day lifecycle |
| `MtlGamingDaySummaryDTO.max_single_in` | D | `compliance` | `"mtl_entry"` | gaming-day lifecycle (or null) |
| `MtlGamingDaySummaryDTO.max_single_out` | D | `compliance` | `"mtl_entry"` | gaming-day lifecycle (or null) |
| `MtlGamingDaySummaryDTO.total_volume` | D | `compliance` | `"mtl_entry"` | gaming-day lifecycle |

---

## Appendix B: Implementation Workstreams (for EXEC-SPEC scaffolding)

Intended as input to `/lead-architect` EXEC-SPEC scaffolding, not as prescriptive implementation detail.

| WS | Label | Primary skill | Key changes |
|---|---|---|---|
| WS1 | Inventory and classification lock | `lead-architect` | Confirm consumer counts match inventory; lock dispositions; no code |
| WS2 | `VisitFinancialSummaryDTO` wrap | `backend-service-builder` | `player-financial/dtos.ts`, mapper, schema; update 11 named consumer callsites (player360 mappers, MTL hooks, player timeline) |
| WS3 | `FinancialSectionDTO` pass-through + modal UI | `backend-service-builder` + `frontend-design-pt-2` | `rating-slip-modal/dtos.ts`, modal-data route handler, `rating-slip-modal.tsx`, `form-section-cash-in.tsx` |
| WS4 | `MtlEntryDTO.amount` wrap | `backend-service-builder` | `mtl/dtos.ts`, MTL mapper, schema; update 13 named consumer callsites across 6 files |
| WS5 | `MtlGamingDaySummaryDTO` wrap | `backend-service-builder` | `mtl/dtos.ts` (5 fields), MTL gaming-day mapper; update named consumers in gaming-day-summary.tsx, compliance-dashboard.tsx, use-patron-daily-total.ts |
| WS6 | OpenAPI + route-boundary test alignment | `api-builder` | `api-surface.openapi.yaml` path entries for `/financial-summary` and `/modal-data`; route-boundary test shape assertions |
| WS7 | Rollout tracker closure | `lead-architect` | `ROLLOUT-TRACKER.json` pre-Wave-2 surface debt closed; cursor updated |

WS sequencing: WS2 before WS3 (FinancialSectionDTO depends on VisitFinancialSummaryDTO wrap). WS4 and WS5 are independent of WS2/WS3 and may run in parallel. WS6 follows WS2+WS3 (OpenAPI shape reflects wrapped types). WS7 is terminal.

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| v0 | 2026-05-06 | financial-model-authority | Initial draft from inventory + dispositions |
| v1 | 2026-05-06 | financial-model-authority | Patch delta applied: Core Invariant (§2); Modal Projection Constraint (§4B); F-9 completeness source; F-10 cross-context discipline; F-11 compliance isolation enforcement; OpenAPI no-parallel-fields constraint (§4E); NF-6 UI rendering pattern; Wave 2 completeness refinement dependency (§7) |
