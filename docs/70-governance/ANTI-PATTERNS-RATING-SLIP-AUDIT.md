# Anti-Pattern Catalog: Rating Slip Performance Audit

**Source:** [PERF-005](../issues/perf/PERF-005-RATING-SLIP-COMPREHENSIVE-PERFORMANCE-AUDIT.md)
**Purpose:** Preventive reference for future development. Each anti-pattern was extracted from real findings confirmed by 1-4 independent investigation agents.
**Created:** 2026-01-29

---

## AP-1: Client-Side Transaction Orchestration

**What it is:** Using sequential `await` chains across multiple HTTP roundtrips from the browser to achieve transactional semantics that should be a single server-side operation.

**How it manifests:**
```typescript
// BAD — 2 sequential HTTP calls, each paying full middleware tax
const updateResult = await updateAverageBet(slipId, { average_bet });
if (newBuyIn > 0) {
  await createFinancialTransaction({ amount: newBuyIn * 100, ... });
}
```

**Why it happens:** The developer needs operation B to run only if operation A succeeds. The simplest client-side approach is `await A; await B`. This preserves correctness but doubles latency and breaks atomicity — if B fails, A has already committed.

**What to do instead:** Create a composite server-side RPC that performs both operations in a single database transaction. The codebase already has the proven blueprint: `rpc_move_player` consolidated 6 sequential calls into 1 atomic RPC.

```typescript
// GOOD — single HTTP call, single DB transaction
const result = await saveWithBuyIn(slipId, { average_bet, buy_in_amount });
```

**Detection rule:** Any `mutationFn` with 2+ sequential `await` calls to different HTTP endpoints.

**PERF-005 findings:** P0-1 (save waterfall), P2-3 (start slip multi-call)

---

## AP-2: Inline Mutation Duplication

**What it is:** Components creating their own `useMutation()` calls for operations that already have dedicated hook implementations, resulting in divergent side effects (cache invalidation, optimistic updates, business logic) for the same user action.

**How it manifests:**
```typescript
// In hooks/rating-slip/use-rating-slip-mutations.ts
export function useCloseRatingSlip() {
  return useMutation({
    onSuccess: () => {
      // Invalidates ratingSlipKeys only
      // NO loyalty accrual
      // NO dashboard invalidation
    },
  });
}

// In components/dashboard/active-slips-panel.tsx
const closeMutation = useMutation({
  onSuccess: () => {
    // Invalidates dashboardKeys only
    // NO loyalty accrual
    // NO ratingSlip invalidation
  },
});
```

**Why it happens:** A component author needs a mutation with slightly different cache invalidation than the shared hook provides. Rather than extending the shared hook, they create a local `useMutation()` — faster to ship, but it silently drops side effects from the canonical implementation.

**What to do instead:** One operation = one mutation hook. Components consume the shared hook. If a component needs different invalidation, extend the hook's options (e.g., accept an `onSuccess` callback that runs *after* the canonical side effects), don't duplicate it.

```typescript
// GOOD — single source of truth for close side effects
export function useCloseRatingSlip(options?: { onSuccess?: () => void }) {
  return useMutation({
    onSuccess: (data) => {
      // ALL canonical side effects: cache, loyalty, dashboard
      invalidateAll(data);
      accrueOnClose(data);
      options?.onSuccess?.();
    },
  });
}
```

**Detection rule:** `grep -r "useMutation" --include="*.tsx"` in `components/` — any component-level `useMutation` for a domain operation that has a dedicated hook in `hooks/` is a duplication candidate.

**PERF-005 findings:** P0-2 (duplicate mutations, missing loyalty accrual from panel close)

---

## AP-3: Shotgun Cache Invalidation

**What it is:** Using a broad scope key for `invalidateQueries` when a targeted key is available, causing every cached query under that prefix to refetch regardless of relevance.

**Two variants:**

### Variant A: Scope Overreach
```typescript
// BAD — invalidates ALL rating slip list queries across ALL tables
queryClient.invalidateQueries({ queryKey: ratingSlipKeys.list.scope });

// GOOD — invalidates only the affected table's active slips
queryClient.invalidateQueries({ queryKey: ratingSlipKeys.activeForTable(tableId) });
```

### Variant B: Full-Key Instead of Prefix
```typescript
// BAD — generates ['loyalty','ledger',casinoId,playerId,'[]']
//        does NOT match ['loyalty','ledger',casinoId,playerId,'[["reason","base_accrual"]]']
queryClient.invalidateQueries({ queryKey: loyaltyKeys.ledger(playerId, casinoId) });

// GOOD — 4-element prefix matches ALL filter variants
queryClient.invalidateQueries({
  queryKey: ['loyalty', 'ledger', casinoId, playerId],
});
```

**Why it happens:**
- Variant A: The developer reaches for `.scope` because it's convenient and "covers everything." They don't realize the blast radius scales with the number of mounted queries.
- Variant B: The developer calls the key factory's leaf function, not realizing it appends a serialized filter element (`'[]'`) that prevents prefix matching against filtered queries.

**What to do instead:** Always use the narrowest key that covers the affected data. Understand that TanStack Query v5 uses **prefix matching** — `['a','b']` matches `['a','b','c']` but `['a','b','x']` does NOT match `['a','b','y']`. If unsure, test with `queryClient.getQueriesData({ queryKey })` in the console to see what matches.

**Detection rule:** Any `invalidateQueries` call using a key ending in `.scope` when the mutation's `onSuccess` has access to a specific entity ID (tableId, slipId, playerId).

**PERF-005 findings:** P0-4 (ledger key mismatch), P1-3 (list.scope shotgun), P2-7 (financial adjustment 225% overhead), P3-5 (tables.scope all casinos)

---

## AP-4: RPC Underloading

**What it is:** Performing validation queries or field updates in the TypeScript service layer that could be done atomically inside an existing database RPC, adding unnecessary roundtrips.

**How it manifests:**
```typescript
// BAD — pre-validation duplicates what the RPC already checks
const { data: visit } = await supabase
  .from('visit')
  .select('id, player_id, ended_at, casino_id')
  .eq('id', input.visit_id)
  .maybeSingle();
if (!visit) throw new NotFoundError('Visit not found');
if (visit.ended_at) throw new ConflictError('Visit already ended');

// ... then calls the RPC which does the SAME validation
const { data } = await supabase.rpc('rpc_start_rating_slip', { ... });
```

```typescript
// BAD — post-RPC UPDATE for a field the RPC could have set
const { data } = await supabase.rpc('rpc_close_rating_slip', { ... });
await supabase
  .from('rating_slip')
  .update({ final_duration_seconds: data.duration_seconds })
  .eq('id', slipId);
```

**Why it happens:** The TypeScript layer wants specific error messages (e.g., `VISIT_NOT_FOUND` vs `VISIT_CASINO_MISMATCH`) that the RPC doesn't surface. Or a new field requirement (e.g., `final_duration_seconds`) was added after the RPC was written, and the developer patched it in TS rather than modifying the migration.

**What to do instead:** Put validation and field updates inside the RPC. RPCs can `RAISE EXCEPTION 'SPECIFIC_CODE: message'` for differentiated errors, and the TypeScript `mapDatabaseError()` can parse these. If the RPC needs a new field, write a migration to modify it — don't add a post-RPC UPDATE.

**Detection rule:** Any `crud.ts` function that calls `supabase.from().select()` or `.update()` immediately before or after `supabase.rpc()` on the same entity.

**PERF-005 findings:** P1-1 (close redundant UPDATE), P1-2 (start redundant pre-validation)

---

## AP-5: Monolithic State Subscriber

**What it is:** A single React component subscribing to many independent state sources (hooks), causing the entire subtree to re-render when any one source changes.

**How it manifests:**
```typescript
// BAD — 13+ hooks, ANY change re-renders everything below
function PitDashboardClient() {
  const auth = useAuth();
  const modal = useModal();
  const ui = usePitDashboardUI();
  const tables = useDashboardTables(casinoId);
  const stats = useDashboardStats(casinoId);
  const gamingDay = useGamingDay(casinoId);
  const slips = useActiveSlipsForDashboard(tableId);
  const realtime = useDashboardRealtime(...);
  const promo = useDashboardPromoExposure(...);
  const modalData = useRatingSlipModalData(slipId);
  const saveMutation = useSaveWithBuyIn();
  const closeMutation = useCloseWithFinancial();
  const moveMutation = useMovePlayer();
  // ... renders StatsBar, TableGrid, ActiveSlipsPanel, Modal
}
```

**Why it happens:** During initial development, putting all hooks in one component is the fastest way to wire up a dashboard. Each hook addition is a small diff. The re-render cost is invisible until the component tree grows deep enough for reconciliation to become noticeable.

**What to do instead:** Group hooks by the subtree that consumes their data. Each group becomes a component that owns its own subscriptions and is wrapped in `React.memo`.

```typescript
// GOOD — each section subscribes only to what it renders
const StatsSection = memo(function StatsSection({ casinoId }) {
  const stats = useDashboardStats(casinoId);
  return <StatsBar data={stats.data} />;
});

const TableSection = memo(function TableSection({ casinoId, tableId }) {
  const tables = useDashboardTables(casinoId);
  const slips = useActiveSlipsForDashboard(tableId);
  return <TableGrid tables={tables.data} slips={slips.data} />;
});
```

**Detection rule:** Any component with 5+ `use*` hook calls that renders 3+ distinct child sections.

**PERF-005 findings:** P1-5 (PitDashboardClient re-render hub)

---

## AP-6: Inline Reference Allocation in Render

**What it is:** Creating new arrays, objects, or closures inside a render function that are passed as props to memoized children, defeating `React.memo` on every parent re-render.

**How it manifests:**
```typescript
// BAD — new array reference every render, defeats React.memo on TableLayoutTerminal
<TableLayoutTerminal seats={Array(7).fill(null)} />

// BAD — new closure every render per SlipCard
{slips.map(slip => (
  <SlipCard onAction={(action) => handleAction(slip, action)} />
))}
```

**Why it happens:** The syntax is clean and readable. The performance cost is invisible in dev tools unless you profile re-renders. The developer may not realize the child is memoized (or should be).

**What to do instead:**
```typescript
// GOOD — stable reference, memo works
const EMPTY_SEATS = Array(7).fill(null); // module-level constant

// GOOD — stable callback, memo works
const handleSlipAction = useCallback((slipId: string, action: string) => {
  // ...
}, [dependencies]);
```

**Detection rule:** Any `Array().fill()`, `{}` literal, or `() =>` arrow inside JSX props where the child component is (or should be) `React.memo`'d.

**PERF-005 findings:** P1-5 sub-finding (Array(7).fill defeating TableLayoutTerminal memo, inline closures on SlipCard)

---

## AP-7: Overlapping Middleware Phases

**What it is:** Multiple middleware functions independently querying for the same context (user identity, staff record, casino scope) that a prior middleware already established.

**How it manifests:**
```
withAuth:  supabase.auth.getUser() → staff table SELECT    [2 DB calls]
withRLS:   set_rls_context_from_staff() → staff table x2-3  [1 RPC, 2-3 internal]
RPC:       PERFORM set_rls_context_from_staff() → staff x2-3 [1 call, 2-3 internal]
                                                              ─────────
                                                    staff queried 5-7 times total
```

**Why it happens:** Each middleware was developed independently with self-contained correctness. `withAuth` needs to know who the user is. `withRLS` needs to set context. The RPC self-injects context as a defense-in-depth invariant. Each phase is correct in isolation; the overhead is only visible when you trace the full request lifecycle.

**What to do instead:** Design middleware phases to **pass forward** context established by earlier phases rather than re-deriving it. The first phase establishes identity and context; subsequent phases consume the established context.

```typescript
// GOOD — single context derivation, shared across phases
withAuthAndRLS:
  → set_rls_context_from_staff() [1 RPC]
  → extract context from session variables [0 DB calls]
  → attach to request context
```

**Note:** The RPC self-injection is a security invariant per ADR-024 and should not be removed without security review. The middleware consolidation targets only the TypeScript-side redundancy.

**Detection rule:** Multiple middleware functions in the compositor chain that each independently query the `staff` table or call `supabase.auth.getUser()`.

**PERF-005 findings:** P2-1 (triple auth/context overhead)

---

## AP-8: Superseded Code Retention

**What it is:** Leaving old implementations in the codebase after creating optimized replacements, causing confusion about which code path is canonical and inflating the maintenance surface.

**How it manifests:**
```typescript
// OLD — 6 sequential DB calls, still exported on service interface
async move(casinoId, slipId, input) {
  const slip = await this.getById(slipId);      // call 1
  await this.close(casinoId, slipId);           // calls 2-3
  const newSlip = await this.start(casinoId, ...); // calls 4-5
  await supabase.update({ continuity_fields });  // call 6
}

// NEW — 1 atomic RPC, used by route handler
async movePlayerViaRPC(supabase, casinoId, slipId, input) {
  return supabase.rpc('rpc_move_player', { ... }); // call 1
}
```

Both exist. A future developer might call `service.move()` thinking it's the canonical path.

**Why it happens:** The developer created the optimized path (new RPC, new route) but didn't delete the old code because: (a) integration tests still reference it, (b) they weren't sure if anything else calls it, or (c) the PR was already large enough.

**What to do instead:** When creating an optimized replacement for an existing function: delete the old implementation, update tests to use the new path, and if the old function must remain temporarily, mark it `@deprecated` with a pointer to the replacement. Include dead code removal in the same PR as the optimization.

**Detection rule:** Exported service functions that have no import references outside of `__tests__/` directories.

**PERF-005 findings:** P3-1 (legacy crud.move(), unused useDashboardSlips, unused useActiveSlipsForTable)

---

## AP-9: Untyped Parameter Forwarding

**What it is:** Passing a rich object (DTO, record, Date) through a channel that expects a primitive (URL parameter, query key element), relying on implicit `.toString()` which produces `[object Object]`.

**How it manifests:**
```
GET /api/v1/mtl/gaming-day-summary?gaming_day=%5Bobject+Object%5D  → 400
GET /api/v1/mtl/gaming-day-summary?gaming_day=%5Bobject+Object%5D  → 400
GET /api/v1/mtl/gaming-day-summary?gaming_day=%5Bobject+Object%5D  → 400
```

Three wasted 400-error requests per modal open because a `GamingDay` object (`{ gaming_day: string, timezone: string }`) was passed where a plain date string was expected.

**Why it happens:** TypeScript's structural typing allows passing an object where a `string` is expected if the consuming function's parameter type is `string | undefined` or isn't narrowly typed. The URL parameter builder calls `.toString()` implicitly, which on a plain object produces `[object Object]`.

**What to do instead:** API parameter builders should accept only primitive types (`string`, `number`, `boolean`). If a function accepts a domain object, extract the primitive field explicitly at the call site. Use branded types or Zod schemas at API boundaries to enforce this.

```typescript
// BAD — gamingDay is an object, not a string
fetchMtlSummary({ gaming_day: gamingDayInfo });

// GOOD — explicit field extraction
fetchMtlSummary({ gaming_day: gamingDayInfo.gaming_day });
```

**Detection rule:** Runtime detection via API 400 responses with `%5Bobject+Object%5D` in URLs. Static detection via TypeScript strict mode with `noImplicitToString` (not yet a TS flag, but enforced by custom lint rules on URL builder parameters).

**PERF-005 findings:** P0-3 (gaming_day=[object Object] serialization bug)

---

## AP-10: Silent Side-Effect Failure

**What it is:** Critical business operations (loyalty point accrual, audit logging) executed as fire-and-forget promises where failures are caught and logged with `console.warn` but never retried or surfaced.

**How it manifests:**
```typescript
// BAD — if loyalty service is down, player permanently loses earned points
accrueOnClose({ ratingSlipId, casinoId }).catch((err) => {
  console.warn('Loyalty accrual failed:', err);
});
```

**Why it happens:** The developer correctly identifies that loyalty accrual should not block the critical path (user shouldn't wait for it). Fire-and-forget is the right pattern for non-blocking execution. But the `.catch(() => warn)` swallows the failure permanently with no recovery path.

**What to do instead:** Fire-and-forget is correct for non-blocking execution. But for operations with business consequences (financial, compliance, loyalty), add a retry mechanism or dead-letter queue. At minimum, report failures to an error tracking service (Sentry, not console.warn) so they can be investigated.

```typescript
// GOOD — fire-and-forget with retry and observability
accrueOnClose({ ratingSlipId, casinoId }).catch((err) => {
  reportError('loyalty_accrual_failed', { ratingSlipId, err });
  retryQueue.enqueue('accrueOnClose', { ratingSlipId, casinoId });
});
```

**Detection rule:** `grep -r "\.catch.*console\.warn"` in hooks/ — any catch block that only logs is a candidate for retry or error reporting.

**PERF-005 findings:** P3-7 (console.warn in production), QA-3 finding 7 (silent loyalty failure)

---

## Quick Reference

| # | Anti-Pattern | One-Line Rule | Severity |
|---|-------------|---------------|----------|
| AP-1 | Client-Side Transaction Orchestration | If 2+ sequential HTTP calls need transactional semantics, make it 1 RPC | Critical |
| AP-2 | Inline Mutation Duplication | One operation = one mutation hook. Components consume, never duplicate. | Critical |
| AP-3 | Shotgun Cache Invalidation | Use the narrowest key that covers the affected data | High |
| AP-4 | RPC Underloading | If the RPC already validates/updates, don't duplicate in TypeScript | High |
| AP-5 | Monolithic State Subscriber | 5+ hooks in one component = split into memo'd sub-components | Medium |
| AP-6 | Inline Reference Allocation | Never create arrays/objects/closures inside JSX props | Medium |
| AP-7 | Overlapping Middleware Phases | Derive context once, pass forward — don't re-query in each phase | Medium |
| AP-8 | Superseded Code Retention | Delete old code in the same PR that adds the optimized replacement | Low |
| AP-9 | Untyped Parameter Forwarding | API parameters must be primitives, never domain objects | Low |
| AP-10 | Silent Side-Effect Failure | Fire-and-forget is fine; catch-and-swallow is not | Low |
