# AUTH-HARDENING v0.1 — Execution Patch (PT‑2)

**Status:** Proposed  
**Date:** 2026-01-29  
**Scope:** Auth/RLS reliability hardening (multi-tenant SaaS baseline)  
**Primary Sources:** `PT-2_AUTH_SYSTEM_HARDENING_REPORT.md`  

---

## 0) Intent

PT‑2 already uses the correct security spine for multi-tenant SaaS: **Postgres RLS is the enforcement boundary**, and requests run through **`withAuth → withRLS → set_rls_context_from_staff()`**. The problem is *reliability*: several “fallback” and “bypass” paths can cause tenant isolation and role evaluation to silently depend on stale JWT metadata or service-role execution.

This patch converts auth correctness from **best-effort** to **enforced** without expanding the domain model.

---

## 1) Goals (v0.1)

1. **Single source of truth for request context**
   - Eliminate TOCTOU drift between `getAuthContext` and `set_rls_context_from_staff()` by returning the derived context from the RPC and using it everywhere.

2. **Authoritative JWT claims lifecycle (only as bootstrap / fallback)**
   - Claim sync and claim clearing must be deterministic (no silent swallowing).
   - Stale claims become observable.

3. **Bypass knobs locked down**
   - `DEV_AUTH_BYPASS` and `{ skipAuth: true }` must not be able to slip into production behavior unnoticed.

4. **Regression-preventing tests**
   - Explicit tests ensure every production entrypoint passes through the auth chain and context RPC.

---

## 2) Non-goals (explicitly deferred)

- Adding `company_id` to the RLS security model or implementing “company-scoped access”.
- Replacing Supabase Auth (Clerk/Auth0/WorkOS/etc.).
- Introducing new role hierarchy or multi-casino membership changes.
- Material schema changes beyond what’s required for the auth/RLS correctness work.

These are tracked separately; do not pull them into v0.1.

---

## 3) Definition of Done (DoD)

- [ ] `set_rls_context_from_staff()` returns `{ actor_id, casino_id, staff_role }` and middleware uses *only this* to populate `ctx.rlsContext`.
- [ ] Claim sync/clear calls are **not** silently ignored; failures surface (throw or structured failure result) and are logged.
- [ ] `DEV_AUTH_BYPASS` requires **(NODE_ENV=development AND ENABLE_DEV_AUTH=true)**; otherwise hard fail at boot.
- [ ] `{ skipAuth: true }` is restricted to test helpers; production builds fail a test if any non-test file uses it.
- [ ] Telemetry/logging exists for:
  - RPC context set success/failure
  - any JWT-branch reliance in policies (v0.1: app-layer logging; v0.2: DB-side metrics)
- [ ] Minimal test suite added/updated to prevent regressions in: auth chain, context RPC, claim lifecycle, bypass gating.

---

## 4) Execution Plan (sequenced PRs)

### PR-1: Context RPC is the only source of truth (TOCTOU removal)

**Why:** The hardening report flags TOCTOU drift; the RPC is already authoritative, so middleware should consume its output directly.

**Work:**
1. Update `set_rls_context_from_staff()` to **RETURN the derived context** it sets:
   - `actor_id` (staff.id / UUID)
   - `casino_id` (UUID)
   - `staff_role` (enum/text)
2. Update `withRLS` to set `ctx.rlsContext` strictly from the RPC return payload.
3. Remove any duplicate derivation in `getAuthContext` beyond “authenticated + staff lookup for early rejects”.

**Acceptance tests:**
- If RPC returns context → `ctx.rlsContext` matches exactly.
- If RPC rejects (unauthorized/forbidden) → request fails before service logic runs.
- `ctx.rlsContext` never comes from client payload.

**SQL sketch (adapt to your current RPC body):**
```sql
-- signature change: return derived context to middleware
create or replace function public.set_rls_context_from_staff()
returns table (
  actor_id uuid,
  casino_id uuid,
  staff_role public.staff_role
)
language plpgsql
security definer
as $$
begin
  -- existing derivation & validation logic...
  -- set_config('app.actor_id', ...), set_config('app.casino_id', ...), set_config('app.staff_role', ...)

  actor_id := (current_setting('app.actor_id'))::uuid;
  casino_id := (current_setting('app.casino_id'))::uuid;
  staff_role := (current_setting('app.staff_role'))::public.staff_role;

  return next;
end;
$$;
```

**Files likely touched:**
- `supabase/migrations/*_set_rls_context_from_staff*.sql`
- `lib/supabase/rls-context.ts`
- `lib/supabase/server-action-middleware/*` (where `withRLS` lives)

---

### PR-2: Claims lifecycle becomes authoritative (no silent failure)

**Why:** `syncUserRLSClaims` is currently best-effort and `clearUserRLSClaims` isn’t reliably used in production paths. That creates stale authorization state.

**Work:**
1. Replace silent `try/catch` around:
   - `syncUserRLSClaims(...)`
   - `clearUserRLSClaims(...)`
   with either:
   - throwing errors (preferred for admin/staff mutation endpoints), or
   - returning a typed failure that is handled explicitly.
2. Enforce claim clearing when staff lose access:
   - `status` flips inactive
   - `user_id` removed
   - `casino_id` removed
3. Add a single “claims reconcile” function used by `CasinoService` and any admin mutation path.

**Notes:**
- JWT claims are still *secondary* to session vars. They exist as bootstrap / fallback, not as the primary enforcement mechanism.

**Acceptance tests:**
- staff create/update triggers claim sync exactly once (idempotent).
- staff deactivate triggers claim clearing.
- failures are surfaced and visible in logs/tests.

**Files likely touched:**
- `services/casino/crud.ts`
- `lib/supabase/auth-admin.ts`
- `lib/supabase/__tests__/rls-jwt-claims.integration.test.ts`

---

### PR-3: Bypass knobs are jailed + instrumented

**Why:** `DEV_AUTH_BYPASS` + service-role mode is catastrophic outside local dev; `{ skipAuth: true }` can accidentally bypass the chain.

**Work:**
1. Gate `DEV_AUTH_BYPASS` with two switches:
   - `NODE_ENV === 'development'`
   - `ENABLE_DEV_AUTH === 'true'`
   Otherwise **throw at startup**.
2. Enforce `{ skipAuth: true }` only in:
   - test helpers (e.g., `__tests__`, `test-utils`)
   - seed scripts under a dedicated path
3. Add telemetry:
   - log an error-level event whenever skipAuth is used (even in tests), so accidental usage is searchable.
4. Add a CI test that fails if `skipAuth` appears in non-test files.

**Acceptance tests:**
- build/CI fails if skipAuth is used outside allowed paths
- prod runtime cannot start with bypass envs set

**Files likely touched:**
- `lib/supabase/middleware.ts`
- `lib/supabase/server-action-middleware/*`
- test / lint configuration

---

### PR-4: (Small) RLS reliability tightening — “write requires session vars”

**Why:** Policies currently fall back to JWT claims via `COALESCE(current_setting(...), auth.jwt()->app_metadata...)`. That makes correctness depend on claim freshness when middleware is skipped.

**v0.1 stance:** tighten **writes** first; leave reads as-is for now to avoid widespread breakage.

**Work:**
1. For INSERT/UPDATE/DELETE policies, require:
   - `current_setting('app.casino_id', true)` is present (non-empty)
   - `current_setting('app.actor_id', true)` is present (non-empty)
2. Keep JWT fallback only for SELECT policies (until v0.2), and add logging in app when JWT fallback is exercised.

**Acceptance tests:**
- writes without context RPC fail (even if JWT metadata exists)
- writes with context RPC succeed

**Files likely touched:**
- the most sensitive tables first: `staff`, `player_*`, `visit`, `rating_slip`, `loyalty_ledger`, `player_financial_transaction`

---

## 5) Observability (minimal, v0.1)

Add structured logging (server-side) for:
- `set_rls_context_from_staff` success/failure (include staff_id/casino_id if available)
- usage of bypasses (`DEV_AUTH_BYPASS`, `skipAuth`)
- explicit “claims sync failed” / “claims clear failed” events

**Do not** build a full metrics pipeline in v0.1. Just make failures visible and grep-able.

---

## 6) Rollout & Risk Control

1. Land PR‑1 first (TOCTOU removal). It’s low risk and makes everything else deterministic.
2. Land PR‑2 next (claims lifecycle). This is where stale access bugs get eliminated.
3. Land PR‑3 (bypass lockdown). Prevents accidental self-foot-shooting.
4. Land PR‑4 last (write tightening) with targeted table rollout if needed.

---

## 7) Post‑v0.1 follow-ups (tracked, not in scope)

- Close the `company` RLS gap / decide whether company becomes a security boundary.
- Add “casino is active” validation inside `set_rls_context_from_staff` (if not already present).
- Move “JWT fallback reliance” visibility to DB-side counters/metrics.

---

## 8) Quick Audit Checklist (before merging v0.1)

- [ ] No production route/server action uses `skipAuth`
- [ ] No non-dev environment can run with bypass auth enabled
- [ ] RPC return context used everywhere (no second derivation)
- [ ] Claim sync/clear has explicit error handling
- [ ] Writes cannot succeed without `app.*` context
