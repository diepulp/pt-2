# QA Findings Report: Rating Slip Performance Investigation

**Date:** 2026-01-01
**Investigator:** QA Specialist
**Scope:** Rating slip open, save, and close workflows
**Status:** Complete

---

## Executive Summary

The rating slip modal workflows exhibit several performance bottlenecks across the entire stack. The primary issues are:

1. **Sequential API calls** in mutation hooks (save, close operations)
2. **Excessive cache invalidations** triggering unnecessary re-renders (6-8 invalidations per operation)
3. **Synchronous JSON.stringify** in render path for dirty checking
4. **BFF endpoint latency** (~600ms legacy path vs ~150ms RPC path)
5. **Feature flag dependency** - RPC optimization not enabled by default

### Severity Assessment
- **P0 Critical:** Sequential operations in close flow (3 API calls in series)
- **P1 High:** Cache invalidation cascade (6+ invalidations per mutation)
- **P1 High:** isDirty computation using JSON.stringify on every render
- **P2 Medium:** RPC feature flag not enabled in production

---

## Detailed Metrics & Findings

### 1. Modal Open Flow (`useRatingSlipModalData`)

**File:** `hooks/rating-slip-modal/use-rating-slip-modal.ts`

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| BFF RPC path latency | ~150ms | <300ms | :white_check_mark: |
| BFF legacy path latency | ~600ms | <300ms | :x: |
| Query staleTime | 10s | - | OK |
| Query gcTime | 5min | - | OK |

**Issues:**
- Feature flag `NEXT_PUBLIC_USE_MODAL_BFF_RPC` controls path selection
- Legacy path performs **7 sequential/parallel queries** across 5 bounded contexts:
  - Phase A (sequential): getSlip, getVisit
  - Phase B (parallel): getTable, getDuration, getPlayer, getFinancial, getActiveTables
  - Phase C (parallel): getLoyalty, getOccupiedSeats

**Evidence:** `app/api/v1/rating-slips/[id]/modal-data/route.ts:154-259`

```typescript
// LEGACY PATH: Multi-query aggregation (~600ms)
// Phase A: Sequential (required dependencies)
const slipWithPauses = await timed("A1_getSlip", () => ...);
const visit = await timed("A2_getVisit", () => ...);
// Phase B: Parallel (independent queries)
const [table, durationSeconds, player, financialSummary, activeTables] =
  await Promise.all([...]);
// Phase C: Parallel (player-dependent + batch seats)
const [loyaltyData, occupiedSeatsMap] = await Promise.all([...]);
```

---

### 2. Modal Save Flow (`useSaveWithBuyIn`)

**File:** `hooks/rating-slip-modal/use-save-with-buyin.ts`

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Sequential API calls | 2 | 1 | :x: |
| Cache invalidations | 3 | 1-2 | :x: |
| Optimistic update | Yes | - | :white_check_mark: |

**Issues:**

**P1 - Sequential Operations (lines 66-91):**
```typescript
// 1. Record buy-in transaction (if applicable)
if (newBuyIn > 0 && playerId) {
  await createFinancialTransaction({...});
}
// 2. Update average_bet (BLOCKS on step 1)
return updateAverageBet(slipId, { average_bet: averageBet });
```

**Recommendation:** These could run in parallel with Promise.all() when both are needed.

**P2 - Cache Invalidation Cascade (lines 131-145):**
```typescript
onSuccess: (_, { slipId, visitId }) => {
  queryClient.invalidateQueries({
    queryKey: ratingSlipModalKeys.data(slipId),
  });
  queryClient.invalidateQueries({
    queryKey: playerFinancialKeys.visitSummary(visitId),
  });
  queryClient.invalidateQueries({
    queryKey: dashboardKeys.slips.scope,  // <-- BROAD invalidation
  });
}
```

The `dashboardKeys.slips.scope` invalidation is **too broad** - it refetches slips for ALL tables, not just the affected one.

---

### 3. Modal Close Flow (`useCloseWithFinancial`)

**File:** `hooks/rating-slip-modal/use-close-with-financial.ts`

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Sequential API calls | 3 | 1 | :x: |
| Cache invalidations | 6+ | 2-3 | :x: |
| Optimistic update | Yes | - | :white_check_mark: |

**Issues:**

**P0 - Sequential Operations (lines 74-126):**
```typescript
// 1. Record chips-taken transaction (BLOCKS)
if (chipsTaken > 0 && playerId) {
  await createFinancialTransaction({...});
}
// 2. Close the rating slip (BLOCKS on step 1)
const closeResult = await closeRatingSlip(slipId, ...);
// 3. Trigger loyalty accrual (BLOCKS on step 2)
if (playerId) {
  try {
    await accrueOnClose({...});
  } catch { /* best-effort */ }
}
```

**Total sequential latency:** 3 HTTP roundtrips when all conditions met.

**P1 - Excessive Cache Invalidation (lines 166-201):**
```typescript
onSuccess: (...) => {
  // 1. Modal queries
  queryClient.invalidateQueries({
    queryKey: ratingSlipModalKeys.scope,  // <-- BROAD
  });
  // 2. Financial summary
  queryClient.invalidateQueries({
    queryKey: playerFinancialKeys.visitSummary(visitId),
  });
  // 3. Active slips for this table (good - targeted)
  queryClient.invalidateQueries({
    queryKey: dashboardKeys.activeSlips(tableId),
  });
  // 4. Tables for casino
  queryClient.invalidateQueries({
    queryKey: dashboardKeys.tables(casinoId),
  });
  // 5. Stats
  queryClient.invalidateQueries({
    queryKey: dashboardKeys.stats(casinoId),
  });
  // 6. Loyalty balance
  if (playerId) {
    queryClient.invalidateQueries({
      queryKey: loyaltyKeys.balance(playerId, casinoId),
    });
    // 7. Loyalty ledger
    queryClient.invalidateQueries({
      queryKey: loyaltyKeys.ledger.scope,  // <-- BROAD
    });
  }
}
```

**Total invalidations:** 6-7 query invalidations triggering multiple HTTP requests.

---

### 4. Component Render Performance

**File:** `components/modals/rating-slip/rating-slip-modal.tsx`

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| isDirty computation | JSON.stringify | Shallow compare | :x: |
| Computed values memoization | None | useMemo | :x: |
| Form sections | 5 | - | OK |

**Issues:**

**P1 - Expensive isDirty Computation (line 208):**
```typescript
// Computed on EVERY render
const isDirty = JSON.stringify(formState) !== JSON.stringify(originalState);
```

This runs on every render, including every keystroke in form inputs.

**P2 - Unmemoized Computed Values (lines 283-293):**
```typescript
// Recomputed on every render
const totalCashIn = modalData ? modalData.financial.totalCashIn / 100 : 0;
const pendingChipsTaken = Number(formState.chipsTaken) || 0;
const computedChipsOut = modalData
  ? (modalData.financial.totalChipsOut + pendingChipsTaken * 100) / 100
  : 0;
const computedNetPosition = totalCashIn - computedChipsOut;
```

These arithmetic operations are trivial but represent missed optimization opportunities.

---

### 5. Realtime Implementation

**File:** `hooks/dashboard/use-dashboard-realtime.tsx`

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Channel scoping | casino_id filter | - | :white_check_mark: |
| Targeted invalidation | Yes (PRD-020) | - | :white_check_mark: |
| Connection management | Proper cleanup | - | :white_check_mark: |

**Good Patterns Found:**
- Single channel per casino (`dashboard:${casinoId}`)
- Targeted invalidation based on `table_id` from payload
- Proper cleanup in useEffect return function
- Does NOT invalidate `tables.scope` (prevents cascade)

**Minor Issue:**
- Dependency array includes `selectedTableId` but it's not used in the effect (line 194)

---

### 6. Zustand Store Implementation

**File:** `store/rating-slip-modal-store.ts` & `hooks/ui/use-rating-slip-modal.ts`

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Field-specific selectors | Yes | - | :white_check_mark: |
| useShallow usage | Yes | - | :white_check_mark: |
| devtools middleware | Yes | - | :white_check_mark: |

**Good Patterns Found:**
- Field-specific selectors (`useAverageBetField`, `useChipsTakenField`, etc.)
- Proper `useShallow` usage to prevent unnecessary re-renders
- DevTools integration for debugging

---

## Priority Ranking

| Priority | Issue | Impact | Effort | Files |
|----------|-------|--------|--------|-------|
| P0 | Sequential close operations (3 API calls) | High latency | Medium | `use-close-with-financial.ts` |
| P1 | Cache invalidation cascade (6+ calls) | Re-render storm | Low | `use-close-with-financial.ts`, `use-save-with-buyin.ts` |
| P1 | JSON.stringify isDirty | Every-render CPU | Low | `rating-slip-modal.tsx:208` |
| P1 | Sequential save operations | Medium latency | Low | `use-save-with-buyin.ts` |
| P2 | RPC feature flag disabled | 600ms vs 150ms | Low | `.env` / deployment |
| P2 | Unmemoized computed values | Minor | Low | `rating-slip-modal.tsx` |

---

## Recommendations for Performance Engineer

### 1. Parallelize Mutation Operations

**useCloseWithFinancial** - The three operations can be partially parallelized:
```typescript
// PROPOSED: Parallel where safe
const [_, closeResult] = await Promise.all([
  // Fire-and-forget financial transaction (error doesn't fail close)
  chipsTaken > 0 && playerId
    ? createFinancialTransaction({...}).catch(() => null)
    : Promise.resolve(null),
  closeRatingSlip(slipId, ...),
]);
// Loyalty accrual remains best-effort sequential
if (playerId) {
  accrueOnClose({...}).catch(() => {});
}
```

### 2. Reduce Cache Invalidations

Replace broad `.scope` invalidations with targeted invalidations:
```typescript
// BEFORE (bad)
queryClient.invalidateQueries({ queryKey: loyaltyKeys.ledger.scope });

// AFTER (good)
queryClient.invalidateQueries({
  queryKey: loyaltyKeys.ledger(playerId, casinoId)
});
```

### 3. Optimize isDirty Computation

```typescript
// BEFORE
const isDirty = JSON.stringify(formState) !== JSON.stringify(originalState);

// AFTER (using lodash or custom shallow compare)
import { isEqual } from 'lodash';
const isDirty = !isEqual(formState, originalState);

// OR compute dirty per-field
const isDirty = Object.keys(formState).some(
  key => formState[key] !== originalState[key]
);
```

### 4. Enable RPC Feature Flag

Verify and enable in production environment:
```bash
NEXT_PUBLIC_USE_MODAL_BFF_RPC=true
```

This alone reduces modal open latency from ~600ms to ~150ms.

---

## Test Coverage Status

| Test Type | Coverage | Location |
|-----------|----------|----------|
| Route handler tests | 38 tests, 10 suites | `app/api/v1/rating-slips/**/__tests__/` |
| HTTP contract tests | 8 contracts | `services/rating-slip/__tests__/http-contract.test.ts` |
| Performance baseline | Exists (skipped) | `modal-data/__tests__/performance/modal-data.perf.test.ts` |
| E2E tests | Defined | `e2e/workflows/rating-slip-lifecycle.spec.ts` |

---

## Appendix: Response Time Headers

The modal-data endpoint returns diagnostic headers:
- `X-Query-Timings`: JSON object with phase timings in ms
- `X-Query-Path`: "rpc" or "legacy"

Example:
```
X-Query-Timings: {"phaseA":45,"phaseB":120,"phaseC":35,"total":200}
X-Query-Path: legacy
```

---

## Next Steps

1. **Performance Engineer** should:
   - Profile actual latencies in production
   - Implement parallelization in mutation hooks
   - Reduce cache invalidation scope
   - Benchmark before/after changes

2. **Frontend Engineer** should:
   - Replace JSON.stringify isDirty with shallow compare
   - Add useMemo for computed values
   - Consider React Compiler when stable

3. **DevOps** should:
   - Enable `NEXT_PUBLIC_USE_MODAL_BFF_RPC=true` in production
   - Monitor X-Query-Timings headers
