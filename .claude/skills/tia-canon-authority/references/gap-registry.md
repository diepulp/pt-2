# TIA Canon — Implementation Gap Registry

This file provides per-gap detail for the open implementation gaps tracked in
`SKILL.md`. Each entry describes the current system state, what the new
`TableInventoryAccounting` module must do instead, and structural constraints
the implementation must respect.

---

## GAP-TIA-1 — No `TableInventoryAccounting` Service Module

**Current state:** The service module `services/table-context/table-inventory-accounting.ts`
does not exist. The closest existing code is `rpc_compute_table_rundown` (SQL RPC) and
`services/table-context/rundown.ts` (TypeScript wrapper), neither of which implements the
canonical formula, the three-result-state model, or the completeness envelope.

**What must be built:**
A service module at `services/table-context/table-inventory-accounting.ts` (single file
first; extract to folder only if a second file is needed) that:
- Accepts a `table_session_id` + resolved inventory inputs
- Executes the session-scoped telemetry SUM (GAP-TIA-2)
- Applies the three-result-state logic (GAP-TIA-3 + GAP-TIA-4)
- Returns `TableInventoryAccountingProjection` DTO

**Status:** Not started. Blocked on ADR-060 + ADR-061 acceptance.

---

## GAP-TIA-2 — No Session-Scoped Telemetry SUM

**Current state:** `rpc_shift_table_metrics` aggregates `table_buyin_telemetry` at
gaming-day scope with caller-supplied `p_window_start`/`p_window_end` parameters and
applies `COALESCE(SUM(...), 0)`. `rpc_compute_table_rundown` has no telemetry aggregation
at all. Neither is usable as a source for `telemetry_derived_drop_estimate_cents`.

**What must be built:**
A session-scoped SUM per the frozen predicate (ADR-061 D2):

```sql
SUM(tbt.amount_cents)
FROM table_buyin_telemetry tbt
WHERE tbt.casino_id     = ts.casino_id
  AND tbt.table_id      = ts.gaming_table_id
  AND tbt.telemetry_kind IN ('RATED_BUYIN', 'GRIND_BUYIN')
  AND tbt.occurred_at  >= ts.opened_at
  AND tbt.occurred_at  <  COALESCE(ts.closed_at, NOW())
```

The NULL result from zero rows must pass through as NULL — not COALESCEd to 0.

**Index:** `idx_tbt_kind` on `(casino_id, table_id, telemetry_kind, occurred_at)` already
supports this predicate. No new migration required for baseline performance.

**Excluded sources:**
- `rpc_shift_table_metrics` — gaming-day scope + forbidden COALESCE (ADR-061 D5)
- Any wrapper that calls `rpc_shift_table_metrics` with narrowed params — COALESCE
  cannot be undone by the caller

**Status:** Not started. Blocked on ADR-061 acceptance.

---

## GAP-TIA-3 — No `partial_table_result_cents` Path

**Current state:** `rpc_compute_table_rundown` (20260117153727) contains:

```sql
IF drop_posted_at IS NOT NULL AND drop_total_cents IS NOT NULL THEN
  table_win_cents := closing + credits + drop - opening - fills
ELSE
  table_win_cents := NULL  -- "PATCHED behavior"
END IF
```

The `-- "PATCHED behavior"` comment in `rundown.ts:7` already signals this is a
known stub. If drop is absent, the result is an opaque null. There is no partial
result path, no `partial_table_result_cents`, and no missing-input disclosure.

**What must be built:**
The `inventory_only` state in the three-result-state machine:

```
When drop_estimate_state = 'none_for_session' AND opener+closer both resolvable:
  partial_table_result_cents =
    closing_inventory_cents + credits_cents - opening_inventory_cents - fills_cents
  projected_table_win_loss_cents = null
  calculation_kind = 'inventory_only'
  completeness.status = 'partial'
  completeness.missing_inputs = ['drop_estimate']
  integrity_issues = []
```

Surface must label this "Partial Table Result" and disclose missing inputs.

**Status:** Not started.

---

## GAP-TIA-4 — No `integrity_issues` Discrimination

**Current state:** The system does not distinguish between:
1. A lifecycle/integrity failure (opener or closer genuinely unresolvable — no snapshot linked)
2. A partial result (drop absent but inventory inputs present)
3. A valid zero opener/closer (explicit empty-tray count)

All cases that produce a null arithmetic input cascade to opaque null output. There
is no `integrity_issues` field, no disclosure path, and no surface signal.

**What must be built:**
The `integrity_failure` state in the three-result-state machine:

```
Trigger: opening_inventory_cents IS NULL (after dual-path resolution)
      OR closing_inventory_cents IS NULL (after dual-path resolution)
         - "null after resolution" means: no snapshot linked; NOT the same as zero

Effect:
  projected_table_win_loss_cents = null
  partial_table_result_cents = null       ← MUST be null; not a partial state
  calculation_kind = 'integrity_failure'
  completeness.status = 'integrity_failure'
  completeness.missing_inputs = []        ← opener/closer are NOT missing_inputs
  integrity_issues = ['missing_opening_inventory_snapshot']
                  or ['missing_closing_inventory_snapshot']
                  or both
```

Surface must render an explicit integrity disclosure — not an opaque blank. The ADR-059 D5
requirement: "PRD/EXEC must require an observable signal for every `integrity_failure` result,
either structured application logging or an equivalent reportable operational diagnostic."

**Critical distinction:** Zero opener/closer is a valid explicit count. Only unresolvable null
(no snapshot linked after all resolution paths are exhausted) triggers integrity_failure.

**Status:** Not started.

---

## GAP-TIA-5 — Opening Snapshot Chain Can Silently Break

**Current state:** There is no mandatory opener capture at session open time.
`rpc_open_table_session()` inherits the predecessor session's `closing_inventory_snapshot_id`
as the new session's `opening_inventory_snapshot_id` (PRD-059 chain mechanism). This means:

- Sessions after the first have an opener only if the predecessor closed with a snapshot.
- **The first session on a table has `opening_inventory_snapshot_id = NULL`** — no producer
  exists for a standalone opener at session-open time.
- If the predecessor was force-closed with only a `drop_event_id` (no snapshot), the chain
  breaks and the new session's opener is NULL.

**Similarly for closer:** `rpc_close_table_session()` accepts `p_closing_inventory_snapshot_id`
as optional. The only hard requirement is "at least one closing artifact" — either a snapshot
OR a `drop_event_id`. Sessions can legitimately close with no closing inventory snapshot.

**What the new service must do:**
Implement the dual-path lookup described in the classification YAML:
1. Attempt to resolve `opening_inventory_snapshot_id` via session FK
2. Fall back to direct FK if available
3. If null after all paths: populate `integrity_issues`, suppress both result fields

The service must not silently treat a null opener/closer as zero. The caller (BFF route
or rundown RPC wrapper) must surface the `integrity_failure` state to the UI.

**Note:** This is a structural gap in the data model, not just in the formula path.
The PRD/EXEC will need to decide whether to add a mandatory opener-capture step or
to handle first-session integrity_failure as a known operational state with a defined
disclosure path.

**Status:** Structural gap. New service must handle. Not patched upstream.

---

## GAP-TIA-6 — Legacy Streams Still Active on Operator-Visible Surfaces

**Current state — live fields that must be suppressed:**

| Field | Location | Split-brain consequence |
|---|---|---|
| `win_loss_inventory_cents` | `ShiftTableMetricsDTO`, analytics panel | Dashboard shows different formula than rundown |
| `win_loss_estimated_cents` | `ShiftTableMetricsDTO` | Uses par-bootstrap opener; contradicts canonical opener-required rule |
| `win_loss_estimated_total_cents` | `CasinoShiftMetricsDTO` | Gaming-day aggregate, not per-session; different number for same table |
| `estimated_drop_buyins_cents` | `ShiftTableMetricsDTO` | Non-canonical field name; gaming-day scoped |
| `table_win_cents` | `TableRundownDTO`, `table_rundown_report` | The "PATCHED" stub; to be replaced by `TableInventoryAccountingProjection` |

**P0 requirement (classification YAML prd_gate_patches.dashboard_suppression_gate):**
Legacy display must be **suppressed** — not just deprecated — when the exemplar lands.
A UI that simultaneously shows `win_loss_inventory_cents` on the shift dashboard and
`projected_table_win_loss_cents` on the Pit Terminal Rundown is a split-brain state.
The exemplar delivery must close it.

**What suppression means:**
- Component does not render the value at all on the affected surface
- The API route may still return the field internally for migration purposes, but the
  render path must not display it
- "Deprecated" (visible but labeled) is not suppression — the value must not be visible

**Status:** Must be addressed in PRD acceptance criteria and confirmed in exemplar delivery.
Consumer migration plan can be later; visual suppression cannot.

---

## GAP-TIA-7 — `final_table_win_loss_cents` (Reserved — Do Not Implement)

**Current state:** This field does not exist in the codebase, which is correct.

**Rule:** `final_table_win_loss_cents` is always `null` in this slice. It requires:
- External count-room / soft-count / custody authority (ADR-053)
- An explicit ADR/FIB amendment authorizing the external custody source

It must appear in the `TableInventoryAccountingProjection` DTO as `null` only —
typed as `null` (not `number | null`). This makes it structurally impossible to
accidentally populate it in this slice.

**What is forbidden:**
- Implementing any code path that sets `final_table_win_loss_cents` to a non-null value
- Using `telemetry_derived_drop_estimate_cents` as a proxy for a "final" value
- Labeling `projected_table_win_loss_cents` as "Final Win/Loss" or unqualified "Win/Loss"
- Claiming `final_table_win_loss_cents` becomes reachable once PT-2 inputs are complete
  (`input_completeness = complete` does not unlock `final_table_win_loss_cents` — ever)

**Status:** Reserved. Do not implement in this slice. Document ADR-059 D3 in all DTO
definitions so the constraint is visible to future implementors.
