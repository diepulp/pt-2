# ADR-030: Auth System Hardening — End-to-End Enforcement

**Status:** Proposed
**Date:** 2026-01-29
**Owner:** Security/Platform
**Decision type:** Architecture + Security
**Supersedes:** None (extends ADR-024)
**Related:** ADR-015, ADR-020, ADR-024, SEC-001, SEC-002
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

**Tables affected first (highest sensitivity):** `staff`, `player`, `player_financial_transaction`, `visit`, `rating_slip`, `loyalty_ledger`

---

## Security Invariants

All invariants from ADR-024 remain in force. ADR-030 adds:

**INV-030-1:** `ctx.rlsContext` MUST be populated from the return value of `set_rls_context_from_staff()`, not from any independent derivation.

**INV-030-2:** JWT claim sync/clear failures MUST be surfaced to callers (no silent swallowing).

**INV-030-3:** `DEV_AUTH_BYPASS` MUST require `NODE_ENV=development` AND `ENABLE_DEV_AUTH=true`. Violation at startup is a hard failure.

**INV-030-4:** `skipAuth` MUST NOT appear in production source files (CI-enforced).

**INV-030-5:** Mutations (INSERT/UPDATE/DELETE) on security-critical tables MUST fail if `app.casino_id` session variable is absent, regardless of JWT claims.

**INV-030-6:** JWT fallback reliance during SELECT must be logged at the application layer.

---

## Consequences

### Positive

- **Deterministic context:** Eliminates TOCTOU drift — middleware, service logic, and Postgres policies all consume the same context from one RPC call
- **Observable claim lifecycle:** Stale JWT claims become visible through logging rather than silently granting access
- **Fail-closed writes:** Mutations cannot succeed on stale or absent session context, even if JWT metadata exists
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

---

## References

- [ADR-015: RLS Connection Pooling Strategy](./ADR-015-rls-connection-pooling-strategy.md) — Foundation: transaction-wrapped SET LOCAL
- [ADR-020: RLS Track A Hybrid Strategy](./ADR-020-rls-track-a-mvp-strategy.md) — MVP architecture selection
- [ADR-024: Context Self-Injection Remediation](./ADR-024_DECISIONS.md) — Authoritative context derivation
- [Auth Hardening Report](../00-vision/auth-hardening/PT-2_AUTH_SYSTEM_HARDENING_REPORT.md) — Audit findings
- [AUTH-HARDENING v0.1 Execution Patch](../00-vision/auth-hardening/AUTH-HARDENING-v0.1-EXECUTION-PATCH.md) — Implementation plan
- [SEC-001: RLS Policy Matrix](../30-security/SEC-001-rls-policy-matrix.md)
- [SEC-002: Casino-Scoped Security Model](../30-security/SEC-002-casino-scoped-security-model.md)

---

## Changelog

- 2026-01-29: Initial ADR proposed based on auth hardening audit and execution patch
