Yes, there's a comprehensive realtime canon. Here's the hierarchy:

---

## Realtime Canon

### Architecture Decision
**ADR-004** (`docs/80-adrs/ADR-004-real-time-strategy.md`) — the governing decision. Key prescriptions:

- **Domain-scoped channels**: namespace `rt.<domain>.<scope>`, ref-counted via a channel registry
- **Micro-batched invalidation scheduler** (50ms debounce window) to prevent React Query thrashing
- **Hybrid cache strategy**: `setQueryData` for complete snapshots, `invalidateQueries` for partial/ambiguous payloads
- **Poll + ETag for high-cardinality dashboards** (realtime opt-in per widget)
- Planned infrastructure: `lib/realtime/channel-registry.ts`, `lib/realtime/invalidation-scheduler.ts`, shared `useRealtimeSubscription` hook

### Event Catalog
**INT-002** (`docs/35-integration/INT-002-event-catalog.md`) — 21 documented events with typed payload schemas, channel naming, and cache invalidation mappings. Directly relevant to the Exceptions panel:

| Event | Table | Status |
|-------|-------|--------|
| `table.fill_requested` | `table_fill` | Documented, not wired to realtime |
| `table.fill_completed` | `table_fill` | Documented, not wired to realtime |
| `table.credit_requested` | `table_credit` | Documented, not wired to realtime |
| `table.credit_completed` | `table_credit` | Documented, not wired to realtime |

### Governance
**UX Data Fetching Patterns** (`docs/70-governance/UX_DATA_FETCHING_PATTERNS.md`) — the SWR tier table, optimistic update policy, and the rule that realtime updates must reconcile through TanStack Query cache.

### What's actually built vs. what's spec'd

The **infrastructure** called for by ADR-004 — channel registry, invalidation scheduler, `useRealtimeSubscription` template — **does not exist** in code. The `lib/realtime/` directory was never created. The only realtime hook that exists is `useDashboardRealtime`, which is a hand-rolled ad-hoc implementation covering only `gaming_table` and `rating_slip`. The fills/credits events that would eliminate the 15s polling on the Exceptions panel are fully spec'd in INT-002 but have no client-side listener.

**Bottom line**: The canon exists and is thorough (ADR-004 + INT-002 + UX patterns). The Exceptions panel's polling problem is a known gap — the realtime infrastructure was planned but never implemented, so the panel falls back to `refetchInterval` polling as a pragmatic workaround.