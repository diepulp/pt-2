# PERF-004: Rating Slip "Save Changes" Sequential Waterfall

**Status:** Open
**Severity:** Medium-High
**Category:** Performance / Mutation Optimization
**Created:** 2026-01-29
**Related Components:** RatingSlipModal, ActiveSlipsPanel
**Related Hooks:** useSaveWithBuyIn, useStartRatingSlip, usePauseRatingSlip, useResumeRatingSlip, useCloseRatingSlip
**Tags:** sequential-waterfall, cache-cascade, roundtrip-overhead

---

## Executive Summary

The rating slip "Save Changes" workflow (`useSaveWithBuyIn`) executes **2 sequential HTTP roundtrips** before resolving, creating a waterfall pattern that accumulates ~200-500ms of user-perceived latency per save. A secondary issue is that **4 of 5 core rating slip mutations** use broad `.list.scope` cache invalidation, triggering unnecessary refetches across all tables on the dashboard.

---

## Current Data Flow (Inefficient)

```
User clicks "Save Changes"
│
├─ Step 1: PATCH /api/v1/rating-slips/{id}/average-bet     (~100-250ms)
│  └─ fetchJSON → route handler → withServerAction middleware
│     → auth check → set_rls_context_from_staff() → Supabase UPDATE
│     → RLS policy eval (Pattern C hybrid) → toRatingSlipDTO → JSON response
│
├─ Step 2: POST /api/v1/player-financial/transactions       (~100-250ms)  [BLOCKED ON STEP 1]
│  └─ fetchJSON → route handler → withServerAction middleware
│     → auth check → set_rls_context_from_staff() → Supabase INSERT
│     → RLS policy eval → toFinancialTransactionDTO → JSON response
│
├─ Step 3: DB trigger fn_derive_mtl_from_finance             (implicit, inside Step 2 transaction)
│
└─ onSuccess: 3-5 cache invalidations                       (~5-20ms client-side)
   ├─ ratingSlipModalKeys.data(slipId)
   ├─ playerFinancialKeys.visitSummary(visitId)
   ├─ dashboardKeys.activeSlips(tableId)
   └─ [conditional] mtlKeys.gamingDaySummary.scope + patron daily total
                                                          ─────────────
                                                   Total: ~200-500ms blocking
```

---

## Finding 1 — Sequential Waterfall in Save Path (Critical)

**File:** `hooks/rating-slip-modal/use-save-with-buyin.ts:102-147`

The mutation executes two operations sequentially with blocking `await`:

```typescript
// Step 2: Update average_bet (critical path - errors propagate)
const updateResult = await updateAverageBet(slipId, {
  average_bet: averageBet,
});

// Step 3: Record buy-in transaction (only after average_bet succeeds)
if (newBuyIn > 0 && playerId) {
  await createFinancialTransaction({
    casino_id: casinoId,
    player_id: playerId,
    visit_id: visitId,
    rating_slip_id: slipId,
    amount: newBuyIn * 100,
    direction: 'in',
    source: 'pit',
    tender_type: 'cash',
    created_by_staff_id: staffId,
  });
}
```

**Root cause:** The sequential pattern was intentionally introduced to fix a **double-entry bug** (lines 103-105) where parallel execution caused the financial transaction to commit even when the average bet validation failed. The comment reads:

> SEQUENTIAL: Update average_bet first, then record buy-in if successful.
> FIX: Previously parallel operations caused double-entry bug when average_bet
> validation failed but financial transaction already committed.

**Recommendation:** Create a composite Supabase RPC `rpc_save_rating_slip_with_buyin()` that atomically performs both operations in a single database transaction. This eliminates one full roundtrip and provides transactional safety without the sequential workaround.

**Estimated improvement:** ~100-250ms reduction (one fewer full HTTP roundtrip).

---

## Finding 2 — Broad Cache Invalidation in Core Mutations (Medium)

**File:** `hooks/rating-slip/use-rating-slip-mutations.ts:48,84,117,152`

Four mutations use `ratingSlipKeys.list.scope` invalidation, which refetches **all** rating slip list queries across every table panel:

```typescript
// Lines 48, 84, 117, 152 — BROAD invalidation
queryClient.invalidateQueries({ queryKey: ratingSlipKeys.list.scope });
```

| Mutation | Broad Invalidation | Targeted Alternative Available |
|----------|-------------------|-------------------------------|
| `useStartRatingSlip` | `list.scope` + `forTable.scope` | `activeForTable(tableId)` |
| `usePauseRatingSlip` | `list.scope` | `activeForTable(tableId)` |
| `useResumeRatingSlip` | `list.scope` | `activeForTable(tableId)` |
| `useCloseRatingSlip` | `list.scope` | `activeForTable(tableId)` |

Meanwhile, the compound hooks (`useSaveWithBuyIn`, `useCloseWithFinancial`, `useMovePlayer`) already use **targeted** invalidation per ISSUE-DD2C45CA:

```typescript
// TARGETED — only this table's slips (not all slips via .scope)
queryClient.invalidateQueries({
  queryKey: dashboardKeys.activeSlips(tableId),
});
```

**Impact:** On a dashboard with 8 tables, each core mutation triggers ~8 unnecessary HTTP refetches.

**Recommendation:** Replace `.list.scope` and `.forTable.scope` with targeted `activeForTable(tableId)` in all 4 core mutations.

---

## Finding 3 — Redundant UPDATE After Close RPC (Low-Medium)

**File:** `services/rating-slip/crud.ts:336-341`

The `close()` function calls `rpc_close_rating_slip` which calculates and returns `duration_seconds`, then issues a **separate UPDATE** to persist that value:

```typescript
const result = await supabase.rpc('rpc_close_rating_slip', {...});
// RPC already returned duration_seconds — redundant second roundtrip
await supabase
  .from('rating_slip')
  .update({ final_duration_seconds: result.duration_seconds })
  .eq('id', slipId);
```

**Recommendation:** Modify the RPC to `SET final_duration_seconds` internally before its `RETURNING` clause. Eliminates one roundtrip per close operation (~50-100ms).

---

## Finding 4 — Error-Path Fallback Query (Low)

**File:** `services/rating-slip/crud.ts:627-632`

When `updateAverageBet()` fails with `PGRST116` (no rows returned), the service makes a second query to distinguish "not found" from "already closed":

```typescript
if (error.code === 'PGRST116') {
  const { data: existing } = await supabase
    .from('rating_slip')
    .select('id, status')
    .eq('id', slipId)
    .maybeSingle();
}
```

**Impact:** Error path only — does not affect happy path latency. Low priority.

---

## Finding 5 — No Refetch Throttling on Rapid Saves (Low)

The `onSuccess` callbacks invalidate queries immediately with no debounce. Rapid successive saves (e.g., adjusting average bet multiple times) trigger a full refetch cascade each time. No `refetchType: 'active'` is configured.

**Recommendation:** Add `refetchType: 'active'` to invalidation calls so only currently-mounted queries refetch.

---

## Positive Patterns (No Action Needed)

| Pattern | Location | Assessment |
|---------|----------|------------|
| Optimistic UI updates with rollback | `use-save-with-buyin.ts:158-195` | Instant user feedback |
| Targeted invalidation in compound hooks | `use-save-with-buyin.ts:207-210` | Table-scoped refetch only |
| `useTransition` on save button | `rating-slip-modal.tsx:292` | Non-blocking UI transition |
| Idempotency keys on all mutations | `http.ts:80,125,165,204` | Safe retry semantics |
| `Promise.all` in close workflow | `use-close-with-financial.ts:95` | Parallel operations |
| Fire-and-forget loyalty accrual | `use-close-with-financial.ts:134` | Non-blocking |

---

## Prioritized Remediation Plan

| # | Finding | Severity | Effort | Expected Impact |
|---|---------|----------|--------|-----------------|
| 1 | Composite RPC for save+buyin | Critical | Medium (new RPC + migration) | -100-250ms per save |
| 2 | Targeted invalidation in core mutations | Medium | Low (4 line changes) | Eliminates ~8 extra fetches per mutation |
| 3 | Inline `final_duration_seconds` in close RPC | Low-Med | Low (RPC modification) | -50-100ms per close |
| 4 | `refetchType: 'active'` on invalidations | Low | Low | Reduces background refetches |

---

## Measurement Approach

To validate findings with real numbers, instrument the save flow:

```typescript
// In useSaveWithBuyIn mutationFn:
performance.mark('save-start');
await updateAverageBet(slipId, { average_bet: averageBet });
performance.mark('save-avgbet-done');
await createFinancialTransaction({...});
performance.mark('save-buyin-done');
performance.measure('save-avgbet', 'save-start', 'save-avgbet-done');
performance.measure('save-buyin', 'save-avgbet-done', 'save-buyin-done');
performance.measure('save-total', 'save-start', 'save-buyin-done');
```

---

## Related Issues

- [ISSUE-DD2C45CA](../ISSUE-DD2C45CA-DASHBOARD-HTTP-CASCADE.md) — Dashboard HTTP cascade (partially resolved, informed Finding 2)
- [PERF-002](./PIT_DASHBOARD_DATA_FLOW_INVESTIGATION.md) — Pit dashboard data flow inefficiency (resolved)
- [PERF-003](./PERF-003-CASINO-WIDE-ACTIVITY-PANEL.md) — Casino-wide activity panel redundant query

## References

- `hooks/rating-slip-modal/use-save-with-buyin.ts` — Primary save mutation
- `hooks/rating-slip-modal/use-close-with-financial.ts` — Close mutation (well-optimized comparison)
- `hooks/rating-slip/use-rating-slip-mutations.ts` — Core lifecycle mutations
- `services/rating-slip/crud.ts` — Service layer CRUD operations
- `services/rating-slip/http.ts` — HTTP fetchers with idempotency
