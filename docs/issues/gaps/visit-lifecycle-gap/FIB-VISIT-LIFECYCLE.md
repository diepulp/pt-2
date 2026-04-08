# Feature Intake Brief

> **Downstream framing note:** The feature spine is **operator-attested visit closure for the current lifecycle posture**. Closed Slips terminology cleanup, Start From Previous wiring, and continuation eligibility rules are adjacent repairs — necessary so the closed state is not incoherent, but not the design center. The PRD must not give equal design weight to continuation UX polish and close-visit compliance mechanics.

## A. Feature identity
- Feature name: Visit Lifecycle Operator Workflow
- Feature ID / shorthand: FIB-VISIT-LIFECYCLE
- Related wedge / phase / slice: Visit Management, GAP-VISIT-LIFECYCLE-001
- Requester / owner: diepulp
- Date opened: 2026-04-07
- Priority: P1
- Target decision horizon: post exclusion enforcement (GAP-EXCL-ENFORCE-001), current visit-lifecycle-gap branch

## B. Operator problem statement

When a patron leaves the gaming floor, the pit boss has no way to formally check them out. The visit persists for the entire gaming day — inflating active-player counts, blocking the "Start From Previous" continuation flow (which needs a clean closed visit as its source), and leaving an open-ended compliance record with no operator-attested endpoint. The only paths that close a visit today are gaming day rollover (automatic, next-day) and exclusion auto-close (safety mechanism, not workflow). Neither is an intentional operator action.

Separately, when a returning patron needs to resume play from a prior session, the continuation flow ("Start From Previous") is fully built on the backend but dead-ends in the production UI. Clicking a closed slip in the dashboard opens a read-only rating slip viewer instead of the continuation modal. The operator sees a dead-end where the system promised a workflow.

The "Closed Sessions" panel compounds the confusion: it shows closed rating slips (table segments) but labels them "sessions" (patron visits). A player who moved between three tables shows as three "closed sessions" when they are actually three segments of one active visit.

## C. Pilot-fit / current-slice justification

This belongs in the current slice because PRD-057 hardened session-gated operations and the exclusion enforcement work (GAP-EXCL-ENFORCE-001) added auto-close for hard-blocked players. Those changes made the visit lifecycle gap visible: the system now produces closed visits (via exclusion and rollover) but operators have no visibility into what happened, no way to close visits themselves, and no way to continue a patron's session after closure. The underlying plumbing largely exists — hooks, APIs, RPCs, and modal components are present — but the feature is **not purely wiring**. `End Visit` is a **compound operator workflow** that orchestrates slip finalization, visit closure, UI refresh, and continuation-state consequences. The missing work is therefore a mix of UI wiring **and** workflow-definition hardening. The implementation must explicitly define ordering, failure behavior, and operator-visible outcomes so the compliance chain is not left in a partial state.

## D. Primary actor and operator moment
- Primary actor: Pit boss / floor supervisor
- When does this happen? Mid-shift when a patron leaves the floor (End Visit), or when a returning patron arrives and needs session continuity (Start From Previous)
- Primary surface: Pit terminal — rating slip modal (End Visit action), Closed Slips panel + StartFromPreviousModal (continuation flow)
- Trigger event: Patron departure (End Visit) or patron return (Start From Previous)

## E. Feature Containment Loop

### End Visit (check-out)

1. Patron leaves the floor — pit boss needs to formally end their visit
2. Pit boss clicks the occupied seat on the table view → rating slip modal opens showing the active slip
3. Pit boss clicks "End Visit" in the modal → system shows confirmation: "End [Player Name]'s visit? This will close their active slip and check them out."
4. Pit boss confirms → system closes all open/paused rating slips for this visit via `rpc_close_rating_slip` (preserving theo computation from `policy_snapshot`, pause-adjusted duration, `computed_theo_cents` materialization, and audit log entry per slip)
5. System closes the visit (`ended_at = now()`) via existing `PATCH /api/v1/visits/[visitId]/close`
6. Seat frees up on the table view, dashboard stats refresh, closed slip(s) appear in the Closed Slips panel, toast confirms checkout

### Start From Previous (continuation)

1. Returning patron arrives at the floor — previously checked out (or auto-closed by rollover/exclusion)
2. Pit boss navigates to the "Closed Slips" tab and sees the patron's closed slip(s). The clicked closed slip is a **player/context entry point**, not the continuation source of record. The continuation source is a **closed visit** selected in the modal.
3. Pit boss clicks a closed rated slip → system uses the slip to resolve player/context, then fetches the player's eligible recent **visit-level sessions** via `GET /api/v1/players/[playerId]/recent-sessions`
4. `StartFromPreviousModal` opens showing the player's closed visits with financial summary (buy-in, cash-out, net, points, duration, segment count)
5. Pit boss selects the visit to continue from → system stores the pending continuation context and closes the modal
6. Toast: "Select an empty seat to place [Player Name]" — pit boss clicks an empty seat on the selected table
7. System calls `POST /api/v1/visits/start-from-previous` with `{ player_id, source_visit_id, destination_table_id, destination_seat_number }` → new visit created (inheriting `visit_group_id` for history linkage) + new rating slip created at destination via `rpc_start_rating_slip` (fresh `policy_snapshot` from destination table's game settings, own `start_time`, own `accrual_kind`, own audit log entry)
8. New rating slip modal opens for the fresh slip — the patron is back in play with full compliance chain intact

## F. Required outcomes
- A pit boss can formally end a patron's visit from the rating slip modal with a single compound action
- Ending a visit closes all open/paused rating slips for that visit through `rpc_close_rating_slip` — not a raw status update — preserving theo computation, pause-adjusted duration, `computed_theo_cents` materialization, and per-slip audit log entries
- No orphaned open slips remain after a visit is closed by operator action
- The `chk_closed_slip_has_theo` database constraint is satisfied for every slip closed during End Visit (theo is computed from the slip's `policy_snapshot`, not set to 0)
- Clicking a closed rated slip in the Closed Slips panel opens the `StartFromPreviousModal` — not the read-only rating slip viewer
- Start From Previous creates a new visit and new rating slip (never reopens a closed slip or visit) — temporal integrity and compliance chain are preserved
- The new slip created by Start From Previous has its own `policy_snapshot` captured from the destination table's game settings at creation time — independent of the source visit's snapshots
- `startFromPrevious` service checks exclusion status before creating a visit (defense-in-depth gate alongside the RPC-level gate in `rpc_start_rating_slip`)
- The Closed Slips panel is labeled to reflect what it actually shows (closed table segments, not patron sessions)
- `End Visit` must define **failure semantics** for multi-slip closure before downstream design begins
- The system must **not** mark the visit closed if any required slip-finalization step fails
- If the implementation uses sequential `rpc_close_rating_slip` calls, the PRD/spec must state whether the workflow is: (a) effectively atomic through a server-side orchestration boundary, or (b) compensating / fail-safe, where partial close is surfaced and recoverable by operator/admin follow-up
- Operator-facing messaging must distinguish: visit close succeeded, slip finalization failed, and continuation unavailable due to incomplete close chain
- All UX copy must use **slip / segment** language for panel rows and **visit / session** language for continuation candidates and resumed history
- The clicked slip in the Closed Slips panel must never be treated as the object being reopened or resumed
- The Closed Slips panel relabeling must be consistent across: panel title, empty state, row affordance text, toasts, and modal copy — no user-facing copy may refer to a closed slip row as a "session" unless it explicitly means a visit-level object
- The continuation modal must apply explicit eligibility rules for which recent visits may be resumed — downstream design must define, at minimum: whether rollover-closed visits are eligible, whether exclusion-closed visits become eligible after exclusion lift, whether unrated / ghost / incomplete visits appear, and what recency window governs the list

## G. Explicit exclusions
- SeatContextMenu integration — the component exists but is not rendered in the production UI; wiring it is a separate scope item, not a prerequisite for this feature
- Visit-level grouping in the Closed Slips panel — showing visits (grouped by `visit_id`) instead of individual slips requires a new API/RPC; the current panel continues to show slips with corrected labeling
- Dedicated table/seat picker component for Start From Previous — the pending-continuation pattern reuses the existing seat-click flow; no new picker is built
- Changes to the rating slip close flow — the existing `rpc_close_rating_slip` RPC is called as-is; no modification to its behavior
- Changes to gaming day rollover behavior — stale-slip auto-close (with `computed_theo_cents = 0`) remains unchanged; that is an abandonment path, not an operator action
- Loyalty accrual triggering — loyalty points are accrued separately via `rpc_accrue_on_close`; this feature calls the existing slip-close RPC but does not add or modify accrual logic
- Additional role-based authorization for `End Visit` is out of scope for this slice. For pilot, the system accepts the risk that any operator already authorized to open and act within the rating slip modal may perform `End Visit`. This is an explicit pilot-stage risk acceptance, not an architectural endorsement for later phases

## H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Add End Visit to the seat right-click context menu | GAP doc lists "Seat context menu" as a candidate location; natural ergonomic fit | `SeatContextMenu` component exists but is never rendered in the production UI. Integrating it requires wiring through `TableLayoutTerminal → TablesPanel → PanelContainer → PitPanelsClient` for every callback. Separate scope — the rating slip modal already opens on seat click and is the right place for a compound close action. |
| Close only the visit, leave slips as-is | Simpler implementation; gaming day rollover will eventually clean up slips | Orphaned open slips violate the compliance chain. Gaming day rollover force-sets `computed_theo_cents = 0` (abandonment), losing legitimate theo calculations and breaking loyalty accrual. Operator-initiated close must finalize slips properly via the RPC. |
| Raw UPDATE to close slips instead of RPC calls | Single SQL statement, faster | Bypasses theo computation from `policy_snapshot`, skips pause-interval closure, violates `chk_closed_slip_has_theo` CHECK constraint, produces no audit log entries. The RPC is the compliance boundary — there is no shortcut. |
| Build a dedicated table/seat picker for Start From Previous | Better UX than "click an empty seat" toast pattern | Over-engineering for MVP. The seat-click flow already exists and works. A dedicated picker adds a new component, new state management, and a new interaction pattern for a feature that fires infrequently. Revisit if operator feedback requests it. |
| Show visits (grouped by visit_id) in the Closed Slips panel | Fixes the semantic mismatch at the data layer | Requires a new API endpoint returning visit-level aggregates scoped to the gaming day — different from the existing `rpc_list_closed_slips_for_gaming_day`. The label rename is the pragmatic fix; visit-level grouping is a follow-up. |
| Reopen a closed slip instead of creating a new one | Simpler continuation model | Violates temporal integrity. A closed slip has a finalized `end_time`, `computed_theo_cents`, and sealed `policy_snapshot`. Reopening would invalidate the audit trail and produce inconsistent financial records. Creating a new slip with a fresh snapshot is the correct compliance-preserving path. |

## I. Dependencies and assumptions
- **GAP-EXCL-ENFORCE-001 Layer 1 delivered** — `rpc_start_rating_slip` checks exclusion status, providing the primary gate; the service-layer check in `startFromPrevious` is defense-in-depth
- **`rpc_close_rating_slip` exists and handles multi-state close** — closes pause intervals, computes theo from `policy_snapshot`, materializes `computed_theo_cents`, writes audit log; no modification needed
- **`POST /api/v1/visits/start-from-previous` route exists and is tested** — service layer, Zod schema, RPC delegation all functional
- **`GET /api/v1/players/[playerId]/recent-sessions` route exists** — returns visit-level aggregates with financial totals (cents-to-dollars converted at service layer). Current response shape (`RecentSessionsDTO`) includes `ended_at` but does **not** include a closure reason field. If continuation eligibility requires distinguishing operator-closed from rollover-closed from exclusion-closed, the route and/or underlying RPC will need a schema addition — that is not yet delivered
- **`StartFromPreviousModal` and `StartFromPreviousPanel` exist** — fully built, only consumed by mock-data review page; need wiring to production, not implementation
- **`useCloseVisit()` hook exists** — functional, unused in production UI
- **Rating slip modal opens on occupied-seat click** — existing flow; End Visit is an additional action in this modal, not a replacement
- Assumption requiring confirmation: every slip eligible for operator-initiated close already contains the minimum rating inputs required by `rpc_close_rating_slip` to compute compliant theo from `policy_snapshot`. If a required rating field is missing at close time, the workflow must define whether: close is blocked, operator is prompted using an existing pattern, or the slip is finalized under an explicitly approved abandonment/incomplete-rating rule
- Assumption requiring explicit downstream validation: the MVP may orchestrate closure through the existing `rpc_close_rating_slip` boundary rather than introducing a bulk-close RPC, **provided** the implementation defines safe failure semantics and does not allow the visit to land in a partially finalized compliance state. The absence of a bulk RPC is acceptable; the absence of a failure model is not
- Assumption requiring confirmation: recent-session data returned to `StartFromPreviousModal` can expose enough state to distinguish continuation-eligible visits from merely closed historical visits, including closure reason if available

## J. Out-of-scope but likely next
- SeatContextMenu integration into the production table layout — would add right-click-style actions for pause/resume/close/move/end-visit directly on seats
- Visit-level grouping in the Closed Slips panel — replace slip-by-slip display with visit-grouped view
- Operator notification when a visit is auto-closed by exclusion or rollover — contextual "why did this session disappear" messaging
- Bulk visit close (end-of-shift "close all active visits" action)
- Even if full operator notification is deferred, downstream design should consider a **minimal closure-reason label** in continuation history where available (e.g., operator-closed, rollover-closed, exclusion-closed), so resumption is not performed against an opaque closure record

## K. Expansion trigger rule

Amend this brief if any downstream artifact proposes:
- a new surface beyond the rating slip modal for End Visit (e.g., SeatContextMenu, Player 360, activity panel)
- loyalty accrual logic changes triggered by visit close (beyond calling existing `rpc_close_rating_slip`)
- modifications to `rpc_close_rating_slip` behavior (new fields, changed theo computation, altered audit format)
- a dedicated table/seat picker replacing the pending-continuation seat-click pattern
- visit-level data in the Closed Slips panel (requires new API, changes data layer)
- role-based authorization for End Visit (currently any modal user can close)

## L. Scope authority block
- Intake version: v0.2 (patched: audit fold-in — compound workflow framing, failure semantics, close preconditions, slip/visit semantic boundary, authorization risk acceptance, eligibility rules, sequential-close validation)
- Frozen for downstream design: Yes — v0.2 approved for PRD scaffolding
- Downstream expansion allowed without amendment: No
- Open questions allowed to remain unresolved at scaffold stage: Whether any minimum rating inputs, including `average_bet` where applicable, must be present before `End Visit` is allowed to finalize a slip — MVP may not introduce a new bespoke component, but the downstream design must still resolve the rule explicitly using an existing modal/confirmation/error pattern ("use whatever value is already there" is not, by itself, a compliance rule); whether the pending-continuation toast should have a cancel button or timeout — **constraint: MVP must not add new UI components for these; resolution must use existing patterns (toast dismiss, escape key)**
- Human approval / sign-off: [Pending]
