---
id: ADR-059
title: Table Inventory Accounting Canon — Ownership, Formula, and DTO Contract
status: Proposed
date: 2026-05-27
owner: Architecture Review
decision_scope: |
  Canonical subdomain ownership of table result derivation; frozen formula inputs and precedence
  rules; TableInventoryAccountingProjection DTO as the sole authority for all table result consumers;
  completeness.included_inputs enumeration; P0 suppression mechanism for legacy competing fields.
triggered_by: |
  FIB-H-TIA-CANON-001 — split-brain across rpc_compute_table_rundown, dashboard-local computation,
  and metric components producing different table result values for the same table on the same shift.
  RFC-007 Phase 4 ADR-A candidate.
related:
  - ADR-052
  - ADR-053
  - ADR-015
  - ADR-024
  - docs/issues/table-inventory-accounting-canon/planning/FIB-H-TABLE-INVENTORY-ACCOUNTING-CANONIZATION-v1-exemplar.md
  - docs/02-design/RFC-007-table-inventory-accounting-canonization.md
  - docs/30-security/SEC-NOTE-TIA-CANON.md
supersedes: []
---

# ADR-059: Table Inventory Accounting Canon — Ownership, Formula, and DTO Contract

## 1. Context

PT-2 produces table result language (Projected Win/Loss, Partial Table Result, Drop estimate) from
multiple independent formulas across `rpc_compute_table_rundown`, dashboard widgets, and metric
components. These formulas disagree on which inputs are included, whether drop is telemetry-derived
or omitted, and what label is displayed when inputs are missing. An operator sees different values
for the same table on the same shift depending on which surface they use.

ADR-053 forbids PT-2 surfaces from claiming authoritative financial totals. Any table result value
must carry a surface envelope declaring input completeness and custody/authority status. The current
state — multiple formulas, no shared DTO, no declared owner — makes it impossible to enforce that
constraint uniformly.

This ADR resolves the split-brain by designating a single canonical subdomain, freezing the formula,
and declaring `TableInventoryAccountingProjection` as the sole authority for all downstream consumers.

---

## 2. Decision

### 2.1 Subdomain ownership

`TableInventoryAccounting` is a subdomain within `TableContextService`. It is the sole canonical formula and DTO authority for all downstream table-result consumers —
not the source of record for inventory facts, telemetry facts, custody facts, or final accounting
truth. No other service, module, BFF route, or UI component may implement an independent table
result formula.

The subdomain name is `TableInventoryAccounting`; the service module path is
`services/table-context/table-inventory-accounting.ts`.

### 2.2 Canonical formula (frozen)

```
projected_table_win_loss_cents =
  telemetry_derived_drop_estimate_cents
  + closing_inventory_cents
  + credits_cents
  - opening_inventory_cents
  - fills_cents
```

Input sources (all scoped to `table_id` + current session):

| Input | Source table | Notes |
|---|---|---|
| `opening_inventory_cents` | `table_inventory_snapshot` | null = absent (integrity failure); 0 = valid explicit count |
| `closing_inventory_cents` | `table_inventory_snapshot` | null = absent (integrity failure); 0 = valid explicit count |
| `fills_cents` | `table_fill` | Session aggregate |
| `credits_cents` | `table_credit` | Session aggregate |
| `telemetry_derived_drop_estimate_cents` | `table_buyin_telemetry` | Session aggregate; null = none_for_session |

Zero opener or closer is a valid explicit count and never triggers an integrity failure.
`telemetry_derived_drop_estimate_cents` is never COALESCE'd to 0.

The session aggregation window for `table_buyin_telemetry` and the prohibition on gaming-day scope
are frozen in ADR-061; all implementations must conform to the predicate defined there.

### 2.3 Three-result-state derivation rule

| State | Trigger condition | DTO output |
|---|---|---|
| `telemetry_drop_formula` | All five inputs present; `drop_estimate_state = 'present'` | `projected_table_win_loss_cents` non-null; `partial_table_result_cents = null` |
| `inventory_only` | Drop estimate null; opener and closer resolvable; `drop_estimate_state = 'none_for_session'` | `partial_table_result_cents` non-null; `projected_table_win_loss_cents = null` |
| `integrity_failure` | `opening_inventory_cents` or `closing_inventory_cents` is null (not zero) | Both result fields null; `integrity_issues` populated; result label suppressed |

At most one of `projected_table_win_loss_cents` and `partial_table_result_cents` is non-null in any
response. `final_table_win_loss_cents` is always null in this slice and in any implementation
derived solely from TableInventoryAccounting inputs (external custody authority required for
non-null; see FIB-H-TIA-CANON-001 §G).

**`drop_estimate_state` baseline-narrow enum:** The implementation enum at baseline is
`'present' | 'none_for_session'`. Three additional values — `bridge_pending`, `source_unavailable`,
and `integrity_issue` — are named reserved vocabulary (Scaffold §4) but are **not implemented in
this slice**. They require a published Finance cross-context DTO contract before they may be added
(FIB-H-TIA-CANON-001 §G coherence constraint). The PRD for this slice must not introduce these
states.

### 2.4 completeness.included_inputs enumeration (frozen)

| calculation_kind | included_inputs | missing_inputs when partial |
|---|---|---|
| `telemetry_drop_formula` | `['opening_inventory', 'closing_inventory', 'fills', 'credits', 'telemetry_drop_estimate']` | `[]` |
| `inventory_only` | `['opening_inventory', 'closing_inventory', 'fills', 'credits']` | `['telemetry_drop_estimate']` |
| `integrity_failure` | Subset of available inputs at derivation time | At minimum: the null inventory field(s) |

These string literals are DTO contract language. They must appear verbatim in the
`TableInventoryAccountingProjection` completeness envelope and must not be altered without an ADR
amendment.

**Two-axis envelope invariant:** `completeness.status` and `custody_status` are orthogonal axes.
`completeness.status = 'complete'` (all five inputs present) does not upgrade `custody_status`
and does not imply authoritative financial totals. All values produced by this slice carry
`custody_status = 'non_custody_estimate'` regardless of input completeness state.

### 2.5 P0 suppression mechanism

The following targets must be suppressed by **same-merge hard deletion** at the exemplar merge.
Conditional render or feature-flag deferral is not permitted.

**DTO fields — remove from `TableRundownDTO` and all BFF response shaping:**
- `win_loss_inventory_cents`
- `win_loss_estimated_cents`
- `estimated_drop_buyins_cents`

**Components — suppress legacy win/loss display:**
- `components/pit/hero-win-loss-compact.tsx` (or equivalent) — legacy win-loss display
- `components/pit/pit-metrics-table.tsx` — `win_loss_inventory_cents` / `win_loss_estimated_cents` column
- `components/pit/table-metrics-table.tsx` — legacy win-loss column
- `components/dashboard/analytics-panel.tsx` — legacy win-loss aggregate
- `components/dashboard/casino-summary-card.tsx` — legacy win-loss display

**Service/RPC formula ownership — delete or replace with `deriveProjection()` call:**
- Local win formula in `services/table-context/rundown.ts` (or equivalent `rpc_compute_table_rundown` formula ownership)

This list is sourced directly from Scaffold §10 (P0 concurrent suppression targets) and is the
authoritative scope. Additions require a FIB-H-TIA-CANON-001 amendment.

The invariant is absolute: no operator-visible API response served by any active surface exposes a
competing win/loss-like value after exemplar acceptance. Type removal alone does not satisfy this
invariant if the underlying query still projects the field.

---

## 3. Consequences

**Positive:**
- Single formula; single DTO; single owner. Split-brain resolved at the architecture layer.
- All downstream consumers receive a uniform completeness envelope and custody status. ADR-053
  compliance is mechanically enforceable through the DTO type definition.
- `integrity_failure` state makes sensor gaps explicit instead of silently producing incorrect sums.

**Negative / constraints:**
- Any follow-on surface that needs a table result value must consume `TableInventoryAccountingProjection`
  from `TableInventoryAccountingService.deriveProjection()`. Independent formula implementations are
  forbidden by this ADR — not merely discouraged.
- P0 suppression is a breaking DTO change within the session. Since PT-2 is pre-production, backward
  compatibility is not a constraint, but the deletion must be confirmed absent at the API boundary
  (not just at the TypeScript type layer).
- `final_table_win_loss_cents` being always null in this slice means consumers must not display it.
  A future slice that sources authoritative custody totals requires an ADR/FIB amendment before
  `final_table_win_loss_cents` may be non-null.
