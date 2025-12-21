
# ADR-003: State Management Strategy 

**Status**: ACCEPTED  
**Date Drafted**: 2025-10-10  
**Date Accepted**: 2025-10-10  
**Redacted/Updated**: 2025-10-23  
**Decision Makers**: Development Team  
**Validation**: Phase 3 Waves 1-3 (32 integration tests passing)

> This version folds in review feedback: query-key factories & stability, TanStack Query v5 pagination (`placeholderData` / Infinite Query), refined mutation retry guidance, realtime invalidation hygiene, cache structural sharing notes, and Zustand slices/selectors ergonomics.

---

## Context

PT-2 requires a clear state management strategy to handle:
- Server data (players, visits, rating slips, tables, casinos, MTL, loyalty)
- UI state (modals, navigation, filters, forms)
- Real-time updates (player status, table events)
- Cache invalidation and optimistic updates
- Cross-component data sharing

The architecture must support:
- TypeScript type safety across all state operations
- Consistent patterns across bounded contexts
- Performance via intelligent caching
- Minimal boilerplate & high DX

---

## Decision

### 0) React 19 Compiler & Hooks Architecture (New)

- Enable the React 19 compiler and associated runtime per `70-governance/FRONT_END_CANONICAL_STANDARD.md`. New components default to compiler-optimized renders; manual memoization requires profiling evidence attached to the PR.
- Hook directories follow `70-governance/HOOKS_STANDARD.md`: global QueryClient defaults live in `hooks/shared`, domain hooks import canonical query-key factories from `services/**/keys.ts`, and UI-only Zustand hooks stay under `hooks/ui`.
- Domain hooks must consume **service DTO/RPC APIs** only; never query another service's tables/views directly. CQRS projections published by each service are the sanctioned read models for hot telemetry paths.
- Transport rule: React Query mutations must hit Route Handlers (JSON + ServiceHttpResult), while form/RSC flows use Server Actions wrapped with `withServerAction`. Intake cards (ADR-009) record the transport choice, and API routes must appear in the canonical catalogue/OpenAPI bundle (ADR-007).

### 1) TanStack React Query (v5) for **Server State**

**Scope**: ALL data fetched from Supabase/PostgREST or server actions.

**Global Configuration**
```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Freshness & memory
      staleTime: 1000 * 60 * 5,  // 5 minutes (baseline; override per domain as needed)
      gcTime:   1000 * 60 * 30,  // 30 minutes (evict unused data)
      // Refetch policies tuned for casino multi-window workflows
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      // See "Mutation retry policy" below
      retry: 0,
    },
  },
});
```

**Rationale (unchanged baseline)**  
- `staleTime: 5m` balances freshness vs traffic.  
- `gcTime: 30m` reduces re-loading for operators hopping views.  
- `refetchOnWindowFocus: false` avoids noisy tab switching.  
- `refetchOnReconnect: true` heals after network blips on the floor.  

**Override Guidance**  
High-volatility domains (live table availability, player status dashboards) **must** set shorter `staleTime`/`gcTime` on a per-query basis; slow-moving reports may extend them. Each override is documented in the domain README (freshness expectations).

---

### 2) **Query-Key Factories** & Stability

**Why**: Prevent cache misses / over-fetching from unstable objects in keys.

**Rules**
- Keys must be JSON-serializable & stable (no functions, Dates; normalized/sorted objects).
- Use per-domain key factories to avoid typos and centralize normalization.
- Shape follows `[domain, operation, scope?, ...params]` so domain-event helpers can deterministically map events (e.g., `ratingSlip.updated`) back to specific keys.

**Template (`services/player/keys.ts`)**
```ts
export const playerKeys = {
  root:     () => ['player'] as const,
  list:     (filters?: { status?: 'active'|'inactive'; q?: string }) =>
              ['player', 'list', filters ?? {}] as const, // ensure stable shape
  detail:   (id: string) => ['player', 'detail', id] as const,
  byCasino: (casinoId: string) => ['player', 'by-casino', casinoId] as const,
};
```

**Usage**
- Queries & invalidations must import from the same factory.  
- If you need object params, ensure a stable, minimal shape (pre-sorted keys).

---

### 3) **Pagination & Placeholder Data** (v5)

- v5 removes `keepPreviousData`. Prefer:
  - **`placeholderData`** (identity helper) to keep prior page visible while fetching next,
  - **`useInfiniteQuery`** for cursor-based feeds (lists with “Load more”/infinite scroll).

**Example (cursor pagination)**
```ts
const query = useInfiniteQuery({
  queryKey: playerKeys.list(filters),
  queryFn: ({ pageParam }) => fetchPlayers({ ...filters, cursor: pageParam }),
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  // keep current data visible while fetching
  placeholderData: (prev) => prev,
});
```

**Initial vs Placeholder**
- `initialData` seeds and **caches**;  
- `placeholderData` affects UI while loading but **does not** persist as cached canonical data. Document which you use and why.

---

### 4) Cache Invalidation & Direct Writes

**Hierarchical Invalidation**
```ts
// all player queries
queryClient.invalidateQueries({ queryKey: playerKeys.root() });
// player detail
queryClient.invalidateQueries({ queryKey: playerKeys.detail(playerId) });
// lists only
queryClient.invalidateQueries({ queryKey: playerKeys.list() });
```

**Direct Cache Updates**
- Prefer `setQueriesData({ queryKey }, updater)` when the same entity echoes across many lists.
- Keep **structural sharing** intact (default) to reduce re-renders.

**Example: merge updated entity into paginated lists**
```ts
queryClient.setQueriesData({ queryKey: playerKeys.list() }, (current: any) => {
  if (!current) return current;
  return {
    ...current,
    pages: current.pages.map((p: any) => ({
      ...p,
      items: p.items.map((row: any) => row.id === data.id ? data : row),
    })),
  };
});
```

**When to invalidate vs setQueryData**
- **Invalidate** when payload is partial or impacts derived queries/aggregates.  
- **`setQueryData`/`setQueriesData`** when payload is a full snapshot and you must avoid extra hops.
- **Domain-event helper**: implement a shared `invalidateByDomainEvent(eventName, payload)` utility that maps SRM domain events → query-key factories. All mutations call this helper in `onSuccess`, and realtime listeners reuse it to reconcile cache in lockstep.

---

### 5) Mutation Retry Policy

**Default**: `mutations.retry = 0` _if and only if_ server-side idempotency is guaranteed (e.g., constraint-based UPSERT, idempotency keys, unique natural keys).  
**Alternative**: If idempotency is not universal, set `retry: 1` with backoff for network/5xx and keep optimistic updates conservative.

Add an ADR note: **DB-side idempotency is the primary safety rail** (preferred).

---

### 6) Realtime → Query Cache Playbook (Supabase)

**Subscription pattern**
```ts
usePlayerRealtime((evt) => {
  // If evt includes a full canonical snapshot:
  queryClient.setQueryData(playerKeys.detail(evt.playerId), evt.newData);

  // Otherwise prefer invalidation; avoid thrash on inactive views
  queryClient.invalidateQueries({
    queryKey: playerKeys.list(),
    // v5 tip: only refetch active observers
    refetchType: 'active',
  });
});
```

**Hygiene**
- **Batch/debounce** invalidations (e.g., 250–500 ms) for busy streams.  
- For Infinite Queries, update the **correct page** shape: `{ pages: [...], pageParams: [...] }`.  
- Avoid global invalidations on high-churn channels; target detail keys first.
- **Domain event contract:** mutations emit app-level events (mirroring SRM names) which are also delivered via Supabase Realtime. Both the mutation `onSuccess` handler and the realtime listener call `invalidateByDomainEvent(event, payload)` so cache reconciliation logic lives in one place.
- **Channel scope:** subscribe by `{casino_id}` for collection/list feeds and `{casino_id}:{resource_id}` for detail views. Hot domains (RatingSlip, TableContext) should only push state transitions or periodic snapshots (1–5s) to avoid flooding operators.
- **Fallback polling:** For high-cardinality dashboards, default to React Query polling with HTTP cache validators (ETag/If-None-Match) unless the service publishes a curated summary channel. Unauthorized channel joins must be rejected up front based on role + casino scope.

---

### 7) Tested Behaviors to Lock In

- **Timers**: Fake timer tests for `staleTime` → stale transitions and `gcTime` eviction.  
- **Reconnect**: Verify `refetchOnReconnect: true` path heals after offline periods.  
- **Placeholder vs Initial**: Snapshot tests for loading/transition states on pagination.  
- **Key factories**: Type tests ensure keys are `readonly` tuples and shared by query & invalidation sites.

---

### 8) Zustand for **Ephemeral UI State** (Only)

**Scope**
- Modals, navigation, transient filters (that don’t need sharing), wizard drafts, bulk selections, view prefs.

**Excludes**
- Server data, fetched data, persistent state, user session (NextAuth), URL state (router).

**Store Patterns**
- **Slices** + **combined middleware** (`persist`, `devtools`, `immer`, `subscribeWithSelector`) applied once at the root store.  
- **Selectors** with `subscribeWithSelector` for fine-grained updates; prefer primitives & `shallow` equality in hooks.  
- **Persistence** only for benign UI prefs (e.g., sidebar, view mode).  
- **Promotion to URL**: When filters must be shareable/bookmarkable, move them into URL params and hydrate the store from router loaders.

**Example (Global UI store sketch)**
```ts
type ModalState = { type: string|null; isOpen: boolean; data?: unknown };

interface UIStore {
  modal: ModalState;
  openModal: (type: string, data?: unknown) => void;
  closeModal: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIStore>()(/* slices + middleware */);
```

**RSC Hygiene (Next.js App Router)**
- Define stores in `use client` modules; don’t read them in Server Components.  
- Keep store modules free of browser-only globals until initialization in client boundaries.

---

## Cache Invalidation Strategy (Examples)

**1) Domain-Level (Creates / Bulk)**
```ts
const createPlayer = useServiceMutation(createPlayerAction, {
  onSuccess: () => queryClient.invalidateQueries({ queryKey: playerKeys.root() }),
});
```

**2) Granular (Updates)**
```ts
const updatePlayer = useServiceMutation(updatePlayerAction, {
  onSuccess: (_data, vars) => {
    queryClient.invalidateQueries({ queryKey: playerKeys.detail(vars.id) });
    queryClient.invalidateQueries({ queryKey: playerKeys.list() });
  },
});
```

**3) Removal (Deletes)**
```ts
const deletePlayer = useServiceMutation(deletePlayerAction, {
  onSuccess: (_data, id) => {
    queryClient.removeQueries({ queryKey: playerKeys.detail(id) });
    queryClient.invalidateQueries({ queryKey: playerKeys.list() });
  },
});
```

**4) Direct Cache Update (Full snapshot)**
```ts
const updateVisit = useServiceMutation(updateVisitAction, {
  onSuccess: (data) => {
    queryClient.setQueryData(['visit','detail', data.id], data);
    queryClient.setQueriesData({ queryKey: ['visit','list'] }, (current: any) => {
      if (!current) return current;
      return {
        ...current,
        pages: current.pages.map((page: any) => ({
          ...page,
          items: page.items.map((v: any) => v.id === data.id ? data : v),
        })),
      };
    });
  },
});
```

---

## Consequences

### Positive
- Clear SoC: React Query (server), Zustand (UI), realtime flows into cache.
- Predictable freshness: `staleTime`/`gcTime` defaults + per-domain overrides.
- Stable keys reduce cache misses; factories unify patterns across services.
- Pagination UX consistent with v5 using `placeholderData`/Infinite Query.
- Realtime hygiene avoids refetch storms; `refetchType:'active'` reduces background noise.
- Structural sharing minimizes re-renders; identity preserved in list updates.

### Negative / Trade-offs
- Key factories add a tiny indirection (worth the safety).  
- Tests must cover timers, pagination placeholders, and reconnect paths.  
- Mutation `retry: 0` relies on DB idempotency; otherwise bump to `1` with backoff.

---

## Alternatives Considered
(unchanged: Context API only, RTK Query, SWR, Zustand-only — still rejected for PT‑2 needs)

---

## Implementation Evidence

- Query Client: `lib/query-client.ts`
- Hook templates: `hooks/shared/use-service-query.ts`, `use-service-mutation.ts`
- Domain key factories: `services/*/keys.ts` (per domain)
- Hook Guidelines: `hooks/shared/README.md`
- **UI Stores** (PRD-013 implemented 2025-12-21):
  - `store/ui-store.ts` — Modal state, sidebar collapse
  - `store/pit-dashboard-store.ts` — Table/slip selection, panel navigation
  - `store/index.ts` — Barrel exports
- **UI Hooks** (PRD-013 implemented 2025-12-21):
  - `hooks/ui/use-modal.ts` — Modal state selector with `useShallow`
  - `hooks/ui/use-pit-dashboard-ui.ts` — Dashboard UI selector with `useShallow`
  - `hooks/ui/index.ts` — Barrel exports

---

## Resolved Questions (delta)

- **Objects in keys?** Allowed if stable. We normalize via factories and only include minimal, sorted fields.  
- **Pagination transitions?** Use `placeholderData` (identity) or Infinite Query; no `keepPreviousData` in v5.  
- **Mutations & retries?** `retry: 0` if DB idempotent; otherwise `retry: 1` limited to network/5xx.  
- **Realtime invalidation scope?** Prefer targeted detail updates; batch list invalidations; `refetchType:'active'`.
- **Query key & event discipline?** Keys follow `[domain, operation, scope?, ...params]`. Domain events emitted from Server Actions map to these keys via the shared helper; realtime listeners reuse the same mapping.

---

## Acceptance Criteria (updated)

✅ Query-key factories added per domain; params stability documented
✅ v5 pagination patterns adopted (`placeholderData`, Infinite Query)
✅ Mutation retry policy clarified vis-à-vis DB idempotency
✅ Realtime invalidation playbook added (batching, active-only refetch)
✅ Domain-event driven invalidation helper + channel scoping documented
✅ Structural sharing & `setQueriesData` guidance added
✅ Tests expanded for timers, reconnect, placeholder transitions

---

## Related Standards

**UX & Data Fetching Patterns** (`docs/70-governance/UX_DATA_FETCHING_PATTERNS.md`):
- Virtualized lists (> 100 items) using `@tanstack/react-virtual`
- Loading skeletons (not spinners)
- Stale-while-revalidate cache strategies by data type (hot/warm/cold)
- Prefetching strategies (hover, route, parallel)
- Optimistic update policy (ONLY idempotent operations)

**Status**: ACCEPTED
**Approved By**: Development Team
**Date**: 2025-10-10 (Redacted/Updated 2025-10-23, 2025-11-09)
