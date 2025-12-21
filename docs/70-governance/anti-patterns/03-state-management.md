# State Management Anti-Patterns

**Target Agents**: `react-pro`, `pt2-frontend-implementer`, `full-stack-developer`
**Severity**: HIGH - Affects UI consistency and performance

---

## React Query Violations

### ❌ NEVER use `staleTime: 0` without justification

```typescript
// ❌ WRONG
const { data } = useServiceQuery({
  queryKey: ["player", "detail", id],
  queryFn: () => getPlayer(id),
  staleTime: 0, // Forces refetch on every render
});

// ✅ CORRECT
const { data } = useServiceQuery({
  queryKey: ["player", "detail", id],
  queryFn: () => getPlayer(id),
  staleTime: 5 * 60 * 1000, // 5 minutes (default)
  // OR: Explicit real-time hook with documented strategy
});
```

### ❌ NEVER instantiate Supabase clients in hooks

```typescript
// ❌ WRONG
export function usePlayer(id: string) {
  const supabase = createBrowserClient(); // ❌ Creates new client each render
  const playerService = createPlayerService(supabase);

  return useQuery({
    queryKey: ["player", id],
    queryFn: () => playerService.getById(id),
  });
}

// ✅ CORRECT
export function usePlayer(id: string) {
  return useServiceQuery({
    queryKey: ["player", "detail", id],
    queryFn: () => getPlayer(id), // Server action
  });
}
```

### ❌ NEVER invalidate all queries from event handlers

```typescript
// ❌ WRONG
const handleUpdate = async () => {
  await updatePlayer(data);
  queryClient.invalidateQueries(); // Invalidates EVERYTHING
};

// ✅ CORRECT
const handleUpdate = async () => {
  await updatePlayer(data);
  queryClient.invalidateQueries({ queryKey: ['player', 'detail', playerId] });
};
```

---

## Zustand Violations

### ❌ NEVER store server data in Zustand

```typescript
// ❌ WRONG
interface PlayerStore {
  players: Player[]; // ❌ Server data
  selectedPlayerId: string | null;
  setPlayers: (players: Player[]) => void;
}

// ✅ CORRECT
interface UIStore {
  selectedPlayerId: string | null; // UI state only
  setSelectedPlayerId: (id: string | null) => void;
}

// Server data lives in React Query:
const { data: players } = usePlayers();
```

### ❌ NEVER instantiate Supabase clients in stores

```typescript
// ❌ WRONG
interface CasinoStore {
  supabase: SupabaseClient; // ❌
  fetchCasinos: () => Promise<void>;
}

// ✅ CORRECT
// Stores contain NO Supabase clients
// Data fetching happens via server actions → React Query
```

### ❌ NEVER persist derived state

```typescript
// ❌ WRONG
interface TableStore {
  activeTables: Table[];
  activeTableCount: number; // Derived from activeTables.length
}

// ✅ CORRECT
interface TableStore {
  activeTables: Table[];
  // Derived values computed in selectors or components
}

// Use selector for derived values
const activeCount = useTableStore((s) => s.activeTables.length);
```

---

## Real-Time Anti-Patterns

### ❌ NEVER create global real-time managers

```typescript
// ❌ WRONG
// services/real-time/connection-pool.ts
export class RealtimeConnectionPool {
  private static instance: RealtimeConnectionPool;
  private connections = new Map();

  static getInstance() { /* singleton */ }
}

// ✅ CORRECT
// Domain-specific hooks manage their own subscriptions
export function usePlayerRealtime(playerId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`player:${playerId}`)
      .on("postgres_changes", { /* config */ }, (payload) => {
        queryClient.invalidateQueries(["player", "detail", playerId]);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [playerId]);
}
```

### ❌ NEVER skip cleanup on unmount

```typescript
// ❌ WRONG
useEffect(() => {
  const channel = supabase.channel("updates").subscribe();
  // No cleanup!
}, []);

// ✅ CORRECT
useEffect(() => {
  const channel = supabase.channel("updates").subscribe();

  return () => {
    channel.unsubscribe(); // Cleanup
  };
}, []);
```

### ❌ NEVER trigger refetch storms from realtime handlers

```typescript
// ❌ WRONG
channel.on("postgres_changes", () => {
  queryClient.invalidateQueries(); // Blasts every cache on each event
});

// ✅ CORRECT
// Batch updates and scope to active queries
scheduler.enqueue("rating-slip.detail", ratingSlipId, () => {
  queryClient.setQueryData(ratingSlipKeys.detail(ratingSlipId), update);
});
```

### ❌ NEVER subscribe to all tables

```typescript
// ❌ WRONG
supabase.channel('all').on('postgres_changes', { event: '*', schema: 'public' }, ...);

// ✅ CORRECT
// Subscribe to specific tables with filters
supabase.channel('rating-slips')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'rating_slip',
    filter: `table_id=eq.${tableId}`,
  }, ...);
```

---

## Quick Checklist

- [ ] No server data in Zustand (use React Query)
- [ ] No `staleTime: 0` without justification
- [ ] No Supabase clients in hooks/stores
- [ ] No global real-time managers
- [ ] All realtime subscriptions have cleanup
- [ ] Realtime handlers scope invalidations
