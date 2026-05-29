---
id: SCAFFOLD-TABLE-INVENTORY-ACCOUNTING-CANON
title: "Feature Scaffold: Table Inventory Accounting Canonization"
owner: Architecture / Product
status: Draft
date: 2026-05-27
scope_authority: "FIB-H FIB-H-TIA-CANON-001 v1 (frozen 2026-05-27)"
fib_h: docs/issues/table-inventory-accounting-canon/planning/FIB-H-TABLE-INVENTORY-ACCOUNTING-CANONIZATION-v1-exemplar.md
classification:
  primary: CLS-002
  qualifier: canonical_derived_model
  secondary:
    - CLS-006
  selected_transport: read_time_derivation
  scope_expansion_check_ran: true
  expansion_triggers_found: []
  fib_amendment_required: false
---

# Feature Scaffold: Table Inventory Accounting Canonization

> Timebox: 30–60 minutes. If it's longer, you're drifting into a design doc.

**Feature name:** Table Inventory Accounting Canonization  
**Feature ID:** FIB-H-TIA-CANON-001  
**Owner / driver:** Architecture / Product  
**Status:** Draft  
**Last updated:** 2026-05-27

---

## 1) Intent (what outcome changes?)

- **User story:** As a pit boss reviewing a table's financial position during a shift, I see a single canonical accounting result — labeled correctly for its completeness state — rather than competing, unlabeled, or formula-inconsistent values across the rundown and dashboard.
- **Primary actor:** Pit boss / shift manager reviewing table results at the Pit Terminal Rundown
- **Success looks like:** The Pit Terminal Rundown renders `projected_table_win_loss_cents` (label: "Projected Win/Loss") or `partial_table_result_cents` (label: "Partial Table Result") from a single canonical `TableInventoryAccountingProjection` DTO; the shift dashboard legacy win-loss display is suppressed; no competing formula remains in the codebase.

---

## 2) Constraints (hard walls)

- **Domain:** ADR-053 — PT-2 does not produce authoritative financial totals. All values in this slice are `non_custody_estimate`. `final_table_win_loss_cents` is always null. Unqualified "Win/Loss" label is forbidden.
- **Domain:** `opening_inventory_cents` and `closing_inventory_cents` are required lifecycle snapshots — their absence is an integrity failure (`integrity_issues`), not a completeness gap (`missing_inputs`). Zero is a valid explicit count.
- **Domain:** `telemetry_derived_drop_estimate_cents` is nullable (SQL SUM over zero rows). Null must be represented by `drop_estimate_state = 'none_for_session'`, not coalesced to 0.
- **Domain:** No `finance_outbox` rows emitted; no outbox infrastructure; no persisted projection store at baseline. Classification is CLS-002 (read composition), not CLS-004/CLS-005.
- **Security / tenancy:** All reads through TableContextService RPCs or the service layer; casino-scoped via Pattern C hybrid RLS (ADR-015). No new RLS policies required for the service module itself — reads from existing owned tables.
- **Scope:** No new authoring RPCs. No new write surfaces. No cross-context writes. No external custody integration.
- **Operational:** Service module starts as a single file (`services/table-context/table-inventory-accounting.ts`); no subdirectory until a second file is needed (Over-Engineering Guardrail).

---

## 3) Non-goals (what we refuse to do in this iteration)

- `final_table_win_loss_cents` — requires external custody authority and ADR/FIB amendment; always null in this slice
- Posted drop / counted drop as a formula input — reserved future vocabulary
- External count-room or custody integration of any kind
- Full shift reconciliation or variance resolution
- Drop posting workflow
- Persisted projection store at baseline (acceptable only as a subsequent EXEC-SPEC optimization if read cost at shift scale proves unacceptable)
- Dashboard-first implementation — the shift dashboard becomes a consumer after the rundown exemplar proves the model
- Compatibility preservation for obsolete DTOs, widgets, or formulas — not in production, so backward compatibility is not a goal
- `bridge_pending`, `source_unavailable`, `integrity_issue` as implemented `drop_estimate_state` values — deferred; require Finance cross-context DTO contracts that do not exist yet
- Any new operator-visible surface beyond the Pit Terminal Rundown exemplar (requires FIB §K amendment)
- Generic event-sourcing redesign

---

## 4) Inputs / Outputs

- **Inputs (read-time, TableContextService-owned):**
  - `table_inventory_snapshot` — opener and closer counts
  - `table_fill`, `table_credit` — chips moved cage ↔ table
  - `table_buyin_telemetry` — session-scoped SUM (RATED_BUYIN + GRIND_BUYIN) → `telemetry_derived_drop_estimate_cents`
  - `table_session` — session window for telemetry aggregation
- **Outputs:**
  - `TableInventoryAccountingProjection` DTO — canonical read model carrying result values, `drop_estimate_state`, `completeness`, `integrity_issues`, `custody_status`, `source_authority`, `calculation_kind`
- **Canonical contract:** `TableInventoryAccountingProjection` — the sole authority downstream surfaces may consult for table result values

### Telemetry Aggregation Predicate (frozen)

```sql
telemetry_derived_drop_estimate_cents =
  SUM(table_buyin_telemetry.amount_cents)
  WHERE table_id = :table_id
    AND telemetry_kind IN ('RATED_BUYIN', 'GRIND_BUYIN')
    -- RATED_ADJUSTMENT intentionally excluded per ADR-060 D2.
    -- Semantic exclusion, not structural. Do not add without ADR/FIB amendment.
    AND occurred_at >= table_session.opened_at
    AND occurred_at < COALESCE(table_session.closed_at, NOW())
```

Column name `telemetry_kind` verified against DDL (`20260114003530_table_buyin_telemetry.sql`). No COALESCE of the SUM result to 0. SQL SUM over zero qualifying rows returns NULL; the service sets `drop_estimate_state = 'none_for_session'` when the aggregate is null.

### `drop_estimate_state` — Baseline-Narrow Contract

The baseline implementation exposes exactly two discriminator states:

```ts
drop_estimate_state: 'present' | 'none_for_session'
```

| Value | Meaning | Allowed render |
|---|---|---|
| `'present'` | SUM returned a number; `telemetry_derived_drop_estimate_cents` is non-null | `projected_table_win_loss_cents` may render |
| `'none_for_session'` | SUM over zero qualifying rows returned NULL | `partial_table_result_cents` may render |

**Reserved vocabulary (named but not implemented at baseline):**

| Value | Why deferred |
|---|---|
| `'bridge_pending'` | Detection requires Finance cross-context DTO contract; relay-lag truth belongs to outbox observability (Phase 2.3a) |
| `'source_unavailable'` | Same Finance signal dependency |
| `'integrity_issue'` | Drop-source integrity is distinct from inventory snapshot integrity; Finance DTO contract required |

PRD may not introduce a state the scaffold names but refuses to define. The two-state enum is the complete exemplar contract; extending it requires a Finance cross-context DTO contract to be published first.

---

## 5) Options

### Option A: Read-time derivation (recommended)

Service layer computes formula algebraically at request time from canonical inventory authoring tables. No projection writer. No write path.

- **Pros:** No projection staleness problem; algebraically idempotent; narrowest valid implementation; no additional infrastructure; eliminates projection consistency concerns at baseline.
- **Cons / risks:** Recomputes on every request; may require materialization if shift scale reveals unacceptable read cost (mitigable in a subsequent EXEC as an optimization).
- **Cost / complexity:** Low — one service module file, one API route update, Pit Terminal Rundown UI update.
- **Security posture impact:** None — reads only existing TableContextService-owned tables under existing RLS.
- **Exit ramp:** Add a projection writer in a follow-on EXEC if read cost is proven unacceptable; the DTO shape and formula do not change.

### Option B: Persisted projection store

A separate writer (trigger or service) materializes `TableInventoryAccountingProjection` to a dedicated store on each inventory authoring event. Reads become table scans against the projection store.

- **Pros:** Fast reads at shift scale; pre-computed state available on demand.
- **Cons / risks:** Adds a write path for a deterministic formula; introduces projection staleness between authoring events and projection updates; requires an additional migration and table; adds operational complexity for an exemplar baseline; flagged as over-engineering in the classification YAML.
- **Cost / complexity:** Medium-high for baseline; justified only after read-cost profiling.
- **Security posture impact:** New table requires RLS policy; writer RPC or trigger must be SECURITY DEFINER per ADR-018.
- **Exit ramp:** Can be added later as optimization; starting here forecloses the simpler option unnecessarily.

### Option C: UI-side formula computation (rejected)

Remove the competing formulas from backend services; let the Pit Terminal Rundown compute the result from raw inventory fields returned by the API.

- **Pros:** Minimal backend change.
- **Cons / risks:** RULE-7.6 violation (partial state must not be patched by UI recomputation); reproduces the split-brain in the wrong direction; forbidden by FIB-H §O.10 (competing formulas must be deleted, not moved).
- **Cost / complexity:** Low upfront; high long-term (every new consumer replicates the formula).
- **Security posture impact:** None.
- **Exit ramp:** None — this option forecloses canonical ownership.

---

## 6) Decision to make

- **Decision:** Which surface receives the first canonical exemplar and whether the service is persisted or read-time.
- **Decision drivers:** ADR-053 (no authoritative totals), FIB-H §P.1 (Pit Terminal Rundown selected), classification YAML recommendation (read_time_derivation), Over-Engineering Guardrail.
- **Resolution:** Option A (read-time derivation). Pit Terminal Rundown is the exemplar. Persisted projection is deferred as an explicit EXEC-SPEC optimization gated on profiling evidence.

---

## 7) Dependencies

| Dependency | Type | Status |
|---|---|---|
| `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_session` | Required reads | Implemented — TableContextService owned |
| `table_buyin_telemetry` | Required read. Read ownership: TableContextService. Row presence for rated buy-ins depends on Finance bridge/relay completion. The read model distinguishes `none_for_session` (SQL SUM over zero rows — no cross-context read required) from `bridge_pending` (relay lag — Finance cross-context DTO not yet published). `bridge_pending` is deferred reserved vocabulary at baseline. | Read source available; row-presence guarantee partial (relay-lag detection deferred) |
| `rpc_compute_table_rundown` or equivalent BFF route | Required — must be updated to consume canonical DTO | Exists; needs canonical formula wired |
| ADR — Table Inventory Accounting Canon | Required — Phase 4 | Not yet written |
| ADR — Drop taxonomy and naming standard | Required — Phase 4 | Not yet written |

---

## 8) Risks / Open questions

| Risk / Question | Impact | Mitigation |
|---|---|---|
| Session-scoped telemetry SUM not in current rundown path | High — implementation gap | Confirmed gap; new service module adds it |
| `drop_estimate_state` enum extension for `bridge_pending` | Low — deferred by design | Requires Finance cross-context DTO contract; reserved vocabulary only at baseline |
| Dashboard suppression scope — which fields, which components | High — P0 acceptance criterion | Named explicitly in Section 10 (P0 concurrent suppression targets); must be confirmed suppressed in DoD |
| Legacy DTO removal list not yet fully enumerated | Med | FIB §P.7 names 7 fields; Section 10 names P0 concurrent suppression targets that ship with exemplar |
| FIB §L.1 open question — subdomain name (`TableInventoryAccounting` vs `TableAccounting` vs `TableContext` subdomain) | Low | ADR resolves; classification YAML recommends `TableContext.TableInventoryAccounting` |

---

## 9) Feature Classification Block

Per `FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.yaml`:

| Field | Value |
|---|---|
| `primary_classification` | `CLS-002` — `read_composition` |
| `qualifier` | `canonical_derived_model` — projection owns formula and DTO; upstream inventory stores remain the authority for facts |
| `secondary_classifications` | `CLS-006` — `surface_value` (projected_table_win_loss_cents, partial_table_result_cents at Pit Terminal Rundown boundary) |
| `selected_transport` | `read_time_derivation` — service layer formula derivation → DTO → BFF/API → UI |
| `authors_domain_fact` | `false` — no new domain facts authored |
| `emits_projection_input` | `false` — no `finance_outbox` rows; inputs are inventory authoring tables, not outbox events |
| `requires_transactional_outbox` | `false` — algebraic idempotency from canonical inputs; no at-least-once delivery problem |
| `consumes_outbox_events` | `false` — outbox pipeline does not apply; CLS-005 rejected |
| `renders_financial_surface_values` | `true` — `projected_table_win_loss_cents` and `partial_table_result_cents` at Pit Terminal Rundown; ADR-053 compliant; all values carry two-axis completeness envelope |
| `fib_amendment_required` | `false` — Pit Terminal Rundown exemplar is the named surface in FIB-H §P.1; no expansion triggers tripped |

**Scope expansion check result:** All 10 FIB-H §K triggers checked — none tripped. The Pit Terminal Rundown surface is the explicitly named exemplar; `TableInventoryAccountingProjection` is the named canonical output. No amendment required.

---

## 10) Exemplar Boundary (PT-STANDARD-ES-01)

**ES-01 Applicability:** Mandatory. This rollout satisfies all four ES-01 conditions: (1) introduces a new canonical model for a recurring domain concept (table result); (2) the feature loop implies a consumer expansion pattern; (3) a P0 suppression gate exists; (4) the Pit Terminal Rundown is the first surface in this canonical class.

**Exemplar Surface:** Pit Terminal Rundown backed by `TableInventoryAccountingProjection`

### P0 Concurrent Suppression — Ships with Exemplar

These targets are P0 acceptance criteria. They must be resolved when the exemplar ships. ADR/RFC may choose the concrete suppression mechanism (same-merge delete, route removal, feature-flag guard) but may not relax the invariant: no competing win/loss-like display is operator-visible after exemplar acceptance.

| Target | Required action |
|---|---|
| `components/pit/hero-win-loss-compact.tsx` (or equivalent) | Suppress legacy win-loss display; consume `TableInventoryAccountingProjection` or render nothing |
| `components/pit/pit-metrics-table.tsx` | Suppress legacy `win_loss_inventory_cents` / `win_loss_estimated_cents` column |
| `components/pit/table-metrics-table.tsx` | Suppress legacy win-loss column |
| `components/dashboard/analytics-panel.tsx` | Suppress legacy win-loss aggregate |
| `components/dashboard/casino-summary-card.tsx` | Suppress legacy win-loss display |
| Local win formula in `services/table-context/rundown.ts` (or `rpc_compute_table_rundown`) | Delete or replace with `TableInventoryAccountingProjection` read |
| `win_loss_inventory_cents`, `win_loss_estimated_cents`, `estimated_drop_buyins_cents` DTO fields | Remove from `TableRundownDTO` and any BFF response shaping |

### Post-Exemplar Consumer Expansion — Queued Behind Exemplar

After the exemplar acceptance gate passes, the following may be wired to `TableInventoryAccountingProjection`. This list is intentionally inexhaustive per ES-01 §6 — collapse vertically before expanding horizontally.

- Shift dashboard hero / metrics (full canonical consumer)
- Any additional operator surface requiring table result language

No new surface receives canonical accounting values until I1–I4 pass and the PRD gate is confirmed.

### Adapted Proof Invariants (CLS-002 — no write path)

| Invariant | What must pass |
|---|---|
| I1 — Canonical path end-to-end | `table_inventory_snapshot + table_fill + table_credit + table_buyin_telemetry + table_session → TableInventoryAccounting.ts → TableInventoryAccountingProjection DTO → BFF/API → Pit Terminal Rundown render`. Unit tests cover formula derivation; integration test covers BFF route response shape; Rundown renders canonical DTO fields only. |
| I2 — No competing formula | No legacy formula path produces a win-loss value in the same API response. Codebase grep: no unscoped `win_loss` computation outside `table-inventory-accounting.ts`. |
| I3 — Result-state fixtures (projected / partial / integrity-suppressed) | Four acceptance fixtures from Feature Brief pass: (a) all inputs present → `projected` set, (b) drop absent (`none_for_session`) → `partial` set, (c) opener null → integrity failure, both result fields null, (d) zero opener (valid count) → `projected` set, `integrity_issues = []`. |
| I4 — Regression suite | After exemplar lands, all P0 concurrent suppression targets render no win-loss-like label. Jest snapshot or Playwright assertion on suppression targets. |

**Expansion gate:** No additional surface is wired to `TableInventoryAccountingProjection` until I1–I4 pass.

---

## 11) Downstream Design Readiness Matrix

Every item below must be marked **closed**, **explicitly deferred**, or **blocking** before RFC/ADR/SEC/PRD may elaborate implementation scope. No "PRD will decide" placeholders.

| Gate Item | Status | Notes |
|---|---|---|
| `session_scope_aggregation_boundary` | **Closed** | Exact SQL predicate frozen in Section 4. Column `telemetry_kind` verified against DDL (`20260114003530_table_buyin_telemetry.sql`). Window: `occurred_at >= opened_at AND occurred_at < COALESCE(closed_at, NOW())`. Gaming-day scope is forbidden; session scope is the contract. |
| `drop_estimate_state_contract` | **Closed** | Baseline-narrow two-state enum declared in Section 4: `['present', 'none_for_session']`. Deferred states named with `why_deferred` rationale. PRD may not introduce additional states without a published Finance cross-context DTO contract. |
| `exemplar_deletion_quarantine_list` | **Closed** | P0 concurrent suppression targets named in Section 10. These ship with the exemplar — not after it. Post-exemplar consumer expansion is intentionally inexhaustive per ES-01 §6 and is not bounded here. |
| `bridge_consistency_test_requirements` | **Deferred (Phase 2.3a)** | `bridge_pending` state detection requires Finance relay-lag signal via a cross-context DTO contract that does not exist at baseline. Minimum baseline tests named: (a) `none_for_session` fires when SUM returns NULL, (b) `present` fires when SUM returns non-null, (c) no COALESCE-to-zero path exists anywhere in `table-inventory-accounting.ts`. These three cases are PRD-blocking. Full bridge consistency tests are Phase 2.3a (outbox observability). |

---

## 12) Definition of Done (semantic readiness gate)

- [ ] Session-scope aggregation predicate frozen — exact SQL, exact column names, exact window — per Section 4 and confirmed in ADR
- [ ] `drop_estimate_state` baseline-narrow enum declared (`['present', 'none_for_session']`) — no additional states shipped without Finance DTO contract
- [ ] All P0 concurrent suppression targets (Section 10) confirmed suppressed in the same merge as the exemplar
- [ ] Adapted proof invariants I1–I4 pass (unit formula tests, BFF integration test, functional fixtures, regression assertions)
- [ ] Bridge consistency minimum test cases pass: `none_for_session` on null SUM, `present` on non-null SUM, no COALESCE-to-zero path
- [ ] ADR(s) record ownership decision, formula semantics, and drop taxonomy
- [ ] Acceptance criteria agreed in PRD (including P0 dashboard suppression gate)
- [ ] Implementation plan delegated to build-pipeline via `/build PRD-###`

---

## Links

- Feature Boundary: `docs/20-architecture/specs/table-inventory-canon/FEATURE_BOUNDARY.md`
- Feature Brief (working reference): `docs/20-architecture/specs/table-inventory-canon/FEATURE_BRIEF.md`
- FIB-H: `docs/issues/table-inventory-accounting-canon/planning/FIB-H-TABLE-INVENTORY-ACCOUNTING-CANONIZATION-v1-exemplar.md`
- Classification YAML: `docs/issues/table-inventory-accounting-canon/planning/FIB-H-TIA-CANON-001-classification.yaml`
- Exemplar Slice Discipline: `docs/70-governance/EXEMPLAR_SLICE_DISCIPLINE.md`
- Design Brief / RFC: _(Phase 2 — pending)_
- ADR(s): _(Phase 4 — pending)_
- PRD: _(Phase 5 — pending)_
