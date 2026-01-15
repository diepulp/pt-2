# PERF-001: Shift Dashboard HTTP Cascade

**Status**: Resolved
**Severity**: Medium
**Component**: Shift Dashboard
**Reported**: 2026-01-15
**Resolved**: 2026-01-15

## Summary

Shift dashboard page fires 5 parallel HTTP requests on every load/time-window change. While metrics are consolidated via BFF, cash observations remain fragmented across 4 separate endpoints.

## Observed Behavior

```
GET /api/v1/shift-dashboards/summary                     200 in 696ms
GET /api/v1/shift-dashboards/cash-observations/pits      200 in 888ms
GET /api/v1/shift-dashboards/cash-observations/alerts    200 in 650ms
GET /api/v1/shift-dashboards/cash-observations/casino    200 in 653ms
GET /api/v1/shift-dashboards/cash-observations/tables    200 in 678ms
```

Cold start adds ~1900ms compile time (Next.js JIT, dev only).

## Root Cause

`components/shift-dashboard/shift-dashboard-page.tsx:84-87`:

```typescript
// === Telemetry Queries ===
const cashObsCasino = useCashObsCasino({ window: stableWindow });
const cashObsPits = useCashObsPits({ window: stableWindow });
const cashObsTables = useCashObsTables({ window: stableWindow });
const alerts = useShiftAlerts({ window: stableWindow });
```

Each hook triggers a separate HTTP request. No BFF consolidation for cash observations.

## Impact

- **Network overhead**: 4 extra HTTP round-trips per page load
- **Perceived latency**: Dashboard shows loading state until slowest request completes (~888ms)
- **Connection pressure**: 5 concurrent connections to API server

## Proposed Solutions

### Solution A: Cash Observations BFF (Recommended)

Create `/api/v1/shift-dashboards/cash-observations/summary` endpoint:

```typescript
// Returns consolidated response
interface CashObsSummaryDTO {
  casino: CashObsCasinoRollupDTO;
  pits: CashObsPitRollupDTO[];
  tables: CashObsTableRollupDTO[];
  alerts: CashObsSpikeAlertDTO[];
}
```

**Effort**: ~2 hours
**Impact**: 4 HTTP calls → 1 HTTP call

### Solution B: Inline Alerts RPC Logic

Current `rpc_shift_cash_obs_alerts` internally calls both table and pit RPCs. Inline the logic to eliminate nested RPC overhead.

**Effort**: ~1 hour
**Impact**: Reduce alerts endpoint from ~650ms to ~200ms

### Solution C: Lazy Load Telemetry

Load authoritative metrics first (`/summary`), defer telemetry loading:

```typescript
// Load immediately
const summary = useShiftDashboardSummary({ window });

// Load after metrics settle
const cashObs = useCashObsSummary({
  window,
  enabled: !summary.isLoading
});
```

**Effort**: ~30 minutes
**Impact**: Faster perceived load, telemetry appears with slight delay

## Files Involved

| File | Role |
|------|------|
| `components/shift-dashboard/shift-dashboard-page.tsx` | Page composition, hook orchestration |
| `hooks/shift-dashboard/use-cash-observations.ts` | Individual cash obs hooks |
| `hooks/shift-dashboard/http.ts` | HTTP fetchers |
| `app/api/v1/shift-dashboards/cash-observations/*/route.ts` | Route handlers |
| `services/table-context/shift-cash-obs.ts` | Service layer |

## Acceptance Criteria

- [x] Single HTTP call for all cash observation data
- [ ] Dashboard initial load < 800ms (warm, excluding compile) - needs QA verification
- [ ] No regression in data accuracy or refresh behavior - needs QA verification

## Resolution

**Solution A implemented** - Cash Observations BFF endpoint created.

### Changes Made

| File | Change |
|------|--------|
| `services/table-context/dtos.ts` | Added `CashObsSummaryDTO` interface |
| `services/table-context/shift-cash-obs.ts` | Added `getShiftCashObsSummary()` - parallel RPC execution |
| `services/table-context/shift-metrics/schemas.ts` | Added `cashObsSummaryQuerySchema` |
| `app/api/v1/shift-dashboards/cash-observations/summary/route.ts` | New BFF endpoint |
| `hooks/shift-dashboard/http.ts` | Added `fetchCashObsSummary()` |
| `hooks/shift-dashboard/keys.ts` | Added `cashObsSummary` query key |
| `hooks/shift-dashboard/use-cash-obs-summary.ts` | New consolidated hook |
| `hooks/shift-dashboard/index.ts` | Exported new hook and fetcher |
| `components/shift-dashboard/shift-dashboard-page.tsx` | Replaced 4 hooks with 1 |

### Expected Behavior After Fix

```
GET /api/v1/shift-dashboards/summary                     200 in ~700ms
GET /api/v1/shift-dashboards/cash-observations/summary   200 in ~900ms
```

- 5 HTTP calls → 2 HTTP calls
- Network overhead reduced by 60%
- Single loading state for all cash observation data

## Related

- `docs/40-quality/audits/SHIFT_DASHBOARD_PERFORMANCE_AUDIT.md`
- `supabase/migrations/20260114130420_shift_metrics_performance_indexes.sql`
