---
title: PATCH-DELTA-EXECUTION-SPEC-GAP-SIGN-OUT-v0.3
applies_to: EXECUTION-SPEC-GAP-SIGN-OUT.md
status: patch-delta
version: 0.3.0
date: 2026-02-10
---

# Patch delta v0.3 — Template 2b write-path hardening (setPinAction silent RLS failure)

This patch folds in the corrections discovered in **ISSUE-SET-PIN-SILENT-RLS-FAILURE** and updates the execution spec so this class of bug can’t recur. fileciteturn4file0

## Summary

**Problem:** Template 2b write paths (session-var-only RLS; no JWT COALESCE fallback) **silently fail** when implemented as:  
`server action → rpc(set_rls_context_from_staff) → .from(table).update(...)`  
because the RPC and the DML run as **separate PostgREST HTTP requests** (separate transactions). Transaction-local `set_config(..., true)` does not persist across requests. fileciteturn4file0

**Fix:** All Template 2b writes must be **self-contained RPCs** that (1) inject context and (2) perform the write **within the same function/transaction**, and must **RAISE** on 0 rows affected. fileciteturn4file0

---

## 1) Add a new invariant: Template 2b writes are RPC-only (P0)

**ADD** to `EXECUTION-SPEC-GAP-SIGN-OUT.md` in the “Architecture / RLS Posture” section (or WS5 preface):

> **Invariant (Template 2b): RPC-only writes**  
> Any write guarded by a Template 2b RLS policy (session vars required; no JWT COALESCE fallback) MUST be executed inside a single self-contained RPC.  
> Do **not** rely on `withServerAction → rpc(set_rls_context_from_staff)` followed by PostgREST DML; those are separate HTTP requests/transactions and transaction-local session vars will be lost.

**ADD** to DoD:

- [ ] No server action performs direct PostgREST `insert/update/delete` against a table whose write policy is Template 2b.
- [ ] All Template 2b write RPCs **raise** on 0 rows affected (no silent no-ops).

---

## 2) WS5 (Set PIN): replace PostgREST UPDATE with `rpc_set_staff_pin` (P0)

### 2.1 Required new artifact (WS4 migration output)

**ADD** to WS4 “Migrations” deliverables:

- `supabase/migrations/YYYYMMDDHHMMSS_rpc_set_staff_pin.sql`
  - Defines `public.rpc_set_staff_pin(p_pin_hash text)`
  - `SECURITY DEFINER`
  - `SET search_path = public`
  - Calls `public.set_rls_context_from_staff()` internally
  - Updates only the current actor’s staff row (no spoofable params)
  - **RAISE EXCEPTION** on 0 rows affected (NOT FOUND)

### 2.2 SQL contract (normative)

**ADD** the RPC contract block to the spec (WS4 or WS5 appendix):

```sql
CREATE OR REPLACE FUNCTION public.rpc_set_staff_pin(p_pin_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_casino_id uuid;
BEGIN
  -- Derive authoritative context (same transaction).
  PERFORM public.set_rls_context_from_staff();

  v_staff_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_staff_id IS NULL OR v_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context missing';
  END IF;

  UPDATE public.staff
     SET pin_hash = p_pin_hash
   WHERE id = v_staff_id
     AND casino_id = v_casino_id
     AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PIN update rejected (0 rows affected)';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_set_staff_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_set_staff_pin(text) TO authenticated;
```

> Note: keep `p_pin_hash` as a **pre-hashed** value from the server action (bcrypt/bcryptjs). The RPC does not hash; it only persists. fileciteturn4file0

### 2.3 Server action change

**REPLACE** in WS5 implementation steps:

- Remove: `.from('staff').update({ pin_hash }).eq('id', staffId)`
- Add: `.rpc('rpc_set_staff_pin', { p_pin_hash: pinHash })`

Example (normative):

```ts
const { error } = await mwCtx.supabase.rpc('rpc_set_staff_pin', { p_pin_hash: pinHash });
if (error) return { ok: false, code: 'PIN_SET_FAILED', error: error.message };
return { ok: true };
```

---

## 3) Guardrail: never treat 0-row writes as success (P1)

**ADD** to “General Write Guidelines”:

- Any remaining direct PostgREST write (Template 2c / Pattern C) must include an explicit “rows affected” check.
- For PostgREST updates: require `.select('id', { count: 'exact', head: true })` and treat `count === 0` as an error.

(Example snippet may be included verbatim; see issue doc.) fileciteturn4file0

---

## 4) WS5/WS6 acceptance criteria updates (P0)

**ADD** to WS5 acceptance criteria:

- [ ] Setting a PIN results in a persisted `staff.pin_hash` (verified by `getPinStatusAction` returning `has_pin=true` on subsequent lock).
- [ ] `setPinAction` returns `ok:false` on any persistence failure (including “0 rows affected”).

**ADD** to WS6 acceptance criteria:

- [ ] Second lock after setting a PIN must render **Verify mode** (not Setup mode).

---

## 5) Documentation cleanup (P0)

**REMOVE** any remaining language implying:

- “Inject RLS context, then do PostgREST UPDATE for Template 2b”
- “0 rows updated is OK”

**ADD** cross-reference under “Known failure modes”:

- “Template 2b + transaction-local session vars + multi-request PostgREST DML ⇒ silent no-op; fix via RPC-only write.”

---

# Unified diff snippets (optional)

## A) WS5: Replace PostgREST UPDATE with RPC

```diff
- const { error: updateError } = await mwCtx.supabase
-   .from('staff')
-   .update({ pin_hash: pinHash })
-   .eq('id', staffId);
+ const { error: updateError } = await mwCtx.supabase
+   .rpc('rpc_set_staff_pin', { p_pin_hash: pinHash });
```

## B) Add invariant

```diff
+ Invariant (Template 2b): RPC-only writes. Any write guarded by a session-var-only policy must execute inside a single self-contained RPC; do not split context injection and DML across PostgREST requests.
```
