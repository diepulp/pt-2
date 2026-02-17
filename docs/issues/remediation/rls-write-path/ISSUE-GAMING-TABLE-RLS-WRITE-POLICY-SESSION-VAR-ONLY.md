# ISSUE: gaming_table INSERT/UPDATE RLS Policies Require Session Vars Only

| Field            | Value                                              |
| ---------------- | -------------------------------------------------- |
| **ID**           | GAMING-TABLE-RLS-WRITE-POLICY                      |
| **Severity**     | Blocker                                            |
| **Status**       | Remediated — pending `/rls-expert` review          |
| **Discovered**   | 2026-02-11 (PRD-030 WS5 E2E testing)              |
| **Affected Table** | `gaming_table`                                   |
| **ADR Refs**     | ADR-015, ADR-020, ADR-030                          |

## Symptom

All `gaming_table` INSERT and UPDATE operations via PostgREST fail with:

```
new row violates row-level security policy for table "gaming_table"
```

This blocks the Setup Wizard (PRD-030) Step 2 (Create Tables) and Step 3 (Par Targets) — no tables can be created or updated through server actions.

## Root Cause

The `gaming_table` INSERT and UPDATE RLS policies were written with **session-var-only** checks (ADR-030 write-path hardening pattern), but `gaming_table` is **NOT** on the ADR-030 critical tables list.

### ADR-030 §D4 Critical Tables (session-var-only enforcement)

```
staff, player, player_financial_transaction, visit, rating_slip, loyalty_ledger
```

`gaming_table` is absent from this list and should use the standard **Pattern C** (COALESCE with JWT fallback) per ADR-015/ADR-020.

### Why It Fails

The `withServerAction` middleware calls `set_rls_context_from_staff()` via RPC, which uses `SET LOCAL` to set session variables (`app.casino_id`, `app.actor_id`, `app.staff_role`). However, `SET LOCAL` is **transaction-scoped** — the variables are lost when the RPC transaction commits. Subsequent PostgREST requests (e.g., `.from('gaming_table').upsert(...)`) execute in a **new transaction** without session variables.

**Before (broken):**

```sql
-- gaming_table_insert_admin (WITH CHECK)
auth.uid() IS NOT NULL
AND NULLIF(current_setting('app.casino_id', true), '') IS NOT NULL
AND NULLIF(current_setting('app.actor_id', true), '') IS NOT NULL
AND casino_id = current_setting('app.casino_id')::uuid
AND current_setting('app.staff_role') IN ('pit_boss', 'admin')
```

Session vars are always empty in a fresh PostgREST request → policy denies INSERT.

### Contrast with Working Policies

The `gaming_table` **SELECT** policy already used Pattern C correctly:

```sql
-- gaming_table_select_same_casino (USING)
auth.uid() IS NOT NULL
AND casino_id = COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  ((auth.jwt() -> 'app_metadata' ->> 'casino_id'))::uuid
)
```

The `casino_settings` table uses an **ALL** policy with COALESCE and works correctly for all operations.

## Remediation Applied

Migration: `20260211060000_prd030_fix_gaming_table_write_policies_coalesce.sql`

Replaced session-var-only INSERT/UPDATE policies with Pattern C (COALESCE) + role gate:

```sql
-- gaming_table_insert_admin (WITH CHECK) — AFTER FIX
CREATE POLICY gaming_table_insert_admin ON gaming_table
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      ((auth.jwt() -> 'app_metadata' ->> 'casino_id'))::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );
```

Same pattern applied to UPDATE policy (both USING and WITH CHECK clauses).

## Security Analysis

| Property                  | Before (broken)     | After (fix)                      |
| ------------------------- | ------------------- | -------------------------------- |
| Auth gate                 | `auth.uid() IS NOT NULL` | `auth.uid() IS NOT NULL`    |
| Casino scoping            | Session var only    | COALESCE (session var → JWT)     |
| Role gate                 | Session var only    | COALESCE (session var → JWT)     |
| Permitted roles           | `pit_boss`, `admin` | `pit_boss`, `admin` (unchanged)  |
| Cross-tenant isolation    | Guaranteed          | Guaranteed (casino_id match)     |
| Pattern compliance        | ADR-030 (incorrect) | ADR-015/ADR-020 Pattern C        |

The JWT fallback reads `casino_id` and `staff_role` from `auth.jwt() -> 'app_metadata'`, which is set during auth and cannot be spoofed by the client.

## Review Required

This remediation should be validated by `/rls-expert` for:

1. **ADR-030 compliance** — confirm `gaming_table` should NOT be on the critical tables list
2. **Pattern C correctness** — verify COALESCE expression matches canonical form
3. **Audit for sibling tables** — check if other non-critical tables have the same session-var-only bug
4. **SEC-001 matrix update** — update `docs/30-security/SEC-001-rls-policy-matrix.md` if applicable

## Verification

E2E tests passing after fix:

```
✓ Full Flow: 5-step wizard bootstrap to dashboard (14.5s)
✓ Re-entry /setup → /pit redirect (3.8s)
✓ Re-entry /start → /pit redirect (4.6s)
✓ Mid-Flow Refresh: correct step resume, no duplicates (13.8s)
```
