# REM-ISSUE-003: ADR-015 RLS Compliance Patch

**Issue:** Comprehensive RLS policy gaps and regressions across services
**Status:** Ready for Execution
**Priority:** P1 - Security
**Created:** 2025-12-11
**Author:** Lead Architect
**Migration:** `20251211153228_adr015_rls_compliance_patch.sql`

---

## Executive Summary

Comprehensive audit revealed 16 tables missing RLS protection entirely, 2 tables with non-compliant policies, and 1 broken RPC function. This patch brings all tables into ADR-015 Pattern C compliance.

---

## Scope of Issues

### 1. Broken RPC Function

| Function | Issue | Impact |
|----------|-------|--------|
| `rpc_issue_mid_session_reward` | References dropped `rating_slip.player_id` column | Loyalty rewards fail at runtime |

**Root Cause:** Migration `20251207024918_rating_slip_drop_player_id.sql` removed `rating_slip.player_id`, but the RPC was not updated.

**Fix:** Derive player_id via JOIN: `rating_slip -> visit -> visit.player_id`

### 2. Non-Compliant RLS Policies

| Table | Policies | Issue |
|-------|----------|-------|
| `casino_settings` | 2 | Missing `auth.uid()` guard, no JWT fallback |
| `staff` | 4 of 5 | `staff_write/update/delete` missing JWT fallback |

**Pattern Violation:** Using direct `current_setting()` without COALESCE fallback to JWT claims.

### 3. Tables Missing RLS Entirely

| Domain | Tables | Risk |
|--------|--------|------|
| **Loyalty** | `player_loyalty`, `loyalty_ledger`, `loyalty_outbox` | Cross-tenant data exposure |
| **Finance** | `player_financial_transaction`, `finance_outbox` | Financial data leak |
| **Compliance** | `mtl_entry`, `mtl_audit_note` | MTL audit trail exposure |
| **Telemetry** | `game_settings`, `gaming_table_settings` | Configuration leak |
| **Table Context** | `table_inventory_snapshot`, `table_fill`, `table_credit`, `table_drop_event` | Chip custody data exposure |
| **Audit** | `audit_log`, `report` | Audit trail exposure |

**Total:** 16 tables without RLS protection.

---

## ADR-015 Pattern C Reference

All policies use the hybrid pattern with JWT fallback:

```sql
-- Pattern C: Hybrid with Fallback
auth.uid() IS NOT NULL
AND casino_id = COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)
```

**Why this pattern:**
1. `auth.uid() IS NOT NULL` - Guards against unauthenticated access
2. `NULLIF(..., '')` - Handles empty string edge case
3. `COALESCE` - Tries session context first, falls back to JWT claims
4. Works with both transaction-wrapped RPC AND JWT-only auth

---

## Migration Details

**File:** `supabase/migrations/20251211153228_adr015_rls_compliance_patch.sql`

### Section 1: Fix Broken RPCs

```sql
-- rpc_issue_mid_session_reward: Fixed player_id derivation
PERFORM 1
  FROM rating_slip rs
  JOIN visit v ON v.id = rs.visit_id
 WHERE rs.id = p_rating_slip_id
   AND v.player_id = p_player_id  -- From visit, not rating_slip
   AND rs.casino_id = p_casino_id
   AND rs.status IN ('open','paused');
```

### Section 2: Upgrade Non-Compliant Policies

**casino_settings:**
- `casino_settings_read` - Upgraded to Pattern C
- `casino_settings_write` - Upgraded to Pattern C with admin role check

**staff:**
- `staff_read` - Preserved bootstrap logic + added JWT fallback
- `staff_write` - Upgraded to Pattern C with admin role check
- `staff_update` - Upgraded to Pattern C with admin role check
- `staff_delete` - Upgraded to Pattern C with admin role check

### Section 3: Enable RLS on Missing Tables

Each table receives:
- `ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;`
- `{table}_select` policy (all authenticated staff in casino)
- `{table}_insert` policy (pit_boss/admin only for writes)
- `{table}_update` policy where applicable

---

## Compliance Matrix

| Table | Pre-Patch | Post-Patch | Policies Added |
|-------|-----------|------------|----------------|
| casino_settings | Non-compliant | Pattern C | 2 upgraded |
| staff | Partial | Pattern C | 4 upgraded |
| player_loyalty | No RLS | Pattern C | 3 new |
| loyalty_ledger | No RLS | Pattern C | 2 new |
| loyalty_outbox | No RLS | Pattern C | 2 new |
| player_financial_transaction | No RLS | Pattern C | 2 new |
| finance_outbox | No RLS | Pattern C | 2 new |
| mtl_entry | No RLS | Pattern C | 2 new |
| mtl_audit_note | No RLS | Pattern C | 2 new |
| game_settings | No RLS | Pattern C | 3 new |
| gaming_table_settings | No RLS | Pattern C | 3 new |
| table_inventory_snapshot | No RLS | Pattern C | 2 new |
| table_fill | No RLS | Pattern C | 3 new |
| table_credit | No RLS | Pattern C | 3 new |
| table_drop_event | No RLS | Pattern C | 2 new |
| audit_log | No RLS | Pattern C | 2 new |
| report | No RLS | Pattern C | 2 new |

**Total:** 6 policies upgraded, 35 new policies added.

---

## Execution Plan

### Pre-Execution Checklist

- [ ] Backup database before migration
- [ ] Verify no active transactions on affected tables
- [ ] Review migration in dev environment first

### Execution Steps

```bash
# 1. Apply migration
npx supabase migration up

# 2. Regenerate types
npm run db:types

# 3. Verify RLS enabled on all tables
psql -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"

# 4. Run RLS validation script
npx ts-node .claude/skills/backend-service-builder/scripts/validate_rls_coverage.ts
```

### Post-Execution Validation

- [ ] All tables show `rowsecurity = true`
- [ ] Loyalty RPC test passes: `SELECT * FROM rpc_issue_mid_session_reward(...)`
- [ ] API integration tests pass
- [ ] No cross-tenant data leakage in manual testing

---

## Rollback Plan

If issues occur, create rollback migration:

```sql
-- ONLY if needed - this removes security!
-- 20251211XXXXXX_rollback_adr015_patch.sql

-- Disable RLS on newly protected tables
ALTER TABLE player_loyalty DISABLE ROW LEVEL SECURITY;
-- ... repeat for each table

-- Drop new policies
DROP POLICY IF EXISTS player_loyalty_select ON player_loyalty;
-- ... repeat for each policy

-- Restore original RPC (NOT recommended - leaves bug in place)
```

**Warning:** Rollback removes security protections. Only use if patch causes functional issues.

---

## Related Documents

| Document | Purpose |
|----------|---------|
| `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` | Pattern C specification |
| `docs/issues/remediation/REM-ISSUE-002-rls-hybrid-policies.md` | Original Pattern C remediation |
| `docs/30-security/SEC-001-rls-policy-patterns.md` | RLS policy standards |

---

## Lessons Learned

1. **Schema changes require RPC audit:** When dropping columns, audit all RPCs that reference them
2. **RLS must be table-complete:** Every table with `casino_id` needs RLS policies
3. **Pattern C is mandatory:** All new RLS policies must use ADR-015 hybrid pattern
4. **Skills need conventions:** Updated `lead-architect` and `backend-service-builder` skills with explicit migration naming and RLS pattern requirements

---

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Lead Architect | Claude | 2025-12-11 | Prepared |
| Security Review | | | Pending |
| DBA Approval | | | Pending |
