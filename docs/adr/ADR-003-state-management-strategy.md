# ADR-003: State Management Strategy

**Status**: DRAFT
**Date**: 2025-10-10
**Decision Makers**: Development Team
**Finalization**: After Wave 3 integration testing

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

**Defaults** (TBD after Wave 1 testing):
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: TBD,              // How long data is fresh
      refetchOnWindowFocus: TBD,   // Refetch on window focus
      retry: TBD,                  // Retry failed requests
      refetchOnMount: TBD,         // Refetch on component mount
    },
  },
});
```

**Rationale**:
- Automatic caching and background refetching
- Built-in loading and error states
- Optimistic updates support
- DevTools for debugging
- TypeScript-first design

### Query Key Pattern

**Draft Pattern**: `[domain, operation, ...params]`

**Structure**:
```typescript
// List operations
['player', 'list'] → All players
['visit', 'list', { status: 'active' }] → Filtered visits
['table', 'list', casinoId] → Tables by casino

// Detail operations
['player', 'detail', playerId] → Single player
['casino', 'detail', casinoId] → Single casino

// Search/query operations
['player', 'search', searchQuery] → Player search results
['table', 'available', casinoId] → Available tables at casino

// Computed/derived operations
['player', 'stats', playerId] → Player statistics
['loyalty', 'tier', playerId] → Player loyalty tier
```

**Hierarchical Invalidation**:
```typescript
// Invalidate all player queries
queryClient.invalidateQueries({ queryKey: ['player'] });

// Invalidate specific player
queryClient.invalidateQueries({ queryKey: ['player', 'detail', playerId] });

// Invalidate player lists only
queryClient.invalidateQueries({ queryKey: ['player', 'list'] });
```

### Cache Invalidation Strategy

**Strategy**: (TBD after Wave 2 hook templates)

**Proposed Patterns**:
1. **Domain-Level Invalidation**: After mutations, invalidate all queries in affected domain
2. **Granular Invalidation**: Target specific queries for performance
3. **Cross-Domain Invalidation**: Handle cascading effects (e.g., visit affects player stats)

**Example Scenarios**:
```typescript
// Player update → invalidate player domain
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['player'] });
}

// Visit check-in → invalidate visit + player domains
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['visit'] });
  queryClient.invalidateQueries({ queryKey: ['player', 'stats', playerId] });
}

// Table assignment → invalidate table + visit domains
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['table', 'list'] });
  queryClient.invalidateQueries({ queryKey: ['visit', 'detail', visitId] });
}
```

### Zustand for UI State

**Scope**: Ephemeral UI state ONLY

**Includes**:
- Modal state (open/close, modal type, modal data)
- Navigation state (sidebar collapsed/expanded, active tab)
- UI filters (search terms, sort direction - UI state only, not query params)
- Form state (multi-step wizards, draft data not yet persisted)
- Temporary selections (bulk operations, multi-select)

**Excludes**:
- Server data (use React Query)
- Persistent state (use Supabase database)
- URL state (use Next.js router)

**Example Store**:
```typescript
interface UIStore {
  // Modal management
  modalState: {
    type: 'player-create' | 'visit-checkin' | null;
    isOpen: boolean;
    data?: unknown;
  };
  openModal: (type: string, data?: unknown) => void;
  closeModal: () => void;

  // Navigation
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}
```

### Real-Time Updates Integration

**Pattern**: Real-time hooks update React Query cache

**Implementation** (from existing standards):
```typescript
// Domain-specific hook handles subscription
usePlayerRealtime((event) => {
  // Update React Query cache on real-time event
  queryClient.setQueryData(['player', 'detail', event.playerId], event.newData);

  // Or invalidate to refetch
  queryClient.invalidateQueries({ queryKey: ['player', 'list'] });
});
```

**Rationale**:
- Single source of truth (React Query cache)
- Real-time updates flow through established patterns
- No separate real-time state management needed

## Consequences

### Positive

1. **Clear Separation of Concerns**
   - Server state: React Query
   - UI state: Zustand
   - Real-time: Updates React Query cache
   - No overlap or confusion

2. **Automatic Cache Management**
   - Background refetching
   - Stale-while-revalidate pattern
   - Memory management
   - Request deduplication

3. **TypeScript Type Safety**
   - Query keys typed
   - Response data typed from `Database` types
   - Compile-time errors for invalid state access

4. **Developer Experience**
   - Minimal boilerplate
   - Consistent patterns across domains
   - DevTools for debugging
   - Well-documented patterns

5. **Performance Optimization**
   - Intelligent caching reduces requests
   - Background refetching keeps data fresh
   - Optimistic updates improve perceived performance

### Negative

1. **Learning Curve**
   - Team must learn React Query patterns
   - Query key strategy requires discipline
   - Invalidation logic can be complex

2. **Potential Over-Fetching**
   - Background refetching may fetch unnecessary data
   - Requires tuning of `staleTime` and `refetchInterval`

3. **Additional Dependencies**
   - React Query: ~40kb gzipped
   - Zustand: ~1kb gzipped
   - Total: ~41kb added to bundle

4. **Testing Complexity**
   - Must mock React Query in tests
   - Integration tests need QueryClient setup
   - Invalidation logic requires careful testing

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

## Testing & Validation

### Wave 1: Service Layer Foundation (Week 1-2)
- [ ] Test React Query basics with PlayerService
- [ ] Validate query key pattern with 2-3 services
- [ ] Measure performance with default settings

### Wave 2: Hook Templates (Week 2)
- [ ] Test invalidation patterns across services
- [ ] Validate real-time + React Query integration
- [ ] Test Zustand UI state in modal flows

### Wave 3: Integration Testing (Week 3)
- [ ] Validate all 7 services with React Query
- [ ] Test cross-domain invalidation (visit → player stats)
- [ ] Performance testing with full data load
- [ ] Real-time updates stress testing

### Wave 4: ADR Finalization (Week 4)
- [ ] Document final React Query defaults
- [ ] Finalize query key conventions
- [ ] Document invalidation patterns
- [ ] Update ADR with test results

## Open Questions (Resolve by Wave 4)

1. **React Query Defaults**:
   - What `staleTime` balances freshness vs performance?
   - Should `refetchOnWindowFocus` be enabled globally?
   - What retry strategy works best for Supabase?

2. **Invalidation Patterns**:
   - Domain-level vs granular invalidation?
   - How to handle cross-domain cascades?
   - When to use optimistic updates vs refetch?

3. **Query Key Conventions**:
   - Should filters be part of key or options?
   - How to handle dynamic query params?
   - Naming conventions for computed queries?

4. **Real-Time Integration**:
   - Should real-time updates invalidate or setQueryData?
   - How to prevent duplicate fetches on real-time events?
   - Performance impact of real-time + React Query?

## References

- React Query v5 Docs: https://tanstack.com/query/latest/docs/framework/react/overview
- Zustand Docs: https://docs.pmnd.rs/zustand/getting-started/introduction
- Service Layer Architecture: `docs/system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- Balanced Architecture: `docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`
- ADR-002 Test Location: `docs/adr/ADR-002-test-location-strategy.md`

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2025-10-10 | 0.1 | Initial DRAFT - Wave 1.4 |
| TBD | 1.0 | Finalized after Wave 3 testing |
