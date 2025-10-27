# ADR-004: Real-Time Strategy

**Status**: ACCEPTED  
**Date Drafted**: 2025-10-17  
**Date Accepted**: 2025-10-25  
**Decision Makers**: Development Team  
**Validation**: Week 6 integration tests + cache invalidation smoke tests

## Context

PT-2 enters Week 6 with server state, mutations, and invalidation patterns established (ADR-003). Casino operations require timely awareness of table availability, player status, rating slip lifecycle, and compliance signals. Supabase provides Postgres change feeds via Realtime channels. We must standardize how client code consumes those feeds, keeps the React Query cache current, and avoids resource leaks while maintaining predictable developer ergonomics.

Questions to resolve:

1. Should hooks perform direct invalidation per event or batch work through a scheduler?
2. How do we guarantee subscriptions are cleaned up and prevent memory leaks?
3. Do domains reuse shared channels or own dedicated channels?
4. How does the UI recover from network drop / auth refresh without user intervention?

## Decision

### 1. Subscription Architecture

- **Domain-Scoped Channels**: Each bounded context (casino, player, visit, rating-slip, table-context, table, mtl) owns a Supabase channel namespace: `rt.<domain>.<scope>` (e.g. `rt.player.detail`, `rt.table.available`). Channels subscribe to Postgres changes filtered by table, schema, and optionally row-level `ids` using Supabase `postgres_changes` filters.
- **Channel Registry**: A lightweight registry (`lib/realtime/channel-registry.ts`) memoizes Supabase channels by name and reuse parameters to avoid duplicate sockets. Hooks call `acquireChannel(config)` and receive a ref-counted subscription object; `releaseChannel()` runs during cleanup.
- **Typed Payload Contracts**: Channel factories accept generic payload mappers that enforce typed DTOs before they hit React Query callbacks. This keeps server data contracts consistent with existing service DTOs.

### 2. Event Processing & Cache Updates

- **Scheduler Default**: Real-time hooks enqueue cache work into a micro-batched scheduler (`lib/realtime/invalidation-scheduler.ts`). The scheduler coalesces multiple events within a configurable debounce window (default 50ms) and executes a single invalidation/update batch on the next animation frame.
- **Hybrid Cache Strategy**:
  - For payloads that contain complete entity snapshots, hooks call `queryClient.setQueryData` using the patterns defined in ADR-003 §Cache Invalidation (Strategy 4). The scheduler exposes helpers for `setDetail` and `mergeList` operations.
  - When payloads are partial or the scope is ambiguous, hooks schedule targeted `invalidateQueries` calls (`['player', 'list']`, `['table', 'available', casinoId]` etc.). Domain helpers map Supabase topics to canonical query keys so developers never hard-code strings.
- **Direct Invalidations Only When Needed**: Hooks may bypass the scheduler for low-frequency events (≤1 per second) by setting `mode: 'immediate'`. The default remains batched to prevent thrashing during bursts (e.g. table-seat churn).

### 3. Memory Leak Prevention

- **Ref-counted Cleanup**: `acquireChannel` increments a counter per channel; on cleanup the counter decrements and invokes `channel.unsubscribe()` once it hits zero.
- **Effect Boundaries**: A shared `useRealtimeSubscription` hook wraps Supabase listeners inside `useEffect` with deterministic cleanup. It also registers a `AbortController` which is signalled on unmount to short-circuit any pending scheduler tasks.
- **Idle Detection**: The registry tracks last-activity timestamps; idle channels (no subscribers + no events for 30s) are purged from memory to avoid zombie sockets when a user navigates rapidly between tabs.
- **Testing Hooks**: Jest tests simulate mount/unmount sequences to assert channel counts drop to zero and scheduler queues flush. Cypress smoke ensures that navigating away from realtime-heavy screens does not log Supabase warnings.

### 4. Domain-Specific vs Shared Channels

- **Domain-Specific by Default**: Each domain exposes its own hook (e.g. `usePlayerRealtime`, `useTableAvailabilityRealtime`) that encapsulates filters, payload transforms, and cache wiring. This keeps concerns isolated and matches React Query’s domain-based query keys.
- **Shared Utility Channels**: Cross-domain workflows (e.g. visit ending triggers rating slip invalidation) listen on the originating domain and schedule invalidations for dependents using the scheduler’s `fanOut()` helper. We avoid a global “everything” channel to reduce payload volume and guard against over-fetching data that components do not need.

### 5. Reconnection & Resilience

- **Supabase Status Hooks**: The registry listens to Supabase `on('system', 'status')` events. On transitions to `CONNECTED`, it replays pending scheduler tasks and triggers a selective refetch (`queryClient.invalidateQueries` for domains flagged as “requires resync on reconnect”).
- **Backoff & Limits**: Let Supabase handle connection retries but impose a cap of 5 rapid reconnections before surfacing a toast via Zustand UI store prompting users to refresh. This prevents infinite reconnect loops in degraded networks.
- **Foreground/Background Awareness**: When the document visibility changes to hidden for >2 minutes, we pause scheduler execution (queue persists). On visibility regain we flush the queue then rely on React Query’s `refetchOnReconnect` to catch any missed deltas.
- **Auth Refresh Integration**: The Supabase SSR helper already rotates session tokens; the registry exposes `refreshAuth(token)` so that when Next.js refreshes session cookies the channel client updates without tearing down listeners.

### 6. Domain Event Map Alignment & Developer Workflow

- Supabase channel contracts must match `25-api-data/REAL_TIME_EVENTS_MAP.md`. Each hook documents which event (`rating_slip.updated`, `loyalty.ledger_appended`, etc.) it listens to and how it touches React Query keys (`setQueryData` vs `invalidateQueries` with `refetchType:'active'`).
- Update the map whenever a new realtime event ships; ADR-007 requires the API catalogue/OpenAPI bundle to mention corresponding read endpoints if they exist.

- **Hook Template**: `hooks/shared/use-realtime-channel.ts` exports a template consumed by each domain. It accepts `channel`, `eventFilter`, `mapPayload`, and `handleEvent` callbacks. Domain folders document expected query keys and scheduler operations.
- **Documentation Alignment**: Domain READMEs must list realtime hooks, channel names, and cache impact so other teams understand downstream invalidations. ADR-003 overrides guide when to favor `setQueryData` vs invalidation.
- **Instrumentation**: Dev builds log channel lifecycle events when `process.env.NEXT_PUBLIC_DEBUG_REALTIME === 'true'`. Production builds default to silent logging with optional metrics emitted via custom events for later observability work.

## Consequences

### Positive

1. **Predictable Cache Updates**: Scheduler + canonical query keys minimize redundant refetches while keeping React Query aligned with live data.
2. **Leak Prevention**: Ref-counted registry and effect cleanup avoid the “too many listeners” warnings witnessed in earlier spikes.
3. **Domain Isolation**: Teams evolve realtime rules per bounded context without impacting others, reducing regression risk.
4. **Resilient UX**: Automatic reconnection and selective refetch ensure operators see fresh data after transient outages.

### Negative

1. **Implementation Overhead**: Registry/scheduler abstractions add complexity compared to naive `invalidateQueries`. Training and docs mitigate this.
2. **Potential Latency**: Batched updates introduce up to 50ms delay. For mission-critical flows the hook can opt into immediate mode.
3. **Testing Load**: Mocking Supabase channels in Jest requires new utilities; integration suites must simulate reconnect scenarios.

## Alternatives Considered

### A. Direct Invalidations Without Scheduler

- **Pros**: Simpler mental model; fewer abstractions.
- **Cons**: Burst events hammer React Query and Supabase with redundant refetches; observed in Table Context prototype. Rejected in favor of scheduler.

### B. Single Global Channel

- **Pros**: One subscription and dispatcher.
- **Cons**: High payload volume, complicated routing, and increases blast radius of bugs. Violates domain isolation goals. Rejected.

### C. Optimistic-Only Updates

- **Pros**: Minimal server chatter, fastest UI.
- **Cons**: Requires comprehensive conflict resolution and rollback logic not available in Wave 3. Real-time feeds remain necessary for authoritative state. Rejected.

## Implementation Plan (Week 6)

1. **Scaffold Realtime Utilities**
   - `lib/realtime/channel-registry.ts` with acquire/release, idle cleanup, status listener.
   - `lib/realtime/invalidation-scheduler.ts` with `enqueue`, `setDetail`, `mergeList`, `fanOut` helpers and abort support.
2. **Create Shared Hook Template**
   - `hooks/shared/use-realtime-channel.ts` encapsulating Supabase subscription lifecycle and scheduler integration.
3. **Pilot Domains**
   - Implement `useTableAvailabilityRealtime` and `usePlayerStatusRealtime` with unit tests covering mount/unmount, scheduler batching, and cache updates via jest-mock Supabase client.
4. **Reconnection Handling**
   - Integrate status listener with React Query `refetchOnReconnect` and UI toast on repeated failures.
5. **Documentation & Training**
   - Update relevant domain READMEs with channel naming, overrides, and testing recipes.
6. **Validation**
   - Add integration tests (Cypress or Jest) simulating rapid updates and reconnection to confirm cache and UI consistency.

## References

- Supabase Realtime docs: https://supabase.com/docs/guides/realtime
- ADR-003: State Management Strategy (`ADR-003-state-management-strategy.md`)
- Canonical Blueprint MVP PRD (`10-prd/CANONICAL_BLUEPRINT_MVP_PRD.md`) – §3.6 Real-Time & Invalidations
- Balanced Architecture Quick Reference (`20-architecture/BALANCED_ARCHITECTURE_QUICK.md`) – Real-time deliverables

## Revision History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-10-17 | 0.1 | Initial proposal for Week 6 realtime strategy | Development Team |
