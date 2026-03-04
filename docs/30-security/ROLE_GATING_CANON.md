# Role Gating Canon: EXECUTE Grant Management

**Status:** Active
**Date:** 2026-03-02
**References:** ADR-018, SEC-007, SEC-001

---

## Purpose

Define the canonical rules for EXECUTE privilege management on all `rpc_*` functions exposed via PostgREST. These rules enforce least-privilege and prevent confused-deputy attacks when functions are promoted to SECURITY DEFINER.

---

## Default Grant Pattern

Every `rpc_*` function MUST include the following grant block immediately after its `CREATE OR REPLACE` statement:

```sql
REVOKE ALL ON FUNCTION rpc_xxx(...) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_xxx(...) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_xxx(...) TO service_role;
```

**Rationale:** PostgreSQL grants EXECUTE to PUBLIC by default on new functions. Without explicit REVOKE, the `anon` role inherits EXECUTE, which means unauthenticated PostgREST callers can invoke the function. Even when SECURITY INVOKER + RLS blocks data access today, PUBLIC EXECUTE is a latent escalation path: any future change to SECURITY DEFINER creates an immediate confused-deputy bypass.

---

## Exception: Auth-Flow Functions (PUBLIC EXECUTE Required)

Some functions must be callable before authentication is complete. These retain PUBLIC EXECUTE.

| Function | Justification |
|----------|---------------|
| `rpc_bootstrap_casino` | Called during initial casino setup before any staff exists. No tenant context available. |
| `rpc_accept_staff_invite` | Called by users accepting an invite before they have a staff record or JWT claims. |

**Rules for adding to this list:**
1. PR must include a justification comment in the migration SQL next to the GRANT.
2. PR must reference a linked ADR or SEC note.
3. Security review approval is required on the PR.

---

## Exception: Internal-Only Functions (service_role Only)

Functions that are called exclusively by other RPCs (not directly by clients via PostgREST) MUST restrict access to `service_role` only.

```sql
REVOKE ALL ON FUNCTION rpc_xxx(...) FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_xxx(...) FROM authenticated;
GRANT EXECUTE ON FUNCTION rpc_xxx(...) TO service_role;
```

| Function | Justification |
|----------|---------------|
| `rpc_get_rating_slip_duration` | Helper called internally by `rpc_get_visit_live_view`. No direct client use case. |
| `set_rls_context_internal` | Service_role ops lane per ADR-024. Not callable by authenticated users. |

**When to use this pattern:**
- The function is a helper/subroutine called by other RPCs.
- The function has no direct client-facing use case.
- The function would expose data without adequate scoping if called directly (e.g., no `set_rls_context_from_staff()` because context is already set by the caller).

---

## SECURITY DEFINER Governance (ADR-018)

All SECURITY DEFINER functions carry additional requirements beyond standard grant management:

1. **`REVOKE ALL FROM PUBLIC`** -- mandatory (DEFINER + PUBLIC = confused deputy).
2. **`SET search_path = public`** -- prevents search_path hijacking.
3. **Context validation** -- must call `set_rls_context_from_staff()` or validate `p_casino_id` against session context (Template 5 from SEC-001).
4. **Documented justification** -- the PR must state why INVOKER is insufficient.

Prefer SECURITY INVOKER for all new functions unless one of these conditions applies:
- The function must read/write across tables with different RLS policies in a single transaction.
- The function performs system-level operations (e.g., audit log writes).
- The function must bypass normal user permissions for a specific, well-defined purpose.

---

## CI Enforcement

The following CI gate validates grant posture after every migration:

```sql
-- Fail if any rpc_* is executable by PUBLIC
SELECT proname FROM pg_proc
WHERE proname LIKE 'rpc_%'
  AND pronamespace = 'public'::regnamespace
  AND has_function_privilege('public', oid, 'EXECUTE');
-- Assert: 0 rows (or only allowlisted auth-flow functions)
```

See SEC-007 "CI Prevention Gates" for the full gate specification.

---

## Quick Reference

| Category | REVOKE PUBLIC | GRANT authenticated | GRANT service_role | Example |
|----------|:---:|:---:|:---:|---------|
| **Default (client-callable)** | Yes | Yes | Yes | `rpc_create_player` |
| **Auth-flow exception** | No | N/A (PUBLIC) | Yes | `rpc_bootstrap_casino` |
| **Internal-only** | Yes | REVOKE | Yes | `rpc_get_rating_slip_duration` |
