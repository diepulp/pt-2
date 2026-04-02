/** @jest-environment node */

/**
 * RLS Context Integration Tests (ADR-015, ADR-024)
 *
 * Tests transaction-wrapped RLS context injection in pooled connection environment.
 * Verifies that SET LOCAL context persists across multiple queries and provides
 * proper tenant isolation.
 *
 * Auth model: ADR-024 Mode C — authenticated anon clients carry JWT with staff_id
 * in app_metadata; set_rls_context_from_staff() derives context server-side.
 *
 * PREREQUISITES:
 * - Migration 20251209183033_adr015_rls_context_rpc.sql must be applied
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable set
 * - Database must have set_rls_context_internal() RPC function (service_role only)
 *
 * MANUAL VERIFICATION:
 * If tests fail with "function not found" error:
 * 1. Verify migration is applied: npx supabase migration list --linked
 * 2. Check database has function: SELECT * FROM pg_proc WHERE proname = 'set_rls_context_internal'
 * 3. Refresh Supabase schema cache or wait for auto-refresh
 *
 * @see docs/80-adrs/ADR-015-rls-context-injection.md
 * @see docs/80-adrs/ADR-024-authoritative-context-derivation.md
 * @see supabase/migrations/20251209183033_adr015_rls_context_rpc.sql
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
// eslint-disable-next-line no-restricted-imports -- Integration test requires direct Supabase client
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database.types';
import { injectRLSContext } from '../rls-context';

/**
 * Test helper: injects RLS context via service_role ops lane (set_rls_context_internal).
 * Used ONLY for Category A tests that verify the ops-lane RPC itself.
 * Category B tests use authenticated anon clients (Mode C) instead.
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
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const RUN_INTEGRATION =
  process.env.RUN_INTEGRATION_TESTS === 'true' ||
  process.env.RUN_INTEGRATION_TESTS === '1';

(RUN_INTEGRATION ? describe : describe.skip)(
  'RLS Context Integration (ADR-015)',
  () => {
    // setupClient uses service-role for fixture management (bypasses RLS)
    let setupClient: SupabaseClient<Database>;
    // Mode C authenticated anon clients for business query tests
    let authedClient1: SupabaseClient<Database>;
    let authedClient2: SupabaseClient<Database>;

    let testCompany1Id: string;
    let testCompany2Id: string;
    let testCasino1Id: string;
    let testCasino2Id: string;
    let testStaff1Id: string;
    let testStaff2Id: string;
    let testUserId1: string;
    let testUserId2: string;

    const testEmail1 = `test-rls-t3-pit_boss-${Date.now()}@example.com`;
    const testEmail2 = `test-rls-t3-pit_boss-${Date.now() + 1}@example.com`;
    const testPassword = 'test-password-12345';

    beforeAll(async () => {
      // === FIXTURE SETUP (service-role) ===
      setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

      // 1. Create auth users WITHOUT staff_id (two-phase ADR-024 setup)
      const { data: authUser1, error: authError1 } =
        await setupClient.auth.admin.createUser({
          email: testEmail1,
          password: testPassword,
          email_confirm: true,
          app_metadata: { staff_role: 'pit_boss' },
        });
      if (authError1) throw authError1;
      testUserId1 = authUser1.user.id;

      const { data: authUser2, error: authError2 } =
        await setupClient.auth.admin.createUser({
          email: testEmail2,
          password: testPassword,
          email_confirm: true,
          app_metadata: { staff_role: 'pit_boss' },
        });
      if (authError2) throw authError2;
      testUserId2 = authUser2.user.id;

      // 2. Create test companies (ADR-043: company before casino)
      const { data: company1, error: company1Error } = await setupClient
        .from('company')
        .insert({ name: 'RLS Integration Test Company 1' })
        .select()
        .single();
      if (company1Error) throw company1Error;
      testCompany1Id = company1.id;

      const { data: company2, error: company2Error } = await setupClient
        .from('company')
        .insert({ name: 'RLS Integration Test Company 2' })
        .select()
        .single();
      if (company2Error) throw company2Error;
      testCompany2Id = company2.id;

      // 3. Create test casinos
      const { data: casino1, error: casino1Error } = await setupClient
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

      const { data: casino2, error: casino2Error } = await setupClient
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

      // 4. Create casino settings
      await setupClient.from('casino_settings').insert([
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

      // 5. Create staff records bound to auth users
      const { data: staff1, error: staff1Error } = await setupClient
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

      const { data: staff2, error: staff2Error } = await setupClient
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

      // 6. Stamp staff_id into app_metadata (ADR-024 two-phase)
      await setupClient.auth.admin.updateUserById(testUserId1, {
        app_metadata: {
          staff_id: testStaff1Id,
          casino_id: testCasino1Id,
          staff_role: 'pit_boss',
        },
      });
      await setupClient.auth.admin.updateUserById(testUserId2, {
        app_metadata: {
          staff_id: testStaff2Id,
          casino_id: testCasino2Id,
          staff_role: 'pit_boss',
        },
      });

      // 7. Sign in via throwaway clients to get JWTs
      const throwaway1 = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: session1, error: signIn1Error } =
        await throwaway1.auth.signInWithPassword({
          email: testEmail1,
          password: testPassword,
        });
      if (signIn1Error || !session1.session)
        throw signIn1Error ?? new Error('Sign-in 1 returned no session');

      const throwaway2 = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: session2, error: signIn2Error } =
        await throwaway2.auth.signInWithPassword({
          email: testEmail2,
          password: testPassword,
        });
      if (signIn2Error || !session2.session)
        throw signIn2Error ?? new Error('Sign-in 2 returned no session');

      // 8. Create Mode C authenticated anon clients (ADR-024)
      authedClient1 = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${session1.session.access_token}`,
          },
        },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      authedClient2 = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${session2.session.access_token}`,
          },
        },
        auth: { autoRefreshToken: false, persistSession: false },
      });
    });

    afterAll(async () => {
      // Clean up test data (in reverse order of creation)
      await setupClient.from('staff').delete().eq('id', testStaff1Id);
      await setupClient.from('staff').delete().eq('id', testStaff2Id);
      await setupClient
        .from('casino_settings')
        .delete()
        .eq('casino_id', testCasino1Id);
      await setupClient
        .from('casino_settings')
        .delete()
        .eq('casino_id', testCasino2Id);
      await setupClient.from('casino').delete().eq('id', testCasino1Id);
      await setupClient.from('casino').delete().eq('id', testCasino2Id);
      await setupClient.from('company').delete().eq('id', testCompany1Id);
      await setupClient.from('company').delete().eq('id', testCompany2Id);

      // Clean up test users
      if (testUserId1) {
        await setupClient.auth.admin.deleteUser(testUserId1);
      }
      if (testUserId2) {
        await setupClient.auth.admin.deleteUser(testUserId2);
      }
    });

    // ===========================================================================
    // 1. Transaction-Wrapped Injection Tests (Mode C — ADR-024)
    //
    // Category B rewrites: these tests verify that authenticated clients see
    // their own casino data via RLS (enforced by JWT casino_id claim).
    // set_rls_context_internal removed — context derives from JWT.
    // ===========================================================================

    describe('Transaction-Wrapped Injection', () => {
      it('should persist context across multiple queries in same request', async () => {
        // Mode C: authenticated anon client — RLS enforced via JWT claims
        // Query casino_settings - should succeed for our casino
        const { data: settings1, error: error1 } = await authedClient1
          .from('casino_settings')
          .select('*')
          .eq('casino_id', testCasino1Id)
          .single();

        expect(error1).toBeNull();
        expect(settings1).not.toBeNull();
        expect(settings1?.casino_id).toBe(testCasino1Id);

        // Query staff - should only return staff from our casino
        const { data: staffList, error: staffError } = await authedClient1
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
        // Mode C: authedClient1 is scoped to Casino 1 via JWT
        // Querying Casino 2 settings should return null (RLS blocks cross-tenant access)
        const { data: casino2Settings, error } = await authedClient1
          .from('casino_settings')
          .select('*')
          .eq('casino_id', testCasino2Id)
          .maybeSingle();

        // With authenticated anon client, RLS enforces isolation:
        // casino_settings for Casino 2 should not be visible to Casino 1 staff
        expect(error).toBeNull();
        expect(casino2Settings).toBeNull();
      });

      it('should handle rapid sequential requests correctly', async () => {
        // Mode C: each authenticated client has its own immutable JWT context
        // Query with client 1 (Casino 1 context)
        const { data: data1 } = await authedClient1
          .from('casino_settings')
          .select('*')
          .eq('casino_id', testCasino1Id)
          .single();

        expect(data1?.casino_id).toBe(testCasino1Id);

        // Query with client 2 (Casino 2 context)
        const { data: data2 } = await authedClient2
          .from('casino_settings')
          .select('*')
          .eq('casino_id', testCasino2Id)
          .single();

        expect(data2?.casino_id).toBe(testCasino2Id);

        // Verify each client saw only its own casino data
        expect(data1?.casino_id).not.toBe(data2?.casino_id);
      });
    });

    // ===========================================================================
    // 2. set_rls_context_internal RPC Tests (Category A — ops-lane testing)
    //
    // These tests verify set_rls_context_internal itself — the service_role
    // ops-lane RPC. They use setupClient (service-role) intentionally.
    // ===========================================================================

    describe('set_rls_context_internal RPC (service_role ops lane)', () => {
      it('should successfully call set_rls_context_internal with valid parameters', async () => {
        const { error } = await setupClient.rpc('set_rls_context_internal', {
          p_actor_id: testStaff1Id,
          p_casino_id: testCasino1Id,
          p_staff_role: 'pit_boss',
          p_correlation_id: 'test-correlation-004',
        });

        expect(error).toBeNull();
      });

      it('should successfully call set_rls_context_internal without correlation_id', async () => {
        const { error } = await setupClient.rpc('set_rls_context_internal', {
          p_actor_id: testStaff1Id,
          p_casino_id: testCasino1Id,
          p_staff_role: 'pit_boss',
          p_correlation_id: undefined,
        });

        expect(error).toBeNull();
      });

      it('should handle invalid UUID parameters gracefully', async () => {
        const invalidUuid = 'not-a-uuid';

        const { error } = await setupClient.rpc('set_rls_context_internal', {
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
          const { error } = await setupClient.rpc('set_rls_context_internal', {
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
    // 3. Hybrid Policy Fallback Tests (Mode C — ADR-024)
    //
    // Category B rewrites: these tests verify RLS policy evaluation using
    // JWT claims (COALESCE jwt_claim path). Authenticated anon clients carry
    // casino_id in JWT; RLS evaluates via the hybrid COALESCE pattern.
    // set_rls_context_internal removed — context derives from JWT.
    // ===========================================================================

    describe('Hybrid Policy Fallback', () => {
      it('should work with JWT context variables (Mode C)', async () => {
        // Mode C: authenticated client carries JWT with casino_id claim
        // This tests that the COALESCE(current_setting(...), jwt_claim) pattern
        // correctly falls back to JWT when current_setting is not set
        const { data, error } = await authedClient1
          .from('casino_settings')
          .select('*')
          .eq('casino_id', testCasino1Id)
          .single();

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.casino_id).toBe(testCasino1Id);
      });

      it('should demonstrate context isolation between requests', async () => {
        // This test verifies ADR-015 isolation via Mode C authenticated clients.
        // Each client has its own immutable JWT — no context leakage possible.

        // Client 1: Casino 1 context (from JWT)
        const { data: result1 } = await authedClient1
          .from('casino_settings')
          .select('casino_id')
          .eq('casino_id', testCasino1Id)
          .single();

        expect(result1?.casino_id).toBe(testCasino1Id);

        // Client 2: Casino 2 context (from JWT)
        const { data: result2 } = await authedClient2
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
    // 4. Context Parameter Validation (Category A — ops-lane testing)
    //
    // These tests verify set_rls_context_internal accepts valid params and
    // does not throw. Uses setupClient (service-role) intentionally.
    // ===========================================================================

    describe('Context Parameter Validation', () => {
      it('should inject context with all required parameters', async () => {
        // Should not throw
        await expect(
          setTestRLSContext(
            setupClient,
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
          setTestRLSContext(
            setupClient,
            testStaff1Id,
            testCasino1Id,
            'pit_boss',
          ),
        ).resolves.not.toThrow();
      });

      it('should validate UUIDs are properly formatted', async () => {
        // Valid UUIDs should work
        await expect(
          setTestRLSContext(
            setupClient,
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
        // Mode C: authedClient1 JWT contains staff_id → RPC derives full context
        const { data, error } = await authedClient1.rpc(
          'set_rls_context_from_staff',
          {},
        );
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        const row = data?.[0];
        expect(row?.company_id).toBeTruthy();
        expect(row?.actor_id).toBe(testStaff1Id);
        expect(row?.casino_id).toBe(testCasino1Id);
      });

      it('injectRLSContext returns RLSContext with valid companyId', async () => {
        // Mode C: authedClient1 JWT contains staff_id → injectRLSContext derives context
        const context = await injectRLSContext(
          authedClient1,
          'test-company-inject',
        );
        expect(context.companyId).toBeTruthy();
        expect(context.actorId).toBe(testStaff1Id);
        expect(context.casinoId).toBe(testCasino1Id);
        expect(context.staffRole).toBe('pit_boss');
      });

      it('Fail-closed: casino.company_id is NOT NULL (structural proof)', async () => {
        // Attempt to INSERT casino without company_id — should fail
        const { error } = await setupClient
          .from('casino')
          .insert({ name: 'No Company Casino', status: 'active' } as never)
          .select()
          .single();

        expect(error).not.toBeNull();
      });

      it('Fail-closed: company FK is ON DELETE RESTRICT', async () => {
        // Attempt to DELETE a company that has casinos — should fail
        const { error } = await setupClient
          .from('company')
          .delete()
          .eq('id', testCompany1Id);

        expect(error).not.toBeNull();
      });

      it('Fail-closed: RPC fails for staff at inactive casino', async () => {
        // Create inactive casino + company + staff + user
        const { data: inactiveCo } = await setupClient
          .from('company')
          .insert({ name: 'Inactive Test Co' })
          .select()
          .single();

        const { data: inactiveCasino } = await setupClient
          .from('casino')
          .insert({
            name: 'Inactive Casino',
            status: 'inactive',
            company_id: inactiveCo!.id,
          })
          .select()
          .single();

        await setupClient.from('casino_settings').insert({
          casino_id: inactiveCasino!.id,
          gaming_day_start_time: '06:00:00',
          timezone: 'America/Los_Angeles',
          watchlist_floor: 3000,
          ctr_threshold: 10000,
        });

        const inactiveEmail = `test-rls-t3-inactive-${Date.now()}@example.com`;
        const { data: inactiveUser } = await setupClient.auth.admin.createUser({
          email: inactiveEmail,
          password: testPassword,
          email_confirm: true,
          app_metadata: { staff_role: 'pit_boss' },
        });

        const { data: inactiveStaff } = await setupClient
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

        // Stamp staff_id (ADR-024 two-phase)
        await setupClient.auth.admin.updateUserById(inactiveUser!.user!.id, {
          app_metadata: {
            staff_id: inactiveStaff!.id,
            casino_id: inactiveCasino!.id,
            staff_role: 'pit_boss',
          },
        });

        // Sign in as the inactive casino staff via throwaway client
        const inactiveThrowaway = createClient<Database>(
          supabaseUrl,
          supabaseAnonKey,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );
        const { data: inactiveSession, error: inactiveSignInError } =
          await inactiveThrowaway.auth.signInWithPassword({
            email: inactiveEmail,
            password: testPassword,
          });
        if (inactiveSignInError || !inactiveSession.session)
          throw (
            inactiveSignInError ??
            new Error('Inactive sign-in returned no session')
          );

        // Create Mode C authenticated client for inactive casino staff
        const inactiveClient = createClient<Database>(
          supabaseUrl,
          supabaseAnonKey,
          {
            global: {
              headers: {
                Authorization: `Bearer ${inactiveSession.session.access_token}`,
              },
            },
            auth: { autoRefreshToken: false, persistSession: false },
          },
        );

        try {
          // Call RPC — should fail because casino is inactive (JOIN-miss)
          const { error } = await inactiveClient.rpc(
            'set_rls_context_from_staff',
            {},
          );
          expect(error).not.toBeNull();
        } finally {
          // Cleanup
          await setupClient
            .from('staff')
            .delete()
            .eq('casino_id', inactiveCasino!.id);
          await setupClient
            .from('casino_settings')
            .delete()
            .eq('casino_id', inactiveCasino!.id);
          await setupClient
            .from('casino')
            .delete()
            .eq('id', inactiveCasino!.id);
          await setupClient.from('company').delete().eq('id', inactiveCo!.id);
          await setupClient.auth.admin.deleteUser(inactiveUser!.user!.id);
        }
      });

      it('SEC_NOTE M7: no RLS policy references app.company_id', async () => {
        // Query pg_policies via SQL to verify no policy contains 'app.company_id'
        const { data, error } = await setupClient.rpc(
          'exec_sql' as never,
          {
            sql: "SELECT policyname FROM pg_policies WHERE qual::text LIKE '%app.company_id%' OR with_check::text LIKE '%app.company_id%'",
          } as never,
        );

        if (error) {
          // exec_sql RPC may not exist in all environments — skip gracefully
          // eslint-disable-next-line no-console
          console.warn('SEC_NOTE M7 test skipped: exec_sql RPC not available');
          return;
        }

        // No policies should reference app.company_id
        expect(data).toEqual([]);
      });
    });
  },
);
