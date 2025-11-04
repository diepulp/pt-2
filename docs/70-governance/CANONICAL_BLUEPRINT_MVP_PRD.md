# PT-V2 ARCHITECTURE PRD

## 1. Objective & Scope

- Deliver a clean Casino Tracker Application which uses proven patterns and eliminates rebuild triggers while enforcing KISS and YAGNI principles.
- MVP surface: Player, Visit, Rating Slip, Table Context, Casino, MTL (compliance), Staff/Auth.

## 2. Guiding Principles

- **Single Source of Truth**: One Supabase schema, one generated type export (`database.types.ts`).
- **Vertical Slice Delivery**: Every feature spans DB → service → API → UI with tests before expansion.
- **Security First**: RLS enabled by default, JWT claim helpers versioned with migrations, audit logging mandatory.
- **Guardrails Upfront**: CI gates for lint, type-check, tests, schema→type regeneration, Lighthouse budgets.
- **No Anti-Patterns**: Ban dual DB clients, React Query storming, business logic in Zustand stores, `Database = any` shims.

## 3. System Requirements & Patterns to Replicate

### 3.1 Data & Supabase Integration

- Seed the new project with the sanitized baseline migration (`supabase/migrations/20250828011313_init_corrected.sql`).
- Enforce forward-only migrations with timestamped filenames; migrations must run through CI validation.
- Provide shared Supabase client factories for browser/server usage (`lib/supabase/client.ts`, `lib/supabase/server.ts`). No client instantiation inside UI or stores.
- Enable RLS on core tables (player, ratingslip, visit, mtl_entry, casino, gamingtable) using policy templates from `mtl-comprehensive-rls-policies.sql`.
- Configure audit logging triggers mirroring the `AuditLog` pattern in the baseline migration.

### 3.2 Type System

- Generate a single canonical `database.types.ts` from the Supabase schema and check it into the repo.
- Treat `database.types.ts` as the only source of truth
- Place derived DTO/view/helper modules under `types/dto`, `types/view`, and `types/helpers`; they must use `Pick`, `Omit`, mapped, or conditional types that reference the exported `Database` type rather than re-declaring table shapes.
- Shared helpers such as `ServiceResult`, `DatabaseRow`, `DatabaseInsert`, and `DatabaseUpdate` reside in `types/helpers` and likewise reference the canonical definitions.
- Build tooling regenerates `database.types.ts` after every schema change; CI fails when the committed file is stale or an alternative schema definition appears.
- Schema rebuilds regenerate the canonical file in place—no parallel type graphs or "rebuilt" directories may be introduced.
- Forward-only SQL migrations → regenerate types → commit diff → typecheck.
- Any schema correction = new migration + new generated types (no in-place manual edits).
  **Acceptance Criteria**
- Single database.types.ts in repo.
- CI fails on stale types or detection of alternate schema/handwritten table types.
- All DTO/View/Helper files compile solely against Database.

### 3.3 Service Layer

#### Type System Standards

- **Explicit Interface Contracts**: Every service factory MUST declare an explicit interface defining all public methods with complete type signatures. Return this interface from the factory function.

  ```typescript
  export interface PlayerService {
    getById(id: string): Promise<ServiceResult<PlayerDTO>>;
    searchPlayers(query: string): Promise<ServiceResult<PlayerDTO[]>>;
  }

  export function createPlayerService(
    supabase: SupabaseClient<Database>,
  ): PlayerService {
    return {
      /* implementation */
    };
  }
  ```

- **Ban `ReturnType` Inference**: Never use `ReturnType<typeof createXService>` for exported service types. Always export the explicit interface: `export type PlayerService = IPlayerService`.
- **Typed Dependencies**: Factory functions MUST type the `supabase` parameter as `SupabaseClient<Database>`. Never use `any`.
- **No Object Spread Without Types**: When composing services via object spread, the factory MUST declare an explicit return type interface that describes the final shape. This prevents silent method overwrites.

  ```typescript
  // ✓ Correct
  export interface CasinoService
    extends CasinoCrudService,
      CasinoTablesService {
    // Explicit combined interface
  }

  export function createCasinoService(
    supabase: SupabaseClient<Database>,
  ): CasinoService {
    return { ...crud, ...tables };
  }

  // ✗ Wrong - untyped spread
  export function createCasinoService(supabase: any) {
    return { ...crud, ...tables };
  }
  ```

- **Consistent Export Pattern**: Export both the factory function and the service type. Name them consistently: `createXService` → `XService` interface → `export type XService`.

#### Service Architecture

- Keep the functional module pattern that works today: export focused factories such as `createPlayerCrudService` or `createVisitBusinessService` that return plain functions and wrap Supabase calls with `executeOperation` for consistent `ServiceResult` handling (`services/player/crud.ts`, `services/shared/operation-wrapper.ts`).
- Centralize helpers instead of re-declaring them. `ServiceResult`, `generateRequestId`, and other utilities live in `services/shared` so domain modules do not recreate their own success/error builders.
- All domain logic must compose from canonical database types; prohibit hand-written table contracts. Use DTOs in `types/domains/*` for inputs/outputs and map them explicitly.
- Drop class-based base abstractions and the over-engineered `ServiceFactory`; V2 services are plain factories or functional modules without internal caching/metrics side effects (`services/base.service.ts`, `services/service.factory.ts`). Dependency injection stays explicit at the call site.
- Define a typed error catalogue per domain (for example, `enum PlayerServiceError { DuplicateEmail, NotFound, ValidationFailed }`) and return those codes inside the `ServiceResult`. Map the enum to HTTP responses and UI messaging once so consumers never parse strings.
- Preserve layering: CRUD modules handle persistence, `business.ts` orchestrates workflows, `transforms.ts` keeps mapping logic, and `ui/*` files expose view adapters. Document when data crosses between layers and add unit tests per public function.
- Implement validation using Zod schemas in `validation.ts` modules for each domain. Define reusable schemas for DTOs, input validation, and business rule enforcement. All service operations must validate inputs using `schema.safeParse()` before processing. Example schemas: `casinoCreateSchema`, `ratingSlipUpdateSchema`, `openTableSchema` with comprehensive field-level constraints and error messages.
- Instantiate Supabase clients via `@supabase/ssr` helpers (`createServerClient`, `createBrowserClient`) so cookie refresh and auth follow the documented flow (`supabase/ssr`, design.md). Inject the client into each service factory; the service itself never constructs a client or touches cookies.
- When an operation spans multiple tables or must be atomic, wrap it in a Postgres function or run it through a dedicated RPC/transaction. Use Supavisor transaction-mode connections for short-lived API work and session mode for long-running jobs per Supabase guidance (`postgres://…pooler.supabase.com:6543`).
- Document concurrency expectations (optimistic vs pessimistic) in each business module. Example: rating-slip status transitions check the current status in the same call; table-context lifecycle updates rely on `update … where status = 'OPEN'` to prevent double-closes.

### 3.4 State Management

- React Query is the sole remote data cache; defaults derive from `lib/query-client.ts` (non-zero `staleTime`, `refetchOnWindowFocus: false`).
- Zustand restricted to ephemeral UI state (selection, modal visibility) as demonstrated in `store/player-store.ts`, **ref is available upon request**.
- React Query hooks (`hooks/service-layer/use-service-query.ts`) become templates for entity/list/mutation operations; overrides for `staleTime: 0` require explicit approval.
- Queries declare sane `staleTime`/`gcTime` per domain; zero-stale configs require explicit real-time justification and documented invalidation strategy.
- Query keys follow the `[domain-scope, entity, identifier]` pattern (`['visit', 'list', casinoId]`) to keep invalidation predictable; helper modules expose canonical keys per domain.
- Mutations perform cache updates via `invalidateQueries` or targeted `setQueryData`; optimistic updates stay opt-in and encapsulated in domain helpers.
- All React Query hooks wrap service-layer DTOs—never raw Supabase rows—and surface consistent loading/error contracts for UI components.
- Any advanced offline/optimistic behaviour must sit behind domain-specific services with explicit acceptance criteria and integration tests—not global managers.

### 3.5 Server Actions & Data Fetching

- All mutations and privileged reads run through server actions wrapped by `withServerActionWrapper`; actions call Supabase via `createClient()` and return DTOs mapped in the service layer.
- Server actions emit structured telemetry (shared logger/instrumentation helpers only—no `console.*` in production) with duration, request ID, and normalized error codes from the `ServiceResult` utilities.
- Default page data loads in Server Components; React Query hooks hydrate from server-provided DTOs or call server actions via fetcher utilities instead of instantiating Supabase clients in the browser.
- Client-side Supabase access (`createBrowserComponentClient`) is reserved for real-time subscriptions or short-lived optimistic flows; wrap usage in documented helpers (`useSupabaseChannel`, scheduler utilities) and never expose raw table queries from the browser.
- Mutating server actions document their cache strategy and invoke `revalidatePath`/`revalidateTag` accordingly, with integration tests asserting invalidation behaviour.
  **Acceptance Criteria**
- Domain React Query hooks do not new up Supabase clients; they consume server actions or Server Component props.
- Server action logs appear in structured telemetry pipelines with no stray `console` output.

### 3.6 Real-Time & Invalidations

- Provide a lightweight `useSupabaseChannel` (or equivalent) helper that wraps `createBrowserComponentClient().channel`, handles subscribe/unsubscribe, and exposes typed payloads derived from `Database`.
- Real-time hooks batch React Query invalidations using the scheduler pattern from `hooks/table-context/useTableContextRealtime.ts`; every subscription must register cleanup on unmount.
- Domain hooks manage their own channel lifecycle; avoid cross-cutting singletons such as connection pools, optimistic-update managers, or offline queues under `services/real-time/*`.
- Logging and metrics for live data stay inside dev tooling; production hooks should be silent and rely on React Query retries for resilience.
- Any advanced offline/optimistic behaviour must sit behind domain-specific services with explicit acceptance criteria and integration tests—not global managers.

### 3.7 UI Composition

- Preserve Next.js App Router organization (`app/`), with route-level code splitting and streaming.
- Import HeroUI/Radix components individually; heavy modals/icons load via dynamic imports per `bundle-analysis-report.md` findings.
- Server Components perform data fetching; Client Components accept typed DTO props.

### 3.8 Security & Compliance

- Implement Staff/Auth role matrix (DEALER, SUPERVISOR, PIT_BOSS, AUDITOR) from JWT functions in migrations.
- Enforce least-privilege RLS policies and audit logging for critical actions.
- MTL domain remains first-class: reuse compliance reporting patterns (`services/mtl/reports.ts`).

### 3.9 Performance & Tooling

- Performance budgets: LCP ≤ 2.5s, TBT ≤ 200 ms, initial JS ≤ 250 KB; automate Lighthouse smoke in CI.
- Use webpack builds; disable Turbopack and React Compiler "all" mode until budgets are met.
- Consolidate build configs (single `next.config` and PostCSS file) to avoid legacy conflicts.
- Strip dev-only logging/instrumentation from production bundles.

### 3.10 Testing & CI/CD

- Mandatory Jest/RTL unit tests and integration tests per feature slice; Cypress retained for E2E.
- Service testing matrix (minimum coverage):
  - `crud.ts` modules → happy path + error-path unit tests, plus contract test that executes against a test database or mocked PostgREST to verify column mappings.
  - `business.ts` orchestrators → integration tests exercising multi-step flows, including concurrency guards (e.g., double-submit prevention) and error enums.
  - `transforms.ts` → deterministic unit tests with snapshot coverage for DTO ↔ view conversions.
  - Realtime hooks/services → mocked channel tests asserting subscribe/unsubscribe and scheduler behaviour.
  - UI service adapters → contract tests ensuring only view models cross the boundary.
- CI gates: lint, type-check, unit/integration tests, Lighthouse, Supabase migration validation, type-regeneration diff check.
- Document architectural decisions (ADRs) whenever deviating from this PRD.

### 3.11 Observability & Logging

- Use structured logging (JSON or key/value) in services and server actions; never rely on ad-hoc `console.log` in production bundles. Pipe logs through Next.js `instrumentation.ts` or the platform logger.
- Capture domain metrics (operation latency, error counts) at the API boundary instead of inside services to keep modules pure. Export a shared telemetry helper so handlers record timings consistently.
- For Supabase auth/session flows, instrument middleware callbacks (`onAuthStateChange`) to monitor token refreshes and sign-outs (see `createServerClient` guidance in `@supabase/ssr`).
- Emit alertable events for failed migrations, type-generation mismatches, and long-running transactions; surface them in the deployment pipeline dashboard.

## 4. Anti-Pattern Guardrails

- ESLint rule: forbid Supabase client creation in Zustand stores/components (legacy issue in `store/casino-store.ts`).
- Lint: prohibit `staleTime: 0` unless file opted into real-time policy (violations previously in `hooks/rating-slip/useActiveRatingSlipsByTable.ts`, `components/ui/table/casino-table-ui-v2.tsx`, `components/ui/table/table-seat.tsx`).
- Block `Database = any` shims, manual table redefinitions, and intersection-based schema rebuilds in type modules.
- **Service Layer Type Enforcement**:
  - Ban `ReturnType<typeof createXService>` patterns in service exports (violations in `services/table-context/index.ts`, `services/rating-slip/index.ts`, `services/compliance/index.ts`).
  - Require explicit interface definitions for all service factories with typed return signatures.
  - Forbid `supabase: any` parameters in service factory functions (violations in `services/casino/index.ts`, `services/mtl/index.ts`).
  - Enforce explicit return type interfaces when using object spread composition to prevent silent method overwrites.
  - Ban duplicate/competing factory patterns (e.g., `createXService` + `createXServices` doing the same thing - violation in `services/compliance/index.ts`).
  - Prohibit zero-value wrapper functions that merely alias existing service creators without adding functionality.
  - Ban mixing default and named exports from service modules; use named exports exclusively for consistency and traceability.
  - Prohibit runtime validation in service factory functions; move validation to development-only assertions or initialization-time checks.
  - **Forbid `as any` type casting to bypass incomplete interfaces** (violation in `services/visit/index.ts:76`). If a method exists in implementation, it MUST be declared in the interface.
  - **Remove all deprecated class wrappers** marked `@deprecated` that delegate to functional services (violation: `VisitService` class in `services/visit/index.ts`). Delete deprecated code instead of maintaining dual APIs.
  - **Interfaces must be complete**: Every public method in the service implementation must have a corresponding type signature in the interface. No silent additions via type casting.
- Ban global real-time managers (connection pools, optimistic/offline singletons); enforce hook-scoped subscriptions with automated tests.
- Ban service-layer factories that cache or mutate global state (e.g., `ServiceFactory` performance caches); service creation stays pure and request-scoped.
- Ban bulk library imports (HeroUI/Lucide) and dev console logging in production paths.
- **Schema Consistency: Enforce UUID Primary Keys Universally**:
  - **Anti-Pattern**: Mixed ID types (TEXT vs UUID) across domain tables create implicit technical debt through casting overhead, type-unsafe joins, and ORM friction.
  - **Violation Discovered**: `ratingslip.id` was TEXT while all other domain tables used UUID, requiring explicit `::text`/`::uuid` casts in foreign key relationships and audit logs.
  - **Resolution**: Migrated to UUID ([20251006234000_migrate_ratingslip_id_to_uuid.sql](../../supabase/migrations/20251006234000_migrate_ratingslip_id_to_uuid.sql)) achieving zero-cast schema consistency.
  - **Enforcement**: All new domain tables MUST use `UUID PRIMARY KEY DEFAULT gen_random_uuid()`. Pre-migration schema audits required for inherited TEXT-based IDs.

## 5. Deployment & Release Management

- Environment flow: local → shared dev → staging → production. Every migration, seed, and Supabase storage change lands in dev first, rolls forward to staging, then production after sign-off.
- Run migrations via Supabase CLI `supabase db push` or SQL files; never apply manual DDL in production. Record the resulting diff and regenerated `database.types.ts` in the same PR.
- Release gates: staging must pass CI, Lighthouse, and manual smoke before promotion. Track release candidates with semantic tags.
- Database connections: serverless/API workloads use Supavisor transaction-mode URLs (`postgres://…pooler.supabase.com:6543`); long-running jobs use session mode (`:5432`). Configure connection strings via environment variables ( `POSTGRES_URL_NON_POOLING`).
- Feature flags: wrap risky features with kill switches; store flag metadata in Supabase or LaunchDarkly and document rollout/rollback steps.
- API compatibility: version DTOs when breaking changes occur and document deprecation timelines so downstream teams can migrate safely.
- Rollback plan: keep the previous build artifact and migration revert scripts ready; publish a playbook describing how to restore the last known good schema, redeploy, and invalidate caches.

## 6. Implementation Roadmap

- **Phase 0 (Infra Week)** – Initialize Supabase project, apply baseline migration, set up type generation + CI guardrails.
- **Phase 1 (Security Week)** – RLS + JWT helpers, audit logging, compliance tables.
- **Phase 2 (Core Domains)** – Deliver Player → Visit → Rating Slip → Table Context vertical slices with tests.
- **Phase 3 (Performance Hardening)** – Apply bundle optimizations, real-time scheduler integration, enforce budgets in CI.
- **Phase 4 (Compliance & Reporting)** – Implement MTL workflows, CTR exports, staff tooling.

## 7. Acceptance Criteria

- Supabase schema migrations execute cleanly with RLS enforced on core tables.
- `database.types.ts` regenerated automatically; builds fail on stale types.
- Service layer adheres to `ServiceResult` contracts with centralized error handling.
- React Query manages all remote data; Zustand limited to UI-only concerns.
- Real-time updates flow through shared scheduler utilities with clean cleanup semantics.
- Production builds meet Lighthouse budgets and pass all CI gates.
- Rating-slip domain delivered through the four-week decoupling plan and documented via ADR.
