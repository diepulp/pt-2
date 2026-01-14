---
title: "Addendum: Table Inventory Rundown Read Model (Shift Table Metrics)"
doc_id: "ADDENDUM-TABLE-RUNDOWN-READMODEL"
version: "v0.2-PATCH"
status: "draft"
owner: "TableContext"
last_updated: "2026-01-13"
patch_notes:
  - "Clarifies that table_drop_event is custody-only; drop *amount* is a separate count result."
  - "Adds dual outputs: win_loss_inventory (MVP) and win_loss_stat (requires drop_amount)."
  - "Allows ad-hoc (start,end) window RPC signature when shift table does not exist."
depends_on:
  - "supabase/migrations/20251108195341_table_context_chip_custody.sql"
  - "supabase/migrations/20251231072655_adr024_security_definer_rpc_remediation.sql"
  - "docs/00-vision/shift-dashboards/SHIFT_METRICS_CATALOG_v0_PATH_B_PATCH_cash-observations.md"
---

# Addendum: Table Inventory Rundown Read Model (Shift Table Metrics)

## Purpose

TableContext currently captures the **operational inputs** required for table inventory “rundown”:

- `table_inventory_snapshot` (opening/closing and mid-shift)
- `table_fill`
- `table_credit`
- `table_drop_event` (drop-box custody)

…but it does **not** compute or expose:

- per-table shift rundown (opening, closing, fills, credits, drop, win/loss)
- pit/casino rollups for shift dashboards

This addendum extends the **Table Inventory Lifecycle** with a **read-model** layer that:

1. selects the correct window and snapshot boundaries deterministically
2. aggregates per-table inputs for the window
3. computes **win/loss** with a single sign convention
4. exposes table + rollups via RPC(s) for dashboards

---

## Glossary (read-model definitions)

- **Opening bankroll**: table inventory at the start boundary of the window.
- **Closing bankroll**: table inventory at the end boundary of the window.
- **Fill**: chips added to the table (value sent *to* table).
- **Credit**: chips removed from the table (value returned *to* cage).
- **Drop custody**: the act of removing/securing the drop box (chain-of-custody event).
- **Drop amount (physical)**: counted contents removed from the drop box (count-room result).

> Critical distinction (patch): **table_drop_event is custody-only** and MUST NOT be treated as the “drop amount.”
> The “drop amount” only exists once a count process records it.

---

## Canonical sign convention (single source of truth)

### Store events as absolute-positive amounts
- `fills_total` = SUM(fill.amount_cents) within window
- `credits_total` = SUM(credit.amount_cents) within window
- `opening_bankroll_total` / `closing_bankroll_total` = computed from snapshot.chipset (see Snapshot Totals)

### MVP metric: inventory-based win/loss (no drop required)

This is the **tray delta** metric you can compute today:

```
win_loss_inventory =
  (closing_bankroll_total - opening_bankroll_total)
  + fills_total
  - credits_total
```

Interpretation: “What happened to the tray plus chip movements under custody controls.”

### Later metric: statistical win / gross revenue (requires drop amount)

Once count integration exists (drop amount recorded):

```
win_loss_stat =
  win_loss_inventory
  + drop_amount_cents
```

This matches the same identity family used by common internal control standards for table-games gross revenue.

---

## Read-model placement in the lifecycle

Add two phases to the Table Inventory Lifecycle:

### Phase 6 — Read-model aggregation (continuous during shift)
Dashboards may query metrics at any time:

- per-table partial metrics (tables can be open; closing may be missing)
- exception flags (missing opening, missing closing, missing drop amount)
- `is_final` indicator (below)

### Phase 7 — Finalization semantics (end-of-shift)
Rundowns should not drift forever. For MVP (no new write required), define:

- `is_final = true` when:
  - opening snapshot exists in window, AND
  - closing snapshot exists in window, AND
  - drop amount exists in window (from count result table) OR the casino policy allows “inventory-only close”
- otherwise `is_final = false`

If you later add a `table_inventory_session` table, finalization becomes explicit (`finalized_at`).

---

## Shift window sourcing (patch: no shift table required)

### Supported window strategies

**Strategy A (recommended MVP): ad-hoc timestamps**
- RPC accepts `p_window_start`, `p_window_end`
- window is sourced from UI selection / casino settings (e.g., shift start/end schedule)

**Strategy B: shift_id lookup (if/when a shift table exists)**
- RPC accepts `p_shift_id`
- RPC looks up `{starts_at, ends_at}` from a minimal shift definition table in the reporting/ops layer

This avoids forcing TableContext to invent a new “Shift” domain if it isn’t already canonical elsewhere.

---

## Snapshot totals (chipset JSONB)

### Current state
`table_inventory_snapshot` stores a `chipset` JSONB, not a `total_amount_cents`.

### MVP solutions (either is acceptable)
1. **Query-time aggregation**: compute `snapshot_total_cents` from `chipset` in the read RPC (or a SQL helper).
2. **Schema addition**: add `total_amount_cents bigint` populated at write-time (or as a generated column if feasible).

For MVP, prefer (1) to avoid migrations unless performance proves otherwise.

---

## Drop: custody vs amount (the “drop problem”)

### What exists now (custody only)
`table_drop_event` is a custody record:
- `drop_box_id`, `seal_no`, `gaming_day`, timestamps, actors
- **No amount_cents** (by design)

### What is required for statistical win (amount)
Introduce a **count-result artifact** when count workflow exists:

**Option (recommended): new table**
- `table_drop_count_result` (or `soft_count_table_result`)
  - `casino_id`, `gaming_day`, `window_start`, `window_end` OR `shift_id`
  - `table_id`
  - `drop_amount_cents`
  - optional breakdown jsonb (cash/chips/tickets/coupons/etc)
  - `counted_at`, `count_batch_id` (future)

This keeps custody separate from valuation and prevents “fake revenue” from custody events.

---

## RPC contract: `rpc_shift_table_metrics`

### Signatures (patch: both supported)
- `rpc_shift_table_metrics(p_window_start timestamptz, p_window_end timestamptz)`
- `rpc_shift_table_metrics(p_shift_id uuid)` (only if shift table exists)

### Output schema (per table)

Core identifiers:
- `table_id uuid`
- `pit_id uuid null`
- `window_start timestamptz`
- `window_end timestamptz`

Snapshot boundaries:
- `opening_snapshot_id uuid null`
- `opening_snapshot_at timestamptz null`
- `opening_bankroll_total_cents bigint null`

- `closing_snapshot_id uuid null`
- `closing_snapshot_at timestamptz null`
- `closing_bankroll_total_cents bigint null`

Aggregates:
- `fills_total_cents bigint not null default 0`
- `credits_total_cents bigint not null default 0`

Drop:
- `drop_custody_present boolean not null` (derived from `table_drop_event` existence in window)
- `drop_amount_cents bigint null` (from count-result table; NULL until implemented)

Computed:
- `win_loss_inventory_cents bigint null`
- `win_loss_stat_cents bigint null`
- `is_final boolean not null`

Exceptions:
- `missing_opening_snapshot boolean not null`
- `missing_closing_snapshot boolean not null`
- `missing_drop_amount boolean not null`
- `invalid_negative_amount boolean not null`

### Computation rules (MVP)
- If `missing_opening_snapshot` OR `missing_closing_snapshot` → `win_loss_inventory_cents = NULL`
- Else compute inventory win as defined above.
- `win_loss_stat_cents = win_loss_inventory_cents + drop_amount_cents` (NULL if drop_amount_cents is NULL)
- `missing_drop_amount = (drop_amount_cents IS NULL)` regardless of custody presence

---

## Deterministic boundary selection (MVP)

### Window filter
All inputs filtered by:
- `occurred_at >= window_start`
- `occurred_at < window_end`
- `casino_id` via RLS context

### Opening snapshot
- earliest snapshot in window

### Closing snapshot
- latest snapshot in window

### Event inclusion
- fills/credits summed within window by `table_id`
- custody presence derived by existence of `table_drop_event` rows in window

---

## Rollups (pit and casino)

Provide rollups in SQL (avoid frontend re-aggregation):

- `rpc_shift_pit_metrics(p_window_start, p_window_end)` (or `p_shift_id`)
  - GROUP BY pit_id
  - sums of each component
  - exception counts

- `rpc_shift_casino_metrics(p_window_start, p_window_end)` (or `p_shift_id`)
  - totals across all tables
  - exception counts

Suggested rollup fields:
- `tables_total`
- `tables_missing_opening`
- `tables_missing_closing`
- `tables_missing_drop_amount`
- `tables_not_final`
- `win_loss_inventory_total_cents`
- `win_loss_stat_total_cents` (nullable until drop amounts exist)

---

## Security & RLS

These RPCs are **read-only** and should be RLS-safe:

- scope by casino context (`app.casino_id` / JWT metadata)
- do not accept spoofable `casino_id` parameters
- avoid `SECURITY DEFINER` unless a concrete RLS limitation is proven and documented

---

## Performance notes (MVP)

Recommended indexes:
- `table_inventory_snapshot (casino_id, table_id, occurred_at)`
- `table_fill (casino_id, table_id, occurred_at)`
- `table_credit (casino_id, table_id, occurred_at)`
- `table_drop_event (casino_id, table_id, occurred_at)`
- (later) `table_drop_count_result (casino_id, table_id, counted_at)` and/or `(casino_id, table_id, window_start)`

---

## Open questions (must be settled)

1. **Shift window authority**: is the window ad-hoc (timestamps) or canonical `shift_id`?
2. **Snapshot requirement**: are shift-change snapshots mandatory when a table stays open?
3. **Finalization policy**: can a table be considered final without drop amount (inventory-only close), or must count complete?
4. **Immutability**: are events append-only, or can operators edit amounts after the fact?

---

## Implementation checklist (recommended order)

1. **Shift window support**
   - Implement timestamp-window RPC signature first.
   - Add shift_id signature later if/when a shift table becomes canonical.

2. **Snapshot totals**
   - Implement query-time `chipset_total_cents()` helper.
   - Consider `total_amount_cents` column post-MVP.

3. **Implement read model (MVP)**
   - `rpc_shift_table_metrics(window_start, window_end)`
   - compute `win_loss_inventory_cents`
   - return `drop_amount_cents = NULL`, `missing_drop_amount = true`

4. **Rollups**
   - `rpc_shift_pit_metrics(...)`
   - `rpc_shift_casino_metrics(...)`

5. **Count integration (later)**
   - Add `table_drop_count_result.drop_amount_cents`
   - compute `win_loss_stat_cents`
   - drive `is_final` off closing + drop_amount (unless policy says otherwise)

---

## References (non-normative)

- Table-games gross revenue / statistical win identities are commonly defined by internal control standards and regulations (see: table-games gross revenue computation and definitions sections).
- Some standards define table-game “drop” to include both drop-box contents removed and credit issued at tables.

(See citations in the companion implementation discussion.)
