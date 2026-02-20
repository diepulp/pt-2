# ADR-030: Auth System Hardening — End-to-End Enforcement

**Status:** Accepted
**Date:** 2026-01-29
**Owner:** Security/Platform
**Decision type:** Architecture + Security
**Supersedes:** None (extends ADR-024)
**Related:** ADR-015, ADR-020, ADR-024, ADR-035, SEC-001, SEC-002
**Source:** `docs/00-vision/auth-hardening/PT-2_AUTH_SYSTEM_HARDENING_REPORT.md`, `docs/00-vision/auth-hardening/AUTH-HARDENING-v0.1-EXECUTION-PATCH.md`

---

## Context

### Security Architecture Evolution

PT-2's auth/RLS security model has matured through three prior ADRs:

| ADR | What it solved | Residual gap |
|-----|---------------|--------------|
| **ADR-015** (2025-12-10) | Connection pooling: `SET LOCAL` in a single transaction via `set_rls_context()` RPC | RPC accepted spoofable parameters from callers |
| **ADR-020** (2025-12-15) | Track A hybrid strategy: `COALESCE(session_var, jwt_claim)` for MVP | JWT claims are best-effort; staleness undetectable |
| **ADR-024** (2025-12-29) | Context spoofing: replaced `set_rls_context()` with authoritative `set_rls_context_from_staff()` | RPC does not return derived context; middleware still dual-derives |

After ADR-024, the RPC is the authoritative source. However, the system-wide auth pipeline has four remaining reliability gaps:

### Gap 1: TOCTOU Between `getAuthContext` and the Context RPC

The middleware chain runs two independent derivations:

1. `withAuth` calls `getAuthContext()` — queries `staff` table via Supabase client, sets `ctx.rlsContext`
2. `withRLS` calls `injectRLSContext()` → `set_rls_context_from_staff()` — re-derives context inside Postgres

If a staff record changes between steps 1 and 2 (e.g., deactivation, casino reassignment), middleware holds stale context while Postgres holds the correct one. Service logic consuming `ctx.rlsContext` operates on the stale value.

**Current code** (`lib/supabase/rls-context.ts:97-112`): `injectRLSContext` calls the RPC but discards its result; `_context` parameter is vestigial.

### Gap 2: JWT Claims Lifecycle Is Best-Effort

`syncUserRLSClaims` and `clearUserRLSClaims` (`lib/supabase/auth-admin.ts`) throw on failure, but callers in `CasinoService` (`services/casino/crud.ts`) wrap them in silent `try/catch` blocks. Additionally:

- `clearUserRLSClaims` is never called in production when staff status flips to inactive or `user_id` is removed
- Stale JWT claims are undetectable — no logging or metrics exist for fallback reliance

### Gap 3: Bypass Knobs Are Under-Gated

**`DEV_AUTH_BYPASS`** (`lib/supabase/dev-context.ts:61-68`): Currently enabled by default in development unless explicitly set to `'false'`. Any misconfigured deployment running `NODE_ENV=development` gets full service-role bypass.

**`skipAuth`** (`lib/server-actions/middleware/compositor.ts:106-109`): Accepted as a plain boolean option on `withServerAction`. Nothing prevents a production handler from passing `{ skipAuth: true }`, which silently skips both `withAuth` and `withRLS`.

### Gap 4: Write-Path RLS Falls Back to JWT Claims

All RLS policies (reads and writes) use the Pattern C hybrid:
```sql
COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)
```

If `withRLS` is skipped (via `skipAuth`, error, or misconfiguration), writes succeed using whatever stale claims exist in the JWT. For mutations, this is unacceptable — the system should fail closed.

---

## Decision

### D1: Context RPC Is the Single Source of Truth

**`set_rls_context_from_staff()` must return the derived context it sets.**

The RPC signature changes from `RETURNS void` to `RETURNS TABLE(actor_id uuid, casino_id uuid, staff_role public.staff_role)`.

Middleware (`withRLS`) must:
1. Call the RPC
2. Populate `ctx.rlsContext` strictly from the RPC return payload
3. Not perform any independent staff lookup for context derivation

`getAuthContext()` remains as an early-reject gate in `withAuth` (is the user authenticated? is there an active staff record?), but it no longer populates `ctx.rlsContext`. That responsibility moves entirely to `withRLS` via the RPC return value.

**Invariant:** `ctx.rlsContext` and the Postgres session variables `app.actor_id`, `app.casino_id`, `app.staff_role` are always identical — they come from the same RPC call.

### D2: JWT Claims Lifecycle Becomes Authoritative

Claim sync and claim clearing must not be silently swallowed.

1. **Remove silent `try/catch`** around `syncUserRLSClaims()` and `clearUserRLSClaims()` in all callers. Failures must either throw (for staff mutation endpoints) or return a typed failure result that the caller handles explicitly.

2. **Enforce claim clearing** when staff lose authorization:
   - `status` flips to `inactive`
   - `user_id` is set to `NULL`
   - `casino_id` is removed

3. **Add structured logging** on sync success, sync failure, and clear events so claim state is observable.

**Invariant:** JWT `app_metadata` claims are always either current (reflecting live `staff` table state) or absent (cleared). They are never silently stale.

### D3: Bypass Knobs Are Jailed

**`DEV_AUTH_BYPASS`** requires two switches:
- `NODE_ENV === 'development'`
- `process.env.ENABLE_DEV_AUTH === 'true'`

If either condition is missing, the bypass is disabled. If `DEV_AUTH_BYPASS` environment variable is set but the two-switch gate fails, the application must throw at startup rather than silently proceeding without bypass.

**`skipAuth`** is restricted to:
- Files under `__tests__/`, `test-utils/`, or `*.test.*` patterns
- Seed scripts under designated paths (e.g., `scripts/seed/`)

A CI lint check must fail if `skipAuth` appears in any production source file. An error-level structured log is emitted whenever `skipAuth` is exercised, even in allowed paths.

### D4: Write-Path RLS Requires Session Variables

For `INSERT`, `UPDATE`, and `DELETE` policies on security-critical tables, replace the COALESCE fallback with a hard requirement:

```sql
-- Before (Pattern C hybrid — allows JWT fallback):
casino_id = COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)

-- After (write path — session vars required):
casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
```

`SELECT` policies retain the COALESCE fallback for now (v0.1 scope) to avoid widespread breakage. Application-layer logging is added to detect when the JWT branch is exercised during reads, providing data for a future v0.2 tightening.

**Tables affected first (highest sensitivity):** `staff`, `player_financial_transaction`, `visit`, `rating_slip`, `loyalty_ledger`

> **Note (PRD-034):** `player` was removed from the D4 critical list. Its write policies use COALESCE (PostgREST-compatible), and `updatePlayer()` uses PostgREST DML. Tightening would break this path without a compensating RPC migration. `player` remains Category B.

#### Category A Table Registry (Machine-Readable)

The following block is the canonical source of truth for Category A tables. It is consumed by `scripts/generate-category-a-config.ts` to produce `config/rls-category-a-tables.json`. Do not edit manually — update this list and run `npm run generate:category-a`.

<!-- CATEGORY-A-REGISTRY -->
- `staff`
- `staff_pin_attempts`
- `staff_invite`
- `player_casino`
<!-- /CATEGORY-A-REGISTRY -->

### D5: Template 2b Writes Must Use Self-Contained RPCs (Transport Constraint)

**Status:** Accepted
**Date:** 2026-02-10
**Trigger:** ISSUE-SET-PIN-SILENT-RLS-FAILURE — `setPinAction` silently wrote 0 rows against a Template 2b policy

D4 specifies **what** the RLS policy must look like (no COALESCE fallback). D5 specifies **how** application code must interact with it.

#### The Transport Problem

`set_rls_context_from_staff()` uses `set_config(name, val, true)` — **transaction-local**. The `withServerAction` middleware calls this RPC as one PostgREST HTTP request (Transaction A). The handler's `.from(table).update()` is a separate HTTP request (Transaction B). Session vars from Transaction A do not exist in Transaction B.

```
withServerAction middleware chain:

  withRLS → supabase.rpc('set_rls_context_from_staff')  ← HTTP request #1, Transaction A
    └─ SET LOCAL app.casino_id = '...'                   ← transaction-local, lost on commit

  handler → supabase.from('staff').update({ pin_hash })  ← HTTP request #2, Transaction B
    └─ RLS evaluates: casino_id = current_setting('app.casino_id') → NULL
    └─ 0 rows match. PostgREST returns success. Nothing written.
```

Template 2b policies evaluate `casino_id = NULL` → always false → UPDATE/INSERT/DELETE silently affects 0 rows → action returns `ok: true` with no data persisted.

#### The Rule

**If an RLS policy depends on `current_setting('app.*')` with no JWT COALESCE fallback (Template 2b), then:**

1. **PROHIBITED:** `.from(table).insert()`, `.from(table).update()`, `.from(table).delete()` in application code (server actions, services, route handlers). These are separate PostgREST transactions — session vars are not available.

2. **REQUIRED:** All writes MUST go through a SECURITY DEFINER RPC (`rpc_*`) that calls `set_rls_context_from_staff()` as its first statement. The RPC body executes the DML within the same transaction where session vars were set.

3. **RPC template:**
   ```sql
   CREATE FUNCTION public.rpc_{action}_{table}(...)
   RETURNS ...
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = pg_catalog, public
   AS $$
   DECLARE
     v_staff_id  uuid;
     v_casino_id uuid;
   BEGIN
     -- Step 1: Context injection (same transaction)
     PERFORM public.set_rls_context_from_staff();
     v_staff_id  := NULLIF(current_setting('app.actor_id', true), '')::uuid;
     v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

     IF v_staff_id IS NULL OR v_casino_id IS NULL THEN
       RAISE EXCEPTION 'UNAUTHORIZED: RLS context not available'
         USING ERRCODE = 'P0001';
     END IF;

     -- Step 2: DML with row-level gating
     UPDATE {table} SET ...
     WHERE id = v_staff_id AND casino_id = v_casino_id AND status = 'active';

     IF NOT FOUND THEN
       RAISE EXCEPTION 'NOT_FOUND: target record not accessible'
         USING ERRCODE = 'P0002';
     END IF;
   END;
   $$;

   -- ADR-018 lockdown
   REVOKE ALL ON FUNCTION public.rpc_{action}_{table}(...) FROM PUBLIC;
   REVOKE ALL ON FUNCTION public.rpc_{action}_{table}(...) FROM anon;
   GRANT EXECUTE ON FUNCTION public.rpc_{action}_{table}(...) TO authenticated;
   ```

4. **Application code calls:**
   ```ts
   // CORRECT — single transaction, session vars available
   await mwCtx.supabase.rpc('rpc_set_staff_pin', { p_pin_hash: pinHash });

   // WRONG — separate transaction, session vars lost
   await mwCtx.supabase.from('staff').update({ pin_hash: pinHash }).eq('id', staffId);
   ```

#### Conformance Examples

| Operation | Conforms? | Pattern |
|-----------|-----------|---------|
| `rpc_increment_pin_attempt()` | Yes | Self-contained RPC, internal `set_rls_context_from_staff()` |
| `rpc_clear_pin_attempts()` | Yes | Same |
| `rpc_create_financial_txn()` | Yes | Same |
| `setPinAction` → `.from('staff').update()` | **No** | Direct PostgREST DML against Template 2b policy |

#### Lint / Review Guards

1. **CI grep guard:** Fail if any `.from('staff').update(` or `.from('staff').insert(` or `.from('staff').delete(` appears in `app/` or `services/` code. Extend to all Template 2b tables as policies are migrated.

2. **Code review checklist item:** "Does this write target a table with a Template 2b RLS policy? If yes, verify the write uses an `rpc_*` function, not direct PostgREST DML."

3. **Migration review:** When adding a Template 2b policy to a table, audit all existing `.from(table)` write calls in the codebase and migrate them to RPCs in the same PR.

### D6: Onboarding Bootstrap Mode (Middleware Relaxation)

**Status:** Accepted
**Date:** 2026-02-16
**Trigger:** ISSUE-RLS-CONTEXT-INJECTION-ONBOARDING-CHICKEN-EGG — Setup wizard server actions fail because `withRLS()` unconditionally calls the context RPC with a service-role client (dev bypass) or stale JWT (production), and `withAuth()` requires staff before `withRLS()` can run.

During onboarding/bootstrap, steady-state invariants (D1 staff requirement, D2 claim freshness) do not yet hold. D6 codifies the middleware relaxations and the claims refresh barrier.

#### Onboarding Rules

1. **`requireSession = true`, `requireStaff = false`** for bootstrap actions. The `bootstrapAction` and setup wizard actions that run before or immediately after tenant provisioning may encounter users without a staff record or with stale JWT claims. These actions use `skipAuth: true` (bootstrap) or require only session validation (setup wizard after refresh).

2. **`withRLS()` must respect dev bypass context.** When `isDevAuthBypassEnabled()` is true and `ctx.rlsContext` is already populated by `withAuth()`, `withRLS()` MUST skip the `set_rls_context_from_staff()` RPC. The service-role client has no `auth.uid()`, so the RPC will always fail. (INV-030-8)

3. **Mandatory claims refresh barrier.** After any operation that writes JWT claims via `reconcileStaffClaims()` / `syncUserRLSClaims()`, the client flow MUST call `await supabase.auth.refreshSession()` before navigating to RLS-gated routes. This ensures the cookie JWT carries the newly-minted `staff_id` / `casino_id` / `staff_role` claims. Affected flows:
   - Bootstrap form (`/bootstrap`) — after `rpc_bootstrap_casino` succeeds
   - Invite acceptance (`/invite/accept`) — after `rpc_accept_staff_invite` succeeds
   - All navigation exit points (buttons, timeouts, redirects) must await refresh

4. **Tenant-empty guard for bootstrap admin.** Bootstrap admin assignment (`staff_role = admin`) is a one-time privilege, allowed only when the tenant is "empty" (no existing staff for the casino). Once any staff exists, onboarding uses controlled enrollment (invite links or admin-created accounts). Enforced by `rpc_bootstrap_casino`.

#### Context Merge Precedence

`ctx.rlsContext` sources merge with the following precedence (highest wins):
1. Explicit dev context (`DEV_RLS_CONTEXT`, dev bypass only)
2. RPC-derived context (`set_rls_context_from_staff()` return value)
3. JWT fallback (`auth.jwt() -> app_metadata`)
4. Empty (no context — action must handle gracefully or fail)

`withRLS()` MUST NOT overwrite a higher-precedence source with a lower one.

#### Scope

D6 applies only to onboarding routes (`/bootstrap`, `/setup`, `/invite/accept`). All other routes continue to enforce steady-state invariants (D1-D5). See [Appendix A](./ADR-030_APPENDIX-A_onboarding-bootstrap-mode.md) for the full execution policy, implementation checklist, and end-to-end flow.

---

## Security Invariants

All invariants from ADR-024 remain in force. ADR-030 adds:

**INV-030-1:** `ctx.rlsContext` MUST be populated from the return value of `set_rls_context_from_staff()`, not from any independent derivation. **Exception:** When dev bypass is active (INV-030-3), `ctx.rlsContext` is populated from `DEV_RLS_CONTEXT` and the RPC is skipped, because the service-role client has no `auth.uid()`.

**INV-030-2:** JWT claim sync/clear failures MUST be surfaced to callers (no silent swallowing).

**INV-030-3:** `DEV_AUTH_BYPASS` MUST require `NODE_ENV=development` AND `ENABLE_DEV_AUTH=true`. Violation at startup is a hard failure.

**INV-030-4:** `skipAuth` MUST NOT appear in production source files (CI-enforced). **Exception:** Onboarding bootstrap actions (`/bootstrap`, `/invite/accept`) that run before staff/casino context exists are exempt; these MUST be explicitly allowlisted and logged.

**INV-030-5:** Mutations (INSERT/UPDATE/DELETE) on security-critical tables MUST fail if `app.casino_id` session variable is absent, regardless of JWT claims.

**INV-030-6:** JWT fallback reliance during SELECT must be logged at the application layer.

**INV-030-7:** Writes against Template 2b policies (session-var-only, no JWT COALESCE) MUST use self-contained SECURITY DEFINER RPCs that call `set_rls_context_from_staff()` internally. Direct PostgREST DML (`.from(table).insert/update/delete`) is PROHIBITED because session vars are transaction-local and do not survive across separate HTTP requests. (D5)

**INV-030-8:** In dev bypass mode (INV-030-3), `withRLS()` MUST NOT call `set_rls_context_from_staff()` because the service-role client lacks `auth.uid()`. The `ctx.rlsContext` set by `withAuth()` from `DEV_RLS_CONTEXT` is authoritative in dev bypass mode. (D6)

---

## Consequences

### Positive

- **Deterministic context:** Eliminates TOCTOU drift — middleware, service logic, and Postgres policies all consume the same context from one RPC call
- **Observable claim lifecycle:** Stale JWT claims become visible through logging rather than silently granting access
- **Fail-closed writes:** Mutations cannot succeed on stale or absent session context, even if JWT metadata exists
- **Silent-write prevention (D5):** Template 2b writes must go through self-contained RPCs, eliminating the class of bugs where PostgREST DML silently affects 0 rows due to transaction-boundary session var loss
- **Defense in depth:** Bypass knobs are double-gated and CI-enforced, preventing accidental production exposure
- **Auditable:** Structured logging provides grep-able evidence of auth pipeline health

### Negative

- **Additional RPC overhead:** `set_rls_context_from_staff()` now returns data, adding marginal serialization cost (negligible at PT-2 scale)
- **Migration effort:** Write-path RLS policies on ~6 tables need updating; callers of claim sync need error-handling refactors
- **Stricter dev setup:** Developers must explicitly set `ENABLE_DEV_AUTH=true` in `.env.local` (one-time action)

### Neutral

- `getAuthContext` continues to serve as an early-reject gate — it prevents unnecessary RPC calls for unauthenticated users
- Existing Pattern C hybrid is retained for SELECT policies; no widespread RLS rewrite required
- ADR-024 invariants (INV-1 through INV-8) are unaffected; this ADR extends them

---

## Alternatives Considered

### Alt 1: Remove `getAuthContext` Entirely

Rely solely on the RPC for all auth validation.

**Rejected:** `getAuthContext` provides a fast early-reject before incurring the cost of a Postgres RPC call. For unauthenticated requests, this saves a round-trip.

### Alt 2: Full Track B Migration (JWT-Only, No Session Vars)

Rewrite all 116 RLS policies to use only `auth.jwt()` claims.

**Deferred:** Per ADR-020, Track B requires stable production data on JWT reliability. ADR-030 makes the current hybrid architecture deterministic and observable, providing the data needed to justify a future Track B migration.

### Alt 3: Database Triggers for Claim Sync Instead of Application-Layer Enforcement

Use Postgres triggers on `staff` table to call Supabase Auth API for claim sync.

**Rejected for v0.1:** Postgres-to-Auth-API calls introduce network dependencies inside transactions. Application-layer enforcement in `CasinoService` is simpler and already partially implemented.

---

## Execution Sequence

The hardening work is sequenced to minimize risk:

| PR | Scope | Risk | Dependency |
|----|-------|------|------------|
| **PR-1** | D1 — Context RPC returns + middleware consumes | Low | None |
| **PR-2** | D2 — Claims lifecycle becomes authoritative | Medium | None (independent of PR-1) |
| **PR-3** | D3 — Bypass knob lockdown + CI lint | Low | None |
| **PR-4** | D4 — Write-path RLS tightening | Medium | PR-1 (context must be deterministic first) |

PR-1 and PR-2/PR-3 can be developed in parallel. PR-4 depends on PR-1.

Detailed execution plan: `docs/00-vision/auth-hardening/AUTH-HARDENING-v0.1-EXECUTION-PATCH.md`

---

## Observability (v0.1 — Minimal)

Structured server-side logging for:

| Event | Level | Fields |
|-------|-------|--------|
| `rls_context.set.success` | info | `staff_id`, `casino_id`, `staff_role`, `correlation_id` |
| `rls_context.set.failure` | error | `error`, `correlation_id` |
| `claims.sync.success` | info | `user_id`, `staff_id` |
| `claims.sync.failure` | error | `user_id`, `error` |
| `claims.clear.success` | info | `user_id` |
| `claims.clear.failure` | error | `user_id`, `error` |
| `bypass.dev_auth` | warn | `actor_id`, `casino_id` |
| `bypass.skip_auth` | error | `file`, `action` |
| `rls.jwt_fallback.read` | warn | `table`, `correlation_id` |

Full metrics pipeline deferred to v0.2.

---

## Verification

### Definition of Done

- [ ] `set_rls_context_from_staff()` returns `{actor_id, casino_id, staff_role}` and middleware uses only this
- [ ] `ctx.rlsContext` never comes from `getAuthContext` — only from RPC return
- [ ] Claim sync/clear failures throw or return typed failures (no silent catch)
- [ ] Claim clearing fires on staff deactivation and `user_id` removal
- [ ] `DEV_AUTH_BYPASS` requires `NODE_ENV=development` + `ENABLE_DEV_AUTH=true`
- [ ] CI test fails if `skipAuth` appears in non-test source files
- [ ] INSERT/UPDATE/DELETE policies on critical tables require `app.casino_id` session var
- [ ] Structured logging present for all events in observability table
- [ ] Regression tests cover: auth chain, context RPC return, claim lifecycle, bypass gating

### Quick Audit Checklist (Before Merge)

- [ ] No production route/server action uses `skipAuth`
- [ ] No non-dev environment can run with bypass auth enabled
- [ ] RPC return context used everywhere (no second derivation)
- [ ] Claim sync/clear has explicit error handling
- [ ] Writes cannot succeed without `app.*` session context
- [ ] No `.from(table).insert/update/delete` against Template 2b tables in `app/` or `services/` code
- [ ] All Template 2b writes use `rpc_*` functions with internal `set_rls_context_from_staff()`

---

## References

- [ADR-015: RLS Connection Pooling Strategy](./ADR-015-rls-connection-pooling-strategy.md) — Foundation: transaction-wrapped SET LOCAL
- [ADR-020: RLS Track A Hybrid Strategy](./ADR-020-rls-track-a-mvp-strategy.md) — MVP architecture selection
- [ADR-024: Context Self-Injection Remediation](./ADR-024_DECISIONS.md) — Authoritative context derivation
- [Auth Hardening Report](../00-vision/auth-hardening/PT-2_AUTH_SYSTEM_HARDENING_REPORT.md) — Audit findings
- [AUTH-HARDENING v0.1 Execution Patch](../00-vision/auth-hardening/AUTH-HARDENING-v0.1-EXECUTION-PATCH.md) — Implementation plan
- [SEC-001: RLS Policy Matrix](../30-security/SEC-001-rls-policy-matrix.md)
- [SEC-002: Casino-Scoped Security Model](../30-security/SEC-002-casino-scoped-security-model.md)
- [ADR-030 Appendix A: Onboarding Bootstrap Mode](./ADR-030_APPENDIX-A_onboarding-bootstrap-mode.md) — Execution policy for D6
- [Onboarding Gap Resolution](../00-vision/company-onboarding/ONBOARDING-BOOTSTRAP-ADMIN-STAFF-ROLE-GAP.md) — Bootstrap admin provisioning algorithm
- [ISSUE: RLS Context Injection](../issues/ISSUE-RLS-CONTEXT-INJECTION-ONBOARDING-CHICKEN-EGG.md) — Root cause analysis

---

## Changelog

- 2026-02-16: **D6 amendment** — Onboarding bootstrap mode (INV-030-8). Triggered by ISSUE-RLS-CONTEXT-INJECTION-ONBOARDING-CHICKEN-EGG: `withRLS()` unconditionally called the context RPC with a service-role client (dev bypass) or stale JWT (production), blocking setup wizard actions. Codifies: dev bypass skips RPC injection; mandatory `refreshSession()` barrier after claims writes; context merge precedence. Added INV-030-1 dev bypass exception and INV-030-4 onboarding exemption. See [Appendix A](./ADR-030_APPENDIX-A_onboarding-bootstrap-mode.md).
- 2026-02-10: **D5 amendment** — Template 2b transport constraint (INV-030-7). Triggered by ISSUE-SET-PIN-SILENT-RLS-FAILURE: `setPinAction` silently failed because PostgREST DML runs in a separate transaction from the middleware's RPC context injection. Codifies: Template 2b writes MUST use self-contained SECURITY DEFINER RPCs.
- 2026-01-30: Status updated to Accepted — implementation landed in commit 32890bf
- 2026-01-29: Initial ADR proposed based on auth hardening audit and execution patch
