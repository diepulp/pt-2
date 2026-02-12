# PT‑2 RatingSlip Continuity Fix (Without Rewriting the Internet)

Date: 2025-12-21  
Status: Proposed (ready for implementation)  
Scope: RatingSlipService + Visit read model + Pit Boss UI contract

---

## Problem Statement

Current behavior (“new rating slip per move”) is **architecturally intentional** if `rating_slip` is treated as **immutable telemetry** per table/seat segment.

However, operations (Pit Boss) need **session continuity** across moves:

- Buy-ins / cash-outs must **persist** and remain visible until the visit ends
- MTL threshold progress must **accumulate** across the visit
- Loyalty accrual must **accumulate** across the visit
- The operator should see **one stable session card** even if the player moves tables/seats

Right now, the system leaks an incorrect mental model: UI/business treats `rating_slip` like the **session object**, so segment resets look like data loss.

---

## Core Decision

**Keep `rating_slip` immutable (segment telemetry). Move “session truth” to `visit` (session nucleus).**

### Correct model
- **Visit** = the stable session identity and totals anchor (`visit_id`)
- **RatingSlip** = per table/seat **segment** telemetry (immutable “where/when”)
- **Finance/MTL/Loyalty** = ledgers anchored to **visit_id**, optionally attributable to a segment

### Operator mental model (UI)
- “Session Slip” (what Pit Boss cares about) = **Visit Live View** (keyed by `visit_id`)
- “Segment” (audit drill-down) = individual `rating_slip` rows

---

## Why This Avoids a Rewrite

This path **does not**:
- mutate `rating_slip.table_id` / `seat_number` post-create (no SRM invariant violation)
- erase movement history (audit stays clean)
- force rework of RLS scoping (still casino-scoped)
- require cross-context table reads (expose a published read model instead)

This path **does**:
- add a small amount of metadata to chain slips across moves
- expose a Visit-level “live session” read model that the UI uses

---

## Implementation Plan

### 1) Add Slip Chaining + Continuity Fields (Additive, Low Blast Radius)

Add to `public.rating_slip`:

- `previous_slip_id uuid null`  
  FK → `rating_slip(id)`; links segment chain in move order.
- `move_group_id uuid null`  
  Stable group identifier for all segments belonging to the same “session slip” chain.  
  Recommended: on first segment, set `move_group_id = id` (self), then carry forward.
- `accumulated_seconds int not null default 0`  
  Carries forward prior segment durations for continuity math.

> Note: You can keep your existing `pause_intervals/accumulated_seconds` concepts if already present.
> The key is: **duration continuity becomes additive across segments**, not a single mutable segment.

#### Move endpoint behavior (unchanged flow, enriched writes)

Current move flow:
1) close current slip (optionally average_bet)
2) start new slip at destination

Enhance step (2) with continuity:

- `new.previous_slip_id = old.id`
- `new.move_group_id = old.move_group_id ?? old.id`
- `new.accumulated_seconds = old.accumulated_seconds + old.final_seconds`

Where:
- `old.final_seconds` = duration of the closed slip (post pause reconciliation)

**Total session duration (operator-friendly)**:
- If there is an active slip:  
  `total_seconds = active.accumulated_seconds + active.elapsed_seconds`
- If visit has no active slip:  
  `total_seconds = SUM(all segments final_seconds)` (or stored visit total)

---

### 2) Stop Pretending Slip Owns “Money”

**Rule:** Financial and compliance-relevant transactions are **visit-anchored**.

- `player_financial_transaction.visit_id` is required
- `player_financial_transaction.rating_slip_id` is optional attribution (nullable)
- MTL calculations run on visit-level ledger totals, not per-slip totals

This ensures buy-ins do not appear to “reset” when a slip closes.

---

### 3) Add a Visit-Level Live Aggregate Read Model (The Query the UI Actually Uses)

Create one published “session object” query:

**RPC (recommended):** `rpc_get_visit_live_view(visit_id uuid)`

Returns a single JSON payload (or typed record) containing:

- visit identity + player identity
- **current active segment** (if any):
  - slip_id, table_id, seat_number, started_at, avg_bet, etc.
- **session totals** (visit-scoped):
  - `total_duration_seconds`
  - `total_buy_in`, `total_cash_out`, `net`
  - `points_earned`
  - `mtl_threshold_progress` (CTR/watchlist/etc)
- optional: segment list (paginated)

> This read model can be implemented as:
> - an RPC that joins/sums in one place (preferred for stable API contract)
> - or a view + a thin service query wrapper
>
> The goal is to make Pit Boss UI **never** have to “mentally stitch” segments.

---

### 4) UI Contract: Rename + Reframe

Pit Boss should not primarily render “Rating Slip Details”.

Instead:
- default screen: **Visit Live View**
- show “Session Slip #” = derived from visit or move_group_id
- show “Segments” as history

This is a presentation change that eliminates the “looks like data loss” complaint.

---

## Data Model Notes

### Recommended keys
- `visit_id` = session nucleus key
- `rating_slip.id` = segment key
- `move_group_id` = stable chain key for session slip presentation (if needed)

### Why not mutable table_id/seat_number
Making `rating_slip` mutable turns audit into a lie:
- you lose accurate location history
- you complicate reconciliation with other logs (dealer rotations, drop/fill, etc.)
- you risk correctness bugs under concurrency (“player moved twice quickly”)

---

## Acceptance Criteria (Non-Negotiable)

On the Pit Boss “session slip” screen (keyed by `visit_id`):

1) **Stable identity** across moves  
   - The operator’s object does not “reset” on move.

2) **Totals never reset** during an open visit  
   - buy-ins/cash-outs/net are visit totals
   - loyalty points are visit totals
   - MTL threshold progress is visit totals

3) **Current position is always visible**  
   - active segment shows current table/seat

4) **Segment history is preserved**  
   - prior segments are visible for audit and review

5) **No SRM violations introduced**  
   - TableContextService does not read RatingSlip tables directly; uses published query/RPC.

---

## SRM / Bounded Context Alignment

This patch reinforces SRM intent:

- RatingSlipService owns immutable segment telemetry (“what happened where”)
- VisitService owns visit continuity and identity (“session anchor”)
- Finance owns financial ledger and MTL-relevant totals (visit-scoped)
- Loyalty owns loyalty ledger (visit-scoped)
- UI consumes a **published read model** rather than cross-context queries

---

## Migration Sketch (SQL)

> Adjust naming/constraints to your canonical `database.types.ts` and SRM v4.

```sql
alter table public.rating_slip
  add column if not exists previous_slip_id uuid null,
  add column if not exists move_group_id uuid null,
  add column if not exists accumulated_seconds int not null default 0;

alter table public.rating_slip
  add constraint rating_slip_previous_slip_fk
  foreign key (previous_slip_id) references public.rating_slip(id);

create index if not exists idx_rating_slip_move_group_id
  on public.rating_slip (casino_id, move_group_id);

create index if not exists idx_rating_slip_previous_slip_id
  on public.rating_slip (casino_id, previous_slip_id);
```

---

## Endpoint / Service Changes

### `POST /api/v1/rating-slips/[id]/move`

Keep:
- close current slip
- start new slip

Add:
- continuity metadata writes (previous_slip_id, move_group_id, accumulated_seconds)

### Add query
- `GET /api/v1/visits/[id]/live` (or similar)
- backed by `rpc_get_visit_live_view(visit_id)`

---

## Rollout Plan

1) Ship migration (add columns + indexes)
2) Update move endpoint to populate continuity columns
3) Implement `rpc_get_visit_live_view`
4) Switch Pit Boss UI to visit-live endpoint (stop centering slip id)
5) Add regression tests:
   - moving across tables preserves totals and increments duration
   - ledger totals are visit-scoped and do not reset across segment creation
   - segment history chain is correct

---

## Blunt Summary

You don’t need one slip row that “teleports” across the pit.  
You need a **Visit Live View** that operators treat as the “same slip,” while the database keeps **immutable segment telemetry** for audit correctness.

This gives you continuity, clean movement history, and no SRM collapse.
