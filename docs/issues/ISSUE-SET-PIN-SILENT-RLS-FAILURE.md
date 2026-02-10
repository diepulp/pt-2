# ISSUE: setPinAction Silently Fails — Template 2b RLS Policy + Transaction-Local Session Vars

**Status:** Resolved
**Severity:** High (feature-breaking)
**Affected Feature:** GAP-SIGN-OUT — Lock Screen PIN setup
**Discovered:** 2026-02-10
**Resolved:** 2026-02-10
**Spec Reference:** `docs/20-architecture/specs/GAP-SIGN-OUT/EXECUTION-SPEC-GAP-SIGN-OUT.md` (WS5, WS6)
**Resolution:** `rpc_set_staff_pin` SECURITY DEFINER RPC (migration `20260210134652`), `setPinAction` refactored to use RPC

---

## Symptom

1. User locks the screen for the first time (no PIN set).
2. Lock screen correctly shows "Create Your PIN" mode.
3. User enters and confirms a PIN. `setPinAction` returns `ok: true`. Screen unlocks.
4. User locks the screen again.
5. Lock screen briefly flashes "Screen Locked" (loading state), then shows "Create Your PIN" again instead of "Enter PIN" (verify mode).

PIN setup is a no-op — the PIN is never persisted to the database.

---

## Root Cause

**`setPinAction`'s UPDATE silently affects 0 rows because the RLS policy requires transaction-local session vars that don't survive across separate HTTP requests.**

### Mechanism

The `withServerAction` compositor runs this middleware chain:

```
withAuth → withRLS → handler
```

1. **`withRLS`** calls `injectRLSContext()` → `supabase.rpc('set_rls_context_from_staff')` — this is **HTTP request #1** to PostgREST, which runs in **Transaction A**. The RPC sets session vars via `set_config(name, val, true)` (transaction-local). Transaction A commits. Session vars are gone.

2. **Handler** calls `mwCtx.supabase.from('staff').update({ pin_hash })` — this is **HTTP request #2** to PostgREST, which runs in **Transaction B**. Session vars from Transaction A are **not available**.

3. The `staff_update_own_pin` RLS policy (Template 2b) evaluates:
   ```sql
   casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
   ```
   With no session vars set, `current_setting` returns `''`, `NULLIF` converts to `NULL`, and `casino_id = NULL` is **always false**. The UPDATE matches 0 rows.

4. PostgREST returns success with no error for 0-row UPDATEs. `setPinAction` returns `ok: true` despite writing nothing.

5. On the next lock, `getPinStatusAction` reads `pin_hash` (via SELECT, which uses Pattern C with JWT COALESCE fallback — works fine) and finds it still `NULL` → mode = `'setup'`.

### Why This Only Affects `setPinAction`

| Operation | Pattern | Works? | Why |
|-----------|---------|--------|-----|
| `rpc_increment_pin_attempt` | Self-contained SECURITY DEFINER RPC | Yes | Calls `set_rls_context_from_staff()` internally (same transaction) |
| `rpc_clear_pin_attempts` | Self-contained SECURITY DEFINER RPC | Yes | Same as above |
| `getPinStatusAction` SELECT | Pattern C (COALESCE with JWT fallback) | Yes | Falls back to JWT `app_metadata` claims |
| `verifyPinAction` SELECT | Pattern C (COALESCE with JWT fallback) | Yes | Same as above |
| **`setPinAction` UPDATE** | **Template 2b (no COALESCE fallback)** | **No** | Session vars lost between HTTP requests |

Template 2b was chosen for `staff_update_own_pin` per ADR-030 D4 (critical table writes use session vars only). This is the correct security posture, but the middleware architecture doesn't support it for direct PostgREST operations — the RPC context injection and the actual SQL run in separate transactions.

### Evidence Chain

1. `set_rls_context_from_staff()` — `supabase/migrations/20260129193818_auth_hardening_rpc_return_context.sql` lines 105-107:
   ```sql
   PERFORM set_config('app.actor_id', v_staff_id::text, true);  -- true = transaction-local
   PERFORM set_config('app.casino_id', v_casino_id::text, true);
   PERFORM set_config('app.staff_role', v_role, true);
   ```

2. `injectRLSContext()` — `lib/supabase/rls-context.ts` line 89:
   ```ts
   const { data, error } = await supabase.rpc('set_rls_context_from_staff', { ... });
   ```
   Separate HTTP request from subsequent handler operations.

3. `setPinAction` — `app/actions/auth/set-pin.ts` lines 60-63:
   ```ts
   const { error: updateError } = await mwCtx.supabase
     .from('staff')
     .update({ pin_hash: pinHash })
     .eq('id', staffId);
   ```
   No check for affected row count. No error returned for 0-row UPDATE.

4. `staff_update_own_pin` policy — `supabase/migrations/20260210112002_add_staff_pin_rls_policy.sql` lines 16-20:
   ```sql
   USING (
     auth.uid() = user_id
     AND casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
     AND status = 'active'
   )
   ```
   No COALESCE fallback to JWT claims (Template 2b by design).

---

## Recommended Fix

**Create an `rpc_set_staff_pin(p_pin_hash text)` SECURITY DEFINER function** following the established pattern of `rpc_increment_pin_attempt` and `rpc_clear_pin_attempts`:

1. Calls `set_rls_context_from_staff()` internally (same transaction — session vars available).
2. Derives `v_staff_id` and `v_casino_id` from session vars (no spoofable params per ADR-024 INV-8).
3. Updates `staff.pin_hash` with row-level gating (`id = v_staff_id AND casino_id = v_casino_id AND status = 'active'`).
4. Uses `IF NOT FOUND THEN RAISE EXCEPTION` to surface 0-row updates as errors.
5. SECURITY DEFINER + `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated` (ADR-018).

Then update `setPinAction` (`app/actions/auth/set-pin.ts`) to call:
```ts
await mwCtx.supabase.rpc('rpc_set_staff_pin', { p_pin_hash: pinHash });
```

### Artifacts Required

| Artifact | Type | Description |
|----------|------|-------------|
| `supabase/migrations/YYYYMMDDHHMMSS_rpc_set_staff_pin.sql` | Migration | SECURITY DEFINER RPC with internal context injection |
| `app/actions/auth/set-pin.ts` | Modify | Replace `.from('staff').update()` with `.rpc('rpc_set_staff_pin')` |
| `types/database.types.ts` | Regenerate | `npm run db:types` for new RPC type |

### Secondary Hardening (Optional)

Add a defensive row-count check pattern for any future Template 2b writes that go through PostgREST directly:
```ts
const { data, error, count } = await mwCtx.supabase
  .from('staff')
  .update({ pin_hash: pinHash })
  .eq('id', staffId)
  .select('id', { count: 'exact', head: true });

if (!error && count === 0) {
  return { ok: false, code: 'INTERNAL_ERROR', error: 'RLS policy rejected update (0 rows affected)' };
}
```

---

## Broader Implications

Any server action using `withServerAction` + a Template 2b RLS policy (session vars required, no JWT COALESCE fallback) for direct PostgREST writes will silently fail. Currently `staff_update_own_pin` is the only Template 2b UPDATE policy, so this is an isolated issue. However, if future migrations add more Template 2b policies, the same pattern will break.

**Architectural note:** The `withServerAction` middleware architecture assumes session vars persist from the RPC to the handler's SQL. This is false for PostgREST-mediated operations (each is a separate HTTP request = separate transaction). It IS true for operations within a single SECURITY DEFINER function. All Template 2b write operations should use self-contained RPCs, not direct PostgREST DML.

---

## Architectural Response

This issue triggered **ADR-030 D5** (INV-030-7): Template 2b writes must use self-contained SECURITY DEFINER RPCs. Direct PostgREST DML is prohibited for tables with Template 2b policies. See:
- `docs/80-adrs/ADR-030-auth-system-hardening.md` — D5 amendment (2026-02-10)
- `docs/30-security/SEC-001-rls-policy-matrix.md` — Template 2b transport constraint (v1.9.0)

### Lint Guard: `no-direct-template2b-dml`

ESLint rule `.eslint-rules/no-direct-template2b-dml.js` enforces INV-030-7 at CI time. Registered in `eslint.config.mjs` under both `security-rules` (app/actions, app/api) and `custom-rules` (services) plugin namespaces.

**Violations detected (4):**

| File | Line | Method | Resolution |
|------|------|--------|------------|
| `app/actions/auth/set-pin.ts` | 60 | `.from('staff').update()` | **Real bug** — migrate to `rpc_set_staff_pin` RPC |
| `app/actions/auth/set-pin.ts` | 147 | `.from('staff').insert()` | Investigate — may be dead code or secondary path |
| `services/casino/crud.ts` | 333 | `.from('staff').insert()` | **False positive** — service_role client, bypasses RLS. Add `eslint-disable` with justification. |
| `services/casino/crud.ts` | 410 | `.from('staff').update()` | **False positive** — service_role client, bypasses RLS. Add `eslint-disable` with justification. |

---

## Related

- `docs/20-architecture/specs/GAP-SIGN-OUT/EXECUTION-SPEC-GAP-SIGN-OUT.md` — WS5 acceptance criteria
- `supabase/migrations/20251229152317_adr024_rls_context_from_staff.sql` — Context injection function
- `supabase/migrations/20260210112002_add_staff_pin_rls_policy.sql` — Template 2b policy
- ADR-024: Authoritative context derivation
- ADR-030 D4: Write-path session-var enforcement
- ADR-030 D5: Template 2b transport constraint (INV-030-7)
