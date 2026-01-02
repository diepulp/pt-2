# Consolidated Findings: Rating Slip Performance Investigation

**Date:** 2026-01-01
**Investigation Lead:** Claude Code Multi-Agent Analysis
**Status:** Complete

---

## Executive Summary

A comprehensive multi-agent investigation was conducted to identify root causes of sluggish rating slip operations (open, save, close). Four specialist reports were generated:

| Report | Focus | Key Finding |
|--------|-------|-------------|
| QA-FINDINGS-RATING-SLIP | Workflow testing & KPIs | Sequential API calls, excessive cache invalidations |
| PERF-ANALYSIS-RATING-SLIP | Performance optimization | 50-75% latency reduction achievable |
| REACT19-AUDIT-RATING-SLIP | React 19 best practices | 65/100 compliance score |
| REALTIME-AUDIT-RATING-SLIP | Realtime implementation | NOT the source of sluggishness |

### Root Cause Summary

The sluggish operations are caused by **three primary bottlenecks**:

```
┌─────────────────────────────────────────────────────────────────────┐
│  BOTTLENECK 1: Sequential HTTP Calls in Mutation Hooks             │
│  ─────────────────────────────────────────────────────────────────  │
│  Close Flow: 3 sequential calls → ~300ms+ latency                   │
│  Save Flow: 2 sequential calls → ~200ms+ latency                    │
│  FIX: Parallelize with Promise.all() → 67% faster                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  BOTTLENECK 2: Excessive Cache Invalidations                        │
│  ─────────────────────────────────────────────────────────────────  │
│  Close: 6-7 invalidations (2 broad .scope patterns)                 │
│  Save: 3 invalidations (1 broad .scope pattern)                     │
│  FIX: Replace .scope with targeted keys → 43% fewer HTTP requests   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  BOTTLENECK 3: Render-Path Computations                             │
│  ─────────────────────────────────────────────────────────────────  │
│  JSON.stringify isDirty runs on every render                        │
│  Inline functions defeat React.memo potential                       │
│  FIX: Field comparison + useCallback → eliminates wasted renders    │
└─────────────────────────────────────────────────────────────────────┘
```

### Impact Assessment

| Metric | Current | After Optimization | Improvement |
|--------|---------|-------------------|-------------|
| Close flow latency | ~450ms | ~200ms | **55% faster** |
| Save flow latency | ~200ms | ~100ms | **50% faster** |
| Modal open (legacy) | ~600ms | ~150ms (RPC) | **75% faster** |
| Cache invalidations/mutation | 6-7 | 3-4 | **43% fewer** |
| Render compliance | 65/100 | 90/100 (target) | **+25 points** |

---

## Priority Action Plan

### P0 - Critical (Immediate Action Required)

| # | Action | File | Impact | Effort |
|---|--------|------|--------|--------|
| 1 | Enable RPC feature flag | `.env` | 75% modal open improvement | Low |
| 2 | Parallelize close operations | `use-close-with-financial.ts:74-126` | 67% close latency reduction | Medium |
| 3 | Replace JSON.stringify isDirty | `rating-slip-modal.tsx:208` | Eliminates 0.5ms/render | Low |

### P1 - High Priority

| # | Action | File | Impact | Effort |
|---|--------|------|--------|--------|
| 4 | Replace `ratingSlipModalKeys.scope` | `use-close-with-financial.ts:168` | Targeted invalidation | Low |
| 5 | Replace `loyaltyKeys.ledger.scope` | `use-close-with-financial.ts:199` | Targeted invalidation | Low |
| 6 | Replace `dashboardKeys.slips.scope` | `use-save-with-buyin.ts:144` | Targeted invalidation | Low |
| 7 | Parallelize save operations | `use-save-with-buyin.ts:74-91` | 50% save latency reduction | Low |
| 8 | Extract inline handlers to useCallback | `rating-slip-modal.tsx:340-489` | Stable references | Medium |

### P2 - Medium Priority

| # | Action | File | Impact | Effort |
|---|--------|------|--------|--------|
| 9 | Wrap form sections in React.memo | `form-section-*.tsx` (5 files) | Prevent parent re-renders | Low |
| 10 | Memoize tables array | `rating-slip-modal.tsx:267-272` | Stable prop references | Low |
| 11 | Wrap IncrementButtonGroup in memo | `increment-button-group.tsx` | 15 fewer button re-renders | Low |
| 12 | Add useCallback to modal handlers | `pit-panels-client.tsx:263-368` | Stable references | Medium |

---

## Detailed Findings by Specialist

### 1. QA Specialist Findings

**Scope:** Rating slip open, save, close workflow testing

**Critical Issues:**
- P0: Sequential close operations (3 API calls in series = ~300ms)
- P1: Cache invalidation cascade (6+ invalidations per mutation)
- P1: JSON.stringify isDirty on every render
- P2: RPC feature flag not enabled (600ms vs 150ms)

**Metrics Captured:**
| Operation | Current p95 | Target p95 |
|-----------|-------------|------------|
| Modal Open (RPC) | ~200ms | <300ms |
| Modal Open (Legacy) | ~700ms | Deprecated |
| Save | ~250ms | <150ms |
| Close | ~400ms | <200ms |

### 2. Performance Engineer Findings

**Scope:** Latency analysis and optimization recommendations

**Key Optimizations:**
```typescript
// BEFORE: Sequential (300ms total)
await createFinancialTransaction({...});  // 100ms
await closeRatingSlip(slipId, ...);       // 100ms
await accrueOnClose({...});               // 100ms

// AFTER: Parallel + fire-and-forget (100ms total)
const [_, closeResult] = await Promise.all([
  createFinancialTransaction({...}).catch(() => null),
  closeRatingSlip(slipId, ...),
]);
accrueOnClose({...}).catch(() => {}); // Fire-and-forget
```

**SLO Targets (OBSERVABILITY_SPEC §3):**
| Operation | p50 | p95 | p99 |
|-----------|-----|-----|-----|
| Modal Open (RPC) | 120ms | 200ms | 350ms |
| Save | 80ms | 150ms | 250ms |
| Close | 100ms | 200ms | 400ms |

### 3. React 19 Audit Findings

**Scope:** Best practices compliance audit

**Compliance Score:** 65/100

**Critical Issues:**
1. `JSON.stringify` isDirty detection (line 208) - blocks main thread
2. Inline arrow functions defeat React.memo (lines 340-489)
3. Missing React.memo on 5 form section components
4. Sequential mutations in hooks (not parallelized)

**Positive Patterns Found:**
- Correct `useTransition` usage for non-blocking updates
- Excellent Zustand field-specific selectors
- Proper `useShallow` usage in all Zustand hooks
- Key-based reset pattern in modal content
- TanStack Query optimistic updates well-implemented

**Fix Order:**
1. Phase 1 (Quick Wins): JSON.stringify, memoize tables, React.memo
2. Phase 2 (Handlers): useCallback, IncrementButtonGroup memo
3. Phase 3 (Mutations): Parallelize API calls

### 4. Realtime Audit Findings

**Scope:** Supabase realtime subscription investigation

**Verdict:** Realtime implementation is **NOT** the source of sluggishness

**Passing Areas:**
| Area | Status |
|------|--------|
| Subscription Scoping | PASS - casino_id filter applied |
| Connection Management | PASS - proper useRef and cleanup |
| Event Handling | PASS - correct payload extraction |
| Re-render Prevention | PASS - does NOT invalidate tables.scope |

**Issues Found (in mutation hooks, not realtime):**
- `use-save-with-buyin.ts:144` uses broad `slips.scope`
- `use-close-with-financial.ts:168` uses broad `ratingSlipModalKeys.scope`
- `use-close-with-financial.ts:199` uses broad `loyaltyKeys.ledger.scope`

---

## Code Change Summary

### Files Requiring Changes

| File | Changes | Priority |
|------|---------|----------|
| `hooks/rating-slip-modal/use-close-with-financial.ts` | Parallelize, targeted invalidation | P0/P1 |
| `components/modals/rating-slip/rating-slip-modal.tsx` | isDirty fix, useCallback handlers | P0/P1 |
| `hooks/rating-slip-modal/use-save-with-buyin.ts` | Parallelize, targeted invalidation | P1 |
| `components/modals/rating-slip/form-section-*.tsx` (5 files) | Add React.memo | P2 |
| `components/modals/rating-slip/increment-button-group.tsx` | Add React.memo | P2 |
| `components/pit-panels/pit-panels-client.tsx` | Add useCallback to handlers | P2 |
| `.env` or deployment config | Enable RPC flag | P0 |

### Feature Flag Required

```bash
# Enable in production to reduce modal open latency by 75%
NEXT_PUBLIC_USE_MODAL_BFF_RPC=true
```

---

## Validation Plan

### Pre-Implementation Baseline

```bash
# Capture current performance metrics
npm run test -- services/rating-slip/__tests__/http-contract.test.ts
npx playwright test e2e/workflows/rating-slip-lifecycle.spec.ts
```

### Post-Implementation Verification

| Test | Command | Success Criteria |
|------|---------|------------------|
| Route handler tests | `npm test -- app/api/v1/rating-slips` | All 38 tests pass |
| HTTP contract tests | `npm test -- services/rating-slip/__tests__/http-contract` | 8 contracts valid |
| E2E workflow | `npx playwright test rating-slip-lifecycle.spec.ts` | <200ms close p95 |
| Manual timing | Check `X-Query-Timings` header | Modal open <150ms |

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Parallelize close operations | Financial transaction could fail silently | Log errors, maintain audit trail |
| Replace .scope invalidations | Stale data on other tables | Verify targeted keys cover all cases |
| Enable RPC flag | New code path in production | Already tested, feature-flagged |
| Add React.memo | Breaking prop equality checks | Test form field updates |

---

## Appendix: Related Files

| Category | Files |
|----------|-------|
| Mutation Hooks | `use-close-with-financial.ts`, `use-save-with-buyin.ts`, `use-move-player.ts` |
| Modal Component | `rating-slip-modal.tsx`, `form-section-*.tsx` |
| BFF Endpoint | `app/api/v1/rating-slips/[id]/modal-data/route.ts` |
| RPC Service | `services/rating-slip-modal/rpc.ts` |
| Realtime Hook | `hooks/dashboard/use-dashboard-realtime.tsx` |
| Query Keys | `hooks/dashboard/keys.ts`, `services/loyalty/keys.ts` |

---

## Specialist Reports

All detailed reports are located in `/docs/issues/rating-slip/`:

1. `QA-FINDINGS-RATING-SLIP.md` - QA workflow testing and KPI analysis
2. `PERF-ANALYSIS-RATING-SLIP.md` - Performance optimization recommendations
3. `REACT19-AUDIT-RATING-SLIP.md` - React 19 compliance audit
4. `REALTIME-AUDIT-RATING-SLIP.md` - Realtime implementation investigation
5. `CONSOLIDATED-FINDINGS.md` - This summary document
