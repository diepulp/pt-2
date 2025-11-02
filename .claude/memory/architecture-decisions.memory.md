# Architecture Decisions

**Last Updated**: 2025-10-29
**Source**: ADRs in `docs/80-adrs`
**Purpose**: Key architectural decisions and their rationale

---

## Overview

This document summarizes the 12 Architecture Decision Records (ADRs) that govern PT-2's design. These decisions are binding and must be followed.

**Quick Reference**:

- [ADR-000: SRM Canonical contract](../../docs/80-adrs/ADR-000-matrix-as-contract.md)
- [ADR-001: Dual database type strategy (local + remote)](../../docs/80-adrs/ADR-001-dual-database-type-strategy.md)
- [ADR-002: Test location standardization (root-level)](../../docs/80-adrs/ADR-002-test-location-standard.md)
- [ADR-003: State management strategy (React Query + Zustand)](../../docs/80-adrs/ADR-003-state-management-strategy.md)
- [ADR-004: Real-time strategy (domain channels + scheduler)](../../docs/80-adrs/ADR-004-real-time-strategy.md)
- [ADR-005: Integrity enforcement (4-layer guardrails)](../../docs/80-adrs/ADR-005-integrity-enforcement.md)
- [ADR-006: RatingSlip financial field removal](../../docs/80-adrs/ADR-006-rating-slip-field-removal.md)
- [ADR-007: API surface catalogue & OpenAPI contract](../../docs/80-adrs/ADR-007-api-surface-catalogue.md)
- [ADR-008: Service layer architecture diagram & template](../../docs/80-adrs/ADR-008-service-layer-architecture.md)
- [ADR-009: Balanced architecture intake & transport gate](../../docs/80-adrs/ADR-009-balanced-architecture-intake.md)
- [ADR-010: DTO & service compliance gate](../../docs/80-adrs/ADR-010-dto-compliance-gate.md)
- [ADR-011: Over-engineering guardrail (OE-01)](../../docs/80-adrs/ADR-011-over-engineering-guardrail.md)

---

## ADR-001: Dual Database Type Strategy

**Status**: ✅ Accepted (2025-10-06)
**Context**: Schema drift between local and remote Supabase instances

### Decision

Maintain **separate type files** for local development and remote validation:

```
types/
├── database.types.ts           # LOCAL (development, testing)
└── remote/
    └── database.types.ts       # REMOTE (validation, production)
```

### Rationale

**Local Development**:

- Fast iteration without remote dependency
- Disposable database (can `db reset` freely)
- No network latency
- Offline development possible

**Remote Deployment**:

- Validate production schema matches expectations
- Careful, measured changes only
- No easy rollback

### Type Generation Differences

| Component | Local        | Remote       | Impact          |
| --------- | ------------ | ------------ | --------------- |
| Tables    | ✅ Identical | ✅ Identical | Zero            |
| Enums     | ✅ Identical | ✅ Identical | Zero            |
| Functions | ✅ Identical | ✅ Identical | Zero            |
| GraphQL   | ❌ Missing   | ✅ Present   | None (not used) |
| Metadata  | ❌ Missing   | ✅ Present   | None            |

**Conclusion**: Service layer code is 100% compatible with both type files.

### Workflow

#### Local Development

```bash
# 1. Create migration
supabase migration new add_feature

# 2. Apply locally
supabase db reset  # Or: supabase migration up

# 3. Generate local types
npm run db:types

# 4. Implement service with new types
# (services use local types)

# 5. Run tests
npm test

# 6. Commit
git add supabase/migrations types/database.types.ts
git commit -m "feat: add feature"
```

#### Remote Deployment

```bash
# 1. Check diff
supabase db diff --linked

# 2. Apply to remote
supabase db push --linked

# 3. Generate remote types
npm run db:types:remote

# 4. Validate no breaking changes
diff types/database.types.ts types/remote/database.types.ts

# 5. Commit remote types
git add types/remote/database.types.ts
git commit -m "chore: update remote types"
```

### Key Commands

```json
{
  "db:types": "supabase gen types typescript --local > types/database.types.ts",
  "db:types:remote": "supabase gen types typescript --linked > types/remote/database.types.ts",
  "db:diff": "supabase db diff --linked",
  "db:push": "supabase db push --linked",
  "db:pull": "supabase db pull && supabase db reset"
}
```

### Import Patterns

```typescript
// ✅ Services, hooks, components - use LOCAL types
import type { Database } from "@/types/database.types";

// ✅ Production validation scripts - use REMOTE types
import type { Database } from "@/types/remote/database.types";
```

### Sync Scenarios

**Local Ahead (Development)** ✅ Normal

- Local has new migration, remote doesn't yet
- Continue development, deploy when ready

**Remote Ahead (Out of Sync)** ⚠️ Pull needed

- Remote has migrations you don't have locally
- Action: `supabase db pull && supabase db reset`

**Divergent State (Conflict)** 🔴 Resolve

- Local and remote have different migrations with same timestamp
- Action: Resolve migration conflict, regenerate both

**Perfect Sync (Ideal)** ✅ Ready

- Same migrations applied to both
- Types match (except GraphQL/metadata)

---

## ADR-002: Test Location Standardization

**Status**: ⚠️ Proposed (2025-10-07)
**Context**: Inconsistency in test file locations across services

### Decision

**Chosen Pattern**: Root-level `__tests__/services/`

```
__tests__/
└── services/
    ├── player/
    │   └── player-service.test.ts
    ├── casino/
    │   └── casino-service.test.ts
    └── visit/
        └── visit-service.test.ts

services/
├── player/
│   ├── index.ts
│   └── crud.ts
└── casino/
    ├── index.ts
    └── crud.ts
```

### Rationale

- ✅ Already used by 67% of services (4/6)
- ✅ Standard Jest convention
- ✅ Clear separation of test vs production code
- ✅ Single directory to exclude from builds
- ✅ Easier to run "all tests" vs "service tests"
- ✅ Matches Next.js App Router conventions

### Migration Status

**Already Compliant**:

- Player, Visit, RatingSlip, PlayerFinancial

**Needs Migration** (Post-MVP - Week 3):

- Casino: `services/casino/__tests__/` → `__tests__/services/casino/`
- TableContext: `services/table-context/__tests__/` → `__tests__/services/table-context/`

### Enforcement

- [ ] ESLint rule to detect `services/*/__tests__/` pattern
- [ ] Pre-commit hook warning
- [ ] PR review checklist

---

## ADR-003: State Management Strategy

**Status**: ✅ ACCEPTED (2025-10-10)
**Validation**: 32 integration tests passing (100%)

### Decision

**React Query** for ALL server state (Supabase data)
**Zustand** for UI state ONLY (ephemeral, no server data)

### React Query Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false, // Casino multi-window context
      retry: 1, // Single retry for transient failures
    },
    mutations: {
      retry: 0, // No retries (prevent duplicates)
    },
  },
});
```

**Rationale**:

- **5-minute staleTime**: Casino operations don't need sub-minute updates
- **30-minute gcTime**: Warm cache for operators switching views
- **refetchOnWindowFocus: false**: Prevents unnecessary refetches in multi-tab usage
- **queries.retry: 1**: Handle transient network issues
- **mutations.retry: 0**: Prevent duplicate operations

**Override Guidance**: Shorten staleTime/gcTime for high-volatility queries (live table availability, player status). Document overrides in domain READMEs.

### Query Key Pattern

**Structure**: `[domain, operation, ...params]`

**All 7 Domains** (30 patterns documented):

```typescript
// Casino
["casino", "list"][("casino", "detail", casinoId)][
  ("casino", "by-company", companyId)
][
  // Player
  ("player", "list")
][("player", "detail", playerId)][("player", "search", searchQuery)][
  ("player", "active", casinoId)
][
  // Visit
  ("visit", "list")
][("visit", "list", page, limit)][("visit", "detail", visitId)][
  ("visit", "active", playerId)
][("visit", "by-casino", casinoId)][
  // Rating Slip
  ("rating-slip", "list")
][("rating-slip", "detail", slipId)][("rating-slip", "by-visit", visitId)][
  ("rating-slip", "by-table", tableId)
][
  // Table Context
  ("table-context", "list")
][("table-context", "detail", contextId)][
  ("table-context", "active", casinoId)
][("table-context", "by-table", tableId)][
  // Table
  ("table", "list")
][("table", "detail", tableId)][("table", "by-casino", casinoId)][
  ("table", "available", casinoId)
][
  // MTL
  ("mtl", "list")
][("mtl", "detail", mtlId)][("mtl", "by-table-context", contextId)][
  ("mtl", "active", tableId)
];
```

### Hierarchical Invalidation

```typescript
// Invalidate all player queries
queryClient.invalidateQueries({ queryKey: ["player"] });

// Invalidate specific player
queryClient.invalidateQueries({ queryKey: ["player", "detail", playerId] });

// Invalidate player lists only
queryClient.invalidateQueries({ queryKey: ["player", "list"] });
```

### Cache Invalidation Strategies

**Strategy 1: Domain-Level Invalidation**
Use for **create operations** and **bulk changes**.

```typescript
const createPlayer = useServiceMutation(createPlayerAction, {
  onSuccess: () => {
    // Invalidates ALL player queries
    queryClient.invalidateQueries({ queryKey: ["player"] });
  },
});
```

**When to use**:

- Create operations (new entity added to lists)
- Bulk operations affecting multiple entities
- When unsure which queries are affected

**Strategy 2: Granular Invalidation**
Use for **update operations** with known scope.

```typescript
const updatePlayer = useServiceMutation(updatePlayerAction, {
  onSuccess: (data, variables) => {
    // Specific player detail
    queryClient.invalidateQueries({
      queryKey: ["player", "detail", variables.id],
    });
    // Also invalidate list
    queryClient.invalidateQueries({
      queryKey: ["player", "list"],
    });
  },
});
```

**When to use**:

- Update operations on single entities
- Operations with known, limited scope
- Performance optimization

**Strategy 3: Query Removal**
Use for **delete operations**.

```typescript
const deletePlayer = useServiceMutation(deletePlayerAction, {
  onSuccess: (data, playerId) => {
    // Remove deleted entity's detail query
    queryClient.removeQueries({
      queryKey: ["player", "detail", playerId],
    });
    // Invalidate lists
    queryClient.invalidateQueries({
      queryKey: ["player", "list"],
    });
  },
});
```

**When to use**:

- Delete operations
- Preventing 404 errors on deleted entities

**Strategy 4: Direct Cache Updates**
Use when mutation responses contain complete entities.

```typescript
const updateVisit = useServiceMutation(updateVisitAction, {
  onSuccess: (data) => {
    // Update detail cache directly
    queryClient.setQueryData(["visit", "detail", data.id], data);

    // Merge into list caches
    queryClient.setQueriesData({ queryKey: ["visit", "list"] }, (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((visit) =>
                visit.id === data.id ? data : visit,
              ),
            })),
          }
        : current,
    );
  },
});
```

**When to use**:

- Mutation payloads include complete entity
- Lists are small to moderate
- High-frequency mutations

**When to avoid**:

- Mutation payloads are partial
- Multiple dependent queries need recalculation

### Zustand Store Scope

**Includes** (UI state only):

- Modal state (open/close, type, data)
- Navigation state (sidebar, active tab)
- UI filters (search terms, sort - NOT query params)
- Form state (multi-step wizards, drafts)
- Temporary selections (bulk operations)
- View preferences (grid vs list vs table)

**Excludes** (use React Query):

- Server data (players, visits, rating slips)
- Fetched data
- Persistent state
- User session
- URL state

### Implemented Stores

**Global UI Store** (`store/ui-store.ts`):

```typescript
interface UIStore {
  modal: {
    type: string | null;
    isOpen: boolean;
    data?: unknown;
  };
  openModal: (type: string, data?: unknown) => void;
  closeModal: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}
```

**Tests**: 9 passing

**Player UI Store** (`store/player-store.ts`):

```typescript
interface PlayerUIStore {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  viewMode: "grid" | "list" | "table";
  setViewMode: (mode: "grid" | "list" | "table") => void;
  currentPage: number;
  itemsPerPage: number;
  setPage: (page: number) => void;
  selectedPlayerIds: string[];
  togglePlayerSelection: (id: string) => void;
  clearSelection: () => void;
  resetFilters: () => void;
}
```

**Tests**: 11 passing

### Validation Evidence

**Wave 1**: Infrastructure (37 tests passing)

- React Query configured
- Server action wrapper
- Zustand stores created

**Wave 2**: Hook Templates (729 lines documentation)

- Query hook template
- Mutation hook template
- 30 query key patterns documented
- 3 invalidation strategies documented

**Wave 3**: Integration (32 tests passing)

- 24 service CRUD tests (6 services)
- 2 cross-service workflow tests
- 6 error handling tests
- 2 structure validation tests

**Performance Baselines**:

- Single CRUD: ~750ms average
- List operations: ~800ms average
- Cross-service workflows: ~2.4s average
- Error tests: ~200ms average

---

## ADR-004: Real-Time Strategy

**Status**: ✅ ACCEPTED (2025-10-25)
**Context**: Standardize Supabase real-time integration with React Query

### Decision

**Domain-Specific Channels** with **Invalidation Scheduler**

### Architecture

**1. Subscription Architecture**

- **Domain-Scoped Channels**: Each domain owns channel namespace
  - Pattern: `rt.<domain>.<scope>` (e.g. `rt.player.detail`, `rt.table.available`)
  - Filters: Postgres changes by table, schema, row-level IDs

- **Channel Registry**: Ref-counted subscription registry (`lib/realtime/channel-registry.ts`)
  - `acquireChannel(config)` - Get or create channel
  - `releaseChannel()` - Cleanup when no subscribers
  - Memoizes channels to avoid duplicate sockets

- **Typed Payloads**: Channel factories enforce DTOs before hitting React Query

**2. Event Processing**

- **Scheduler Default**: Micro-batched scheduler (`lib/realtime/invalidation-scheduler.ts`)
  - Coalesces events within 50ms debounce window
  - Executes single batch on next animation frame
  - Prevents thrashing during bursts

- **Hybrid Cache Strategy**:
  - **Complete payloads**: `queryClient.setQueryData` (ADR-003 Strategy 4)
  - **Partial payloads**: `queryClient.invalidateQueries` (targeted invalidation)
  - Scheduler helpers: `setDetail`, `mergeList`, `fanOut`

- **Bypass for Low-Frequency**: Set `mode: 'immediate'` for ≤1 event/second

**3. Memory Leak Prevention**

- **Ref-counted Cleanup**: Counter per channel, unsubscribe at zero
- **Effect Boundaries**: `useRealtimeSubscription` hook with `useEffect` cleanup
- **AbortController**: Signal on unmount to cancel pending scheduler tasks
- **Idle Detection**: Purge channels idle for >30s (no subscribers + no events)
- **Testing**: Jest validates channel counts drop to zero, no zombie sockets

**4. Domain Strategy**

- **Domain-Specific by Default**: Each domain has own hook
  - Examples: `usePlayerRealtime`, `useTableAvailabilityRealtime`
  - Encapsulates filters, transforms, cache wiring
  - Matches React Query's domain-based query keys

- **Cross-Domain Workflows**: Listen on originating domain, fanOut to dependents
  - Example: Visit ending → invalidate rating slip queries
  - Use scheduler's `fanOut()` helper
  - Avoid global "everything" channel

**5. Reconnection & Resilience**

- **Status Hooks**: Listen to Supabase `on('system', 'status')`
  - On `CONNECTED`: Replay pending scheduler tasks
  - Selective refetch for domains flagged "requires resync"

- **Backoff & Limits**: 5 rapid reconnections max → surface toast
  - Prevents infinite reconnect loops

- **Visibility Awareness**:
  - Pause scheduler when document hidden >2 minutes
  - Flush queue on visibility regain
  - React Query's `refetchOnReconnect` catches missed deltas

- **Auth Refresh**: Registry exposes `refreshAuth(token)` for session updates

**6. Developer Workflow**

- **Hook Template**: `hooks/shared/use-realtime-channel.ts`
  - Accepts: `channel`, `eventFilter`, `mapPayload`, `handleEvent`
  - Domain READMEs list hooks, channels, cache impact

- **Instrumentation**: Dev builds log lifecycle with `NEXT_PUBLIC_DEBUG_REALTIME=true`

### Implementation Plan (Week 6)

1. Scaffold utilities (registry, scheduler)
2. Create hook template
3. Pilot domains (table availability, player status)
4. Reconnection handling
5. Documentation & training
6. Integration tests (rapid updates, reconnection)

### Rationale

- **Predictable Cache**: Scheduler + query keys minimize redundant refetches
- **Leak Prevention**: Ref-counting avoids "too many listeners" warnings
- **Domain Isolation**: Teams evolve real-time per context without conflicts
- **Resilient UX**: Auto-reconnect + selective refetch after outages

---

## ADR-005: Automated Integrity Enforcement

**Status**: ✅ Accepted (2025-10-13)
**Context**: Phase 6 schema mismatch incident (Loyalty Service)

### Decision

Implement **four-layer integrity enforcement framework**:

### Layer 1: IDE & Editor (Real-time)

- TypeScript Language Server for immediate type checking
- ESLint for bounded context rule enforcement
- Prettier for consistent formatting

**Catches**: 80% of issues immediately during development

### Layer 2: Pre-commit Hooks (Commit-time)

- **Schema verification test** blocks commits with schema drift
- lint-staged for automatic linting and formatting
- Type generation validation after migrations

**Catches**: 15% of issues before code enters repository

### Layer 3: CI/CD Pipeline (PR-time)

- Mandatory schema verification step (cannot be skipped)
- Full type checking across entire codebase
- Comprehensive test suite execution

**Catches**: 4% of issues before code reaches production

### Layer 4: Runtime Guards (Production)

- Service operation wrappers for graceful error handling
- Monitoring and alerting for schema violations
- Structured error reporting

**Catches**: 1% of issues in production, with graceful handling

### Schema Verification Test

**Compile-time Safety**: Leverages TypeScript to verify schema alignment.

```typescript
// ✅ Compiles only if field exists
const validField: keyof PlayerLoyaltyRow = "current_balance";

// ❌ Will NOT compile if field doesn't exist
// @ts-expect-error - should fail
const invalidField: keyof PlayerLoyaltyRow = "points_balance";
```

**Benefits**:

- Zero runtime cost
- Immediate feedback during development
- Documents correct schema in executable code
- Prevents entire classes of bugs

### Mandatory CI/CD Step

```yaml
- name: Schema Verification
  run: npm test schema-verification
  continue-on-error: false # ← Critical: Must pass
```

**Fail-safe**: Even if developers bypass pre-commit hooks (`--no-verify`), CI provides final checkpoint.

### Workflow Example

**Before ADR**:

```bash
# Create migration
npx supabase migration new add_loyalty_fields

# ❌ Forgets to regenerate types
# ❌ Commits stale types
# ❌ CI passes (no checks)
# ❌ Deploys
# ❌ Runtime failure
```

**After ADR**:

```bash
# Create migration
npx supabase migration new add_loyalty_fields

# Commit attempt
git commit -m "feat: add loyalty fields"

# ✅ Pre-commit hook blocks commit
# ✅ Shows: "Run: npm run db:types && npm test schema-verification"

# Developer follows instructions
npm run db:types
npm test schema-verification  # ✅ Passes

# Commit succeeds
git commit -m "feat: add loyalty fields"

# ✅ CI validates
# ✅ Deploys safely
```

### Implementation Status

**Phase 1: Foundation** ✅ Completed

- [x] Schema verification test (`__tests__/schema-verification.test.ts`)
- [x] CI/CD integration (`.github/workflows/ci.yml`)
- [x] Project standards updated (`CLAUDE.md`)
- [x] Framework documented (`docs/integrity/INTEGRITY_FRAMEWORK.md`)

**Phase 2: Pre-commit** ⏳ In Progress

- [ ] Pre-commit hook (`.husky/pre-commit`)
- [ ] Test with sample changes
- [ ] Measure false positive rate

**Phase 3: Enhanced Coverage** 📋 Future

- [ ] Service boundary validation
- [ ] Import restriction enforcement
- [ ] Bounded context compliance checks
- [ ] API contract verification

### Metrics

| Metric                   | Target       | Current     |
| ------------------------ | ------------ | ----------- |
| Schema drift incidents   | 0 per sprint | 0           |
| Pre-commit block rate    | <10%         | ~5%         |
| False positive rate      | <5%          | ~2%         |
| Time to detect violation | <1 minute    | Immediate   |
| Time to fix violation    | <15 minutes  | ~10 minutes |

### Benefits

✅ **Prevent Schema Drift**: 99% caught before production
✅ **Fast Feedback**: Immediate detection during development
✅ **Living Documentation**: Test documents correct schema
✅ **Reduced Incidents**: Eliminates class of schema errors
✅ **Developer Confidence**: Safe refactoring with guardrails

### Trade-offs

⚠️ **Additional Step**: Must run `npm run db:types` after migrations
⚠️ **Pre-commit Latency**: +2-5 seconds for schema changes
⚠️ **CI Duration**: +10 seconds to pipeline
⚠️ **Maintenance**: Test must be updated for new tables

---

## ADR-000: SRM Canonical Contract (Matrix as Schema Contract)

**Status**: ✅ Accepted (2025-10-21)
**Context**: Live DB schema drifted from design docs (Prisma-era casing, missing FKs)

### Decision

**The Service Responsibility Matrix (SRM) is the canonical contract. The database schema MUST mirror the SRM.**

### Key Principles

1. **Matrix-First Flow**: SRM change → migration SQL → regenerated types → services → tests → release
2. **Naming**: All identifiers are `lower_snake_case`. No quoted CamelCase anywhere
3. **Identifiers**: All PKs/FKs are `uuid default gen_random_uuid()`. Text IDs allowed as business keys with unique constraints
4. **JSON Usage**: JSON for extensible metadata only. Anything referenced by FKs, RLS, analytics, or constraints is a first-class column
5. **Ownership**: Records depending on casino policy MUST carry `casino_id`. Financial records store `gaming_day`
6. **RLS**: Row-level security policies derive from SRM ownership rules, ship with each schema change. No permissive catch-alls in production
7. **Loyalty ↔ Rating Slip**: Single source of truth = Loyalty. `rating_slip` does not cache points unless explicitly reintroduced by SRM

### Contract Change Policy

- **Additive**: Safe - add to SRM → generate ALTER SQL → regenerate types
- **Renames**: Safe with map - SRM includes RENAMES table → migration uses ALTER...RENAME
- **Tightening Constraints**: Migration includes backfill then sets constraint
- **Removals**: Breaking - mark DEPRECATED with EOL date → drop one release later

### CI Gates

1. Matrix ↔ Schema Diff (tables/columns/FKs match SRM)
2. Types Regeneration Required (fail if not updated when migrations change)
3. RLS Lint (deny `USING (true)`, verify ownership keys)
4. Identifier Lint (fail on quoted identifiers/CamelCase)

### References

- Full contract: `docs/bounded-context-integrity/phase-D/srm-patch/SERVICE_RESPONSIBILITY_MATRIX.md`
- Also: `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md`

---

## ADR-006: RatingSlip Financial Field Removal

**Status**: ✅ Accepted (2025-10-19)
**Context**: Monetary truth must live in `player_financial_transaction` (PFT) for auditability, reversals, RLS isolation

### Decision

Remove `cash_in`, `chips_brought`, `chips_taken` from `ratingslip`. Provide backward-compatible view; add targeted indexes to PFT. Only materialize if p95 > 100ms.

### Implementation

**Views**:
```sql
CREATE VIEW visit_financial_summary AS
SELECT visit_id,
  COALESCE(SUM(cash_in), 0) AS total_cash_in,
  COALESCE(SUM(chips_brought), 0) AS total_chips_brought,
  COALESCE(SUM(chips_taken), 0) AS total_chips_taken
FROM player_financial_transaction
GROUP BY visit_id;

CREATE VIEW ratingslip_with_financials AS
SELECT r.*, vfs.total_cash_in AS cash_in,
  vfs.total_chips_brought AS chips_brought,
  vfs.total_chips_taken AS chips_taken
FROM ratingslip r
LEFT JOIN visit_financial_summary vfs ON vfs.visit_id = r.visit_id;
```

**Indexes**:
```sql
CREATE INDEX idx_pft_visit_id ON player_financial_transaction(visit_id);
CREATE INDEX idx_pft_player_id ON player_financial_transaction(player_id);
CREATE INDEX idx_pft_rating_slip_id ON player_financial_transaction(rating_slip_id);
```

**Migration Order**: Create views & indexes → update readers → remove columns from ratingslip → keep compatibility view through deprecation cycle

### Rationale

- Single source of truth for financial data
- RLS isolation at transaction level
- Audit trail preserved
- Backward compatibility maintained

---

## ADR-007: API Surface Catalogue & OpenAPI Contract

**Status**: ✅ Accepted (2025-10-25)
**Context**: API contract management across teams requires stable, versioned HTTP description

### Decision

1. **Canonical Catalogue**: `25-api-data/API_SURFACE_MVP.md` is human-readable source of truth for all MVP endpoints (paths, methods, DTOs, error codes, RBAC, rate limits, observability)
2. **OpenAPI Parity**: `25-api-data/api-surface.openapi.yaml` must remain in lockstep with catalogue. PRs that touch either must update both
3. **Roadmap & SDLC Gate**: Phase 2 (Architecture & Security) must show updated API catalogue/OpenAPI diff before slices begin
4. **Link to SRM**: Endpoint ownership, DTO shapes, idempotency keys must align with SRM (ADR-000)

### Rationale

- Single place to check HTTP contract
- OpenAPI drives client generation, mocks, contract tests
- Explicit ADR reference ties HTTP surface back to SRM and Balanced Architecture

### References

- `25-api-data/API_SURFACE_MVP.md`
- `25-api-data/api-surface.openapi.yaml`
- `70-governance/SERVICE_TEMPLATE.md`

---

## ADR-008: Service Layer Architecture Diagram & Template

**Status**: ✅ Accepted (2025-10-25)
**Context**: Uniform service structure prevents ad-hoc hierarchies and manual DTOs

### Decision

1. **Canonical Template**: `70-governance/SERVICE_TEMPLATE.md` (v1.2) is required architecture for every domain service. Factories expose explicit interfaces, DTOs derive from generated Supabase types, shared concerns live in `services/shared`
2. **Diagram Requirement**: Architecture & Security phase of SDLC must include updated service-layer diagram (Mermaid) showing Route Handler/Server Action → Service → Supabase flow per context
3. **Compliance Gate**: Before declaring slice "done":
   - DTOs follow canonical patterns
   - Services expose explicit interfaces from template
   - No cross-context imports outside published DTOs/views
4. **Evolution via ADR**: Changes to service layering require updating this ADR (or successor)

### Rationale

- Consistency keeps React Query hooks, Server Actions, Supabase queries predictable
- SRM Alignment: services mirror schema ownership cleanly
- DX: Clear directories/interfaces help tooling and reduce onboarding cost

### References

- `70-governance/SERVICE_TEMPLATE.md`
- `25-api-data/DTO_CANONICAL_STANDARD.md`

---

## ADR-009: Balanced Architecture Intake & Transport Gate

**Status**: ✅ Accepted (2025-10-25)
**Context**: Work classification (vertical/horizontal/hybrid/service-only) and transport choice (Route Handler vs Server Action) needed explicit gates

### Decision

1. **Intake Card Required**: Every backlog item/PRD slice must include Balanced Architecture intake card answers before entering design:
   - Scope (# bounded contexts per SRM)
   - User-facing vs infrastructure
   - Slice classification (Vertical/Horizontal/Hybrid/Service)
   - Transport (Route Handler vs Server Action) + rationale
   - Estimated timeline from quick reference table
2. **Roadmap Gate**: Phase 1 (Inception/PRD) cannot close without intake cards for scoped MVP slices. Phase 2 re-validates classification
3. **Code Review Checklist**: Reviewers confirm implementation matches declared classification and transport

### Transport Rule

- **React Query** → Route Handler (JSON + ServiceHttpResult)
- **Forms/RSC** → Server Action (wrapped with `withServerAction`)

### Rationale

- Predictable scope keeps MVP vertical-first unless trigger justifies horizontal/infra
- Transport consistency avoids late rewrites
- Traceability: intake cards document decisions for later audit

### References

- `20-architecture/BALANCED_ARCHITECTURE_QUICK.md`

---

## ADR-010: DTO & Service Compliance Gate

**Status**: ✅ Accepted (2025-10-25)
**Context**: Manual DTO interfaces and ad-hoc service factories caused schema drift despite standards

### Decision

1. **Architecture Phase Gate**: Phase 2 of SDLC must include DTO/service audit for every affected domain:
   - DTOs derive from `Database['public']['Tables'][…]` with `type` aliases
   - Service factories export explicit interfaces (no `ReturnType<typeof createService>`)
   - Shared helpers (operation wrapper, ServiceResult, error map) used instead of custom per-domain equivalents
2. **Per-Slice Definition of Done**:
   - Supabase types regenerated after migrations
   - DTO lint/pre-commit checks pass
   - Service files follow template layout (dto.ts, selects.ts, crud.ts, index.ts)
   - Compliance checkbox referencing this ADR marked in PR template
3. **CI Hook (Future)**: Fail when manual `interface .*DTO` definitions exist under `services/**` or service factories export implicit types

### Rationale

- Schema safety: canonical DTOs track schema changes automatically
- Consistency: explicit interfaces reduce code review friction
- Traceability: SDLC documents and audits confirm compliance quickly

### References

- `25-api-data/DTO_CANONICAL_STANDARD.md`
- `70-governance/SERVICE_TEMPLATE.md`

---

## ADR-011: Over-Engineering Guardrail (OE-01 Enforcement)

**Status**: ✅ Accepted (2025-10-25)
**Context**: Infra-heavy changes landed without proving triggers from OE-01 guardrail

### Decision

1. **Trigger Proof Required**: Any work item introducing new infra/abstractions must document OE-01 checklist and satisfied trigger (per §6) before implementation. If no trigger exists, work must be descoped or Mini-ADR raised
2. **PR Template Hook**: PRs touching infrastructure/shared layers must answer:
   - Which OE-01 trigger applies?
   - Link to supporting evidence (incident, metric, mandate)
   - Link to Mini-ADR if >150 LOC infra change or multiple triggers violated
3. **Roadmap Gate**: During backlog grooming and Stabilization, team reviews OE-01 compliance to ensure MVP remains lean

### OE-01 Triggers (Valid Complexity Justifiers)

- Second consumer needs abstraction
- SLO breach requires optimization
- Compliance mandate requires audit trail
- Horizontal scale requires coordination

### Rationale

- Scope control: keeps MVP focused on vertical value delivery
- Auditability: explicit linkage between work and triggers
- Consistency: aligns with Balanced Architecture intake (ADR-009) and DTO/service gates

### References

- `70-governance/OVER_ENGINEERING_GUARDRAIL.md`

---

## Decision Summary Matrix

| ADR                         | Status      | Validated                  | Impact                    |
| --------------------------- | ----------- | -------------------------- | ------------------------- |
| ADR-000: SRM Contract       | ✅ Accepted | ✅ Foundational            | Schema & naming standards |
| ADR-001: Dual Types         | ✅ Accepted | ✅ 100%                    | Development workflow      |
| ADR-002: Test Location      | ⚠️ Proposed | ⚠️ 67% (migration pending) | Test organization         |
| ADR-003: State Management   | ✅ Accepted | ✅ 100% (32 tests)         | Data flow architecture    |
| ADR-004: Real-Time          | ✅ Accepted | ✅ Week 6 complete         | Live data updates         |
| ADR-005: Integrity          | ✅ Accepted | ✅ Phase 1 complete        | Quality enforcement       |
| ADR-006: RatingSlip Finance | ✅ Accepted | ✅ Implemented             | Financial data separation |
| ADR-007: API Catalogue      | ✅ Accepted | ✅ Active                  | API contract management   |
| ADR-008: Service Template   | ✅ Accepted | ✅ Active                  | Service standards         |
| ADR-009: Architecture Intake| ✅ Accepted | ✅ Active                  | SDLC gates                |
| ADR-010: DTO Compliance     | ✅ Accepted | ✅ Active                  | Code compliance           |
| ADR-011: OE Guardrail       | ✅ Accepted | ✅ Active                  | Complexity control        |

---

## Quick Checklist

Before implementing any feature, verify compliance with:

- [ ] **ADR-000**: Schema changes must update SRM first, use `lower_snake_case` naming
- [ ] **ADR-001**: Use local types in services, regenerate after migrations
- [ ] **ADR-002**: Place tests in `__tests__/services/{domain}/`
- [ ] **ADR-003**: Server data in React Query, UI state in Zustand
- [ ] **ADR-004**: Follow domain channel pattern (when implementing real-time)
- [ ] **ADR-005**: Run schema verification test before committing schema changes
- [ ] **ADR-006**: Financial data lives in `player_financial_transaction`, not `ratingslip`
- [ ] **ADR-007**: Update API catalogue + OpenAPI together for any endpoint changes
- [ ] **ADR-008**: Follow service template structure with explicit interfaces
- [ ] **ADR-009**: Complete Balanced Architecture intake card before implementation
- [ ] **ADR-010**: DTOs derive from generated types, no manual interfaces
- [ ] **ADR-011**: Prove OE-01 trigger before adding infrastructure/abstractions

---

## References

**Full ADRs**:

- `docs/80-adrs/ADR-000-matrix-as-contract.md`
- `docs/80-adrs/ADR-001-dual-database-type-strategy.md`
- `docs/80-adrs/ADR-002-test-location-standard.md`
- `docs/80-adrs/ADR-003-state-management-strategy.md`
- `docs/80-adrs/ADR-004-real-time-strategy.md`
- `docs/80-adrs/ADR-005-integrity-enforcement.md`
- `docs/80-adrs/ADR-006-rating-slip-field-removal.md`
- `docs/80-adrs/ADR-007-api-surface-catalogue.md`
- `docs/80-adrs/ADR-008-service-layer-architecture.md`
- `docs/80-adrs/ADR-009-balanced-architecture-intake.md`
- `docs/80-adrs/ADR-010-dto-compliance-gate.md`
- `docs/80-adrs/ADR-011-over-engineering-guardrail.md`

**Related Documentation**:

- `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md`
- `docs/20-architecture/BALANCED_ARCHITECTURE_QUICK.md`
- `docs/25-api-data/API_SURFACE_MVP.md`
- `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- `docs/70-governance/SERVICE_TEMPLATE.md`
- `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`
- `docs/integrity/INTEGRITY_FRAMEWORK.md`

**Auto-Load**: This file loads automatically with `.claude/config.yml`

---

**Version**: 2.0.0
**Lines**: ~1040 (expanded from ~810 to include all 12 ADRs)
**Next Update**: When new ADRs are created or existing ADRs are updated
