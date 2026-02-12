---
id: ISSUE-DD2C45CA
title: Dashboard HTTP Request Cascade Remediation
service: RatingSlipService
phase: Performance Hardening
pattern: Batch Query + Targeted Cache Invalidation
http_boundary: true
version: 1.0.0
created: 2025-12-27
status: ready
source: docs/issues/ISSUE-DD2C45CA-DASHBOARD-HTTP-CASCADE.md
target_improvement: 87.5% (8 requests → 1 request)

workstreams:
  WS1:
    name: Batch RPC for Dashboard Tables
    description: Create rpc_get_dashboard_tables_with_counts RPC to replace N×2 HTTP pattern
    executor: rls-expert
    executor_type: skill
    status: pending
    depends_on: []
    parallel_group: A
    outputs:
      - supabase/migrations/YYYYMMDDHHMMSS_dashboard_tables_batch_rpc.sql
    gate: migration-apply
    estimated_impact: "-7 requests (8→1)"
    estimated_complexity: medium
    notes: |
      Creates SECURITY INVOKER RPC that:
      1. Self-injects RLS context via set_rls_context(p_casino_id)
      2. Joins gaming_table with COUNT of active (open+paused) rating_slips
      3. Returns jsonb array matching DashboardTableDTO structure
      ADR-015 Phase 1A compliant.

  WS2:
    name: Update useDashboardTables Hook
    description: Replace N×2 HTTP pattern with single RPC call
    executor: frontend-design-pt-2
    executor_type: skill
    status: pending
    depends_on: [WS1]
    parallel_group: B
    outputs:
      - hooks/dashboard/use-dashboard-tables.ts
    gate: type-check
    estimated_impact: "Hook refactor"
    estimated_complexity: low
    notes: |
      Replace Promise.all(tables.map(async => listRatingSlips×2))
      with single supabase.rpc('rpc_get_dashboard_tables_with_counts')
      Maintain existing DashboardTableDTO return type.

  WS3:
    name: Fix pit-dashboard-client.tsx Invalidation
    description: Replace .scope invalidation with targeted activeSlips(tableId)
    executor: frontend-design-pt-2
    executor_type: skill
    status: pending
    depends_on: []
    parallel_group: A
    outputs:
      - components/dashboard/pit-dashboard-client.tsx
    gate: type-check
    estimated_impact: "Targeted invalidation"
    estimated_complexity: low
    notes: |
      Fix pauseMutation, resumeMutation, closeMutation:
      - Replace dashboardKeys.slips.scope with dashboardKeys.activeSlips(selectedTableId)
      - Keep dashboardKeys.stats(casinoId) as-is
      - closeMutation: Also invalidate tables(casinoId) instead of tables.scope

  WS4:
    name: Fix new-slip-modal.tsx Invalidation
    description: Replace .scope invalidation with targeted activeSlips(tableId)
    executor: frontend-design-pt-2
    executor_type: skill
    status: pending
    depends_on: []
    parallel_group: A
    outputs:
      - components/dashboard/new-slip-modal.tsx
    gate: type-check
    estimated_impact: "Targeted invalidation"
    estimated_complexity: low
    notes: |
      Already uses dashboardKeys.activeSlips(tableId) - verify and keep
      Remove dashboardKeys.tables.scope invalidation (causes cascade)
      Only invalidate tables(casinoId) for occupancy changes

  WS5:
    name: Fix use-close-with-financial.ts Invalidation
    description: Replace .scope invalidation with targeted activeSlips(tableId)
    executor: frontend-design-pt-2
    executor_type: skill
    status: pending
    depends_on: []
    parallel_group: A
    outputs:
      - hooks/rating-slip-modal/use-close-with-financial.ts
    gate: type-check
    estimated_impact: "Targeted invalidation"
    estimated_complexity: low
    notes: |
      Already has tableId in CloseWithFinancialInput - good!
      Already uses dashboardKeys.activeSlips(tableId) - good!
      Remove dashboardKeys.tables.scope and dashboardKeys.slips.scope
      Only invalidate tables(casinoId) for occupancy changes

  WS6:
    name: Hook Unit Tests
    description: Unit tests for useDashboardTables RPC integration
    executor: qa-specialist
    executor_type: skill
    status: pending
    depends_on: [WS2]
    parallel_group: C
    outputs:
      - hooks/dashboard/__tests__/use-dashboard-tables.test.ts
    gate: test-pass
    estimated_impact: "Test coverage"
    estimated_complexity: medium
    notes: |
      Test cases:
      - RPC called with correct casinoId
      - Empty tables returns empty array
      - RPC error maps to hook error state
      - Filters passed correctly
      QA-005 route handler test coverage pattern.

  WS7:
    name: E2E Network Cascade Test
    description: Playwright test validating ≤2 rating-slips requests on dashboard load
    executor: e2e-testing
    executor_type: skill
    status: pending
    depends_on: [WS2, WS3, WS4, WS5]
    parallel_group: D
    outputs:
      - e2e/dashboard/network-cascade.spec.ts
    gate: e2e-pass
    estimated_impact: "Regression prevention"
    estimated_complexity: medium
    notes: |
      Test:
      - Intercept /api/v1/rating-slips requests
      - Navigate to /pit
      - Assert ≤2 rating-slips requests (ideally 0 with RPC)
      - Validates RPC is being used instead of N×2 pattern

execution_phases:
  - name: "Phase 1: Foundation (Parallel)"
    parallel: [WS1, WS3, WS4, WS5]
    status: pending
    gate: migration-apply + type-check
    agents: [rls-expert, frontend-design-pt-2]
    notes: |
      WS1 (RPC) can run independently via rls-expert skill
      WS3, WS4, WS5 (invalidation fixes) can run in parallel via frontend-design-pt-2

  - name: "Phase 2: Hook Refactor"
    parallel: [WS2]
    status: pending
    gate: type-check
    agents: [frontend-design-pt-2]
    notes: |
      Depends on WS1 (RPC must exist before hook can use it)

  - name: "Phase 3: Testing (Parallel)"
    parallel: [WS6, WS7]
    status: pending
    gate: test-pass + e2e-pass
    agents: [qa-specialist, e2e-testing]
    notes: |
      Unit tests (qa-specialist) and E2E tests (e2e-testing) can run in parallel
      Both depend on WS2 (hook must work before testing)

gates:
  - name: migration-apply
    command: npx supabase db push --local
    required_for: [WS1]

  - name: type-check
    command: npm run type-check
    required_for: [WS2, WS3, WS4, WS5]

  - name: test-pass
    command: npm test -- --testPathPattern="dashboard"
    required_for: [WS6]

  - name: e2e-pass
    command: npx playwright test e2e/dashboard/network-cascade.spec.ts
    required_for: [WS7]

  - name: build
    command: npm run build
    required_for: [FINAL]

risks:
  - risk: "RPC may have different RLS context behavior"
    mitigation: "Using SECURITY INVOKER with set_rls_context() per ADR-015"

  - risk: "Existing dashboardKeys.slips.scope callers may break"
    mitigation: "Search codebase for all .scope usages before deployment"

  - risk: "DashboardTableDTO shape mismatch with RPC output"
    mitigation: "RPC returns explicit jsonb_build_object matching DTO fields"

---

# EXECUTION-SPEC: Dashboard HTTP Request Cascade Remediation

## Problem Statement

**Source:** `docs/issues/ISSUE-DD2C45CA-DASHBOARD-HTTP-CASCADE.md`

The pit dashboard exhibits an **8 HTTP request cascade** on every page load due to two issues:

| Issue | Root Cause | Impact |
|-------|------------|--------|
| N×2 Initial Load | `useDashboardTables` calls `listRatingSlips` twice per table | 8+ requests per load |
| Broad Cache Invalidation | `.scope` invalidation triggers refetch of all slips queries | Cascades on mutations |

**Current Behavior:**
```
GET /api/v1/rating-slips?table_id=table1&status=open
GET /api/v1/rating-slips?table_id=table1&status=paused
GET /api/v1/rating-slips?table_id=table2&status=open
GET /api/v1/rating-slips?table_id=table2&status=paused
... (4 tables × 2 statuses = 8 requests)
```

**Target:** 8 HTTP requests → **1 RPC call** (87.5% reduction)

## Scope

### In Scope
- Create batch RPC `rpc_get_dashboard_tables_with_counts`
- Refactor `useDashboardTables` to use RPC
- Fix targeted cache invalidation in 3 files
- E2E test for network cascade prevention

### Out of Scope
- Other dashboard optimizations
- Real-time subscription changes
- Table lifecycle management

## Architecture Context

### Query Key Structure

```
dashboardKeys.tables(casinoId, filters?)
├─ Key: ["dashboard", "tables", casinoId, serializeFilters(...)]
└─ Scope: ["dashboard", "tables"]  ← Used by invalidateQueries

dashboardKeys.slips(tableId, filters?)
├─ Key: ["dashboard", "slips", tableId, serializeFilters(...)]
└─ Scope: ["dashboard", "slips"]  ← PROBLEM: too broad

dashboardKeys.activeSlips(tableId)
├─ Key: ["dashboard", "active-slips", tableId]
└─ NO SCOPE - Only exact key invalidation works ← CORRECT
```

**Problem:** Invalidating `.slips.scope` refetches ALL slips queries across ALL tables.

### Commit 7d61d66 Partial Fix

The previous fix addressed cache invalidation in:
- ✅ `components/pit-panels/pit-panels-client.tsx`
- ✅ `components/dashboard/active-slips-panel.tsx`
- ✅ `hooks/dashboard/use-dashboard-realtime.tsx`

But missed:
- ❌ `components/dashboard/pit-dashboard-client.tsx`
- ❌ `components/dashboard/new-slip-modal.tsx`
- ❌ `hooks/rating-slip-modal/use-close-with-financial.ts`

---

## Workstream Details

### WS1: Batch RPC for Dashboard Tables

**Agent:** `rls-expert` (Skill)
**Parallel Group:** A
**Estimated Impact:** -7 requests

**RPC Implementation:**

```sql
-- Migration: YYYYMMDDHHMMSS_dashboard_tables_batch_rpc.sql

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
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', gt.id,
        'label', gt.label,
        'type', gt.type,
        'status', gt.status,
        'pit', gt.pit,
        'seat_count', gt.seat_count,
        'min_bet', gt.min_bet,
        'max_bet', gt.max_bet,
        'current_dealer', null,
        'activeSlipsCount', COALESCE(slip_counts.count, 0)
      ) ORDER BY gt.label
    ), '[]'::jsonb)
    FROM gaming_table gt
    LEFT JOIN (
      SELECT table_id, COUNT(*)::int as count
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

**Acceptance Criteria:**
- [ ] RPC created with SECURITY INVOKER
- [ ] RLS context properly set via set_rls_context()
- [ ] Returns jsonb matching DashboardTableDTO[]
- [ ] Count only includes open+paused slips

---

### WS2: Update useDashboardTables Hook

**Agent:** `frontend-design-pt-2` (Skill)
**Parallel Group:** B (depends on WS1)
**Estimated Impact:** Hook refactor

**Before:**
```typescript
// N×2 pattern - 8 requests for 4 tables
const tablesWithSlipCounts = await Promise.all(
  tables.map(async (table) => {
    const [openResult, pausedResult] = await Promise.all([
      listRatingSlips({ table_id: table.id, status: "open", limit: 100 }),
      listRatingSlips({ table_id: table.id, status: "paused", limit: 100 }),
    ]);
    // ...
  }),
);
```

**After:**
```typescript
// Single RPC call
export function useDashboardTables(
  casinoId: string | undefined,
  filters: DashboardTablesFilters = {},
) {
  return useQuery({
    queryKey: dashboardKeys.tables(casinoId!, filters),
    queryFn: async (): Promise<DashboardTableDTO[]> => {
      const supabase = createClient();

      const { data, error } = await supabase.rpc(
        'rpc_get_dashboard_tables_with_counts',
        { p_casino_id: casinoId }
      );

      if (error) throw mapDatabaseError(error);

      // Apply client-side filters if needed
      let tables = data as DashboardTableDTO[];
      if (filters.status) {
        tables = tables.filter(t => t.status === filters.status);
      }
      if (filters.type) {
        tables = tables.filter(t => t.type === filters.type);
      }
      if (filters.pit) {
        tables = tables.filter(t => t.pit === filters.pit);
      }

      return tables;
    },
    enabled: !!casinoId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
```

**Acceptance Criteria:**
- [ ] Single RPC call replaces N×2 pattern
- [ ] DashboardTableDTO type preserved
- [ ] Client-side filters work correctly
- [ ] Type-check passes

---

### WS3: Fix pit-dashboard-client.tsx Invalidation

**Agent:** `frontend-design-pt-2` (Skill)
**Parallel Group:** A
**Estimated Impact:** Targeted invalidation

**Before:**
```typescript
const pauseMutation = useMutation({
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope }); // BROAD
    // ...
  },
});
```

**After:**
```typescript
const pauseMutation = useMutation({
  onSuccess: () => {
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

**Changes Required:**
- `pauseMutation.onSuccess`: Replace `.slips.scope` with `activeSlips(selectedTableId)`
- `resumeMutation.onSuccess`: Replace `.slips.scope` with `activeSlips(selectedTableId)`
- `closeMutation.onSuccess`: Replace `.slips.scope` with `activeSlips(selectedTableId)`, replace `.tables.scope` with `tables(casinoId)`

**Acceptance Criteria:**
- [ ] All three mutations use targeted invalidation
- [ ] selectedTableId checked before invalidating activeSlips
- [ ] Type-check passes

---

### WS4: Fix new-slip-modal.tsx Invalidation

**Agent:** `frontend-design-pt-2` (Skill)
**Parallel Group:** A

**Current State (lines 114-125):**
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope }); // BROAD
  queryClient.invalidateQueries({ queryKey: dashboardKeys.activeSlips(tableId) }); // OK
  queryClient.invalidateQueries({ queryKey: dashboardKeys.stats(casinoId) }); // OK
  queryClient.invalidateQueries({ queryKey: dashboardKeys.tables.scope }); // BROAD
  onOpenChange(false);
},
```

**After:**
```typescript
onSuccess: () => {
  // TARGETED: Only invalidate this table's slips
  queryClient.invalidateQueries({
    queryKey: dashboardKeys.activeSlips(tableId),
  });
  queryClient.invalidateQueries({
    queryKey: dashboardKeys.stats(casinoId),
  });
  // Invalidate tables for this casino only (occupancy changed)
  queryClient.invalidateQueries({
    queryKey: dashboardKeys.tables(casinoId),
  });
  onOpenChange(false);
},
```

**Acceptance Criteria:**
- [ ] Remove `.slips.scope` invalidation
- [ ] Remove `.tables.scope` invalidation
- [ ] Keep `activeSlips(tableId)` (already correct)
- [ ] Use `tables(casinoId)` instead of `tables.scope`

---

### WS5: Fix use-close-with-financial.ts Invalidation

**Agent:** `frontend-design-pt-2` (Skill)
**Parallel Group:** A

**Current State (lines 149-168):**
```typescript
onSuccess: (_, { slipId, visitId, casinoId, tableId }) => {
  // ...
  queryClient.invalidateQueries({ queryKey: dashboardKeys.tables.scope }); // BROAD
  queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope }); // BROAD
  queryClient.invalidateQueries({ queryKey: dashboardKeys.activeSlips(tableId) }); // OK
  // ...
},
```

**After:**
```typescript
onSuccess: (_, { slipId, visitId, casinoId, tableId }) => {
  // Invalidate modal cache
  queryClient.invalidateQueries({
    queryKey: ratingSlipModalKeys.scope,
  });

  // Invalidate financial summary
  queryClient.invalidateQueries({
    queryKey: playerFinancialKeys.visitSummary(visitId),
  });

  // TARGETED: Only invalidate this table's slips
  queryClient.invalidateQueries({
    queryKey: dashboardKeys.activeSlips(tableId),
  });

  // Invalidate tables for this casino only
  queryClient.invalidateQueries({
    queryKey: dashboardKeys.tables(casinoId),
  });

  // Invalidate stats
  queryClient.invalidateQueries({
    queryKey: dashboardKeys.stats(casinoId),
  });
},
```

**Acceptance Criteria:**
- [ ] Remove `.slips.scope` invalidation
- [ ] Remove `.tables.scope` invalidation
- [ ] Keep `activeSlips(tableId)` (already correct)
- [ ] Use `tables(casinoId)` instead of `tables.scope`

---

### WS6: Hook Unit Tests

**Agent:** `qa-specialist` (Skill)
**Parallel Group:** C
**Depends On:** WS2

**Test File:** `hooks/dashboard/__tests__/use-dashboard-tables.test.ts`

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { useDashboardTables } from "../use-dashboard-tables";

describe("useDashboardTables", () => {
  it("calls RPC with correct casinoId", async () => {
    // Mock supabase.rpc
    const mockRpc = jest.fn().mockResolvedValue({
      data: [{ id: "1", label: "BJ1", activeSlipsCount: 2 }],
      error: null,
    });

    // ...test implementation
  });

  it("returns empty array when no tables", async () => {
    // ...
  });

  it("applies client-side status filter", async () => {
    // ...
  });

  it("handles RPC error", async () => {
    // ...
  });
});
```

---

### WS7: E2E Network Cascade Test

**Agent:** `e2e-testing` (Skill)
**Parallel Group:** D
**Depends On:** WS2, WS3, WS4, WS5

**Test File:** `e2e/dashboard/network-cascade.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test.describe("Dashboard Network Cascade Prevention", () => {
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
    // Allow up to 2 for edge cases (e.g., realtime subscription refresh)
    expect(ratingSlipsRequests.length).toBeLessThanOrEqual(2);
  });

  test("mutation triggers targeted invalidation only", async ({ page }) => {
    const ratingSlipsRequests: string[] = [];

    await page.goto("/pit");
    await page.waitForLoadState("networkidle");

    // Clear previous requests
    ratingSlipsRequests.length = 0;

    page.on("request", (request) => {
      if (request.url().includes("/api/v1/rating-slips")) {
        ratingSlipsRequests.push(request.url());
      }
    });

    // Trigger a mutation (e.g., pause slip)
    // ...

    // Should only refetch the affected table's slips
    expect(ratingSlipsRequests.length).toBeLessThanOrEqual(2);
  });
});
```

---

## Definition of Done

- [ ] `rpc_get_dashboard_tables_with_counts` RPC created and deployed (WS1)
- [ ] `useDashboardTables` refactored to use single RPC call (WS2)
- [ ] `pit-dashboard-client.tsx` uses targeted invalidation (WS3)
- [ ] `new-slip-modal.tsx` uses targeted invalidation (WS4)
- [ ] `use-close-with-financial.ts` uses targeted invalidation (WS5)
- [ ] Unit tests pass (WS6)
- [ ] E2E test validates ≤2 rating-slips requests (WS7)
- [ ] `npm run build` passes
- [ ] Server logs confirm 8 requests reduced to 1-2

---

## Execution Order

```
Phase 1 (Parallel):
├── WS1: RPC Creation (rls-expert skill)
├── WS3: pit-dashboard-client fix (frontend-design-pt-2 skill)
├── WS4: new-slip-modal fix (frontend-design-pt-2 skill)
└── WS5: use-close-with-financial fix (frontend-design-pt-2 skill)

Phase 2 (Sequential):
└── WS2: Hook Refactor (frontend-design-pt-2 skill) ← depends on WS1

Phase 3 (Parallel):
├── WS6: Unit Tests (qa-specialist skill)
└── WS7: E2E Tests (e2e-testing skill)
```

---

## References

- Source Issue: `docs/issues/ISSUE-DD2C45CA-DASHBOARD-HTTP-CASCADE.md`
- PERF-001 Execution Spec: `docs/20-architecture/specs/PERF-001/EXECUTION-SPEC-PERF-001.md`
- ADR-015 RLS Patterns: `docs/80-adrs/ADR-015-rls-hybrid-context-injection.md`
- Dashboard Keys: `hooks/dashboard/keys.ts`
- Commit 7d61d66: Partial cascade fix (3 of 6 files)
