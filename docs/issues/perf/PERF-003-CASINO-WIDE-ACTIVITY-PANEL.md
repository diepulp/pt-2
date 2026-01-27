# PERF-003: Casino-Wide Activity Panel Redundant Query

**Status:** Open
**Severity:** Medium
**Category:** Performance / Test Coverage
**Created:** 2026-01-26
**Related Components:** PanelContainer, ActivityPanel
**Related Hook:** useCasinoActivePlayers
**Tags:** redundant-query, cache-fragmentation, test-coverage-gap

---

## Executive Summary

The pit dashboard's `PanelContainer` makes a **redundant API call** to `/api/v1/rating-slips/active-players` just to display a notification badge count. The same data is fetched again by `ActivityPanel` when rendered, resulting in **2 API calls** where **0-1 would suffice**.

Additionally, this feature has **zero test coverage** across all layers (component, hook, API route, E2E).

---

## Current Data Flow (Inefficient)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                       PIT PANELS PAGE DATA FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  PitPanelsClient:                                                                    │
│  ├─ useDashboardTables(casinoId)        → Tables list                               │
│  ├─ useDashboardStats(casinoId)         → {activeTablesCount, openSlipsCount, etc}  │
│  ├─ useActiveSlipsForDashboard(tableId) → Slips WITH player names (PERF-002)        │
│  └─ useGamingDay(casinoId)              → Gaming day                                │
│                                                                                      │
│  PanelContainer (child):                                                             │
│  └─ useCasinoActivePlayers()            → REDUNDANT: Only uses .count for badge     │ ◄── ISSUE
│      Query key: ['dashboard', 'casino-active-players', {}]                           │
│                                                                                      │
│  ActivityPanel (rendered when activePanel === 'activity'):                           │
│  └─ useCasinoActivePlayers({search, limit: 200}) → Full player list + search        │
│      Query key: ['dashboard', 'casino-active-players', {limit: 200}]                 │
│                                                                                      │
│  Different query keys = NO cache sharing = 2 separate API calls                      │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Impact Analysis

### Performance Impact

| Metric | Current | Optimal |
|--------|---------|---------|
| API calls on page load | 2 | 0 |
| API calls when Activity panel opened | 0 (already fetched) | 1 |
| Redundant data transferred | ~3KB | 0 |
| Time wasted | ~874ms | 0 |
| Cache entries | 2 (fragmented) | 1 (unified) |

### Test Coverage Impact

| Layer | Current Coverage | Risk |
|-------|------------------|------|
| ActivityPanel component | 0% | High - UI regressions undetected |
| PanelContainer component | 0% | High - Orchestration bugs undetected |
| useCasinoActivePlayers hook | 0% | Medium - Data flow bugs undetected |
| API route /active-players | 0% | Medium - Contract violations undetected |
| E2E Activity Panel | 0% | High - User workflow regressions |

---

## Root Cause Analysis

### 1. Badge Count Fetched Separately

**Location:** `components/pit-panels/panel-container.tsx:126`

```typescript
// PanelContainer fetches full active players list JUST for count
const { data: casinoActivePlayers } = useCasinoActivePlayers();

// Only the count is used (line 160)
const notifications = React.useMemo(
  () => ({
    tables: activeSlips.length,
    activity: casinoActivePlayers?.count ?? 0,  // ◄── Only uses count!
    inventory: 0,
    analytics: 0,
  }),
  [activeSlips.length, casinoActivePlayers?.count],
);
```

### 2. Query Key Fragmentation

**Location:** `hooks/dashboard/keys.ts:83-84`

```typescript
casinoActivePlayers: (options?: { search?: string; limit?: number }) =>
  [...ROOT, 'casino-active-players', options ?? {}] as const,
```

Different parameter objects produce different query keys:
- PanelContainer: `['dashboard', 'casino-active-players', {}]`
- ActivityPanel: `['dashboard', 'casino-active-players', {limit: 200}]`

TanStack Query treats these as separate queries, causing duplicate fetches.

### 3. Count Already Available in Stats

The `useDashboardStats` hook already returns `openSlipsCount` which represents the number of active rating slips (≈ active players). This data is already fetched by the parent component.

---

## Recommended Fix

### Option A: Use Stats Data for Badge (Preferred)

**Effort:** Low | **Impact:** High

Remove the `useCasinoActivePlayers()` call from `PanelContainer` and use the already-fetched stats data.

**Before:**
```typescript
// panel-container.tsx:126
const { data: casinoActivePlayers } = useCasinoActivePlayers();

const notifications = {
  activity: casinoActivePlayers?.count ?? 0,
};
```

**After:**
```typescript
// panel-container.tsx - use stats prop from parent
const notifications = {
  activity: stats?.openSlipsCount ?? 0,
};
```

**Result:**
- 0 API calls on initial page load (for active players)
- 1 API call only when Activity panel is actually opened

### Option B: Shared Query with Select

**Effort:** Medium | **Impact:** High

Create a normalized query that both components subscribe to:

```typescript
// PanelContainer - subscribe to count only
const { data: count } = useCasinoActivePlayers({
  select: (data) => data.count,
});

// ActivityPanel - full data
const { data } = useCasinoActivePlayers({ limit: 200 });
```

This requires query key normalization to enable cache sharing.

---

## Files Affected

### Performance Fix

| File | Change |
|------|--------|
| `components/pit-panels/panel-container.tsx:126` | Remove `useCasinoActivePlayers()` call |
| `components/pit-panels/panel-container.tsx:160` | Use `stats.openSlipsCount` for badge |

### Test Coverage (New Files)

| File | Purpose |
|------|---------|
| `components/pit-panels/__tests__/activity-panel.test.tsx` | Component unit tests |
| `hooks/dashboard/__tests__/use-casino-active-players.test.ts` | Hook unit tests |
| `app/api/v1/rating-slips/active-players/__tests__/route.test.ts` | API contract tests |
| `e2e/workflows/activity-panel.spec.ts` | E2E workflow tests |
| `services/rating-slip/__tests__/mappers.test.ts` | Add `toActivePlayerForDashboardDTO` tests |

---

## RPC Analysis (No Issues Found)

The `rpc_list_active_players_casino_wide` RPC is well-optimized:

- **Index:** `ix_rating_slip_active_status` on `(casino_id, status, start_time DESC)` with partial index
- **Single Query:** Efficient JOINs (rating_slip → visit → player → player_loyalty)
- **ADR-024 Compliant:** Uses `set_rls_context_from_staff()`, no spoofable parameters
- **No N+1 Pattern:** All related data fetched in single query

---

## Definition of Done

### Performance Fix
- [ ] Remove `useCasinoActivePlayers()` from `panel-container.tsx`
- [ ] Update notification badge to use `stats.openSlipsCount`
- [ ] Verify Activity panel still loads data when opened
- [ ] Network tab shows 0 `/active-players` calls on initial page load
- [ ] Network tab shows 1 `/active-players` call when Activity panel opened

### Test Coverage
- [ ] Unit tests for ActivityPanel (loading, error, empty, search, sort)
- [ ] Unit tests for useCasinoActivePlayers hook
- [ ] Mapper tests for `toActivePlayerForDashboardDTO`
- [ ] E2E test for Activity panel workflow
- [ ] All tests passing in CI

---

## Related Issues

- **PERF-002:** Pit Dashboard Data Flow Optimization (completed)
- **ISSUE-PLAYER-NAME-DTO-INEFFICIENCY:** RatingSlipDTO missing player join (same investigation chain)

---

## Quality Assessment Summary

| Aspect | Grade | Notes |
|--------|-------|-------|
| Component Architecture | B+ | Good separation of concerns |
| Error Handling | B | Present but could be more specific |
| Loading States | A | Properly implemented |
| API Contract | A | Zod validated, ADR-024 compliant |
| Test Coverage | F | Critical gap |
| Query Efficiency | C | Duplicate queries |
| **Overall** | **C+** | Solid impl, needs tests + perf fix |
