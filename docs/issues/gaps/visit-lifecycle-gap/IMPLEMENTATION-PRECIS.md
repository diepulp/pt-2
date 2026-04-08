# Visit Lifecycle — Implementation Precis

**PRD-063 / EXEC-063** | Branch: `visit-lifecycle-gap` | 2026-04-07

---

## What changed

Three operator workflows that were missing or broken now work from the pit dashboard.

---

## 1. End Visit

A pit boss can now formally check out a player from inside the rating slip modal.

**Workflow:**
1. Pit boss clicks an occupied seat on the dashboard
2. Rating slip modal opens
3. Pit boss clicks **End Visit** (bottom row, alongside Pause / Close Session)
4. Confirmation dialog: *"End [Player Name]'s visit? This will close all active slips and check them out."*
5. On confirm: all open/paused slips for the visit are closed sequentially, then the visit itself is closed
6. Success toast: *"Visit ended — [Player Name] checked out"*
7. Modal closes, dashboard refreshes, seat frees up

**Failure behavior (RULE-2):** If any slip fails to close (e.g. RPC error), the visit stays open. Already-closed slips remain closed. The operator sees an error toast and can retry — the retry only attempts the remaining unclosed slips.

**Entry point:** Rating slip modal footer, visible when the slip is open or paused.

---

## 2. Start From Previous (rewired)

The continuation flow was fully built (PRD-017) but miswired — clicking a closed slip opened a read-only viewer instead of the continuation modal. Now it works end-to-end.

**Workflow:**
1. Pit boss opens the **Closed Slips** panel tab
2. Clicks any closed rated slip
3. The player's recent visit history loads and the **Start From Previous** modal opens
4. Pit boss selects which past visit to continue from
5. Modal closes. Toast: *"Select an empty seat to place [Player Name]"*
6. Pit boss clicks any empty seat on the table layout
7. A new visit and fresh rating slip are created at that seat
8. The new slip modal opens automatically

**Key rules:**
- The closed slip is the entry point only — player context is resolved from it, but the continuation is at the visit level (RULE-3)
- Only visits that are closed, within the 7-day recency window, and have at least one segment are shown as eligible (DEC-003)
- Clicking an occupied seat does nothing while a continuation is pending — only empty seats complete the flow
- The pending context clears on: successful placement, modal dismiss, or page navigation (DEC-002)

---

## 3. Closed Slips Terminology

The panel formerly titled "Closed Sessions" now reads **"Closed Slips"** throughout — title, badge count, loading state, error state, empty state, and summary footer. This matches what the panel actually displays (individual rating slip segments, not visit-level sessions). Component and file names are unchanged.

---

## What is NOT here

- **No new database migrations, RLS policies, or RPCs.** All backend plumbing existed; this is wiring and orchestration.
- **No seat context menu integration.** End Visit is accessed from the rating slip modal, not from a seat right-click.
- **No visit-level grouping in the Closed Slips panel.** The panel still shows individual slip rows, not grouped-by-visit. A grouping view would need a new RPC.
- **No closure-reason distinction.** All closed visits within the recency window are shown as continuation-eligible regardless of how they were closed (operator checkout, gaming-day rollover, exclusion auto-close). Deferred per DEC-003.
- **No exclusion defense-in-depth in Start From Previous.** The existing `startFromPrevious` service validates constraints (source closed, no open visit, seat available) but does not re-check exclusion status. The exclusion gate fires at the RPC layer when the first rating slip is created.
