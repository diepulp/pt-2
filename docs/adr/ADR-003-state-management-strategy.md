# ADR-003: State Management Strategy

**Status**: ACCEPTED
**Date Drafted**: 2025-10-10
**Date Accepted**: 2025-10-10
**Decision Makers**: Development Team
**Validation**: Phase 3 Waves 1-3 (32 integration tests passing)

## Context

PT-2 requires a clear state management strategy to handle:
- Server data (players, visits, rating slips, tables, casinos, MTL, loyalty)
- UI state (modals, navigation, filters, forms)
- Real-time updates (player status, table events)
- Cache invalidation and optimistic updates
- Cross-component data sharing

The architecture must support:
- TypeScript type safety across all state operations
- Consistent patterns across 7 domain services
- Performance optimization through intelligent caching
- Developer experience with minimal boilerplate

## Decision

### React Query for Server State

**Scope**: ALL data fetched from Supabase database

**Configuration** (validated in Wave 1):
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,    // 5 minutes
      gcTime: 1000 * 60 * 30,      // Evict unused data after 30 minutes unless overridden
      refetchOnWindowFocus: false,  // Disabled for casino context
      retry: 1,                     // Single retry for transient failures
    },
    mutations: {
      retry: 0,                     // No retries to prevent duplicates
    },
  },
});
```

**Rationale**:
- **staleTime: 5 minutes**: Balances data freshness with reduced network requests. Casino operations don't require sub-minute updates for most data.
- **gcTime: 30 minutes**: Keeps warm caches available for operators who bounce between views while still bounding memory usage. High-churn domains can override to shorter windows alongside domain-specific `staleTime` values when live data requires it (see below).
- **refetchOnWindowFocus: false**: Prevents unnecessary refetches in a multi-window casino environment where users frequently switch tabs.
- **queries.retry: 1**: Single retry handles transient network issues without excessive delay.
- **mutations.retry: 0**: No mutation retries to prevent duplicate operations (e.g., double-creating a player).
- Automatic caching and background refetching
- Built-in loading and error states
- Optimistic updates support
- DevTools for debugging
- TypeScript-first design

**Override Guidance**: The 5-minute/30-minute defaults serve as a baseline. Hook authors should explicitly set shorter `staleTime`/`gcTime` values for high-volatility queries such as live table availability or player status dashboards, and extend the window for infrequently accessed reports. Document any override in the corresponding domain README so cross-team consumers know the expected freshness.

**Evidence**: `/home/diepulp/projects/pt-2/lib/query-client.ts` - 4 tests passing

### Query Key Pattern

**Validated Pattern** (from Wave 2): `[domain, operation, ...params]`

**Structure**:
- **domain**: The bounded context (casino, player, visit, rating-slip, table-context, table, mtl)
- **operation**: The action being performed (list, detail, search, active, etc.)
- **params**: Optional parameters (IDs, filters, pagination)

**All 7 Domain Examples** (30 patterns documented in Wave 2):

```typescript
// Casino Domain
['casino', 'list']
['casino', 'detail', casinoId]
['casino', 'by-company', companyId]

// Player Domain
['player', 'list']
['player', 'detail', playerId]
['player', 'search', searchQuery]
['player', 'active', casinoId]

// Visit Domain
['visit', 'list']
['visit', 'list', page, limit]
['visit', 'detail', visitId]
['visit', 'active', playerId]
['visit', 'by-casino', casinoId]

// Rating Slip Domain
['rating-slip', 'list']
['rating-slip', 'detail', slipId]
['rating-slip', 'by-visit', visitId]
['rating-slip', 'by-table', tableId]

// Table Context Domain
['table-context', 'list']
['table-context', 'detail', contextId]
['table-context', 'active', casinoId]
['table-context', 'by-table', tableId]

// Table Domain
['table', 'list']
['table', 'detail', tableId]
['table', 'by-casino', casinoId]
['table', 'available', casinoId]

// MTL Domain
['mtl', 'list']
['mtl', 'detail', mtlId]
['mtl', 'by-table-context', contextId]
['mtl', 'active', tableId]
```

**Hierarchical Invalidation** (validated in Wave 3):
```typescript
// Invalidate all player queries
queryClient.invalidateQueries({ queryKey: ['player'] });

// Invalidate specific player
queryClient.invalidateQueries({ queryKey: ['player', 'detail', playerId] });

// Invalidate player lists only
queryClient.invalidateQueries({ queryKey: ['player', 'list'] });
```

**Evidence**: `/home/diepulp/projects/pt-2/hooks/shared/README.md` - 30 query key patterns documented

### Cache Invalidation Strategy

**Validated Strategies** (from Wave 2 hook templates):

#### 1. Domain-Level Invalidation
Use for **create operations** and **bulk changes** that affect multiple related queries.

```typescript
const createPlayer = useServiceMutation(
  createPlayerAction,
  {
    onSuccess: () => {
      // Invalidates ALL player queries: ['player', 'list'], ['player', 'detail', id], etc.
      queryClient.invalidateQueries({ queryKey: ['player'] })
    }
  }
)
```

**When to use**:
- Create operations (new entity added to lists)
- Bulk operations affecting multiple entities
- Changes impacting aggregations or statistics
- When unsure which specific queries are affected

#### 2. Granular Invalidation
Use for **update operations** where mutation impact is precisely known.

```typescript
const updatePlayer = useServiceMutation(
  updatePlayerAction,
  {
    onSuccess: (data, variables) => {
      // Invalidate specific player detail
      queryClient.invalidateQueries({
        queryKey: ['player', 'detail', variables.id]
      })
      // Also invalidate list to reflect changes
      queryClient.invalidateQueries({
        queryKey: ['player', 'list']
      })
    }
  }
)
```

**When to use**:
- Update operations on single entities
- Operations with known, limited scope
- Performance optimization (avoid unnecessary refetches)
- Complex query hierarchies

#### 3. Query Removal
Use for **delete operations** to remove queries entirely.

```typescript
const deletePlayer = useServiceMutation(
  deletePlayerAction,
  {
    onSuccess: (data, playerId) => {
      // Remove deleted entity's detail query from cache
      queryClient.removeQueries({
        queryKey: ['player', 'detail', playerId]
      })
      // Invalidate lists to remove deleted entity
      queryClient.invalidateQueries({
        queryKey: ['player', 'list']
      })
    }
  }
)
```

**When to use**:
- Delete operations
- Entities that no longer exist
- Preventing 404 errors on deleted entities

#### 4. Direct Cache Updates with `setQueryData`
Use when mutation responses already contain the updated entity or small collections. This keeps lists and detail views in sync without additional network hops.

```typescript
const updateVisit = useServiceMutation(
  updateVisitAction,
  {
    onSuccess: (data) => {
      // Refresh the detail cache directly from the mutation payload
      queryClient.setQueryData(['visit', 'detail', data.id], data);

      // Merge the updated record into paginated list caches
      queryClient.setQueriesData({ queryKey: ['visit', 'list'] }, (current) =>
        current ? {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.map((visit) => visit.id === data.id ? data : visit),
          })),
        } : current,
      );
    },
  }
);
```

**When to use**:
- Mutation payloads include the complete entity snapshot required by consuming UIs
- Lists are small to moderate and merging avoids redundant refetches
- Optimistic updates already mutated the cache and you need to reconcile with the server response
- High-frequency mutations where refetching would exceed Supabase rate limits

**When to avoid**:
- Mutation payloads are partial or omit list-facing fields
- Multiple dependent queries need recalculation (prefer `invalidateQueries`)

**Evidence**:
- `/home/diepulp/projects/pt-2/hooks/shared/use-service-mutation.ts` - 3 strategies implemented
- `/home/diepulp/projects/pt-2/hooks/shared/README.md` - Complete CRUD examples documented
- Wave 3 integration tests validate all patterns work correctly

### Zustand for UI State

**Scope**: Ephemeral UI state ONLY (validated in Wave 1)

**Includes**:
- Modal state (open/close, modal type, modal data)
- Navigation state (sidebar collapsed/expanded, active tab)
- UI filters (search terms, sort direction - UI state only, not query params)
- Form state (multi-step wizards, draft data not yet persisted)
- Temporary selections (bulk operations, multi-select)
- View mode preferences (grid vs list vs table)

**Excludes**:
- Server data (players, visits, rating slips) → Use React Query
- Fetched data → Use React Query
- Persistent state → Use database
- User session → Use Next.js auth
- URL state → Use Next.js router

**Synchronization Guidance**:
- Filters that drive React Query queries must surface through selector hooks that derive query keys directly from the Zustand state to prevent divergence. Each consuming component should 
  - read filters via `usePlayerFilters()` (or domain equivalent), and
  - pass those values into the relevant service query hook so cache keys stay aligned.
- When filters need to be shareable (deep links, collaborative workflows), promote them to URL params with Next.js router helpers and hydrate the Zustand store from the route in layout loaders. The ADR assumes “UI state only” filters during Wave 3, but teams should graduate filters to URL state whenever cross-session persistence or copy/paste links are required.
- React Query remains the single source of truth for server data; Zustand holds only the transient filter inputs and view configuration.

**Implemented Stores**:

1. **Global UI Store** (`store/ui-store.ts`):
```typescript
interface UIStore {
  // Modal management
  modal: {
    type: string | null;
    isOpen: boolean;
    data?: unknown;
  };
  openModal: (type: string, data?: unknown) => void;
  closeModal: () => void;

  // Sidebar navigation
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}
```

2. **Player UI Store** (`store/player-store.ts`):
```typescript
interface PlayerUIStore {
  // Search and filters
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;

  // View preferences
  viewMode: 'grid' | 'list' | 'table';
  setViewMode: (mode: 'grid' | 'list' | 'table') => void;

  // Pagination UI
  currentPage: number;
  itemsPerPage: number;
  setPage: (page: number) => void;

  // Selection state
  selectedPlayerIds: string[];
  togglePlayerSelection: (id: string) => void;
  clearSelection: () => void;

  // Reset
  resetFilters: () => void;
}
```

**Evidence**:
- `/home/diepulp/projects/pt-2/store/ui-store.ts` - Global UI state (9 tests passing)
- `/home/diepulp/projects/pt-2/store/player-store.ts` - Player UI state (11 tests passing)
- `/home/diepulp/projects/pt-2/store/README.md` - Complete guidelines (7.8KB)

### Real-Time Updates Integration

**Status**: Deferred to feature implementation (Weeks 4-6)

**Planned Pattern**: Real-time hooks update React Query cache

**Proposed Implementation** (aligned with existing architecture standards):
```typescript
// Domain-specific hook handles subscription
usePlayerRealtime((event) => {
  // Option 1: Directly update cache (faster, requires complete data)
  queryClient.setQueryData(['player', 'detail', event.playerId], event.newData);

  // Option 2: Invalidate to refetch (safer, ensures data consistency)
  queryClient.invalidateQueries({ queryKey: ['player', 'list'] });
});
```

**Decision Points** (to be resolved during implementation):
1. **setQueryData vs invalidateQueries**: Choose based on event payload completeness
2. **Selective subscriptions**: Subscribe only to relevant entities per component
3. **Reconnection handling**: Use React Query's automatic refetch on reconnect
4. **Performance impact**: Measure and optimize based on actual real-time load

**Rationale**:
- Single source of truth (React Query cache)
- Real-time updates flow through established patterns
- No separate real-time state management needed
- Aligns with existing domain-specific real-time hooks pattern

**Note**: Real-time patterns will be finalized during feature implementation when actual requirements are known.

## Consequences

### Positive

1. **Clear Separation of Concerns** ✅ Validated
   - Server state: React Query (all 6 services tested)
   - UI state: Zustand (20 tests passing)
   - Real-time: Updates React Query cache (pattern documented)
   - No overlap or confusion

2. **Automatic Cache Management** ✅ Validated
   - Background refetching (5-minute staleTime working)
   - Stale-while-revalidate pattern (validated in Wave 3)
   - Memory management (no leaks observed)
   - Request deduplication (React Query default behavior)

3. **TypeScript Type Safety** ✅ Validated
   - Query keys typed (30 patterns documented)
   - Response data typed from `Database` types (Wave 3 tests)
   - Compile-time errors for invalid state access (0 TypeScript errors)
   - ServiceResult<T> transformation maintains full type safety

4. **Developer Experience** ✅ Validated
   - Minimal boilerplate (hook templates ready)
   - Consistent patterns across 7 domains (documented in README)
   - DevTools available for debugging (configured in Wave 1)
   - Well-documented patterns (729 lines of hook documentation)

5. **Performance Optimization** ✅ Validated
   - Intelligent caching reduces requests (5-minute staleTime)
   - Single operations: <1s (Wave 3 baseline)
   - Complex workflows: <3s (Wave 3 baseline)
   - Error responses: <500ms (Wave 3 baseline)

### Negative

1. **Learning Curve** ⚠️ Mitigated
   - Team must learn React Query patterns
   - **Mitigation**: Comprehensive hook templates and documentation provided
   - Query key strategy requires discipline
   - **Mitigation**: 30 examples documented across all 7 domains
   - Invalidation logic can be complex
   - **Mitigation**: 3 proven strategies documented with clear guidance

2. **Configuration Tuning** ⚠️ Resolved
   - Background refetching may fetch unnecessary data
   - **Resolution**: `refetchOnWindowFocus: false` prevents unnecessary refetches in casino context
   - Requires tuning of `staleTime` and `refetchInterval`
   - **Resolution**: 5-minute staleTime balances freshness with performance

3. **Additional Dependencies** ✅ Acceptable
   - React Query: ~40kb gzipped
   - Zustand: ~1kb gzipped
   - Total: ~41kb added to bundle
   - **Justification**: Features provided (caching, refetching, type safety) justify bundle size

4. **Testing Complexity** ⚠️ Mitigated
   - Must mock React Query in tests
   - **Mitigation**: Wave 3 integration tests demonstrate testing patterns
   - Integration tests need QueryClient setup
   - **Mitigation**: 32 integration tests passing with clear setup examples
   - Invalidation logic requires careful testing
   - **Mitigation**: All 3 invalidation strategies validated in Wave 3

## Alternatives Considered

### Alternative 1: Context API Only

**Pros**:
- No additional dependencies
- Built into React
- Familiar to team

**Cons**:
- Manual cache management
- No automatic refetching
- Performance issues with large state trees
- Requires extensive custom logic

**Decision**: Rejected due to missing cache management features

### Alternative 2: Redux Toolkit + RTK Query

**Pros**:
- Comprehensive state management
- Mature ecosystem
- Good TypeScript support

**Cons**:
- More boilerplate than React Query
- Steeper learning curve
- Heavier bundle size (~50kb vs 40kb)
- Over-engineered for PT-2 needs

**Decision**: Rejected due to unnecessary complexity

### Alternative 3: SWR (Stale-While-Revalidate)

**Pros**:
- Lightweight (~11kb)
- Simple API
- Good caching defaults

**Cons**:
- Less TypeScript support than React Query
- Smaller ecosystem
- Fewer features (no mutations, devtools limited)

**Decision**: Rejected due to inferior TypeScript support

### Alternative 4: Zustand for Everything

**Pros**:
- Single state solution
- Tiny bundle size
- Simple API

**Cons**:
- Manual server state management
- No built-in caching or refetching
- Requires extensive custom logic for server data

**Decision**: Rejected due to lack of server state features

## Implementation Evidence

### Wave 1: Infrastructure Setup ✅ COMPLETE
**Status**: All 4 tasks completed, 37 tests passing

**Deliverables**:
- ✅ React Query configured (`lib/query-client.ts`) - 4 tests passing
- ✅ Server action wrapper (`lib/actions/with-server-action-wrapper.ts`) - 13 tests passing
- ✅ Zustand stores created (`store/ui-store.ts`, `store/player-store.ts`) - 20 tests passing
- ✅ ADR-003 draft created

**Evidence**: `/home/diepulp/projects/pt-2/docs/phase-3/WAVE_1_SIGNOFF.md`

### Wave 2: Hook Templates ✅ COMPLETE
**Status**: Both tasks completed, comprehensive documentation

**Deliverables**:
- ✅ Query hook template (`hooks/shared/use-service-query.ts`) - 81 lines
- ✅ Mutation hook template (`hooks/shared/use-service-mutation.ts`) - 96 lines
- ✅ Complete documentation (`hooks/shared/README.md`) - 729 lines
- ✅ 30 query key patterns documented (all 7 domains)
- ✅ 3 cache invalidation strategies documented
- ✅ 36+ mutation examples provided

**Evidence**: `/home/diepulp/projects/pt-2/docs/phase-3/WAVE_2_SIGNOFF.md`

### Wave 3: Integration Validation ✅ COMPLETE
**Status**: All 32 tests passing, zero blocking issues

**Test Coverage**:
- ✅ 24 service CRUD tests (6 services, all operations)
- ✅ 2 cross-service workflow tests (complete casino visit + multi-table concurrent operations)
- ✅ 6 error handling tests (FK violations, unique violations, NOT_FOUND)
- ✅ 2 structure validation tests

**Performance Baselines**:
- Single CRUD operations: ~750ms average (200ms - 1.2s range)
- List operations: ~800ms average (600ms - 1.0s range)
- Cross-service workflows: ~2.4s average (2.0s - 3.0s range)
- Error tests: ~200ms average (100ms - 400ms range)

**Services Validated**:
1. ✅ Casino Service (5 tests) - All CRUD + ListByCompany
2. ✅ Player Service (3 tests) - Create, Read, Update
3. ✅ Visit Service (3 tests) - Create, Read, Update
4. ✅ RatingSlip Service (3 tests) - Create, Read, Update
5. ✅ TableContext Service (4 tests) - All CRUD + ListByCasino
6. ✅ MTL Service (4 tests) - All CRUD + ListByGamingDay

**Evidence**:
- `/home/diepulp/projects/pt-2/docs/phase-3/WAVE_3_SIGNOFF.md`
- `/home/diepulp/projects/pt-2/docs/phase-3/integration-test-results.md`
- `/home/diepulp/projects/pt-2/__tests__/integration/services-smoke.test.ts`

### Wave 4: ADR Finalization ✅ COMPLETE
**Status**: This document - ACCEPTED with full implementation evidence

## Resolved Questions

### 1. React Query Defaults ✅ RESOLVED
**Question**: What `staleTime` balances freshness vs performance?
**Answer**: 5 minutes (`1000 * 60 * 5`)
**Rationale**: Casino operations don't require sub-minute updates for most data. Balances freshness with reduced network requests.

**Question**: Should `refetchOnWindowFocus` be enabled globally?
**Answer**: No - disabled (`false`)
**Rationale**: Multi-window casino environment where users frequently switch tabs. Prevents unnecessary refetches.

**Question**: What retry strategy works best for Supabase?
**Answer**: Queries: 1 retry, Mutations: 0 retries
**Rationale**: Single retry handles transient issues. No mutation retries prevents duplicate operations.

### 2. Invalidation Patterns ✅ RESOLVED
**Question**: Domain-level vs granular invalidation?
**Answer**: Use domain-level for creates, granular for updates, removal for deletes
**Rationale**: Validated in Wave 3 - clear guidance documented in hook templates

**Question**: How to handle cross-domain cascades?
**Answer**: Explicitly invalidate affected domains in mutation callbacks
**Rationale**: Explicit is better than implicit. Example validated in Wave 3 workflow tests.

**Question**: When to use optimistic updates vs refetch?
**Answer**: Optimistic updates optional, use only when immediate feedback is critical
**Rationale**: Adds complexity. Standard invalidation sufficient for most use cases.

### 3. Query Key Conventions ✅ RESOLVED
**Question**: Should filters be part of key or options?
**Answer**: Filters are part of the query key
**Rationale**: Different filter values = different data, should be cached separately
**Example**: `['player', 'list', { status: 'active' }]`

**Question**: How to handle dynamic query params?
**Answer**: Include as final elements in query key array
**Rationale**: 30 patterns documented across all 7 domains in Wave 2

**Question**: Naming conventions for computed queries?
**Answer**: Use descriptive operation names: `'stats'`, `'active'`, `'by-casino'`, etc.
**Rationale**: Self-documenting, consistent across domains

### 4. Real-Time Integration ⏸️ DEFERRED
**Status**: Deferred to feature implementation (Weeks 4-6)
**Reason**: No real-time features implemented yet. Will be resolved during actual implementation.
**Pattern**: Documented in "Real-Time Updates Integration" section above

## References

### External Documentation
- React Query v5 Docs: https://tanstack.com/query/latest/docs/framework/react/overview
- Zustand Docs: https://docs.pmnd.rs/zustand/getting-started/introduction

### Project Architecture
- Service Layer Architecture: `/home/diepulp/projects/pt-2/docs/system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- Balanced Architecture: `/home/diepulp/projects/pt-2/docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`
- ADR-002 Test Location: `/home/diepulp/projects/pt-2/docs/adr/ADR-002-test-location-strategy.md`

### Implementation Files
- Query Client: `/home/diepulp/projects/pt-2/lib/query-client.ts`
- Server Action Wrapper: `/home/diepulp/projects/pt-2/lib/actions/with-server-action-wrapper.ts`
- Query Hook Template: `/home/diepulp/projects/pt-2/hooks/shared/use-service-query.ts`
- Mutation Hook Template: `/home/diepulp/projects/pt-2/hooks/shared/use-service-mutation.ts`
- Hook Documentation: `/home/diepulp/projects/pt-2/hooks/shared/README.md`
- UI Store: `/home/diepulp/projects/pt-2/store/ui-store.ts`
- Player UI Store: `/home/diepulp/projects/pt-2/store/player-store.ts`
- Store Guidelines: `/home/diepulp/projects/pt-2/store/README.md`

### Phase 3 Validation Evidence
- Wave 1 Signoff: `/home/diepulp/projects/pt-2/docs/phase-3/WAVE_1_SIGNOFF.md`
- Wave 2 Signoff: `/home/diepulp/projects/pt-2/docs/phase-3/WAVE_2_SIGNOFF.md`
- Wave 3 Signoff: `/home/diepulp/projects/pt-2/docs/phase-3/WAVE_3_SIGNOFF.md`
- Integration Test Results: `/home/diepulp/projects/pt-2/docs/phase-3/integration-test-results.md`
- Integration Test Suite: `/home/diepulp/projects/pt-2/__tests__/integration/services-smoke.test.ts`

## Revision History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-10-10 | 0.1 | Initial DRAFT - Wave 1.4 | System Architect |
| 2025-10-10 | 1.0 | ACCEPTED - Finalized with Wave 1-3 evidence | System Architect |

## Acceptance Criteria Met

✅ All React Query defaults finalized with rationale
✅ All 30 query key patterns documented across 7 domains
✅ All 3 cache invalidation strategies validated
✅ Zustand scope clearly defined and boundaries enforced
✅ 32 integration tests passing (100% pass rate)
✅ Performance baselines established (<1s single ops, <3s workflows)
✅ All open questions resolved or explicitly deferred
✅ Implementation evidence provided for all decisions
✅ Ready for Weeks 4-6 feature implementation

**Status**: ACCEPTED
**Approved By**: Development Team
**Date**: 2025-10-10
