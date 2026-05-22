## MTL ↔ Rating-Slip Bridge — Downstream Consumer Posture

Investigation complete. The bridge itself is coherent; the gap lives entirely on the **read-side / cache-invalidation plane**.

### A. Bridge (server) — GREEN

Two AFTER-INSERT triggers on `player_financial_transaction`, both widened for adjustments/reversals:

| Trigger | Target | Gate | Fires for |
|---|---|---|---|
| `trg_derive_mtl_from_finance` | `mtl_entry` | `source='pit' AND direction NOT NULL AND (tender_type IN ('cash','chips') OR txn_kind IN ('adjustment','reversal'))` | originals + adjustments (negative amounts OK) |
| `trg_bridge_rated_buyin_telemetry` | `table_buyin_telemetry` | `(direction='in' + rating_slip_id)` OR `(txn_kind='adjustment' + rating_slip_id)` | `RATED_BUYIN` + `RATED_ADJUSTMENT` |

`rpc_create_financial_adjustment` inherits `rating_slip_id` from the original txn so the telemetry bridge fires on rated corrections. `rpc_shift_table_metrics` aggregates both kinds into `estimated_drop_rated_cents`. Last corrective migration was `20260218233652_fix_dual_telemetry_bridge_trigger.sql` (100× inflation fix).

### B. Client invalidation — ASYMMETRIC (the real gap)

| Write path | MTL | shift-dashboard metrics | cash-obs rollups | shift-intelligence alerts |
|---|---|---|---|---|
| `useSaveWithBuyIn` `hooks/rating-slip-modal/use-save-with-buyin.ts:224` | ✅ | ❌ | ❌ | ❌ |
| `useCreateFinancialAdjustment` `hooks/player-financial/use-financial-mutations.ts:121` | ✅ | ⚠ `summary.scope + allMetrics()` only | ❌ | ❌ |
| `useCreateFinancialTransaction` `hooks/player-financial/use-financial-mutations.ts:57` | ❌ | ❌ | ❌ | ❌ |

The **primary floor surface** (rating-slip modal → buy-in) never invalidates any `shiftDashboardKeys.*`. Adjustments partially invalidate metrics but miss `allCashObs()` and `alerts`.

### C. Realtime posture — INCOMPLETE

`hooks/dashboard/use-dashboard-realtime.tsx` subscribes to `gaming_table`, `rating_slip`, `table_fill`, `table_credit`. **No subscription on** `player_financial_transaction`, `mtl_entry`, `table_buyin_telemetry`, `pit_cash_observation`, `shift_anomaly_alert` — matches PRD-064 §Deferred ("Realtime subscription on `mtl_entry`").

### D. Read-side staleness

`useShiftTableMetrics` uses `staleTime: 60_000` + `refetchOnWindowFocus: true`. Floor supervisor sees stale drop/win-loss up to 60s after a buy-in mod, longer if the dashboard window stays focused.

### Compliance/Reporting Integrity Assessment

- **Server truth is correct** the instant the bridge fires; downstream RPCs re-read it on every call.
- **UI truth lags** for: (1) shift-dashboard metrics after ANY modal-driven buy-in, (2) cash-obs rollups + anomaly alerts after BOTH buy-ins and adjustments, (3) any `useCreateFinancialTransaction` path (cashier/alt flows — invalidates only `playerFinancialKeys.*`).
- **Pit-cash-observation** written by the chips-taken step of `useSaveWithBuyIn` has zero downstream invalidation.

### Recommended next step (for user to direct)

Write a narrow PRD that covers the read-plane gap only — three discrete patches: (1) add `shiftDashboardKeys.all()` + `shiftDashboardKeys.allCashObs()` invalidation to the three write hooks; (2) realtime sub on `mtl_entry`/`table_buyin_telemetry` filtered by `casino_id`; (3) decide between polling vs. realtime for `shift_anomaly_alert`. Do **not** conflate with PRD-065 (ADR-049 packaging) — that's write-plane work.

Want me to (a) draft that PRD, (b) expand this into `docs/issues/mtl-rating-slip-glitch/DOWNSTREAM-CONSUMER-POSTURE.md`, or (c) drill into a specific surface first?