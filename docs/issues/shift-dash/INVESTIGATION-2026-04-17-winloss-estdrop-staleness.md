# Investigation: Shift Dashboard Win/Loss + Est. Drop Staleness After Buy-In Adjustment

**Date:** 2026-04-17
**Investigator:** Lead Architect
**Surface:** `/shift-dashboard` — `HeroWinLossCompact` (Win/Loss panel) + `SecondaryKpiStack` (Est. Drop KPI)
**Trigger:** Operator reverts a buy-in via rating-slip modal adjustment; MTL + rating-slip views update correctly; shift-dashboard panels do not.
**Status:** Root cause identified. Prior-art is load-bearing — most of the fix already shipped.

---

## 1. Executive Summary

The user's reported staleness is not a new bug. It's a **partially-healed** gap documented in February 2026:

- `docs/issues/_archive/ISSUE-SHIFT-DASHBOARD-STALE-BUYIN-ADJUSTMENT.md` (archived issue)
- `docs/20-architecture/specs/_archive/ISSUE-SHIFT-DASH-STALE-ADJ/EXECUTION-SPEC-ISSUE-SHIFT-DASH-STALE-ADJ.md` (archived EXEC-SPEC)
- `docs/issues/mtl-rating-slip-glitch/DOWNSTREAM-CONSUMER-POSTURE.md` (PRD-064-era read-plane audit)

**Server side is GREEN** (bridge fires for adjustments; RPC includes `RATED_ADJUSTMENT` in `rated_cents`; migrations `20260218233652` + `20260219002247` applied on remote). Verified this session.

**Client side is partially green.** `useCreateFinancialAdjustment` DOES invalidate `shiftDashboardKeys.summary.scope` + `allMetrics()` (WS3 of the Feb spec). So the query DOES refetch after an adjustment.

**The residual staleness has three independent causes:**

| # | Cause | Severity | Owning layer |
|---|---|---|---|
| **C1** | **Frozen time window** — `timeWindow` state initialized once at mount; window end never advances; adjustments with `occurred_at > window.end` are excluded by the RPC's `< p_window_end` filter | **P0 for user's reported symptom** | Client (hook/route) |
| **C2** | **No realtime subscription** on `player_financial_transaction` / `table_buyin_telemetry` — cross-tab/cross-session writes never notify the shift-dashboard cache | P1 | Client (hook) |
| **C3** | `useSaveWithBuyIn` has **no shift-dashboard invalidation at all** — initial buy-ins only reach shift-dashboard via 30s polling + stale window | P1 (unrelated to user's reverted-buy-in complaint) | Client (hook) |

C1 alone is sufficient to produce the user's exact symptom.

---

## 2. Verification Trail

### 2.1 Server side (GREEN)

**Migrations applied on remote** (verified via `mcp__supabase__list_migrations`):

- `20260217215827_mtl_bridge_adjustment_support` — MTL bridge widened for adjustment/reversal
- `20260218233652_fix_dual_telemetry_bridge_trigger` — 100× inflation fix + dual-trigger consolidation
- `20260219002247_enable_adjustment_telemetry` — supersedes the archived spec's WS1-A/B/C and WS2-A/B/C/D in a single atomic migration (naming-standard consolidation)

**`rpc_shift_table_metrics` behavior** (verified via `pg_get_functiondef`):

```sql
-- telemetry_agg CTE in rpc_shift_table_metrics (v0.2+)
telemetry_agg AS (
  SELECT
    tbt.table_id,
    COALESCE(SUM(tbt.amount_cents) FILTER (
      WHERE tbt.telemetry_kind IN ('RATED_BUYIN', 'RATED_ADJUSTMENT')
    ), 0)::bigint AS rated_cents,
    ...
  FROM public.table_buyin_telemetry tbt
  WHERE tbt.casino_id = v_context_casino_id
    AND tbt.occurred_at >= p_window_start
    AND tbt.occurred_at < p_window_end     -- ← exclusion boundary — see C1
  GROUP BY tbt.table_id
)
```

- `estimated_drop_rated_cents = rated_cents` (includes negative adjustments — they reduce the total by SUM arithmetic).
- `estimated_drop_buyins_cents = total_cents` (unfiltered sum).
- `win_loss_estimated_cents = (closing − opening) − fills + credits + total_cents`.

The RPC is correct. Adjustments reduce both `rated_cents` and `total_cents` when their `occurred_at` is inside the query window.

**Bridge trigger** `trg_bridge_rated_buyin_telemetry` fires on `player_financial_transaction` insert when either `(direction='in' + rating_slip_id)` or `(txn_kind='adjustment' + rating_slip_id)`. `rpc_create_financial_adjustment` inherits `rating_slip_id` from the original transaction (WS2-B). Bridge writes telemetry with `telemetry_kind = 'RATED_ADJUSTMENT'` and `amount_cents = signed adjustment amount`.

**Conclusion:** The adjustment is written to `table_buyin_telemetry` the moment it commits, with the correct sign, the correct kind, the correct `rating_slip_id`. The RPC will aggregate it correctly — provided the query window includes the adjustment's `occurred_at`.

### 2.2 Client invalidation (per the Feb spec's WS3)

| Hook | File:Line | shift-dashboard invalidation |
|---|---|---|
| `useCreateFinancialAdjustment` | `hooks/player-financial/use-financial-mutations.ts:162-168` | `shiftDashboardKeys.summary.scope` + `shiftDashboardKeys.allMetrics()` ✅ |
| `useSaveWithBuyIn` | `hooks/rating-slip-modal/use-save-with-buyin.ts:226-264` | **none** — see C3 |
| `useCreateFinancialTransaction` | `hooks/player-financial/use-financial-mutations.ts:57-93` | **none** — also C3 class |

The user's scenario (revert via adjustment) hits the hook that DOES invalidate. So invalidation fires. The query refetches. This is why shift-dashboard appears to "try" but still shows stale numbers — the refetch happens, but the refetched data is still stale-by-window.

### 2.3 Query mechanics — the actual failure

**`app/(protected)/shift-dashboard/page.tsx:32-39` + `components/shift-dashboard-v3/shift-dashboard-v3.tsx:69-76`:**

```ts
function getDefaultWindow(): ShiftTimeWindow {
  const now = new Date();
  const start = new Date(now.getTime() - 8 * 60 * 60 * 1000);
  return {
    start: start.toISOString(),
    end: now.toISOString(),
  };
}
```

**`shift-dashboard-v3.tsx:87-88`:**

```ts
const [timeWindow, setTimeWindow] =
  useState<ShiftTimeWindow>(getDefaultWindow);
```

- `useState(getDefaultWindow)` evaluates the initializer **once**, at component mount. The `now` captured inside the initializer is frozen into `timeWindow.end`.
- `useShiftDashboardSummary({ window: timeWindow })` keys by `shiftDashboardKeys.summary(window)` — the key is stable as long as `timeWindow` doesn't change.
- `refetchInterval: 30_000` (from `hooks/shift-dashboard/use-shift-dashboard-summary.ts:53`) re-runs the fetch every 30 seconds — but with the **same** `window.start` / `window.end` parameters.

**Failure timeline (verified by code reading, hypothesized by user report):**

```
T+0     : Operator loads /shift-dashboard.
          timeWindow.end = T  (frozen from useState initializer)
          RPC called with p_window_end = T

T+5min  : Operator reverts a buy-in via rating-slip modal.
          rpc_create_financial_adjustment inserts a pft row at T+5min.
          Bridge trigger inserts a table_buyin_telemetry row with
            occurred_at = T+5min, telemetry_kind = 'RATED_ADJUSTMENT'.
          useCreateFinancialAdjustment onSuccess fires
            invalidateQueries({ queryKey: shiftDashboardKeys.summary.scope }).
          Query refetches.
          fetchShiftDashboardSummary(start = T-8h, end = T).
          RPC filters tbt.occurred_at < T  →  excludes the T+5min row.
          Win/Loss + Est. Drop unchanged.

T+10min : refetchInterval fires.
          Same (T-8h, T) window. Same exclusion. Same stale result.

... forever until the operator changes the window via TimeWindowSelector
    or the page is reloaded.
```

The cache refetched. The server returned a correct answer for the query it was given. The query window was wrong.

**This is the primary cause of the user's reported symptom.**

### 2.4 Realtime subscription posture

`hooks/dashboard/use-dashboard-realtime.tsx` subscribes to `gaming_table`, `rating_slip`, `table_fill`, `table_credit`. It is **not** used by the shift-dashboard surface. The shift-dashboard has no realtime subscription at all.

This means: even when C1 is fixed, if the operator performs the adjustment in a **different browser tab/window/session** than the one showing the shift-dashboard, the invalidation call never reaches the shift-dashboard's query cache. The dashboard would still appear stale until its own polling cycle fires — and per C1, that polling uses a stale window.

C2 becomes relevant as soon as C1 is fixed (otherwise the realtime event arrives, triggers a refetch, but the refetch still hits the stale window).

### 2.5 Why prior art missed C1

The Feb 2026 EXEC-SPEC focused on:
- WS1: 100× inflation (server)
- WS2: Adjustment telemetry flow (server)
- WS3: Frontend cache invalidation (client — added to `useCreateFinancialAdjustment`)
- WS4: Test data + docs

**WS3 addressed invalidation at write time.** It assumed the refetch would pick up the adjustment. It does — but under the wrong window. The frozen window is a separate failure mode the Feb spec didn't enumerate.

This is a legitimate gap in the prior analysis, not a regression. The Feb spec validated its WS3 against a test environment where the test harness either (a) uses a mock RPC that ignores window filtering or (b) creates adjustments with `occurred_at` back-dated into the window. Neither matches production reality.

---

## 3. Assessment — Compliance / Integrity

- **Server state is truthful.** The RPC returns correct numbers for any query it's given.
- **UI lag is bounded but not observable.** The dashboard will eventually reflect the adjustment — **only** on page reload, manual window change, or tab-remount. There is no self-healing path inside a single session.
- **Not a regulatory issue.** The underlying ledger is intact; the UI is just rendering an out-of-date time slice. But operators use these figures to make shift decisions (variance checks, drop reconciliation), and a stale figure can produce bad operator judgment even if the audit trail is clean.

---

## 4. Recommended Remediation

This is small. Do not write another 5-workstream EXEC-SPEC.

### 4.1 The narrow fix (single PR)

Two patches, one file each:

**Patch A — Advance the window on refetch** (closes C1):

`components/shift-dashboard-v3/shift-dashboard-v3.tsx` — replace the frozen `useState` with a live window that recomputes `end` on each render driven by refetch interval. Two design options, pick one:

- **Option A1 (simple, slight over-fetch):** move `getDefaultWindow()` into a `useMemo` keyed by a counter that ticks on refetchInterval, or drive the window from a `refreshTrigger` state that advances with `setInterval(30_000)`. Query key changes on each tick → cache eviction of prior window → mild memory churn but guaranteed correctness.
- **Option A2 (query key stability, param drift):** keep `timeWindow.start` stable; mutate `timeWindow.end` inside `queryFn` to `new Date().toISOString()` at fetch time. Query key is stable; fetch params advance. This decouples cache identity from query params — cleaner but requires a note in the hook.

**Recommendation: A1.** A1 is honest about what's changing. A2 obscures it.

**Patch B — Add realtime subscription** (closes C2):

`hooks/shift-dashboard/` — add a `use-shift-dashboard-realtime.ts` that subscribes to `player_financial_transaction` filtered by `casino_id` and invalidates `shiftDashboardKeys.summary.scope` on insert. Mirror the pattern at `hooks/dashboard/use-dashboard-realtime.tsx`. Mount from `ShiftDashboardV3`.

This patch also closes the cross-tab / cross-session case the user's coworkers hit if they're watching the dashboard while another operator adjusts.

### 4.2 Out of scope for this fix

- **C3 (`useSaveWithBuyIn` missing invalidation).** This is a separate, additive gap. It affects initial buy-ins, not reverts. It's correctly captured by `DOWNSTREAM-CONSUMER-POSTURE.md` §B. Fix in a follow-on — do not bundle with the C1/C2 fix.
- **`allCashObs()` + `alerts` invalidation** on `useCreateFinancialAdjustment`. Does not feed Win/Loss or Est. Drop. Tracked separately under DOWNSTREAM-CONSUMER-POSTURE.md §B but not symptomatic of the user's current complaint.
- **`pit_cash_observation` realtime subscription.** Adjacent gap, same follow-on.

### 4.3 Verification plan

1. Open `/shift-dashboard` in Tab 1. Note Win/Loss value.
2. In Tab 2, open a rating slip with a committed buy-in. Open the adjustment modal. Enter a $-100 delta. Submit.
3. Expected post-fix: Tab 1's Win/Loss decreases by $100 within ≤ 2 seconds (realtime) or within the 30-second polling interval (without realtime), **without** manual reload or window change.
4. Expected today (no fix): Tab 1 remains stale indefinitely.

### 4.4 Do not reintroduce

The EXEC-066a/EXEC-066b silent-guard remediation specs (shelved 2026-04-17) are unrelated to this issue. They address a different defensive-coding pattern. Do not bundle.

---

## 5. File References

### Verified this session

| File | Role |
|---|---|
| `app/(protected)/shift-dashboard/page.tsx` | Route; server prefetches `shiftDashboardKeys.summary(window)`; window frozen at render time |
| `components/shift-dashboard-v3/shift-dashboard-v3.tsx` | Orchestrator; `useState(getDefaultWindow)` freezes window at mount |
| `components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx` | Win/Loss panel — reads `summary.casino.win_loss_estimated_total_cents` |
| `hooks/shift-dashboard/use-shift-dashboard-summary.ts` | Query hook — `staleTime: 30_000`, `refetchInterval: 30_000`, no realtime |
| `hooks/shift-dashboard/keys.ts` | Key factory; `.scope` for surgical invalidation |
| `hooks/shift-dashboard/http.ts` | `fetchShiftDashboardSummary(start, end)` |
| `hooks/player-financial/use-financial-mutations.ts:121-183` | `useCreateFinancialAdjustment` — WS3 shift-dashboard invalidation ✅ |
| `hooks/rating-slip-modal/use-save-with-buyin.ts:226-264` | `useSaveWithBuyIn` — no shift-dashboard invalidation (C3, out of scope) |
| Remote `rpc_shift_table_metrics` | Includes `RATED_ADJUSTMENT` in `rated_cents` ✅ |
| `supabase/migrations/20260219002247_enable_adjustment_telemetry.sql` | Applied on remote — WS1 + WS2 consolidated |

### Prior art (do not redo)

| Doc | Purpose |
|---|---|
| `docs/issues/_archive/ISSUE-SHIFT-DASHBOARD-STALE-BUYIN-ADJUSTMENT.md` | Archived Feb 2026 issue — covers 100× inflation + adjustment blackout |
| `docs/20-architecture/specs/_archive/ISSUE-SHIFT-DASH-STALE-ADJ/EXECUTION-SPEC-ISSUE-SHIFT-DASH-STALE-ADJ.md` | Archived EXEC-SPEC — WS1-WS4 |
| `docs/issues/mtl-rating-slip-glitch/DOWNSTREAM-CONSUMER-POSTURE.md` | PRD-064-era audit — names C3 and realtime gap |
| `docs/issues/gaps/mtl-bridge/GAP-CASHIN-ADJUSTMENT-MTL-SYNC.md` | MTL-side bridge gap (resolved) |

---

## 6. One-Line Summary

**The February 2026 fix solved the write path. It didn't solve the frozen query window. Add a rolling window + a realtime subscription on `player_financial_transaction`, and the user's reverted-buy-in case becomes observable.**

---

## 7. Credential Handling Note

The user provided a remote DB password in the invocation that led to this investigation. I did not use it — Supabase MCP tooling is already authenticated at the session level. **Rotate that credential**: it is now in the conversation transcript and should be considered compromised.
