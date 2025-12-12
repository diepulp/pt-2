# RLS Verification Checklist

Comprehensive checklist for validating RLS policy implementations.

## Pre-Deployment Checklist

### Schema Requirements

- [ ] Table has `casino_id uuid NOT NULL REFERENCES casino(id)`
- [ ] Table has RLS enabled: `ALTER TABLE {table} ENABLE ROW LEVEL SECURITY`
- [ ] `staff.user_id uuid REFERENCES auth.users(id)` exists
- [ ] `set_rls_context()` RPC exists (Migration `20251209183033`)
- [ ] JWT `app_metadata` includes `casino_id` for fallback

### Policy Pattern Requirements

- [ ] Policies use `auth.uid() IS NOT NULL` for authentication check
- [ ] Policies use hybrid `COALESCE()` pattern for `casino_id`:
  ```sql
  COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  )
  ```
- [ ] Actor identity checks use hybrid pattern for `app.actor_id`
- [ ] Role checks use hybrid pattern for `app.staff_role`
- [ ] Read policies defined for `SELECT`
- [ ] Write policies defined for `INSERT`, `UPDATE`, `DELETE` as appropriate
- [ ] Role-gated policies check `staff.casino_id` matches context
- [ ] Append-only ledgers have `no_updates` and `no_deletes` policies

### RPC Requirements

- [ ] Service-owned RPCs validate `casino_id` alignment
- [ ] RPCs use `SECURITY DEFINER` where needed
- [ ] RPCs set `search_path = public`
- [ ] RPCs enforce idempotency via `idempotency_key`
- [ ] All context injection uses `set_rls_context()` (not legacy `exec_sql`)

### Application Requirements

- [ ] Server Actions use `withServerAction` wrapper
- [ ] `injectRLSContext()` calls `set_rls_context()` RPC
- [ ] No `SERVICE_ROLE_KEY` in runtime code (grep codebase)
- [ ] All mutations include `x-idempotency-key` header
- [ ] All requests include `x-correlation-id` header

### ADR-015 Compliance

- [ ] No legacy `exec_sql()` loop patterns in codebase
- [ ] All policies support hybrid context resolution
- [ ] Connection pooling compatibility verified (transaction mode)

---

## Manual Testing Procedure

### Step 1: Set RLS Context

```sql
-- Set context using the ADR-015 RPC
SELECT set_rls_context(
  p_actor_id := '00000000-0000-0000-0000-000000000001',
  p_casino_id := 'your-casino-uuid',
  p_staff_role := 'pit_boss',
  p_correlation_id := 'test-verification'
);
```

### Step 2: Verify Read Access

```sql
-- Should return only rows for your casino
SELECT count(*) FROM your_table;

-- Verify casino_id filter is applied
SELECT DISTINCT casino_id FROM your_table;
-- Expected: Only 'your-casino-uuid'
```

### Step 3: Test Cross-Tenant Isolation

```sql
-- Should FAIL: Cross-casino insert
INSERT INTO your_table (casino_id, other_columns...)
VALUES ('other-casino-uuid', ...);
-- Expected error: violates row-level security policy

-- Should SUCCEED: Same-casino insert (if role permitted)
INSERT INTO your_table (casino_id, other_columns...)
VALUES ('your-casino-uuid', ...);
```

### Step 4: Test Role Restrictions

```sql
-- Switch to restricted role
SELECT set_rls_context(
  p_actor_id := '...',
  p_casino_id := 'your-casino-uuid',
  p_staff_role := 'cashier'  -- or other role with restrictions
);

-- Test operation that should be denied
-- Should FAIL based on role
UPDATE your_table SET ... WHERE ...;
```

### Step 5: Test JWT Fallback

```sql
-- Clear transaction context
RESET ALL;

-- Query should still work via JWT fallback
-- (when connected as authenticated user with app_metadata.casino_id)
SELECT count(*) FROM your_table;
```

---

## Automated Testing

### Integration Test Pattern

```typescript
describe('RLS Policy: your_table', () => {
  it('should restrict access to same casino', async () => {
    // Setup: Create test staff in different casinos
    const casinoA = await createTestCasino();
    const casinoB = await createTestCasino();
    const staffA = await createTestStaff(casinoA.id, 'pit_boss');

    // Create records in both casinos
    await createTestRecord(casinoA.id);
    await createTestRecord(casinoB.id);

    // Query as staff from casino A
    const client = await createAuthenticatedClient(staffA.userId);
    await client.rpc('set_rls_context', {
      p_actor_id: staffA.id,
      p_casino_id: casinoA.id,
      p_staff_role: 'pit_boss'
    });

    const { data, error } = await client
      .from('your_table')
      .select('*');

    // Should only see casino A records
    expect(error).toBeNull();
    expect(data.every(r => r.casino_id === casinoA.id)).toBe(true);
  });

  it('should block cross-casino inserts', async () => {
    const casinoA = await createTestCasino();
    const casinoB = await createTestCasino();
    const staffA = await createTestStaff(casinoA.id, 'pit_boss');

    const client = await createAuthenticatedClient(staffA.userId);
    await client.rpc('set_rls_context', {
      p_actor_id: staffA.id,
      p_casino_id: casinoA.id,
      p_staff_role: 'pit_boss'
    });

    // Attempt cross-casino insert
    const { error } = await client
      .from('your_table')
      .insert({ casino_id: casinoB.id, ... });

    expect(error).not.toBeNull();
    expect(error.code).toBe('42501'); // RLS violation
  });
});
```

### Test File Location

Tests should be placed in:
- `lib/supabase/__tests__/rls-{table}.integration.test.ts`
- Or: `services/{service}/__tests__/{table}.rls.test.ts`

---

## Policy Audit Queries

### List All RLS Policies for a Table

```sql
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
WHERE tablename = 'your_table';
```

### Check RLS Status

```sql
SELECT
  schemaname,
  tablename,
  rowsecurity,
  forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

### Find Tables Without RLS

```sql
SELECT
  schemaname,
  tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
  AND tablename NOT IN ('schema_migrations', 'spatial_ref_sys');
```

### Verify Hybrid Pattern in Policies

```sql
-- Check for proper COALESCE pattern
SELECT policyname, qual, with_check
FROM pg_policies
WHERE tablename = 'your_table'
  AND (qual NOT LIKE '%COALESCE%' OR qual NOT LIKE '%NULLIF%');
-- Should return empty if all policies use hybrid pattern
```

---

## Common Verification Failures

### 1. Empty Results (Unexpected)

**Symptom**: Query returns no rows when data exists

**Cause**: Context not injected properly

**Fix**: Ensure `set_rls_context()` is called before queries

### 2. Cross-Tenant Data Visible

**Symptom**: Can see data from other casinos

**Cause**: Missing or incorrect `casino_id` check in policy

**Fix**: Add/fix `casino_id = COALESCE(...)` condition

### 3. Connection Pooling Intermittent Failures

**Symptom**: Random empty results or failures

**Cause**: Legacy SET LOCAL pattern without JWT fallback

**Fix**: Migrate to Pattern C (Hybrid) with JWT fallback

### 4. Dealers Can Access Data

**Symptom**: Dealer accounts can query tables

**Cause**: Missing `auth.uid() IS NOT NULL` check

**Fix**: Add authentication check to policy

### 5. Role Check Bypassed

**Symptom**: Lower-privilege roles can write

**Cause**: Missing role check in policy

**Fix**: Add role validation in WITH CHECK clause

---

## Quick Verification Script

```bash
#!/bin/bash
# Verify RLS compliance for a table

TABLE_NAME=$1

echo "=== RLS Verification: $TABLE_NAME ==="

# Check RLS enabled
echo "1. RLS Status:"
psql -c "SELECT rowsecurity FROM pg_tables WHERE tablename='$TABLE_NAME';"

# List policies
echo "2. Policies:"
psql -c "SELECT policyname, cmd FROM pg_policies WHERE tablename='$TABLE_NAME';"

# Check for COALESCE pattern
echo "3. Hybrid Pattern Check:"
psql -c "SELECT policyname FROM pg_policies WHERE tablename='$TABLE_NAME' AND qual LIKE '%COALESCE%NULLIF%';"

# Check for auth.uid()
echo "4. Auth Check:"
psql -c "SELECT policyname FROM pg_policies WHERE tablename='$TABLE_NAME' AND qual LIKE '%auth.uid()%';"
```
