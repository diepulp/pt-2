# RLS Context Integration Tests

## Overview

This directory contains integration tests for the RLS (Row-Level Security) context injection system implemented in ADR-015. These tests validate that the transaction-wrapped RLS context injection works correctly in a pooled connection environment.

## Test Files

- `rls-context.integration.test.ts` - Integration tests for RLS context injection

## Prerequisites

### Environment Variables

Required environment variables (usually set in `.env.local`):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Database Requirements

1. **Migration Applied**: The `set_rls_context()` RPC function must exist in the database
   - Migration file: `supabase/migrations/20251209183033_adr015_rls_context_rpc.sql`
   - Verify: `npx supabase migration list --linked`

2. **Schema Cache**: Supabase's PostgREST schema cache must be refreshed after migration
   - Auto-refreshes periodically (every few minutes)
   - Can trigger manual refresh via Supabase dashboard

## Running Tests

### Run all RLS context tests
```bash
npm test -- lib/supabase/__tests__/rls-context.integration.test.ts
```

### Run with watch mode
```bash
npm run test:watch -- lib/supabase/__tests__/rls-context.integration.test.ts
```

### Run with coverage
```bash
npm run test:coverage -- lib/supabase/__tests__/rls-context.integration.test.ts
```

## Troubleshooting

### Error: "Could not find the function public.set_rls_context"

This error indicates the RPC function is not available in Supabase's schema cache.

**Solution**:

1. Verify migration is applied:
   ```bash
   npx supabase migration list --linked
   ```
   Look for `20251209183033` in both Local and Remote columns.

2. Check function exists in database:
   ```sql
   SELECT
     proname,
     pg_get_function_arguments(oid) as args,
     pg_get_functiondef(oid) as definition
   FROM pg_proc
   WHERE proname = 'set_rls_context';
   ```

3. Refresh PostgREST schema cache:
   - Option A: Wait 2-5 minutes for auto-refresh
   - Option B: Restart PostgREST via Supabase dashboard
   - Option C: Run a schema-modifying migration to force refresh

### Error: "No authenticated user"

The integration tests use the **service role key** to bypass RLS for test setup. This is expected and correct behavior.

Tests create isolated test users and staff members to simulate authenticated contexts.

### Error: Test timeout

Integration tests create and tear down test data which can take time.

**Solution**: Increase Jest timeout in test file or use `--testTimeout` flag:
```bash
npm test -- lib/supabase/__tests__/rls-context.integration.test.ts --testTimeout=30000
```

## Test Coverage

The integration tests cover:

1. **Transaction-Wrapped Injection**
   - Context persistence across multiple queries
   - Cross-tenant access rejection
   - Rapid sequential request handling

2. **RPC Function Validation**
   - Valid parameter handling
   - Optional correlation_id support
   - Invalid input error handling
   - Multiple staff role support

3. **Hybrid Policy Fallback**
   - SET LOCAL context variable usage
   - COALESCE(current_setting, jwt_claim) pattern
   - Request isolation verification

4. **Context Parameter Validation**
   - Required parameter enforcement
   - Optional parameter handling
   - UUID format validation

## Architecture References

- ADR-015: RLS Context Injection
- Migration: `20251209183033_adr015_rls_context_rpc.sql`
- Implementation: `lib/supabase/rls-context.ts`

## Manual Verification

If automated tests cannot run (e.g., missing environment variables), you can manually verify RLS context injection:

### 1. Verify RPC Function Exists

```sql
-- Connect to your Supabase database
SELECT proname, pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'set_rls_context';
```

### 2. Test RPC Call

```sql
-- Call the function with test parameters
SELECT set_rls_context(
  'ca000000-0000-0000-0000-000000000001'::uuid,  -- actor_id
  'ca000000-0000-0000-0000-000000000001'::uuid,  -- casino_id
  'pit_boss',                                     -- staff_role
  'test-correlation-001'                          -- correlation_id
);
```

### 3. Verify Context Variables

```sql
-- After calling set_rls_context, check the variables
SELECT
  current_setting('app.actor_id', true) as actor_id,
  current_setting('app.casino_id', true) as casino_id,
  current_setting('app.staff_role', true) as staff_role,
  current_setting('application_name', true) as correlation_id;
```

Expected output should show the values you set in step 2.

### 4. Test Transaction Isolation

```sql
-- Start a transaction
BEGIN;

-- Set context
SELECT set_rls_context(
  'ca000000-0000-0000-0000-000000000001'::uuid,
  'ca000000-0000-0000-0000-000000000001'::uuid,
  'pit_boss',
  'test-001'
);

-- Verify context persists
SELECT current_setting('app.casino_id', true) as casino_id;

-- Rollback should clear the context (SET LOCAL is transaction-scoped)
ROLLBACK;

-- This should return NULL or error
SELECT current_setting('app.casino_id', true) as casino_id;
```

## Notes

- Integration tests use **service role key** to bypass RLS for test setup
- Tests create and clean up their own test data (casinos, staff, users)
- Tests are designed to be idempotent and can be run multiple times
- Schema cache refresh may cause intermittent failures immediately after migration deployment
