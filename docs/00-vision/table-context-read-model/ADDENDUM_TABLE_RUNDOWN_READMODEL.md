---
title: "Addendum: Table Inventory Rundown Read Model (Shift Table Metrics)"
doc_id: "ADDENDUM-TABLE-RUNDOWN-READMODEL"
version: "v0.1"
status: "draft"
owner: "TableContext"
last_updated: "2026-01-13"
depends_on:
  - "supabase/migrations/20251108195341_table_context_chip_custody.sql"
  - "supabase/migrations/20251231072655_adr024_security_definer_rpc_remediation.sql"
  - "docs/00-vision/shift-dashboards/SHIFT_METRICS_CATALOG_v0_PATH_B_PATCH_cash-observations.md"
---

# Addendum: Table Inventory Rundown Read Model (Shift Table Metrics)

## Purpose

TableContext currently **captures the operational inputs** required for table inventory “rundown” (opening/closing snapshots, fills, credits, drop events), but it does **not** compute or expose:

- **Per-table shift rundown** (opening, closing, fills, credits, drop, win/loss)
- **Pit/casino rollups** for shift dashboards

This addendum extends the **Table Inventory Lifecycle** with a **read-model** layer that:

1. Selects the correct *shift window* and *snapshot boundaries* deterministically  
2. Aggregates per-table inputs for the shift  
3. Computes **win/loss (statistical win / gross revenue)** with a single sign convention  
4. Exposes **table + rollups** via RPC(s) for dashboards

This is **read-only**. It does not change chip custody rules or introduce new financial “ownership” responsibilities.

---

## Glossary (operational definitions used by the read model)

- **Opening bankroll**: the recorded table inventory at the start of the shift window.
- **Closing bankroll**: the recorded table inventory at the end of the shift window.
- **Fill**: chips added to the table (value sent *to* table).
- **Credit**: chips removed from the table (value returned *to* cage).
- **Drop (table games)**: *either* (A) physical drop-box contents removed, *or* (B) “drop KPI” defined as physical drop-box contents **plus** credit issued at the tables.  
  - Note: some regulatory definitions for table games explicitly define “drop” as **drop boxes removed + credit issued at tables**. This document supports both, but requires choosing one as the canonical KPI for dashboards.

---

## Canonical formula (single sign convention)

### Inputs are stored as **absolute-positive** amounts
- `fill_total` = SUM(fill.amount) within window  
- `credit_total` = SUM(credit.amount) within window  
- `drop_total` = SUM(drop.amount) within window (definition chosen below)  
- `opening_bankroll_total` = snapshot.total (chosen boundary)  
- `closing_bankroll_total` = snapshot.total (chosen boundary)

### Statistical win / gross revenue (TableContext canonical)
Use the metrics-catalog identity, but expressed in the “chips don’t teleport” direction:

```
win_loss =
  (closing_bankroll_total - opening_bankroll_total)
  + fill_total
  - credit_total
  + drop_total
```

Algebraic note: This belongs to the same family of table-games gross revenue identities used by common internal control standards; the important part is **consistency** and **documented sign meaning**.

---

## Read-model placement in the lifecycle

Add the following **Phase 6** and **Phase 7** to the Table Inventory Lifecycle:

### Phase 6 — Read-model aggregation (continuous during shift)
At any time dashboards may query `rpc_shift_table_metrics(shift_id)` to produce:

- per-table partial metrics (tables can be open; closing may be NULL)
- exception flags (missing opening, missing closing, missing drop)
- `is_final` indicator (see Phase 7)

### Phase 7 — Rundown finalization (end-of-shift lock semantics)
A rundown should not drift forever. For MVP, the read model supports:

- `is_final = true` when:
  - a closing snapshot exists for the table in the window, **and**
  - a drop result exists for the table in the window (or an explicit “no-drop” override)
- otherwise `is_final = false`

**No write is required** for MVP finalization. Dashboards can treat `is_final=false` as “provisional”.

(If you later introduce a `table_inventory_session` table, finalization becomes a proper state transition with `finalized_at`.)

---

## RPC contract: `rpc_shift_table_metrics`

### Signature (recommended)
- **Primary**: `rpc_shift_table_metrics(p_shift_id uuid)`
- **Optional** (future): `rpc_shift_table_metrics(p_casino_id uuid, p_shift_start timestamptz, p_shift_end timestamptz)`

The shift window must be deterministically derived from the shift record (or from explicit timestamps).

### Output schema (per table)
Return one row per `table_id` (and include pit_id if available):

- `table_id uuid`
- `pit_id uuid null`
- `shift_id uuid`
- `window_start timestamptz`
- `window_end timestamptz`

Components:
- `opening_snapshot_id uuid null`
- `opening_snapshot_at timestamptz null`
- `opening_bankroll_total numeric null`

- `closing_snapshot_id uuid null`
- `closing_snapshot_at timestamptz null`
- `closing_bankroll_total numeric null`

- `fills_total numeric not null default 0`
- `credits_total numeric not null default 0`

Drop variants:
- `drop_physical_total numeric not null default 0`
- `drop_kpi_total numeric not null default 0`  (physical + credits, if chosen)
- `drop_total numeric not null default 0`      (alias to the chosen canonical KPI)

Computed:
- `win_loss numeric null` (NULL if opening is missing; otherwise computed; closing may be NULL if you want “partial”)
- `is_final boolean not null`

Exceptions (booleans, or an enum set):
- `missing_opening_snapshot boolean not null`
- `missing_closing_snapshot boolean not null`
- `missing_drop boolean not null`
- `invalid_negative_amount boolean not null` (guard rail)

---

## Deterministic boundary selection

### Window selection
- Window start/end comes from shift definition (canonical).
- All input events are filtered by:
  - `casino_id` (RLS context)
  - `occurred_at >= window_start`
  - `occurred_at < window_end`

### Opening snapshot rule (MVP)
- `opening = earliest inventory_snapshot in window`

### Closing snapshot rule (MVP)
- `closing = latest inventory_snapshot in window`

### Event inclusion
- fills, credits, drop events are summed within the window by `table_id`.

### Drift warning (why boundary rules matter)
If a table is open across shifts, the “earliest/latest within window” rule works, but produces NULLs when operators forget snapshots. That’s OK — the read model must expose **exception flags** so ops can fix the workflow rather than silently “0” the result.

---

## Win/loss computation rules

### Computation readiness
- If **opening snapshot missing** → `win_loss = NULL` and flag `missing_opening_snapshot=true`
- If **closing snapshot missing**:
  - Either compute a *partial* win using `closing=NULL` (not recommended), or
  - set `win_loss=NULL` until closing exists (recommended for MVP correctness)

### Drop choice
This addendum supports two outputs:

1) `drop_physical_total` = what was physically removed and counted from the drop box  
2) `drop_kpi_total` = `drop_physical_total + credits_total` (if you adopt the definition where table-game “drop” includes credit issued at tables)

**Dashboards must choose one**:
- `drop_total := drop_physical_total` (physical interpretation), OR
- `drop_total := drop_kpi_total` (expanded definition)

Once chosen, freeze it in the metrics catalog.

---

## Rollups (pit and casino)

Do not re-aggregate in the frontend. Provide rollups as RPCs:

- `rpc_shift_pit_metrics(p_shift_id uuid)`
  - GROUP BY pit_id  
  - totals for each component and `win_loss_total`  
  - counts of tables with exceptions

- `rpc_shift_casino_metrics(p_shift_id uuid)`
  - totals across all tables  
  - exception counts

Outputs include:
- `tables_total`
- `tables_missing_opening`
- `tables_missing_closing`
- `tables_missing_drop`
- `tables_not_final`

---

## Security & RLS

### Read-only, RLS-friendly
These RPCs should be **read-only** and should not require `SECURITY DEFINER` for MVP.

- Scope by `casino_id` using your canonical RLS session/JWT context.
- If `SECURITY DEFINER` becomes necessary later, it must be accompanied by:
  - explicit casino scoping via trusted context (no spoofable params)
  - an ADR note explaining why RLS-safe reads were insufficient

---

## Performance notes (MVP)

Recommended indexes to keep shift dashboards fast:

- `table_inventory_snapshot (casino_id, table_id, occurred_at)`
- `table_fill (casino_id, table_id, occurred_at)`
- `table_credit (casino_id, table_id, occurred_at)`
- `table_drop_event (casino_id, table_id, occurred_at)`

If you query “latest snapshot in window” often, consider:
- a composite index that supports ORDER BY occurred_at
- or (post-MVP) a `table_inventory_session` table that pre-links opening/closing snapshot ids

---

## Open questions (must be settled to avoid dashboard lies)

1. **Drop KPI**: Do shift dashboards use:
   - physical drop only, or
   - physical drop + credits?
2. **Closing requirement**: Is closing snapshot mandatory for a “final” rundown, or do you support “fill/credit-to-par” finalization without a closing snapshot?
3. **Cross-shift table operation**: If a table remains open across shifts, do you require a snapshot at shift change?
4. **Backdating/edits**: Are events immutable (append-only), or can operators edit amounts after the fact? (If editable, you need an audit trail and finalization lock semantics.)

---

## Implementation checklist (what to build next)

- [ ] Add read RPC: `rpc_shift_table_metrics(p_shift_id uuid)`
- [ ] Add rollup RPCs: `rpc_shift_pit_metrics`, `rpc_shift_casino_metrics`
- [ ] Add TableContextService methods:
  - [ ] `getShiftTableMetrics(shiftId)`
  - [ ] `getShiftPitMetrics(shiftId)`
  - [ ] `getShiftCasinoMetrics(shiftId)`
- [ ] Update shift dashboards to consume the RPC(s) directly
- [ ] Update metrics catalog with the **chosen drop definition** and the **canonical sign convention**
