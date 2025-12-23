# ISSUE / SPEC — Start From Previous Session (Visit Continuation)

Date: 2025-12-21  
Status: Draft (standalone feature)  
Owner BCs: VisitService (session), RatingSlipService (segments), Finance/Loyalty/MTL (read aggregation only)  
Depends On: **Visit Live View / Session Aggregation Read Model** (separate issue)

---

## 1) Problem Statement

Operators need a fast way to re-open a player’s workflow **after the player has left** and the prior visit has been concluded.

Current system model is correct that:
- `rating_slip` is immutable segment telemetry (table/seat “where/when”)
- `visit` anchors the session identity

But operationally, when a player returns shortly after leaving, Pit Boss wants:
- a **one-click “start from previous”** action
- continuity of **displayed context** (last table/seat, game settings, last observed avg bet)
- continuity of **aggregated totals** (buy-ins/cash-outs/net, loyalty, MTL thresholds) across a relevant window

This must be achieved **without** reopening or mutating closed slips, and **without** copying financial ledger rows.

---

## 2) Goals / Non-Goals

### Goals
1) Allow Pit Boss to select a **recently closed session** and start a new active session seeded from its context.
2) Preserve audit correctness: no rewriting of historical segments.
3) Show continuity via aggregation:
   - totals by **gaming day / policy window** and/or by **visit group**
4) Enforce guardrails (no duplicate active visits for the same player).

### Non-Goals
- Re-open closed `rating_slip` rows.
- Mutate `rating_slip.table_id` or `seat_number`.
- “Move” semantics inside an active visit (already handled by Move workflow).
- Changing ownership of ledgers (Finance/Loyalty/MTL remain authoritative).

---

## 3) Terminology

- **Segment**: A `rating_slip` row (immutable table/seat telemetry).
- **Visit**: A session record (`visit_id`) for one continuous presence window.
- **Continuation**: A new visit created after an ended visit, seeded from prior context.
- **Visit Group** (recommended): A stable grouping identifier across continuation visits.

---

## 4) Proposed Data Model

### 4.1 Visit Continuity Key (choose one)

**Option A (Recommended): `visit_group_id`**
- `visit.visit_group_id uuid not null`
- First visit creates a new group id.
- Continuation visits reuse the same group id.

Pros: supports multiple continuations cleanly; group live view is trivial.  
Cons: adds a column and indexes.

**Option B: `continued_from_visit_id`**
- `visit.continued_from_visit_id uuid null` (FK to `visit.id`)
- UI can follow a chain.

Pros: simpler to grok.  
Cons: chain traversal is clunkier for queries and aggregation.

> Recommendation: **Option A** (`visit_group_id`).

### 4.2 RatingSlip (no changes required for this feature)
This feature should reuse:
- existing segment start/close mechanics
- (optional) segment chain fields from the Move continuity issue (`previous_slip_id`, etc.)

---

## 5) Read Model Contracts (RPC / Queries)

This feature relies on the foundational **Visit Live View** issue. It adds two read endpoints.

### 5.1 `rpc_get_player_recent_sessions(casino_id, player_id, limit, cursor?)`
Purpose: Power the “closed sessions” table.

Returns list of session candidates (prefer visit groups if implemented):
- `visit_id` (most recent visit in group)
- `visit_group_id` (if used)
- `ended_at`, `started_at`
- last known `table_id`, `seat_number` (derived from last segment)
- `total_duration_seconds` (visit or group)
- `total_buy_in`, `total_cash_out`, `net` (aggregated)
- `points_earned` (aggregated)
- `mtl_progress` (aggregated over gaming day / window)
- flags:
  - `has_open_visit` (should be false for candidates)
  - `eligible_to_continue` (policy/guardrails)

### 5.2 `rpc_get_player_last_session_context(casino_id, player_id)`
Purpose: Seed defaults for “Start from previous”.

Returns:
- last `visit_id` / `visit_group_id`
- last known `table_id`, `seat_number`
- last known `game_settings`
- last known `average_bet` (optional convenience)
- relevant policy snapshots guidance:
  - *Use current policy snapshot when starting new visit*, not old one (see §7)

---

## 6) Write Path / Workflow

### 6.1 UI Flow
1) Pit Boss searches/selects player.
2) UI shows:
   - **Resume current** (if open visit exists)
   - **Start from previous** (list of recently closed sessions)
3) Pit Boss selects a closed session row → clicks **Start from previous**.
4) UI confirms/collects:
   - destination table/seat (default to last known, but editable)
   - optional game settings override (rare; default from last session)
5) System creates a new visit + starts first segment.

### 6.2 Server Flow (idempotent)
**POST** `/api/v1/visits/start-from-previous`

Input:
- `casino_id` (from RLS context)
- `player_id`
- `source_visit_id` or `source_visit_group_id`
- `destination_table_id`, `destination_seat_number`
- optional `game_settings` override

Algorithm:
1) Guard: verify actor has permission.
2) Guard: check for **existing open visit** for player.
   - If open visit exists → return `409` with `{ open_visit_id }` (UI should offer Resume).
3) Load last-session context (source).
4) Create new visit:
   - `player_id = player_id`
   - `visit_group_id = source.visit_group_id` (or chain field)
   - `started_at = now()`
   - `visit_kind` as appropriate
5) Start new rating slip segment under the new visit:
   - `visit_id = new_visit.id`
   - `table_id = destination_table_id`
   - `seat_number = destination_seat_number`
   - `game_settings = source.game_settings` (or override)
   - `policy_snapshot = CURRENT policy at start time` (not copied)
6) Audit log entry:
   - actor_id, player_id, new_visit_id, source_visit_id, destination table/seat
7) Return:
   - new visit id
   - active segment id

Idempotency (recommended):
- client supplies `idempotency_key` scoped to (casino_id, actor_id)
- server stores key in audit/outbox table or dedicated idempotency table.

---

## 7) Policy Snapshot Semantics

**Do not copy old policy snapshots forward.**

Rationale:
- policy_snapshot is “policy at creation time” for the segment.
- Continuation is a **new session**; policies may have changed.

Implementation:
- on new segment start, capture current policy snapshot.

If business insists on “carry forward old policy,” explicitly document and accept compliance implications.

---

## 8) Aggregation Semantics (What “continuity” means)

This feature is about *display continuity*, not rewriting events.

Recommended aggregation layers:
- **Gaming day totals** (Finance/MTL): sum of transactions within computed gaming day window.
- **Visit group totals** (optional): sum of visits in the group.

UI should show both if helpful:
- “Today (gaming day): $X toward threshold”
- “This session group: $Y total buy-ins”

Avoid implying a single visit never ended. It did.

---

## 9) Guardrails and Edge Cases

- Player has an open visit already → return 409 + resume suggestion.
- Multiple recent closed sessions → require explicit selection.
- Player returns next day → gaming day totals change; group totals still valid.
- Seat/table no longer available → allow override; do not hard-default silently.
- Concurrency: two staff members click “start from previous” simultaneously:
  - guard by unique constraint or transactional check on open visit.
- Compliance: ensure audit log captures continuation action with source reference.

---

## 10) SRM / Bounded Context Compliance

- VisitService owns visit creation and continuation metadata.
- RatingSlipService starts a new segment under a new visit.
- Finance/Loyalty/MTL are **read-only aggregation sources** for the read models.
- UI consumes published RPC/read models (no cross-context table reads).

---

## 11) Acceptance Criteria

1) **Closed sessions table**
   - Lists the last N closed sessions (or groups) for a player with totals and last position.

2) **Start from previous**
   - Creates a **new visit** and starts a new segment at selected destination.
   - Does not mutate any historical slips.
   - Does not copy financial ledger rows.

3) **Continuity view**
   - Operator sees:
     - last-known context prefilled (game settings, last avg bet optional)
     - aggregated totals (buy-ins/points/threshold progress) that reflect the correct window
   - No “reset” confusion.

4) **Guardrails**
   - If an open visit exists, system refuses continuation and offers resume path.

5) **Auditability**
   - Continuation action is audit logged with source and destination metadata.

---

## 12) Implementation Phases

### Phase 1 — Read models + UI listing
- Implement `rpc_get_player_recent_sessions`
- Implement `rpc_get_player_last_session_context`
- UI: show closed sessions table + “Start from previous” button (disabled if open visit)

### Phase 2 — Write path
- Implement `POST /visits/start-from-previous`
- Add audit log records + idempotency
- UI: full flow with destination selection

### Phase 3 — Visit grouping (if not done earlier)
- Add `visit_group_id` to visit and backfill existing visits
- Add `rpc_get_visit_group_live_view` (optional)

---

## 13) Open Questions

1) What is the “recent sessions” window? (last 5, last 24h, last 7 days)
2) Should continuation ever be automatic (select most recent), or always explicit?
3) Do we show totals per gaming day, per group, or both?
4) How do we handle “player left but returns in 5 minutes” operationally?
   - still a new visit, or keep a grace period to “resume same visit”?

> Recommendation: Keep it strict initially (new visit), optionally add “grace period resume” later.

---

## 14) Minimal Migration Sketch (if using `visit_group_id`)

```sql
alter table public.visit
  add column if not exists visit_group_id uuid;

-- backfill existing rows: each visit becomes its own group unless a chain exists
update public.visit
set visit_group_id = coalesce(visit_group_id, id);

alter table public.visit
  alter column visit_group_id set not null;

create index if not exists idx_visit_group
  on public.visit (casino_id, visit_group_id, started_at desc);
```

---

## 15) Summary

This feature is a **standalone slice** that provides operator-friendly continuity **across ended visits** by:
- seeding a new visit from prior context
- preserving immutable telemetry and immutable ledgers
- presenting continuity through **published aggregation read models**

No history rewriting. No SRM collapse. No “rewrite the internet.”
