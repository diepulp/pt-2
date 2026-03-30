# GAP: Visit Lifecycle Operator Workflow Incomplete

**ID:** GAP-VISIT-LIFECYCLE-001
**Date:** 2026-03-29
**Severity:** P1 — Operator Workflow
**Status:** OPEN
**Branch:** `player-exl-fix`
**Reporter:** Agent (code trace)
**Related:** GAP-EXCL-ENFORCE-001 (tangential — exclusion enforcement depends on visit close existing)

---

## Summary

The visit lifecycle has backend infrastructure for close and continuation, but the operator-facing workflow is incomplete. Operators cannot end a patron's session from the dashboard, the "Closed Sessions" panel displays slip-level closures (not session-level), and the "Start From Previous" continuation flow is built but not wired to the production UI.

These gaps are independent of exclusion enforcement but tangentially related: exclusion auto-closes visits (GAP-EXCL-ENFORCE-001 Layer 2), which produces closed visits that need a visible lifecycle in the dashboard.

## Gap 1: No "End Session" / "Check Out" operator action

**`useCloseVisit()` hook** — exported from `hooks/visit/use-visit-mutations.ts:58-82`, calls `PATCH /api/v1/visits/[visitId]/close`. Fully functional.

**No component imports it.** There is no button, menu item, or dialog in the pit dashboard to end a patron's visit. The only visit-close paths are:
- Gaming day rollover (automatic, inside `rpc_start_or_resume_visit` STEP 5-6)
- Direct API call (no UI)
- Exclusion auto-close (once GAP-EXCL-ENFORCE-001 Layer 2 is implemented)

**Impact:** Operators have no way to formally check out a patron. The visit persists for the entire gaming day regardless of whether the patron has left the floor. This creates:
- Stale active visits that confuse "active player" counts
- No clean handoff point for the "Start From Previous" continuation flow
- The visit "token" persists as a bypass path for exclusion (addressed separately in GAP-EXCL-ENFORCE-001)

**Candidate UI locations:**
- Rating slip modal — after closing the last active slip for a visit, offer "End Session?"
- Seat context menu — "Check Out Player" option
- Player 360 header — "End Visit" action alongside exclusion controls

## Gap 2: "Closed Sessions" panel shows slips, not sessions

**Component:** `components/pit-panels/closed-sessions-panel.tsx`
**Wired:** Yes — visible in pit dashboard sidebar under "Closed Sessions" tab

**What it actually shows:** Closed **rating slips** (table segments), not closed visits (patron sessions).

- Data source: `GET /api/v1/rating-slips/closed-today` → `ratingSlipService.listClosedForGamingDay()`
- DTO: `ClosedSlipForGamingDayDTO` — a `rating_slip` record with player/table info joined
- Filter: `status = 'closed'`, terminal slips only (excludes move intermediates via `previous_slip_id IS NULL` or similar)

**Semantic mismatch:** A player who moves between 3 tables has 3 closed slips but 1 active visit. The panel shows 3 "sessions" for what is actually 1 ongoing session. The label "Closed Sessions" implies visit-level closure but delivers slip-level closure.

**Note:** For the "Start From Previous" flow, showing terminal slips is arguably correct — the operator picks a specific table segment to continue from. But the naming and mental model ("session" vs "slip") creates confusion.

## Gap 3: "Start From Previous" miswired

**Backend:** Fully wired and tested.
- `POST /api/v1/visits/start-from-previous` — route exists
- `startFromPrevious()` in `services/visit/crud.ts:592-716` — creates new visit + first rating slip
- `startFromPreviousSchema` — validated
- Integration tests pass

**UI components:** Fully built but not wired to production.
- `StartFromPreviousPanel` — in `components/player-sessions/`
- `StartFromPreviousModal` — in `components/player-sessions/`
- `useStartFromPreviousModal()` — hook exists
- **Only consumed by** `app/review/start-from-previous/page.tsx` (mock-data review page)

**Miswiring in dashboard:** The `ClosedSessionsPanel` has a prop `onStartFromPrevious: (slipId: string) => void` (line 16). In `panel-container.tsx:305`, this is mapped to `onSlipClick` — which opens the rating slip modal (read-only view of the closed slip). It does NOT invoke the continuation flow.

```
ClosedSessionsPanel.onStartFromPrevious(slipId)
  → PanelContainer maps to onSlipClick
    → pit-panels-client.tsx handleSlipClick(slipId)
      → resolveCurrentSlipContext(supabase, slipId)
        → openModal('rating-slip', { slipId })  // Opens slip viewer, NOT continuation
```

**Expected flow:**
```
ClosedSessionsPanel.onStartFromPrevious(slipId)
  → Open StartFromPreviousModal with source slip context
    → User selects destination table + seat
      → POST /api/v1/visits/start-from-previous
        → New visit + first rating slip created
```

## Gap 4: `startFromPrevious` has no exclusion check

**File:** `services/visit/crud.ts`, lines 592-716

This function creates a new visit via direct `.from('visit').insert()` (line 674) and then calls `rpc_start_rating_slip` (line 690). It bypasses `rpc_start_or_resume_visit` entirely, so the exclusion check never fires.

Once GAP-EXCL-ENFORCE-001 Layer 1 adds exclusion checks to `rpc_start_rating_slip`, the RPC-level gate will cover this path. However, the service layer should also check exclusion before creating the visit (defense-in-depth, better error UX — fail before creating a visit that will be immediately orphaned).

**Note:** This gap is addressed by GAP-EXCL-ENFORCE-001 Layer 1 (RPC check in `rpc_start_rating_slip`). It is listed here for completeness of the visit lifecycle picture.

## Relationship to GAP-EXCL-ENFORCE-001

```
GAP-EXCL-ENFORCE-001 (exclusion enforcement)     GAP-VISIT-LIFECYCLE-001 (this gap)
├─ Layer 1: RPC checks ←────────────────────────── Gap 4 covered by this
├─ Layer 2: Auto-close visit on hard_block ──────→ Produces closed visits that need...
│                                                   ├─ Gap 1: Visible close action
│                                                   ├─ Gap 2: Session vs slip clarity
│                                                   └─ Gap 3: Continuation wiring
├─ Layer 3: startFromPrevious check ←──────────── Gap 4 defense-in-depth
└─ Layer 4: UI guards                              (independent)
```

The exclusion work (GAP-EXCL-ENFORCE-001) auto-closes visits on hard_block. This creates a new class of closed visits — operator-invisible forced closures. Without Gap 1/2/3 resolved, operators see slips disappear from the active panel but have no session-level context for what happened and no path to continue the patron after exclusion lift.

## Recommended Approach

These gaps should be addressed as a coherent follow-up to the P0 exclusion enforcement, not as part of it. The exclusion RPC checks and auto-close are self-contained safety fixes. The visit lifecycle UX is a broader workflow enhancement.

### Sequencing

1. **P0 (now):** GAP-EXCL-ENFORCE-001 — RPC exclusion checks + auto-close on hard_block
2. **P1 (follow-up):** GAP-VISIT-LIFECYCLE-001 — Wire visit close + fix panel + wire continuation
   - Wire `useCloseVisit()` to a dashboard action
   - Re-wire `onStartFromPrevious` to actual `StartFromPreviousModal`
   - Consider whether panel should show visits or slips (or both with grouping)
   - Add exclusion check to `startFromPrevious` service layer (defense-in-depth)

## Files Referenced

| File | Role |
|------|------|
| `hooks/visit/use-visit-mutations.ts:58-82` | `useCloseVisit()` — unused hook |
| `app/api/v1/visits/[visitId]/close/route.ts` | Visit close API — functional |
| `components/pit-panels/closed-sessions-panel.tsx` | Shows closed slips, not visits |
| `components/pit-panels/panel-container.tsx:305` | Miswires `onStartFromPrevious` to `onSlipClick` |
| `components/pit-panels/pit-panels-client.tsx:424` | `handleSlipClick` opens slip modal |
| `components/player-sessions/start-from-previous-modal.tsx` | Built, not wired |
| `components/player-sessions/start-from-previous.tsx` | Built, not wired |
| `app/review/start-from-previous/page.tsx` | Mock-only consumer |
| `services/visit/crud.ts:592-716` | `startFromPrevious()` — no exclusion check |
| `hooks/rating-slip/use-closed-slips-for-gaming-day.ts` | Queries closed slips |
| `app/api/v1/rating-slips/closed-today/route.ts` | Closed slips API |
