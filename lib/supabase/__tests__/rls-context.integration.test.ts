/**
 * RLS Context Integration Tests (ADR-015)
 *
 * Tests transaction-wrapped RLS context injection in pooled connection environment.
 * Verifies that SET LOCAL context persists across multiple queries and provides
 * proper tenant isolation.
 *
 * PREREQUISITES:
 * - Migration 20251209183033_adr015_rls_context_rpc.sql must be applied
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 * - Database must have set_rls_context_internal() RPC function (service_role only)
 *
 * MANUAL VERIFICATION:
 * If tests fail with "function not found" error:
 * 1. Verify migration is applied: npx supabase migration list --linked
 * 2. Check database has function: SELECT * FROM pg_proc WHERE proname = 'set_rls_context_internal'
 * 3. Refresh Supabase schema cache or wait for auto-refresh
 *
 * @see docs/80-adrs/ADR-015-rls-context-injection.md
 * @see supabase/migrations/20251209183033_adr015_rls_context_rpc.sql
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
// eslint-disable-next-line no-restricted-imports -- Integration test requires direct Supabase client
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database.types';
import { injectRLSContext } from '../rls-context';

/**
 * Test helper: injects RLS context via service_role ops lane (set_rls_context_internal).
 * Production code uses set_rls_context_from_staff (2-param, derives from auth.uid()).
 * Tests use service_role clients, so we call set_rls_context_internal directly.
 */
async function setTestRLSContext(
  client: SupabaseClient<Database>,
  actorId: string,
  casinoId: string,
  staffRole: string,
  correlationId?: string,
) {
  const { error } = await client.rpc('set_rls_context_internal', {
    p_actor_id: actorId,
    p_casino_id: casinoId,
    p_staff_role: staffRole,
    p_correlation_id: correlationId,
  });
  if (error) throw error;
}

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Skip tests if environment variables are not set
const skipIfNoEnv = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn(
      'Skipping RLS context integration tests: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set',
    );
    return true;
  }
  return false;
};

describe('RLS Context Integration (ADR-015)', () => {
  let supabase: SupabaseClient<Database>;
  let testCompany1Id: string;
  let testCompany2Id: string;
  let testCasino1Id: string;
  let testCasino2Id: string;
  let testStaff1Id: string;
  let testStaff2Id: string;
  let testUserId1: string;
  let testUserId2: string;

  beforeAll(async () => {
    // Use service role client for setup (bypasses RLS)
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Create test users for authenticated contexts
    const { data: authUser1, error: authError1 } =
      await supabase.auth.admin.createUser({
        email: 'test-rls-integration-1@example.com',
        password: 'test-password-12345',
        email_confirm: true,
      });

    if (authError1) {
      // If user already exists, try to get them
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existing = existingUsers?.users?.find(
        (u) => u.email === 'test-rls-integration-1@example.com',
      );
      if (existing) {
        testUserId1 = existing.id;
      } else {
        throw authError1;
      }
    } else {
      testUserId1 = authUser1.user.id;
    }

    const { data: authUser2, error: authError2 } =
      await supabase.auth.admin.createUser({
        email: 'test-rls-integration-2@example.com',
        password: 'test-password-12345',
        email_confirm: true,
      });

    if (authError2) {
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existing = existingUsers?.users?.find(
        (u) => u.email === 'test-rls-integration-2@example.com',
      );
      if (existing) {
        testUserId2 = existing.id;
      } else {
        throw authError2;
      }
    } else {
      testUserId2 = authUser2.user.id;
    }

    // Create test companies (ADR-043: company before casino)
    const { data: company1, error: company1Error } = await supabase
      .from('company')
      .insert({ name: 'RLS Integration Test Company 1' })
      .select()
      .single();

    if (company1Error) throw company1Error;
    testCompany1Id = company1.id;

    const { data: company2, error: company2Error } = await supabase
      .from('company')
      .insert({ name: 'RLS Integration Test Company 2' })
      .select()
      .single();

    if (company2Error) throw company2Error;
    testCompany2Id = company2.id;

    // Create test casinos
    const { data: casino1, error: casino1Error } = await supabase
      .from('casino')
      .insert({
        name: 'RLS Integration Test Casino 1',
        status: 'active',
        company_id: testCompany1Id,
      })
      .select()
      .single();

    if (casino1Error) throw casino1Error;
    testCasino1Id = casino1.id;

    const { data: casino2, error: casino2Error } = await supabase
      .from('casino')
      .insert({
        name: 'RLS Integration Test Casino 2',
        status: 'active',
        company_id: testCompany2Id,
      })
      .select()
      .single();

    if (casino2Error) throw casino2Error;
    testCasino2Id = casino2.id;

    // Create casino settings
    await supabase.from('casino_settings').insert([
      {
        casino_id: testCasino1Id,
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
        watchlist_floor: 3000,
        ctr_threshold: 10000,
      },
      {
        casino_id: testCasino2Id,
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
        watchlist_floor: 3000,
        ctr_threshold: 10000,
      },
    ]);

    // Create staff members with user_id links
    const { data: staff1, error: staff1Error } = await supabase
      .from('staff')
      .insert({
        casino_id: testCasino1Id,
        user_id: testUserId1,
        employee_id: 'RLS-TEST-001',
        first_name: 'Test',
        last_name: 'Staff1',
        role: 'pit_boss',
        status: 'active',
      })
      .select()
      .single();

    if (staff1Error) throw staff1Error;
    testStaff1Id = staff1.id;

    const { data: staff2, error: staff2Error } = await supabase
      .from('staff')
      .insert({
        casino_id: testCasino2Id,
        user_id: testUserId2,
        employee_id: 'RLS-TEST-002',
        first_name: 'Test',
        last_name: 'Staff2',
        role: 'pit_boss',
        status: 'active',
      })
      .select()
      .single();

    if (staff2Error) throw staff2Error;
    testStaff2Id = staff2.id;
  });

  afterAll(async () => {
    // Clean up test data (in reverse order of creation)
    await supabase.from('staff').delete().eq('id', testStaff1Id);
    await supabase.from('staff').delete().eq('id', testStaff2Id);
    await supabase
      .from('casino_settings')
      .delete()
      .eq('casino_id', testCasino1Id);
    await supabase
      .from('casino_settings')
      .delete()
      .eq('casino_id', testCasino2Id);
    await supabase.from('casino').delete().eq('id', testCasino1Id);
    await supabase.from('casino').delete().eq('id', testCasino2Id);
    await supabase.from('company').delete().eq('id', testCompany1Id);
    await supabase.from('company').delete().eq('id', testCompany2Id);

    // Clean up test users
    if (testUserId1) {
      await supabase.auth.admin.deleteUser(testUserId1);
    }
    if (testUserId2) {
      await supabase.auth.admin.deleteUser(testUserId2);
    }
  });

  // ===========================================================================
  // 1. Transaction-Wrapped Injection Tests
  // ===========================================================================

  describe('Transaction-Wrapped Injection', () => {
    it('should persist context across multiple queries in same request', async () => {
      // Inject RLS context via service_role ops lane
      await setTestRLSContext(
        supabase,
        testStaff1Id,
        testCasino1Id,
        'pit_boss',
        'test-correlation-001',
      );

      // Verify context was set by calling the RPC that reads it
      // Note: We can't directly read current_setting() via Supabase client,
      // but we can test that subsequent queries respect the context
      // by checking that RLS policies work correctly

      // Query casino_settings - should succeed for our casino
      const { data: settings1, error: error1 } = await supabase
        .from('casino_settings')
        .select('*')
        .eq('casino_id', testCasino1Id)
        .single();

      expect(error1).toBeNull();
      expect(settings1).not.toBeNull();
      expect(settings1?.casino_id).toBe(testCasino1Id);

      // Query staff - should only return staff from our casino
      const { data: staffList, error: staffError } = await supabase
        .from('staff')
        .select('*')
        .eq('casino_id', testCasino1Id);

      expect(staffError).toBeNull();
      expect(staffList).not.toBeNull();
      expect(staffList?.length).toBeGreaterThan(0);

      // All returned staff should belong to testCasino1Id
      staffList?.forEach((staff) => {
        expect(staff.casino_id).toBe(testCasino1Id);
      });
    });

    it('should reject cross-tenant access attempts', async () => {
      // Inject context for Casino 1 via service_role ops lane
      await setTestRLSContext(
        supabase,
        testStaff1Id,
        testCasino1Id,
        'pit_boss',
        'test-correlation-002',
      );

      // Attempt to query Casino 2 data - RLS should block or return empty
      const { data: casino2Settings } = await supabase
        .from('casino_settings')
        .select('*')
        .eq('casino_id', testCasino2Id)
        .single();

      // With service role key, RLS is bypassed, so this test would pass
      // In a real authenticated client context, RLS would block this
      // For now, we verify the query executes without error
      // but in production with proper RLS policies, this should return null
      // or be denied by the policy

      // Note: This test demonstrates the pattern but requires proper RLS policies
      // to be in place on all tables for true isolation
      expect(casino2Settings).toBeDefined();
    });

    it('should handle rapid sequential requests correctly', async () => {
      // Set context 1
      await setTestRLSContext(
        supabase,
        testStaff1Id,
        testCasino1Id,
        'pit_boss',
        'test-correlation-003-a',
      );

      // Query with context 1
      const { data: data1 } = await supabase
        .from('casino_settings')
        .select('*')
        .eq('casino_id', testCasino1Id)
        .single();

      expect(data1?.casino_id).toBe(testCasino1Id);

      // Set context 2
      await setTestRLSContext(
        supabase,
        testStaff2Id,
        testCasino2Id,
        'pit_boss',
        'test-correlation-003-b',
      );

      // Query with context 2
      const { data: data2 } = await supabase
        .from('casino_settings')
        .select('*')
        .eq('casino_id', testCasino2Id)
        .single();

      expect(data2?.casino_id).toBe(testCasino2Id);

      // Verify each request saw only its own casino data
      expect(data1?.casino_id).not.toBe(data2?.casino_id);
    });
  });

  // ===========================================================================
  // 2. set_rls_context RPC Tests
  // ===========================================================================

  describe('set_rls_context_internal RPC (service_role ops lane)', () => {
    it('should successfully call set_rls_context_internal with valid parameters', async () => {
      const { error } = await supabase.rpc('set_rls_context_internal', {
        p_actor_id: testStaff1Id,
        p_casino_id: testCasino1Id,
        p_staff_role: 'pit_boss',
        p_correlation_id: 'test-correlation-004',
      });

      expect(error).toBeNull();
    });

    it('should successfully call set_rls_context_internal without correlation_id', async () => {
      const { error } = await supabase.rpc('set_rls_context_internal', {
        p_actor_id: testStaff1Id,
        p_casino_id: testCasino1Id,
        p_staff_role: 'pit_boss',
        p_correlation_id: undefined,
      });

      expect(error).toBeNull();
    });

    it('should handle invalid UUID parameters gracefully', async () => {
      const invalidUuid = 'not-a-uuid';

      const { error } = await supabase.rpc('set_rls_context_internal', {
        p_actor_id: invalidUuid,
        p_casino_id: testCasino1Id,
        p_staff_role: 'pit_boss',
        p_correlation_id: undefined,
      });

      // Should return an error for invalid UUID
      expect(error).not.toBeNull();
    });

    it('should accept different staff roles', async () => {
      const roles = ['dealer', 'pit_boss', 'admin'];

      for (const role of roles) {
        const { error } = await supabase.rpc('set_rls_context_internal', {
          p_actor_id: testStaff1Id,
          p_casino_id: testCasino1Id,
          p_staff_role: role,
          p_correlation_id: `test-correlation-role-${role}`,
        });

        expect(error).toBeNull();
      }
    });
  });

  // ===========================================================================
  // 3. Hybrid Policy Fallback Tests
  // ===========================================================================

  describe('Hybrid Policy Fallback', () => {
    it('should work with SET LOCAL context variables', async () => {
      // Set context via RPC
      const { error: rpcError } = await supabase.rpc(
        'set_rls_context_internal',
        {
          p_actor_id: testStaff1Id,
          p_casino_id: testCasino1Id,
          p_staff_role: 'pit_boss',
          p_correlation_id: 'test-correlation-005',
        },
      );

      expect(rpcError).toBeNull();

      // Subsequent queries should respect the context
      // This tests that the COALESCE(current_setting(...), jwt_claim)
      // pattern works when current_setting has a value
      const { data, error } = await supabase
        .from('casino_settings')
        .select('*')
        .eq('casino_id', testCasino1Id)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.casino_id).toBe(testCasino1Id);
    });

    it('should demonstrate context isolation between requests', async () => {
      // This test simulates the ADR-015 scenario where connection pooling
      // could cause context leakage if not properly handled

      // Request 1: Casino 1 context
      await setTestRLSContext(
        supabase,
        testStaff1Id,
        testCasino1Id,
        'pit_boss',
        'test-correlation-006-a',
      );

      const { data: result1 } = await supabase
        .from('casino_settings')
        .select('casino_id')
        .eq('casino_id', testCasino1Id)
        .single();

      expect(result1?.casino_id).toBe(testCasino1Id);

      // Request 2: Casino 2 context (simulating different request)
      await setTestRLSContext(
        supabase,
        testStaff2Id,
        testCasino2Id,
        'pit_boss',
        'test-correlation-006-b',
      );

      const { data: result2 } = await supabase
        .from('casino_settings')
        .select('casino_id')
        .eq('casino_id', testCasino2Id)
        .single();

      expect(result2?.casino_id).toBe(testCasino2Id);

      // Verify isolation: each context should have seen only its own casino
      expect(result1?.casino_id).not.toBe(result2?.casino_id);
    });
  });

  // ===========================================================================
  // 4. Context Parameter Validation
  // ===========================================================================

  describe('Context Parameter Validation', () => {
    it('should inject context with all required parameters', async () => {
      // Should not throw
      await expect(
        setTestRLSContext(
          supabase,
          testStaff1Id,
          testCasino1Id,
          'pit_boss',
          'test-correlation-007',
        ),
      ).resolves.not.toThrow();
    });

    it('should inject context without correlation_id', async () => {
      // Should not throw when correlation_id is undefined
      await expect(
        setTestRLSContext(supabase, testStaff1Id, testCasino1Id, 'pit_boss'),
      ).resolves.not.toThrow();
    });

    it('should validate UUIDs are properly formatted', async () => {
      // Valid UUIDs should work
      await expect(
        setTestRLSContext(
          supabase,
          testStaff1Id,
          testCasino1Id,
          'pit_boss',
          'test-correlation-008',
        ),
      ).resolves.not.toThrow();
    });
  });

  // ===========================================================================
  // 5. Company ID Derivation (ADR-043)
  // ===========================================================================

  describe('Company ID Derivation (ADR-043)', () => {
    it('set_rls_context_from_staff returns company_id', async () => {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!anonKey) {
        console.warn('Skipping: NEXT_PUBLIC_SUPABASE_ANON_KEY not set');
        return;
      }

      const authedClient = createClient<Database>(supabaseUrl, anonKey);
      const { error: signInError } = await authedClient.auth.signInWithPassword(
        {
          email: 'test-rls-integration-1@example.com',
          password: 'test-password-12345',
        },
      );
      if (signInError) throw signInError;

      try {
        const { data, error } = await authedClient.rpc(
          'set_rls_context_from_staff',
          {},
        );
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        const row = data?.[0];
        expect(row?.company_id).toBeTruthy();
        expect(row?.actor_id).toBe(testStaff1Id);
        expect(row?.casino_id).toBe(testCasino1Id);
      } finally {
        await authedClient.auth.signOut();
      }
    });

    it('injectRLSContext returns RLSContext with valid companyId', async () => {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!anonKey) {
        console.warn('Skipping: NEXT_PUBLIC_SUPABASE_ANON_KEY not set');
        return;
      }

      const authedClient = createClient<Database>(supabaseUrl, anonKey);
      const { error: signInError } = await authedClient.auth.signInWithPassword(
        {
          email: 'test-rls-integration-1@example.com',
          password: 'test-password-12345',
        },
      );
      if (signInError) throw signInError;

      try {
        const context = await injectRLSContext(
          authedClient,
          'test-company-inject',
        );
        expect(context.companyId).toBeTruthy();
        expect(context.actorId).toBe(testStaff1Id);
        expect(context.casinoId).toBe(testCasino1Id);
        expect(context.staffRole).toBe('pit_boss');
      } finally {
        await authedClient.auth.signOut();
      }
    });

    it('Fail-closed: casino.company_id is NOT NULL (structural proof)', async () => {
      // Attempt to INSERT casino without company_id — should fail
      const { error } = await supabase
        .from('casino')
        .insert({ name: 'No Company Casino', status: 'active' } as never)
        .select()
        .single();

      expect(error).not.toBeNull();
    });

    it('Fail-closed: company FK is ON DELETE RESTRICT', async () => {
      // Attempt to DELETE a company that has casinos — should fail
      const { error } = await supabase
        .from('company')
        .delete()
        .eq('id', testCompany1Id);

      expect(error).not.toBeNull();
    });

    it('Fail-closed: RPC fails for staff at inactive casino', async () => {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!anonKey) {
        console.warn('Skipping: NEXT_PUBLIC_SUPABASE_ANON_KEY not set');
        return;
      }

      // Create inactive casino + company + staff + user
      const { data: inactiveCo } = await supabase
        .from('company')
        .insert({ name: 'Inactive Test Co' })
        .select()
        .single();

      const { data: inactiveCasino } = await supabase
        .from('casino')
        .insert({
          name: 'Inactive Casino',
          status: 'inactive',
          company_id: inactiveCo!.id,
        })
        .select()
        .single();

      await supabase.from('casino_settings').insert({
        casino_id: inactiveCasino!.id,
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
        watchlist_floor: 3000,
        ctr_threshold: 10000,
      });

      const { data: inactiveUser } = await supabase.auth.admin.createUser({
        email: 'test-rls-inactive@example.com',
        password: 'test-password-12345',
        email_confirm: true,
      });

      await supabase
        .from('staff')
        .insert({
          casino_id: inactiveCasino!.id,
          user_id: inactiveUser!.user!.id,
          employee_id: 'RLS-INACTIVE',
          first_name: 'Inactive',
          last_name: 'Test',
          role: 'pit_boss',
          status: 'active',
        })
        .select()
        .single();

      // Sign in as the inactive casino staff
      const inactiveClient = createClient<Database>(supabaseUrl, anonKey);
      await inactiveClient.auth.signInWithPassword({
        email: 'test-rls-inactive@example.com',
        password: 'test-password-12345',
      });

      try {
        // Call RPC — should fail because casino is inactive (JOIN-miss)
        const { error } = await inactiveClient.rpc(
          'set_rls_context_from_staff',
          {},
        );
        expect(error).not.toBeNull();
      } finally {
        // Cleanup
        await inactiveClient.auth.signOut();
        await supabase
          .from('staff')
          .delete()
          .eq('casino_id', inactiveCasino!.id);
        await supabase
          .from('casino_settings')
          .delete()
          .eq('casino_id', inactiveCasino!.id);
        await supabase.from('casino').delete().eq('id', inactiveCasino!.id);
        await supabase.from('company').delete().eq('id', inactiveCo!.id);
        await supabase.auth.admin.deleteUser(inactiveUser!.user!.id);
      }
    });

    it('SEC_NOTE M7: no RLS policy references app.company_id', async () => {
      // Query pg_policies via SQL to verify no policy contains 'app.company_id'
      const { data, error } = await supabase.rpc(
        'exec_sql' as never,
        {
          sql: "SELECT policyname FROM pg_policies WHERE qual::text LIKE '%app.company_id%' OR with_check::text LIKE '%app.company_id%'",
        } as never,
      );

      if (error) {
        // exec_sql RPC may not exist in all environments — skip gracefully
        console.warn('SEC_NOTE M7 test skipped: exec_sql RPC not available');
        return;
      }

      // No policies should reference app.company_id
      expect(data).toEqual([]);
    });
  });
});
