# ISSUE: RatingSlipDTO Missing Player Join - Redundant API Call

**Status:** Open
**Severity:** Medium
**Category:** Architecture / Performance
**Created:** 2026-01-26
**Related Service:** RatingSlipService
**Related Components:** PitDashboardClient, TableLayoutTerminal
**Tags:** DTO-design, N+1, data-flow, SRM-interpretation

---

## Executive Summary

The pit dashboard makes **2 separate API calls** to display player names in table seat tooltips when **1 call would suffice**. This is caused by `RatingSlipDTO` not including player information, despite a join pattern already existing for closed slips.

**Symptom:** Tooltip showed "Player #3" instead of actual player name (placeholder data).

**Workaround Applied:** Added `useCasinoActivePlayers()` hook to fetch player names separately.

**Proper Fix:** Add player join to active slip queries, matching the existing `CLOSED_SLIP_WITH_PLAYER_SELECT` pattern.

---

## Current Data Flow (Inefficient)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PIT DASHBOARD CLIENT                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. useActiveSlipsForDashboard(tableId)                                     │
│     └─→ GET /api/v1/rating-slips?table_id=xxx&status=active                 │
│         └─→ listRatingSlips() → RATING_SLIP_SELECT                          │
│             └─→ Returns: RatingSlipDTO (NO player info)                     │
│                 { id, casino_id, visit_id, table_id, seat_number, ...}      │
│                                                                             │
│  2. useCasinoActivePlayers()  ← REDUNDANT CALL                              │
│     └─→ GET /api/v1/rating-slips/active-players                             │
│         └─→ rpc_list_active_players_casino_wide                             │
│             └─→ Returns: ActivePlayerForDashboardDTO (WITH player info)     │
│                 { slipId, seatNumber, player: { firstName, lastName }}      │
│                                                                             │
│  3. mapActivePlayersToOccupants() merges data for tooltip                   │
│     └─→ Filters casino-wide players by tableId (wasteful)                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Impact

| Metric | Current | Optimal |
|--------|---------|---------|
| API calls per table view | 2 | 1 |
| Data transferred | ~2x (overlapping slip data) | 1x |
| Cache entries | 2 (fragmented) | 1 (unified) |
| Client-side processing | Filter casino-wide → table | None needed |

---

## Root Cause Analysis

### 1. RatingSlipDTO Intentionally "Thin"

**Location:** `services/rating-slip/selects.ts:21-37`

```typescript
export const RATING_SLIP_SELECT = `
  id,
  casino_id,
  visit_id,
  table_id,
  seat_number,
  start_time,
  end_time,
  status,
  average_bet,
  ...
` as const;
// NO visit → player join
```

### 2. SRM Invariant Misinterpreted

**From:** `services/rating-slip/selects.ts` comments

> "IMPORTANT: player_id is NOT selected. Per SRM v4.0.0 invariant, player identity comes from visit.player_id at query time."

**Correct interpretation:** Player identity should be **derived via join** at query time.

**Actual interpretation:** DTO should not include player info at all.

### 3. Pattern Already Exists for Closed Slips

**Location:** `services/rating-slip/selects.ts:97-119`

```typescript
export const CLOSED_SLIP_WITH_PLAYER_SELECT = `
  id,
  visit_id,
  table_id,
  seat_number,
  ...
  visit!inner (
    player_id,
    gaming_day,
    player (
      id,
      first_name,
      last_name,
      tier
    )
  ),
  gaming_table!inner (
    name
  )
` as const;
```

This pattern joins `rating_slip → visit → player` but is only used for closed slips ("Start From Previous" panel), not active slips.

---

## Database Schema (Join Path Exists)

```sql
-- From 00000000000000_baseline_srm.sql

create table visit (
  id uuid primary key,
  player_id uuid not null references player(id),  -- Player link
  ...
);

create table rating_slip (
  id uuid primary key,
  visit_id uuid references visit(id),  -- Visit link
  ...
);

create table player (
  id uuid primary key,
  first_name text not null,
  last_name text not null,
  ...
);
```

**Join path:** `rating_slip.visit_id → visit.player_id → player.first_name/last_name`

---

## Recommended Fix

### Option A: Add RATING_SLIP_WITH_PLAYER_SELECT (Preferred)

```typescript
// In services/rating-slip/selects.ts
export const RATING_SLIP_WITH_PLAYER_SELECT = `
  id, casino_id, visit_id, table_id, seat_number,
  start_time, end_time, status, average_bet, game_settings,
  policy_snapshot, previous_slip_id, move_group_id,
  accumulated_seconds, final_duration_seconds,
  visit (
    player_id,
    player (
      id,
      first_name,
      last_name,
      tier
    )
  )
` as const;
```

### Option B: Extend listForTable with Optional Player Include

```typescript
// In services/rating-slip/crud.ts
export async function listForTable(
  supabase: SupabaseClient<Database>,
  tableId: string,
  filters: RatingSlipListFilters & { includePlayer?: boolean } = {},
): Promise<{ items: RatingSlipWithPlayerDTO[] | RatingSlipDTO[]; cursor: string | null }> {
  const select = filters.includePlayer
    ? RATING_SLIP_WITH_PLAYER_SELECT
    : RATING_SLIP_SELECT;
  // ...
}
```

### Option C: Add Query Parameter to API Endpoint

```
GET /api/v1/rating-slips?table_id=xxx&status=active&include=player
```

---

## Optimal Data Flow (After Fix)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PIT DASHBOARD CLIENT                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  useActiveSlipsWithPlayer(tableId)                                          │
│     └─→ GET /api/v1/rating-slips?table_id=xxx&status=active&include=player  │
│         └─→ listForTable({ includePlayer: true })                           │
│             └─→ RATING_SLIP_WITH_PLAYER_SELECT                              │
│                 └─→ Single join: rating_slip → visit → player               │
│                     └─→ Returns: RatingSlipWithPlayerDTO                    │
│                         { id, seat_number, ..., player: { firstName, ... }} │
│                                                                             │
│  mapSlipsWithPlayerToOccupants() - direct mapping, no filtering             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Files Affected

### Current Workaround (to be replaced)

| File | Change |
|------|--------|
| `components/dashboard/seat-context-menu.tsx` | Added `mapActivePlayersToOccupants()` |
| `components/dashboard/pit-dashboard-client.tsx` | Added `useCasinoActivePlayers()` call |

### Proper Fix Would Modify

| File | Change |
|------|--------|
| `services/rating-slip/selects.ts` | Add `RATING_SLIP_WITH_PLAYER_SELECT` |
| `services/rating-slip/dtos.ts` | Add `RatingSlipWithPlayerDTO` |
| `services/rating-slip/mappers.ts` | Add mapper for new DTO |
| `services/rating-slip/crud.ts` | Extend `listForTable` with player option |
| `hooks/dashboard/use-dashboard-slips.ts` | Use new query with player join |
| `components/dashboard/pit-dashboard-client.tsx` | Remove `useCasinoActivePlayers()` |
| `components/dashboard/seat-context-menu.tsx` | Remove `mapActivePlayersToOccupants()` |

---

## Related Issues

- **ISSUE-DD2C45CA**: Dashboard HTTP Request Cascade (same area, different problem)
- **GAP-ACTIVITY-PANEL-CASINO-WIDE**: Created the RPC that's now being misused

---

## Definition of Done

- [ ] `RATING_SLIP_WITH_PLAYER_SELECT` added to selects.ts
- [ ] `RatingSlipWithPlayerDTO` type defined
- [ ] `listForTable` supports `includePlayer` option
- [ ] `useActiveSlipsForDashboard` uses single query with player join
- [ ] `useCasinoActivePlayers()` removed from pit-dashboard-client
- [ ] Workaround code (`mapActivePlayersToOccupants`) deprecated/removed
- [ ] Network tab shows single API call for table view
- [ ] Player names display correctly in seat tooltips
