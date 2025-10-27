# HOOKS_STANDARD.md — Hooks Location & Naming Standard

# 0) Global Defaults (QueryClient)

Create a single `QueryClient` in app bootstrap with opinionated defaults. Hooks should not repeat these.

```ts
import { QueryClient } from "@tanstack/react-query";

export const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 300_000,          // 5 minutes of freshness
        gcTime: 30 * 60_000,         // 30 minutes in cache
        retry: 2,                    // fail faster on flaky networks
      },
      mutations: {
        retry: 0,                    // explicit retries per mutation if needed
      },
    },
  });
```

React Query’s docs treat **focus refetching** as the main guardrail for keeping cached data fresh after tab switches, so leave `refetchOnWindowFocus` at its default (`true`) unless a hook has a demonstrated flicker problem—override locally rather than globally.

> **Authoritative source:** This document defines the canonical defaults. If `lib/query-client.ts` (or any other bootstrap location) drifts, update the implementation to match this section instead of modifying the standard here.


**Status:** PROPOSED → adopt immediately  
**Scope:** React Query data hooks + UI/Zustand hooks  
**Why:** Consistency, discoverability, zero bikeshedding, clean imports

## 1) Folder layout (top-level)
```
/hooks/
  shared/                     # cross-domain helpers (never call services here)
    use-service-query.ts      # generic query wrapper (v5)
    use-service-mutation.ts   # generic mutation wrapper (v5)
    use-infinite-query.ts     # optional helper for infinite lists
  player/
    use-player-list.ts
    use-player-detail.ts
    use-player-search.ts
    use-create-player.ts
    use-update-player.ts
    index.ts
  visit/
    use-visit-list.ts
    use-visit-detail.ts
    use-start-visit.ts
    use-end-visit.ts
    index.ts
  rating-slip/
    use-rating-slip-by-visit.ts
    use-create-rating-slip.ts
    use-close-rating-slip.ts
    index.ts
  table/
    use-table-available.ts
    use-table-detail.ts
    index.ts
  table-context/
    use-table-context-active.ts
    use-table-context-by-table.ts
    index.ts
  mtl/
    use-mtl-list.ts
    use-mtl-create-entry.ts
    index.ts
  ui/                         # Zustand-only UI hooks (no server calls)
    use-player-filters.ts
    use-ui.ts
```
> Path aliases recommended:
> - `@/hooks` → `/hooks`
> - `@/hooks/shared` → `/hooks/shared`
> - Domain keys live in `/services/<domain>/keys.ts` and are **imported** by hooks.

### Domain key factories (single shape per domain)

Key factories give every hook deterministic cache identifiers and a shared namespace for invalidation:

```ts
// services/player/keys.ts
type PlayerListFilters = { status?: 'active' | 'inactive'; q?: string; cursor?: string };

const serialize = (filters: PlayerListFilters = {}) =>
  JSON.stringify(Object.keys(filters).sort().map((key) => [key, filters[key as keyof PlayerListFilters]]));

export const playerKeys = {
  root: ['player'] as const, // Used for broad invalidations
  list: Object.assign(
    (filters: PlayerListFilters = {}) => [...playerKeys.root, 'list', serialize(filters)] as const,
    {
      scope: [...playerKeys.root, 'list'] as const, // For qc.setQueriesData / broad list invalidations
    },
  ),
  infinite: (filters: PlayerListFilters = {}) => [...playerKeys.root, 'infinite', serialize(filters)] as const,
  detail: (playerId: string) => [...playerKeys.root, 'detail', playerId] as const,
  create: () => [...playerKeys.root, 'create'] as const,
};
```

- Every domain exports exactly one factory in `services/<domain>/keys.ts`.
- `*.scope` (or `*.root`) is required for `setQueriesData` selectors that need to match **all** variants of that key family without referencing private properties.
- Only hooks import these factories; services stay unaware of React Query.

## 2) Naming conventions
- **File name:** `use-<domain-thing>-<operation>.ts`
  - `use-player-list.ts`, `use-visit-detail.ts`, `use-create-player.ts`
- **Hook name:** `use<DomainThing><Operation>`
  - `usePlayerList`, `useVisitDetail`, `useCreatePlayer`
- **Query keys:** **only** import from `services/<domain>/keys.ts`
  - Never inline arrays; always `playerKeys.list(filters)`
- **UI vs Data:**
  - `/hooks/ui/**` = Zustand/selectors **only**
  - `/hooks/<domain>/**` = React Query (fetch/mutate) **only**

## 3) Query hook template (v5)

### Use `select` to stabilize shape

Derive the projection once at the hook edge so consumers get a stable shape and fewer re-renders:

```ts
useQuery({
  queryKey: playerKeys.list(filters),
  queryFn: () => api.players.search(filters),
  select: (data) => data.items, // now components consume a simple array
});
```



### Enable gating for optional inputs

When a query depends on an ID or filters that may be `undefined`, gate execution:

```ts
useQuery({
  queryKey: playerKeys.detail(playerId),
  queryFn: () => api.players.get(playerId!),
  enabled: Boolean(playerId),
});
```



## Shared Fetcher: throw on non-2xx

React Query treats **rejected promises** as errors. Ensure `fetch` throws on non-OK so `onError`, retries and (optional) error boundaries work as intended.

```ts
export async function fetchJSON(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Include status for observability
    throw new Error(`${res.status} ${res.statusText} ${body}`.trim());
  }
  return res.json();
}
```


```ts
// hooks/player/use-player-list.ts
import { useQuery } from '@tanstack/react-query';
import { playerKeys } from '@/services/player/keys';
import { fetchPlayerList } from '@/services/player/http'; // tiny fetcher to API route

type Filters = { status?: 'active'|'inactive'; q?: string; cursor?: string };

export function usePlayerList(filters: Filters) {
  return useQuery({
    queryKey: playerKeys.list(filters),
    queryFn: () => fetchPlayerList(filters),
    placeholderData: (prev) => prev,   // v5 pattern instead of keepPreviousData
    // select: (data) => data.items,   // optional projection
    // staleTime: ???                 // Only override defaults when a hook needs it
  });
}
```

## 4) Mutation hook template

## Mutation patterns: scope narrowly or update directly

Prefer **surgical** cache updates. Only invalidate what you must—or write directly to the cache for instant UX.

```ts
const qc = useQueryClient();

// Example: create player
const createPlayer = useMutation({
  mutationKey: ['player', 'create'],
  mutationFn: api.players.create,
  onSuccess: (newPlayer, variables) => {
    // Best UX: prime detail cache
    qc.setQueryData(playerKeys.detail(newPlayer.id), newPlayer);
    // If a list is visible with same filters, either update it in place...
    qc.setQueriesData({ queryKey: playerKeys.list.scope }, (old) =>
      maybeInsertIntoList(old, newPlayer)
    );
    // ...or minimally invalidate that specific list key
    // qc.invalidateQueries({ queryKey: playerKeys.list(variables.filters) });
  },
});
```

### Optimistic update with rollback (list)

```ts
const createWithOptimism = useMutation({
  mutationKey: ['player', 'create'],
  mutationFn: api.players.create,
  onMutate: async (vars) => {
    await qc.cancelQueries({ queryKey: playerKeys.list(vars.filters) });
    const prev = qc.getQueryData(playerKeys.list(vars.filters));
    qc.setQueryData(playerKeys.list(vars.filters), (old) => addOptimistically(old, vars));
    return { prev };
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.prev) qc.setQueryData(playerKeys.list(_vars.filters), ctx.prev);
  },
  onSettled: (_data, _err, vars) => {
    qc.invalidateQueries({ queryKey: playerKeys.list(vars.filters) });
  },
});
```


```ts
// hooks/player/use-create-player.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { playerKeys } from '@/services/player/keys';
import { createPlayer } from '@/services/player/http'; // POST /api/player/create

export function useCreatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: playerKeys.create(),       // reuse factory so Devtools groups mutations
    mutationFn: createPlayer,
    onSuccess: (newPlayer) => {
      qc.setQueryData(playerKeys.detail(newPlayer.id), newPlayer);
      qc.setQueriesData({ queryKey: playerKeys.list.scope }, (old) =>
        maybeInsertIntoList(old, newPlayer)
      );
      // As a fallback, invalidate only the affected list key instead of the entire domain.
      // qc.invalidateQueries({ queryKey: playerKeys.list(currentFilters) });
    },
  });
}
```

## 5) Infinite list template

## Infinite queries: required UI flags

When using `useInfiniteQuery`, surface these flags consistently in the UI:

- `hasNextPage` to enable/disable the "Load more" control
- `isFetchingNextPage` for showing a spinner on the button
- `fetchNextPage()` to request the next page

Use a dedicated key factory entry (e.g., `playerKeys.infinite(filters)`) so infinite queries don’t collide with the standard paginated/list cache and stay debuggable in Devtools.

```ts
const {
  data,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
} = useInfiniteQuery({
  queryKey: playerKeys.infinite(filters),
  queryFn: ({ pageParam }) => api.players.search({ ...filters, cursor: pageParam }),
  initialPageParam: null,
  getNextPageParam: (last) => last.nextCursor ?? undefined,
});
```


```ts
// hooks/visit/use-visit-list.ts
import { useInfiniteQuery } from '@tanstack/react-query';
import { visitKeys } from '@/services/visit/keys';
import { fetchVisitPage } from '@/services/visit/http';

export function useVisitList(filters: { playerId?: string }) {
  return useInfiniteQuery({
    queryKey: visitKeys.infinite(filters),
    queryFn: ({ pageParam }) => fetchVisitPage({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string|undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 5 * 60 * 1000,
  });
}
```

## 6) Index barrels per domain
```ts
// hooks/player/index.ts
export * from './use-player-list';
export * from './use-player-detail';
export * from './use-player-search';
export * from './use-create-player';
export * from './use-update-player';
```

## 7) Testing layout

## Testing: fresh client + MSW

- Use a **fresh `QueryClient` per test** to isolate caches (e.g., `renderWithClient` helper).
- Mock network with **MSW** so hooks are tested against realistic boundaries.
- Wrap every hook render with a dedicated provider helper so cache state can’t leak between tests:

```ts
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

export function renderHookWithClient<T>(hook: () => T) {
  const client = createTestQueryClient();
  return renderHook(hook, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
```


```
/__tests__/hooks/
  player/
    use-player-list.test.ts
    use-create-player.test.ts
  visit/
    use-visit-list.test.ts
```
- Mock fetchers; assert:
  - key stability (same filters → same key),
  - v5 pagination behavior,
  - invalidation patterns
- Use fake timers for `staleTime/gcTime` assertions.

## 8) Lint & guardrails
- ESLint rule: **no fetch/service calls** in `/hooks/ui/**`.
- ESLint rule: **no Zustand** in `/hooks/<domain>/**`.
- Restrict **query key literals**—must import `<domain>Keys` from services.
- Codeowners (optional): domain owners approve changes to their `/hooks/<domain>/**`.

## 9) Migration (1–2 hours)
1. Create `/hooks/<domain>/` folders and add barrels.  
2. Move existing hooks to this structure; rename to the standard form.  
3. Replace inline query keys with `keys.ts` imports.  
3. Update imports with the path aliases.  
5. Add tests for at least one list + one mutation per domain.  

## 10) Definition of Done (for any new hook)
- Uses **domain key factory** (`<domain>Keys.*`).
- Respects ADR-003 defaults (override only with rationale).
- Invalidation handled in **onSuccess** (or `setQueriesData` if reconciling optimistic updates).
- Pure function signature (serializable filters).
- Unit test present (query + mutation sample per domain).

## Key stability with filter objects

- Ensure filters are **serializable** (no functions, Dates should be ISO strings).
- Normalize/sort keys when building `queryKey` (do this in your key factory).
- Avoid passing large, unbounded objects as part of keys.

## Suspense & Hydration (optional, Next.js App Router)

If you opt into streaming/server-side prefetch, use React Query's hydration helpers.
Keep this **opt-in** and mark as experimental; do not mandate Suspense across the codebase.
