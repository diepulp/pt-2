Three critical findings that change the plan significantly.

### Finding 1: SeatContextMenu is not integrated

`SeatContextMenu` exists as a component but is **never rendered**. The seats in `TableLayoutTerminal` are plain `<button>` elements — clicking them either opens the rating slip modal (occupied) or the new-slip modal (empty). There is no dropdown/context menu on seats today.

The plan's "add End Visit to the seat context menu" approach is wrong — the menu doesn't exist in the production UI.

### Finding 2: Slip close is a compliance-critical multi-step RPC

Closing a rating slip via `rpc_close_rating_slip` is **not** a simple status update. It's an atomic transaction that:

1. Closes any open pause intervals
2. Computes `duration_seconds` excluding paused time
3. Reads the immutable `policy_snapshot` (frozen at slip creation)
4. Calculates theoretical win via `calculate_theo_from_snapshot()`
5. Materializes `computed_theo_cents` (required by `chk_closed_slip_has_theo` CHECK constraint)
6. Writes an `audit_log` entry with full context

If we close a visit with an "End Visit" action and leave slips orphaned, the only recovery is gaming day rollover — which force-sets `computed_theo_cents = 0` (abandonment). That means **lost theo calculations and broken loyalty accrual** for slips that were legitimately active.

**Auto-closing slips MUST go through `rpc_close_rating_slip`** for each open slip — not a raw UPDATE. This preserves the compliance chain: duration, theo, audit trail, constraint satisfaction.

### Finding 3: Start-From-Previous is compliance-safe as designed

The `startFromPrevious` service creates a **new visit** + **new slip** via `rpc_start_rating_slip`. The new slip gets:
- Fresh `policy_snapshot` from the destination table's game settings
- Own `start_time`, `accrual_kind`, and `audit_log` entry
- A `visit_group_id` inherited from the source for history linkage only

This does **not** reopen a closed slip or visit. It doesn't violate temporal integrity. The compliance chain stays intact because each slip is a self-contained segment with its own policy snapshot.

The risk in the current miswiring is **not** that it breaks compliance but that it **dead-ends** — clicking a closed slip opens the rating slip viewer (read-only), which is confusing but harmless. The fix correctly routes to a new-visit-creation flow.

---

### Revised plan implications

| Original plan item | Issue | Revision needed |
|---|---|---|
| "End Visit" in seat context menu | Menu doesn't exist | Move to rating slip modal — add "End Visit" alongside existing "Close Session" |
| Auto-close slips out of scope | Orphans break compliance | Must close all open/paused slips via `rpc_close_rating_slip` before closing visit |
| Start-From-Previous wiring | Compliance-safe as designed | No change — still creates new visit + new slip with fresh policy snapshot |
| Exclusion check in startFromPrevious | Defense-in-depth | No change |

**The key architectural change**: "End Visit" becomes a **compound action** — close all open slips for the visit (through the RPC, preserving theo/audit), then close the visit itself. The UI integration point is the rating slip modal, not a nonexistent context menu.

Want me to revise the plan document with these corrections?