# ISSUE: Residual `p_actor_id` Bypass Pattern in SECURITY DEFINER RPCs

**Date:** 2026-03-01
**Severity:** CRITICAL (C-3) + MEDIUM (M-5)
**Status:** Open — remediation migration required
**Upstream:** ISSUE-7F01C9F3 (resolved), SEC-REMEDIATION-2026-02-19
**ADR References:** ADR-024 (INV-7, INV-8), ADR-018, ADR-030

---

## Executive Summary

The SEC-REMEDIATION-2026-02-19 campaign successfully removed the `p_actor_id` bypass from `rpc_create_pit_cash_observation` (C-1) and `rpc_log_table_buyin_telemetry` (C-2). However, a catalog audit on 2026-03-01 reveals **two additional RPCs** still carrying the same vulnerability pattern:

| Finding | RPC | Severity | Exploitable | Bypass Type |
|---------|-----|----------|-------------|-------------|
| **C-3** | `rpc_update_table_status` (4-param overload) | **CRITICAL** | **YES** | Active `set_rls_context()` spoofing |
| **M-5** | `rpc_start_rating_slip` | MEDIUM | No (dead param) | INV-8 compliance gap |

These findings demonstrate the pattern is **systemic** — individual RPCs were hardened at different times by different migrations, and two were missed by the SEC-REMEDIATION sweep.

---

## C-3: `rpc_update_table_status` — Active Bypass (CRITICAL)

### Vulnerability

Two overloaded versions exist in the PostgreSQL catalog:

| Overload | Signature | Status |
|----------|-----------|--------|
| 3-param (secure) | `(p_casino_id uuid, p_table_id uuid, p_new_status table_status)` | Uses `set_rls_context_from_staff()`, derives actor from context |
| 4-param (**VULNERABLE**) | `(p_casino_id uuid, p_table_id uuid, p_new_status table_status, p_actor_id uuid)` | Calls deprecated `set_rls_context(p_actor_id, p_casino_id, ...)` |

### Attack Vector

The 4-param overload is **actively exploitable**:

```sql
-- Attacker (staff A) calls the 4-param overload with staff B's UUID
SELECT rpc_update_table_status(
  'casino-uuid',
  'table-uuid',
  'active',
  'staff-b-uuid'  -- p_actor_id: impersonate staff B
);
```

**Impact:**
1. **Context spoofing**: `set_rls_context(p_actor_id, p_casino_id, v_context_staff_role)` sets session vars from caller-controlled input
2. **Audit trail corruption**: `p_actor_id` written directly to `audit_log.actor_id` — staff B appears as actor
3. **PostgREST exposure**: The 4-param overload is callable by any `authenticated` client via PostgREST, even though no TypeScript code calls it

### Origin

The 4-param version originates from the pre-ADR-024 self-injection pattern (ADR-015 Phase 1A). The 3-param secure version was added by SEC-007 (`20251212081000_sec007_rating_slip_rpc_hardening.sql`), but the migration used `CREATE OR REPLACE` which created a **new overload** instead of replacing the old one (param count changed → PostgreSQL treats it as a distinct function).

### Database Evidence

```
proname                 | identity_args
rpc_update_table_status | p_casino_id uuid, p_table_id uuid, p_new_status table_status
rpc_update_table_status | p_casino_id uuid, p_table_id uuid, p_new_status table_status, p_actor_id uuid
```

### Remediation

DROP the 4-param overload. The 3-param version is correct and sufficient.

```sql
DROP FUNCTION IF EXISTS public.rpc_update_table_status(uuid, uuid, table_status, uuid);
```

---

## M-5: `rpc_start_rating_slip` — Dead Parameter (MEDIUM)

### Vulnerability

The function signature includes `p_actor_id uuid` as the 6th parameter, but the body **completely ignores it**:

```sql
-- Line 38 of function body:
-- p_actor_id parameter is IGNORED — retained only for backward compatibility
v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
```

**Key observations:**
- `set_rls_context_from_staff()` is called unconditionally (secure)
- `v_context_actor_id` is derived from session context, NOT from `p_actor_id`
- Audit log uses `v_context_actor_id` (secure), NOT `p_actor_id`
- The parameter was intentionally neutered (M-4 FIX comments) but never removed from the signature

### ADR-024 INV-8 Violation

> "No client-callable RPC may accept `casino_id`/`actor_id` as user input"

While not exploitable, the dead parameter:
1. Violates INV-8 compliance
2. Confuses developers (2 production callers still pass it)
3. Expands the attack surface unnecessarily (PostgREST advertises it)

### Production Callers Passing Dead Parameter

| File | Line | Call |
|------|------|------|
| `services/visit/crud.ts` | 695 | `p_actor_id: actorId` |
| `services/rating-slip/crud.ts` | 182 | `p_actor_id: actorId` |

### TypeScript Type

```typescript
// types/database.types.ts:5178
rpc_start_rating_slip: {
  Args: {
    p_actor_id?: string      // ← Should not exist (INV-8)
    p_casino_id: string
    p_game_settings: Json
    p_seat_number: string
    p_table_id: string
    p_visit_id: string
  }
```

### Remediation

DROP the 6-param signature. CREATE a 5-param version without `p_actor_id`. The function body stays identical except the dead parameter is removed.

```sql
DROP FUNCTION IF EXISTS public.rpc_start_rating_slip(uuid, uuid, uuid, text, jsonb, uuid);
-- CREATE new 5-param version: (p_casino_id, p_visit_id, p_table_id, p_seat_number, p_game_settings)
```

**TypeScript callers to update:**
- `services/visit/crud.ts:695` — remove `p_actor_id: actorId`
- `services/rating-slip/crud.ts:182` — remove `p_actor_id: actorId`

---

## Integration Test Impact

Tests that pass `p_actor_id` to these RPCs will break after remediation. Known test files:

| File | RPC | Occurrences |
|------|-----|-------------|
| `__tests__/services/table-context/table-session.int.test.ts` | `rpc_start_rating_slip` | ~23 calls with `p_actor_id` |
| `services/visit/__tests__/visit-continuation.integration.test.ts` | `rpc_start_rating_slip` | ~8 calls with `p_actor_id` |
| `services/security/__tests__/rls-context.integration.test.ts` | `rpc_start_rating_slip` | 1 call |
| `lib/supabase/__tests__/rls-pooling-safety.integration.test.ts` | `rpc_start_rating_slip` | ~4 calls |
| `services/rating-slip/__tests__/rating-slip.service.test.ts` | `rpc_start_rating_slip` | 1 call (mock) |

These tests use `p_actor_id` as a service-role testing shortcut. After the param is removed, tests must authenticate as the target staff member via JWT or use `set_rls_context_from_staff()` with proper auth context.

---

## Systemic Pattern Analysis

### Why This Keeps Happening

The `p_actor_id` bypass was introduced as a **testing convenience** during initial development (pre-ADR-024). The pattern propagated because:

1. **Copy-paste proliferation**: New RPCs were modeled after existing ones that had `p_actor_id`
2. **Incomplete sweep**: SEC-006/SEC-007 hardened some RPCs but used `CREATE OR REPLACE` which created overloads when param counts changed
3. **The "backward compatibility" trap**: M-4 FIX neutered `p_actor_id` in some RPCs but kept it in the signature "for backward compatibility" — this is precisely the pattern ADR-024 INV-8 forbids
4. **No CI enforcement**: There is no automated gate that rejects RPCs accepting `p_actor_id`

### Recommended Preventive Measures

1. **Catalog assertion in CI**: Add a migration test that queries `pg_proc` for any `rpc_*` function with `p_actor_id` in its identity arguments. Fail the build if found.

```sql
-- CI assertion: must return 0 rows
SELECT p.proname, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname LIKE 'rpc_%'
  AND pg_get_function_identity_arguments(p.oid) ILIKE '%p_actor_id%';
```

2. **Overload audit**: After any migration that changes an RPC signature, verify no stale overloads remain:

```sql
SELECT proname, count(*) as overload_count
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname LIKE 'rpc_%'
GROUP BY proname HAVING count(*) > 1;
```

3. **Migration standard update**: Document in `MIGRATION_NAMING_STANDARD.md` that signature changes to RPCs MUST use `DROP FUNCTION` + `CREATE FUNCTION`, never `CREATE OR REPLACE`, to avoid phantom overloads.

---

## Remediation Plan

### Migration: `YYYYMMDDHHMMSS_sec_p_actor_id_residual_cleanup.sql`

```
Phase 1: DROP vulnerable overloads
  - DROP rpc_update_table_status(uuid, uuid, table_status, uuid)  -- C-3 fix

Phase 2: DROP+CREATE rpc_start_rating_slip without p_actor_id
  - DROP rpc_start_rating_slip(uuid, uuid, uuid, text, jsonb, uuid)
  - CREATE rpc_start_rating_slip(uuid, uuid, uuid, text, jsonb)  -- M-5 fix
  - REVOKE/GRANT authenticated only

Phase 3: Catalog assertion
  - Verify 0 rows for p_actor_id in rpc_* signatures
  - Verify no duplicate overloads

Phase 4: NOTIFY pgrst, 'reload schema'
```

### TypeScript Changes

| File | Change |
|------|--------|
| `services/visit/crud.ts:695` | Remove `p_actor_id: actorId` |
| `services/rating-slip/crud.ts:182` | Remove `p_actor_id: actorId` |
| Run `npm run db:types-local` | Regenerate types |

### Test Refactor (WS3)

All integration tests passing `p_actor_id` must be updated to use proper JWT-based authentication. This is a separate workstream due to volume (~37 test call sites).

---

## Cross-References

| Document | Relevance |
|----------|-----------|
| `docs/30-security/compliance/SEC-AUDIT-2026-02-19-RLS-VIOLATIONS-MATRIX.md` | Original audit that found C-1, C-2 |
| `docs/30-security/compliance/SEC-REMEDIATION-STRATEGY-2026-02-19.md` | Remediation strategy for C-1, C-2, H-4 |
| `supabase/migrations/20260219235612_sec_audit_p0_actor_id_bypass_remediation.sql` | Applied fix for C-1, C-2, H-4 |
| `docs/80-adrs/ADR-024_DECISIONS.md` | Authoritative context derivation (INV-7, INV-8) |
| `docs/80-adrs/ADR-030-auth-system-hardening.md` | Write-path session-var enforcement |
| `supabase/migrations/20251212081000_sec007_rating_slip_rpc_hardening.sql` | SEC-007 that created the overload problem |
