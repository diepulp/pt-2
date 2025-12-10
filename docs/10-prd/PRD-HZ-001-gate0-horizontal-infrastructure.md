# PRD-HZ-001 — GATE-0 Horizontal Infrastructure

## 1. Overview
- **Owner:** Architecture / Backend Lead
- **Status:** Draft
- **Summary:** Establish the foundational horizontal infrastructure required before any vertical service slices can be deployed. This includes the `withServerAction` middleware wrapper, `ServiceResult<T>` pattern, domain error taxonomy, and React Query client configuration. Without GATE-0, no API routes can be safely deployed, as all transport, error handling, and caching patterns depend on this foundation. Targets single-casino pilot readiness.

## 2. Problem & Goals

### 2.1 Problem
The PT-2 codebase has defined architectural patterns (SLAD, SRM, EDGE_TRANSPORT_POLICY) but lacks the concrete horizontal infrastructure to implement them. Currently:
- No `withServerAction` wrapper exists to enforce the middleware chain (auth → RLS → idempotency → audit → tracing)
- Services have no standardized `ServiceResult<T>` pattern, leading to inconsistent error handling
- Postgres/PostgREST error codes leak directly to the UI, exposing implementation details
- No centralized React Query configuration exists for tiered caching and mutation patterns
- Routes cannot be safely deployed until this infrastructure exists

This creates a "chicken-and-egg" blocker: vertical slices (PRD-000 CasinoService, PRD-002 TableContext, etc.) cannot be deployed without horizontal infrastructure, but the infrastructure hasn't been built.

### 2.2 Goals
- A single call to `withServerAction(handler)` applies the complete middleware chain (auth, RLS, idempotency, audit, tracing) to any route handler or server action
- All service methods return `ServiceResult<T>` with typed success/error states and correlation IDs
- Postgres error codes are mapped to domain-specific error codes before reaching the transport layer
- Domain error codes are mapped to HTTP status codes at the transport boundary via `ServiceHttpResult<T>`
- React Query client is configured with domain-tiered stale/cache times and standardized mutation helpers

### 2.3 Non-Goals
- Implementing specific bounded context services (covered by PRD-000, PRD-002, PRD-003, etc.)
- Rate limiting (deferred to Phase 1+, `withRateLimit` middleware)
- Real-time channel infrastructure (covered in separate vertical slices)
- UI components (covered by downstream PRDs)
- Full observability/SLO dashboards (covered by OBSERVABILITY_SPEC.md, separate effort)

## 3. Users & Use Cases
- **Primary users:** Backend developers implementing services

**Top Jobs:**
- As a backend developer, I need a `withServerAction` wrapper so that I can enforce auth, RLS, idempotency, and audit for every route without manual boilerplate.
- As a backend developer, I need `ServiceResult<T>` types so that I can return typed success/error states from services without ad-hoc error handling.
- As a backend developer, I need error mapping utilities so that Postgres errors are transformed to domain codes before reaching the UI.
- As a frontend developer, I need a configured React Query client so that I can use standardized mutation/query patterns with proper caching.

## 4. Scope & Feature List

**Transport Layer (`withServerAction` wrapper):**
- `withServerAction` composable wrapper in `lib/server-actions/wrapper.ts`
- `withAuth` middleware: extract user from session, validate staff role, casino membership
- `withRLS` middleware: execute `SET LOCAL app.casino_id` and `SET LOCAL app.actor_id`
- `withIdempotency` middleware: enforce `x-idempotency-key` header for mutations
- `withAudit` middleware: write `audit_log` row with correlation ID, set `application_name`
- `withTracing` middleware: emit spans, map domain errors to HTTP status codes

**Service Result Pattern:**
- `ServiceResult<T>` type: `{ ok: true, data: T } | { ok: false, error: DomainError }`
- `ServiceHttpResult<T>` type: HTTP-friendly envelope with status codes, timestamps
- Transformation helper: `toServiceHttpResponse<T>(result: ServiceResult<T>): ServiceHttpResult<T>`
- Response helpers: `successResponse<T>()`, `errorResponse()`

**Error Taxonomy:**
- `DomainError` base class with `code`, `message`, `metadata`, `statusCode`
- Postgres → Domain error mapper: `mapDatabaseError()`
- Domain → HTTP status mapper: `mapToHttpStatus()`
- Per-domain error catalogs: `lib/errors/domains/*.ts`

**React Query Infrastructure:**
- Query client configuration in `lib/query/client.ts`
- Tiered stale times per domain (reference data vs. transactional)
- Standard mutation wrapper with error handling
- Shared `fetchJSON` helper with `ServiceHttpResult<T>` unwrapping

**Shared Utilities:**
- Correlation ID generator/propagator: `lib/utils/correlation.ts`
- Zod schema helpers for common validation patterns

## 5. Requirements

### 5.1 Functional Requirements
- `withServerAction` must compose middleware in order: auth → RLS → idempotency → audit → tracing
- RLS context injection must execute `SET LOCAL app.casino_id` and `SET LOCAL app.actor_id` before any service call
- Idempotency middleware must require `x-idempotency-key` header for all mutations and reject without it (400 Bad Request)
- Audit middleware must write to `audit_log` table with `correlation_id`, `actor_id`, `casino_id`, `domain`, `action`
- Error mapper must transform Postgres error codes (23505, 23503, PGRST116) to domain codes (UNIQUE_VIOLATION, FOREIGN_KEY_VIOLATION, NOT_FOUND)
- `ServiceResult<T>` must include `requestId`, `timestamp`, and `durationMs` for observability
- React Query client must use `staleTime: 5 * 60 * 1000` (5 min) for reference data, `staleTime: 30 * 1000` (30s) for transactional data

### 5.2 Non-Functional Requirements
- Middleware chain overhead must be < 10ms for the happy path (excluding actual DB/service time)
- Error mapping must be exhaustive (no Postgres error codes leak to client)
- All middleware must be unit-testable in isolation (pure `(ctx, next) => Promise<Result>` signature)

> Architecture details: see `docs/20-architecture/EDGE_TRANSPORT_POLICY.md` and `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`

## 6. UX / Flow Overview
1. Developer imports `withServerAction` in a Route Handler
2. Wraps their handler function with `withServerAction(handler)`
3. Handler receives `context` with `supabase`, `actorId`, `casinoId`, `correlationId`
4. Handler calls service methods that return `ServiceResult<T>`
5. Handler uses `toServiceHttpResponse()` to transform to HTTP response
6. Errors are automatically mapped and logged

**Example Route Handler:**
```typescript
// app/api/v1/players/route.ts
import { withServerAction } from '@/lib/server-actions/wrapper';
import { toServiceHttpResponse } from '@/lib/http/service-response';
import { createPlayerService } from '@/services/player';

export const POST = withServerAction(async (context, request) => {
  const body = await request.json();
  const service = createPlayerService(context.supabase);
  const result = await service.create(body);
  return toServiceHttpResponse(result);
});
```

## 7. Dependencies & Risks

### 7.1 Dependencies
- Supabase Auth configured with `staff.user_id` linkage (exists: migration `20251110224223_staff_authentication_upgrade.sql`)
- `audit_log` table schema (exists)
- `set_rls_context()` RPC for transaction-wrapped SET LOCAL (exists: migration `20251209183033_adr015_rls_context_rpc.sql` - **ADR-015 compliant**)
- JWT `app_metadata` with `casino_id` for fallback (exists: migration `20251210001858_adr015_backfill_jwt_claims.sql` - **ADR-015 Phase 2**)
- RLS context interface in `lib/supabase/rls-context.ts` (exists per SEC-001, **updated for ADR-015**)

### 7.2 Risks & Open Questions
- **Risk:** Middleware chain becomes too complex — Mitigated by 100 LOC limit per middleware, isolated unit tests
- **Risk:** Performance overhead from middleware — Mitigated by measuring overhead, target < 10ms
- **Open:** Should `withRateLimit` be included in GATE-0? — Decision: Deferred to Phase 1 (not blocking vertical slices)
- **Open:** Idempotency key storage location — Decision: Stored in owning service's table (e.g., `loyalty_ledger.idempotency_key`), not a central table

## 8. Definition of Done (DoD)
The release is considered **Done** when:

**Functionality**
- [ ] `withServerAction` wrapper composes all middleware (auth, RLS, idempotency, audit, tracing)
- [ ] At least one Route Handler uses `withServerAction` and returns `ServiceHttpResult<T>`
- [ ] Idempotency middleware rejects mutations without `x-idempotency-key` header
- [ ] Error mapper transforms all common Postgres codes (23505, 23503, 23514, PGRST116) to domain codes

**Data & Integrity**
- [ ] RLS context (`app.casino_id`, `app.actor_id`) is correctly injected via `SET LOCAL`
- [ ] Audit log rows are written for wrapped mutations with correct correlation IDs
- [ ] No Postgres error codes visible in API responses

**Security & Access**
- [ ] `withAuth` rejects unauthenticated requests with 401
- [ ] `withRLS` enforces casino scoping (requests for wrong casino fail with 403)
- [ ] Correlation IDs do not expose sensitive information

**Testing**
- [ ] Unit test for each middleware (auth, RLS, idempotency, audit, tracing)
- [ ] Integration test: full middleware chain with real Supabase
- [ ] One E2E test: create entity via wrapped route, verify audit log

**Operational Readiness**
- [ ] Correlation IDs propagate from request header to audit log to DB session
- [ ] Error responses include `requestId` for debugging
- [ ] Middleware timing logged for performance monitoring

**Documentation**
- [ ] `lib/server-actions/README.md` with usage examples
- [ ] Error code catalog documented in `lib/errors/README.md`

## 9. Related Documents
- Vision / Strategy: `docs/00-vision/VIS-001-VISION-AND-SCOPE.md`
- Architecture / SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- Service Layer Architecture (SLAD): `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- **Edge Transport Policy**: `docs/20-architecture/EDGE_TRANSPORT_POLICY.md`
- **Server Actions Architecture**: `docs/70-governance/SERVER_ACTIONS_ARCHITECTURE.md`
- API Surface: `docs/25-api-data/API_SURFACE_MVP.md`
- Security / RLS: `docs/30-security/SEC-001-rls-policy-matrix.md`
- Observability: `docs/50-ops/OBSERVABILITY_SPEC.md`
- QA Standards: `docs/40-quality/QA-001-service-testing-strategy.md`
- Schema / Types: `types/database.types.ts`
- **MVP Roadmap**: `docs/20-architecture/MVP-ROADMAP.md` (Phase 0)
- Downstream PRDs blocked by GATE-0: PRD-000 (CasinoService), PRD-002 (TableContext), PRD-003 (Player/Visit), PRD-004 (Loyalty), PRD-005 (MTL)

---

## Implementation Notes

### File Structure (Target)

```
lib/
├── server-actions/
│   ├── wrapper.ts           # withServerAction composable
│   ├── middleware/
│   │   ├── auth.ts          # withAuth
│   │   ├── rls.ts           # withRLS
│   │   ├── idempotency.ts   # withIdempotency
│   │   ├── audit.ts         # withAudit
│   │   └── tracing.ts       # withTracing
│   └── README.md
├── types/
│   ├── service-result.ts    # ServiceResult<T>, ServiceHttpResult<T>
│   └── index.ts             # Re-exports
├── errors/
│   ├── domain-error.ts      # DomainError base class
│   ├── error-map.ts         # Postgres → Domain mapper
│   ├── http-map.ts          # Domain → HTTP mapper
│   ├── domains/             # Per-domain error catalogs
│   │   ├── common.ts
│   │   ├── loyalty.ts
│   │   ├── finance.ts
│   │   └── ...
│   └── README.md
├── http/
│   ├── service-response.ts  # toServiceHttpResponse(), successResponse(), errorResponse()
│   └── fetch-json.ts        # Shared fetch helper
├── query/
│   ├── client.ts            # QueryClient configuration
│   └── mutations.ts         # Standard mutation helpers
└── utils/
    └── correlation.ts       # Correlation ID utilities
```

### Critical Path

```
GATE-0 Components (All P0):
├── ServiceResult<T> types          ← Foundation, define first
├── DomainError + error mappers     ← Depends on ServiceResult
├── withAuth middleware             ← Independent
├── withRLS middleware              ← Independent
├── withIdempotency middleware      ← Independent
├── withAudit middleware            ← Depends on correlation utils
├── withTracing middleware          ← Depends on error mappers
├── withServerAction compositor     ← Depends on all middleware
└── React Query client config       ← Can be parallel
```

### Unblocks

Once GATE-0 is complete:
- PRD-000 CasinoService can implement routes with `withServerAction`
- PRD-002 TableContextService routes can be deployed
- PRD-003 PlayerService, VisitService routes can be deployed
- All downstream services have standardized patterns
