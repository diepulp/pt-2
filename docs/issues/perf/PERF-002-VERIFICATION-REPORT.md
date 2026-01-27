# PERF-002 Verification Report

**Date:** 2026-01-27
**Status:** Verified
**Commit:** 6b4552d

---

## Executive Summary

Chrome DevTools verification confirms PERF-002 optimization is working as designed. HTTP requests reduced from 11+ to 6, player names display correctly, and the new `rpc_get_dashboard_stats` RPC is functioning.

---

## Network Request Analysis

### Before Optimization (from Investigation)

| # | Endpoint | Purpose |
|---|----------|---------|
| 1 | `GET /api/v1/casino/gaming-day` | Gaming day |
| 2 | `GET /api/v1/rating-slips/active-players` | Casino-wide players |
| 3 | `GET /api/v1/tables` | Table list |
| 4 | `GET /api/v1/rating-slips?status=open` | Casino open slips |
| 5 | `GET /api/v1/rating-slips?status=paused` | Casino paused slips |
| 6 | `GET /api/v1/visits?status=active` | Casino active visits |
| 7 | `POST rpc_get_dashboard_tables_with_counts` | Tables with counts |
| 8 | `GET /api/v1/tables/{id}/settings` | Table settings |
| 9 | `GET /api/v1/rating-slips?table_id=X&status=open` | Table open slips |
| 10 | `GET /api/v1/rating-slips?table_id=X&status=paused` | Table paused slips |

**Total: 11+ requests**

### After Optimization (Verified via Chrome DevTools)

| # | Endpoint | Duration | Notes |
|---|----------|----------|-------|
| 1 | `GET /api/v1/casino/gaming-day` | - | Unchanged |
| 2 | `POST rpc_get_dashboard_stats` | 360ms | **NEW** - Replaces #3-6 |
| 3 | `POST rpc_get_dashboard_tables_with_counts` | ~500ms | Unchanged |
| 4 | `GET /api/v1/tables/{id}/settings` | ~500ms | Unchanged |
| 5 | `GET rating_slip` (with player join) | 1131ms | **NEW** - Replaces #9-10 |
| 6 | `GET /api/v1/rating-slips/active-players` | 874ms | Used by activity panel |

**Total: 6 data requests (45% reduction)**

---

## Key Optimizations Verified

### 1. Stats Aggregation RPC

**Request:** `POST /rest/v1/rpc/rpc_get_dashboard_stats`

**Response:**
```json
{
  "openSlipsCount": 6,
  "activeTablesCount": 3,
  "checkedInPlayersCount": 7
}
```

**Verification:** Single RPC call replaces 4 HTTP requests (tables, open slips, paused slips, visits). Server-side aggregation eliminates client-side counting.

### 2. Player-Joined Slip Query

**Request:** `GET /rest/v1/rating_slip?select=...visit!inner(player_id,player(id,first_name,last_name))...`

**Response (excerpt):**
```json
[
  {
    "id": "c313bbb6-...",
    "seat_number": "3",
    "visit": {
      "player_id": "a1000000-...",
      "player": {
        "id": "a1000000-...",
        "first_name": "John",
        "last_name": "Smith"
      }
    }
  }
]
```

**Verification:** Player names embedded in slip data via `visit!inner` join. No separate player fetch required for table view.

### 3. UI Player Name Display

**Page Snapshot (via Chrome DevTools a11y tree):**
```
uid=1_66 button "Seat 3, occupied by John Smith"
uid=1_67 button "Seat 4, occupied by Anthony Hops"
uid=1_68 button "Seat 5, occupied by Nikson Bell"
uid=1_69 button "Seat 6, occupied by Maria Garcia"
```

**Verification:** Real player names displayed (not "Player #3" placeholders).

---

## Performance Metrics (Dev Mode)

| Metric | Value | Notes |
|--------|-------|-------|
| LCP | 3,730ms | Dev mode overhead |
| TTFB | 554ms | Initial page load |
| CLS | 0.01 | Excellent |
| Render Delay | 3,176ms | React dev mode |

**Note:** Dev mode metrics are expected to be slower due to:
- React development mode overhead
- Hot Module Replacement active
- No code minification
- Remote Supabase database (network latency)

---

## Critical Path Analysis

```
/pit (1,208ms)
├── rpc_get_dashboard_stats (3,624ms total)
├── rpc_get_dashboard_tables_with_counts (3,420ms total)
├── rating_slip with player join (4,061ms total)
└── /tables/{id}/settings (4,261ms total)
```

Requests execute in parallel after initial page load.

---

## Verification Checklist

| Target | Status |
|--------|--------|
| HTTP requests reduced from 11 to ≤6 | ✅ 6 requests |
| `rpc_get_dashboard_stats` replaces 4 calls | ✅ Working |
| Player names embedded in slip query | ✅ Working |
| UI shows real player names | ✅ Verified |
| No "Player #3" placeholders | ✅ Confirmed |

---

## Files Changed

### Migration
- `supabase/migrations/20260126163939_perf002_dashboard_stats_rpc.sql`

### Service Layer
- `services/rating-slip/selects.ts` - `RATING_SLIP_WITH_PLAYER_SELECT`
- `services/rating-slip/dtos.ts` - `RatingSlipWithPlayerDTO`
- `services/rating-slip/mappers.ts` - `toRatingSlipWithPlayerDTO`
- `services/rating-slip/crud.ts` - `listActiveForTableWithPlayer`

### Hooks
- `hooks/dashboard/use-dashboard-stats.ts` - Uses `rpc_get_dashboard_stats`
- `hooks/dashboard/use-dashboard-slips.ts` - Uses player join

### Components
- `components/dashboard/pit-dashboard-client.tsx` - Removed `useCasinoActivePlayers()`
- `components/dashboard/seat-context-menu.tsx` - Added `mapSlipsWithPlayerToOccupants`
- `components/dashboard/active-slips-panel.tsx`
- `components/pit-panels/panel-container.tsx`
- `components/pit-panels/tables-panel.tsx`
- `components/pit-panels/pit-panels-static.tsx`
- `components/pit-panels/pit-panels-client.tsx`

### Tests
- `services/rating-slip/__tests__/mappers.test.ts` - 11 new tests

---

## ADR Compliance

- **ADR-024:** RPC derives `casino_id` from `set_rls_context_from_staff()` (not parameters)
- **ADR-015:** Uses `SECURITY INVOKER` for read-only RPC

---

## References

- Investigation: `docs/issues/perf/PIT_DASHBOARD_DATA_FLOW_INVESTIGATION.md`
- Execution Spec: `docs/20-architecture/specs/PERF-002/EXECUTION-SPEC-PERF-002.md`
- Checkpoint: `.claude/skills/prd-pipeline/checkpoints/PERF-002.json`
