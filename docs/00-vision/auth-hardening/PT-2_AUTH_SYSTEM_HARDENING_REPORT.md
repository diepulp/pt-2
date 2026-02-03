# PT-2 Auth System Hardening Report

_Date: January 30, 2026_

## 1. Current Auth Pipeline
- **Session middleware** (`lib/supabase/middleware.ts`) keeps Supabase cookies fresh and blocks anonymous browser navigation before API handlers execute.
- Every route/server action creates a Supabase client via `lib/supabase/server.ts` and immediately wraps business logic in `withServerAction`, ensuring the middleware chain runs uniformly.
- `withServerAction` composes `withAuth → withRLS → idempotency → audit → tracing`, so authentication and RLS context injection precede any domain mutations (`lib/server-actions/middleware/compositor.ts`).
- `withAuth` either derives a real staff context via `getAuthContext` or, when `NODE_ENV=development` and `DEV_AUTH_BYPASS` is truthy, swaps in the fixed `DEV_RLS_CONTEXT` and a service-role client for local work (`lib/server-actions/middleware/auth.ts`, `lib/supabase/dev-context.ts`, `lib/supabase/service.ts`).
- `withRLS` calls `injectRLSContext`, which executes `set_rls_context_from_staff` so Postgres session variables reflect `app.actor_id`, `app.casino_id`, and `app.staff_role` before any SQL runs (`lib/server-actions/middleware/rls.ts`, `lib/supabase/rls-context.ts`).

## 2. Staff Identity Mapping & Casino Scope
- `getAuthContext` enforces the canonical mapping `auth.uid() → staff.user_id → staff.id` and requires `status='active'` plus a non-null `casino_id` before returning an `RLSContext` (`lib/supabase/rls-context.ts`).
- Migration `20251110224223_staff_authentication_upgrade.sql` adds `staff.user_id` (FK to `auth.users`) and a partial unique index, guaranteeing one staff record per authenticated user.
- `set_rls_context_from_staff` (migration `20251229152317`) is the authoritative source of context. It optionally reads `app_metadata.staff_id`, validates it against `auth.uid()`, falls back to the `staff.user_id` lookup, and only sets `app.*` when the staff member is active and casino-scoped. Unit tests cover the UNAUTHORIZED/FORBIDDEN failure modes (`services/security/__tests__/rls-context.test.ts`).
- API handlers avoid trusting request payloads for actor/casino data. For example, the rating-slip POST route always reads `mwCtx.rlsContext!.casinoId`/`actorId` supplied by the middleware chain instead of using client values (`app/api/v1/rating-slips/route.ts`).

## 3. Casino Scope in RLS Policies
- RLS policies consistently scope access via the hybrid pattern `COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)` and apply the same technique for roles. Example: loyalty ledger insert policy (`supabase/migrations/20251213000820_prd004_loyalty_rls_cashier_role.sql`).
- Because policies fall back to JWT claims, correctness depends on `withRLS` always running. The ADR-024 audit explicitly calls out that skipping `withRLS` (e.g., using `{ skipAuth: true }`) would make policies rely entirely on whatever metadata is cached in the token (`docs/00-vision/rls-unified-strategy/atrifacts/API_TRANSPORT_AUTH_FLOW_AUDIT_20251214.md`).

## 4. JWT Claims Lifecycle & Hooks
- `syncUserRLSClaims` writes `{casino_id, staff_role, staff_id}` into `auth.users.app_metadata` using the service-role key so RLS policies have a fallback when session variables are absent (`lib/supabase/auth-admin.ts`).
- `CasinoService` invokes that helper after staff create/update, but the calls live inside `try/catch` blocks that silently ignore failures, making claims sync best-effort rather than guaranteed (`services/casino/crud.ts`).
- `clearUserRLSClaims` exists to strip metadata when staff lose access, yet only integration tests call it; no production code clears claims when `staff.user_id` becomes null or status flips to inactive (`lib/supabase/__tests__/rls-jwt-claims.integration.test.ts`).
- The audit doc notes JWTs stay stale until the user re-authenticates or code re-syncs claims, reinforcing that the RPC + session variables must run on every request.

## 5. Dev & Test Escape Hatches
- `DEV_AUTH_BYPASS` causes every request to run as the seeded pit boss with a service-role client; this is convenient for local work but would be catastrophic if enabled in any non-dev environment.
- `withServerAction` exposes `skipAuth`, currently used only in tests/docs, yet nothing prevents a production handler from passing it and falling back solely to JWT claims.
- Service-role clients (e.g., for fixtures or seeds) bypass RLS entirely, so usage outside controlled scripts must be guarded.

## 6. Hardening Opportunities
1. **Make JWT claim sync authoritative.**
   - Remove silent catch blocks around `syncUserRLSClaims`/`clearUserRLSClaims` and surface failures to the caller.
   - Add database triggers or a background job to enforce claim sync whenever `staff.user_id`, `staff.casino_id`, `staff.role`, or `staff.status` changes, and to clear claims when staff lose auth privileges.
2. **Eliminate TOCTOU between `getAuthContext` and the RPC.**
   - Extend `set_rls_context_from_staff` to return the context it sets (actor/casino/role) and populate `ctx.rlsContext` directly from the RPC response. That way middleware, services, and policies all consume the exact same source of truth.
3. **Restrict bypass knobs.**
   - Require an explicit allowlist (e.g., `process.env.ENABLE_DEV_AUTH === 'true'` AND `NODE_ENV==='development'`) before `withAuth` drops into service-role mode.
   - Add telemetry/alerts whenever `{ skipAuth: true }` is used outside test helpers so accidental production usage is caught immediately.
4. **Observe JWT fallback reliance.**
   - Emit structured logs or metrics when `set_rls_context_from_staff` is skipped/fails and when policies match only via the JWT branch. This provides early warning for stale claims or middleware regressions.
5. **Document service-role usage.**
   - Maintain a short catalog of approved service-role entry points (seed scripts, admin tooling) and assert via lint/tests that application code never creates service-role clients outside those contexts.

## 7. Suggested Next Actions
- Inventory every route/server action to confirm none use `skipAuth` in production builds; add tests preventing regressions.
- Wire claim-sync enforcement into the casino service (and/or database triggers) so JWT metadata updates/clears reliably when staff attributes change.
- Prototype an enhanced `set_rls_context_from_staff` RPC that returns the derived context, update middleware to consume it, and add telemetry around the RPC call success rate.
