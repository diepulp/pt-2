

Here's the precis of the open/close state and its relationship to snapshots:

---

## Session Open/Close State Precis

### OPEN state: Aspirational, not implemented

The `OPEN` enum value exists in Postgres but **no code path writes it**. `rpc_open_table_session` inserts directly as `ACTIVE`. The "awaiting opening snapshot" gate that `OPEN` was reserved for does not exist.

**Opening a session requires:**
- `gaming_table.status = 'active'` (D3 availability gate)
- No existing non-closed session on the table (unique partial index)
- That's it. No snapshot. No par. No preconditions.

**Opening snapshot is entirely optional.** If absent, the rundown formula substitutes `0` for opening bankroll — a silent degradation, not an error. The governance doc (`POLICY-SHIFT-WINLOSS-OPENING-BASELINE.md`) describes a "Source C" bootstrap from par as a fallback, but this is also not enforced — it's a recommended practice, not a system gate.

### CLOSED state: Requires one artifact, not specifically a snapshot

**Closing a session (standard) requires:**
- Session in `RUNDOWN` or `ACTIVE`
- At least one of: `drop_event_id` OR `closing_inventory_snapshot_id` (either/or, not both)
- `close_reason` (enum, 8 values)
- `close_note` when `close_reason = 'other'`
- `has_unresolved_items = false`

**You can close a session with only a drop event and zero snapshots.** The closing inventory snapshot is not mandatory — the "at least one artifact" check accepts a drop event alone. This means a session can go through its entire lifecycle (ACTIVE → RUNDOWN → CLOSED) without a single inventory snapshot ever being recorded.

**Force close requires even less:**
- Session in any non-closed state
- `close_reason`
- No artifacts required at all
- Sets `requires_reconciliation = true` and emits audit log

### Snapshot binding is retrospective, not prospective

Snapshots and sessions are **created independently and linked after the fact:**

```
Snapshot creation:  rpc_log_table_inventory_snapshot(table_id, type, chipset)
                    → creates snapshot row, no session_id required

Session close:      rpc_close_table_session(session_id, closing_inventory_snapshot_id)
                    → links previously-created snapshot to session

Rundown compute:    rpc_compute_table_rundown(session_id)
                    → looks up snapshots by session_id FK OR by session.opening/closing_inventory_snapshot_id
                    → if opening missing: opening_total = 0
                    → if closing missing: closing_total = 0
                    → if drop not posted: table_win = NULL (honest NULL)
```

Two FK paths coexist: `snapshot.session_id` (newer, ADR-027) and `session.opening/closing_inventory_snapshot_id` (original). The rundown RPC checks both.

### The rundown formula and what it actually needs

```
table_win = closing_bankroll + credits + drop - opening_bankroll - fills
```

| Input | Source | Required? | If missing |
|---|---|---|---|
| Opening bankroll | Opening snapshot `total_cents` | No | Coalesced to 0 |
| Closing bankroll | Closing snapshot `total_cents` | No | Coalesced to 0 |
| Fills total | `table_session.fills_total_cents` | Always present | Default 0 |
| Credits total | `table_session.credits_total_cents` | Always present | Default 0 |
| Drop total | `table_session.drop_total_cents` + `drop_posted_at` | No | `table_win = NULL` |

**Drop posting is the only hard gate for win computation.** Without it, `table_win_cents` is honestly NULL. Everything else degrades silently to zero.

### Relationship to close scenarios

**End-of-shift close (normal):**
1. Pit boss captures closing snapshot (optional but recommended)
2. Pit boss logs drop event
3. Pit boss starts rundown → RUNDOWN
4. Pit boss posts drop total via `rpc_post_table_drop_total`
5. Pit boss closes session → CLOSED with inline rundown persisted
6. Win/loss computed with whatever data exists

**Hard close (emergency, low demand, etc.):**
1. Pit boss force-closes → CLOSED immediately
2. No snapshot, no drop, no rundown computation
3. `requires_reconciliation = true` — flagged for post-shift review
4. `table_win_cents = NULL`

**Gaming day rollover:**
- **Not automated.** No auto-close, no auto-reopen.
- `crossed_gaming_day` flag exists but is never set by any RPC
- `rolled_over_by_staff_id` column exists but is permanently NULL
- In practice, the pit boss manually closes the old session and opens a new one
- Rating slips DO auto-close at gaming day boundary (ADR-026); sessions do not

### The OPEN state's intended future

If the `OPEN` → `ACTIVE` gate were activated, the lifecycle would become:

```
rpc_open_table_session → status = OPEN (session exists, no snapshot yet)
rpc_record_opening_snapshot → status = ACTIVE (snapshot captured, play begins)
```

This would make the opening snapshot a **hard requirement before play starts** — a significant operational change from the current "open and go" behavior. The governance docs recommend it but don't demand it. The enum value is reserved for this; the code does not enforce it.

---

**Bottom line:** The system is permissive by design. Opening snapshots are optional. Closing snapshots are interchangeable with drop events. Force-close requires nothing but a reason. The OPEN state is a dormant gate that would tighten the opening sequence if activated. Rollover is manual. The only hard computation gate is drop posting — without it, win/loss stays honestly NULL rather than producing a wrong numbesa