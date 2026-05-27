
---

## Confirmed: Split Brain — Two Independent Win/Loss Streams

You're correct. The system has two structurally separate win/loss calculations with different gates, different formulas (diverging sign conventions), and different data sources. They share the label "Win/Loss" on screen.

---

### Stream 1 — Session Rundown (`rpc_compute_table_rundown` / `rpc_persist_table_rundown`)

**Consumer**: Pit terminal rundown panel, close session dialog.

**Formula** (from `20260117153727_adr027_rpc_rundown.sql:173`):
```
table_win_cents = closing + credits + drop - opening - fills
```

**Gate**: Returns `NULL` if `drop_posted_at IS NULL OR drop_total_cents IS NULL`. Hard stop — no drop, no number.

**Drop source**: Manually posted via `rpc_post_table_drop_total`. There is no automated path — `table_drop_event` records physical box custody transfer but does NOT populate `drop_total_cents`. The dollar figure must be entered by accounting after the physical soft count, which in a real casino happens hours after the drop.

---

### Stream 2 — Shift Dashboard (`rpc_shift_table_metrics`)

**Consumer**: `HeroWinLossCompact` on the shift dashboard left rail (`shift-dashboard-v3.tsx:197`) uses `win_loss_estimated_total_cents`.

**Two sub-streams** (from `20260219164631_prd036_shift_metrics_opening_baseline.sql:315-330`):

```sql
-- Inventory stream (tray delta only)
win_loss_inventory = (closing - opening) - fills + credits

-- Estimated stream (inventory + telemetry buy-ins)
win_loss_estimated = (closing - opening) - fills + credits + estimated_drop_buyins
```

**Gate**: Returns `NULL` only if both opening baseline AND closing snapshot are missing. No drop posting required.

**Opening baseline**: PRD-036 4-tier cascade — `snapshot:prior_count` → `bootstrap:par_target` → `fallback:earliest_in_window` → `none`. The par bootstrap (Source C) means a table with no snapshot at all still yields a non-null number using `gaming_table.par_total_cents`.

**Drop substitute**: `estimated_drop_buyins` comes from `table_buyin_telemetry` — sum of `RATED_BUYIN + GRIND_BUYIN + RATED_ADJUSTMENT` records in the window. **This table has no automated bridge.** From the precis: "`player_financial_transaction` inserts do not populate telemetry. No 'Log Unrated Buy-in' button." So unless rating slip buy-ins route to `table_buyin_telemetry` (unclear), the "estimated" figure is just the inventory-only number with a misleading label.

---

### Divergence Map

| Dimension                     | Session Rundown                              | Shift Dashboard                                             |
| ----------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| **Gate to show number**       | Drop must be posted                          | Opening baseline exists (par fallback covers most tables)   |
| **Drop input**                | Manually posted cents (accounting)           | Sum of `table_buyin_telemetry` records (mostly unpopulated) |
| **Opening baseline**          | `OPENING` snapshot attached to session       | 4-tier cascade (may use par target)                         |
| **Sign convention**           | `closing + credits + drop - opening - fills` | `(closing - opening) - fills + credits + telemetry`         |
| **Algebraically equivalent?** | Yes, when drop = telemetry                   | Only if posted drop = actual telemetry sum                  |
| **Nullability**               | NULL during live play (no drop yet)          | Live non-null value from shift start                        |
| **Label on screen**           | "Win/Loss"                                   | "Win/Loss" (with ESTIMATE badge)                            |

---

### Current Drop Posture

The system has **three disconnected drop concepts** that don't talk to each other:

1. **`table_drop_event`** — physical custody record (box removed from table). Exists in schema. Does NOT populate `drop_total_cents` on the session.

2. **`drop_total_cents` on `table_session`** — manually posted by accounting via `rpc_post_table_drop_total`. The field `drop_custody_present` on the dashboard metrics is a boolean derived from whether a `table_drop_event` exists in the window — it does NOT mean the dollar amount was posted.

3. **`estimated_drop_buyins_cents`** on the dashboard — buy-in telemetry from `table_buyin_telemetry`, which is also unpopulated in practice.

The actual accounting chain is: physical drop → soft count (count room, hours later) → manually typed into system → `rpc_post_table_drop_total`. There is no automated ingestion at any step.

---

### Practical Effect

During a live shift, the **dashboard hero shows a non-null "Win/Loss"** number because the inventory baseline cascade kicks in and uses tray deltas. The **pit terminal rundown shows NULL** for the same session because no drop has been posted.

After a session closes and drop is posted, the **session rundown recalculates** using actual chip snapshots + posted drop. It will likely diverge from the dashboard's estimate because:
- Dashboard may have used par bootstrap as opening baseline (not the actual opening count)
- Dashboard's "estimated drop" is either zero (no telemetry) or a running buy-in sum (not the same thing as cash in the box)

The two numbers are measuring different things with the same label. This isn't a bug per se — it's an architectural tradeoff explicitly noted in the precis under "Telemetry Pipeline Status: No automated bridge" — but the UX doesn't surface this distinction clearly enough for operators to know which number to trust.