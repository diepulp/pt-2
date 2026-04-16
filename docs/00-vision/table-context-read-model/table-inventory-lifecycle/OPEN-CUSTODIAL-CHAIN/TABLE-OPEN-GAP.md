Now I have the complete picture. Here's the investigation summary:

---

## Investigation: Table Lifecycle Workflow Gap — Session Gate Regression

### The Bug

**Migration `20260329173121_add_exclusion_enforcement_to_slip_rpcs.sql` regressed the PRD-057/PRD-059 session gates** from `rpc_start_rating_slip` and introduced no session gate in `rpc_move_player`.

### Root Cause

The exclusion enforcement migration used **stale baselines**:

| RPC | Exclusion baseline | Should have been |
|---|---|---|
| `rpc_start_rating_slip` | `20260318131945` (snapshot_rounding_policy) | `20260326020531` (PRD-059 session gate) |
| `rpc_move_player` | `20260307114918` (ADR-039 theo) | same + session gate needed |

Both baselines predate PRD-057 (`20260325`) and PRD-059 (`20260326`), which added the critical session gate:

```sql
-- This block was in PRD-059 but is MISSING from the current active RPC:
IF NOT EXISTS (
  SELECT 1 FROM table_session
  WHERE gaming_table_id = p_table_id
    AND casino_id = v_casino_id
    AND status IN ('ACTIVE', 'RUNDOWN')
) THEN
  RAISE EXCEPTION 'NO_ACTIVE_SESSION'
    USING ERRCODE = 'P0007';
END IF;
```

### What's Broken (current state)

| Guard | Status |
|---|---|
| `rpc_close_table_session` blocks on open slips (`has_unresolved_items`) | **Working** — PRD-057 guard intact |
| `rpc_start_rating_slip` blocks on CLOSED table session | **REGRESSED** — session gate dropped by exclusion migration |
| `rpc_move_player` blocks on CLOSED destination session | **Never implemented** — PRD-057/059 never added it |
| `rpc_check_table_seat_availability` blocks on no active session | **Working** — exclusion migration didn't touch it |

### What's NOT Broken

- `gaming_table.status = 'active'` check is still present in `rpc_start_rating_slip` (line 104-111 of exclusion migration)
- `rpc_check_table_seat_availability` still has the session gate from PRD-059 (untouched)
- The close-side guard (`has_unresolved_items`) in `rpc_close_table_session` is intact

### The Asymmetry

The close path correctly blocks: "you can't close a session with open rating slips." But the inverse — "you can't open a rating slip on a closed session" — was added in PRD-057/059 and then **silently dropped** 3 days later by the exclusion enforcement migration.

### Fix Required

A new migration that re-applies the session gate to **both** RPCs:

1. **`rpc_start_rating_slip`**: Re-add the `table_session` check for `status IN ('ACTIVE', 'RUNDOWN')` between the `TABLE_NOT_ACTIVE` check and the policy snapshot build — using the current exclusion-enforcement version as baseline
2. **`rpc_move_player`**: Add a new session gate for the **destination** table (`p_new_table_id`) — this was never implemented, creating a second vector for the same bug

### Also Noted (LSP diagnostics)

`services/rating-slip/crud.ts` has unused parameters at lines 170-171 (`casinoId`, `actorId` in `start()`) — these became dead code when pre-validation was removed (PERF-005 WS6), since the RPC derives context from `set_rls_context_from_staff()`.