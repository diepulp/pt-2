# PIT DASHBOARD DATA FLOW INVESTIGATION REPORT

**Date:** 2026-01-26
**Status:** Open
**Severity:** High
**Category:** Architecture / Performance
**Investigator:** QA Specialist
**Related Issues:** ISSUE-PLAYER-NAME-DTO-INEFFICIENCY.md, ISSUE-DD2C45CA

---

## Executive Summary

The pit dashboard page load triggers **11+ API/RPC requests** with significant **data overlap and redundancy**. This investigation confirms the issues documented in `ISSUE-PLAYER-NAME-DTO-INEFFICIENCY.md` and reveals additional architectural problems causing performance degradation.

**Key Findings:**
- 4 redundant rating slip queries
- 2 duplicate table fetches
- Client-side filtering of server data
- Stats hook fetches full datasets to perform COUNT operations

---

## Network Request Analysis

### Initial Page Load Requests (Observed via Chrome DevTools)

| # | Endpoint | Purpose | Duration |
|---|----------|---------|----------|
| 1 | `GET /api/v1/casino/gaming-day` | Gaming day | ~500ms |
| 2 | `GET /api/v1/rating-slips/active-players` | Casino-wide players + names | 684ms |
| 3 | `GET /api/v1/tables` | Table list (no counts) | 644ms |
| 4 | `GET /api/v1/rating-slips?status=open&limit=100` | Casino-wide open slips | 637ms |
| 5 | `GET /api/v1/rating-slips?status=paused&limit=100` | Casino-wide paused slips | ~600ms |
| 6 | `GET /api/v1/visits?status=active&limit=100` | Casino-wide active visits | 651ms |
| 7 | `POST rpc_get_dashboard_tables_with_counts` | Tables with counts (RPC) | ~500ms |
| 8 | `GET /api/v1/tables/{id}/settings` | Selected table settings | ~500ms |
| 9 | `GET /api/v1/rating-slips?table_id=X&status=open` | Table-specific open slips | 1045ms |
| 10 | `GET /api/v1/rating-slips?table_id=X&status=paused` | Table-specific paused slips | ~600ms |

**Total Observed Requests:** 10+ fetch/xhr requests on page load

---

## Identified Issues

### ISSUE-1: Redundant Slip Queries

**Severity:** High
**Category:** N+1 / Over-fetching
**Location:** `hooks/dashboard/use-dashboard-stats.ts`, `hooks/dashboard/use-dashboard-slips.ts`

The dashboard fetches rating slips **4 separate times**:

1. **Casino-wide open slips** (`/api/v1/rating-slips?status=open&limit=100`) - `useDashboardStats`
2. **Casino-wide paused slips** (`/api/v1/rating-slips?status=paused&limit=100`) - `useDashboardStats`
3. **Table-specific open slips** (`?table_id=X&status=open`) - `useActiveSlipsForDashboard`
4. **Table-specific paused slips** (`?table_id=X&status=paused`) - `useActiveSlipsForDashboard`

**Root Cause:** `useDashboardStats` in `hooks/dashboard/use-dashboard-stats.ts:54-68` fetches all casino slips just to count them:

```typescript
// use-dashboard-stats.ts:54-68 - Fetches ENTIRE casino's slips for counting
const [tables, openSlips, pausedSlips, visits] = await Promise.all([
  fetchTables({}),
  listRatingSlips({ status: 'open', limit: 100 }),    // WASTEFUL
  listRatingSlips({ status: 'paused', limit: 100 }),  // WASTEFUL
  getVisits({ status: 'active', limit: 100 }),
]);

// Then just counts them
const openSlipsCount = openSlips.items.length + pausedSlips.items.length;
```

**Impact:**
- 4 redundant HTTP requests (~2400ms latency)
- Transfers ~3KB × 4 = ~12KB redundant data
- Increases server load and database queries

**Recommended Fix:** Create `rpc_get_dashboard_stats` that returns aggregate counts:

```sql
CREATE OR REPLACE FUNCTION rpc_get_dashboard_stats(p_casino_id uuid)
RETURNS jsonb AS $$
SELECT jsonb_build_object(
  'activeTablesCount', (SELECT count(*) FROM gaming_table WHERE status = 'active' AND casino_id = p_casino_id),
  'openSlipsCount', (SELECT count(*) FROM rating_slip WHERE status IN ('open', 'paused') AND casino_id = p_casino_id),
  'checkedInPlayersCount', (SELECT count(DISTINCT player_id) FROM visit WHERE ended_at IS NULL AND casino_id = p_casino_id)
);
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

---

### ISSUE-2: Player Name DTO Inefficiency (CONFIRMED)

**Severity:** Medium
**Category:** Data Flow / DTO Design
**Related:** `docs/issues/ISSUE-PLAYER-NAME-DTO-INEFFICIENCY.md`

**Confirmed from network data:**

1. `/api/v1/rating-slips?table_id=X&status=open` returns slips **WITHOUT player names**:
```json
{
  "id": "c6766251-...",
  "visit_id": "23d115aa-...",
  "seat_number": "5"
  // NO player info!
}
```

2. `/api/v1/rating-slips/active-players` returns **WITH player names** (casino-wide):
```json
{
  "slipId": "c6766251-...",
  "seatNumber": "5",
  "player": { "firstName": "Nikson", "lastName": "Bell" }
}
```

**Symptom Observed:** UI shows "Player #3", "Player #4" placeholders instead of actual names.

**Root Cause:** The `mapActivePlayersToOccupants` function filters casino-wide data by tableId on the client:

```typescript
// seat-context-menu.tsx:222-224
for (const player of players) {
  if (tableId && player.tableId !== tableId) continue;  // CLIENT-SIDE FILTER
  // ...
}
```

**Impact:**
- 2 API calls when 1 would suffice
- ~2KB redundant payload (6 players × 300 bytes each)
- Client-side filtering is wasteful

**Fix:** Add `RATING_SLIP_WITH_PLAYER_SELECT` per ISSUE-PLAYER-NAME-DTO-INEFFICIENCY.md

---

### ISSUE-3: Duplicate Table Fetches

**Severity:** Medium
**Category:** Cache Fragmentation
**Location:** `hooks/dashboard/use-dashboard-stats.ts`, `hooks/dashboard/use-dashboard-tables.ts`

Two separate mechanisms fetch tables:
1. `GET /api/v1/tables` (HTTP API via `fetchTables`) - for stats
2. `POST rpc_get_dashboard_tables_with_counts` (Supabase RPC) - for dashboard

**Root Cause:** `useDashboardStats` calls `fetchTables({})` while `useDashboardTables` calls the RPC.

**Impact:**
- 2 table queries per page load
- Different data structures require separate caching
- Inconsistent data freshness

**Fix:** Remove `fetchTables({})` call from stats hook, use only the RPC.

---

### ISSUE-4: useDashboardStats Anti-Pattern

**Severity:** High
**Category:** Architectural / Performance
**Location:** `hooks/dashboard/use-dashboard-stats.ts:49-103`

This hook demonstrates a problematic pattern:

```typescript
// Lines 54-68: Fetches FULL datasets just to count them
const [tables, openSlips, pausedSlips, visits] = await Promise.all([
  fetchTables({}),
  listRatingSlips({ status: 'open', limit: 100 }),
  listRatingSlips({ status: 'paused', limit: 100 }),
  getVisits({ status: 'active', limit: 100 }),
]);

// Lines 71-86: Performs counting that should be done server-side
const activeTablesCount = tables.filter(t => t.status === 'active').length;
const openSlipsCount = openSlips.items.length + pausedSlips.items.length;
const activeVisitPlayerIds = new Set(
  visits.items.filter(v => v.ended_at === null).map(v => v.player_id).filter(Boolean)
);
const checkedInPlayersCount = activeVisitPlayerIds.size;
```

**Issues:**
1. Downloads all data to perform `COUNT(*)`
2. Should be a single aggregation RPC
3. Transfers ~10KB+ when only 3 integers needed
4. Limit of 100 could miss data in larger casinos

---

### ISSUE-5: Request Waterfall

**Severity:** Medium
**Category:** Performance / UX

Request timing shows a **waterfall pattern** rather than optimal parallelization:

```
T+0ms:    gaming-day, active-players, tables, rating-slips(open), rating-slips(paused), visits
T+650ms:  rpc_get_dashboard_tables_with_counts (depends on auth)
T+700ms:  table settings (depends on table selection)
T+800ms:  rating-slips?table_id=X (depends on table selection)
```

**Total waterfall:** ~1800ms of sequential dependencies

---

## Data Overlap Summary

| Data Entity | Times Fetched | Endpoints |
|-------------|---------------|-----------|
| Rating slips | 4× | 2× casino-wide, 2× table-specific |
| Tables | 2× | 1× HTTP API, 1× RPC |
| Visits | 1× | (but fetches all visits for COUNT) |
| Players | 2× | 1× visits join, 1× active-players RPC |

---

## Current vs Optimal Data Flow

### Current Flow (Inefficient)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CURRENT PIT DASHBOARD (11+ requests)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  useDashboardStats:                                                          │
│  ├─ fetchTables()                      → Full table list                    │
│  ├─ listRatingSlips(status=open)       → All casino open slips              │
│  ├─ listRatingSlips(status=paused)     → All casino paused slips            │
│  └─ getVisits(status=active)           → All casino active visits           │
│                                                                              │
│  useDashboardTables:                                                         │
│  └─ rpc_get_dashboard_tables_with_counts → Tables with counts (DUPLICATE)   │
│                                                                              │
│  useCasinoActivePlayers:                                                     │
│  └─ /active-players                    → Casino-wide players with names     │
│                                                                              │
│  useActiveSlipsForDashboard:                                                 │
│  ├─ listRatingSlips(table_id, open)    → Table open slips (NO player)       │
│  └─ listRatingSlips(table_id, paused)  → Table paused slips (NO player)     │
│                                                                              │
│  Client-side: mapActivePlayersToOccupants filters casino → table            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Optimal Flow (Proposed)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       OPTIMAL PIT DASHBOARD (5 requests)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PARALLEL GROUP 1 (Initial Load):                                            │
│  ├─ rpc_get_dashboard_stats      → {activeTables, openSlips, checkedIn}     │
│  ├─ rpc_get_dashboard_tables     → [{id, label, activeSlipsCount}]          │
│  └─ GET /casino/gaming-day       → "2026-01-26"                             │
│                                                                              │
│  PARALLEL GROUP 2 (Table Selection):                                         │
│  ├─ rpc_get_table_slips_with_players(tableId) → [{slip, player}]            │
│  └─ GET /tables/{id}/settings    → {minBet, maxBet}                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Reduction:** 11+ requests → 5 requests (55% reduction)

---

## Definition of Done

### Fix 1: Stats Aggregation RPC
- [ ] Create `rpc_get_dashboard_stats(p_casino_id)` returning aggregate counts
- [ ] Remove `fetchTables`, `listRatingSlips`, `getVisits` from `useDashboardStats`
- [ ] Update `useDashboardStats` to call single RPC
- [ ] Add migration file

### Fix 2: Slips with Player Join (ISSUE-PLAYER-NAME-DTO-INEFFICIENCY)
- [ ] Create `RATING_SLIP_WITH_PLAYER_SELECT` in `selects.ts`
- [ ] Add `RatingSlipWithPlayerDTO` type in `dtos.ts`
- [ ] Add `includePlayer` option to `listForTable` in `crud.ts`
- [ ] Update `useActiveSlipsForDashboard` to use player join
- [ ] Remove `useCasinoActivePlayers()` from `pit-dashboard-client.tsx`
- [ ] Remove `mapActivePlayersToOccupants()` workaround

### Fix 3: Consolidate Table Queries
- [ ] Remove `fetchTables({})` call in stats hook
- [ ] Use only `rpc_get_dashboard_tables_with_counts`

### Fix 4: Verification
- [ ] Network tab shows 5 requests instead of 11+
- [ ] Player names display correctly (no "Player #3" placeholders)
- [ ] Page load time reduced by ~50%

---

## Files Requiring Changes

| File | Changes |
|------|---------|
| `services/rating-slip/selects.ts` | Add `RATING_SLIP_WITH_PLAYER_SELECT` |
| `services/rating-slip/dtos.ts` | Add `RatingSlipWithPlayerDTO` |
| `services/rating-slip/crud.ts` | Add `includePlayer` option |
| `hooks/dashboard/use-dashboard-stats.ts` | Replace with single RPC |
| `hooks/dashboard/use-dashboard-slips.ts` | Use player join |
| `components/dashboard/pit-dashboard-client.tsx` | Remove `useCasinoActivePlayers()` |
| `components/dashboard/seat-context-menu.tsx` | Remove workaround mapper |
| `supabase/migrations/` | Add `rpc_get_dashboard_stats` |

---

## Related Documentation

- `docs/issues/ISSUE-PLAYER-NAME-DTO-INEFFICIENCY.md` - Original player name issue
- `docs/issues/perf/SHIFT_DASHBOARD_HTTP_CASCADE.md` - Similar cascade issue
- ISSUE-DD2C45CA - Previous dashboard HTTP cascade remediation

---

## Appendix: Network Evidence

### Rating Slip Response (No Player)
```json
{
  "id": "c6766251-8cd5-45b6-85ec-f3f95d448349",
  "casino_id": "ca000000-0000-0000-0000-000000000001",
  "visit_id": "23d115aa-d6fa-4b8f-b4c9-66fae583b45f",
  "table_id": "6a000000-0000-0000-0000-000000000001",
  "seat_number": "5",
  "start_time": "2026-01-26T23:16:18.272861+00:00",
  "status": "open",
  "average_bet": null
}
```

### Active Players Response (With Player)
```json
{
  "slipId": "c6766251-8cd5-45b6-85ec-f3f95d448349",
  "visitId": "23d115aa-d6fa-4b8f-b4c9-66fae583b45f",
  "tableId": "6a000000-0000-0000-0000-000000000001",
  "tableName": "BJ-01",
  "seatNumber": "5",
  "status": "open",
  "player": {
    "id": "f09b9a39-9942-4495-b206-b608a55c1ae8",
    "firstName": "Nikson",
    "lastName": "Bell",
    "tier": null
  }
}
```

The same slip data is fetched twice - once without player info, once with.
