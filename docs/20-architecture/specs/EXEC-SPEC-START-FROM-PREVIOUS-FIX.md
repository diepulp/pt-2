# EXECUTION-SPEC: Start From Previous Remediation

**Status:** Draft
**Date:** 2026-01-18
**Owner:** Platform/Architecture
**Related:** ADR-024, ADR-026, PRD-020, ISSUE-SFP-001
**Bounded Context:** RatingSlipService

---

## Problem Summary

The "Start From Previous" (closed sessions panel) implementation has three critical bugs:

### Bug 1: In-Memory Filtering After Pagination (Severity: HIGH)

**Location:** `services/rating-slip/crud.ts:811-816`

```typescript
// CURRENT (BROKEN): Filters AFTER DB query with LIMIT
const filteredData = (data ?? []).filter(
  (row: any) => row.visit?.gaming_day === gamingDay,
);
```

**Impact:**
- Query fetches N+1 closed slips from ALL gaming days
- JavaScript filters to current gaming day AFTER limit applied
- Result: Returns fewer items than requested (e.g., request 50, get 20)
- Pagination cursors become invalid - next page may skip valid records

### Bug 2: Pagination Parameters Not Wired (Severity: MEDIUM)

**Location:** `hooks/rating-slip/use-closed-slips-for-gaming-day.ts:40`

```typescript
// CURRENT (BROKEN): No parameters passed
queryFn: () => fetchClosedSlipsForGamingDay(),
```

**Impact:**
- Hook accepts `gamingDay` parameter but never passes `limit`/`cursor`
- No "Load More" capability in UI
- All results crammed into first request (may exceed limit)

### Bug 3: Missing Index (Severity: LOW)

**Missing:** Composite index on `rating_slip(status, end_time)`

**Impact:**
- Query performs sequential scan on closed slips
- Performance degrades as slip count grows

### Bug 4: Stale Intermediate Slips Included (Severity: HIGH)

**Root Cause:** Rating slips are closed every time a player moves seats/tables. The current query returns ALL closed slips, including intermediate move slips.

**Rating Slip Lifecycle:**
```
Player sits at Table A, Seat 1 → Slip 1 (open)
Player moves to Table A, Seat 2 → Slip 1 (closed), Slip 2 (open, previous_slip_id = Slip 1)
Player moves to Table B, Seat 3 → Slip 2 (closed), Slip 3 (open, previous_slip_id = Slip 2)
Player ends session         → Slip 3 (closed)
```

**Current behavior:** Returns Slips 1, 2, 3 (all closed)
**Desired behavior:** Returns only Slip 3 (the terminal/final slip)

**Impact:**
- Redundant data sent to client (3x rows for single player session)
- "Start From Previous" could re-open intermediate slip, creating data inconsistency
- UI shows confusing duplicate entries for same player

**Solution:** Filter to only include **terminal slips** - closed slips with no successor:
```sql
WHERE rs.status = 'closed'
  AND NOT EXISTS (
    SELECT 1 FROM rating_slip successor
    WHERE successor.previous_slip_id = rs.id
  )
```

---

## Architectural Decision

### Approach: RPC with Database-Level Filtering + ADR-024 Tenant Isolation

**Rationale:**
1. PostgREST's `.eq("visit.gaming_day", gamingDay)` syntax for nested foreign table filtering is inconsistent across versions
2. An RPC provides:
   - Guaranteed JOIN semantics
   - Proper keyset pagination with (end_time, id) tie-breaker
   - Index-friendly query plan
   - Single round-trip for complex aggregation
3. **ADR-024 Compliance:** RPC uses `set_rls_context_from_staff()` for authoritative tenant isolation
   - No `p_casino_id` parameter accepted (INV-8)
   - Casino scope derived from staff table lookup, not caller input
   - RLS policies on `visit` and `rating_slip` enforce casino boundary

**Alternative Rejected:** PostgREST nested filter
- Reason: Behavior varies by PostgREST version; not reliably supported in Supabase

**Alternative Rejected:** RPC with `p_casino_id` parameter
- Reason: Violates ADR-024 INV-8 ("No client-callable RPC may accept casino_id as user input")

---

## Implementation Workstreams

### WS1: Database Migration

**Type:** database
**Bounded Context:** RatingSlipService
**Dependencies:** None

#### 1.1 Create RPC: `rpc_list_closed_slips_for_gaming_day`

```sql
CREATE OR REPLACE FUNCTION rpc_list_closed_slips_for_gaming_day(
  p_gaming_day date,
  p_limit int DEFAULT 50,
  p_cursor_end_time timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  visit_id uuid,
  table_id uuid,
  table_name text,
  seat_number text,                -- rating_slip.seat_number is text
  start_time timestamptz,
  end_time timestamptz,
  final_duration_seconds int,
  average_bet numeric,
  player_id uuid,
  player_first_name text,
  player_last_name text,
  player_tier text                 -- from player_loyalty, not player table
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  -- =======================================================================
  -- ADR-024: Authoritative context injection (no spoofable params)
  -- Casino scope derived from staff table lookup, not caller input
  -- =======================================================================
  PERFORM set_rls_context_from_staff();
  -- =======================================================================

  RETURN QUERY
  SELECT
    rs.id,
    rs.visit_id,
    rs.table_id,
    gt.label AS table_name,  -- gaming_table.label is the table name column
    rs.seat_number,                          -- text, matches return type
    rs.start_time,
    rs.end_time,
    rs.final_duration_seconds,
    rs.average_bet,
    p.id AS player_id,
    p.first_name AS player_first_name,
    p.last_name AS player_last_name,
    pl.tier AS player_tier                   -- tier is on player_loyalty, not player
  FROM rating_slip rs
  INNER JOIN visit v ON v.id = rs.visit_id
  INNER JOIN gaming_table gt ON gt.id = rs.table_id
  LEFT JOIN player p ON p.id = v.player_id
  LEFT JOIN player_loyalty pl ON pl.player_id = v.player_id
                              AND pl.casino_id = v.casino_id  -- casino-scoped tier lookup
  WHERE rs.status = 'closed'
    AND v.gaming_day = p_gaming_day
    -- =========================================================================
    -- CRITICAL: Only return TERMINAL slips (no successor pointing to them)
    -- Excludes intermediate slips closed due to seat/table moves
    -- A slip is terminal if no other slip has previous_slip_id = this slip's id
    -- =========================================================================
    AND NOT EXISTS (
      SELECT 1 FROM rating_slip successor
      WHERE successor.previous_slip_id = rs.id
    )
    -- Casino scope enforced by RLS on visit/rating_slip tables after context set
    AND (
      p_cursor_end_time IS NULL
      OR (rs.end_time, rs.id) < (p_cursor_end_time, p_cursor_id)
    )
  ORDER BY rs.end_time DESC, rs.id DESC
  LIMIT p_limit + 1;
END;
$$;
```

**Schema Type Alignment:**
| Column | DB Type | RPC Return | Notes |
|--------|---------|------------|-------|
| `seat_number` | `text` | `text` | ✓ Matches schema |
| `player_tier` | `text` (from `player_loyalty.tier`) | `text` | ✓ Correct source table |

**Note:** The existing SELECT in `CLOSED_SLIP_WITH_PLAYER_SELECT` incorrectly references `player.tier` which doesn't exist. The `tier` column is on `player_loyalty` (casino-scoped). This RPC corrects that by joining to `player_loyalty`.

**Key Design Points (ADR-024 Compliant):**
- **NO `p_casino_id` parameter** - INV-8 compliance
- `PERFORM set_rls_context_from_staff()` injects authoritative context from staff table
- `SECURITY INVOKER`: RLS applies via caller's context after injection
- Casino scope enforced by RLS policies on `visit` and `rating_slip` tables
- Keyset pagination with `(end_time, id)` tuple for stability
- Returns `limit + 1` for `hasMore` detection (service strips extra row)
- `LEFT JOIN player` handles ghost visits (null player_id)

#### 1.2 Create Indexes

**Index 1: Join support** (visit → rating_slip)
```sql
CREATE INDEX IF NOT EXISTS ix_rating_slip_visit_closed_end_time
  ON rating_slip (visit_id, end_time DESC, id DESC)
  WHERE status = 'closed';
```

**Rationale:**
- Query path: `visit(casino_id, gaming_day)` → join → `rating_slip(visit_id)`
- Existing `ix_visit_casino_gaming_day` filters visits by casino + gaming day
- This index supports the join from visit → rating_slip, pre-sorted by `(end_time, id)`
- Partial index on `status = 'closed'` keeps index small
- Postgres can nested-loop join: for each matching visit, probe this index by `visit_id`

**Index 2: Terminal slip filter** (NOT EXISTS subquery)
```sql
CREATE INDEX IF NOT EXISTS ix_rating_slip_previous_slip_id
  ON rating_slip (previous_slip_id)
  WHERE previous_slip_id IS NOT NULL;
```

**Rationale:**
- Supports the `NOT EXISTS (SELECT 1 WHERE successor.previous_slip_id = rs.id)` anti-join
- Partial index excludes NULLs (most slips have NULL previous_slip_id)
- Enables efficient index scan to check if any successor exists

#### 1.3 Migration File

**Name:** `{timestamp}_fix_closed_slips_rpc_and_index.sql`

```bash
# Generate timestamp
date +%Y%m%d%H%M%S  # e.g., 20260118121500
```

---

### WS2: Service Layer

**Type:** service
**Bounded Context:** RatingSlipService
**Dependencies:** WS1

#### 2.1 Update DTO (Optional)

The existing `ClosedSlipForGamingDayDTO` is already correctly shaped. No changes needed.

#### 2.2 Update `crud.ts:listClosedForGamingDay`

Replace in-memory filtering with RPC call:

```typescript
export async function listClosedForGamingDay(
  supabase: SupabaseClient<Database>,
  gamingDay: string,
  filters: { limit?: number; cursor?: { endTime: string; id: string } | null } = {},
): Promise<{ items: ClosedSlipForGamingDayDTO[]; cursor: { endTime: string; id: string } | null }> {
  const limit = filters.limit ?? 50;

  // ADR-024: Casino scope derived from RLS context via set_rls_context_from_staff()
  // No p_casino_id parameter - authoritative context injection
  const { data, error } = await supabase.rpc('rpc_list_closed_slips_for_gaming_day', {
    p_gaming_day: gamingDay,
    p_limit: limit,
    p_cursor_end_time: filters.cursor?.endTime ?? null,
    p_cursor_id: filters.cursor?.id ?? null,
  });

  if (error) throw mapDatabaseError(error);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const lastItem = items[items.length - 1];
  const cursor = hasMore && lastItem
    ? { endTime: lastItem.end_time, id: lastItem.id }
    : null;

  return {
    items: items.map(toClosedSlipForGamingDayDTO),
    cursor,
  };
}
```

**Key Changes:**
- **Remove `casinoId` parameter** - RPC derives from authoritative context (ADR-024)
- Cursor is now a tuple `{ endTime, id }` for keyset pagination
- Remove in-memory filtering (database handles it)
- Remove `as any` casts (RPC returns typed rows)

#### 2.3 Update Mapper

Add mapper for RPC result row → DTO:

```typescript
function toClosedSlipForGamingDayDTO(row: RpcClosedSlipRow): ClosedSlipForGamingDayDTO {
  return {
    id: row.id,
    visit_id: row.visit_id,
    table_id: row.table_id,
    table_name: row.table_name,
    seat_number: row.seat_number,
    start_time: row.start_time,
    end_time: row.end_time,
    final_duration_seconds: row.final_duration_seconds,
    average_bet: row.average_bet ? Number(row.average_bet) : null,
    player: row.player_id ? {
      id: row.player_id,
      first_name: row.player_first_name,
      last_name: row.player_last_name,
      tier: row.player_tier,
    } : null,
  };
}
```

---

### WS3: API Route

**Type:** api
**Bounded Context:** RatingSlipService
**Dependencies:** WS2

#### 3.1 Update Route Handler

**File:** `app/api/v1/rating-slips/closed-today/route.ts`

Update query schema to accept cursor as tuple:

```typescript
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor_end_time: z.string().datetime().optional(),
  cursor_id: z.string().uuid().optional(),
});
```

Update service call (**no casinoId to RPC** - ADR-024 compliance):

```typescript
// ========================================================================
// SECURITY: casinoId MUST come from validated middleware context, NOT query params
// withServerAction extracts casinoId from JWT claims → mwCtx.rlsContext.casinoId
// This is authoritative - never trust client-provided casino identifiers
// ========================================================================
const casinoId = mwCtx.rlsContext!.casinoId;  // From JWT, not request

// Gaming day computed for response (informational) - uses authoritative casinoId
const gamingDayInfo = await casinoService.computeGamingDay(casinoId);
const gamingDay = gamingDayInfo.gaming_day;

// ADR-024: RPC derives casino scope internally via set_rls_context_from_staff()
// No casinoId passed to service - RPC enforces tenant isolation
const result = await ratingSlipService.listClosedForGamingDay(
  gamingDay,
  {
    limit: query.limit,
    cursor: query.cursor_end_time && query.cursor_id
      ? { endTime: query.cursor_end_time, id: query.cursor_id }
      : null,
  },
);
```

**Security Context Flow:**
```
JWT claims → withServerAction → mwCtx.rlsContext.casinoId (route-level)
                                         ↓
                              computeGamingDay(casinoId) → gaming_day
                                         ↓
                              RPC: set_rls_context_from_staff() → app.casino_id (DB-level)
```

Both the route (for gaming day computation) and the RPC (for data filtering) derive casino context from authoritative sources - never from client input.

Update response to include cursor tuple:

```typescript
return Response.json({
  items: result.items,
  cursor: result.cursor,  // Now { endTime, id } | null
  gamingDay,  // Informational - not used for filtering
});
```

---

### WS4: Client Layer (Hook + UI)

**Type:** frontend
**Bounded Context:** RatingSlipService
**Dependencies:** WS3

#### 4.1 Update HTTP Service

**File:** `services/rating-slip/http.ts`

```typescript
export interface ClosedTodayResponse {
  items: ClosedSlipForGamingDayDTO[];
  cursor: { endTime: string; id: string } | null;
  gamingDay: string;
}

export async function fetchClosedSlipsForGamingDay(filters: {
  limit?: number;
  cursor?: { endTime: string; id: string } | null;
} = {}): Promise<ClosedTodayResponse> {
  const params = new URLSearchParams();
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.cursor) {
    params.set('cursor_end_time', filters.cursor.endTime);
    params.set('cursor_id', filters.cursor.id);
  }
  const url = params.toString()
    ? `${BASE}/closed-today?${params}`
    : `${BASE}/closed-today`;
  return fetchJSON<ClosedTodayResponse>(url);
}
```

#### 4.2 Update Hook with Infinite Query

**File:** `hooks/rating-slip/use-closed-slips-for-gaming-day.ts`

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';

export function useClosedSlipsForGamingDay(
  casinoId: string,
  gamingDay: string | undefined,
  options: { limit?: number } = {},
) {
  const limit = options.limit ?? 50;

  return useInfiniteQuery({
    queryKey: ratingSlipKeys.closedToday(casinoId, gamingDay ?? ''),
    queryFn: ({ pageParam }) => fetchClosedSlipsForGamingDay({
      limit,
      cursor: pageParam ?? null,
    }),
    initialPageParam: null as { endTime: string; id: string } | null,
    getNextPageParam: (lastPage) => lastPage.cursor,
    enabled: !!casinoId && !!gamingDay,
    staleTime: 30_000,
  });
}
```

#### 4.3 Update Panel Component

**File:** `components/pit-panels/closed-sessions-panel.tsx`

Add "Load More" button:

```tsx
const {
  data,
  isLoading,
  error,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage
} = useClosedSlipsForGamingDay(casinoId, gamingDay);

// Flatten pages
const closedSlips = data?.pages.flatMap(page => page.items) ?? [];

// In JSX:
{hasNextPage && (
  <Button
    variant="ghost"
    onClick={() => fetchNextPage()}
    disabled={isFetchingNextPage}
  >
    {isFetchingNextPage ? 'Loading...' : 'Load More'}
  </Button>
)}
```

---

## Phase 2: "Start From Previous" Action (Future)

**Not in scope for this fix.** Separate EXEC-SPEC required.

When implemented, "Start From Previous" should:
1. Create a NEW rating slip (not mutate the closed one)
2. Link via `reopened_from_rating_slip_id` column
3. Copy: `visit_id`, `table_id`, `seat_number`
4. Set: `start_time = now()`, `status = 'open'`
5. Write audit log entry

---

## Validation Checklist

### Pre-Implementation

- [ ] Confirm `visit.gaming_day` is `date` type (verified: ✅)
- [ ] Confirm existing index `ix_visit_casino_gaming_day` exists (verified: ✅)
- [ ] Review ADR-026 for gaming day semantics (verified: ✅)
- [ ] Review ADR-024 for tenant isolation pattern (verified: ✅)

### Post-Implementation

- [ ] RPC returns correct results for current gaming day only
- [ ] RPC returns only records from caller's casino (ADR-024 tenant isolation)
- [ ] RPC returns only **terminal slips** (no intermediate move slips)
- [ ] Pagination works: 50 items requested → 50 items returned (when available)
- [ ] Keyset cursor is stable under concurrent inserts
- [ ] `npm run db:types` regenerates RPC types
- [ ] Build passes: `npm run build`
- [ ] Hook returns paginated data with `hasNextPage`
- [ ] UI "Load More" fetches next page correctly

### Terminal Slip Validation

- [ ] Player with 3 moves in session → only 1 slip returned (the final one)
- [ ] Player with no moves → slip returned normally
- [ ] Intermediate slip IDs do NOT appear in results
- [ ] `EXPLAIN ANALYZE` shows index scan on `ix_rating_slip_previous_slip_id`

### Security Validation (ADR-024)

- [ ] RPC does NOT accept `p_casino_id` parameter
- [ ] RPC calls `set_rls_context_from_staff()` as first statement
- [ ] Test: Staff from Casino A cannot see Casino B closed slips

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/{timestamp}_fix_closed_slips_rpc_and_index.sql` | NEW: RPC (ADR-024 compliant) + index |
| `services/rating-slip/crud.ts` | Replace in-memory filter with RPC call (no casinoId param) |
| `services/rating-slip/mappers.ts` | Add RPC row mapper |
| `app/api/v1/rating-slips/closed-today/route.ts` | Update query schema for cursor tuple |
| `services/rating-slip/http.ts` | Update cursor type |
| `hooks/rating-slip/use-closed-slips-for-gaming-day.ts` | Switch to `useInfiniteQuery` |
| `components/pit-panels/closed-sessions-panel.tsx` | Add "Load More" button |
| `types/remote/database.types.ts` | AUTO: Run `npm run db:types` |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| RPC returns wrong gaming day data | Low | High | Test with multi-day data set |
| Cursor becomes invalid on concurrent writes | Low | Medium | Keyset pagination handles this by design |
| Performance regression | Low | Low | Partial index on `status='closed'` |

---

## Definition of Done

1. [ ] Migration applied successfully
2. [ ] RPC query plan uses index (verify with `EXPLAIN ANALYZE`)
3. [ ] In-memory filtering removed from `crud.ts`
4. [ ] Hook uses `useInfiniteQuery` with cursor support
5. [ ] UI displays paginated results with "Load More"
6. [ ] No `as any` casts in modified code
7. [ ] All tests pass
8. [ ] Build passes
