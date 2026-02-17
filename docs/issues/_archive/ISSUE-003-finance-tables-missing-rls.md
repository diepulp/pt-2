# ISSUE-003: Critical Finance Tables Missing RLS

**Status:** OPEN
**Priority:** P0 - Security
**Created:** 2025-12-11
**Updated:** 2025-12-11
**Affects:** `player_financial_transaction`, `loyalty_ledger`, `mtl_entry` tables
**Related:** ADR-015, SEC-001, PRD-009
**Discovered By:** Pre-commit hooks audit (ADR-015 compliance check)

## Summary

The three critical finance tables (`player_financial_transaction`, `loyalty_ledger`, `mtl_entry`) have **no Row-Level Security enabled**. These are classified as "Phase 1: Critical Tables" in SEC-001 §680-682, requiring immediate RLS protection with ADR-015 Pattern C (hybrid with JWT fallback).

Additionally, the `rpc_create_financial_txn` RPC does not validate `p_casino_id` against the caller's RLS context, which could allow cross-tenant writes.

## Severity

| Risk | Impact | Likelihood |
|------|--------|------------|
| Cross-tenant data exposure | HIGH | Without RLS, any authenticated user can read all finance records |
| Cross-tenant writes | HIGH | RPC accepts any `casino_id` without validation |
| Compliance violation | HIGH | Finance ledgers contain sensitive transaction data |

## Affected Tables

| Table | RLS Enabled | Policies | casino_id Column |
|-------|-------------|----------|------------------|
| `player_financial_transaction` | **NO** | None | Yes (FK to casino) |
| `loyalty_ledger` | **NO** | None | Yes (FK to casino) |
| `mtl_entry` | **NO** | None | Yes (FK to casino) |

## Evidence

### Missing RLS (confirmed via grep)

```bash
$ grep -rn "player_financial_transaction.*row level" supabase/migrations/
# No results

$ grep -rn "loyalty_ledger.*row level" supabase/migrations/
# No results

$ grep -rn "mtl_entry.*row level" supabase/migrations/
# No results
```

### ADR-015 Migration Gap

The `20251209183401_adr015_hybrid_rls_policies.sql` migration covers:
- visit ✅
- player_casino ✅
- player ✅
- rating_slip_pause ✅
- rating_slip ✅
- gaming_table ✅
- dealer_rotation ✅

**Missing from ADR-015 migration:**
- player_financial_transaction ❌
- loyalty_ledger ❌
- mtl_entry ❌

### RPC Casino Validation Gap

```sql
-- Current implementation (baseline_srm.sql)
create or replace function rpc_create_financial_txn(
  p_casino_id uuid,
  p_player_id uuid,
  ...
) returns uuid
language plpgsql
security definer  -- Bypasses RLS by design
as $$
begin
  -- MISSING: No validation that p_casino_id matches caller's context
  insert into player_financial_transaction (...) values (...);
end;
$$;
```

**Per SEC-001 Template 5**, RPCs should validate:
```sql
-- Required pattern
v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
IF p_casino_id != v_context_casino_id THEN
  RAISE EXCEPTION 'casino_id mismatch';
END IF;
```

## What Passed

The TypeScript service layer (`services/player-financial/*.ts`) is ADR-015 compliant:
- ✅ No deprecated `exec_sql` usage
- ✅ No direct `SET LOCAL` strings
- ✅ Uses `rpc_create_financial_txn` correctly
- ✅ Proper mappers and DTOs

## Root Cause

The ADR-015 implementation focused on operational tables (visit, rating_slip, gaming_table) but deferred finance tables per SEC-001 migration priority:

> **Phase 1: Critical Tables** (Deploy First)
> 1. `player_financial_transaction` (Finance)
> 2. `loyalty_ledger` (Loyalty)
> 3. `mtl_entry`, `mtl_audit_note` (Compliance)

These were listed as "Phase 1" priority but were not included in the initial ADR-015 migration.

## Required Remediation

### 1. Enable RLS on Finance Tables

```sql
ALTER TABLE player_financial_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtl_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtl_audit_note ENABLE ROW LEVEL SECURITY;
```

### 2. Add ADR-015 Pattern C Policies

Per SEC-001 Template 3 (Append-Only Ledger):

```sql
-- Read policy (hybrid with JWT fallback)
CREATE POLICY player_financial_txn_select_same_casino
  ON player_financial_transaction
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Insert policy (role-gated: cashier, admin, pit_boss)
CREATE POLICY player_financial_txn_append_authorized
  ON player_financial_transaction
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('cashier', 'admin', 'pit_boss')
  );

-- Explicitly deny updates (append-only)
CREATE POLICY player_financial_txn_no_updates
  ON player_financial_transaction
  FOR UPDATE USING (false);

-- Explicitly deny deletes (append-only)
CREATE POLICY player_financial_txn_no_deletes
  ON player_financial_transaction
  FOR DELETE USING (false);
```

### 3. Update rpc_create_financial_txn

Add casino_id validation per SEC-001 Template 5:

```sql
CREATE OR REPLACE FUNCTION rpc_create_financial_txn(...)
RETURNS ...
AS $$
DECLARE
  v_context_casino_id uuid;
BEGIN
  -- Casino scope validation (SEC-001, ADR-015)
  v_context_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id != v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;

  -- Existing insert logic...
END;
$$;
```

## Action Items

- [ ] Create migration `YYYYMMDDHHMMSS_adr015_finance_table_rls.sql`
- [ ] Enable RLS on all four tables
- [ ] Add Pattern C read policies (SELECT)
- [ ] Add Pattern C append policies (INSERT with role check)
- [ ] Add explicit deny policies (UPDATE, DELETE)
- [ ] Update `rpc_create_financial_txn` with context validation
- [ ] Update similar RPCs (`rpc_issue_mid_session_reward`, etc.)
- [ ] Add integration tests for finance table RLS
- [ ] Update SEC-001 verification checklist

## Pre-commit Hook Coverage

The updated hooks (v2.5.0) will now catch this pattern:

| Hook | Check | Coverage |
|------|-------|----------|
| `pre-commit-migration-safety.sh` | Check 3 | Validates ADR-015 hybrid pattern in new policies |
| `pre-commit-migration-safety.sh` | Check 4 | Requires `auth.uid() IS NOT NULL` guard |
| `pre-commit-service-check.sh` | Check 12-14 | TypeScript RLS pattern compliance |

## References

- ADR-015: `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`
- SEC-001: `docs/30-security/SEC-001-rls-policy-matrix.md` (Template 3, Template 5)
- SEC-002: `docs/30-security/SEC-002-casino-scoped-security-model.md`
- PRD-009: Player Financial Service requirements
- Baseline: `supabase/migrations/00000000000000_baseline_srm.sql`
