# RLS Audit

Inspect Supabase Row-Level Security (RLS) policies for a specific table and confirm alignment with SEC-001 security matrix.

## Purpose

Validates that database RLS policies correctly enforce:
- Tenancy isolation (`casino_id` or `corporate_id` scoping)
- Role-based access control (RBAC)
- Ownership rules defined in Service Responsibility Matrix (SRM)
- Security compliance per SEC-001 standards

## Parameters

- `table` (required): Fully qualified table name (e.g., `public.player`, `public.visit`)
- `casino_id` (optional): Casino scope for verifying tenancy filters in test queries
- `policy_name` (optional): Focus review on specific policy name

## Usage

```bash
# Audit all policies for a table
/rls-audit table=public.player

# Audit with casino scope verification
/rls-audit table=public.visit casino_id=550e8400-e29b-41d4-a716-446655440000

# Focus on specific policy
/rls-audit table=public.rating_slip policy_name=rating_slip_casino_isolation
```

## Execution Checklist

### 1. Load Security Matrix

- Read `docs/30-security/SEC-001-rls-policy-matrix.md`
- Locate the row for the specified table
- Record expected:
  - Ownership model (casino-scoped, corporate-scoped, global)
  - Required roles (admin, pit_boss, dealer, etc.)
  - Predicate behavior (SELECT, INSERT, UPDATE, DELETE)
  - Tenancy enforcement rules

### 2. Query Database Policies

Use Supabase CLI or direct PostgreSQL access:

```sql
-- Inspect all policies for table
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = split_part('table_name', '.', 1)
  AND tablename = split_part('table_name', '.', 2);
```

Or via Supabase CLI:
```bash
supabase db remote commit --dry-run
# Then run SQL query via psql
```

### 3. Compare Against Matrix

For each policy found, verify:

- ✅ **Casino/Corporate Scoping**: Policy predicate includes `casino_id` or `corporate_id` filter
- ✅ **Role Enforcement**: `roles` array matches SEC-001 requirements
- ✅ **Operation Coverage**: Policies exist for all required operations (SELECT, INSERT, UPDATE, DELETE)
- ✅ **Predicate Logic**: `USING` and `WITH CHECK` clauses correctly implement ownership rules
- ✅ **Permissive vs Restrictive**: Policy type matches security model

### 4. Test with Sample Queries (Optional)

When `casino_id` parameter provided, test policies with actual data:

```sql
-- Test SELECT policy enforcement
SET ROLE authenticated;
SET request.jwt.claim.casino_id = 'casino_id_value';

SELECT *
FROM table_name
WHERE casino_id = 'casino_id_value'
LIMIT 10;
```

Verify:
- ✅ Query succeeds for authorized casino
- ❌ Query fails or returns empty for unauthorized casino
- ✅ Results respect tenancy boundaries

### 5. Document Findings

Capture in task or PR description:

- **Compliance Status**: ✅ Compliant / ⚠️ Warnings / ❌ Non-compliant
- **Issues Found**: List any missing policies, incorrect predicates, or role mismatches
- **Remediation Notes**: SQL to fix issues, citing SEC-001 matrix row
- **Test Results**: Output from sample queries (if run)

## Common Issues & Fixes

### Missing Casino Scoping

**Issue**: Policy lacks `casino_id` filter
```sql
-- ❌ WRONG
CREATE POLICY "select_visits" ON visit
FOR SELECT USING (true);
```

**Fix**: Add tenancy predicate
```sql
-- ✅ CORRECT
CREATE POLICY "select_visits" ON visit
FOR SELECT USING (
  casino_id = (current_setting('request.jwt.claim.casino_id'))::uuid
);
```

### Incorrect Role Assignment

**Issue**: Policy allows overly broad roles
```sql
-- ❌ WRONG
CREATE POLICY "update_player" ON player
FOR UPDATE TO authenticated  -- Too broad
USING (...);
```

**Fix**: Restrict to specific roles
```sql
-- ✅ CORRECT
CREATE POLICY "update_player" ON player
FOR UPDATE TO pit_boss, admin  -- Per SEC-001
USING (...);
```

### Missing Operation Policies

**Issue**: No policy for INSERT/UPDATE/DELETE
```sql
-- ❌ Only SELECT policy exists
```

**Fix**: Add missing operation policies per SEC-001

## Exit Codes

- `0`: All policies compliant with SEC-001
- `1`: Warnings found (review recommended)
- `2`: Critical violations (must fix before merge)

## Related Documentation

- **SEC-001 Matrix**: `docs/30-security/SEC-001-rls-policy-matrix.md`
- **SRM Ownership**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **RLS Patterns**: `docs/30-security/RLS_POLICY_PATTERNS.md`
- **Supabase RLS**: https://supabase.com/docs/guides/auth/row-level-security

## CI/CD Integration

This audit can be integrated into CI pipelines:

```yaml
# .github/workflows/security-audit.yml
- name: RLS Policy Audit
  run: |
    claude "/rls-audit table=public.player" --print
    claude "/rls-audit table=public.visit" --print
    claude "/rls-audit table=public.rating_slip" --print
```

Fails CI if any critical violations detected.
