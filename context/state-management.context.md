# State Management Context (ADR-003)
canonical_source: docs/80-adrs/ADR-003-state-management-strategy.md
owner: Frontend Lead
validation: 32 integration tests passing (100%)

## Core Decision

**React Query** for ALL server state (Supabase data)
**Zustand** for UI state ONLY (ephemeral, no server data)

## React Query Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,        // 5 minutes
      gcTime: 1000 * 60 * 30,          // 30 minutes
      refetchOnWindowFocus: false,     // Casino multi-window context
      retry: 1,                         // Single retry for transient failures
    },
    mutations: {
      retry: 0,                         // No retries (prevent duplicates)
    },
  },
});
```

**Rationale**:
- 5-min staleTime: Casino operations don't need sub-minute updates
- 30-min gcTime: Warm cache for operators switching views
- refetchOnWindowFocus: false prevents unnecessary refetches in multi-tab usage

## Query Key Patterns

**Structure**: `[domain, operation, ...params]`

```typescript
// Player domain
['player', 'list']
['player', 'detail', playerId]
['player', 'search', searchQuery]
['player', 'active', casinoId]

// Visit domain
['visit', 'list']
['visit', 'detail', visitId]
['visit', 'active', playerId]
['visit', 'by-casino', casinoId]

// Rating Slip domain
['rating-slip', 'list']
['rating-slip', 'detail', slipId]
['rating-slip', 'by-visit', visitId]

// MTL domain
['mtl', 'list']
['mtl', 'detail', mtlId]
['mtl', 'by-table-context', contextId]
```

## Cache Invalidation Strategies

### Strategy 1: Domain-Level (Creates & Bulk Changes)
```typescript
const createPlayer = useServiceMutation(createPlayerAction, {
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['player'] }); // All player queries
  },
});
```

### Strategy 2: Granular (Known Scope Updates)
```typescript
const updatePlayer = useServiceMutation(updatePlayerAction, {
  onSuccess: (data, variables) => {
    queryClient.invalidateQueries({ queryKey: ['player', 'detail', variables.id] });
    queryClient.invalidateQueries({ queryKey: ['player', 'list'] });
  },
});
```

### Strategy 3: Query Removal (Deletes)
```typescript
const deletePlayer = useServiceMutation(deletePlayerAction, {
  onSuccess: (data, playerId) => {
    queryClient.removeQueries({ queryKey: ['player', 'detail', playerId] });
    queryClient.invalidateQueries({ queryKey: ['player', 'list'] });
  },
});
```

### Strategy 4: Direct Cache Updates (Complete Entities)
```typescript
const updateVisit = useServiceMutation(updateVisitAction, {
  onSuccess: (data) => {
    queryClient.setQueryData(['visit', 'detail', data.id], data);
    queryClient.setQueriesData({ queryKey: ['visit', 'list'] }, (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((visit) =>
                visit.id === data.id ? data : visit
              ),
            })),
          }
        : current
    );
  },
});
```

## Zustand Store Scope

### Includes (UI state only)
- Modal state (open/close, type, data)
- Navigation state (sidebar, active tab)
- UI filters (search terms, sort - NOT query params)
- Form state (multi-step wizards, drafts)
- Temporary selections (bulk operations)
- View preferences (grid vs list vs table)

### Excludes (use React Query)
- ❌ Server data (players, visits, rating slips)
- ❌ Fetched data
- ❌ Persistent state
- ❌ User session
- ❌ URL state

## Implementation Examples

### Query Hook Template
```typescript
// hooks/player/use-player.ts
import { useServiceQuery } from '@/lib/react-query';
import { getPlayerAction } from '@/app/actions/player';

export function usePlayer(playerId: string) {
  return useServiceQuery({
    queryKey: ['player', 'detail', playerId],
    queryFn: () => getPlayerAction(playerId),
    enabled: !!playerId,
  });
}
```

### Mutation Hook Template
```typescript
// hooks/player/use-create-player.ts
import { useServiceMutation } from '@/lib/react-query';
import { createPlayerAction } from '@/app/actions/player';
import { useQueryClient } from '@tanstack/react-query';

export function useCreatePlayer() {
  const queryClient = useQueryClient();

  return useServiceMutation(createPlayerAction, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player'] });
    },
  });
}
```

### Zustand Store Template
```typescript
// store/player-ui-store.ts
import { create } from 'zustand';

interface PlayerUIStore {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  viewMode: 'grid' | 'list' | 'table';
  setViewMode: (mode: 'grid' | 'list' | 'table') => void;
  selectedPlayerIds: string[];
  togglePlayerSelection: (id: string) => void;
  clearSelection: () => void;
}

export const usePlayerUIStore = create<PlayerUIStore>((set) => ({
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  viewMode: 'table',
  setViewMode: (mode) => set({ viewMode: mode }),
  selectedPlayerIds: [],
  togglePlayerSelection: (id) =>
    set((state) => ({
      selectedPlayerIds: state.selectedPlayerIds.includes(id)
        ? state.selectedPlayerIds.filter((i) => i !== id)
        : [...state.selectedPlayerIds, id],
    })),
  clearSelection: () => set({ selectedPlayerIds: [] }),
}));
```

## Performance Baselines

| Operation | Target | Measured |
|-----------|--------|----------|
| Single CRUD | <1s | ~750ms |
| List operations | <1s | ~800ms |
| Cross-service workflows | <3s | ~2.4s |
| Error tests | <500ms | ~200ms |

## When to Reference Full Docs

- **Full ADR**: Read docs/80-adrs/ADR-003-state-management-strategy.md (32 tests, rationale)
- **Hook templates**: Read ADR-003 Wave 2 (729 lines of hook documentation)
- **Real-time integration**: Read docs/80-adrs/ADR-004-real-time-strategy.md
