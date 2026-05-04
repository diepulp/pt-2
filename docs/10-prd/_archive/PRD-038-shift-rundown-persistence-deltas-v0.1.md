---
prd_id: PRD-038
title: "Shift Rundown Persistence & Mid-Shift Delta Checkpoints"
status: draft
version: "0.3.0"
date: 2026-02-24
author: lead-architect
priority: P1
category: FEATURE
bounded_contexts:
  - TableContextService
affected_adrs:
  - ADR-024 (Context Derivation)
  - ADR-027 (Table Bank Mode)
  - ADR-028 (Table Status Standardization)
dependencies:
  - "rpc_compute_table_rundown (exists — ADR-027 migration)"
  - "rpc_close_table_session (exists — session lifecycle migration)"
  - "rpc_shift_table_metrics (exists — PRD-036 opening baseline version)"
  - "table_session.fills_total_cents / credits_total_cents columns (exist — ADR-027 schema, never updated)"
triggering_issues:
  - "INVESTIGATION-CLOSE-TABLE-SHIFT-DELTAS (2026-02-24)"
  - "GAP-TABLE-INVENTORY-LIFECYCLE Gap #7 (rundown report persistence)"
  - "GAP-TABLE-INVENTORY-LIFECYCLE Gap #13 (shift-level rundown aggregation)"
feature_pipeline: shift-rundown-deltas
tags: [table-context, shift-metrics, rundown, accountability, checkpoint, delta, close-table]
---

# PRD-038: Shift Rundown Persistence & Mid-Shift Delta Checkpoints

## 1. Overview

**Owner:** TableContextService
**Status:** Draft v0.3.0

The table rundown computation (`rpc_compute_table_rundown`) produces the correct win/loss formula but discards the result after returning it. There is no audit trail for historical rundowns, no denormalized session totals for fast queries, and no mechanism for pit bosses to capture mid-shift snapshots for "what changed since I last looked" deltas.

This PRD delivers two capabilities: (A) automatic rundown persistence at session close with optional manual compute, and (B) mid-shift delta checkpoints that snapshot current shift metrics so the dashboard can display incremental changes.

---

## 2. Authoritative Contracts

These truth statements govern the feature. Ambiguities elsewhere in this PRD are resolved by this section.

### 2.1 Canonical Records

- `table_rundown_report` is the **canonical close-of-session record** once persisted. One row per `table_session_id` (UNIQUE).
- `shift_checkpoint` is the **canonical point-in-time metrics snapshot** for delta comparisons. Scoped by `checkpoint_scope` (casino / pit / table); MVP UI consumes casino-scope only.

### 2.2 Time Semantics

- **`gaming_day`** on both tables is **server-derived** via `compute_gaming_day(now(), casino_settings.gaming_day_start_time, casino_settings.timezone)`. Never client-supplied.
- **`window_start`** on `shift_checkpoint` defaults to the current gaming day start boundary. **`window_end`** = `now()` at capture time.
- Rundown `gaming_day` is derived from `table_session.opened_at` (session start determines which gaming day the table belongs to).

### 2.3 Null Semantics

- `table_win_cents` is **NULL** when `drop_total_cents` is NULL (count not posted). This is ADR-027 convention, not a bug.
- UI MUST render NULL win/loss as **"N/A"** (or "---"), never "$0". Tooltip MAY include `null_reason`.
- Checkpoint delta values are **NULL** when no prior checkpoint exists. Not zero.

### 2.4 Persistence Contract

- `rpc_close_table_session` persists the rundown report **inline, in the same database transaction**. The call returns only after the INSERT (or UPSERT) succeeds. There is no async pathway.
- **Implementation constraint:** This MUST be implemented inside the database function body (e.g., `rpc_close_table_session` calls `rpc_persist_table_rundown` as a nested SQL function call). It MUST NOT be implemented as a client-side sequence of two separate RPC calls. The atomicity guarantee depends on a single database transaction.
- If the report already exists (manual pre-persist during RUNDOWN phase), close performs an UPSERT: recompute and UPDATE the existing row.

### 2.5 Finalization Contract

- **Finalization applies to `table_rundown_report` only** — it is an immutability stamp on the report record. It does NOT introduce new session lifecycle states (RECONCILED/FINALIZED remain post-MVP per Gap #12).
- **Guard:** `rpc_finalize_rundown` SHALL require `table_session.status = 'CLOSED'`. Finalizing a report for an open/active/rundown session is rejected with `TABLE_RUNDOWN_SESSION_NOT_CLOSED`.
- **Irreversibility:** There is no "unfinalize" operation. Once `finalized_at` is set, it cannot be cleared. This is a non-goal for MVP.
- `finalized_at IS NOT NULL` → all UPDATE operations on that row are rejected by the RPC.
- Late events (fill/credit arriving after finalization) do NOT update the report. They are visible in raw event tables but the report is frozen. Exception records are a post-MVP concern.

### 2.6 Rundown Report Mutability Contract

**Before finalization (`finalized_at IS NULL`):**
- `rpc_persist_table_rundown` is an **UPSERT** keyed on `(table_session_id)`.
- All computed fields are recalculated deterministically from current source data (snapshots, fills, credits, drop).
- `computed_at` updates to `now()`. `computed_by` updates to the current actor.
- Provenance fields (`opening_source`, `computation_grade`) are recomputed.

**After finalization (`finalized_at IS NOT NULL`):**
- All UPDATE attempts are rejected with `TBLRUN_ALREADY_FINALIZED` (409).
- No fields are modifiable. The report is a frozen audit record.

---

## 3. Problem & Goals

### 3.1 Problem

1. **No audit trail:** When a table session closes, the rundown (win/loss, fills, credits, drop, opening/closing bankroll) is computed on-the-fly and never stored. Supervisors cannot review historical rundowns, and regulatory auditors have no canonical close-of-table record.

2. **Session totals are stale:** `table_session` has `fills_total_cents` and `credits_total_cents` columns (ADR-027 schema) but they are **never updated** by the fill/credit RPCs. The shift dashboard must recompute totals from raw events every 30-second poll cycle.

3. **No mid-shift comparison:** The shift dashboard shows absolute values for the current time window. A pit boss walking the floor has no "since my last check" frame of reference — every glance shows the cumulative picture with no delta.

4. **No shift handoff record:** When shifts change, there is no aggregate "here's what the shift produced" summary for the incoming supervisor. The outgoing boss must verbally communicate or the incoming boss must read the live dashboard cold.

### 3.2 Goals

| # | Goal | Observable Outcome |
|---|------|--------------------|
| G1 | Rundown persistence | `rpc_close_table_session` returns only after a `table_rundown_report` row has been inserted (or upserted) in the same transaction |
| G2 | Session totals sync | `table_session.fills_total_cents` and `credits_total_cents` are updated atomically in the same RPC transaction that creates the fill/credit |
| G3 | Mid-shift checkpoints | Pit boss can tap "Checkpoint" on the shift dashboard to freeze current metrics as a checkpoint row |
| G4 | Delta display | After a checkpoint exists, the shift dashboard hero card displays "+/-$X since HH:MM" delta values (casino-scope); per-table/per-pit deltas are computed live at render-time by subtracting the checkpoint's baseline window metrics |
| G5 | Historical query | Closed session rundown reports are queryable by `gaming_day` and `casino_id` |

### 3.3 Non-Goals

- **Soft count evidence manifest** — No `soft_count_table_result` table; `drop_total_cents` posting via `rpc_post_table_drop_total` remains the MVP workaround
- **Reconciliation exception framework** — No variance tolerance engine; no `reconciliation_exception` table (Gap #11)
- **RECONCILED / FINALIZED session states** — Session lifecycle stays 4-state (OPEN/ACTIVE/RUNDOWN/CLOSED). Report finalization is a stamp on `table_rundown_report`, not a session state. (Gap #12)
- **Auto-scheduled checkpoints** — Checkpoints are manual (pit boss initiated); timer-based auto-checkpoint deferred
- **Cross-shift comparison views** — "This shift vs last shift" comparison is deferred; this scope delivers checkpoint-to-checkpoint deltas within a single shift
- **Legacy chip custody RPC ADR-024 migration** — The 4 legacy RPCs (Gap #4) are a separate security remediation scope
- **Per-pit / per-table checkpoint UI** — Schema supports all scopes; MVP UI consumes casino-scope checkpoints only. Per-table/per-pit deltas in MetricsTable are computed live (current metrics minus checkpoint baseline), not stored per-scope rows
- **Late-event exception records** — Events arriving after report finalization are visible in raw tables but do not update the frozen report. Structured exception records are post-MVP
- **Unfinalize** — Once a report is finalized, there is no reversal mechanism in MVP. If a report is finalized incorrectly, a new manual process must be defined post-MVP

## 4. Users & Use Cases

| User | Role | Top Jobs |
|------|------|----------|
| Pit Boss | pit_boss | Close a table and have the rundown automatically recorded; checkpoint the shift to track deltas; hand off shift with a summary |
| Floor Supervisor | admin | Review historical rundown reports for auditing; finalize rundown reports; query shift history |
| Casino Operator | admin | View aggregated shift accountability; ensure regulatory compliance with persisted records |

**Top Jobs:**

- As a **Pit Boss**, I need the table rundown to be saved when I close a session so that I have an audit trail of the table's win/loss.
- As a **Pit Boss**, I need to snapshot the current shift state so that when I check back later I can see what changed.
- As a **Floor Supervisor**, I need to query historical rundown reports by gaming day so that I can review accountability for any past shift.
- As a **Floor Supervisor**, I need to finalize a rundown report to lock it from further modification so that the audit record is tamper-evident.

## 5. Scope & Feature List

### 5.1 In Scope

**Rundown Persistence:**
1. `table_rundown_report` table with casino-scoped RLS
2. `rpc_persist_table_rundown` — compute + UPSERT rundown report (keyed on `table_session_id`)
3. Auto-persist inline in `rpc_close_table_session` (same transaction, synchronous)
4. Manual "Save Report" action in RundownSummaryPanel (preview before close; creates pre-close report)
5. Session totals sync via RPC-side atomic update (same transaction as fill/credit INSERT)
6. `rpc_finalize_rundown` — stamp `finalized_at`/`finalized_by`, reject future updates
7. Service layer: CRUD + DTOs + hooks
8. API routes: POST persist, PATCH finalize, GET by session/gaming-day

**Mid-Shift Checkpoints:**
9. `shift_checkpoint` table with `checkpoint_scope` (casino/pit/table), `pit_id`, `gaming_table_id` — schema future-proofed; MVP UI consumes casino-scope only
10. `rpc_create_shift_checkpoint` — snapshot current `rpc_shift_table_metrics` results with server-derived `gaming_day`
11. Delta computation: current metrics minus last checkpoint (casino-scope hero delta; per-table/per-pit deltas computed live at render-time)
12. Service layer: checkpoint CRUD + delta computation
13. API routes: POST create, GET latest, GET delta, GET list
14. UI: "Checkpoint" button in shift dashboard toolbar
15. UI: Delta badge in HeroWinLossCompact ("+$X since HH:MM")

### 5.2 Out of Scope

- End-of-shift orchestration workflow (prompting all tables to close)
- Checkpoint history timeline/drawer UI
- Shift handoff report generation (PDF/print)
- Per-pit / per-table checkpoint UI (schema ready, UI deferred)
- Checkpoint retention policy enforcement (no TTL/purge)
- Async persistence pathways (outbox, workers)
- Late-event exception record creation

## 6. Requirements

### 6.1 Functional Requirements

| # | Requirement | Rationale |
|---|-------------|-----------|
| FR-1 | `rpc_close_table_session` SHALL persist the rundown report **inline in the same database transaction**. The RPC returns only after the UPSERT succeeds. | Synchronous contract — no async ambiguity |
| FR-2 | `rpc_persist_table_rundown` SHALL be an **UPSERT** keyed on `(table_session_id)`. If a row exists and `finalized_at IS NULL`, it updates all computed fields. If `finalized_at IS NOT NULL`, it raises `TBLRUN_ALREADY_FINALIZED`. | Supports both manual pre-persist and auto-persist at close |
| FR-3 | The rundown report SHALL include: `opening_bankroll_cents`, `closing_bankroll_cents`, `fills_total_cents`, `credits_total_cents`, `drop_total_cents`, `table_win_cents` (computed), `opening_source` (provenance), `computation_grade`, `par_target_cents`, `variance_from_par_cents` | Complete accountability record |
| FR-4 | `table_win_cents` SHALL be NULL when `drop_total_cents` is NULL (count not posted) | ADR-027 convention |
| FR-5 | A `table_rundown_report` with `finalized_at IS NOT NULL` SHALL reject all UPDATE operations | Tamper-evident audit record |
| FR-6 | Fill/credit RPCs SHALL atomically update `table_session.fills_total_cents` / `credits_total_cents` **in the same transaction** that INSERTs the fill/credit row. The RPC resolves `table_session_id` via the unique active session index and writes `session_id` onto the fill/credit row. | RPC-side update, not trigger; deterministic session resolution via unique index |
| FR-7 | `rpc_create_shift_checkpoint` SHALL snapshot current `rpc_shift_table_metrics` results into a `shift_checkpoint` row | Point-in-time metrics freeze |
| FR-8 | Checkpoint delta SHALL be computed as `current_metric - last_checkpoint_metric` for all numeric fields | Consistent delta semantics |
| FR-9 | When no prior checkpoint exists, delta values SHALL be NULL (not zero) | Prevents misleading "no change" interpretation |
| FR-10 | One rundown report per session (UNIQUE on `table_session_id`) | Prevents duplicate reports |
| FR-11 | Rundown reports SHALL be queryable by `gaming_day` and `casino_id` | Audit and reporting use case |
| FR-12 | `gaming_day` on `table_rundown_report` SHALL be derived from the session's `opened_at` timestamp using `casino_settings.gaming_day_start_time` and `casino_settings.timezone`. Never client-supplied. | Authoritative temporal derivation |
| FR-13 | `gaming_day` on `shift_checkpoint` SHALL be derived server-side via `compute_gaming_day(now(), casino_settings)`. `window_start` defaults to gaming day start; `window_end` = `now()` at capture time. Never client-supplied. | Prevents gaming day drift bugs |
| FR-14 | Fill/credit RPCs SHALL write `session_id` onto the `table_fill` / `table_credit` row, resolved via the unique active session index `(casino_id, gaming_table_id) WHERE status IN ('ACTIVE','RUNDOWN')`. If no active session exists, `session_id` is NULL. | Deterministic FK linkage, no guessing |
| FR-15 | If `formatCents(null)` currently renders "$0", UI MUST render "N/A" or "---". Tooltip MAY include the `null_reason` from provenance metadata. | Stop lying about missing data (see Gating Bugs) |
| FR-16 | `rpc_finalize_rundown` SHALL require `table_session.status = 'CLOSED'`. Attempts to finalize a report for a non-closed session are rejected with `TABLE_RUNDOWN_SESSION_NOT_CLOSED`. | Prevents premature finalization of in-progress sessions |
| FR-17 | `shift_checkpoint.pit_id` MUST be NULL in MVP. The Pit entity does not exist as a first-class table; `pit_id` on `gaming_table` is a text label, not a UUID FK. Column is reserved for vNext. | Prevents garbage UUIDs in a column with no referential integrity |
| FR-18 | Per-table/per-pit deltas in the UI SHALL be computed by re-querying `rpc_shift_table_metrics(window_start, checkpoint.window_end)` and subtracting from the current query. The RPC is deterministic for historical ranges. | Avoids storing per-table snapshots in checkpoint; leverages existing RPC capability |

### 6.2 Non-Functional Requirements

| # | Requirement |
|---|-------------|
| NFR-1 | Session totals update MUST use atomic `UPDATE ... SET col = col + amount` within the fill/credit RPC transaction to prevent race conditions |
| NFR-2 | Checkpoint creation MUST complete in < 2s (calls `rpc_shift_table_metrics` internally + INSERT) |
| NFR-3 | All new RPCs MUST use `set_rls_context_from_staff()` (ADR-024) |
| NFR-4 | All new tables MUST have casino-scoped Pattern C hybrid RLS policies |
| NFR-5 | No SECURITY DEFINER triggers for session totals — all updates go through RPCs |

### References (not duplicated)

- **SRM:** TableContextService owns `table_session`, chip custody tables, shift metrics RPC
- **ADR-024:** Context derivation pattern for all RPCs
- **ADR-027:** Rundown formula, par columns, table_bank_mode, session totals columns
- **ADR-028:** Session lifecycle states (OPEN/ACTIVE/RUNDOWN/CLOSED)
- **Investigation:** `docs/issues/gaps/table-inventory-lifecycle/INVESTIGATION-CLOSE-TABLE-SHIFT-DELTAS.md`

## 7. UX / Flow Overview

### Flow 1: Close Table — Synchronous Rundown Persist

1. Pit boss initiates rundown on table BJ-01 (session → RUNDOWN)
2. Pit boss counts closing chip tray → closing snapshot created
3. Pit boss posts drop total → `drop_posted_at` set
4. Pit boss closes session → `rpc_close_table_session` fires
5. **Inside the same transaction:** RPC computes rundown, UPSERTs `table_rundown_report` row
6. RPC returns success — report is guaranteed persisted
7. RundownSummaryPanel shows persisted values with "Report saved" confirmation

### Flow 2: Manual Rundown Preview (Before Close)

1. Pit boss is in RUNDOWN phase, wants to preview numbers before closing
2. Pit boss taps "Save Report" in RundownSummaryPanel
3. System calls `rpc_persist_table_rundown` → report UPSERTED (session still RUNDOWN)
4. Late fill/credit arrives → fill RPC atomically updates `table_session.fills_total_cents`
5. When session closes, `rpc_close_table_session` re-computes and UPSERTs the existing report with fresh values
6. `computed_at` and `computed_by` update; provenance recomputed

### Flow 3: Mid-Shift Checkpoint (Casino Scope)

1. Pit boss views shift dashboard showing casino win/loss at $12,400
2. Pit boss taps "Checkpoint" button in toolbar
3. System calls `rpc_create_shift_checkpoint` with `checkpoint_scope = 'casino'`
4. RPC internally calls `rpc_shift_table_metrics`, snapshots results, derives `gaming_day` server-side
5. Dashboard shows "Checkpointed at 10:15 PM" confirmation
6. 45 minutes later, pit boss returns — hero card shows:
   - Casino Win/Loss: $15,800
   - Delta badge: "+$3,400 since 10:15 PM"
7. MetricsTable computes per-table deltas live: `current_table_metric - table_metric_at(checkpoint.window_end)`

### Flow 4: Supervisor Finalizes Rundown Report

1. Floor supervisor reviews closed session's rundown report
2. Confirms values are correct, taps "Finalize"
3. System stamps `finalized_at` and `finalized_by` via `rpc_finalize_rundown`
4. Report is now immutable — further modifications rejected with 409
5. If a late fill arrives after finalization, it appears in raw `table_fill` events but does NOT update the frozen report

## 8. Dependencies & Risks

### 8.1 Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| `rpc_compute_table_rundown` (ADR-027) | Implemented (ephemeral) | Core formula — persistence wraps this |
| `rpc_close_table_session` (session lifecycle) | Implemented | Must be extended to inline-persist rundown |
| `rpc_shift_table_metrics` (PRD-036) | Implemented | Checkpoint reads from this |
| `table_session` totals columns (ADR-027 schema) | Schema exists, never updated | Fill/credit RPCs must be modified |
| PRD-036 opening baseline (provenance) | Partially implemented | Rundown report captures `opening_source` |
| `chipset_total_cents()` SQL function | Implemented | Used by rundown computation |
| `unique_active_session_per_table` index | Implemented | Deterministic session resolution — see §8.1.1 |

### 8.1.1 Critical Index Dependency

Fill/credit RPCs depend on this unique partial index for deterministic session resolution:

```sql
-- From migration 20260115025236_table_session_lifecycle.sql
CREATE UNIQUE INDEX unique_active_session_per_table
  ON table_session (casino_id, gaming_table_id)
  WHERE status IN ('OPEN', 'ACTIVE', 'RUNDOWN');
```

**The DB constraint is the authority.** The RPC relies on this index to guarantee exactly 0 or 1 row from the session lookup (no `LIMIT 1` needed). If this index is ever dropped or modified, FR-6 and FR-14 break silently.

### 8.1.2 Delta Window Contract

Per-table/per-pit deltas in the MetricsTable are computed using **Option B: deterministic re-query**.

`rpc_shift_table_metrics(p_window_start, p_window_end)` accepts arbitrary `timestamptz` parameters and is confirmed deterministic for historical ranges (verified in migration `20260219002247_enable_adjustment_telemetry.sql`). No "current shift" hard-coding exists.

**Delta computation at render-time:**

```
checkpoint_metrics = rpc_shift_table_metrics(window_start, checkpoint.window_end)
current_metrics    = rpc_shift_table_metrics(window_start, now())
delta              = current_metrics - checkpoint_metrics    (per table/pit/casino)
```

The BFF service layer performs both calls and computes the diff. The checkpoint row stores only the casino-scope aggregate; per-table granularity comes from the re-query. This avoids storing per-table snapshots in `shift_checkpoint` while still supporting per-table delta display.

**Determinism guarantee:** Given the same `window_start` and `window_end`, the RPC returns identical results. Fill/credit/snapshot rows are immutable once written (append-only tables). The only source of non-determinism would be a late INSERT between the checkpoint capture and the delta re-query — which is expected and correct (the delta reflects actual changes).

### 8.2 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Concurrent fill + close race condition | Medium | Session totals use atomic `col = col + amount` inside RPC transaction; rundown computes from totals at close time within the same transaction |
| Checkpoint performance under large table counts | Low | `rpc_shift_table_metrics` already < 500ms in production; checkpoint adds INSERT overhead only |
| `rpc_close_table_session` latency increase from inline persist | Low | Rundown computation is a single SQL CTE query + INSERT — measured overhead expected < 20ms. No 50ms NFR imposed; correctness over speed. |

## 9. Definition of Done (DoD)

### Gating Bugs (MUST be green before ship)

These are blocking defects from `ISSUE-SHIFT-DASH-WINLOSS-ZERO.md` and `GAP-TABLE-INVENTORY-LIFECYCLE.md`. They are not risks — they are prerequisites.

- [ ] **GB-1:** `table_inventory_snapshot.session_id` consistently populated by RPCs that create snapshots (Gap #3)
- [ ] **GB-2:** `rpc_compute_table_rundown` chipset JSON parsing fixed — handle `{"1": 10}` format, not just `{"1": {"count": 10}}` (Gap #2)
- [ ] **GB-3:** `table_inventory_snapshot.total_cents` populated on INSERT, OR `rpc_persist_table_rundown` exclusively uses `chipset_total_cents()` (Gap #1 — pick one, document which)
- [ ] **GB-4:** `formatCents(null)` returns "---" or "N/A", not "$0", across all callsites (PRD-036 WS3)
- [ ] **GB-5:** Opening baseline cascade returns correct `opening_source` provenance (PRD-036 WS1)

### Functionality

- [ ] `rpc_close_table_session` returns only after `table_rundown_report` row is persisted (same transaction)
- [ ] `rpc_persist_table_rundown` performs UPSERT by `(table_session_id)` — INSERT on first call, UPDATE on subsequent (before finalization)
- [ ] `table_rundown_report` contains: opening_bankroll, closing_bankroll, fills_total, credits_total, drop_total, table_win, opening_source, computation_grade, par_target, variance_from_par
- [ ] `table_win_cents` is NULL when `drop_total_cents` is NULL
- [ ] Finalized reports reject UPDATE with `TABLE_RUNDOWN_ALREADY_FINALIZED` (409)
- [ ] Finalization rejected when `table_session.status != 'CLOSED'` with `TABLE_RUNDOWN_SESSION_NOT_CLOSED` (400)
- [ ] "Checkpoint" button creates a `shift_checkpoint` row with server-derived `gaming_day`
- [ ] Casino-scope delta values display in hero card after checkpoint exists
- [ ] Session totals (`fills_total_cents`, `credits_total_cents`) update atomically in the fill/credit RPC transaction
- [ ] Fill/credit RPCs write `session_id` FK onto event rows

### Data & Integrity

- [ ] One rundown report per session (UNIQUE constraint enforced; UPSERT, not duplicate)
- [ ] Rundown formula matches canonical: `win = closing + credits + drop - opening - fills`
- [ ] Session totals match `SUM(amount_cents)` of actual fills/credits (verified by test)
- [ ] Checkpoint `gaming_day` matches `compute_gaming_day(checkpoint.created_at, casino_settings)` (server-derived, not client)
- [ ] Checkpoint `window_start` = gaming day start boundary; `window_end` = capture timestamp
- [ ] `computed_at` updates on UPSERT; `computed_by` updates to current actor

### Security & Access

- [ ] Both new tables have casino-scoped Pattern C hybrid RLS policies
- [ ] All new RPCs use `set_rls_context_from_staff()` (ADR-024)
- [ ] Rundown persist/finalize restricted to `pit_boss`, `admin` roles
- [ ] Checkpoint creation restricted to `pit_boss`, `admin` roles
- [ ] No SECURITY DEFINER triggers — all session totals updates via RPC-side logic

### Testing

- [ ] RPC test: close session → rundown report row exists with correct values (synchronous, same transaction)
- [ ] RPC test: close session when pre-close report exists → UPSERT updates existing row
- [ ] RPC test: finalized report rejects UPDATE with correct error code
- [ ] RPC test: fill creation → `table_session.fills_total_cents` incremented AND `table_fill.session_id` set
- [ ] RPC test: credit creation → `table_session.credits_total_cents` incremented AND `table_credit.session_id` set
- [ ] RPC test: concurrent fills on same session → totals are correct (no lost updates)
- [ ] RPC test: checkpoint creation → row with matching metrics and correct `gaming_day`
- [ ] RPC test: delta computation → correct difference from last checkpoint
- [ ] RPC test: delta with no prior checkpoint → NULL deltas (not zero)
- [ ] RPC test: finalize with session still ACTIVE/RUNDOWN → rejected with `TABLE_RUNDOWN_SESSION_NOT_CLOSED`
- [ ] RPC test: re-query `rpc_shift_table_metrics` with checkpoint's `window_end` → deterministic, matches snapshot
- [ ] Integration test: close session → query report by `gaming_day` → found
- [ ] UI test: win/loss NULL renders "N/A", not "$0"

### Operational Readiness

- [ ] Migrations pass `npm run db:types-local` and `npm run type-check`
- [ ] All new RPCs return structured error codes per SRM taxonomy
- [ ] Checkpoint query indexed for fast "latest" lookup (`casino_id, created_at DESC`)

### Documentation

- [ ] `TableRundownReportDTO` and `ShiftCheckpointDTO` documented in service DTOs
- [ ] SRM updated with new tables (`table_rundown_report`, `shift_checkpoint`) in TableContextService ownership
- [ ] Investigation doc status updated

## 10. Related Documents

| Document | Relationship |
|----------|-------------|
| `docs/issues/gaps/table-inventory-lifecycle/INVESTIGATION-CLOSE-TABLE-SHIFT-DELTAS.md` | Triggering investigation |
| `docs/issues/gaps/table-inventory-lifecycle/GAP-TABLE-INVENTORY-LIFECYCLE.md` | Parent gap doc (Gaps #7, #13) |
| `docs/issues/gaps/table-inventory-lifecycle/ISSUE-SHIFT-DASH-WINLOSS-ZERO.md` | Related issue (gating bugs GB-1 through GB-5) |
| `docs/10-prd/PRD-036-shift-winloss-opening-baseline-v0.1.md` | Prerequisite — opening baseline provenance |
| `docs/80-adrs/ADR-027-table-bank-mode-dual-policy.md` | Rundown formula, par columns, session totals schema |
| `docs/80-adrs/ADR-028-table-status-standardization.md` | Session lifecycle states |
| `docs/80-adrs/ADR-024_DECISIONS.md` | RPC context derivation pattern |
| `docs/20-architecture/specs/shift-rundown-deltas/FEATURE_BOUNDARY.md` | Feature boundary statement |
| `docs/20-architecture/specs/shift-rundown-deltas/FEATURE_BRIEF.md` | Feature brief |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | TableContextService bounded context |

---

## Appendix A: Schema Reference

### table_rundown_report

```sql
CREATE TABLE table_rundown_report (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id               UUID NOT NULL REFERENCES casino(id),
  table_session_id        UUID NOT NULL REFERENCES table_session(id),
  gaming_table_id         UUID NOT NULL REFERENCES gaming_table(id),
  gaming_day              DATE NOT NULL,     -- Server-derived, never client-supplied

  -- Snapshot references
  opening_snapshot_id     UUID REFERENCES table_inventory_snapshot(id),
  closing_snapshot_id     UUID REFERENCES table_inventory_snapshot(id),
  drop_event_id           UUID REFERENCES table_drop_event(id),

  -- Computed values (immutable after finalization)
  opening_bankroll_cents  INTEGER,
  closing_bankroll_cents  INTEGER,
  fills_total_cents       INTEGER NOT NULL DEFAULT 0,
  credits_total_cents     INTEGER NOT NULL DEFAULT 0,
  drop_total_cents        INTEGER,
  table_win_cents         INTEGER,           -- NULL when drop not posted

  -- Provenance
  opening_source          TEXT NOT NULL,      -- 'snapshot:prior_count' | 'bootstrap:par_target' | 'fallback:earliest_in_window' | 'none'
  computation_grade       TEXT NOT NULL DEFAULT 'ESTIMATE',

  -- Variance
  par_target_cents        INTEGER,
  variance_from_par_cents INTEGER,

  -- Metadata
  computed_by             UUID REFERENCES staff(id),
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at            TIMESTAMPTZ,       -- NULL until supervisor signs off; once set, row is immutable
  finalized_by            UUID REFERENCES staff(id),
  notes                   TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One report per session (UPSERT target)
CREATE UNIQUE INDEX uq_rundown_report_session
  ON table_rundown_report (table_session_id);

-- Audit query by gaming day
CREATE INDEX idx_rundown_report_gaming_day
  ON table_rundown_report (casino_id, gaming_day);

-- RLS: casino-scoped Pattern C hybrid
ALTER TABLE table_rundown_report ENABLE ROW LEVEL SECURITY;

CREATE POLICY "casino_scope_select" ON table_rundown_report
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

### shift_checkpoint

```sql
CREATE TABLE shift_checkpoint (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id                 UUID NOT NULL REFERENCES casino(id),
  gaming_day                DATE NOT NULL,     -- Server-derived, never client-supplied

  -- Scope (schema future-proofed; MVP UI consumes casino-scope only)
  checkpoint_scope          TEXT NOT NULL DEFAULT 'casino'
                            CHECK (checkpoint_scope IN ('casino', 'pit', 'table')),
  gaming_table_id           UUID REFERENCES gaming_table(id),  -- NULL for casino/pit scope
  pit_id                    UUID,              -- MVP: MUST be NULL (Pit entity does not exist as a table;
                            --   pit_id is currently a text label on gaming_table.pit, not a UUID FK).
                            --   Column reserved for vNext when Pit model is formalized.
                            --   No FK constraint — will be added when pit table is created.

  checkpoint_type           TEXT NOT NULL CHECK (checkpoint_type IN ('mid_shift', 'end_of_shift', 'handoff')),

  -- Time window used to compute metrics
  window_start              TIMESTAMPTZ NOT NULL,  -- Defaults to gaming day start
  window_end                TIMESTAMPTZ NOT NULL,  -- = now() at capture time

  -- Metric snapshot at checkpoint time
  win_loss_cents            INTEGER,           -- NULL if no tables have coverage
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

-- Fast "latest checkpoint" lookup
CREATE INDEX idx_shift_checkpoint_latest
  ON shift_checkpoint (casino_id, checkpoint_scope, created_at DESC);

-- Pit-scoped queries (vNext)
CREATE INDEX idx_shift_checkpoint_pit
  ON shift_checkpoint (casino_id, pit_id, created_at DESC)
  WHERE pit_id IS NOT NULL;

-- RLS: casino-scoped Pattern C hybrid
ALTER TABLE shift_checkpoint ENABLE ROW LEVEL SECURITY;

CREATE POLICY "casino_scope_select" ON shift_checkpoint
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

### Session Totals — RPC-Side Update (NOT triggers)

Session totals are updated **inside the fill/credit RPCs**, not via AFTER INSERT triggers. This avoids SECURITY DEFINER trigger footguns and the `LIMIT 1` session-resolution ambiguity.

```sql
-- Inside rpc_request_table_fill (same transaction as fill INSERT):

-- 1. Resolve session deterministically via unique active session index
SELECT id INTO v_session_id
FROM table_session
WHERE casino_id = v_casino_id
  AND gaming_table_id = p_gaming_table_id
  AND status IN ('ACTIVE', 'RUNDOWN');
-- Unique partial index guarantees 0 or 1 row. No LIMIT needed.

-- 2. Write session_id onto the fill row
INSERT INTO table_fill (... session_id ...) VALUES (... v_session_id ...);

-- 3. Atomic total update (if session exists)
IF v_session_id IS NOT NULL THEN
  UPDATE table_session
  SET fills_total_cents = fills_total_cents + p_amount_cents
  WHERE id = v_session_id;
END IF;
```

Same pattern for `rpc_request_table_credit` → `credits_total_cents`.

---

## Appendix B: Implementation Plan

### WS1: Schema & RPCs (P0)

- [ ] Create `table_rundown_report` table with RLS policies
- [ ] Create `shift_checkpoint` table with RLS policies (including `checkpoint_scope`, `pit_id`, `gaming_table_id`, `gaming_day`)
- [ ] Fix `rpc_compute_table_rundown` chipset JSON parsing bug (GB-2)
- [ ] Add `session_id` column to `table_fill` and `table_credit` if not present; backfill existing rows
- [ ] Modify `rpc_request_table_fill` to resolve `session_id`, write FK, and atomically increment `fills_total_cents` (FR-6, FR-14)
- [ ] Modify `rpc_request_table_credit` to resolve `session_id`, write FK, and atomically increment `credits_total_cents` (FR-6, FR-14)
- [ ] Create `rpc_persist_table_rundown` (compute + UPSERT by `table_session_id`) with server-derived `gaming_day` (FR-2, FR-12)
- [ ] Modify `rpc_close_table_session` to inline-call `rpc_persist_table_rundown` in same transaction (FR-1)
- [ ] Create `rpc_finalize_rundown` — stamp `finalized_at`, reject if already finalized (FR-5)
- [ ] Create `rpc_create_shift_checkpoint` — call `rpc_shift_table_metrics`, INSERT with server-derived `gaming_day` (FR-7, FR-13)
- [ ] Fix `rpc_log_table_inventory_snapshot` to populate `session_id` and `total_cents` (GB-1, GB-3)
- [ ] Run `npm run db:types-local` → regenerate types

### WS2: Service Layer (P0)

- [ ] Create DTOs: `TableRundownReportDTO`, `ShiftCheckpointDTO`, `ShiftCheckpointDeltaDTO`
- [ ] Create schemas: Zod validation for persist/finalize/checkpoint inputs
- [ ] Create mappers: row → DTO transformations
- [ ] Create keys: React Query key factories
- [ ] Create service functions: persistRundown, finalizeRundown, getRundownBySession, listRundownsByDay
- [ ] Create service functions: createCheckpoint, getLatestCheckpoint, computeDelta, listCheckpoints
- [ ] Create HTTP wrappers for all service functions

### WS3: API Routes (P0)

- [ ] POST `/api/v1/table-rundown-reports` — persist rundown (manual path)
- [ ] PATCH `/api/v1/table-rundown-reports/[id]/finalize` — finalize
- [ ] GET `/api/v1/table-rundown-reports?gaming_day=&table_id=` — list
- [ ] GET `/api/v1/table-rundown-reports/[id]` — get by ID
- [ ] POST `/api/v1/shift-checkpoints` — create checkpoint
- [ ] GET `/api/v1/shift-checkpoints/latest` — get latest
- [ ] GET `/api/v1/shift-checkpoints/delta` — compute delta
- [ ] GET `/api/v1/shift-checkpoints` — list for gaming day

### WS4: Hooks (P1)

- [ ] `usePersistRundown(sessionId)` — mutation
- [ ] `useFinalizeRundown(reportId)` — mutation
- [ ] `useRundownReport(sessionId)` — query
- [ ] `useRundownsByDay(gamingDay)` — query
- [ ] `useCreateCheckpoint()` — mutation
- [ ] `useLatestCheckpoint()` — query
- [ ] `useCheckpointDelta()` — query (current vs last)

### WS5: UI Integration (P1)

- [ ] Fix `formatCents(null)` → "---" globally (GB-4)
- [ ] RundownSummaryPanel: "Save Report" button + "Finalized" badge
- [ ] Shift dashboard toolbar: "Checkpoint" button
- [ ] HeroWinLossCompact: delta badge ("+$X since HH:MM")
- [ ] MetricsTable: per-table/per-pit deltas computed live from checkpoint baseline (no stored per-scope rows)
- [ ] Checkpoint confirmation toast

---

## Appendix C: Error Codes

Error codes follow PT-2 convention: `DOMAIN_DESCRIPTION` in TypeScript (`DomainError`); `TBLRUN_`/`CHKPT_` prefixes in SQL `RAISE EXCEPTION` (remapped at service boundary).

**TypeScript surface (service layer):**

| Code | HTTP | Description |
|------|------|-------------|
| `TABLE_RUNDOWN_ALREADY_FINALIZED` | 409 | Rundown report already finalized, modification rejected |
| `TABLE_RUNDOWN_SESSION_NOT_FOUND` | 404 | Table session not found |
| `TABLE_RUNDOWN_SESSION_NOT_CLOSED` | 400 | Cannot finalize report for non-closed session |
| `TABLE_CHECKPOINT_METRICS_UNAVAILABLE` | 503 | Could not compute shift metrics for checkpoint |
| `TABLE_CHECKPOINT_GAMING_DAY_UNRESOLVABLE` | 500 | Could not derive gaming day from casino settings |

**SQL internals (RAISE EXCEPTION):**

| Code | Maps to |
|------|---------|
| `TBLRUN_ALREADY_FINALIZED` | `TABLE_RUNDOWN_ALREADY_FINALIZED` |
| `TBLRUN_SESSION_NOT_FOUND` | `TABLE_RUNDOWN_SESSION_NOT_FOUND` |
| `TBLRUN_SESSION_NOT_CLOSED` | `TABLE_RUNDOWN_SESSION_NOT_CLOSED` |
| `CHKPT_METRICS_UNAVAILABLE` | `TABLE_CHECKPOINT_METRICS_UNAVAILABLE` |
| `CHKPT_GAMING_DAY_UNRESOLVABLE` | `TABLE_CHECKPOINT_GAMING_DAY_UNRESOLVABLE` |

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-02-24 | lead-architect | Initial draft from INVESTIGATION-CLOSE-TABLE-SHIFT-DELTAS |
| 0.2.0 | 2026-02-24 | lead-architect | **Review revision:** (1) Checkpoint schema future-proofed with `checkpoint_scope`/`pit_id`/`gaming_table_id`, UI gated to casino-only; (2) Persistence contract changed to synchronous inline (same transaction), dropped 50ms NFR; (3) Session totals via RPC-side atomic update, not SECURITY DEFINER triggers; (4) Prerequisite bugs elevated to Gating Bugs in DoD; (5) `gaming_day` server-derived on both tables, never client-supplied; (6) Explicit mutability contract (UPSERT before finalization, reject after); (7) Added Authoritative Contracts section; (8) Clarified finalization = report stamp, not session state; (9) Removed `TBLRUN_REPORT_EXISTS` error code (UPSERT eliminates it) |
| 0.3.0 | 2026-02-24 | lead-architect | **Second review:** (1) Named `unique_active_session_per_table` index with exact DDL — DB constraint is authority (§8.1.1); (2) Persistence must be single SQL function body, not client orchestration (§2.4); (3) `pit_id` MUST be NULL in MVP — Pit entity not formalized, column reserved for vNext (FR-17); (4) Delta window contract explicit: re-query `rpc_shift_table_metrics` at `checkpoint.window_end`, confirmed deterministic (§8.1.2, FR-18); (5) Finalization requires `table_session.status = 'CLOSED'` (FR-16, §2.5); no unfinalize in MVP; (6) Error codes aligned with PT-2 codebase convention: `TABLE_` prefix for TypeScript, `TBLRUN_`/`CHKPT_` for SQL internals |
