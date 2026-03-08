# PT-2 Architecture Reality Report

> **Date**: 2026-03-07
> **Scope**: Full-system architectural assessment per Investigation Brief
> **Method**: 6 parallel domain investigation agents examining implementation reality
> **Status**: DRAFT - Pending stakeholder review

---

## 1. Executive Summary

**Primary Question**: Does PT-2 have a clear, coherent, constraint-driven architecture, or is it accumulating hidden complexity behind governance artifacts?

**Answer**: PT-2 demonstrates **strong architectural discipline** with well-documented governance that closely matches implementation reality. The system has a coherent, constraint-driven architecture across its service layer, security model, and bounded context boundaries. However, it exhibits **uneven rendering maturity** across application surfaces and **minimal production observability**, creating friction that will compound as the system scales.

### Key Findings

| Area | Assessment | Evidence |
|------|-----------|----------|
| Service Layer | Excellent | 13/13 services follow functional factory pattern; zero governance violations |
| Bounded Contexts | Excellent | SRM ownership matches code reality; cross-context access is intentional (BFF) |
| Security & RLS | Excellent | 96+ RPCs use ADR-024 context derivation; multi-tenant isolation verified |
| Data Ingestion | Excellent | First-class pipeline with 10-stage lifecycle, idempotency, worker pattern |
| State Management | Good | Clear 3-tier model (Zustand/TanStack/Context); 3 performance bypass hooks |
| Rendering Architecture | Needs Work | No surface classification; inconsistent SSR/CSR decisions; waterfall fetching |
| Observability | Needs Work | No production monitoring; console logging disabled in prod; no distributed tracing |
| CI/CD | Good | Strong PR gates; E2E not in CI; no automated deployment |

### Risk Summary

- **0 Dangerous Ambiguities** found
- **0 Likely Defects in System Design** found
- **3 items Need Architectural Review** (rendering strategy, observability, E2E in CI)
- **5 items Need Standardization** (surface classification, server caching, fetch timeouts, coverage thresholds, dependency pinning)
- **8 items are Acceptable Trade-offs** (documented, intentional, bounded)

---

## 2. Reality Map

### 2.1 Major Application Surfaces

```
PT-2 Application Surfaces
==========================

PUBLIC (Unauthenticated)
  (marketing)/ .............. Landing, pricing, contact [force-static, CDN-cacheable]
  (public)/auth/ ............ Login, signup, password reset [server+client hybrid]
  (public)/start ............ Auth gateway, redirect-only [server component, no HTML]

ONBOARDING (Transitional Auth)
  (onboarding)/bootstrap .... Staff binding [interaction-heavy]
  (onboarding)/setup ........ Casino config wizard [interaction-heavy]
  (onboarding)/invite/ ...... Accept/manage invitations [interaction-heavy]

OPERATIONAL (Authenticated - All Staff)
  (protected)/shift-dashboard  Shift overview [RSC prefetch + HydrationBoundary]
  (dashboard)/pit ........... Table management [force-dynamic, realtime subscriptions]
  (dashboard)/players/ ...... Player 360 CRM [hybrid Suspense, server gaming day]
  (dashboard)/cashier/ ...... Cash-out flows [force-dynamic, 4 sub-routes]
  (protected)/player-import . CSV import wizard [client-only, polling]

COMPLIANCE (Authenticated - pit_boss/admin)
  (dashboard)/compliance .... AML/CTR dashboard [force-dynamic, role-gated]
  (dashboard)/loyalty ....... Loyalty management [placeholder, Phase 3]

ADMIN (Authenticated - admin/pit_boss only)
  (dashboard)/admin/alerts .. Alert dashboard [client component]
  (dashboard)/admin/settings  Thresholds, shifts, staff [client forms]
  (dashboard)/admin/reports . Reporting [placeholder]

API (Server-to-Server)
  api/v1/ ................... 90+ route handlers across 15 domains

DEV/PROTOTYPE (Non-production)
  (dev)/, review/, prototype/  Development previews [6 routes]
```

### 2.2 Rendering Mode Distribution

```
Rendering Modes Across Surfaces
================================

[STATIC] -------- (marketing)/ ............. force-static, CDN-served
                                              Content-only, no interactivity

[RSC PREFETCH] -- (protected)/shift-dashboard  Server prefetch 3 queries
                                              HydrationBoundary, 30s staleTime
                                              BEST PATTERN IN CODEBASE

[HYBRID] -------- (dashboard)/players/ ..... Server gaming day + Suspense
                                              Client React Query waterfall
                                              Only Suspense boundary in app

[CLIENT SHELL] -- (dashboard)/pit .......... Server passes casinoId only
                  (dashboard)/cashier/ ...... Client fetches everything
                  (dashboard)/compliance .... Client fetches everything
                  (dashboard)/admin/ ........ Client fetches everything
                  (protected)/player-import . Client wizard, polling
                                              4+ network round-trips before paint

[REDIRECT ONLY] - (public)/start ........... Server auth check, redirect
                                              No HTML rendered
```

### 2.3 Domain Boundaries & Data Flows

```
Bounded Context Map (SRM v4.18.0)
===================================

TIER 1: IDENTITY & CONFIGURATION
  CasinoService ........ casino, casino_settings, company, staff, game_settings,
                         audit_log, report, player_casino (8 tables)
  PlayerService ........ player (1 table)

TIER 2: OPERATIONAL CORE
  VisitService ......... visit (1 table, 3 archetypes)
  RatingSlipService .... rating_slip, rating_slip_pause, pit_cash_observation
                         (3 tables, state machine via RPCs)
  TableContextService .. gaming_table, gaming_table_settings, dealer_rotation,
                         table_inventory_snapshot, table_fill, table_credit,
                         table_drop_event, table_session, table_rundown_report,
                         shift_checkpoint (10 tables, 7 sub-modules)

TIER 3: APPEND-ONLY LEDGERS
  LoyaltyService ....... player_loyalty, loyalty_ledger, loyalty_outbox,
                         promo_program, promo_coupon, loyalty_valuation_policy,
                         loyalty_liability_snapshot (7 tables, RPC-forward)
  PlayerFinancialService player_financial_transaction (1 table, append-only)
  MTLService ........... mtl_entry, mtl_audit_note (2 tables, compliance)

TIER 4: BFF / READ-ONLY AGGREGATION
  Player360DashboardSvc  No ownership, reads 5 tables (intentional BFF)
  RatingSlipModalSvc ... No ownership, RPC aggregation (~150ms vs ~600ms)
  PlayerTimelineSvc .... No ownership, RPC projection (ADR-029 taxonomy)

TIER 5: ONBOARDING
  PlayerImportService .. import_batch, import_row (2 staging tables)
  FloorLayoutService ... floor_layout + 4 related tables (5 tables)

DATA FLOW PATTERNS:
  Reads:  Service → .from(owned_table) → DTO → API → Client
  Writes: Client → API → withServerAction → RPC (SECURITY DEFINER) → DB
  BFF:    Client → API → RPC (consolidated) → Multi-table join → DTO
  Import: File → Storage → Worker → RPC staging → RPC execution → player
```

### 2.4 Communication Channels

```
Communication Channel Map
==========================

CHANNEL 1: Browser --> Next.js API (HTTP/Fetch)
  Protocol: HTTP/1.1, JSON payloads
  Auth: withServerAction middleware (JWT + RLS injection)
  Idempotency: Idempotency-Key header on all mutations
  Retry: Manual (user-initiated), no automatic retry
  Timeout: Browser default (no explicit enforcement)

CHANNEL 2: Browser --> Supabase Direct (Minimal)
  Protocol: PostgREST via Supabase JS client
  Usage: 3 performance-optimized hooks bypass API layer
    - useDashboardTables() -> rpc_get_dashboard_tables_with_counts
    - useDashboardStats() -> rpc_get_dashboard_stats
    - useGrindBuyinTotal() -> direct table query
  Auth: RLS policies (anon key + user JWT)

CHANNEL 3: Next.js API --> Supabase (Server RPC)
  Protocol: PostgREST RPC, JSON
  Auth: SECURITY DEFINER + set_rls_context_from_staff()
  Timeout: 30s (PostgREST default)
  Error Mapping: Postgres codes -> DomainError codes

CHANNEL 4: Supabase --> Browser (Realtime PubSub)
  Protocol: WebSocket
  Channels: {casino_id} (list), {casino_id}:{resource_id} (detail)
  Active: rating_slip, table_context domains
  Throttle: 250-500ms coalesce window
  Cache: Invalidates React Query on event

CHANNEL 5: Worker --> Supabase (Background Processing)
  Protocol: pg client (direct PostgreSQL)
  Auth: service_role (RLS bypassed)
  Retry: Heartbeat + reaper + attempt counter (max 3)
  Health: HTTP /health endpoint on port 3001

CHANNEL 6: File Storage (Supabase Storage)
  Protocol: HTTPS (signed URLs, 3600s expiry)
  Bucket: imports (private, service-role only)
  Path: {casino_id}/{batch_id}/{uuid}.csv

CHANNEL 7: Audit Pipeline (Fire-and-Forget)
  Protocol: SQL INSERT via middleware
  Captures: actor_id, casino_id, domain, action, correlation_id, duration_ms
  Production only
```

### 2.5 State Ownership

```
State Architecture (3-Tier)
============================

TIER 1: ZUSTAND (UI Ephemeral - 6 stores)
  UIStore .............. Modal visibility, sidebar collapse [memory]
  LockStore ............ Lock screen state [sessionStorage, ADR-035]
  PitDashboardStore .... Table/slip selection, panel type [memory]
  PlayerDashboardStore . Row highlight only (NOT detail panel) [memory]
  RatingSlipModalStore . Form fields (5 inputs) [memory]
  ShiftDashboardStore .. Time window, lens, selections [memory]
  --> All implement resetSession() per ADR-035 logout contract

TIER 2: TANSTACK QUERY (Server State - Primary Truth)
  16 service domains with query key factories
  Domain-tiered stale times:
    REFERENCE:     5 min  (casino settings, floor layouts)
    TRANSACTIONAL: 30 sec (rating slips, visits, ledgers)
    REALTIME:      10 sec (tables, active visits)
  Surgical invalidation via .scope pattern
  95 files using TanStack Query

TIER 3: REACT CONTEXT (Transient UI - 1 instance)
  DismissedAlertsContext .. Alert dismissal state (admin panel)
```

---

## 3. Findings by Theme

### Theme A: Rendering & Runtime Architecture

#### A1. No Surface Classification Strategy (Needs Standardization)

**Symptom**: Pages declare `force-dynamic` locally with no documented rationale.
**Root Cause**: No governance document maps surfaces to rendering strategies.
**Impact**: Developers adding pages guess rendering mode; inconsistent patterns emerge.
**Evidence**: Pit, compliance, cashier all use `force-dynamic` but for different reasons (realtime vs. compliance freshness vs. transaction safety). No document explains the distinction.
**Affected Surfaces**: All 48 pages.

#### A2. Data Waterfall on Primary Dashboard (Needs Architectural Review)

**Symptom**: Pit Dashboard fires 4+ sequential React Query hooks before painting data.
**Root Cause**: Server passes only `casinoId`; all data fetched client-side after hydration.
**Impact**: Multiple network round-trips before user sees content on the most critical screen.
**Evidence**: `PitPanelsClient` calls `useDashboardTables()`, `useDashboardStats()`, `useActiveSlipsForDashboard()`, `useGamingDay()` sequentially after mount.
**Contrast**: Shift Dashboard uses RSC prefetch with `HydrationBoundary` (instant data, no waterfall). This pattern exists but is not applied to Pit.
**Recommendation**: Apply Shift Dashboard's RSC prefetch pattern to Pit Dashboard.

#### A3. Single Suspense Boundary in Entire App (Needs Standardization)

**Symptom**: Only Player 360 uses `<Suspense>` with skeleton fallback.
**Root Cause**: No streaming/progressive rendering strategy documented.
**Impact**: All-or-nothing rendering on most pages; no progressive disclosure.
**Evidence**: 48 pages, 1 Suspense boundary. Most pages show full-page spinner via `useState(isLoading)`.
**Recommendation**: Extend Suspense to major dashboard sections (pit panels, stats, timeline).

#### A4. Client Components at 82% (Acceptable Trade-off)

**Symptom**: 218 of 267 components have `'use client'` directive.
**Root Cause**: React Query, Zustand, onClick handlers, and hooks require client boundary.
**Assessment**: This is expected and justified for an interaction-heavy operational application. Server components are correctly used for layouts, auth gates, and data prefetch where they exist.

#### A5. Admin Role Access via DOM Attribute (Needs Standardization)

**Symptom**: Admin layout sets `data-staff-role` on wrapper div; client reads via DOM query.
**Root Cause**: Server component can't pass props to deeply nested client components without drilling.
**Impact**: Fragile; depends on DOM structure; fails during SSR.
**Evidence**: `app/(dashboard)/admin/layout.tsx` line setting `data-staff-role`, child components using `.closest('[data-staff-role]')`.
**Recommendation**: Replace with React Context provider.

### Theme B: State & Data Flow

#### B1. Three Performance Bypass Hooks (Acceptable Trade-off)

**Symptom**: 3 hooks call Supabase directly, bypassing the API layer.
**Root Cause**: Performance optimization (87.5% reduction: 8 HTTP requests to 1 RPC).
**Impact**: Inconsistent data-fetching pattern; authorization checks differ from API layer.
**Evidence**:
- `useDashboardTables()` - direct RPC (ISSUE-DD2C45CA)
- `useDashboardStats()` - direct RPC (PERF-002)
- `useGrindBuyinTotal()` - direct table query
**Assessment**: Documented, justified, bounded. RLS policies still enforce authorization. Monitor for proliferation.

#### B2. Role-Based Financial Validation at Route Handler Level (Acceptable Trade-off)

**Symptom**: Pit boss vs. cashier financial constraints enforced via different Zod schemas at route handler level.
**Root Cause**: RLS policies enforce casino scope and table access, but role-specific business rules (direction, tender type) are application logic.
**Impact**: Dual enforcement (schema + RLS) without single source of truth.
**Assessment**: Defense-in-depth is appropriate for financial operations. The schema validation is the primary gate; RLS is the safety net.

#### B3. View Models Assembled in Components (Needs Standardization)

**Symptom**: Data transformation (e.g., seat occupancy mapping) happens in `useMemo` inside components.
**Root Cause**: No view model preparation layer between service DTOs and components.
**Impact**: Logic mixed with rendering; harder to test; re-derives on every data update.
**Evidence**: `PitPanelsClient` uses `mapSlipsWithPlayerToOccupants()` in useMemo to compute seat occupancy from active slips.
**Recommendation**: Derive view models in React Query `select` option or service-layer mappers.

### Theme C: Service Layer & Bounded Contexts

#### C1. Service Layer Pattern Compliance (Strength)

**Finding**: 13/13 domain services follow functional factory pattern.
**Evidence**:
- Zero `ReturnType<>` violations in production code
- Zero class-based services
- Zero `as any` without documentation (2 temporary cases documented with eslint-disable)
- All services have proper file structure (dtos, schemas, keys, mappers, crud, http, index)
- All DTOs properly derived via Pick/Omit or justified manual interfaces

#### C2. SRM Ownership Matches Reality (Strength)

**Finding**: Bounded context ownership documented in SRM v4.18.0 matches actual code behavior.
**Evidence**:
- No service writes to tables it doesn't own (except via RPC)
- Cross-context reads are confined to BFF services (Player360Dashboard, RatingSlipModal)
- Published queries (e.g., `hasOpenSlipsForTable`) used for inter-context gates
- 74 direct `.from()` calls + 47 `.rpc()` calls all respect ownership

#### C3. Dual-Layer Service Architecture (Strength)

**Finding**: Intentional split between TypeScript service layer (reads) and PostgreSQL RPCs (writes).
**Pattern**:
- **Reads**: Direct table access via `.from()` (performance)
- **Writes**: RPC-gated via SECURITY DEFINER (security + atomicity)
- **Complex mutations**: PostgreSQL functions with `FOR UPDATE` locking (state machines)
**Assessment**: Intentional per ADR-015. Creates proper API boundary.

#### C4. Player360Dashboard BFF Lacks Architectural Documentation (Needs Standardization)

**Finding**: Player360DashboardService reads 5 tables across 3 bounded contexts via direct `.from()` calls, but has no explicit BFF documentation (unlike RatingSlipModal which has PERF-001/BFF-RPC-DESIGN.md).
**Recommendation**: Document BFF status in PRD-023 or create pattern guide.

### Theme D: Security & Authorization

#### D1. Authorization Enforcement is Mature and Layered (Strength)

**Finding**: 5-layer defense model consistently applied:
1. UI gating (layout redirects, role-based nav hiding)
2. Route handler auth (withServerAction middleware)
3. RPC context injection (set_rls_context_from_staff, 96+ RPCs)
4. RLS policies (Pattern C hybrid on all tables)
5. Database constraints (FKs, unique, check constraints)

#### D2. ADR-024/030 Compliance Verified (Strength)

**Finding**: All security invariants (INV-1 through INV-8) verified in code:
- Old `set_rls_context()` with spoofable params is REVOKED
- Only `set_rls_context_from_staff()` callable by authenticated role
- Staff identity bound to `auth.uid()` via JWT lookup
- Inactive staff blocked at RPC level
- Context set via `SET LOCAL` (transaction-local, pooler-safe)
- ADR-040 Category A/B identity attribution enforced in recent RPCs

#### D3. Multi-Tenancy Isolation Verified (Strength)

**Finding**: Casino-scoped RLS prevents cross-tenant data leaks:
- All 70+ tables include `casino_id` non-null column
- All policies check casino_id match before access
- Pattern C hybrid ensures scoping even if context injection fails
- No cross-casino queries or implicit joins observed

#### D4. Claims Lifecycle Verification Incomplete (Needs Architectural Review)

**Finding**: ADR-030 D2 requires claim sync/clear on staff mutations (deactivation, role change). Trigger-based claim clearing was specified but not verified in this investigation scope.
**Recommendation**: Verify trigger implementation for staff deactivation claim clearing.

### Theme E: Data Ingestion

#### E1. Player Import is a First-Class Pipeline (Strength)

**Finding**: 10-stage lifecycle fully implemented with proper architectural treatment:
- File Selection -> Storage -> Parsing -> Normalization -> Validation -> Staging -> Reconciliation -> Domain Persistence -> Auditing -> Recovery/Replay
- Dedicated worker (`workers/csv-ingestion/`) with poll loop, heartbeat, reaper
- Streaming CSV parse (no buffering entire file)
- Row-level idempotency via `row_number`
- Batch-level idempotency via `idempotency_key`
- Cross-context writes via RPC only (PlayerImportService -> PlayerService tables)
- 10K row cap with poison batch handling
- Attempt counter (max 3) with permanent failure state

#### E2. Worker Observability is Minimal (Needs Standardization)

**Finding**: Worker has HTTP health endpoint but no metrics, alerting, or dead-letter queue.
**Impact**: Failed batches require manual database inspection.
**Recommendation**: Add Prometheus metrics endpoint; implement dead-letter alerting after 3 consecutive failures.

### Theme F: Operations, Performance & Debugging

#### F1. Explicit Client Caching Strategy (Strength)

**Finding**: Domain-tiered stale times across 20 services:
- REFERENCE: 5 min (casino, floor layouts)
- TRANSACTIONAL: 30 sec (slips, visits, ledgers)
- REALTIME: 10 sec (tables, active visits)
- Surgical cache invalidation via `.scope` pattern
- No over-broad cache resets observed

#### F2. Zero Server-Side Caching (Needs Standardization)

**Finding**: No use of Next.js `cache()`, `revalidate`, or `unstable_cache` anywhere.
**Impact**: All caching is client-side. Server renders are uncached. Reference data (casino settings, floor layouts) re-fetched on every server render.
**Recommendation**: Evaluate `revalidate` for reference data endpoints.

#### F3. Comprehensive Error Classification (Strength)

**Finding**: 109 domain-specific error codes across 11 categories. Postgres errors never reach UI. Error propagation path is clear: RPC -> Service -> Route Handler -> Client.
- `DomainError` base class with code, message, httpStatus, retryable
- Postgres error mapping (23502 -> VALIDATION_ERROR, 40001 -> CONCURRENT_MODIFICATION)
- Panel error boundaries with QueryErrorResetBoundary integration
- Correlation IDs via AsyncLocalStorage

#### F4. No Production Observability (Needs Architectural Review)

**Finding**: No external monitoring platform (Sentry, DataDog, New Relic). Console logging disabled in production. Correlation IDs exist but are not exported to HTTP headers.
**Impact**: Production errors invisible. No distributed tracing. No metrics collection.
**Evidence**: `logError()` in `lib/errors/error-utils.ts` only logs in development. No Sentry integration found. Correlation IDs in `lib/correlation.ts` but not in response headers.
**Recommendation**: Integrate observability platform before production launch.

#### F5. E2E Tests Not in CI (Needs Architectural Review)

**Finding**: 198 Playwright tests exist but are excluded from CI pipeline (`testPathIgnorePatterns` includes `e2e/`).
**Impact**: UI regressions not caught before merge. Manual E2E execution required.
**Evidence**: `jest.config.js` excludes E2E; `npm run test:ci` skips them.
**Recommendation**: Add Playwright as CI gate (separate workflow with Supabase + browser setup).

#### F6. Strong CI/CD PR Gates (Strength)

**Finding**: 6 blocking gates on every PR:
- ESLint (with `skipAuth` enforcement)
- TypeScript strict check
- RLS write-path lint (ADR-034)
- Jest tests
- Next.js build
- Typegen drift detection
- Security assertion tests on migration changes

#### F7. Supabase Pinned to `latest` (Needs Standardization)

**Finding**: `@supabase/supabase-js` and `@supabase/ssr` pinned to `latest` in package.json.
**Impact**: Builds are non-reproducible; breaking changes could arrive undetected.
**Recommendation**: Pin to specific version.

---

## 4. Drift Analysis

### Governance vs. Reality Comparison

| Governance Document | Claimed State | Actual State | Drift |
|---------------------|--------------|--------------|-------|
| **SRM v4.18.0** (Bounded Contexts) | 13 services with explicit table ownership | Code matches exactly | **None** |
| **SLAD v3.4.0** (Service Patterns) | Functional factories, explicit interfaces | 13/13 compliant | **None** |
| **ADR-015** (Connection Pooling) | Pattern C hybrid, self-injection | 96+ RPCs use `set_rls_context_from_staff()` | **None** |
| **ADR-024** (Context Derivation) | Authoritative, no spoofable params | INV-1 through INV-8 verified | **None** |
| **ADR-030** (Auth Hardening) | TOCTOU elimination, bypass lockdown | D1 fixed, D3 hardened, D4 partial | **Minor** (D2 claims lifecycle unverified) |
| **ADR-035** (Client State) | Session reset contract, store classification | All 6 stores implement `resetSession()` | **None** |
| **SEC-001** (RLS Matrix) | Pattern C on all tables, denial policies | Policies match documentation | **None** |
| **SEC-005** (Role Taxonomy) | 4 primary roles, capability matrix | Code enforces documented capabilities | **None** |
| **GOV-PAT-001** (Service Factory) | Functional factories, no classes | Zero violations | **None** |
| **GOV-PAT-002** (Mapper Pattern) | DTO transformations via mappers | All services have mappers.ts | **None** |
| **DTO Canonical Standard** | Derive from Database types, Pick/Omit | 91% derived, remainder justified with eslint-disable | **None** |
| **HOOKS_STANDARD** | React Query v5 patterns with key factories | 20 services with key factories | **None** |
| **ERROR_HANDLING_STANDARD** | DomainError codes, Postgres mapping | 109 codes, full mapping layer | **None** |
| **CICD-PIPELINE-SPEC** | 6 PR gates, security assertions | Active in CI | **None** |
| **MIGRATION_NAMING_STANDARD** | YYYYMMDDHHMMSS_descriptive_name.sql | 237 migrations follow convention | **None** |

### Missing Standards (Undocumented but Implemented)

| Pattern | Implementation Status | Documentation Status |
|---------|----------------------|---------------------|
| Surface classification per route | Ad hoc (force-dynamic/static/default) | **Missing** |
| RSC prefetch strategy | Implemented on Shift Dashboard only | **Missing** |
| Server-side caching policy | Not implemented | **Missing** |
| Production observability | Not implemented | Referenced in OPS docs but not actionable |
| Client fetch timeout policy | Not implemented | **Missing** |

### Missing Standards (Neither Documented nor Enforced)

| Standard | Impact |
|----------|--------|
| Rendering mode selection criteria | Developers guess per page |
| Performance budgets per surface | No regression detection |
| Coverage thresholds per service | Only 2 files have thresholds |
| BFF service documentation template | Player360 BFF undocumented |

---

## 5. Ranked Improvement Opportunities

### Tier 1: Needs Architectural Review (3 items)

| # | Finding | Impact | Effort | Recommendation |
|---|---------|--------|--------|----------------|
| 1 | **No production observability** (F4) | Production errors invisible; no incident response capability | 12-20h | Integrate Sentry or equivalent before production launch |
| 2 | **Pit Dashboard data waterfall** (A2) | Primary operational screen has 4+ round-trips before data paint | 8-12h | Apply Shift Dashboard's RSC prefetch pattern |
| 3 | **E2E tests not in CI** (F5) | UI regressions undetected before merge | 4-8h | Add Playwright workflow with Supabase + browser |

### Tier 2: Needs Standardization (5 items)

| # | Finding | Impact | Effort | Recommendation |
|---|---------|--------|--------|----------------|
| 4 | **No surface classification** (A1) | Rendering decisions made ad hoc per feature | 4-6h | Create `SURFACE_CLASSIFICATION.md` mapping routes to strategies |
| 5 | **Zero server-side caching** (F2) | Reference data re-fetched on every server render | 4-8h | Add `revalidate` for casino settings, floor layouts |
| 6 | **Admin role via DOM attribute** (A5) | Fragile; fails during SSR | 2-3h | Replace with React Context provider |
| 7 | **Worker observability minimal** (E2) | Failed batches require manual DB inspection | 4-6h | Add metrics endpoint; dead-letter alerting |
| 8 | **Supabase pinned to latest** (F7) | Non-reproducible builds | 0.5h | Pin to specific version in package.json |

### Tier 3: Acceptable Trade-offs (8 items)

| # | Finding | Assessment |
|---|---------|-----------|
| 9 | 82% client components (A4) | Justified for interaction-heavy operational app |
| 10 | 3 performance bypass hooks (B1) | Documented, justified, bounded; RLS still applies |
| 11 | Dual financial validation (B2) | Defense-in-depth appropriate for financial ops |
| 12 | Single Suspense boundary (A3) | Low priority; progressive rendering nice-to-have |
| 13 | View models in components (B3) | Common pattern; improve incrementally |
| 14 | Player360 BFF undocumented (C4) | Code is clear; doc is nice-to-have |
| 15 | Claims lifecycle unverified (D4) | Spec exists; needs verification, not redesign |
| 16 | No client-side retry (E2) | Idempotency keys make manual retry safe |

---

## 6. Standards & Governance Proposals

### Immediate (Low-risk, adopt now)

1. **Create SURFACE_CLASSIFICATION.md**
   Map each route group to: workload type, rendering strategy, data fetch pattern, justification.
   Template:
   ```
   | Route | Workload | Rendering | Data Fetch | Justification |
   | /pit | realtime + interaction | force-dynamic | React Query | Live table state |
   ```

2. **Pin Supabase dependencies**
   Replace `"latest"` with specific version in package.json.

3. **Document BFF pattern**
   Add BFF service template to SLAD or create `GOV-PAT-003-bff-aggregation.md`.

4. **Admin role via Context**
   Replace `data-staff-role` DOM attribute with `AdminRoleProvider` context.

### Near-term (Targeted refactors)

5. **Apply RSC prefetch to Pit Dashboard**
   Replicate Shift Dashboard's `HydrationBoundary` pattern for `useDashboardTables`, `useDashboardStats`, `useGamingDay`.

6. **Add production observability**
   Integrate error tracking platform. Export correlation IDs to HTTP response headers. Enable structured logging in production.

7. **E2E tests in CI**
   Add Playwright workflow with local Supabase setup. Start with critical paths: login, rating slip lifecycle, financial transaction.

8. **Server-side caching for reference data**
   Add `revalidate: 300` (5 min) to casino settings, floor layout, game settings endpoints.

9. **Coverage thresholds**
   Extend coverage enforcement to all services (75%) and lib (50%).

### Strategic (Requires ADR or roadmap change)

10. **ADR: Rendering Strategy Standard**
    Formalize when to use force-dynamic vs. RSC prefetch vs. static. Tie to surface classification.

11. **ADR: Production Observability Stack**
    Select observability platform. Define SLOs per surface. Implement performance regression detection in CI.

12. **ADR: Server-Side Caching Policy**
    Define which data classes are cacheable, cache duration tiers, invalidation triggers.

---

## 7. Open Questions Requiring Architectural Decisions

### Q1: Should Pit Dashboard adopt RSC prefetch?

The Shift Dashboard pattern (server prefetch + HydrationBoundary) eliminates data waterfalls. Pit Dashboard is the highest-traffic operational screen but currently fires 4+ client-side queries after hydration. Applying RSC prefetch would require restructuring `PitPanelsClient` to accept prefetched data.

**Trade-off**: Development effort (~8-12h) vs. first-paint performance on primary screen.

### Q2: What production observability stack?

No monitoring exists. Options:
- **Sentry** (error tracking, session replay)
- **Axiom** (structured logging, traces)
- **Vercel Analytics** (if deploying to Vercel)

**Trade-off**: Cost and integration complexity vs. production incident response capability.

### Q3: Should server-side caching be adopted?

Currently zero server-side caching. Reference data (casino settings, floor layouts) could benefit from `revalidate`. But operational data must remain fresh.

**Trade-off**: Staleness risk vs. server load reduction. Needs per-surface policy.

### Q4: Should the 3 performance bypass hooks be consolidated?

Three hooks bypass the API layer for performance. They work but create maintenance burden and obscure authorization checks. Consolidating them into server-side RPCs called via API routes would restore consistency.

**Trade-off**: Performance (1 RPC vs. API round-trip) vs. architectural consistency.

### Q5: When should E2E tests gate CI?

198 Playwright tests exist but don't run in CI. Adding them requires Supabase + browser setup in GitHub Actions. Could start with a subset (critical paths only).

**Trade-off**: CI duration increase (~3-5 min) vs. UI regression detection.

### Q6: Is the claims lifecycle trigger implemented?

ADR-030 D2 requires claim clearing on staff deactivation. The spec exists but trigger implementation was not verified in this investigation. If missing, stale JWT claims could persist after staff deactivation.

**Trade-off**: Verification effort (~2h) vs. potential auth bypass on staff deactivation.

---

## Appendix A: Decision Inventory

### Documented & Intentional (23 decisions)

| Decision | ADR | Implemented | Status |
|----------|-----|-------------|--------|
| Functional service factories | GOV-PAT-001 | Yes | Enforced |
| DTO derivation from Database types | ADR-010 | Yes | Enforced |
| Casino-scoped multi-tenancy | ADR-023 | Yes | Enforced |
| Hybrid RLS (Pattern C) | ADR-015, ADR-020 | Yes | Enforced |
| Authoritative context derivation | ADR-024 | Yes | Enforced |
| Auth pipeline hardening | ADR-030 | Yes (partial D2) | Enforced |
| Client state lifecycle | ADR-035 | Yes | Enforced |
| Identity provenance rule | ADR-040 | Yes | Enforced |
| SECURITY DEFINER governance | ADR-018 | Yes | Enforced |
| Over-engineering guardrail | ADR-011 | Yes | Enforced |
| React Query for server state | ADR-003 | Yes | Enforced |
| Zustand for UI state | ADR-003 | Yes | Enforced |
| Real-time strategy | ADR-004 | Yes | Active |
| Gaming day authority | ADR-026 | Yes | Enforced |
| Financial convention (cents) | ADR-031 | Yes | Enforced |
| Error boundary architecture | ADR-032 | Yes | Partial |
| Measurement layer | ADR-039 | Yes | New |
| Player timeline taxonomy | ADR-029 | Yes | Active |
| MTL authorization | ADR-025 | Yes | Active |
| Cashier role | ADR-017 | Yes | Active |
| Table bank mode | ADR-027 | Yes | Active |
| Ghost gaming visits | ADR-014 | Yes | Active |
| Balanced architecture (H+V) | ADR-009 | Yes | Active |

### Emergent & Undocumented (6 decisions)

| Decision | Where Implemented | Intentional? |
|----------|-------------------|-------------|
| Shift Dashboard RSC prefetch pattern | `app/(protected)/shift-dashboard/page.tsx` | Intentional but not formalized as standard |
| `force-dynamic` on operational pages | Pit, compliance, cashier pages | Intentional but rationale undocumented |
| Direct Supabase bypass for dashboard perf | 3 hooks in `hooks/dashboard/` | Intentional (perf tickets referenced) |
| Domain-tiered stale times | `lib/query/client.ts` | Intentional but not in governance docs |
| Admin role via DOM attribute | `app/(dashboard)/admin/layout.tsx` | Convenience, likely unexamined |
| Fire-and-forget audit logging | `withAudit` middleware | Intentional but durability implications undocumented |

---

## Appendix B: Investigation Methodology

Six parallel investigation agents examined the codebase simultaneously:

| Agent | Domain | Files Examined | Duration |
|-------|--------|---------------|----------|
| Surface & Rendering | Route groups, layouts, pages, components | 69 tool uses | ~149s |
| State & Data Flow | Zustand stores, TanStack Query, route handlers | 49 tool uses | ~145s |
| Service Layer & Bounded Context | 13 services, SRM, cross-imports, RPCs | 44 tool uses | ~131s |
| Security & Authorization | Middleware, RLS policies, RPCs, role taxonomy | 49 tool uses | ~115s |
| Ingestion & Communication | Player import pipeline, channels, realtime | 48 tool uses | ~177s |
| Ops, Performance & Debugging | Caching, errors, CI/CD, observability | 57 tool uses | ~118s |

**Total**: 316 tool operations across ~835s of parallel investigation.

All findings are based on actual file reads, not documentation claims. Evidence includes specific file paths and line numbers.
