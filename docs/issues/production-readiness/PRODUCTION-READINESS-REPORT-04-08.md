# PT-2 Production-Readiness & Security Report

**Date**: 2026-04-08 | **Scope**: Systemic audit triggered by P1 incident (GAP-AUTHENTICATED-ROLE-GRANT-BLIND-SPOT) | **Agents**: 5 parallel domain experts

---

## Executive Summary

The P1 incident -- `rpc_get_rating_slip_duration` returning `permission denied` for authenticated users -- exposed a systemic pattern: **no test layer in PT-2 exercises real `authenticated`-role privileges against the actual database**. This audit investigated whether the gap is isolated or symptomatic. It is symptomatic.

**Overall Posture**: The application has strong *design-time* security controls (pre-commit hooks, SECURITY DEFINER governance, DomainError patterns, RLS policy coverage) but weak *runtime verification* -- the CI pipeline cannot catch permission failures, test layers operate with elevated privileges, and observability infrastructure is absent.

| Domain | Rating | Key Risk |
|--------|--------|----------|
| **RLS & Grant Security** | RED | 4 RPCs have no explicit `authenticated` grant -- ticking time bombs |
| **CI/CD Pipeline** | RED | Test + E2E jobs are non-blocking (`continue-on-error: true`); no branch protection |
| **Auth & Test Blind Spots** | RED | 58% of integration tests still use `service_role`; DEV_AUTH_BYPASS masks 8+ bug categories |
| **Error Handling & Code Quality** | AMBER | Well-architected patterns, but no error tracking service (Sentry), no structured logging |
| **Database & Migration Safety** | GREEN | 281 migrations clean, RLS on all 38 public tables, indexes comprehensive |

---

## Section 1: RLS & GRANT Security

### 1.1 Active Grant Gaps -- 4 Functions at Risk

These functions have **zero** `GRANT EXECUTE TO authenticated` and survive only on default `PUBLIC` inheritance. Any future bulk REVOKE will silently break them -- the exact pattern that caused the P1.

| Function | Severity | Called From | Impact if Lost |
|----------|----------|-------------|----------------|
| `rpc_check_table_seat_availability` | **P2** | `services/visit/crud.ts:648` | Seating validation breaks for all operators |
| `rpc_get_visit_live_view` | **P2** | `services/rating-slip/crud.ts:711`, API route | **Primary operational screen** goes down |
| `rpc_get_visit_loyalty_summary` | **P2** | Internal caller chain | `rpc_get_player_recent_sessions` fails mid-execution |
| `rpc_get_visit_last_segment` | **P2** | Internal caller chain | Recent sessions + last session context fail |

### 1.2 Resolved

- `rpc_get_rating_slip_duration` -- Fixed by hotfix migration `20260408112838`. Confirmed correct.

### 1.3 Overall RPC Inventory

- **95 total** unique `rpc_*` functions
- **91** with confirmed `authenticated` grant
- **4** with **no explicit grant** (Section 1.1 above)
- **0** with only `service_role` grant (the hotfixed function now has both)

### 1.4 Prevention Measures -- All Three MISSING

| Recommended Gate | Status | Description |
|-----------------|--------|-------------|
| Grant Audit Gate (SEC-010) | **NOT IMPLEMENTED** | SQL assertion checking `has_function_privilege('authenticated', oid, 'EXECUTE')` for all `rpc_*` |
| Authenticated-Role Smoke Test | **NOT IMPLEMENTED** | Integration test with real authenticated session, not `service_role` |
| Migration Lint: Bulk REVOKE Warning | **NOT IMPLEMENTED** | Lint for `REVOKE ALL` without corresponding GRANT enumeration |

---

## Section 2: CI/CD Pipeline & Security Gates

### 2.1 CI Workflows (6 exist)

| Workflow | Trigger | **Blocking?** |
|----------|---------|---------------|
| CI (`ci.yml`) -- checks job | PR to main | **YES** (lint, type-check, build) |
| CI (`ci.yml`) -- test job | PR to main | **NO** (`continue-on-error: true`) |
| CI (`ci.yml`) -- e2e job | PR to main | **NO** (`continue-on-error: true`) |
| Security Gates | PR touching `supabase/migrations/**` | **YES** |
| Migration Lint | PR touching `supabase/migrations/**/*.sql` | **YES** |
| Deploy Staging / Production | Push to main / Tag `v*` | N/A |

**Critical**: Unit test failures and E2E failures **cannot block PR merges**. They are advisory only.

### 2.2 Pre-Commit Hooks (8 hooks -- comprehensive but bypassable)

Migration naming, migration safety, RPC self-injection lint, API sanity, service patterns, Zustand patterns, RLS write-path, search-path safety, lint-staged. All bypassable with `--no-verify` and **no CI gate replicates the RLS/search-path checks**.

### 2.3 Security Gates (10 SQL assertions -- missing the critical one)

SEC-001 through SEC-009 + ADR-040 run against ephemeral Postgres in CI. They cover: no `USING(true)`, no overload ambiguity, no spoofable params, no `PUBLIC` EXECUTE on sensitive functions, no deprecated context, context-first-line, search-path consistency.

**SEC-004 checks that `PUBLIC`/`anon` CANNOT execute. No gate checks that `authenticated` CAN execute.** This is the exact blind spot.

### 2.4 Branch Protection

**MISSING** -- `main` branch has no protection rules. Direct pushes are possible.

### 2.5 Integration Tests in CI

**NEVER RUN** -- gated by `RUN_INTEGRATION_TESTS=true` which is not set in any workflow. Local-only, opt-in.

---

## Section 3: Auth Bypass & Test Blind Spots

### 3.1 DEV_AUTH_BYPASS Scope

When active (local dev + E2E), the bypass:
1. Swaps the Supabase client to `service_role` -- **bypasses ALL RLS**
2. Skips `set_rls_context_from_staff()` -- **no Postgres session vars set**
3. Injects hardcoded admin role for Casino 1 -- **no real auth pipeline exercised**

**Bug categories masked** (invisible during development):
- RLS policy bugs (broken SELECT/INSERT/UPDATE policies)
- Staff validation failures (active status, casino assignment)
- Casino scoping errors (cross-casino isolation)
- TOCTOU race conditions in auth pipeline
- JWT claims inconsistencies
- `set_rls_context_from_staff()` RPC failures
- Role authorization bugs (always admin)
- Company scoping validation

### 3.2 Test Layer Coverage by Auth Mode

| Test Layer | Auth Mode | Catches Grant Issues? | Catches RLS Issues? |
|-----------|-----------|----------------------|---------------------|
| Unit tests (Jest) | Mocked `supabase.rpc()` | No | No |
| Integration tests (17 files) | `service_role` key | No | No |
| Integration tests (24 files) | Mode C authenticated | **Yes** | **Yes** |
| E2E tests (Playwright) | `DEV_AUTH_BYPASS` | No | No |
| Security gates (CI) | Ephemeral DB assertions | No (checks inverse) | Partial |

**58% of integration tests still use `service_role`**. The Mode C migration is incomplete.

### 3.3 Other Production-Relevant Findings

| Finding | Severity | Detail |
|---------|----------|--------|
| `/api` routes bypass middleware auth | **P2** | Relies on each handler using `withServerAction` -- no defense-in-depth |
| `/review` routes are public | **P2** | Accessible without auth in production builds |
| Browser client SSR mock swallows errors | **P2** | SSR returns `{ data: [], error: null }` -- masks real failures as empty data |
| `skipAuth: true` on 3 onboarding routes | **P2** | Architecturally correct (pre-staff flows) but operate without casino scoping |
| `workers/csv-ingestion/.env` gitignore gap | **P2** | May not be covered by root `.gitignore` |

---

## Section 4: Error Handling & Resilience

### 4.1 What's Working Well

- **DomainError + `safeErrorDetails()`** -- well-enforced via custom ESLint rule. Zero active violations across 70+ call sites.
- **`as any` usage** -- only 3 instances, all documented Supabase type generation workarounds.
- **API error response shape** -- consistent `ServiceHttpResult` with `requestId`, `durationMs`, status codes, retryable flag.
- **Database error mapping** -- `mapDatabaseError()` maps Postgres codes (23502, 23503, 23505, 40001, 40P01) to domain errors.
- **Correlation IDs** -- `AsyncLocalStorage`-based propagation with `x-request-id` support.

### 4.2 Production Gaps

| Finding | Severity | Detail |
|---------|----------|--------|
| **No error tracking service** | **HIGH** | No Sentry, Datadog, or equivalent. Client-side errors are invisible. Only references are in planning docs. |
| **No `global-error.tsx`** | **HIGH** | Root-level uncaught errors show default Next.js page with no reporting. |
| **No structured logging** | **HIGH** | Main app uses raw `console.*`. Only CSV worker has proper JSON logging. |
| **No server-side retry** for transient DB failures | **MEDIUM** | Serialization failures (40001) marked `retryable` but retry is client-only. |
| **No query timeouts** | **MEDIUM** | No `AbortController` or `statement_timeout`. Long queries block until function timeout. |
| **Health check lacks DB connectivity** | **MEDIUM** | `/api/health` returns static info -- no database ping. |
| **Error boundaries cover 2/14+ route groups** | **MEDIUM** | Only `players` and `shift-dashboard` have `error.tsx`. |
| **`PanelErrorBoundary` silent in production** | **MEDIUM** | `logError()` is dev-only -- production panel crashes are swallowed. |
| No `not-found.tsx` custom 404 | **MEDIUM** | Default Next.js 404 for invalid routes. |

### 4.3 Console.* Violations in Production Code

| File | Line(s) | Severity | Issue |
|------|---------|----------|-------|
| `app/(dashboard)/compliance/page.tsx` | 47 | **HIGH** | Raw error object in `console.error` in prod SSR |
| `components/dashboard/pit-dashboard-client.tsx` | 296, 301, 347, 352 | MEDIUM | Unguarded `console.error` |
| `app/review/pit-map/pit-map-container.tsx` | 63, 70 | MEDIUM | Unguarded `console.log` |
| `lib/supabase/rls-context.ts` | 136 | MEDIUM | `console.info` on every authenticated request |
| `lib/supabase/claims-reconcile.ts` | 62, 74, 90 | MEDIUM | `console.info` on every auth flow |

---

## Section 5: Database & Migration Safety

### 5.1 Overall Status: GREEN

- **281 migrations** -- all correctly named, temporally ordered, no collisions.
- **38 public-schema tables** -- all have RLS enabled with policies.
- **68 unindexed FK columns** -- remediated by `20260403202125_add_unindexed_foreign_key_indexes.sql`.
- **SECURITY DEFINER `search_path`** -- remediated by `20260403202628_fix_function_search_path_sec_s3.sql`. All post-SEC-S3 migrations compliant.
- **No dangerous patterns found**: no unguarded DROP, no TRUNCATE, no DELETE without WHERE, no data-lossy type changes.

### 5.2 Minor Findings

| Finding | Severity | Detail |
|---------|----------|--------|
| 23 `CREATE TABLE` without `IF NOT EXISTS` | LOW | Not a runtime risk (migrations run once), but partial re-application fragile |
| `context` schema tables (3) lack RLS | LOW | Internal tooling tables, not exposed via PostgREST |
| `types/remote/database.types.ts` uncommitted | LOW | Normal workflow state |

---

## Priority Action Matrix

### P0 -- Do This Week

| # | Action | Rationale |
|---|--------|-----------|
| 1 | **Create migration granting `authenticated` EXECUTE on 4 unprotected RPCs** | `rpc_check_table_seat_availability`, `rpc_get_visit_live_view`, `rpc_get_visit_loyalty_summary`, `rpc_get_visit_last_segment` are one bulk-REVOKE away from P1 |
| 2 | **Implement SEC-010 Grant Audit Gate** | SQL assertion in `supabase/tests/security/` verifying all `rpc_*` have `GRANT EXECUTE TO authenticated` with exclusion list. Wire into `run_all_gates.sh` + CI. |
| 3 | **Remove `continue-on-error: true`** from `test` and `e2e` jobs in `ci.yml` | Test failures must block merges |

### P1 -- Do This Sprint

| # | Action | Rationale |
|---|--------|-----------|
| 4 | **Enable branch protection on `main`** | Require `checks` + `security-gates` to pass before merge |
| 5 | **Add `global-error.tsx`** at app root | Uncaught errors currently show default Next.js page |
| 6 | **Integrate error tracking (Sentry)** | Production errors are currently invisible |
| 7 | **Add migration lint for REVOKE patterns** | Warn when `REVOKE ALL ON ALL FUNCTIONS` or `REVOKE ... FROM authenticated` appears without corresponding GRANT |

### P2 -- Backlog

| # | Action | Rationale |
|---|--------|-----------|
| 8 | Complete Mode C migration for remaining 17 integration test files | Close the service_role blind spot |
| 9 | Add structured logging (pino/winston) | Console-based logging is not aggregatable |
| 10 | Add DB connectivity to `/api/health` | Health check currently can't detect database outages |
| 11 | Add `error.tsx` boundaries for remaining 12+ route groups | Graceful error UX |
| 12 | Guard `/review` routes behind auth or exclude from prod builds | Currently public |
| 13 | Add server-side retry for transient DB failures (40001, 40P01) | Currently client-only retry |
| 14 | Clean up unguarded `console.*` in production components | 5 files with violations |

---

## Related Documents

- [GAP-AUTHENTICATED-ROLE-GRANT-BLIND-SPOT](../gaps/GAP-AUTHENTICATED-ROLE-GRANT-BLIND-SPOT.md) -- P1 incident that triggered this audit
- ADR-018: SECURITY DEFINER governance
- ADR-024: Authoritative context derivation
- ADR-030: Auth pipeline hardening
- SEC-001: RLS policy matrix
- SEC-007: Security assertion gates

---

*Report generated from 5 parallel domain audits: 281 migrations scanned, 95 RPC functions traced, 6 CI workflows analyzed, 41+ integration test files reviewed, full auth pipeline audited.*
