# ISSUE: Cash Velocity Metric Ambiguity and Scope Mismatch

| Field          | Value                                              |
| -------------- | -------------------------------------------------- |
| **ID**         | ISSUE-CASH-VELOCITY-METRIC-AMBIGUITY               |
| **Status**     | Open                                               |
| **Severity**   | Medium                                             |
| **Category**   | UX / Data Accuracy                                 |
| **Component**  | Player 360 Dashboard — Cash Velocity Tile           |
| **Reported**   | 2026-02-02                                         |
| **Reporter**   | Manual observation (player: Nikson Bell)            |

## Symptom

Player Nikson Bell has **$600 total buy-ins** yet the Cash Velocity panel displays **$855/hr**. The rate exceeding the absolute total is confusing to pit floor staff who interpret it as a calculation error.

## Root Cause Analysis

The metric is **not a bug** in the strict sense — $855/hr is the mathematically correct extrapolation for a ~42-minute session. However, the implementation has three design-level problems that make the metric misleading.

### Problem 1: No Minimum-Time Floor

**File:** `services/player360-dashboard/mappers.ts:228-232`

```typescript
const hoursElapsed =
  (Date.now() - new Date(visitStartedAt).getTime()) / 3600000;
if (hoursElapsed > 0) {
  ratePerHour = Math.round(sessionTotal / hoursElapsed);
}
```

The only guard is `hoursElapsed > 0`. A player who buys in $600 in the first 2 minutes would show **$18,000/hr**. There is no damping or minimum window before extrapolation begins (e.g., suppress rate or show raw total until ≥15 minutes have elapsed).

### Problem 2: Scope Mismatch Between Numerator and Denominator

**Numerator** — `crud.ts:108-112`:
```typescript
supabase
  .from("player_financial_transaction")
  .select("amount, direction, created_at")
  .eq("player_id", playerId)
  .eq("gaming_day", currentGamingDay),   // ← scoped to GAMING DAY
```

**Denominator** — `crud.ts:250-253`:
```typescript
const cashVelocity = mapToCashVelocity(
  financialSummary,
  activeVisit?.started_at ?? null,        // ← scoped to CURRENT VISIT
);
```

- **Numerator** (`sessionTotal`): All `direction='in'` transactions for the entire `gaming_day` — includes prior visits.
- **Denominator** (`hoursElapsed`): Time since `activeVisit.started_at` — current visit only.

If a player checked out and returned the same gaming day, transactions from the earlier visit inflate `sessionTotal` while the denominator only measures time from the current visit. This produces an **artificially elevated rate**.

### Problem 3: "Total Buy-Ins" Includes Non-Buy-In Inflows

**File:** `crud.ts:198-200`

```typescript
const totalInCents = transactions
  .filter((t) => t.direction === "in")
  .reduce((sum, t) => sum + (t.amount ?? 0), 0);
```

No filter on `tender_type` or `txn_kind`. Marker issuances, adjustments with `direction='in'`, and system credits all count toward `sessionTotal`. The tile label "Total:" and DTO comment "Total cash in for current session" imply pure buy-ins, but the value may include other inflows.

## Impact

- **User confusion**: Pit bosses see rate > total and distrust the dashboard.
- **Multi-visit inflation**: Players with multiple visits per gaming day get silently inflated velocity.
- **Early-session noise**: First few minutes produce extreme spikes that are operationally meaningless.

## Affected Files

| File | Lines | Role |
| ---- | ----- | ---- |
| `services/player360-dashboard/mappers.ts` | 211-241 | `mapToCashVelocity()` — rate calculation |
| `services/player360-dashboard/crud.ts` | 108-112 | Transaction query (gaming-day scoped) |
| `services/player360-dashboard/crud.ts` | 198-204 | `total_in` aggregation (no txn_kind filter) |
| `services/player360-dashboard/crud.ts` | 250-253 | Passes `activeVisit.started_at` as denominator |
| `services/player360-dashboard/dtos.ts` | 46-53 | `PlayerCashVelocityDTO` |
| `components/player-360/summary/summary-band.tsx` | 148-161 | Display tile |

## Suggested Remediation

1. **Minimum-time floor**: Do not extrapolate until `hoursElapsed ≥ 0.25` (15 min). Below that threshold, display `sessionTotal` as a raw value or show "—" for rate.
2. **Align scopes**: Either filter transactions by `visit_id` (to match the visit-scoped denominator), or use `first_transaction_at` as the denominator start (to match the gaming-day-scoped numerator).
3. **Filter inflow types**: Consider filtering `tender_type` or `txn_kind` to exclude markers and adjustments from the "buy-in" total, or rename the label to "Cash In" to accurately reflect what is aggregated.

## Related

- `services/player360-dashboard/dtos.ts` — `PlayerCashVelocityDTO`
- `docs/issues/ISSUE-580A8D81-PLAYER-DASHBOARD-DATA-FLOW-GAPS.md` — prior dashboard data flow investigation
- `docs/issues/ISSUE-SHIFT-DASHBOARD-STALE-BUYIN-ADJUSTMENT.md` — related buy-in accuracy issue
