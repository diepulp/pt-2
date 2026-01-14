---
title: "Addendum: Table Inventory Rundown Read Model (Shift Table Metrics)"
doc_id: "ADDENDUM-TABLE-RUNDOWN-READMODEL"
version: "v0.4.0-PATCH"
status: "draft"
owner: "TableContext"
last_updated: "2026-01-13"
patch_notes:
  - "Adds explicit dual-stream metrics: (1) telemetry-based operational estimate and (2) count-based statistical win."
  - "Defines estimated_drop based on buy-in telemetry (rating slip / player financial) and keeps it separate from drop_amount."
  - "Adds metric_grade (ESTIMATE vs FINAL) and quality flags to prevent estimate→accounting confusion."
  - "Keeps table_drop_event as custody-only; drop_amount remains a count-result artifact."
  - "RESOLVED Q1: player_financial_transaction (direction='in') is canonical telemetry source for estimated_drop_buyins_cents."
  - "RESOLVED Q2: Table mapping is reliable via rating_slip_id JOIN when filtered to source='pit' transactions."
  - "RESOLVED Q3: MVP shows estimate-only; final metrics require count room pipeline (out of scope)."
  - "RESOLVED Q4: Always LOW_COVERAGE with note; no threshold needed since we can't measure coverage without count data."
  - "v0.4.0: Introduces table_buyin_telemetry for unified rated + grind buy-in tracking. Replaces player_financial_transaction as telemetry source."
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
- `table_drop_event` (**custody only**)

…but it does **not** compute or expose:

- per-table shift rundown (opening, closing, fills, credits, drop, win/loss)
- pit/casino rollups for shift dashboards

This addendum extends the **Table Inventory Lifecycle** with a **read-model** layer that:

1. selects the correct window and snapshot boundaries deterministically
2. aggregates per-table inputs for the window
3. computes win/loss with a single sign convention
4. exposes table + rollups via RPC(s) for dashboards
5. **separates “operational estimates” from “accounting/statistical” results**

---

## Why this patch exists (the “drop vs buy-ins” reality)

Pit operations often use **buy-in telemetry** (rated buy-ins, observed buy-ins, player financial buy-ins) to understand “how the game is doing” mid-shift.

However, **drop amount** (used in the official statistical win / gross revenue formula) is a **count-defined** quantity. In practice:

- Buy-in telemetry is *provisional* and may exclude “grind” (small cash buy-ins that aren’t recorded).
- Drop custody events prove removal/chain-of-custody but do not contain value.
- Drop *amount* only exists once a count workflow records it.

Therefore, the read model provides **two parallel streams**:

- **Operational Estimate**: uses buy-in telemetry as `estimated_drop_*`
- **Statistical/Accounting**: uses count-based `drop_amount_cents`

Dashboards must **label** and **gate** these correctly.

---

## Glossary (read-model definitions)

- **Opening bankroll**: table inventory at the start boundary of the window.
- **Closing bankroll**: table inventory at the end boundary of the window.
- **Fill**: chips added to the table (value sent *to* table).
- **Credit**: chips removed from the table (value returned *to* cage).
- **Drop custody**: removal/securing of a drop box (chain-of-custody event).
- **Drop amount (physical)**: counted contents removed from the drop box (count-room result).
- **Estimated drop (telemetry)**: sum of buy-in telemetry events (rating slip / financial) used as an operational proxy.

> Critical distinction: **table_drop_event is custody-only** and MUST NOT be treated as “drop amount.”

---

## Canonical sign convention (single source of truth)

### Store events as absolute-positive amounts
- `fills_total` = SUM(fill.amount_cents) within window
- `credits_total` = SUM(credit.amount_cents) within window
- `opening_bankroll_total` / `closing_bankroll_total` = computed from snapshot.chipset (see Snapshot Totals)

---

## Win/loss outputs (dual-stream)

### A) MVP metric: inventory-based win/loss (no drop required)
This is the **tray delta** metric you can compute today:

```
win_loss_inventory =
  (closing_bankroll_total - opening_bankroll_total)
  + fills_total
  - credits_total
```

Interpretation: “What happened to the tray plus chip movements under custody controls.”

### B) Operational estimate: telemetry-based statistical win (uses estimated drop)
If you have buy-in telemetry (rating slip or player financial), compute an operational estimate:

```
win_loss_estimated =
  win_loss_inventory
  + estimated_drop_buyins
```

Where:

- `estimated_drop_buyins` = SUM(buy-in telemetry amount_cents) within window

This is the number pit bosses use for **live pacing**, and it is explicitly **ESTIMATE-grade**.

### C) Statistical/Accounting win: count-based (requires drop amount)
Once count integration exists (drop amount recorded):

```
win_loss_stat =
  win_loss_inventory
  + drop_amount_cents
```

This is **FINAL-grade** and used for shift close / official reporting.

---

## Read-model placement in the lifecycle

Add two phases to the Table Inventory Lifecycle:

### Phase 6 — Read-model aggregation (continuous during shift)
Dashboards may query metrics at any time:

- per-table partial metrics (tables can be open; closing may be missing)
- exception/quality flags (missing opening/closing, missing drop amount, low telemetry coverage)
- both estimate and final fields (final will be NULL until count exists)

### Phase 7 — Finalization semantics (end-of-shift)
Rundowns should not drift forever. For MVP (no new write required), define:

- `metric_grade = 'FINAL'` when:
  - opening snapshot exists in window, AND
  - closing snapshot exists in window, AND
  - drop_amount_cents exists in window (from count result)
- otherwise `metric_grade = 'ESTIMATE'`

Additionally:
- `is_final = (metric_grade = 'FINAL')`

> If casino policy allows “inventory-only close,” you may still report `win_loss_inventory` as final,
> but **must not** label it as statistical win. Keep grade semantics honest.

---

## Shift window sourcing (no shift table required)

### Supported window strategies

**Strategy A (recommended MVP): ad-hoc timestamps**
- RPC accepts `p_window_start`, `p_window_end`
- window sourced from UI selection / casino settings (shift schedule)

**Strategy B: shift_id lookup (if/when a shift table exists)**
- RPC accepts `p_shift_id`
- RPC looks up `{starts_at, ends_at}` from a minimal shift definition table in reporting/ops

---

## Snapshot totals (chipset JSONB)

### Current state
`table_inventory_snapshot` stores `chipset` JSONB, not `total_amount_cents`.

### MVP solutions
1. **Query-time aggregation**: compute `snapshot_total_cents` from `chipset` (or SQL helper).
2. **Schema addition**: add `total_amount_cents bigint` populated at write-time.

For MVP, prefer (1) to avoid migrations unless performance proves otherwise.

---

## Drop: custody vs amount vs estimated drop

### Custody (exists now)
`table_drop_event` proves custody and timing; it does not provide value.

### Count amount (later)
Introduce a count-result artifact:

- `table_drop_count_result` (or `soft_count_table_result`)
  - `casino_id`, `table_id`
  - `window_start`, `window_end` OR `shift_id`
  - `drop_amount_cents`
  - `counted_at`, `count_batch_id` (future)

### Estimated drop via `table_buyin_telemetry` (v0.4.0)

Unified telemetry table for all buy-in observations at the table level.

#### Schema: `table_buyin_telemetry`

```sql
CREATE TABLE table_buyin_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES casino(id),
  gaming_day date NOT NULL,
  table_id uuid NOT NULL REFERENCES gaming_table(id),

  -- Optional linkage (NULL for anonymous grind)
  visit_id uuid NULL REFERENCES visit(id),
  rating_slip_id uuid NULL REFERENCES rating_slip(id),

  -- Core telemetry
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  telemetry_kind text NOT NULL,  -- 'RATED_BUYIN' | 'GRIND_BUYIN'
  tender_type text NULL,         -- 'cash' | 'ticket' | 'marker' (optional)

  -- Audit
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL REFERENCES staff(id),
  note text NULL,

  -- Idempotency
  idempotency_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_idempotency UNIQUE (casino_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL
);

-- Indexes for shift metrics queries
CREATE INDEX idx_tbt_table_window ON table_buyin_telemetry (casino_id, table_id, occurred_at);
CREATE INDEX idx_tbt_gaming_day ON table_buyin_telemetry (casino_id, gaming_day, table_id);
CREATE INDEX idx_tbt_visit ON table_buyin_telemetry (casino_id, visit_id, occurred_at)
  WHERE visit_id IS NOT NULL;
```

#### Telemetry kinds

| Kind | Description | `visit_id` | `rating_slip_id` |
|------|-------------|------------|------------------|
| `RATED_BUYIN` | Buy-in for rated player at table | Required | Required |
| `GRIND_BUYIN` | Unrated/anonymous buy-in observed | NULL | NULL |

#### RPC: `rpc_log_table_buyin_telemetry`

```sql
rpc_log_table_buyin_telemetry(
  p_table_id uuid,
  p_amount_cents bigint,
  p_telemetry_kind text,
  p_visit_id uuid DEFAULT NULL,
  p_rating_slip_id uuid DEFAULT NULL,
  p_tender_type text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS table_buyin_telemetry
```

**ADR-024 compliant:**
- Uses `set_rls_context_from_staff()` for secure context injection
- Derives `casino_id`, `actor_id`, `gaming_day` from context (no spoofable params)

#### Why this replaces `player_financial_transaction` for telemetry

| Concern | `player_financial_transaction` | `table_buyin_telemetry` |
|---------|-------------------------------|------------------------|
| Table-scoped | Via JOIN to rating_slip | Direct `table_id` FK |
| Anonymous grind | Not supported (requires player_id) | Native support |
| Telemetry vs accounting | Mixed with cage transactions | Explicit telemetry-only |
| Shift metrics query | Complex JOIN path | Simple aggregate |

#### Telemetry quality with grind tracking

```sql
telemetry_quality = CASE
  WHEN grind_count > 0 THEN 'GOOD_COVERAGE'
  ELSE 'LOW_COVERAGE'
END

telemetry_notes = CASE
  WHEN grind_count > 0 THEN 'includes rated + grind buy-ins'
  ELSE 'grind buy-ins not tracked this shift'
END
```

> Important: Estimated drop is not a compliance-grade number. Treat as operational.

---

## RPC contract: `rpc_shift_table_metrics`

### Signatures
- `rpc_shift_table_metrics(p_window_start timestamptz, p_window_end timestamptz)`
- `rpc_shift_table_metrics(p_shift_id uuid)` (only if shift table exists)

### Output schema (per table)

Core:
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

Custody + movements:
- `fills_total_cents bigint not null default 0`
- `credits_total_cents bigint not null default 0`
- `drop_custody_present boolean not null`

Telemetry (operational estimate from `table_buyin_telemetry`):
- `estimated_drop_rated_cents bigint not null default 0`   -- RATED_BUYIN sum
- `estimated_drop_grind_cents bigint not null default 0`   -- GRIND_BUYIN sum
- `estimated_drop_buyins_cents bigint not null default 0`  -- total (rated + grind)
- `telemetry_quality text not null`   -- 'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE'
- `telemetry_notes text null`

Computed (MVP):
- `win_loss_inventory_cents bigint null`
- `win_loss_estimated_cents bigint null`
- `metric_grade text not null default 'ESTIMATE'`  -- always 'ESTIMATE' for MVP

Exceptions / flags:
- `missing_opening_snapshot boolean not null`
- `missing_closing_snapshot boolean not null`

--- DEFERRED (post-count-room) ---
- `drop_amount_cents bigint null`
- `win_loss_stat_cents bigint null`
- `is_final boolean not null`
- `missing_drop_amount boolean not null`

### Computation rules (MVP)
- If opening or closing snapshot missing → all win/loss fields NULL.
- Else:
  - compute `win_loss_inventory_cents = (closing - opening) + fills - credits`
  - compute `win_loss_estimated_cents = win_loss_inventory_cents + estimated_drop_buyins_cents`
- `metric_grade = 'ESTIMATE'` always (count room integration deferred)
- `telemetry_quality = 'LOW_COVERAGE'` always with note

---

## Rollups (pit and casino)

Provide rollups in SQL:

- `rpc_shift_pit_metrics(...)`
- `rpc_shift_casino_metrics(...)`

Rollups must include both estimate and final totals:

- `win_loss_inventory_total_cents`
- `win_loss_estimated_total_cents`
- `win_loss_stat_total_cents` (nullable until drop amounts exist)
- exception counts and grade counts:
  - `tables_grade_final`
  - `tables_grade_estimate`

---

## Open questions (must be settled)

### ✅ RESOLVED: Q1 — Telemetry source for `estimated_drop_buyins_cents`

> **SUPERSEDED by v0.4.0:** The canonical source is now `table_buyin_telemetry` which supports both rated and grind buy-ins. The decision below is retained for historical context.

**Original Decision:** `player_financial_transaction` with `direction = 'in'` is the canonical source.

**Rationale:**
- **Canonical financial record** — Already used in `visit_financial_summary` view for buy-in/cash-out tracking
- **Richer metadata** — Has `tender_type` (cash, marker) and `source` (pit, cage, system)
- **Consistent semantics** — `direction = 'in'` clearly means buy-in
- **Table mapping** — Same JOIN pattern as existing cash obs RPCs: `rating_slip_id → rating_slip.table_id`

**Alternatives considered:**
- `rating_slip`: Has `table_id` directly but **no buy-in amount field**
- `pit_cash_observation`: Currently only used for cash-OUT; would require scope expansion

**Query pattern:**
```sql
SELECT
  rs.table_id,
  SUM(pft.amount) FILTER (WHERE pft.direction = 'in') AS estimated_drop_buyins_cents
FROM player_financial_transaction pft
JOIN rating_slip rs ON pft.rating_slip_id = rs.id
WHERE pft.source = 'pit'  -- Q2: ensures rating_slip_id is always present
  AND pft.created_at >= p_window_start
  AND pft.created_at < p_window_end
GROUP BY rs.table_id
```

**Telemetry quality flags (always set):**
- `telemetry_source = 'player_financial'`
- `telemetry_quality = 'LOW_COVERAGE'`
- `telemetry_notes = 'excludes unrated buy-ins (grind)'`

---

### ✅ RESOLVED: Q2 — Table mapping reliability

> **SUPERSEDED by v0.4.0:** `table_buyin_telemetry` has direct `table_id` FK — no JOIN required. The analysis below informed the new design.


---

### ✅ RESOLVED: Q3 — Dashboard UX

**Decision:** MVP shows **estimate-only**. Final metrics require count room pipeline integration (out of scope).

**Rationale:**
- `win_loss_stat_cents` requires `drop_amount_cents` from count room
- Count room integration is a separate workstream
- Pit bosses need real-time pacing data (estimates); accounting reconciliation is post-shift

**MVP scope:**
- Show: `win_loss_inventory_cents`, `win_loss_estimated_cents`, `estimated_drop_buyins_cents`
- Hide/defer: `win_loss_stat_cents`, `drop_amount_cents`, `metric_grade='FINAL'`
- Always display `metric_grade='ESTIMATE'` badge on dashboard cards

---

### ✅ RESOLVED: Q4 — Telemetry quality determination

> **UPDATED in v0.4.0:** With grind tracking, quality is based on whether pit boss is actively logging grind buy-ins.

**Decision:** Telemetry quality is determined by grind tracking activity:

| Condition | `telemetry_quality` | `telemetry_notes` |
|-----------|---------------------|-------------------|
| `grind_count > 0` | `GOOD_COVERAGE` | "includes rated + grind buy-ins" |
| `grind_count = 0` | `LOW_COVERAGE` | "grind buy-ins not tracked this shift" |
| No telemetry at all | `NONE` | "no buy-in telemetry recorded" |

**Rationale:**
- If pit boss is actively logging grind, telemetry captures most table activity
- If grind is 0 all shift, that's suspicious → flag as `LOW_COVERAGE`
- Actual coverage ratio requires count room data (deferred)

**MVP implementation:**
```sql
telemetry_quality = CASE
  WHEN grind_total > 0 THEN 'GOOD_COVERAGE'
  WHEN rated_total > 0 THEN 'LOW_COVERAGE'
  ELSE 'NONE'
END
```

**Future enhancement (post-count-room):**
- Compare `estimated_drop_buyins_cents` vs `drop_amount_cents`
- Set `telemetry_quality = 'HIGH_COVERAGE'` if ratio > 90%, etc.

---

## Implementation checklist (MVP)

### Phase 1: Telemetry infrastructure
1. ☐ `table_buyin_telemetry` table migration
2. ☐ `rpc_log_table_buyin_telemetry(...)` — ADR-024 compliant logging RPC

### Phase 2: Read model helpers
3. ☐ `chipset_total_cents(jsonb)` — SQL helper for snapshot totals

### Phase 3: Shift metrics RPCs
4. ☐ `rpc_shift_table_metrics(p_window_start, p_window_end)` with:
   - `win_loss_inventory_cents` (tray delta + movements)
   - `estimated_drop_rated_cents` (RATED_BUYIN from telemetry)
   - `estimated_drop_grind_cents` (GRIND_BUYIN from telemetry)
   - `estimated_drop_buyins_cents` (total = rated + grind)
   - `win_loss_estimated_cents` (inventory + estimated drop)
   - `metric_grade = 'ESTIMATE'` always
   - `telemetry_quality` based on grind presence
5. ☐ `rpc_shift_pit_metrics(...)` — pit-level rollup
6. ☐ `rpc_shift_casino_metrics(...)` — casino-level rollup

### Phase 4: UI (separate workstream)
7. ☐ Table card "Log Grind" button (+$25, +$50, +$75, +$100, Custom)
8. ☐ Rating slip panel "Grind" button (optional, context-attached)
9. ☐ "Undo last grind" functionality

### Deferred (post-count-room integration)
- `table_drop_count_result` table
- `drop_amount_cents` field
- `win_loss_stat_cents` computation
- `metric_grade = 'FINAL'` logic
