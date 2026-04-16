# FIB-H — Pilot-Bounded Exceptions Panel Realtime Wiring

## A. Feature identity
- **Feature title:** Exceptions Panel Realtime Wiring
- **Feature ID:** FIB-RT-EXC-001
- **Status:** Proposed
- **Project:** PT-2 / Casino Player Tracker
- **Date:** 2026-04-15
- **Owner intent:** Replace cyclic polling fatigue in the Exceptions panel with narrowly scoped realtime updates for fills and credits.

## B. Operator problem
The Exceptions panel currently refreshes from three independent data sources with mismatched cadences. The Approvals tab polls every 15 seconds, Alerts polls every 30 seconds, and Flags refreshes only on focus. The panel has no Supabase Realtime subscription for `table_fill`, `table_credit`, or cash observation inputs, so the interface re-renders on schedule rather than on meaningful change.

For the operator, this creates visual fatigue without informational gain: tab counts flicker, status animation restarts, and scroll continuity may be disrupted. The panel behaves like it is shouting for attention even when nothing materially changed.

## C. Pilot fit
This is pilot-fit because it removes operator friction in an already deployed surface without expanding product scope into a generalized platform initiative.

Why now:
- The pain is concrete and user-facing.
- The relevant events are already conceptually defined.
- The current workaround is operationally noisy.
- A narrow slice can validate whether realtime meaningfully improves usability before any broader infrastructure investment.

Why not broader:
- The pilot does **not** need the full ADR-004 canonical infrastructure implemented end to end.
- The pilot does **not** require converting every dashboard widget to realtime.
- The pilot does **not** justify a generalized channel registry and invalidation framework unless this slice proves out.

## D. Actor and moment
### Primary actors
- Floor operator reviewing Exceptions panel
- Shift supervisor monitoring pending fills/credits
- Developer/operator validating whether panel updates are event-driven and visually stable

### Triggering moment
An approval request is created or completed for a fill or credit while the Exceptions panel is open. The operator should see the relevant panel state update because something changed, not because a timer fired.

## E. Containment loop
### In scope
- Add realtime subscription coverage for `table_fill` and `table_credit` events relevant to the Exceptions panel.
- Reconcile those events through TanStack Query cache for the Approvals dataset.
- Reduce or remove the 15-second polling dependency for Approvals once event reliability is verified.
- Preserve existing panel behavior for Alerts and Flags unless directly required for safe integration.
- Ensure the panel updates without gratuitous animation churn or scroll disruption.

### Success loop
1. A fill/credit request is inserted or updated.
2. Realtime listener receives the event.
3. The Approvals query cache is patched or invalidated in a bounded way.
4. The visible Approvals state updates with less UI churn than timer-based polling.
5. Operator trust improves because the panel changes only when something actually happened.

## F. Required outcomes
1. **Event-driven approvals updates:** Requested/completed fill and credit changes are reflected in the Exceptions panel without relying primarily on 15-second polling.
2. **Reduced visual churn:** No gratuitous tab-count flicker, pulse restarts, or avoidable scroll resets caused by scheduled refreshes.
3. **Pilot-bounded implementation:** The solution remains local to the Exceptions panel path and does not pull the entire dormant realtime canon into scope.
4. **Safe cache reconciliation:** Event handling integrates through TanStack Query in a way consistent with current client-state patterns.
5. **Fallback preserved during verification:** A temporary guarded polling fallback may remain during rollout if needed, but the target operating mode is event-driven Approvals updates.

## G. Explicit exclusions
This feature does **not** include:
- Full implementation of ADR-004 realtime architecture
- Shared channel registry
- Shared invalidation scheduler
- Generic `useRealtimeSubscription` abstraction for the app
- Realtime conversion of Alerts tab
- Realtime conversion of Flags tab
- Realtime overhaul of all shift dashboard widgets
- Broader dashboard redesign, animation redesign, or styling refresh
- New metrics, new alerts, or new operational business rules

## H. Adjacent ideas considered and rejected
### Rejected for this slice
- **Implement all of ADR-004 now:** architecturally elegant, pilot-hostile
- **Keep pure polling and just debounce rendering:** treats symptoms, not the source
- **Convert the whole Exceptions panel to realtime at once:** too much surface area for a targeted pain point
- **Introduce a new backend event bus:** unnecessary for current scope
- **Redesign the panel UI to hide flicker:** cosmetics instead of operational correction

## I. Dependencies and assumptions
### Dependencies
- Existing Supabase Realtime capability is available for the relevant tables.
- Current Approvals query path is already isolated enough to be invalidated or patched independently.
- Event types for fill/credit state changes can be mapped cleanly to the current data model.

### Assumptions
- The dominant operator pain is the Approvals tab refresh churn.
- Alerts and Flags can remain on current strategies without blocking pilot value.
- Realtime delivery volume for this slice is low enough that direct panel-scoped handling is acceptable.
- Query reconciliation can stay local without first introducing generalized realtime infrastructure.
- Reconnection resilience relies on the polling fallback rather than ADR-004's prescribed reconnection stack (§5). The guarded polling interval provides an equivalent safety net for this pilot scope; the full reconnection/backoff/predicate-revalidation layer is deferred with the rest of the canonical infrastructure.

## J. Likely next
If this slice succeeds, the next decision is not automatically “build the full canon.” The next decision is whether the measured benefit justifies extracting shared primitives from the local implementation.

Potential next steps after validation:
- Extract a reusable panel-scoped subscription helper
- Introduce micro-batched invalidation only if event burst behavior warrants it
- Expand realtime selectively to other high-irritation widgets

## K. Expansion trigger rule
Expand beyond this slice only if one or more of the following are true:
- The local implementation must be duplicated across multiple surfaces
- Event bursts create cache thrash or render instability
- Additional dashboard surfaces show the same polling-fatigue pattern with comparable operator cost
- Shared abstractions become cheaper than repeated local wiring

Absent those conditions, keep the solution narrow and slightly boring.

## L. Scope authority block
This FIB authorizes only a pilot-bounded implementation that replaces or reduces polling-driven churn for the Exceptions panel Approvals path using realtime updates for fill/credit events.

Any proposal that adds generalized realtime infrastructure, converts unrelated widgets, or reframes this as a platform initiative exceeds scope and requires a new intake or explicit amendment.
