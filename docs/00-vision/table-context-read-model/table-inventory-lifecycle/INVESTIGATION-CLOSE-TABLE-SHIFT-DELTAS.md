# INVESTIGATION: Close Table Workflow & Shift Delta Pipelines

**Date:** 2026-02-24
**Status:** Open
**Severity:** P1
**Bounded Context:** TableContextService (operational), CasinoService (temporal authority)
**Related Docs:**
- `GAP-TABLE-INVENTORY-LIFECYCLE.md` (parent gap doc)
- `ISSUE-SHIFT-DASH-WINLOSS-ZERO.md` (opening baseline issue)
- `PRD-036` (shift win/loss opening baseline)
- `PRD-031` (table inventory operational UI)
- `PRD-033` (cashier workflow MVP)
- `ADR-027` (table bank mode dual policy)
- `ADR-028` (table status standardization)

---

## 1. Investigation Scope

The close-table workflow is scrutinized because the system currently:
- **Computes** rundown on-the-fly but **never persists** it
- Has **no mid-shift checkpoint** mechanism for pit boss "since last check" deltas
- Feeds the shift dashboard via time-window RPCs that **lack opening baseline fallback** for new casinos
- Provides **no end-of-shift aggregate record** for accountability handoff between shifts

This investigation maps the current state, identifies missing data pipelines, and defines the two features needed: **shift rundown persistence** and **mid-shift delta checkpoints**.

---

## 2. Current Close Table Flow (As-Is)

### Session State Machine

```
ACTIVE ──→ RUNDOWN ──→ CLOSED
  │                       ▲
  └───────────────────────┘  (shortcut: ACTIVE → CLOSED allowed)
```

**Implementation:** `services/table-context/table-session.ts`

| Step | RPC | Service Function | What Happens |
|------|-----|-----------------|--------------|
| 1. Initiate rundown | `rpc_start_table_rundown` | `startTableRundown()` | Sets `rundown_started_at`, `rundown_started_by_staff_id`, status → RUNDOWN |
| 2. Count closing chips | `rpc_log_table_inventory_snapshot` | `logInventorySnapshot()` | Creates snapshot with `snapshot_type = 'close'` |
| 3. Post drop total | `rpc_post_table_drop_total` | `postDropTotal()` | Sets `table_session.drop_total_cents`, `drop_posted_at` |
| 4. Close session | `rpc_close_table_session` | `closeTableSession()` | Requires drop_event OR closing_inventory_snapshot; status → CLOSED |

### What's Missing at Close

| Gap | Description | Impact |
|-----|-------------|--------|
| **No rundown report row** | `rpc_compute_table_rundown` is ephemeral — returns JSON, never persists | No audit trail; supervisors can't review historical rundowns |
| **No session totals rollup** | `table_session` has `fills_total_cents`, `credits_total_cents`, `drop_total_cents` columns but they are **never updated** by the fill/credit/drop RPCs | Shift dashboard must recompute from raw events every poll cycle |
| **No shift-level summary** | No mechanism to aggregate all table rundowns into a pit/casino shift close record | Pit boss handoff has no canonical "shift totals" document |
| **No close-time win/loss stamp** | Win/loss is computed on demand but never stamped on `table_session` at close | Querying historical win/loss requires recomputation |

---

## 3. Data Pipeline Analysis

### Current Shift Dashboard Pipeline

```
table_inventory_snapshot ─┐
table_fill ───────────────┤
table_credit ─────────────┤──→ rpc_shift_table_metrics(window_start, window_end)
table_buyin_telemetry ────┤        │
gaming_table.par ─────────┘        ▼
                              Per-table metrics rows
                                   │
                                   ▼
                         services/table-context/shift-metrics/service.ts
                              (BFF aggregation: table → pit → casino)
                                   │
                                   ▼
                         GET /api/v1/shift-dashboards/summary
                                   │
                                   ▼
                         ShiftDashboardV3 UI (30s polling)
```

### Rundown Formula (ADR-027, canonical)

```
table_win = closing_bankroll + credits + drop - opening_bankroll - fills
```

- **Sign convention (PRD-036 fix):** `(closing - opening) - fills + credits`
- Returns `NULL` when `drop_posted_at IS NULL` (count pending)
- Provenance metadata tracks `opening_source`, `coverage_type`, `null_reasons`

### What the Dashboard Lacks

1. **Historical query**: Dashboard only shows live window metrics. No way to query "what was the win/loss for shift X last Tuesday?"
2. **Delta between points**: No "since last check" or "since shift start" comparison
3. **Running totals vs final**: Dashboard shows running totals (may change as fills/credits come in), but never stamps the "final" number at close

---

## 4. Feature A: Shift Rundown Persistence

### Problem

`rpc_compute_table_rundown` returns the correct formula result but discards it after the response. For regulatory compliance, audit trails, and shift handoff, the computed rundown must be persisted.

### Proposed Schema: `table_rundown_report`

```sql
CREATE TABLE table_rundown_report (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id               UUID NOT NULL REFERENCES casino(id),
  table_session_id        UUID NOT NULL REFERENCES table_session(id),
  gaming_table_id         UUID NOT NULL REFERENCES gaming_table(id),
  gaming_day              DATE NOT NULL,

  -- Snapshot references
  opening_snapshot_id     UUID REFERENCES table_inventory_snapshot(id),
  closing_snapshot_id     UUID REFERENCES table_inventory_snapshot(id),
  drop_event_id           UUID REFERENCES table_drop_event(id),

  -- Computed values (immutable after creation)
  opening_bankroll_cents  INTEGER,
  closing_bankroll_cents  INTEGER,
  fills_total_cents       INTEGER NOT NULL DEFAULT 0,
  credits_total_cents     INTEGER NOT NULL DEFAULT 0,
  drop_total_cents        INTEGER,
  table_win_cents         INTEGER,           -- NULL if drop not posted

  -- Provenance
  opening_source          TEXT NOT NULL,      -- 'snapshot:prior_count' | 'bootstrap:par_target' | 'fallback:earliest_in_window' | 'none'
  computation_grade       TEXT NOT NULL DEFAULT 'ESTIMATE', -- 'ESTIMATE' | 'AUTHORITATIVE'

  -- Variance
  par_target_cents        INTEGER,           -- Snapshot of need_total_cents at time of report
  variance_from_par_cents INTEGER,           -- closing_bankroll - par_target

  -- Metadata
  computed_by             UUID REFERENCES staff(id),
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at            TIMESTAMPTZ,       -- NULL until supervisor signs off
  finalized_by            UUID REFERENCES staff(id),
  notes                   TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: casino-scoped, same as table_session
-- Unique: one report per session
CREATE UNIQUE INDEX uq_rundown_report_session
  ON table_rundown_report (table_session_id);
```

### Persistence Trigger Points

| Trigger | Mechanism | Notes |
|---------|-----------|-------|
| **Session close** | `rpc_close_table_session` calls `rpc_compute_table_rundown` internally and INSERT result | Primary path — automatic |
| **Manual compute** | Pit boss triggers from RundownSummaryPanel "Save Report" action | Allows preview before close |
| **Re-compute** | If fill/credit arrives after initial computation, allows UPDATE (before finalization) | Guarded: rejected after `finalized_at IS NOT NULL` |

### Session Totals Denormalization

The `table_session` columns `fills_total_cents`, `credits_total_cents` should be kept in sync via triggers or RPC-side updates:

```sql
-- On rpc_request_table_fill INSERT:
UPDATE table_session
SET fills_total_cents = fills_total_cents + p_amount_cents
WHERE id = v_session_id;

-- On rpc_request_table_credit INSERT:
UPDATE table_session
SET credits_total_cents = credits_total_cents + p_amount_cents
WHERE id = v_session_id;
```

This removes the need for the shift metrics RPC to SUM from raw events on every call.

---

## 5. Feature B: Mid-Shift Delta Checkpoints

### Problem

A pit boss walking the floor needs "what changed since I last looked?" Comparing current running totals to the prior check is a common operational pattern. Today, the shift dashboard shows only absolute values for the current window — no "since last checkpoint" comparison.

### Concept: `shift_checkpoint`

A checkpoint captures a point-in-time snapshot of aggregated metrics. Deltas are computed as `current_metrics - last_checkpoint_metrics`.

### Proposed Schema: `shift_checkpoint`

```sql
CREATE TABLE shift_checkpoint (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id                 UUID NOT NULL REFERENCES casino(id),
  checkpoint_type           TEXT NOT NULL CHECK (checkpoint_type IN ('mid_shift', 'end_of_shift', 'handoff')),
  checkpoint_scope          TEXT NOT NULL CHECK (checkpoint_scope IN ('table', 'pit', 'casino')),

  -- Scope identifiers (nullable based on scope)
  gaming_table_id           UUID REFERENCES gaming_table(id),
  pit_id                    UUID,              -- No FK (pit is a grouping concept on gaming_table)

  -- Metric snapshot at checkpoint time
  window_start              TIMESTAMPTZ NOT NULL,
  window_end                TIMESTAMPTZ NOT NULL,  -- = checkpoint timestamp
  win_loss_cents            INTEGER,
  fills_total_cents         INTEGER NOT NULL DEFAULT 0,
  credits_total_cents       INTEGER NOT NULL DEFAULT 0,
  drop_total_cents          INTEGER,
  tables_active             INTEGER NOT NULL DEFAULT 0,
  tables_with_coverage      INTEGER NOT NULL DEFAULT 0,

  -- Buy-in telemetry snapshot
  rated_buyin_cents         INTEGER NOT NULL DEFAULT 0,
  grind_buyin_cents         INTEGER NOT NULL DEFAULT 0,

  -- Cash observation snapshot
  cash_out_observed_cents   INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_by                UUID REFERENCES staff(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes                     TEXT
);

-- Index for "latest checkpoint" lookup
CREATE INDEX idx_shift_checkpoint_latest
  ON shift_checkpoint (casino_id, checkpoint_scope, created_at DESC);

-- Index for pit-scoped queries
CREATE INDEX idx_shift_checkpoint_pit
  ON shift_checkpoint (casino_id, pit_id, created_at DESC)
  WHERE pit_id IS NOT NULL;
```

### Delta Computation Pattern

```
delta_win_loss = current.win_loss_cents - last_checkpoint.win_loss_cents
delta_fills   = current.fills_total     - last_checkpoint.fills_total
delta_credits = current.credits_total   - last_checkpoint.credits_total
...
```

### API Surface

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/shift-checkpoints` | POST | Create checkpoint (captures current metrics snapshot) |
| `/api/v1/shift-checkpoints/latest` | GET | Get most recent checkpoint for scope |
| `/api/v1/shift-checkpoints/delta` | GET | Compute delta: current metrics vs. last checkpoint |
| `/api/v1/shift-checkpoints` | GET | List checkpoints for current gaming day |

### UI Integration Points

| Component | Enhancement |
|-----------|------------|
| `ShiftDashboardV3` toolbar | "Checkpoint" button — captures current state as mid-shift checkpoint |
| `HeroWinLossCompact` | Delta badge: "+$2,400 since last check" below the main win/loss figure |
| `MetricsTable` | Delta column: shows per-table/pit change since last checkpoint |
| New: `CheckpointHistoryDrawer` | Timeline of checkpoints with deltas between consecutive checkpoints |

### End-of-Shift Workflow

```
1. Pit boss triggers "End of Shift" from dashboard
2. System creates checkpoint_type = 'end_of_shift', scope = 'casino'
3. For each active table:
   a. If session is ACTIVE → prompt rundown (or auto-compute if closing)
   b. Persist table_rundown_report
4. Aggregate all table reports into shift_checkpoint (casino-level)
5. Generate shift summary for supervisor handoff
6. Next shift opens with this checkpoint as the baseline
```

---

## 6. Cross-Feature Dependencies

```
Feature A: Rundown Persistence          Feature B: Mid-Shift Deltas
─────────────────────────────          ────────────────────────────
table_rundown_report table             shift_checkpoint table
  │                                      │
  ├── rpc_persist_table_rundown          ├── rpc_create_shift_checkpoint
  ├── rpc_finalize_rundown               ├── rpc_get_checkpoint_delta
  ├── Service: rundown persistence       ├── Service: checkpoint CRUD
  ├── Hook: usePersistRundown            ├── Hook: useShiftCheckpoint
  └── UI: Save/Finalize in panel         └── UI: Checkpoint button + delta badges
                │                                    │
                └──── Both feed ─────────────────────┘
                          │
                          ▼
                 End-of-Shift Aggregate
                 (shift_checkpoint type='end_of_shift'
                  with all table_rundown_report summaries)
```

### Prerequisite Fixes (from ISSUE-SHIFT-DASH-WINLOSS-ZERO)

These must land before or alongside the new features:

| # | Fix | Status |
|---|-----|--------|
| 1 | `total_cents` populated on `table_inventory_snapshot` | Open — RPC never sets it |
| 2 | `rpc_compute_table_rundown` JSON parsing bug | Open — expects wrong chipset format |
| 3 | `session_id` linked on inventory snapshots | Open — RPC never sets FK |
| 4 | Legacy chip custody RPCs upgraded to ADR-024 | Open — security gap |
| 5 | Opening baseline cascade (PRD-036) | Partially implemented |
| 6 | `formatCents(null)` → "$0" coalescing | Open — UI shows $0 instead of N/A |

---

## 7. Bounded Context Ownership

Per SRM v4.15.0:

| Artifact | Owner | Rationale |
|----------|-------|-----------|
| `table_rundown_report` | **TableContextService** | Operational record of rundown computation |
| `shift_checkpoint` | **TableContextService** | Operational metrics snapshot (no monetary ledger) |
| Session totals triggers | **TableContextService** | Owns `table_session`, `table_fill`, `table_credit` |
| End-of-shift workflow | **TableContextService** | Orchestrates session close + checkpoint |
| Gaming day boundary | **CasinoService** (read-only) | `casino_settings.gaming_day_start_time` |
| Shift dashboard consumption | **TableContextService / shift-metrics** | BFF aggregation layer |

---

## 8. Security Model

Both new tables follow the existing TableContext RLS pattern:

- Casino-scoped: `casino_id` column with Pattern C hybrid policy
- Write operations via SECURITY DEFINER RPCs with `set_rls_context_from_staff()` (ADR-024)
- Role gates: `pit_boss` and `admin` for checkpoint creation; `admin` only for rundown finalization
- Finalization is irreversible: `finalized_at` once set cannot be modified (immutable guard in RPC)

---

## 9. Implementation Priority

### Phase 1: Rundown Persistence (P1)

1. Create `table_rundown_report` table + RLS policies
2. Create `rpc_persist_table_rundown` (compute + INSERT)
3. Modify `rpc_close_table_session` to auto-persist rundown on close
4. Add session totals triggers (fills/credits sync)
5. Service + hook + UI: "Save Report" action in RundownSummaryPanel
6. Fix prerequisite bugs (#1-3 from ISSUE doc)

### Phase 2: Mid-Shift Checkpoints (P1)

1. Create `shift_checkpoint` table + RLS policies
2. Create `rpc_create_shift_checkpoint` (snapshot current metrics)
3. Create `rpc_get_checkpoint_delta` (compute diff from last checkpoint)
4. Service + hook: checkpoint CRUD
5. UI: Checkpoint button in dashboard toolbar
6. UI: Delta badges in HeroWinLossCompact and MetricsTable

### Phase 3: End-of-Shift Aggregate (P2)

1. End-of-shift workflow orchestration
2. Checkpoint history timeline UI
3. Shift handoff report generation
4. Cross-shift comparison view

---

## 10. Open Questions

1. Should `table_rundown_report` support re-computation (UPDATE) or be append-only with versioning?
2. Should mid-shift checkpoints auto-create on a timer (e.g., every 2 hours) or be purely manual?
3. Should the end-of-shift aggregate wait for all tables to close, or allow partial shift close?
4. Should `shift_checkpoint` capture per-table breakdowns inline (JSONB) or reference `table_rundown_report` rows?
5. What is the retention policy for checkpoints? (Gaming regulators may require 5+ years.)
6. Should finalization require dual sign-off (computed_by != finalized_by)?
