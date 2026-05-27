I have everything I need. Here's the full answer.

---

## 1. Win/Loss Calculation — Explicit Formula

Yes, there is an explicit, identical formula used in **two** places: the live computation RPC and the persist RPC.

**Formula** (in both `rpc_compute_table_rundown` and `rpc_persist_table_rundown`):

```
table_win_cents =
    closing_total_cents
  + credits_total_cents
  + drop_total_cents
  - opening_total_cents
  - fills_total_cents
```

Implementation at `20260117153727_adr027_rpc_rundown.sql:170-179`:
```sql
table_win_cents :=
  COALESCE(v_closing, 0)
  + COALESCE(v_session.credits_total_cents, 0)
  + v_session.drop_total_cents
  - COALESCE(v_opening, 0)
  - COALESCE(v_session.fills_total_cents, 0);
```

**Critical gate**: `table_win_cents` is **`NULL`** unless both `drop_posted_at IS NOT NULL` AND `drop_total_cents IS NOT NULL`. The system explicitly refuses to surface a win/loss number when the drop is unposted — the code labels this "PATCHED behavior" (`rundown.ts:8`, `20260117153727_adr027_rpc_rundown.sql:168-178`). The dashboard will never show a misleading figure if the drop hasn't been entered.

**Where the inputs come from:**

| Input                 | Source                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `opening_total_cents` | `table_inventory_snapshot.total_cents` (OPENING snapshot), fallback to `SUM(count * denom)` from chipset JSON |
| `closing_total_cents` | `table_inventory_snapshot.total_cents` (CLOSING snapshot), same fallback                                      |
| `fills_total_cents`   | Accumulated on `table_session` during live play                                                               |
| `credits_total_cents` | Accumulated on `table_session` during live play                                                               |
| `drop_total_cents`    | Manually posted via `rpc_post_table_drop_total` (no soft-count integration yet)                               |

The persisted report (`table_rundown_report`) also computes:
```
variance_from_par_cents = table_win_cents - par_target_cents
```
where `par_target_cents` is read from `gaming_table.par_total_cents` at persist time (`20260224123754_prd038_rundown_rpcs.sql:180-188`).

---

## 2. How 'Need' vs Win/Loss Are Differentiated

They are **categorically different concepts** — a target vs. a result.

### `need_total_cents` — the par/target

- **What it is**: The casino's target bankroll (par) for the table, snapshotted at the moment the session opens.
- **Where it comes from**: Read from `gaming_table.par_total_cents` during `rpc_open_table_session`, then copied to `table_session.need_total_cents` (`20260117153726_adr027_rpc_session_mode_binding.sql:46,86`). It is static for the life of the session.
- **Semantic meaning**: "What bankroll does this table need to operate?" — the imprest par target, not a computed result.
- **In the `IMPREST_TO_PAR` bank mode**: The pit boss would be expected to fill/credit the tray back to this value before closing. In `INVENTORY_COUNT` mode, the tray is simply counted as-is.
- **MVP caveat**: The migration comment (`20260117153430_adr027_table_bank_mode_schema.sql:36`) explicitly marks this as `'Advisory only in MVP'`. Bank mode is informational — it doesn't alter the close computation logic yet.

### `table_win_cents` — the session outcome

- **What it is**: The computed financial result of the session (house win or loss).
- **When it exists**: Only after drop is posted; `NULL` before that.
- **How it flows**: Computed by RPC → returned in `TableRundownDTO` → UPSERT'd into `table_rundown_report` at session close.

### The relationship between the two

| Concept                   | Type       | Timing                            | Mutates?                                |
| ------------------------- | ---------- | --------------------------------- | --------------------------------------- |
| `need_total_cents`        | Target/par | Set at session open               | No (static snapshot)                    |
| `table_win_cents`         | Result     | Computed at/after session close   | Yes (recomputed on each persist/update) |
| `variance_from_par_cents` | Delta      | Computed when report is persisted | Yes                                     |

The `variance_from_par_cents` in `table_rundown_report` is the bridge: it answers "how far did the actual result deviate from the par target?" But `need` itself never appears in the win/loss formula — it only serves as a display target for the `IMPREST_TO_PAR` workflow and as the baseline for `variance_from_par_cents`.