# Exclusion RLS Boundary Repair — Design Spec

**Date:** 2026-03-28
**Scope:** ISS-EXCL-001 + ISS-EXCL-006 — Player exclusion CREATE and LIFT operations fail with RLS policy violation (42501)
**Approach:** SECURITY DEFINER RPCs (Option A from issues doc)
**Constraint:** Boundary repair only. No DTO, mapper, hook, or UI changes.

---

## Problem

The `player_exclusion` INSERT/UPDATE policies use session-var-only checks (ADR-030 D4 critical table):

```sql
casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
```

The middleware calls `set_rls_context_from_staff()` via `.rpc()`, which sets `SET LOCAL` vars in one transaction. The subsequent `.from('player_exclusion').insert()` runs as a **separate HTTP request** — the session vars are gone, the policy evaluates to `casino_id = NULL`, always FALSE.

## Fix

Two SECURITY DEFINER RPCs that bundle context injection + DML in a single transaction. Matches the established visit/gaming pattern.

---

## 1. Migration: `rpc_create_player_exclusion`

**Single migration file** contains both RPCs.

### Signature

```sql
CREATE OR REPLACE FUNCTION public.rpc_create_player_exclusion(
  p_player_id       uuid,
  p_exclusion_type  text,
  p_enforcement     text,
  p_reason          text,
  p_effective_from  timestamptz DEFAULT NULL,
  p_effective_until timestamptz DEFAULT NULL,
  p_review_date     timestamptz DEFAULT NULL,
  p_external_ref    text        DEFAULT NULL,
  p_jurisdiction    text        DEFAULT NULL
) RETURNS SETOF player_exclusion
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
```

**No tenant/actor parameters in the signature.** `casino_id`, `created_by` are derived from RLS context inside the function.

### Function Body

1. **Context injection:** `PERFORM set_rls_context_from_staff();`
   - Signature: `(p_correlation_id text DEFAULT NULL)` — zero-arg call uses DEFAULT. This is the exact invocation used in 20+ existing RPCs (visit, loyalty, rating-slip, valuation). Verified in migrations.
2. **Extract context:**
   ```sql
   v_casino_id  := NULLIF(current_setting('app.casino_id',  true), '')::uuid;
   v_actor_id   := NULLIF(current_setting('app.actor_id',   true), '')::uuid;
   v_staff_role := NULLIF(current_setting('app.staff_role',  true), '');
   ```
3. **Invariant: context must be set:**
   ```sql
   IF v_casino_id IS NULL OR v_actor_id IS NULL THEN
     RAISE EXCEPTION 'UNAUTHORIZED: RLS context not available'
       USING ERRCODE = '<verified_code>';
   END IF;
   ```
4. **Invariant: role authorization (pit_boss or admin):**
   ```sql
   IF v_staff_role IS NULL OR v_staff_role NOT IN ('pit_boss', 'admin') THEN
     RAISE EXCEPTION 'FORBIDDEN: role "%" cannot create exclusions', v_staff_role
       USING ERRCODE = '<verified_code>';
   END IF;
   ```
5. **INSERT with context-derived fields:**
   ```sql
   RETURN QUERY
   INSERT INTO player_exclusion (
     player_id, casino_id, created_by,
     exclusion_type, enforcement, reason,
     effective_from, effective_until, review_date,
     external_ref, jurisdiction
   ) VALUES (
     p_player_id, v_casino_id, v_actor_id,
     p_exclusion_type, p_enforcement, p_reason,
     COALESCE(p_effective_from, now()), p_effective_until, p_review_date,
     p_external_ref, p_jurisdiction
   )
   RETURNING *;
   ```

### Grants

```sql
REVOKE ALL ON FUNCTION public.rpc_create_player_exclusion(...) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_player_exclusion(...) TO authenticated, service_role;
```

---

## 2. Migration: `rpc_lift_player_exclusion`

### Signature

```sql
CREATE OR REPLACE FUNCTION public.rpc_lift_player_exclusion(
  p_exclusion_id  uuid,
  p_lift_reason   text
) RETURNS SETOF player_exclusion
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
```

**No player_id, casino_id, or actor_id in the signature.** The exclusion row already has player_id and casino_id. The actor performing the lift is derived from context.

### Function Body

1. **Context injection:** `PERFORM set_rls_context_from_staff();`
2. **Extract context:** Same three vars as create RPC.
3. **Invariant: context must be set:** Same check as create RPC.
4. **Invariant: role authorization (admin only):**
   ```sql
   IF v_staff_role IS NULL OR v_staff_role != 'admin' THEN
     RAISE EXCEPTION 'FORBIDDEN: role "%" cannot lift exclusions', v_staff_role
       USING ERRCODE = '<verified_code>';
   END IF;
   ```
5. **Invariant: lift reason must be non-empty:**
   ```sql
   IF TRIM(COALESCE(p_lift_reason, '')) = '' THEN
     RAISE EXCEPTION 'VALIDATION_ERROR: lift_reason is required'
       USING ERRCODE = '<verified_code>';
   END IF;
   ```
6. **Pre-check for clean domain errors:**
   ```sql
   SELECT id, lifted_at, casino_id INTO v_existing
   FROM player_exclusion WHERE id = p_exclusion_id;

   IF NOT FOUND THEN
     RAISE EXCEPTION 'NOT_FOUND: exclusion does not exist'
       USING ERRCODE = '<verified_code>';
   END IF;

   IF v_existing.casino_id != v_casino_id THEN
     RAISE EXCEPTION 'FORBIDDEN: cross-casino access denied'
       USING ERRCODE = '<verified_code>';
   END IF;

   IF v_existing.lifted_at IS NOT NULL THEN
     RAISE EXCEPTION 'CONFLICT: exclusion already lifted'
       USING ERRCODE = '<verified_code>';
   END IF;
   ```
7. **UPDATE with tenant guard + active-row guard in WHERE:**
   ```sql
   RETURN QUERY
   UPDATE player_exclusion
   SET lifted_at    = now(),
       lifted_by    = v_actor_id,
       lift_reason  = p_lift_reason
   WHERE id         = p_exclusion_id
     AND casino_id  = v_casino_id
     AND lifted_at  IS NULL
   RETURNING *;
   ```
8. **Post-update consistency check:** `RETURN QUERY` yields zero rows if the WHERE guard filtered the row out despite the pre-check passing. After the UPDATE, check with `GET DIAGNOSTICS v_count = ROW_COUNT`; if `v_count = 0`, raise `INTERNAL_ERROR` — this means the pre-check and DML disagree, which is a bug.

### Defense-in-depth

The immutability trigger (`trg_player_exclusion_lift_only`) remains deployed. The RPC only touches `lifted_at`, `lifted_by`, `lift_reason` — the trigger is a safety net against future drift, not the primary enforcement.

---

## 3. Service Layer: `exclusion-crud.ts`

### Changes

Two functions change. Everything else is untouched.

**`createExclusion()`** — replace `.from().insert()` with `.rpc()`:

```typescript
const { data, error } = await supabase.rpc('rpc_create_player_exclusion', {
  p_player_id:       input.player_id,
  p_exclusion_type:  input.exclusion_type,
  p_enforcement:     input.enforcement,
  p_reason:          input.reason,
  p_effective_from:  input.effective_from ?? null,
  p_effective_until: input.effective_until ?? null,
  p_review_date:     input.review_date ?? null,
  p_external_ref:    input.external_ref ?? null,
  p_jurisdiction:    input.jurisdiction ?? null,
});
if (error) throw mapExclusionRpcError(error);
const row = assertSingletonRow(data);
return toExclusionDTO(row);
```

**`liftExclusion()`** — replace pre-check SELECT + `.update()` with single `.rpc()` call. Pre-check logic is now inside the RPC:

```typescript
const { data, error } = await supabase.rpc('rpc_lift_player_exclusion', {
  p_exclusion_id: exclusionId,
  p_lift_reason:  input.lift_reason,
});
if (error) throw mapExclusionRpcError(error);
const row = assertSingletonRow(data);
return toExclusionDTO(row);
```

### Singleton Assertion

Shared helper (inline or local to the file):

```typescript
function assertSingletonRow<T>(data: T[] | T | null): T {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) {
    throw new DomainError('INTERNAL_ERROR', 'RPC returned no data');
  }
  if (rows.length > 1) {
    throw new DomainError('INTERNAL_ERROR', 'RPC returned multiple rows — contract violation');
  }
  return rows[0];
}
```

Empty = internal error. Multiple rows = contract violation. No silent `data[0]`.

### Error Mapping

**Mechanism:** Switch on `error.code` (Postgres ERRCODE surfaced through PostgREST → Supabase client).

**Provisional code table** (must be verified end-to-end before implementation — see section 5):

| Domain error | Provisional ERRCODE | Maps to |
|---|---|---|
| No RLS context | TBD | `DomainError('UNAUTHORIZED')` |
| Wrong role | TBD | `DomainError('FORBIDDEN')` |
| Cross-casino | TBD | `DomainError('FORBIDDEN')` |
| Exclusion not found | TBD | `DomainError('PLAYER_EXCLUSION_NOT_FOUND')` |
| Already lifted | TBD | `DomainError('PLAYER_EXCLUSION_ALREADY_LIFTED')` |
| Lift reason blank | TBD | `DomainError('VALIDATION_ERROR')` |
| FK violation (23503) | `23503` | `DomainError('PLAYER_NOT_FOUND')` |
| Immutability trigger | message contains `EXCLUSION_IMMUTABLE` | `DomainError('EXCLUSION_IMMUTABLE', 'Only lift fields may be updated')` |

The existing `mapDatabaseError` function will be replaced with `mapExclusionRpcError` that switches on `error.code` for the verified codes.

### Untouched Files

- `exclusion-dtos.ts` — no changes
- `exclusion-mappers.ts` — no changes
- `exclusion-schemas.ts` — no changes
- `exclusion-http.ts` — no changes
- `exclusion-keys.ts` — no changes
- `exclusion-selects.ts` — no changes (still used by listExclusions and getActiveExclusions read paths)
- `use-exclusions.ts` (hooks) — no changes
- `create-exclusion-dialog.tsx` — no changes
- `lift-exclusion-dialog.tsx` — no changes
- `exclusion-tile.tsx` — no changes
- All API route handlers — no changes (they call service functions, which call RPCs)

---

## 4. Type Regeneration

After migration is applied locally:

```bash
npm run db:types-local
```

This generates TypeScript types for the new RPCs in `database.types.ts`, giving the Supabase client type-safe `.rpc()` calls.

---

## 5. ERRCODE Verification Gate

**Before finalizing the error mapping**, one end-to-end verification must pass:

1. Apply the migration locally
2. Call the RPC with a condition that triggers a `RAISE EXCEPTION ... USING ERRCODE = 'Pxxxx'`
3. Observe the Supabase client response: confirm `error.code` contains the exact ERRCODE string
4. If PostgREST normalizes or wraps the code differently, adjust the mapping

This is a **hard gate** — the error mapping in the service layer is not finalized until this passes. The migration can use placeholder codes initially, but the service-layer switch statement is written only after verification.

---

## 6. Integration Test

One integration test that validates the RPC write path works end-to-end:

- **Create:** Call `rpc_create_player_exclusion` with valid params, verify row returned with correct `casino_id` and `created_by` (context-derived, not passed)
- **Lift:** Call `rpc_lift_player_exclusion` on the created row, verify `lifted_at`, `lifted_by`, `lift_reason` set correctly
- **Error paths:** Verify expected ERRCODE for at least: unauthorized (no context), not found, already lifted

This test runs against a real Supabase client (local or remote), not mocks.

---

## Summary of Changed Files

| File | Change |
|---|---|
| `supabase/migrations/<timestamp>_add_exclusion_write_rpcs.sql` | New: both RPCs |
| `services/player/exclusion-crud.ts` | Replace direct DML with `.rpc()` calls |
| `types/database.types.ts` | Regenerated (automated) |
| Integration test file (TBD location) | New: RPC write-path validation |

Four files. Boundary repair.
