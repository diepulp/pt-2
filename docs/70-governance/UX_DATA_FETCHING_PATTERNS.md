# UX & Data Fetching Performance Patterns

**Status**: MANDATORY (Enforced for lists > 100 items, high-frequency updates)
**Effective**: 2025-11-09
**Purpose**: Prevent UI jank from large lists and real-time updates; optimize perceived performance

---

## TL;DR

**❌ BANNED:**
```typescript
// Rendering 5000 rows without virtualization
{players.map(player => <PlayerRow key={player.id} player={player} />)} // ❌ Jank!

// Real-time updates directly mutating state
supabase.channel('players')
  .on('postgres_changes', (payload) => {
    setPlayers([...players, payload.new]); // ❌ Re-renders entire list!
  });

// Non-idempotent optimistic updates
onClick={() => {
  addOptimistic(item);
  createItem(item); // ❌ Retry causes duplicates!
}}
```

**✅ REQUIRED:**
```typescript
// Virtualized list for 5000 rows
<VirtualList items={players} height={600} itemHeight={50}>
  {player => <PlayerRow player={player} />}
</VirtualList>

// Stale-while-revalidate for non-critical reads
useQuery({
  queryKey: playerKeys.list(),
  queryFn: fetchPlayers,
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 30 * 60 * 1000,   // 30 minutes
});

// Optimistic updates with idempotency
const mutation = useMutation({
  mutationFn: (data) => createReward(data),
  onMutate: async (newReward) => {
    // Optimistic update
    await queryClient.cancelQueries({ queryKey: rewardKeys.list() });
    const previous = queryClient.getQueryData(rewardKeys.list());
    queryClient.setQueryData(rewardKeys.list(), old => [...old, newReward]);
    return { previous };
  },
  onError: (err, newReward, context) => {
    // Rollback on error
    queryClient.setQueryData(rewardKeys.list(), context.previous);
  },
});
```

---

## Problem Statement

### Pitfalls (Current State)

1. **Big lists with real-time updates cause jank**
   - Rendering 1000+ DOM nodes blocks main thread
   - Real-time updates trigger full list re-renders
   - Scroll performance degrades exponentially

2. **Blocking data fetches hurt perceived performance**
   - Sequential fetches block rendering
   - No loading skeletons → white screen
   - Navigation feels slow (no prefetch)

3. **Unsafe optimistic updates**
   - Non-idempotent operations optimistically updated
   - Retries cause duplicates (reward issued twice)
   - Race conditions between optimistic and server state

---

## Solution Architecture

### 1. Windowed/Virtualized Lists

**Rule:** Lists with > 100 items OR real-time updates MUST use virtualization.

**Implementation** (using `@tanstack/react-virtual`):

```typescript
// hooks/use-virtual-list.ts
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

export function useVirtualList<T>({
  items,
  estimateSize = 50,
  overscan = 5,
}: {
  items: T[];
  estimateSize?: number;
  overscan?: number;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  return {
    parentRef,
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
  };
}
```

**Usage:**

```typescript
// components/PlayerList.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useVirtualList } from '@/hooks/use-virtual-list';
import { playerKeys } from '@/services/player/keys';

export function PlayerList() {
  const { data: players = [] } = useQuery({
    queryKey: playerKeys.list(),
    queryFn: fetchPlayers,
  });

  const { parentRef, virtualItems, totalSize } = useVirtualList({
    items: players,
    estimateSize: 60, // Estimated row height
  });

  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div style={{ height: `${totalSize}px`, position: 'relative' }}>
        {virtualItems.map((virtualRow) => {
          const player = players[virtualRow.index];
          return (
            <div
              key={player.id}
              className="absolute top-0 left-0 w-full"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <PlayerRow player={player} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Why This Works:**
- Only renders visible items + overscan buffer (~10-20 DOM nodes)
- Real-time updates only affect visible rows
- Smooth 60fps scrolling for 10,000+ items

---

### 2. Loading Skeletons

**Rule:** All async data fetches MUST show loading skeletons (not spinners).

**Implementation:**

```typescript
// components/ui/skeleton.tsx
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-gray-200 dark:bg-gray-800 rounded ${className}`}
    />
  );
}

// components/PlayerCardSkeleton.tsx
export function PlayerCardSkeleton() {
  return (
    <div className="p-4 border rounded-lg">
      <Skeleton className="h-10 w-10 rounded-full mb-3" />
      <Skeleton className="h-4 w-3/4 mb-2" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

// components/PlayerCard.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { playerKeys } from '@/services/player/keys';

export function PlayerCard({ playerId }: { playerId: string }) {
  const { data: player, isLoading } = useQuery({
    queryKey: playerKeys.detail(playerId),
    queryFn: () => fetchPlayer(playerId),
  });

  if (isLoading) {
    return <PlayerCardSkeleton />;
  }

  return (
    <div className="p-4 border rounded-lg">
      <Avatar src={player.avatar} />
      <h3>{player.name}</h3>
      <p>{player.email}</p>
    </div>
  );
}
```

**Why Skeletons > Spinners:**
- Shows layout structure (reduces CLS)
- Better perceived performance
- Users know what to expect

---

### 3. Stale-While-Revalidate (SWR)

**Rule:** Non-critical reads use stale data while fetching fresh data in background.

**Implementation:**

```typescript
// TanStack Query default (already SWR pattern)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,  // 5 min: treat as fresh
      gcTime: 30 * 60 * 1000,     // 30 min: keep in cache
      refetchOnWindowFocus: false, // Don't refetch on tab switch
      refetchOnReconnect: true,    // Refetch on network reconnect
    },
  },
});

// Override for high-frequency data
const { data: tableStatus } = useQuery({
  queryKey: tableKeys.status(tableId),
  queryFn: () => fetchTableStatus(tableId),
  staleTime: 30 * 1000,    // 30 seconds (hot data)
  gcTime: 2 * 60 * 1000,   // 2 minutes
  refetchInterval: 10 * 1000, // Poll every 10 seconds
});

// Override for slow-moving data
const { data: casinoSettings } = useQuery({
  queryKey: casinoKeys.settings(casinoId),
  queryFn: () => fetchCasinoSettings(casinoId),
  staleTime: 60 * 60 * 1000, // 1 hour (rarely changes)
  gcTime: 24 * 60 * 60 * 1000, // 24 hours
});
```

**SWR by Data Type:**

| Data Type | `staleTime` | `gcTime` | `refetchInterval` | Notes |
|-----------|-------------|----------|-------------------|-------|
| **Hot** (table status, player position) | 30s | 2m | 10s | Frequent updates |
| **Warm** (player details, visit list) | 5m | 30m | — | Default |
| **Cold** (casino settings, reports) | 1h | 24h | — | Rarely changes |
| **Critical** (loyalty balance, transactions) | 0 | 5m | — | Always fresh |

---

### 4. Prefetching Strategies

**Rule:** Prefetch data for likely next navigation (hover, route change).

**Hover Prefetch:**

```typescript
// components/PlayerLink.tsx
'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { playerKeys } from '@/services/player/keys';

export function PlayerLink({ playerId, children }: {
  playerId: string;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();

  const handleMouseEnter = () => {
    // Prefetch on hover
    queryClient.prefetchQuery({
      queryKey: playerKeys.detail(playerId),
      queryFn: () => fetchPlayer(playerId),
      staleTime: 5 * 60 * 1000,
    });
  };

  return (
    <Link
      href={`/players/${playerId}`}
      onMouseEnter={handleMouseEnter}
      className="text-blue-600 hover:underline"
    >
      {children}
    </Link>
  );
}
```

**Route Prefetch:**

```typescript
// app/players/page.tsx (Server Component)
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { fetchPlayers } from '@/services/player';
import { PlayerList } from '@/components/PlayerList';

export default async function PlayersPage() {
  const queryClient = new QueryClient();

  // Prefetch on server (SSR + hydration)
  await queryClient.prefetchQuery({
    queryKey: playerKeys.list(),
    queryFn: fetchPlayers,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PlayerList />
    </HydrationBoundary>
  );
}
```

**Parallel Prefetch:**

```typescript
// hooks/use-prefetch-dashboard.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function usePrefetchDashboard(casinoId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Prefetch all dashboard queries in parallel
    Promise.all([
      queryClient.prefetchQuery({
        queryKey: visitKeys.active(casinoId),
        queryFn: () => fetchActiveVisits(casinoId),
      }),
      queryClient.prefetchQuery({
        queryKey: tableKeys.list(casinoId),
        queryFn: () => fetchTables(casinoId),
      }),
      queryClient.prefetchQuery({
        queryKey: playerKeys.recent(casinoId),
        queryFn: () => fetchRecentPlayers(casinoId),
      }),
    ]);
  }, [casinoId, queryClient]);
}
```

---

### 5. Optimistic Update Policy

**CRITICAL RULE:** Only use optimistic updates for **idempotent** operations with **low conflict risk**.

**Safe for Optimistic Updates:**
- ✅ Toggling boolean flags (active/inactive)
- ✅ Updating text fields (name, notes)
- ✅ Client-side sorting/filtering
- ✅ UI state (collapsed/expanded)

**UNSAFE for Optimistic Updates:**
- ❌ Creating financial transactions (not idempotent)
- ❌ Issuing loyalty rewards (duplicate risk)
- ❌ Closing rating slips (state machine)
- ❌ Multi-step operations (no rollback)

**Safe Implementation:**

```typescript
// Example: Toggle player status (idempotent)
const toggleStatusMutation = useMutation({
  mutationFn: (playerId: string) => togglePlayerStatus(playerId),
  onMutate: async (playerId) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: playerKeys.detail(playerId) });

    // Snapshot previous value
    const previousPlayer = queryClient.getQueryData(playerKeys.detail(playerId));

    // Optimistic update
    queryClient.setQueryData(playerKeys.detail(playerId), (old) => ({
      ...old,
      status: old.status === 'active' ? 'inactive' : 'active',
    }));

    return { previousPlayer };
  },
  onError: (err, playerId, context) => {
    // Rollback on error
    queryClient.setQueryData(
      playerKeys.detail(playerId),
      context.previousPlayer
    );
  },
  onSettled: (playerId) => {
    // Refetch to ensure consistency
    queryClient.invalidateQueries({ queryKey: playerKeys.detail(playerId) });
  },
});
```

**Unsafe Implementation (DO NOT DO):**

```typescript
// ❌ WRONG: Financial transaction (non-idempotent)
const createTransactionMutation = useMutation({
  mutationFn: createTransaction,
  onMutate: async (txn) => {
    // ❌ DON'T: Optimistically add transaction
    queryClient.setQueryData(transactionKeys.list(), old => [...old, txn]);
    // Risk: If retry, user sees duplicate transaction!
  },
});

// ✅ RIGHT: Wait for server confirmation
const createTransactionMutation = useMutation({
  mutationFn: createTransaction,
  onSuccess: (data) => {
    // ✅ DO: Only update after server confirms
    queryClient.invalidateQueries({ queryKey: transactionKeys.list() });
  },
});
```

**Optimistic Update Decision Matrix:**

| Operation | Idempotent? | Conflict Risk | Optimistic? | Rollback Strategy |
|-----------|-------------|---------------|-------------|-------------------|
| Toggle flag | ✅ Yes | Low | ✅ Yes | Revert previous value |
| Update text | ✅ Yes | Low | ✅ Yes | Revert previous value |
| Create transaction | ❌ No | High | ❌ No | N/A (wait for server) |
| Issue reward | ❌ No | High | ❌ No | N/A (wait for server) |
| Close rating slip | ⚠️ Depends | Medium | ❌ No | Complex state machine |
| Delete record | ✅ Yes | Medium | ⚠️ Maybe | Add back + refetch |
| Bulk update | ⚠️ Depends | High | ❌ No | Partial rollback complex |

**Rules:**
1. **ONLY use optimistic updates if ALL these conditions are true:**
   - Operation is idempotent (safe to retry)
   - Conflict risk is low (single user editing)
   - Rollback is simple (revert single field)
   - Server confirms within 2 seconds

2. **NEVER use optimistic updates for:**
   - Financial operations (transactions, payments)
   - State machines (rating slip closure, visit end)
   - Multi-step workflows (enrollment, rewards)
   - Append-only ledgers (loyalty, MTL)

---

### 6. Real-Time Update Reconciliation

**Rule:** Real-time updates must reconcile with TanStack Query cache (not direct state).

**Implementation:**

```typescript
// hooks/use-realtime-players.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { playerKeys } from '@/services/player/keys';

export function useRealtimePlayers(casinoId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`players:casino:${casinoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'player',
          filter: `casino_id=eq.${casinoId}`,
        },
        (payload) => {
          // Reconcile with cache (don't mutate directly)
          if (payload.eventType === 'INSERT') {
            // Invalidate list query (will refetch)
            queryClient.invalidateQueries({ queryKey: playerKeys.list() });
          } else if (payload.eventType === 'UPDATE') {
            // Update specific item in cache
            queryClient.setQueryData(
              playerKeys.detail(payload.new.id),
              payload.new
            );
            // Invalidate list (in case filters affected)
            queryClient.invalidateQueries({ queryKey: playerKeys.list() });
          } else if (payload.eventType === 'DELETE') {
            // Remove from cache
            queryClient.removeQueries({ queryKey: playerKeys.detail(payload.old.id) });
            queryClient.invalidateQueries({ queryKey: playerKeys.list() });
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [casinoId, queryClient]);
}
```

**Usage:**

```typescript
// components/PlayerList.tsx
export function PlayerList({ casinoId }: { casinoId: string }) {
  const { data: players = [] } = useQuery({
    queryKey: playerKeys.list(),
    queryFn: fetchPlayers,
  });

  // Enable real-time updates
  useRealtimePlayers(casinoId);

  return (
    <VirtualList items={players} height={600}>
      {player => <PlayerRow player={player} />}
    </VirtualList>
  );
}
```

---

## Performance Budgets

### List Rendering

| List Size | Strategy | Max Render Time | Notes |
|-----------|----------|-----------------|-------|
| < 100 | Standard render | < 100ms | No virtualization needed |
| 100-1000 | Virtual list | < 50ms | Use `@tanstack/react-virtual` |
| > 1000 | Virtual + pagination | < 50ms | Combine virtualization + cursor pagination |

### Data Freshness

| Data Type | `staleTime` | `refetchInterval` | Max Staleness |
|-----------|-------------|-------------------|---------------|
| Critical (balances) | 0 | — | 0s |
| Hot (table status) | 30s | 10s | 30s |
| Warm (players) | 5m | — | 5m |
| Cold (settings) | 1h | — | 1h |

### Prefetch Budget

- **Hover prefetch:** Max 3 concurrent
- **Route prefetch:** Max 5 queries in parallel
- **Background prefetch:** Only on idle (requestIdleCallback)

---

## Anti-Patterns

### ❌ DON'T: Render 1000+ items without virtualization

```typescript
// ❌ BAD: Renders 5000 DOM nodes
{players.map(player => <PlayerRow key={player.id} player={player} />)}
```

### ✅ DO: Use virtual list

```typescript
// ✅ GOOD: Renders ~20 DOM nodes
<VirtualList items={players} height={600} itemHeight={60}>
  {player => <PlayerRow player={player} />}
</VirtualList>
```

### ❌ DON'T: Show spinner for loading states

```typescript
// ❌ BAD: Generic spinner
{isLoading && <Spinner />}
```

### ✅ DO: Show skeleton matching content layout

```typescript
// ✅ GOOD: Layout-aware skeleton
{isLoading && <PlayerCardSkeleton />}
```

### ❌ DON'T: Optimistically update non-idempotent operations

```typescript
// ❌ BAD: Financial transaction optimistic update
onMutate: async (txn) => {
  queryClient.setQueryData(txnKeys.list(), old => [...old, txn]); // ❌ Retry = duplicate!
}
```

### ✅ DO: Wait for server confirmation

```typescript
// ✅ GOOD: Only update after server confirms
onSuccess: (data) => {
  queryClient.invalidateQueries({ queryKey: txnKeys.list() });
}
```

### ❌ DON'T: Mutate state directly from real-time events

```typescript
// ❌ BAD: Direct state mutation
supabase.on('postgres_changes', (payload) => {
  setPlayers([...players, payload.new]); // ❌ Full re-render!
});
```

### ✅ DO: Reconcile with TanStack Query cache

```typescript
// ✅ GOOD: Update cache, let query handle re-render
supabase.on('postgres_changes', (payload) => {
  queryClient.invalidateQueries({ queryKey: playerKeys.list() });
});
```

---

## Implementation Checklist

### Lists

- [ ] Lists > 100 items use virtualization (`@tanstack/react-virtual`)
- [ ] Virtual lists have overscan buffer (5-10 items)
- [ ] Item height estimation is accurate (within 10%)
- [ ] Skeleton loaders match content layout
- [ ] Real-time updates only invalidate affected queries

### Fetching

- [ ] All queries use stale-while-revalidate pattern
- [ ] `staleTime` configured per data volatility
- [ ] Critical data has `staleTime: 0`
- [ ] Prefetch on hover for detail views
- [ ] Route changes prefetch on server (SSR)

### Optimistic Updates

- [ ] Only idempotent operations use optimistic updates
- [ ] Non-idempotent operations wait for server confirmation
- [ ] Rollback strategy defined for each optimistic update
- [ ] Conflicts trigger full refetch
- [ ] Financial/state-machine operations NEVER optimistic

### Real-Time

- [ ] Real-time events reconcile with TanStack Query cache
- [ ] No direct state mutations from Supabase events
- [ ] Invalidation targets specific query keys
- [ ] Channel subscriptions cleaned up on unmount
- [ ] Real-time disabled for lists not currently visible

---

## References

- **TanStack Virtual**: `https://tanstack.com/virtual/latest`
- **TanStack Query**: `https://tanstack.com/query/latest`
- **ADR-003**: State Management Strategy
- **ADR-004**: Real-Time Strategy
- **Frontend Canonical Standard**: `docs/70-governance/FRONT_END_CANONICAL_STANDARD.md`
- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`

---

**Effective Date**: 2025-11-09
**Enforcement**: Mandatory for lists > 100 items, high-frequency updates
**Migration**: Existing lists must adopt virtualization in Sprint 2
