---
title: Pre-Phase-2 Surface Debt Initiation Directive
status: proposed
date: 2026-05-06
scope: Financial Telemetry Wave 1 residual surface debt before Wave 2 schema/outbox work
parent: ROLLOUT-ROADMAP.md
related:
  - ADR-052 Financial Fact Model
  - ADR-053 Financial System Scope Boundary
  - ADR-054 Financial Event Propagation and Surface Contract
  - ADR-055 Cross-Class Authoring Parity
  - PRD-074 Phase 1.2B-A Delivery Precis
---

# Pre-Phase-2 Surface Debt Initiation Directive

## 1. Purpose

Phase 1.5 has completed enough of Wave 1 to move the financial telemetry program forward, but it left selected financial surfaces outside full `FinancialValue` envelope assertion coverage.

This directive prevents those cut surfaces from being quietly dragged into Wave 2 as ambiguous debt.

Wave 2 must not begin schema, dual-layer authoring, or outbox implementation until the remaining financial DTO surfaces are either:

1. brought into the canonical surface contract, or
2. explicitly classified as permanent/internal carve-outs with documented UI-labeling guarantees.

The objective is not to expand Wave 1 indefinitely. The objective is to prevent Wave 2 from building structural machinery under surfaces that still lie, drift, or silently imply authority.

---

## 2. Core Problem

Phase 1 hardened the semantic contract unevenly:

| Layer | Current posture |
|---|---|
| Service DTOs | Partially canonicalized around `FinancialValue` and integer cents |
| OpenAPI / route contracts | Representative coverage exists, but long-tail coverage remains incomplete |
| UI surfaces | Some render paths are migrated; some still depend on bare-number financial values |
| Cut surfaces | Explicitly excluded from Phase 1.5 envelope assertions |

This creates a dangerous transitional state:

> the system's spine has moved to canonical financial semantics, but some extremities still speak legacy bare-number currency.

That is tolerable only if it is recorded, bounded, and resolved before Wave 2.

---

## 3. Governing Invariants

This directive inherits the frozen financial decision set.

### 3.1 No false authority

The system does not produce financial truth, settled drop, final shift totals, or reconciliation outputs. Partial aggregates are permitted only when rendered with source, authority, and completeness.

### 3.2 No hidden financial surfaces

Any API response, UI component, export, or report that presents currency must either carry the `FinancialValue` surface contract or be formally classified as a carve-out.

### 3.3 No UI-driven reconciliation

The UI must not recompute financial state to compensate for missing backend semantics. Unknown or partial state is rendered as unknown or partial.

### 3.4 No parity drift

Class A and Class B financial authoring paths must converge on one event discipline. Wave 2 cannot begin while surface semantics remain undecided for legacy DTOs that may consume those future projections.

---

## 4. Surfaces in Scope

### 4.1 Minimum required review

These six fields are mandatory pre-Wave-2 review items:

| Surface | Field | Current concern |
|---|---|---|
| `GET /api/v1/rating-slips/[id]/modal-data` / `RatingSlipModalDTO.financial` | `totalCashIn` | Bare-number cents |
| `GET /api/v1/rating-slips/[id]/modal-data` / `RatingSlipModalDTO.financial` | `totalCashOut` | Bare-number cents |
| `GET /api/v1/rating-slips/[id]/modal-data` / `RatingSlipModalDTO.financial` | `netPosition` | Bare-number cents |
| `GET /api/v1/visits/[visitId]/financial-summary` / `VisitFinancialSummaryDTO` | `total_in` | Bare-number cents |
| `GET /api/v1/visits/[visitId]/financial-summary` / `VisitFinancialSummaryDTO` | `total_out` | Bare-number cents |
| `GET /api/v1/visits/[visitId]/financial-summary` / `VisitFinancialSummaryDTO` | `net_amount` | Bare-number cents |

### 4.2 Recommended full residual review

The full residual review should additionally inspect compliance-adjacent monetary fields:

| Surface | Field | Preliminary classification target |
|---|---|---|
| `MtlEntryDTO` | `amount` | `compliance / mtl_entry / complete` |
| `MtlGamingDaySummaryDTO` | `total_in` | compliance summary; classification required |
| `MtlGamingDaySummaryDTO` | `total_out` | compliance summary; classification required |
| `MtlGamingDaySummaryDTO` | `max_single_in` | compliance summary; classification required |
| `MtlGamingDaySummaryDTO` | `max_single_out` | compliance summary; classification required |
| `MtlGamingDaySummaryDTO` | `total_volume` | compliance summary; classification required |

---

## 5. Explicit Non-Debt

Do not waste cycles wrapping non-currency unit systems.

The following remain bare-number carve-outs unless a future PRD supersedes the classification rules:

- `hold_percent`
- `average_bet`
- operator inputs
- policy/config thresholds
- loyalty points
- ratios, percentages, counts, and other non-currency values

This avoids the familiar nonsense spiral where every number in the codebase becomes a sacrificial goat.

---

## 6. Required Classification Outcomes

Every in-scope field must receive exactly one disposition.

### A — Wrap as `FinancialValue`

Use this when the field is a financial surface value crossing a system boundary.

Required output shape:

```ts
{
  value: number, // integer cents
  type: 'actual' | 'estimated' | 'observed' | 'compliance',
  source: string,
  completeness: {
    status: 'complete' | 'partial' | 'unknown',
    coverage?: number
  }
}
```

### B — Retire or replace

Use this when the endpoint or field should not survive Wave 2.

Required documentation:

- replacement endpoint or consumer path
- deprecation date or phase
- route-boundary test showing legacy behavior remains stable until removal

### C — Internal BFF carve-out

Use this only when the route is demonstrably internal, not a public contract, and the UI layer guarantees visible source/authority/completeness labels.

Required documentation:

- why the BFF contract may remain bare-number cents
- which UI component performs labeling
- test proving the UI renders the required labels
- explicit statement that no external consumer may rely on the bare-number shape

### D — Compliance-parallel classification

Use this for MTL/compliance fields that must not be merged into operational/ledger aggregates.

Required documentation:

- `type: compliance`
- `source: mtl_entry` or more specific compliance source
- completeness semantics
- confirmation that compliance values are rendered separately from operational/ledger aggregates

---

## 7. Recommended Work Sequence

### Step 1 — Inventory confirmation

Confirm the route DTOs, UI consumers, and OpenAPI entries for the minimum six fields.

Deliverable:

```txt
docs/issues/gaps/financial-data-distribution-standard/actions/PRE-WAVE-2-SURFACE-DEBT-INVENTORY.md
```

### Step 2 — Disposition table

Create a compact decision table assigning each field to A/B/C/D.

Deliverable:

```txt
docs/issues/gaps/financial-data-distribution-standard/actions/PRE-WAVE-2-SURFACE-DEBT-DISPOSITIONS.md
```

### Step 3 — PRD slice

Open a bounded PRD, not a broad Wave 2 PRD.

Suggested title:

```txt
PRD-NNN: Financial Telemetry — Pre-Wave-2 Surface Debt Closure
```

Scope must be limited to:

- the minimum six fields
- optional compliance residual review
- OpenAPI / route-boundary alignment only where affected
- UI labeling guarantees only where a BFF carve-out is chosen

### Step 4 — EXEC-SPEC

Generate workstreams by disposition class, not by vague layer names.

Recommended workstreams:

| Workstream | Purpose |
|---|---|
| WS1 — Inventory and classification lock | freeze A/B/C/D field dispositions |
| WS2 — DTO / mapper changes | wrap fields selected for `FinancialValue` |
| WS3 — Route and OpenAPI alignment | enforce transport contract |
| WS4 — UI labeling / BFF carve-out tests | prove carve-outs do not leak false authority |
| WS5 — Tracker closure | update rollout tracker and Wave 2 prerequisites |

### Step 5 — Validation

Minimum validation gates:

- `npm run type-check`
- route-boundary tests for changed endpoints
- OpenAPI shape assertions for wrapped fields
- grep/audit proving no selected field remains bare-number unless classified as carve-out
- UI assertion for any BFF carve-out proving labels are visible

---

## 8. Rules of Engagement

### 8.1 Do not bury this in Wave 2

This is a pre-Wave-2 closure slice. It must complete before schema and outbox implementation begin.

### 8.2 Do not expand into general UI cleanup

Only financial semantic surfaces are in scope.

### 8.3 Do not change units silently

All `FinancialValue.value` fields are integer cents. Any bare-number field that remains bare must state its unit explicitly.

### 8.4 Do not wrap non-currency values

Ratios, counts, thresholds, loyalty points, and percentages are not `FinancialValue`.

### 8.5 Do not invent reconciliation

No “drop,” “final,” “settled,” or “actual total” language may be introduced while closing these surfaces.

---

## 9. Definition of Done

This directive is satisfied when:

1. every minimum-review field has a recorded A/B/C/D disposition;
2. every A field is wrapped as `FinancialValue` with integer cents;
3. every B field has a retirement/replacement path;
4. every C field has a UI-labeling proof and internal-only justification;
5. every D field is rendered as compliance-parallel and not merged with ledger/operational values;
6. OpenAPI and route-boundary tests match the chosen dispositions;
7. the rollout tracker records the closure;
8. Wave 2 roadmap explicitly cites this closure before schema/outbox work begins.

---

## 10. Recommended Strategic Decision

For the minimum six fields, the default recommendation is:

| Surface | Recommended disposition |
|---|---|
| `RatingSlipModalDTO.financial.totalCashIn` | A — Wrap as `FinancialValue` unless modal route is formally classified internal BFF |
| `RatingSlipModalDTO.financial.totalCashOut` | A — Wrap as `FinancialValue` unless modal route is formally classified internal BFF |
| `RatingSlipModalDTO.financial.netPosition` | A — Wrap as `FinancialValue` unless modal route is formally classified internal BFF |
| `VisitFinancialSummaryDTO.total_in` | A — Wrap as `FinancialValue` |
| `VisitFinancialSummaryDTO.total_out` | A — Wrap as `FinancialValue` |
| `VisitFinancialSummaryDTO.net_amount` | A — Wrap as `FinancialValue` |

The modal route may plausibly earn a BFF carve-out if it is strictly internal and the UI renders labels correctly. The visit financial summary should not get that indulgence unless there is a strong reason; it smells like a public-ish summary contract, and bare-number money there is exactly how semantic rot crawls back under the door.

---

## 11. Closing Directive

Do not start Wave 2 by laying outbox rails under ambiguous surfaces.

First close the remaining semantic holes.

Wave 2 changes the structure. This slice makes sure the remaining surfaces are honest enough to survive that structural change.
