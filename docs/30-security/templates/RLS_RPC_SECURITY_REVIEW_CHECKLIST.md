# RLS/RPC Security Review Checklist

**Use when:** Reviewing PRs that create or modify RLS policies, RPC functions, or GRANT/REVOKE statements in `supabase/migrations/`.

**References:** SEC-007, ADR-015, ADR-018, ADR-024, ADR-030

---

## 1. RLS Policy Review

- [ ] **Casino scoping present** -- Every policy on a tenant-scoped table includes a `casino_id` predicate using Pattern C:
  ```
  casino_id = COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt()->'app_metadata'->>'casino_id')::uuid
  )
  ```
- [ ] **`auth.uid() IS NOT NULL` included** -- All policies require authentication (no anonymous access unless explicitly justified)
- [ ] **No `USING(true)` on tenant tables** -- Permissive `USING(true)` is banned on tenant-scoped tables; requires allowlist entry + linked ADR/SEC note if needed
- [ ] **`WITH CHECK` present on write policies** -- INSERT and UPDATE policies include `WITH CHECK` with casino scope + role gate; prevents `casino_id` mutation
- [ ] **Write policies have role gates** -- INSERT/UPDATE/DELETE restricted to appropriate `staff_role` (e.g., admin-only for `casino_settings`); not open to all authenticated users
- [ ] **Operations split (no `FOR ALL` with differing read/write rules)** -- If read and write access differ by role, use separate policies per operation (SELECT, INSERT, UPDATE, DELETE)

## 2. RPC Review

- [ ] **`set_rls_context_from_staff()` is the first meaningful statement after `BEGIN`** -- No SELECT, INSERT, UPDATE, DELETE, or `current_setting()` before context injection (prevents TOCTOU under connection pooling per ADR-030)
- [ ] **No spoofable identity parameters** -- Function does not accept `p_actor_id`, `p_casino_id`, or any parameter used to derive identity/tenant context (ADR-024 INV-7, INV-8)
- [ ] **SECURITY DEFINER governance (ADR-018)** -- If function uses SECURITY DEFINER:
  - [ ] `SET search_path = public` present
  - [ ] `REVOKE ALL ON FUNCTION ... FROM PUBLIC` included
  - [ ] Casino context validated (derived from session vars, not parameters)
  - [ ] Documented justification for why DEFINER is required
- [ ] **SECURITY INVOKER preferred** -- Simple CRUD and read operations use INVOKER to inherit caller's RLS context
- [ ] **No deprecated context functions** -- No calls to `set_rls_context()` (only `set_rls_context_from_staff()` or `set_rls_context_internal()`)

## 3. GRANT/REVOKE Review

- [ ] **No PUBLIC EXECUTE** -- Every `rpc_*` function includes `REVOKE ALL ON FUNCTION ... FROM PUBLIC`
- [ ] **Explicit grants to `authenticated` and `service_role` only** -- Standard pattern:
  ```sql
  REVOKE ALL ON FUNCTION rpc_xxx FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION rpc_xxx TO authenticated;
  GRANT EXECUTE ON FUNCTION rpc_xxx TO service_role;
  ```
- [ ] **Auth-flow exceptions documented** -- If PUBLIC EXECUTE is required (e.g., `rpc_bootstrap_casino`, `rpc_accept_staff_invite`), the grant includes a justification comment and linked SEC/ADR reference
- [ ] **Internal-only RPCs restricted** -- Functions called only by other RPCs or service_role have `REVOKE FROM authenticated` and are granted only to `service_role` (e.g., `rpc_get_rating_slip_duration`)

## 4. PostgREST Surface Review

- [ ] **No multiple overloads** -- `rpc_*` functions have exactly one signature; no overlapping overloads that could cause PostgREST named-arg ambiguity
- [ ] **No DEFAULT-arg ambiguity** -- If DEFAULT params exist, verify no other overload of the same function name exists; DEFAULT params on exposed RPCs must not create overlapping call signatures
- [ ] **No phantom overloads from `CREATE OR REPLACE`** -- When changing a function's parameter list, the old signature is DROPped first (PostgreSQL treats different param counts as distinct functions)
- [ ] **Dead parameters removed** -- No parameters that are accepted but ignored in the function body (e.g., `p_actor_id DEFAULT NULL` that is never read)

---

**Fail-fast rule:** If any box above is unchecked and unjustified, the PR must not merge. Add allowlist entries with inline justification + linked ADR/SEC reference for legitimate exceptions.
