# Investigation Team Report — Financial Surface Freshness Contract

Four parallel investigation streams completed. Consolidated map below.

---

## 1. Write → Derivation Graph (ground truth)

```
                  ┌────────────────────────┐
                  │ player_financial_      │  ← authoritative write
                  │ transaction (PFT)      │    rpc_create_financial_txn()
                  └──────┬─────────┬───────┘
                         │         │
      trg_bridge_        │         │  trg_derive_mtl_
      finance_to_        │         │  from_finance
      telemetry          ▼         ▼
                  ┌────────────┐ ┌────────────┐
                  │ table_     │ │ mtl_entry  │
                  │ buyin_     │ │            │
                  │ telemetry  │ │            │
                  │ (TBT)      │ │            │
                  └─────┬──────┘ └─────┬──────┘
                        │              │
                   ┌────▼──────────────▼──────────────┐
                   │ rpc_shift_table_metrics(TBT)     │
                   │ rpc_mtl_* / gaming_day_summary    │
                   │ rpc_player_timeline               │
                   └──────────────────────────────────┘

  pit_cash_observation   ← independent operational write
                          NO trigger into PFT / TBT / MTL
                          (telemetry, not accounting)
```

**RLS posture (all derived read tables are Pattern C, direct `casino_id`):** PFT, TBT, MTL, pit_cash_observation — all **safe for realtime** at WAL-evaluation time. No `EXISTS`-subquery leakage issues confirmed for any candidate subscription target.

**⚠ Verification item:** Investigators disagree on publication posture. No `ALTER PUBLICATION supabase_realtime ADD TABLE` migration exists anywhere in `supabase/migrations/`. Realtime agent assumed default-includes-all; that is incorrect — the default Supabase publication is empty unless tables are added via migration or dashboard. **Status of PFT / TBT / MTL / pit_cash_observation in the publication must be verified via `pg_publication_tables` before any subscription work.**

---

## 2. Consumer Surface Registry

| Surface                  | File                                                         | Hooks                                                                                | Proposed Class                  | Realtime today?                                                                 |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------- |
| Pit Dashboard            | `components/dashboard/pit-dashboard-client.tsx`              | `useDashboardTables`, `useDashboardStats`, `useActiveSlipsForDashboard`              | **LIVE**                        | ✅ `useDashboardRealtime` → gaming_table, rating_slip, table_fill, table_credit |
| Exceptions/Approvals     | `components/pit-panels/exceptions-approvals-panel.tsx`       | `useExceptionsData`                                                                  | **LIVE**                        | ✅ piggybacks on `useDashboardRealtime`                                         |
| Shift Dashboard          | `components/shift-dashboard/shift-dashboard-page.tsx` (+ v3) | `useShiftDashboardSummary`, `useCashObsSummary`, `useShift{Table,Pit,Casino}Metrics` | **LIVE** (operational judgment) | ❌ **none**                                                                     |
| MTL Compliance           | `components/mtl/compliance-dashboard.tsx`                    | `useGamingDaySummary`, `usePatronDailyTotal`                                         | **LIVE** (31 CFR § 1021.311)    | ❌ **none**                                                                     |
| Closed Sessions          | `components/pit-panels/closed-sessions-panel.tsx`            | `useClosedSlipsForGamingDay`                                                         | INTERVAL                        | ❌                                                                              |
| Analytics                | `components/pit-panels/analytics-panel.tsx`                  | `useTableCoverage`, `useTableSlipAnalytics`                                          | MANUAL                          | ❌                                                                              |
| Player Timeline          | `app/(dashboard)/players/[playerId]/timeline/...`            | `useGamingDaySummary`, `useMtlEntries`                                               | MANUAL                          | ❌                                                                              |
| Rating-slip modal totals | `hooks/rating-slip-modal/*`                                  | `useVisitFinancialSummary`, `useRatingSlip`                                          | INTERVAL                        | ❌                                                                              |

Two surfaces classified as load-bearing for operator judgment — shift-dashboard and MTL compliance — have **zero realtime coverage today**.

---

## 3. Mutation → Invalidation Matrix (the ad hoc layer the memo calls out)

| Mutation                                            | Invalidates shift-dash?         | Invalidates MTL?                | Factory-only keys?                                       |
| --------------------------------------------------- | ------------------------------- | ------------------------------- | -------------------------------------------------------- |
| `useCreateFinancialAdjustment`                      | ✅ `summary.scope + allMetrics` | ✅ `entries + gamingDaySummary` | ✅                                                       |
| `useCreateFinancialTransaction` (buy-in / cash-out) | **❌**                          | **❌**                          | ✅                                                       |
| `useSaveWithBuyIn`                                  | **❌**                          | ✅ (MTL only, WS7)              | ✅                                                       |
| `useCloseWithFinancial`                             | **❌**                          | ❌                              | ✖ inline loyalty key @ `use-close-with-financial.ts:221` |
| `useMovePlayer`                                     | ❌                              | ❌                              | ✖ inline loyalty key @ `use-move-player.ts:305`          |
| `useCashOutCreate` / `useVoidCashOut`               | ❌                              | ❌                              | ✅                                                       |
| `useConfirmFill` / `useConfirmCredit`               | ❌                              | ❌                              | ✅                                                       |
| `useCreateMtlEntry` (backward bridge → PFT)         | ❌                              | ✅                              | ✅                                                       |
| `useUpdateAverageBet`                               | n/a                             | n/a                             | `setQueryData` only — **no invalidation**                |

**The memo's core diagnosis is empirically verified:** `useCreateFinancialAdjustment` is the *only* write path that talks to shift-dashboard today. Every other financial write path relies on the 30–60s stale window + window-focus refetch. Hence the "works for adjustments, stale for buy-ins" pattern.

---

## 4. Additional Systemic Issues Discovered

1. **Frozen-window bug is not unique to shift-dashboard.** `hooks/dashboard/use-exceptions-data.ts:149-150` freezes an 8-hour window at mount with the same `useState(() => ...)` pattern. Same failure mode, different surface.
2. **Dual cache keys for the same data.** `ratingSlipKeys.activeForTable(tableId)` (used by rating-slip mutations) and `dashboardKeys.activeSlips(tableId)` (used by pit dashboard) read the same underlying rows. Mutations only invalidate one. Currently masked because `useDashboardRealtime` re-invalidates the dashboard keys on rating_slip WAL events; remove realtime and the split cache becomes visible.
3. **Ad hoc key extension without factory.** `hooks/cashier/use-patron-transactions.ts:38-44` extends `playerFinancialKeys.list.scope` with inline segments.
4. **Inline loyalty keys** in two rating-slip-modal hooks — break silently if `loyaltyKeys` reshapes.
5. **`useSaveWithBuyIn` is not registered anywhere as a shift-dashboard producer**, yet operators treat its output as a shift metric. This is the C3 gap the investigation memo called out, now reconfirmed.
6. **`pit_cash_observation` is upstream of no bridge.** It never feeds TBT or MTL. The shift-dashboard cash-obs cards read it directly via its own RPC path, so any freshness contract has to treat pit_cash_observation as *its own* canonical event source, not as derived from TBT.

---

## 5. Contract Skeleton Supported by the Evidence

Based on the map, the Financial Surface Freshness Contract (the ADR the memo calls for) should declare:

| Freshness domain                            | Canonical event source                      | Rationale from evidence                                                     |
| ------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| Shift-dashboard win/loss + est. drop        | **`table_buyin_telemetry`**                 | RPC already reads TBT; Pattern C RLS direct; matches ALTERNATE-DIRECTION.md |
| MTL compliance + patron daily totals        | **`mtl_entry`**                             | RPC reads `mtl_gaming_day_summary` view over MTL; Pattern C RLS direct      |
| Pit cash observation rollups                | **`pit_cash_observation`**                  | No upstream derivation; direct write                                        |
| Pit dashboard occupancy + pending approvals | `rating_slip`, `table_fill`, `table_credit` | Already covered by `useDashboardRealtime`                                   |

Mandatory rules the evidence supports:
- **Explicit publication membership** — add a migration that `ALTER PUBLICATION supabase_realtime ADD TABLE` for every canonical event source. Stop relying on ambient default behavior.
- **No inline invalidation keys** — factory-only. Lint rule candidate.
- **Window-correctness proof** — every financially-responsible query must document how its window advances to include post-mount rows (fixes shift-dashboard C1 and exceptions-panel twin).
- **Single-factory-per-read** — reconcile `ratingSlipKeys.activeForTable` vs `dashboardKeys.activeSlips` (and audit for other duplicates).
- **Consumer registry in-repo** — surface → {canonical event, freshness class, realtime hook name}. Lives alongside the ADR; referenced by the lint rule.

---

## Next Moves

The immediate shift-dashboard fix (WS1 rolling window + WS2 TBT subscription) remains correct per ALTERNATE-DIRECTION.md; the map now justifies making it the template rather than a one-off.

Want me to:
1. Draft the **ADR — Financial Surface Freshness Contract** using this evidence as the source map, and
2. Revise **EXEC-066** to swap WS0 (PFT RLS remediation) for the explicit-publication migration + TBT subscription retarget, deferring PFT RLS cleanup to a separate SEC artifact?

Both can be parallel. The ADR is the standard; EXEC-066 becomes the first reference implementation of it.