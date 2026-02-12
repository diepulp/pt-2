# ISSUE-DD2C45CA: Dashboard HTTP Request Cascade

**Status:** Open
**Severity:** High
**Category:** Performance
**Created:** 2025-12-27
**Related PRD:** PRD-020
**Related Service:** RatingSlipService
**Tags:** PERF-001, cascade, N+1, TanStack-Query, cache-invalidation, dashboard

---

## Executive Summary

Despite commit 7d61d66 (`fix(prd-020): resolve HTTP request cascade via targeted cache invalidation`), server logs show 8+ HTTP requests per dashboard load:

```
GET /api/v1/rating-slips?table_id=6a000000-0000-0000-0000-000000000003&status=open&limit=100 200 in 482ms
GET /api/v1/rating-slips?table_id=6a000000-0000-0000-0000-000000000001&status=open&limit=100 200 in 851ms
GET /api/v1/rating-slips?table_id=6a000000-0000-0000-0000-000000000002&status=paused&limit=100 200 in 520ms
... (8+ separate requests)
```

**Root Cause:** Two distinct cascade issues exist:

| Issue | Scope | Commit 7d61d66 Impact |
|-------|-------|----------------------|
| N×2 Initial Load Cascade | `useDashboardTables` fetching | NOT addressed |
| Mutation Cache Cascade | TanStack Query invalidation | PARTIALLY fixed (3 of 6 files) |

---

## Root Cause #1: N×2 Data Fetching Pattern (CRITICAL)

### Location

`hooks/dashboard/use-dashboard-tables.ts:58-68`

### Code

```typescript
const tablesWithSlipCounts = await Promise.all(
  tables.map(async (table) => {
    // Makes 2 HTTP requests PER TABLE
    const [openResult, pausedResult] = await Promise.all([
      listRatingSlips({ table_id: table.id, status: "open", limit: 100 }),   // GET #1
      listRatingSlips({ table_id: table.id, status: "paused", limit: 100 }), // GET #2
    ]);
    return {
      ...table,
      activeSlipsCount: openResult.items.length + pausedResult.items.length
    };
  }),
);
```

### Impact

- 4 tables × 2 status queries = **8 HTTP requests** on every dashboard load
- Response times: 482-930ms per request
- Total cascade time: **4-8 seconds** potential delay

### Why Commit 7d61d66 Didn't Fix This

The commit addressed cache **invalidation** patterns (TanStack Query `onSuccess` handlers), not initial **data fetching** patterns. The `useDashboardTables` hook runs on mount and makes N×2 requests by design.

---

## Root Cause #2: Incomplete Cache Invalidation Fix

### Files Fixed by Commit 7d61d66

- ✅ `components/pit-panels/pit-panels-client.tsx`
- ✅ `components/dashboard/active-slips-panel.tsx`
- ✅ `hooks/dashboard/use-dashboard-realtime.tsx`

### Files Still Using `.scope` Invalidation

#### 1. `components/dashboard/pit-dashboard-client.tsx` (lines 149-177)

```typescript
const pauseMutation = useMutation({
  mutationFn: pauseRatingSlip,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope });  // ❌ BROAD
    queryClient.invalidateQueries({ queryKey: dashboardKeys.stats(casinoId) });
  },
});

const resumeMutation = useMutation({
  mutationFn: resumeRatingSlip,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope });  // ❌ BROAD
    // ...
  },
});

const closeMutation = useMutation({
  mutationFn: (slipId: string) => closeRatingSlip(slipId),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope });  // ❌ BROAD
    queryClient.invalidateQueries({ queryKey: dashboardKeys.tables.scope }); // ❌ BROAD
  },
});
```

#### 2. `components/dashboard/new-slip-modal.tsx` (lines 114-127)

```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope });  // ❌ BROAD
  // Missing: activeSlips(tableId) invalidation
  queryClient.invalidateQueries({ queryKey: dashboardKeys.stats(casinoId) });
  queryClient.invalidateQueries({ queryKey: dashboardKeys.tables.scope }); // ❌ BROAD
},
```

#### 3. `hooks/rating-slip-modal/use-close-with-financial.ts`

- Missing `tableId` parameter for targeted invalidation
- Cannot call `dashboardKeys.activeSlips(tableId)` without the table ID

---

## Architecture Gap Analysis

### PERF-001 vs. Current Implementation

| PERF-001 Component | Status | Gap |
|-------------------|--------|-----|
| WS1: Batch Query (`getOccupiedSeatsByTables`) | ✅ Implemented | **NOT used in `useDashboardTables`** |
| WS2: Database Indexes | ✅ Deployed | Working correctly |
| WS3: Modal-data Parallelization | ✅ Deployed | Working correctly |
| BFF RPC (PRD-018) | ✅ Enabled | Working correctly |
| **Dashboard Tables N×2 Pattern** | ❌ UNADDRESSED | Missing batch endpoint |

### Query Key Mismatch

```
dashboardKeys.slips(tableId, filters?)
├─ Key: ["dashboard", "slips", tableId, serializeFilters(...)]
└─ Scope: ["dashboard", "slips"]  ← Used by invalidateQueries

dashboardKeys.activeSlips(tableId)
├─ Key: ["dashboard", "active-slips", tableId]
└─ NO SCOPE - Only exact key invalidation works
```

**Problem**: Invalidating `.slips.scope` does NOT match `activeSlips` keys because they use different prefixes.

---

## Reproduction Steps

1. Open pit dashboard (`/pit`)
2. Observe server logs showing 8+ `GET /api/v1/rating-slips` requests
3. Note requests are per `table_id` with `status=open` AND `status=paused`
4. Pause/resume any slip and observe additional cascade requests

---

## Recommended Remediation

### Priority 1: Create Batch RPC for Dashboard Tables (Critical)

**New RPC Function:**

```sql
CREATE OR REPLACE FUNCTION rpc_get_dashboard_tables_with_counts(
  p_casino_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  -- ADR-015 Phase 1A: Self-inject RLS context
  PERFORM set_rls_context(p_casino_id);

  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', gt.id,
        'label', gt.label,
        'type', gt.type,
        'status', gt.status,
        'activeSlipsCount', COALESCE(slip_counts.count, 0)
      ) ORDER BY gt.label
    )
    FROM gaming_table gt
    LEFT JOIN (
      SELECT table_id, COUNT(*) as count
      FROM rating_slip
      WHERE status IN ('open', 'paused')
        AND casino_id = p_casino_id
      GROUP BY table_id
    ) slip_counts ON slip_counts.table_id = gt.id
    WHERE gt.casino_id = p_casino_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_dashboard_tables_with_counts(uuid) TO authenticated;
```

**Impact**: 8 HTTP requests → **1 RPC call**

**Update Hook:**

```typescript
// hooks/dashboard/use-dashboard-tables.ts
export function useDashboardTables(casinoId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.tables(casinoId!),
    queryFn: async (): Promise<DashboardTableDTO[]> => {
      const { data, error } = await supabase.rpc(
        'rpc_get_dashboard_tables_with_counts',
        { p_casino_id: casinoId }
      );
      if (error) throw mapDatabaseError(error);
      return data as DashboardTableDTO[];
    },
    enabled: !!casinoId,
    staleTime: 30_000,
  });
}
```

### Priority 2: Complete Targeted Invalidation

**Fix `pit-dashboard-client.tsx`:**

```typescript
const pauseMutation = useMutation({
  mutationFn: pauseRatingSlip,
  onSuccess: () => {
    // TARGETED: Only invalidate this table's slips
    if (selectedTableId) {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.activeSlips(selectedTableId),
      });
    }
    queryClient.invalidateQueries({
      queryKey: dashboardKeys.stats(casinoId),
    });
  },
});
```

**Fix `new-slip-modal.tsx`:**

```typescript
onSuccess: () => {
  // TARGETED: Only invalidate this table's slips
  queryClient.invalidateQueries({
    queryKey: dashboardKeys.activeSlips(tableId),
  });
  queryClient.invalidateQueries({
    queryKey: dashboardKeys.stats(casinoId),
  });
  // Note: Do NOT invalidate tables.scope
},
```

**Fix `use-close-with-financial.ts`:**

Add `tableId` to input interface and use for targeted invalidation.

### Priority 3: Add E2E Test Coverage

**Network Cascade Detection Test:**

```typescript
test("dashboard load triggers ≤2 rating-slips requests", async ({ page }) => {
  const ratingSlipsRequests: string[] = [];

  page.on("request", (request) => {
    if (request.url().includes("/api/v1/rating-slips")) {
      ratingSlipsRequests.push(request.url());
    }
  });

  await page.goto("/pit");
  await page.waitForLoadState("networkidle");

  // Should use batch RPC, not N×2 individual requests
  expect(ratingSlipsRequests.length).toBeLessThanOrEqual(2);
});
```

---

## Affected Files

| File | Issue | Fix Required |
|------|-------|--------------|
| `hooks/dashboard/use-dashboard-tables.ts` | N×2 fetching pattern | Replace with RPC call |
| `components/dashboard/pit-dashboard-client.tsx` | `.scope` invalidation | Use targeted `activeSlips(tableId)` |
| `components/dashboard/new-slip-modal.tsx` | `.scope` invalidation | Use targeted `activeSlips(tableId)` |
| `hooks/rating-slip-modal/use-close-with-financial.ts` | Missing `tableId` | Add parameter and use targeted invalidation |

---

## Definition of Done

- [ ] `rpc_get_dashboard_tables_with_counts` RPC created and deployed
- [ ] `useDashboardTables` updated to use single RPC call
- [ ] `pit-dashboard-client.tsx` mutations use targeted invalidation
- [ ] `new-slip-modal.tsx` uses targeted invalidation
- [ ] `use-close-with-financial.ts` accepts and uses `tableId`
- [ ] E2E test validates ≤2 rating-slips requests on dashboard load
- [ ] Server logs confirm 8 requests reduced to 1-2

---

## Related Documents

- [PERF-001 Execution Spec](/docs/20-architecture/specs/PERF-001/EXECUTION-SPEC-PERF-001.md)
- [PERF-001 BFF RPC Design](/docs/20-architecture/specs/PERF-001/BFF-RPC-DESIGN.md)
- [Commit 7d61d66](https://github.com/project/pt-2/commit/7d61d66) - Partial cascade fix
- [PRD-020](/docs/10-prd/PRD-020-move-player-performance-ux.md) - Move player performance

---

## Investigation Agents

This issue was diagnosed through parallel investigation by:

1. **API Expert Agent**: Identified query key mismatch and incomplete fix coverage
2. **Performance Engineer Agent**: Validated PERF-001 status and measured impact
3. **E2E Testing Agent**: Identified test coverage gaps
4. **Lead Architect**: Synthesized consensus and architectural recommendations

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-27
**Status:** Ready for PRD Pipeline
