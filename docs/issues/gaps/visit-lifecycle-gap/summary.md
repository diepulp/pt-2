

## Visit Lifecycle Gap — Intent Alignment Summary

### What exists today

The **backend is complete**: visit close API, start-from-previous API + service, RPCs, hooks — all functional and tested. The **frontend is half-wired**: components exist (`StartFromPreviousModal`, `StartFromPreviousPanel`, `useCloseVisit`) but nothing connects them to the operator's dashboard.

### What the plan delivers

**1. Operator can check out a player (Gap 1)**

Today there is no way for a pit boss to end a patron's visit. Visits persist until gaming-day rollover or exclusion auto-close. The plan adds an **"End Visit" action** to the seat right-click menu. Operator confirms → visit closes → seat frees up → dashboard refreshes. Uses the existing `useCloseVisit()` hook that's been sitting unused.

**2. "Closed Sessions" panel stops lying about what it shows (Gap 2)**

The panel is labeled "Closed Sessions" but actually shows **closed rating slips** (table segments). A player who moved between 3 tables shows as 3 "sessions." The plan renames it to **"Closed Slips"** with updated copy throughout. No data change — just honest labeling.

**3. "Start From Previous" actually works (Gap 3)**

The continuation flow is fully built but miswired. Clicking a closed slip in the panel currently opens the rating slip viewer (read-only dead end) instead of the continuation modal. The plan:

- **Rewires the callback** so clicking a closed slip opens the real `StartFromPreviousModal` with the player's visit-level session history
- **Adds a "pending continuation" UX**: operator picks which visit to continue → modal closes → toast says "select an empty seat" → operator clicks a seat → new visit + slip created at that seat
- This avoids building a new table/seat picker by reusing the existing seat-click flow

**4. Excluded players can't sneak back in via continuation (Gap 4)**

`startFromPrevious()` bypasses `rpc_start_or_resume_visit`, so its exclusion gate never fires. A hard-blocked player could get a new visit through this path. The plan adds a `getExclusionStatus()` check before visit creation — defense-in-depth alongside the RPC-level gate.

### What's NOT in scope

- Converting the Closed Slips panel to show visit-level grouping (would need a new API/RPC)
- Auto-closing active slips when ending a visit (visit close and slip close remain separate actions)
- Table/seat picker component (reusing seat-click instead)

### Operator workflow after implementation

```
End a visit:     Seat menu → "End Visit" → confirm → done
Continue a visit: Closed Slips tab → click slip → pick visit → click empty seat → playing
```

Does this align with your intent, or do you want to adjust scope before we execute?