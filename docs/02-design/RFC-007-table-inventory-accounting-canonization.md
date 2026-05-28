---
id: RFC-007
title: "Design Brief: Table Inventory Accounting Canonization"
owner: Architecture
status: Draft
date: 2026-05-27
affects:
  - FIB-H-TIA-CANON-001
  - ADR-053
  - SCAFFOLD-TABLE-INVENTORY-ACCOUNTING-CANON
scope_authority: "FIB-H-TIA-CANON-001 v1 (frozen 2026-05-27)"
classification:
  primary: CLS-002
  qualifier: canonical_derived_model
  selected_transport: read_time_derivation
---

# Design Brief / RFC-007: Table Inventory Accounting Canonization

> Transport chain frozen in Phase 1: CLS-002 `canonical_derived_model`, `read_time_derivation`.
> This RFC proposes the detailed design direction and surfaces ADR-worthy decisions only.
> It does not re-open transport, outbox, persisted projection, final win/loss, or bridge_pending.

---

## 1) Context

PT-2 currently produces table result language (Win/Loss, Drop, Need, inventory movement) from multiple independent formulas across `rpc_compute_table_rundown`, dashboard-local computation, and metric components. These formulas disagree on: which inputs are included, whether drop is telemetry-derived or omitted, and what label is displayed when inputs are missing. The operator sees different values for the same table on the same shift depending on which surface they are looking at. There is no single owner of the formula and no shared data contract.

This split-brain must be resolved before production because every downstream feature will inherit the same semantic fracture. ADR-053 further forbids any PT-2 surface from claiming authoritative financial totals — all table result values must carry a surface envelope that separately declares input completeness and custody/authority status.

The scaffold (Phase 1) locked: read-time derivation, no outbox, no persisted projection at baseline, Pit Terminal Rundown as the first exemplar surface, and `TableInventoryAccountingProjection` as the canonical DTO. This RFC proposes the concrete design within those constraints.

---

## 2) Scope & Goals

**In scope:**
- `TableInventoryAccounting` subdomain of `TableContextService`: new service module `services/table-context/table-inventory-accounting.ts`
- `TableInventoryAccountingProjection` DTO — canonical contract for all downstream table-result consumers
- BFF/API route update to consume the canonical DTO (Pit Terminal Rundown path only)
- Pit Terminal Rundown render update — first exemplar consumer
- P0 concurrent suppression of named legacy surfaces (see Scaffold Section 10)
- Drop taxonomy ADR and canon ownership ADR (Phase 4 outputs)

**Out of scope (FIB-H-TIA-CANON-001 exclusions, not re-openable here):**
- `final_table_win_loss_cents` — requires external custody authority + ADR/FIB amendment
- Persisted projection store — deferred; acceptable only as a follow-on EXEC optimization
- `bridge_pending` / `source_unavailable` / `integrity_issue` drop_estimate_state values — require Finance cross-context DTO contract
- Any surface beyond Pit Terminal Rundown exemplar — requires FIB §K amendment
- `finance_outbox` producers or consumers of any kind
- Posted drop, counted drop, or custody integration

**Success criteria:**
- Deterministic four-fixture test suite passes (all-inputs, drop-absent, opener-null, zero-opener)
- Pit Terminal Rundown renders `projected_table_win_loss_cents` (label: "Projected Win/Loss") or `partial_table_result_cents` (label: "Partial Table Result") from `TableInventoryAccountingProjection` only
- No operator-visible active API response consumed by current rundown/dashboard surfaces exposes a competing win/loss-like value after exemplar acceptance
- All P0 concurrent suppression targets confirmed suppressed at exemplar merge

---

## 3) Proposed Direction

`TableInventoryAccounting` is a pure read-composition module inside `TableContextService`. At request time it reads five owned tables, applies the canonical formula algebraically, and returns a `TableInventoryAccountingProjection` DTO. No write path, no projection writer, no outbox coupling. The BFF route for the Pit Terminal Rundown is updated to call this module instead of any local formula. Legacy competing computations are deleted at the same merge.

The DTO is the system's single authority on table result values. All downstream surfaces — present and future — consume the DTO rather than re-deriving from raw inventory fields.

---

## 4) Detailed Design

### 4.1 Data model changes

No new tables. No semantic schema migration is required at baseline; a performance index migration may be required if the `table_buyin_telemetry` predicate lacks supporting index coverage (see Section 8, open question 1).

Five existing read sources are composed at derivation time; TableContextService owns the read-composition boundary, while `table_buyin_telemetry` row presence for rated buy-ins depends on the Finance bridge/relay path:

| Table | Role | Notes |
|---|---|---|
| `table_inventory_snapshot` | Opener and closer counts | `opening_inventory_cents`, `closing_inventory_cents`; null = absent (integrity failure), 0 = valid explicit count |
| `table_fill` | Chips in from cage | Aggregate `fills_cents` for session |
| `table_credit` | Chips out to cage | Aggregate `credits_cents` for session |
| `table_buyin_telemetry` | Session-scoped drop estimate | `SUM(amount_cents) WHERE telemetry_kind IN ('RATED_BUYIN','GRIND_BUYIN') AND occurred_at >= opened_at AND occurred_at < COALESCE(closed_at, NOW())` |
| `table_session` | Session window | `opened_at`, `closed_at`; provides predicate bounds for telemetry aggregation |

All reads are scoped to `table_id` + current session. Casino-scoped via existing RLS (Pattern C hybrid, ADR-015). No new RLS policies required.

### 4.2 Service layer

**Module:** `services/table-context/table-inventory-accounting.ts` (single file; Over-Engineering Guardrail)

**Subdomain:** `TableInventoryAccounting` within `TableContextService`. The subdomain boundary is declared here and must be confirmed in the canonical ownership ADR (Phase 4).

**Primary export:**

```ts
interface TableInventoryAccountingService {
  deriveProjection(params: {
    tableId: string
    sessionId: string
    casinoId: string
  }): Promise<TableInventoryAccountingProjection>
}
```

**Formula (canonical — frozen):**

```
projected_table_win_loss_cents =
  telemetry_derived_drop_estimate_cents
  + closing_inventory_cents
  + credits_cents
  - opening_inventory_cents
  - fills_cents
```

**Three-result-state derivation logic:**

| State | Trigger | DTO output |
|---|---|---|
| `telemetry_drop_formula` | All five inputs present; `drop_estimate_state = 'present'` | `projected_table_win_loss_cents` set; `partial_table_result_cents = null` |
| `inventory_only` | Drop estimate null; `drop_estimate_state = 'none_for_session'`; opener + closer resolvable | `partial_table_result_cents` set; `projected_table_win_loss_cents = null` |
| Integrity failure | `opening_inventory_cents` or `closing_inventory_cents` is null (not zero) | Both result fields null; `integrity_issues` populated; label suppressed |

Zero opener or closer is a valid explicit count; it never triggers integrity failure.

**`TableInventoryAccountingProjection` DTO shape:**

```ts
interface TableInventoryAccountingProjection {
  // Result fields (at most one is non-null)
  projected_table_win_loss_cents:   number | null
  partial_table_result_cents:        number | null
  final_table_win_loss_cents:        null              // always null in this slice

  // Discriminator
  drop_estimate_state: 'present' | 'none_for_session'

  // Completeness envelope (ADR-053)
  calculation_kind: 'telemetry_drop_formula' | 'inventory_only' | 'integrity_failure'
  completeness: {
    included_inputs: string[]
    missing_inputs:  string[]
    status: 'complete' | 'partial' | 'integrity_failure'
  }
  integrity_issues: string[]   // empty when calculation_kind !== 'integrity_failure'

  // Authority envelope
  custody_status:    'non_custody_estimate'  // always in this slice
  source_authority: {
    drop:      'telemetry_derived_estimate' | 'none'
    inventory: 'table_inventory_snapshot'
  }
}
```

No COALESCE of `telemetry_derived_drop_estimate_cents` to 0 anywhere in the module.

### 4.3 API surface

**Route:** Existing BFF route for Pit Terminal Rundown (e.g. `/api/table-context/rundown` or RPC wrapper).

**Change:** Replace local formula computation with a call to `TableInventoryAccountingService.deriveProjection()`. Return the `TableInventoryAccountingProjection` DTO fields alongside existing non-result rundown fields. No new routes created.

**Response contract:** The BFF returns the DTO fields verbatim. No re-labeling or re-computation at the BFF layer. The UI receives `projected_table_win_loss_cents`, `partial_table_result_cents`, `calculation_kind`, `drop_estimate_state`, `completeness`, `integrity_issues`, `custody_status`.

### 4.4 UI / UX flow

Pit Terminal Rundown render layer:

```
calculation_kind === 'telemetry_drop_formula'
  → render projected_table_win_loss_cents
  → label: "Projected Win/Loss"
  → sub-label: "non-custody estimate"

calculation_kind === 'inventory_only'
  → render partial_table_result_cents
  → label: "Partial Table Result"
  → missing_inputs disclosure (e.g. "Drop estimate not available for this session")

calculation_kind === 'integrity_failure'
  → render no result value
  → disclosure: integrity_issues list
  → label: suppressed entirely (no "Win/Loss" language)
```

`final_table_win_loss_cents` is never rendered. The bare label "Win/Loss" never appears — only "Projected Win/Loss" or "Partial Table Result".

P0 concurrent suppression targets (per Scaffold Section 10) must stop rendering any win/loss-like value. The ADR (Phase 4) chooses the canonical suppression approach; the SEC review (Phase 3) confirms no operator-visible leakage path survives. Neither may relax the invariant: no competing win/loss-like display is operator-visible after exemplar acceptance.

### 4.5 Security considerations

**RLS impact:** None. All five source tables are already `TableContextService`-owned with existing casino-scoped RLS (Pattern C hybrid, ADR-015). No new tables, no new policies.

**RBAC requirements:** No new role checks. The module inherits the BFF route's existing staff authentication and `set_rls_context_from_staff()` context injection (ADR-024).

**SECURITY DEFINER:** Not required. The module is a read-composition service, not an authoring RPC. No new SECURITY DEFINER functions.

**Audit trail:** No write path; no audit trail required at baseline. Read operations are covered by existing session context.

**SEC review requirements (Phase 3):** The SEC note must explicitly confirm:
- No new RLS policies required (existing Pattern C hybrid covers all five source tables)
- No new SECURITY DEFINER function introduced
- BFF route auth inheritance is verified (not assumed) — `set_rls_context_from_staff()` path is exercised by the Pit Terminal Rundown route
- Casino-scope preservation: all reads remain casino-scoped; no cross-casino leakage path introduced by the new module
- No operator-visible leakage through suppressed legacy API fields — suppression targets must be confirmed absent from API responses, not merely removed from DTO type definitions

---

## 5) Cross-Cutting Concerns

**Performance:** Read-time derivation recomputes on every request. At shift scale (O(10) concurrent tables per pit), this is acceptable. A session-scoped telemetry SUM with a date-range predicate on `table_id + occurred_at` requires a composite index — confirm `(table_id, occurred_at)` index exists on `table_buyin_telemetry` or add one. This is the only potential performance risk at baseline. Materialization is deferred to a follow-on EXEC optimization gated on profiling evidence.

**Migration strategy:** No schema migrations required at baseline. Legacy fields (`win_loss_inventory_cents`, `win_loss_estimated_cents`, `estimated_drop_buyins_cents`) are removed from `TableRundownDTO` — this is a breaking DTO change within the same session (not a schema change). Since the application is not in production, backward compatibility is not a goal.

**Observability:** Service module should emit structured logs when `calculation_kind === 'integrity_failure'` so operations can detect sessions with unresolvable opener/closer. No new metrics infrastructure required at baseline.

**Rollback plan:** The service module is additive until the legacy formula is deleted. The P0 suppression and legacy deletion are the irreversible steps; they ship only at exemplar merge (not before).

---

## 6) Alternatives Considered

### Alternative A: Persisted projection store

Materialize `TableInventoryAccountingProjection` to a dedicated table on each inventory authoring event. Reads become fast table scans.

- **Tradeoffs:** Adds a write path for a deterministic formula; introduces projection staleness; requires additional migration and RLS policy (SECURITY DEFINER trigger per ADR-018); adds operational complexity for an exemplar baseline.
- **Why not chosen:** Over-engineering at baseline. The formula is algebraically idempotent from canonical inputs — there is no at-least-once delivery problem to solve. Read-cost profiling has not been performed. Deferred as an explicit EXEC optimization gated on evidence.

### Alternative B: UI-side formula computation

Remove backend formula; Pit Terminal Rundown computes result from raw inventory fields returned by API.

- **Tradeoffs:** Minimal backend change. But every new consumer replicates the formula; competing formulas move to the wrong layer; RULE-7.6 violation (partial state must not be patched by UI recomputation); forbidden by FIB-H §O.10.
- **Why not chosen:** Forecloses canonical ownership. Reproduces the split-brain in the wrong direction.

### Alternative C: Outbox-driven projection consumer (CLS-005)

Emit inventory authoring events to `finance_outbox`; a consumer builds the projection from the event stream.

- **Tradeoffs:** Correct for event-driven derived state but introduces at-least-once delivery infrastructure for a formula that is algebraically idempotent. No ordering problem exists (formula does not depend on event order). Classification YAML explicitly rejected CLS-005.
- **Why not chosen:** CLS-002 read-time derivation is the narrowest valid mechanism. No outbox, no relay, no consumer complexity. CLS-005 rejected in Phase 1 classification and FIB-H §K scope check.

---

## 7) Decisions Required (ADR candidates — Phase 4)

Two ADRs are required before the PRD gate opens. A third is optional but recommended.

### ADR-A: Table Inventory Accounting Canon — Ownership and Formula

**Decision:** Establish `TableInventoryAccounting` as the canonical subdomain owner of table result formula and DTO. Freeze `TableInventoryAccountingProjection` as the sole authority.

**Options:**
- A1: `TableInventoryAccounting` subdomain within `TableContextService` (proposed)
- A2: Standalone `TableAccountingService` with its own bounded context

**Recommendation:** A1 — the module reads only `TableContextService`-owned tables and has no write authority. A standalone service would introduce cross-context reads without adding domain isolation benefits. The Over-Engineering Guardrail and SRM Phase 0 ownership sentence both point to A1.

**ADR-worthy reason:** This decision is hard to reverse once the DTO is in production. Changing the owning subdomain after consumers are wired requires re-routing every consumer.

---

### ADR-B: Drop Taxonomy and Naming Standard

**Decision:** Freeze the canonical vocabulary for "drop" in PT-2: telemetry-derived estimate vs. physical box removal vs. posted count amount. Declare the forbidden labels and required qualifier prefixes.

**Options:**
- B1: `telemetry_derived_drop_estimate_cents` as the only implemented drop vocabulary at baseline; physical/posted drop reserved as named future vocabulary (proposed)
- B2: Generic `drop_cents` with a `drop_type` discriminator

**Recommendation:** B1 — the field name carries its own semantic precision. A generic `drop_cents + drop_type` pattern pushes disambiguation to consumer logic and has historically produced the split-brain we are resolving. Explicit field names are unambiguous at the DTO boundary.

**ADR-worthy reason:** Drop vocabulary ambiguity was the original cause of the split-brain. A naming ADR prevents the fracture from re-emerging in a follow-on slice that re-introduces "drop" as a generic term.

---

### ADR-C (recommended): Session-Scope vs. Gaming-Day Aggregation Boundary

**Decision:** Confirm that `telemetry_derived_drop_estimate_cents` is scoped to the table session window (`opened_at` / `COALESCE(closed_at, NOW())`) and that gaming-day aggregation is explicitly forbidden for this field.

**Options:**
- C1: Session scope (proposed — already frozen in scaffold predicate)
- C2: Gaming-day scope

**Recommendation:** C1 — session scope is already frozen in the scaffold and confirmed against DDL. This ADR documents the freeze and the rationale (gaming-day aggregation would commingle telemetry from multiple sessions and violate the per-session completeness envelope). It closes the audit finding `session_scope_aggregation_boundary` at the ADR layer.

**ADR-worthy reason:** Gaming-day aggregation has historically been confused with session-scope in this codebase. Freezing it in an ADR prevents it from sneaking back via a future EXEC-SPEC or optimization pass. The scaffold predicate alone is not a durable decision record.

---

## 8) Open Questions

1. **`table_buyin_telemetry` index** — Does a composite index on `(table_id, occurred_at)` exist? If not, one must be added before exemplar ships (migration, not an ADR item). Confirm against DDL before EXEC-SPEC.

2. **Subdomain name final form** — FIB §L.1 leaves open whether the subdomain is named `TableInventoryAccounting`, `TableAccounting`, or `TableContext.TableInventoryAccounting`. ADR-A resolves this. The RFC proposes `TableInventoryAccounting` within `TableContextService`.

3. **`completeness.included_inputs` enumeration** — The DTO carries an `included_inputs` string array. The canonical values for each state must be frozen in ADR-A (not EXEC-SPEC — this is DTO contract language, not implementation detail). Proposal for ADR-A: `['opening_inventory', 'closing_inventory', 'fills', 'credits', 'telemetry_drop_estimate']` for `telemetry_drop_formula`; drop `telemetry_drop_estimate` for `inventory_only`. ADR-A must also freeze the corresponding `missing_inputs` literal values.

4. **P0 suppression mechanism** — ADR/SEC Note decides whether suppression is same-merge deletion, route removal, or conditional render. The invariant (no competing display after exemplar acceptance) is non-negotiable; the mechanism is an implementation choice.

---

## Links

- Scope Authority (FIB-H): `docs/issues/table-inventory-accounting-canon/planning/FIB-H-TABLE-INVENTORY-ACCOUNTING-CANONIZATION-v1-exemplar.md`
- Classification YAML: `docs/issues/table-inventory-accounting-canon/planning/FIB-H-TIA-CANON-001-classification.yaml`
- Feature Boundary: `docs/20-architecture/specs/table-inventory-canon/FEATURE_BOUNDARY.md`
- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-TABLE-INVENTORY-ACCOUNTING-CANON.md`
- Exemplar Slice Discipline: `docs/70-governance/EXEMPLAR_SLICE_DISCIPLINE.md`
- ADR-059: `docs/80-adrs/ADR-059-table-inventory-accounting-canon-ownership-and-formula.md`
- ADR-060: `docs/80-adrs/ADR-060-drop-taxonomy-and-naming-standard.md`
- ADR-061: `docs/80-adrs/ADR-061-session-scope-aggregation-boundary.md`
- SEC Note: `docs/30-security/SEC-NOTE-TIA-CANON.md`
- PRD: _(Phase 5 — pending)_

---

## References

- ADR-053: Financial System Scope Boundary (no authoritative totals)
- ADR-052: Financial Fact Model (dual-layer; custody semantics)
- ADR-015: RLS patterns (Pattern C hybrid)
- ADR-018: SECURITY DEFINER governance
- ADR-024: Authoritative context derivation
- `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
