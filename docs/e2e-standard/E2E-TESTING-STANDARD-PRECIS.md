# E2E Testing Standard — Precis

**Date:** 2026-03-29
**Status:** Precis (findings from first structured E2E effort on Wedge C)
**Purpose:** Capture lessons learned to inform a durable E2E testing standard
**Next step:** Distill into a governance-grade standard (e.g., QA-006)

---

## Context

During pre-merge E2E testing of Wedge C (PRD-055/056 Shift Intelligence), the first attempt to write comprehensive API-level E2E tests for the shift intelligence feature surface exposed five structural gaps in the project's E2E infrastructure. No existing standard addressed these. The session consumed significant effort on environment plumbing before reaching the feature under test.

This precis documents what was discovered, what worked, what didn't, and what a standard should codify.

---

## 1. Three Auth Modes — No Documented Strategy

The project has three distinct auth contexts for E2E tests, but no guidance on when to use which.

### Mode A: Dev Auth Bypass (`ENABLE_DEV_AUTH=true`)
- **How:** Route handlers detect env flag, inject `DEV_RLS_CONTEXT` (Casino 1, admin role), swap to service_role client
- **Works for:** GET endpoints that read tables directly (service_role bypasses RLS)
- **Fails for:** All SECURITY DEFINER RPCs — they re-derive context via `set_rls_context_from_staff()` → `auth.uid()` → NULL → UNAUTHORIZED
- **Existing usage:** `e2e/api/loyalty-accrual.spec.ts` (comment says "In dev mode, auth bypass is enabled")

### Mode B: Browser Login (Playwright page)
- **How:** Navigate to `/auth/login`, fill form, Supabase sets session cookies, browser carries them
- **Works for:** Page-level tests, admin route access, role gating via middleware
- **Fails for:** API-only tests (no browser context)
- **Existing usage:** `e2e/workflows/admin-alerts.spec.ts`, `e2e/workflows/rating-slip-modal.spec.ts`

### Mode C: Authenticated Supabase Client (direct RPC)
- **How:** Sign in via Supabase API → get JWT → create client with Bearer token → call RPCs directly
- **Works for:** SECURITY DEFINER RPCs, RLS-scoped queries, role-gated operations
- **Fails for:** Testing the Next.js route handler layer (bypasses it entirely)
- **Existing usage:** None documented. Discovered during this session.

### What the standard should say:
- **GET routes reading tables:** Mode A (dev bypass) is sufficient
- **POST routes calling SECURITY DEFINER RPCs:** Mode C (authenticated client) is required
- **Page navigation and role gating:** Mode B (browser login) is required
- **Full stack (route + RPC + DB):** Requires real cookie-based auth (Mode B + API calls from page context) — not yet solved

---

## 2. Next.js Middleware Blocks API Routes

**Finding:** The Next.js middleware (`lib/supabase/middleware.ts`) redirects all unauthenticated requests to `/signin`, including API routes. API clients receive a 307 redirect to an HTML page instead of a 401 JSON response.

**Fix applied:** Added `/api` to the `publicPaths` list. API routes handle their own auth via `withServerAction` → `withAuth` middleware chain.

**What the standard should say:** API routes must be exempt from the Next.js auth middleware redirect. Auth enforcement for API routes lives in the `withServerAction` chain, which returns proper HTTP error codes (401, 403) instead of redirects.

---

## 3. Environment Mismatch — Playwright vs Next.js

**Finding:** `playwright.config.ts` loaded only `.env`, while the Next.js dev server loads `.env.local` first (standard Next.js precedence). When `.env` points to remote Supabase and `.env.local` points to local, tests create data in remote while the app reads from local.

**Fix applied:** Updated `playwright.config.ts` to load `.env.local` first with `override: true`, then `.env` — matching Next.js precedence.

**What the standard should say:**
- Playwright config MUST load env files in the same order as Next.js (`.env.local` > `.env`)
- E2E tests that depend on local migrations MUST run against local Supabase
- A `.env.local.example` template should document required variables for E2E runs
- The `.env.local` file is gitignored — each developer creates their own

---

## 4. SECURITY DEFINER RPCs Are Untestable via Dev Bypass

**Finding:** All mutation RPCs (`rpc_compute_rolling_baseline`, `rpc_persist_anomaly_alerts`, `rpc_acknowledge_alert`) are SECURITY DEFINER functions that call `set_rls_context_from_staff()` internally. This function requires `auth.uid()` to return a valid user ID. With the dev bypass (service_role client), `auth.uid()` is NULL, causing all RPCs to throw UNAUTHORIZED.

This is by design (ADR-024 defense-in-depth), but it means:
- Dev bypass mode can only test read paths (direct table queries)
- RPC endpoints require Mode C (authenticated Supabase client) for E2E coverage
- The full stack (route handler → middleware → RPC) cannot be tested without cookie-based auth or a test-specific RLS context injection

**What the standard should say:**
- SECURITY DEFINER RPCs require Mode C (authenticated client) for testing
- The auth strategy for each test should be chosen based on what the endpoint calls (table read vs. RPC)
- A helper function like `getDevAuthClient()` that signs in via Supabase and returns an authenticated client should be a shared fixture

---

## 5. Supabase CLI Key Format Change

**Finding:** Supabase CLI v2.70+ issues new-style API keys (`sb_publishable_*`, `sb_secret_*`) alongside legacy JWT keys. The legacy HS256 JWTs are rejected by the GoTrue auth service with "signing method HS256 is invalid". Admin operations (create user, delete user) require the new `sb_secret_*` key.

**What the standard should say:**
- Local `.env.local` must use the keys from `npx supabase status` output
- The `SUPABASE_SERVICE_ROLE_KEY` should use the `SECRET_KEY` value (sb_secret_*), not the legacy JWT
- The `NEXT_PUBLIC_SUPABASE_ANON_KEY` should use the `PUBLISHABLE_KEY` value (sb_publishable_*)
- Document the command: `npx supabase status --output json` as the source of truth for local credentials

---

## 6. Test Isolation with Shared Seed Data

**Finding:** Tests using seed data (Casino 1, BJ-01, etc.) conflict when run in parallel because:
- Dedup unique constraints prevent two tests from seeding the same (casino, table, metric, gaming_day) tuple
- Cleanup functions (`cleanupAlerts()`) delete all records for SEED_CASINO_ID, destroying data seeded by parallel tests

**Fix applied:** `test.describe.configure({ mode: 'serial' })` at the file level.

**What the standard should say:**
- Tests that share seed data entities MUST run serially within the file
- OR use unique identifiers per test (unique gaming_day, unique table IDs via factory)
- Cleanup should be scoped: delete only data the current test created (e.g., by ID), not broad casino-level sweeps
- The `afterAll` / `afterEach` choice matters: `afterAll` for serial groups sharing cumulative state, `afterEach` for independent tests

---

## 7. RPC Bugs Discovered

Two migration bugs were discovered and logged:
- `rpc_compute_rolling_baseline`: ambiguous `gaming_day` column reference (PG 42702)
- `rpc_persist_anomaly_alerts` → `rpc_get_anomaly_alerts`: `column ts.table_id does not exist` (PG 42703)

These block the mutation path (compute → persist → acknowledge) and must be fixed before full E2E coverage is achievable.

See `docs/issues/ISSUE-RPC-COMPUTE-BASELINE-AMBIGUOUS-COLUMN.md` and `docs/issues/ISSUE-RPC-PERSIST-ALERTS-MISSING-COLUMN.md`.

---

## Current Coverage (7 tests, all passing)

| Test | What It Validates | Auth Mode |
|------|------------------|-----------|
| GET /alerts — valid envelope | Route responds, ServiceHttpResult shape | Dev bypass |
| GET /alerts — DTO shape | All ShiftAlertDTO fields present with correct types | Dev bypass |
| GET /alerts — status filter | `?status=open` excludes acknowledged, vice versa | Dev bypass |
| GET /alerts — no filter | Returns all statuses | Dev bypass |
| Dedup constraint | Unique index rejects duplicate (casino, table, metric, day) | Service role |
| Multi-metric per table | Different metrics on same table allowed | Service role |
| Multi-table per metric | Same metric on different tables allowed | Service role |

### Not Yet Covered

| Test | Blocked By |
|------|-----------|
| POST /compute-baselines | RPC bug (42702) + needs Mode C auth |
| POST /persist-alerts | RPC bug (42703) + needs Mode C auth |
| POST /acknowledge-alert | Needs Mode C auth |
| GET /anomaly-alerts | Needs Mode C auth (RPC calls set_rls_context_from_staff) |
| Alert lifecycle (persist → read → ack) | RPC bugs + auth |
| Role gating (dealer denied) | Needs Mode B (browser) or per-request cookie auth |
| Cooldown suppression | Needs persist flow working first |

---

## Recommendation

Codify this into a governance-grade standard (QA-006) with:
1. Auth mode decision matrix
2. `.env.local.example` template
3. Shared fixture for `getDevAuthClient()` / `getAuthenticatedFetch()`
4. Serial-by-default configuration for seed-data tests
5. Pre-requisite checklist (local Supabase, migrations, seed data, ENABLE_DEV_AUTH)
