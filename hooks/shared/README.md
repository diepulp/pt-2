# Shared React Hooks

This directory contains shared React hooks that provide reusable patterns across the PT-2 application, following the canonical architecture.

## Overview

- `use-service-query.ts` - Generic query hook for server actions with ServiceResult<T> integration
- `use-service-mutation.ts` - Generic mutation hook for server actions with ServiceResult<T> integration

## use-service-query

Generic React Query hook that integrates with PT-2's `ServiceResult<T>` pattern from server actions for data fetching.

### Features

- Automatic ServiceResult<T> to React Query transformation
- ServiceError to Error mapping for React Query
- Full TypeScript generics for type safety
- Type-safe query key patterns across all domains
- Compatible with `withServerAction` wrapper

### Query Key Pattern

Query keys follow a consistent domain-based structure:

```typescript
[domain, operation, ...params];
```

- **domain**: The bounded context (casino, player, visit, etc.)
- **operation**: The action being performed (list, detail, search, etc.)
- **params**: Optional parameters (IDs, filters, pagination)

### Domain Query Keys

#### Casino Domain

```typescript
["casino", "list"][("casino", "detail", casinoId)][ // All casinos // Specific casino
  ("casino", "by-company", companyId)
]; // Casinos filtered by company
```

#### Player Domain

```typescript
["player", "list"][("player", "detail", playerId)][ // All players // Specific player
  ("player", "search", searchQuery)
][("player", "active", casinoId)]; // Search results // Active players at casino
```

#### Visit Domain

```typescript
["visit", "list"][("visit", "list", page, limit)][("visit", "detail", visitId)][ // All visits // Paginated visits // Specific visit
  ("visit", "active", playerId)
][("visit", "by-casino", casinoId)]; // Player's active visit // Visits at specific casino
```

#### Rating Slip Domain

```typescript
["rating-slip", "list"][("rating-slip", "list", page, limit)][ // All rating slips // Paginated slips
  ("rating-slip", "detail", slipId)
][("rating-slip", "active", playerId)][("rating-slip", "by-visit", visitId)][ // Specific slip // Player's active slip // Slips for visit
  ("rating-slip", "by-table", tableId)
]; // Slips at table
```

#### Table Context Domain

```typescript
["table-context", "list"][("table-context", "detail", contextId)][ // All table contexts // Specific context
  ("table-context", "active", casinoId)
][("table-context", "by-table", tableId)]; // Active contexts at casino // Contexts for table
```

#### Table Domain

```typescript
["table", "list"][("table", "detail", tableId)][ // All tables // Specific table
  ("table", "by-casino", casinoId)
][("table", "available", casinoId)]; // Tables at casino // Available tables
```

#### MTL (Minimum Table Limits) Domain

```typescript
["mtl", "list"][("mtl", "detail", mtlId)][ // All MTL configurations // Specific MTL config
  ("mtl", "by-table-context", contextId)
][("mtl", "active", tableId)]; // MTLs for context // Active MTL for table
```

### Basic Usage

```typescript
import { useServiceQuery } from '@/hooks/shared/use-service-query'
import { getPlayerAction } from '@/app/actions/player/get-player-action'

function PlayerProfile({ playerId }: { playerId: string }) {
  const { data: player, isLoading, error } = useServiceQuery(
    ['player', 'detail', playerId],
    () => getPlayerAction(playerId)
  )

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <div>{player.firstName} {player.lastName}</div>
}
```

### Conditional Fetching

Use the `enabled` option to control when queries execute:

```typescript
function CasinoDetails({ casinoId }: { casinoId: string | null }) {
  const { data: casino, isLoading } = useServiceQuery(
    ['casino', 'detail', casinoId],
    () => getCasinoAction(casinoId!),
    {
      enabled: !!casinoId  // Only fetch when casinoId exists
    }
  )

  if (!casinoId) return <div>Select a casino</div>
  if (isLoading) return <div>Loading...</div>

  return <div>{casino.name}</div>
}
```

### Pagination

Keep previous data while loading next page:

```typescript
function VisitList() {
  const [page, setPage] = useState(1)
  const limit = 20

  const { data: visits, isLoading, isPreviousData } = useServiceQuery(
    ['visit', 'list', page, limit],
    () => listVisitsAction({ page, limit }),
    {
      keepPreviousData: true  // Keep previous page while loading next
    }
  )

  return (
    <div>
      {visits?.map(visit => <VisitCard key={visit.id} visit={visit} />)}

      <button
        onClick={() => setPage(p => p - 1)}
        disabled={page === 1}
      >
        Previous
      </button>

      <button
        onClick={() => setPage(p => p + 1)}
        disabled={isPreviousData || !visits?.length}
      >
        Next
      </button>
    </div>
  )
}
```

### Search Functionality

Debounce search input and conditionally fetch:

```typescript
import { useDeferredValue } from 'react'

function PlayerSearch() {
  const [searchQuery, setSearchQuery] = useState('')
  const deferredQuery = useDeferredValue(searchQuery)

  const { data: players, isFetching } = useServiceQuery(
    ['player', 'search', deferredQuery],
    () => searchPlayersAction(deferredQuery),
    {
      enabled: deferredQuery.length >= 3  // Only search with 3+ chars
    }
  )

  return (
    <div>
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search players..."
      />

      {isFetching && <div>Searching...</div>}

      {players?.map(player => (
        <PlayerCard key={player.id} player={player} />
      ))}
    </div>
  )
}
```

### Freshness Overrides

Apply per-query `staleTime`/`gcTime` values when a domain requires fresher or longer-lived caches than the global defaults:

```typescript
function AvailableTables({ casinoId }: { casinoId: string }) {
  const { data: tables, isFetching } = useServiceQuery(
    ['table', 'available', casinoId],
    () => listAvailableTablesAction(casinoId),
    {
      staleTime: 1000 * 30,    // 30 seconds: high-volatility table availability
      gcTime: 1000 * 60 * 5,   // 5 minutes: drop stale caches faster than global 30m
    },
  )

  if (isFetching) return <Spinner label="Refreshing availability" />

  return <TableAvailabilityList tables={tables} />
}
```

- Document any overrides in the domain README so other teams know the expected freshness budget.
- Use shorter windows for live dashboards (tables, active players) and extend them for static reports (monthly KPIs).
- Pair `staleTime` overrides with targeted invalidation or `setQueryData` where real-time hooks push updates into the cache.

### Dependent Queries

Fetch data based on previous query results:

```typescript
function ActiveRatingSlip({ playerId }: { playerId: string }) {
  // First, get the active visit
  const { data: activeVisit } = useServiceQuery(
    ['visit', 'active', playerId],
    () => getActiveVisitAction(playerId),
    { enabled: !!playerId }
  )

  // Then, get rating slips for that visit
  const { data: ratingSlips } = useServiceQuery(
    ['rating-slip', 'by-visit', activeVisit?.id],
    () => getRatingSlipsByVisitAction(activeVisit!.id),
    {
      enabled: !!activeVisit?.id  // Only fetch when we have a visit
    }
  )

  if (!activeVisit) return <div>No active visit</div>

  return (
    <div>
      <h2>Visit #{activeVisit.id}</h2>
      {ratingSlips?.map(slip => (
        <RatingSlipCard key={slip.id} slip={slip} />
      ))}
    </div>
  )
}
```

### Error Handling

Access ServiceError details for specific error handling:

```typescript
function PlayerForm({ playerId }: { playerId: string }) {
  const { data: player, error } = useServiceQuery(
    ['player', 'detail', playerId],
    () => getPlayerAction(playerId)
  )

  if (error) {
    // Access ServiceError code and details
    const errorCode = (error as Error & { code?: string }).code
    const errorDetails = (error as Error & { code?: string; details?: unknown }).details

    if (errorCode === 'NOT_FOUND') {
      return <div>Player not found</div>
    }

    if (errorCode === 'VALIDATION_ERROR') {
      return <div>Invalid player data: {error.message}</div>
    }

    return <div>Error: {error.message}</div>
  }

  return <PlayerEditForm player={player} />
}
```

### Type Safety

The hook is fully typed with TypeScript generics:

```typescript
useServiceQuery<TData>(
  queryKey: ReadonlyArray<string | number | boolean | undefined | null>,
  queryFn: () => Promise<ServiceResult<TData>>,
  options?: Omit<UseQueryOptions<TData, Error>, "queryKey" | "queryFn">
)
```

TypeScript will infer the data type from your server action:

```typescript
// TypeScript infers TData = PlayerDTO
const { data: player } = useServiceQuery(["player", "detail", playerId], () =>
  getPlayerAction(playerId),
);
```

## use-service-mutation

Generic React Query mutation hook that integrates with PT-2's `ServiceResult<T>` pattern from server actions.

### Features

- Automatic Result<T> to React Query transformation
- ServiceError to Error mapping for React Query
- Full TypeScript generics for type safety
- Cache invalidation support via queryClient
- Compatible with `withServerAction` wrapper

### Basic Usage

```typescript
import { useServiceMutation } from '@/hooks/shared/use-service-mutation'
import { useQueryClient } from '@tanstack/react-query'
import { createPlayerAction } from '@/app/actions/player/create-player-action'

function CreatePlayerForm() {
  const queryClient = useQueryClient()

  const createPlayer = useServiceMutation(
    createPlayerAction,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['player'] })
      }
    }
  )

  const handleSubmit = (data: CreatePlayerInput) => {
    createPlayer.mutate(data)
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button disabled={createPlayer.isPending}>
        {createPlayer.isPending ? 'Creating...' : 'Create Player'}
      </button>
    </form>
  )
}
```

## Cache Invalidation Strategies

React Query provides powerful cache invalidation mechanisms. Choose the right strategy based on your mutation's impact.

### Domain-Level Invalidation

Invalidate all queries for a domain. Use when mutations affect multiple related queries.

```typescript
const createPlayer = useServiceMutation(createPlayerAction, {
  onSuccess: () => {
    // Invalidates ALL player queries: ['player', 'list'], ['player', 'detail', id], etc.
    queryClient.invalidateQueries({ queryKey: ["player"] });
  },
});
```

**When to use:**

- Create operations (new entity added to lists)
- Bulk operations affecting multiple entities
- Changes impacting aggregations or statistics
- When unsure which specific queries are affected

### Granular Invalidation

Invalidate specific queries. Use when mutation impact is precisely known.

```typescript
const updatePlayer = useServiceMutation(updatePlayerAction, {
  onSuccess: (data, variables) => {
    // Invalidate specific player detail
    queryClient.invalidateQueries({
      queryKey: ["player", "detail", variables.id],
    });
    // Also invalidate list to reflect changes
    queryClient.invalidateQueries({
      queryKey: ["player", "list"],
    });
  },
});
```

**When to use:**

- Update operations on single entities
- Operations with known, limited scope
- Performance optimization (avoid unnecessary refetches)
- Complex query hierarchies

### Query Removal (Delete Operations)

For delete operations, remove the query entirely instead of invalidating.

```typescript
const deletePlayer = useServiceMutation(deletePlayerAction, {
  onSuccess: (data, playerId) => {
    // Remove deleted entity's detail query from cache
    queryClient.removeQueries({
      queryKey: ["player", "detail", playerId],
    });
    // Invalidate lists to remove deleted entity
    queryClient.invalidateQueries({
      queryKey: ["player", "list"],
    });
  },
});
```

**When to use:**

- Delete operations
- Entities that no longer exist
- Preventing 404 errors on deleted entities

## Complete Examples

### Create Operation

```typescript
import { useServiceMutation } from '@/hooks/shared/use-service-mutation'
import { useQueryClient } from '@tanstack/react-query'
import { createPlayerAction } from '@/app/actions/player/create-player-action'
import type { CreatePlayerInput } from '@/app/actions/player/create-player-action'

function useCreatePlayer() {
  const queryClient = useQueryClient()

  return useServiceMutation(
    createPlayerAction,
    {
      onSuccess: () => {
        // Invalidate all player queries to reflect new entity
        queryClient.invalidateQueries({ queryKey: ['player'] })
      },
      onError: (error) => {
        // Handle error (e.g., show toast notification)
        console.error('Failed to create player:', error.message)
      }
    }
  )
}

// Usage in component
function CreatePlayerForm() {
  const createPlayer = useCreatePlayer()

  const handleSubmit = (data: CreatePlayerInput) => {
    createPlayer.mutate(data, {
      onSuccess: () => {
        // Component-level success handling
        router.push('/players')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      {createPlayer.isPending && <LoadingSpinner />}
      {createPlayer.isError && <ErrorMessage error={createPlayer.error} />}
      {/* form fields */}
    </form>
  )
}
```

### Update Operation

```typescript
import { useServiceMutation } from '@/hooks/shared/use-service-mutation'
import { useQueryClient } from '@tanstack/react-query'
import { updatePlayerAction } from '@/app/actions/player/update-player-action'
import type { UpdatePlayerInput } from '@/app/actions/player/update-player-action'

function useUpdatePlayer() {
  const queryClient = useQueryClient()

  return useServiceMutation(
    updatePlayerAction,
    {
      onSuccess: (data, variables) => {
        // Granular invalidation for specific entity
        queryClient.invalidateQueries({
          queryKey: ['player', 'detail', variables.id]
        })
        // Also invalidate list views
        queryClient.invalidateQueries({
          queryKey: ['player', 'list']
        })
      }
    }
  )
}

// Usage in component
function EditPlayerForm({ playerId }: { playerId: string }) {
  const updatePlayer = useUpdatePlayer()

  const handleSubmit = (data: Omit<UpdatePlayerInput, 'id'>) => {
    updatePlayer.mutate(
      { id: playerId, ...data },
      {
        onSuccess: () => {
          // Show success notification
          toast.success('Player updated successfully')
        }
      }
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button disabled={updatePlayer.isPending}>
        {updatePlayer.isPending ? 'Saving...' : 'Save Changes'}
      </button>
    </form>
  )
}
```

### Delete Operation

```typescript
import { useServiceMutation } from '@/hooks/shared/use-service-mutation'
import { useQueryClient } from '@tanstack/react-query'
import { deletePlayerAction } from '@/app/actions/player/delete-player-action'

function useDeletePlayer() {
  const queryClient = useQueryClient()

  return useServiceMutation(
    deletePlayerAction,
    {
      onSuccess: (data, playerId) => {
        // Remove deleted entity from cache
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
}

// Usage in component
function DeletePlayerButton({ playerId }: { playerId: string }) {
  const deletePlayer = useDeletePlayer()

  const handleDelete = () => {
    if (!confirm('Are you sure you want to delete this player?')) {
      return
    }

    deletePlayer.mutate(playerId, {
      onSuccess: () => {
        toast.success('Player deleted')
        router.push('/players')
      },
      onError: (error) => {
        toast.error(`Failed to delete player: ${error.message}`)
      }
    })
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deletePlayer.isPending}
      className="btn-danger"
    >
      {deletePlayer.isPending ? 'Deleting...' : 'Delete Player'}
    </button>
  )
}
```

## Advanced: Optimistic Updates (Optional)

For advanced use cases, you can implement optimistic updates to provide immediate UI feedback before the server responds.

```typescript
function useUpdatePlayerOptimistic() {
  const queryClient = useQueryClient();

  return useServiceMutation(updatePlayerAction, {
    // Store previous data before mutation
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ["player", "detail", variables.id],
      });

      // Snapshot previous value
      const previousPlayer = queryClient.getQueryData([
        "player",
        "detail",
        variables.id,
      ]);

      // Optimistically update to the new value
      queryClient.setQueryData(["player", "detail", variables.id], variables);

      // Return context with snapshot
      return { previousPlayer };
    },
    // Rollback on error
    onError: (error, variables, context) => {
      queryClient.setQueryData(
        ["player", "detail", variables.id],
        context?.previousPlayer,
      );
    },
    // Always refetch after error or success
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["player", "detail", variables.id],
      });
    },
  });
}
```

**Note:** Optimistic updates add complexity. Only use when immediate UI feedback is critical for user experience.

## Type Safety

The hook is fully typed with TypeScript generics:

```typescript
useServiceMutation<TData, TVariables, TError = Error>(
  mutationFn: (variables: TVariables) => Promise<ServiceResult<TData>>,
  options?: Omit<UseMutationOptions<TData, TError, TVariables>, 'mutationFn'>
)
```

- `TData` - Success data type from ServiceResult<T>
- `TVariables` - Input variables type
- `TError` - Error type (defaults to Error)

TypeScript will infer these types from your server action:

```typescript
// TypeScript infers:
// TData = { id: string, email: string, ... }
// TVariables = CreatePlayerInput
const createPlayer = useServiceMutation(createPlayerAction, { ... })
```

## Error Handling

The hook transforms ServiceError to Error for React Query compatibility:

```typescript
createPlayer.mutate(data, {
  onError: (error) => {
    // error.message is the ServiceError message
    // error.details contains the full ServiceError object
    console.error(error.message);
    console.error((error as any).details); // Full ServiceError
  },
});
```

## Integration with Server Actions

This hook is designed to work seamlessly with PT-2's server action pattern:

1. Server actions use `withServerAction` wrapper
2. Actions return `ServiceResult<T>`
3. `useServiceMutation` unwraps the result for React Query
4. Cache invalidation refreshes related queries

```typescript
// Server action (app/actions/player/create-player-action.ts)
export async function createPlayerAction(input: CreatePlayerInput) {
  return withServerAction(
    async () => {
      const playerService = createPlayerService(supabase)
      return playerService.create(input)
    },
    supabase,
    { action: 'create_player', ... }
  )
}

// Client hook (hooks/player/use-create-player.ts)
export function useCreatePlayer() {
  return useServiceMutation(createPlayerAction, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player'] })
    }
  })
}
```

## Best Practices

1. **Encapsulate mutations in custom hooks** - Create domain-specific hooks (e.g., `useCreatePlayer`) for better reusability
2. **Use appropriate invalidation strategy** - Domain-level for creates, granular for updates, remove for deletes
3. **Handle errors at component level** - Let components decide how to display errors to users
4. **Leverage TypeScript inference** - Let TypeScript infer types from server actions
5. **Keep optimistic updates simple** - Only use when immediate feedback is essential
6. **Test mutations thoroughly** - Verify cache invalidation and error handling work as expected

## Related Documentation

- [React Query v5 Mutations](https://tanstack.com/query/v5/docs/framework/react/guides/mutations)
- [Query Invalidation](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation)
- [PT-2 Service Layer Architecture](../../docs/system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md)
- [Server Action Wrapper](../../lib/server-actions/with-server-action-wrapper.ts)
