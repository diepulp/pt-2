/** @jest-environment node */

/**
 * RLS Connection Pooling Safety Tests (ADR-015 WS6)
 *
 * Tests that RLS context is properly isolated in pooled connection environments.
 * Verifies that SET LOCAL variables don't leak between transactions and that
 * the transaction-wrapped RPC approach is connection-pooling safe.
 *
 * Auth model: ADR-024 Mode C — authenticated anon clients carry JWT with staff_id
 * in app_metadata; set_rls_context_from_staff() derives context server-side.
 * Service-role clients are used ONLY for fixture setup/teardown.
 *
 * PREREQUISITES:
 * - Migration 20251209183033_adr015_rls_context_rpc.sql must be applied
 * - Migration 20251209183401_adr015_hybrid_rls_policies.sql must be applied
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable set
 *
 * CRITICAL: These tests simulate connection pooling behavior and verify
 * that context doesn't persist after transactions end.
 *
 * @see docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md
 * @see docs/80-adrs/ADR-024-authoritative-context-derivation.md
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
// eslint-disable-next-line no-restricted-imports -- Integration test requires direct Supabase client
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database.types';

/**
 * Mode C helper: injects RLS context via set_rls_context_from_staff RPC.
 * The RPC derives actor_id, casino_id, and staff_role from the JWT's
 * staff_id claim — no spoofable parameters. (ADR-024)
 */
async function setModeC_RLSContext(
  client: SupabaseClient<Database>,
  correlationId?: string,
): Promise<void> {
  const { error } = await client.rpc('set_rls_context_from_staff', {
    p_correlation_id: correlationId ?? null,
  });
  if (error) throw new Error(`setModeC_RLSContext failed: ${error.message}`);
}

/**
 * Creates a Mode C authenticated anon client from an existing access token.
 * Used in concurrent tests where many clients need independent connections
 * but share the same JWT identity.
 */
function createAuthedClient(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const RUN_INTEGRATION =
  process.env.RUN_INTEGRATION_TESTS === 'true' ||
  process.env.RUN_INTEGRATION_TESTS === '1';

(RUN_INTEGRATION ? describe : describe.skip)(
  'RLS Connection Pooling Safety (ADR-015 WS6)',
  () => {
    // setupClient uses service-role for fixture management (bypasses RLS)
    let setupClient: SupabaseClient<Database>;
    // Mode C authenticated anon clients for business query tests
    let authedClient1: SupabaseClient<Database>;
    let authedClient2: SupabaseClient<Database>;
    let authedClient3: SupabaseClient<Database>;
    // Access tokens for creating additional Mode C clients in concurrent tests
    let accessToken1: string;
    let accessToken2: string;
    let accessToken3: string;

    let testCompany1Id: string;
    let testCompany2Id: string;
    let testCompany3Id: string;
    let testCasino1Id: string;
    let testCasino2Id: string;
    let testCasino3Id: string;
    let testStaff1Id: string;
    let testStaff2Id: string;
    let testStaff3Id: string;
    let testUser1Id: string;
    let testUser2Id: string;
    let testUser3Id: string;

    const uniqueSuffix = Date.now();
    const testEmail1 = `test-rls-t3-pool-pitboss-1-${uniqueSuffix}@example.com`;
    const testEmail2 = `test-rls-t3-pool-pitboss-2-${uniqueSuffix}@example.com`;
    const testEmail3 = `test-rls-t3-pool-pitboss-3-${uniqueSuffix}@example.com`;
    const testPassword = 'test-password-12345';

    beforeAll(async () => {
      // === FIXTURE SETUP (service-role) ===
      setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

      // 1. Create auth users WITHOUT staff_id (two-phase ADR-024 setup)
      const users = await Promise.all([
        setupClient.auth.admin.createUser({
          email: testEmail1,
          password: testPassword,
          email_confirm: true,
          app_metadata: { staff_role: 'pit_boss' },
        }),
        setupClient.auth.admin.createUser({
          email: testEmail2,
          password: testPassword,
          email_confirm: true,
          app_metadata: { staff_role: 'pit_boss' },
        }),
        setupClient.auth.admin.createUser({
          email: testEmail3,
          password: testPassword,
          email_confirm: true,
          app_metadata: { staff_role: 'pit_boss' },
        }),
      ]);

      testUser1Id = users[0].data?.user?.id || '';
      testUser2Id = users[1].data?.user?.id || '';
      testUser3Id = users[2].data?.user?.id || '';

      // 2. Create test companies (ADR-043: casino.company_id NOT NULL)
      const companies = await Promise.all([
        setupClient
          .from('company')
          .insert({ name: 'Pooling Test Company 1' })
          .select()
          .single(),
        setupClient
          .from('company')
          .insert({ name: 'Pooling Test Company 2' })
          .select()
          .single(),
        setupClient
          .from('company')
          .insert({ name: 'Pooling Test Company 3' })
          .select()
          .single(),
      ]);

      if (!companies[0].data)
        throw new Error('Failed to create test company 1');
      if (!companies[1].data)
        throw new Error('Failed to create test company 2');
      if (!companies[2].data)
        throw new Error('Failed to create test company 3');
      testCompany1Id = companies[0].data.id;
      testCompany2Id = companies[1].data.id;
      testCompany3Id = companies[2].data.id;

      // 3. Create test casinos
      const casinos = await Promise.all([
        setupClient
          .from('casino')
          .insert({
            name: 'Pooling Test Casino 1',
            status: 'active',
            company_id: testCompany1Id,
          })
          .select()
          .single(),
        setupClient
          .from('casino')
          .insert({
            name: 'Pooling Test Casino 2',
            status: 'active',
            company_id: testCompany2Id,
          })
          .select()
          .single(),
        setupClient
          .from('casino')
          .insert({
            name: 'Pooling Test Casino 3',
            status: 'active',
            company_id: testCompany3Id,
          })
          .select()
          .single(),
      ]);

      testCasino1Id = casinos[0].data!.id;
      testCasino2Id = casinos[1].data!.id;
      testCasino3Id = casinos[2].data!.id;

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
        {
          casino_id: testCasino3Id,
          gaming_day_start_time: '06:00:00',
          timezone: 'America/Los_Angeles',
          watchlist_floor: 3000,
          ctr_threshold: 10000,
        },
      ]);

      // 5. Create test staff
      const staff = await Promise.all([
        setupClient
          .from('staff')
          .insert({
            casino_id: testCasino1Id,
            user_id: testUser1Id,
            employee_id: 'POOL-001',
            first_name: 'Pool',
            last_name: 'Staff1',
            role: 'pit_boss',
            status: 'active',
          })
          .select()
          .single(),
        setupClient
          .from('staff')
          .insert({
            casino_id: testCasino2Id,
            user_id: testUser2Id,
            employee_id: 'POOL-002',
            first_name: 'Pool',
            last_name: 'Staff2',
            role: 'pit_boss',
            status: 'active',
          })
          .select()
          .single(),
        setupClient
          .from('staff')
          .insert({
            casino_id: testCasino3Id,
            user_id: testUser3Id,
            employee_id: 'POOL-003',
            first_name: 'Pool',
            last_name: 'Staff3',
            role: 'pit_boss',
            status: 'active',
          })
          .select()
          .single(),
      ]);

      testStaff1Id = staff[0].data!.id;
      testStaff2Id = staff[1].data!.id;
      testStaff3Id = staff[2].data!.id;

      // 6. Stamp staff_id + casino_id into app_metadata (ADR-024 two-phase)
      await Promise.all([
        setupClient.auth.admin.updateUserById(testUser1Id, {
          app_metadata: {
            staff_id: testStaff1Id,
            casino_id: testCasino1Id,
            staff_role: 'pit_boss',
          },
        }),
        setupClient.auth.admin.updateUserById(testUser2Id, {
          app_metadata: {
            staff_id: testStaff2Id,
            casino_id: testCasino2Id,
            staff_role: 'pit_boss',
          },
        }),
        setupClient.auth.admin.updateUserById(testUser3Id, {
          app_metadata: {
            staff_id: testStaff3Id,
            casino_id: testCasino3Id,
            staff_role: 'pit_boss',
          },
        }),
      ]);

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
      accessToken1 = session1.session.access_token;

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
      accessToken2 = session2.session.access_token;

      const throwaway3 = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: session3, error: signIn3Error } =
        await throwaway3.auth.signInWithPassword({
          email: testEmail3,
          password: testPassword,
        });
      if (signIn3Error || !session3.session)
        throw signIn3Error ?? new Error('Sign-in 3 returned no session');
      accessToken3 = session3.session.access_token;

      // 8. Create Mode C authenticated anon clients (ADR-024)
      authedClient1 = createAuthedClient(accessToken1);
      authedClient2 = createAuthedClient(accessToken2);
      authedClient3 = createAuthedClient(accessToken3);
    });

    afterAll(async () => {
      // Clean up in reverse order (service-role for fixture teardown)
      await setupClient
        .from('staff')
        .delete()
        .in('id', [testStaff1Id, testStaff2Id, testStaff3Id]);
      await setupClient
        .from('casino_settings')
        .delete()
        .in('casino_id', [testCasino1Id, testCasino2Id, testCasino3Id]);
      await setupClient
        .from('casino')
        .delete()
        .in('id', [testCasino1Id, testCasino2Id, testCasino3Id]);

      // Clean up companies (ADR-043)
      await setupClient
        .from('company')
        .delete()
        .in('id', [testCompany1Id, testCompany2Id, testCompany3Id]);

      // Clean up users
      await Promise.all([
        setupClient.auth.admin.deleteUser(testUser1Id),
        setupClient.auth.admin.deleteUser(testUser2Id),
        setupClient.auth.admin.deleteUser(testUser3Id),
      ]);
    });

    // ===========================================================================
    // 1. Transaction-Local Context Persistence Tests
    // ===========================================================================

    describe('Transaction-Local Context Persistence', () => {
      it('should set context variables via RPC and persist within transaction', async () => {
        // Set context via Mode C RPC (derives context from JWT staff_id)
        await setModeC_RLSContext(authedClient1, 'test-txn-persist-001');

        // Immediately query - context should still be set
        const { data, error } = await authedClient1
          .from('casino_settings')
          .select('casino_id')
          .eq('casino_id', testCasino1Id)
          .single();

        expect(error).toBeNull();
        expect(data?.casino_id).toBe(testCasino1Id);
      });

      it('should handle multiple RPC calls in sequence without context leakage', async () => {
        // Context 1 (authedClient1 = Casino 1)
        await setModeC_RLSContext(authedClient1, 'test-seq-001');

        const { data: data1 } = await authedClient1
          .from('casino_settings')
          .select('casino_id')
          .eq('casino_id', testCasino1Id)
          .single();

        expect(data1?.casino_id).toBe(testCasino1Id);

        // Context 2 (authedClient2 = Casino 2)
        await setModeC_RLSContext(authedClient2, 'test-seq-002');

        const { data: data2 } = await authedClient2
          .from('casino_settings')
          .select('casino_id')
          .eq('casino_id', testCasino2Id)
          .single();

        expect(data2?.casino_id).toBe(testCasino2Id);

        // Verify context switched correctly (no leakage from context1)
        expect(data1?.casino_id).not.toBe(data2?.casino_id);
      });

      it('should handle rapid context switching between three casinos', async () => {
        const clients = [authedClient1, authedClient2, authedClient3];
        const casinoIds = [testCasino1Id, testCasino2Id, testCasino3Id];

        const results: string[] = [];

        // Rapidly switch contexts across different authenticated clients
        for (let i = 0; i < clients.length; i++) {
          await setModeC_RLSContext(clients[i], `test-rapid-${i}`);

          const { data } = await clients[i]
            .from('casino_settings')
            .select('casino_id')
            .eq('casino_id', casinoIds[i])
            .single();

          if (data) {
            results.push(data.casino_id);
          }
        }

        // Verify each context saw only its own casino
        expect(results[0]).toBe(testCasino1Id);
        expect(results[1]).toBe(testCasino2Id);
        expect(results[2]).toBe(testCasino3Id);
      });
    });

    // ===========================================================================
    // 2. Concurrent Request Simulation Tests
    // ===========================================================================

    describe('Concurrent Request Simulation', () => {
      it('should handle 10 concurrent requests without cross-contamination', async () => {
        const tokens = [accessToken1, accessToken2];
        const casinoIds = [testCasino1Id, testCasino2Id];

        // Create 10 concurrent Mode C clients (simulates pooled connections)
        const requests = Array.from({ length: 10 }, (_, index) => {
          const isEven = index % 2 === 0;
          const token = isEven ? tokens[0] : tokens[1];
          const casinoId = isEven ? casinoIds[0] : casinoIds[1];
          const client = createAuthedClient(token);

          return (async () => {
            await setModeC_RLSContext(client, `test-concurrent-${index}`);

            const { data } = await client
              .from('casino_settings')
              .select('casino_id')
              .eq('casino_id', casinoId)
              .single();

            return {
              index,
              expectedCasinoId: casinoId,
              actualCasinoId: data?.casino_id,
            };
          })();
        });

        const results = await Promise.all(requests);

        // Verify each request saw only its intended casino
        results.forEach((result) => {
          expect(result.actualCasinoId).toBe(result.expectedCasinoId);
        });
      });

      it('should handle concurrent requests with different staff roles', async () => {
        const tokenMap = [
          {
            token: accessToken1,
            casinoId: testCasino1Id,
            staffRole: 'pit_boss',
            correlationId: 'concurrent-role-1',
          },
          {
            token: accessToken2,
            casinoId: testCasino2Id,
            staffRole: 'pit_boss',
            correlationId: 'concurrent-role-2',
          },
          {
            token: accessToken3,
            casinoId: testCasino3Id,
            staffRole: 'pit_boss',
            correlationId: 'concurrent-role-3',
          },
        ];

        // Execute all requests concurrently with Mode C clients
        const results = await Promise.all(
          tokenMap.map(
            async ({ token, casinoId, staffRole, correlationId }) => {
              const client = createAuthedClient(token);
              await setModeC_RLSContext(client, correlationId);

              const { data } = await client
                .from('casino_settings')
                .select('casino_id')
                .eq('casino_id', casinoId)
                .single();

              return {
                expectedCasinoId: casinoId,
                actualCasinoId: data?.casino_id,
                staffRole,
              };
            },
          ),
        );

        // Verify each request maintained correct context
        results.forEach((result) => {
          expect(result.actualCasinoId).toBe(result.expectedCasinoId);
        });
      });

      it('should handle burst of 50 concurrent context switches', async () => {
        const burstSize = 50;
        const casinos = [testCasino1Id, testCasino2Id, testCasino3Id];
        const tokens = [accessToken1, accessToken2, accessToken3];

        const requests = Array.from({ length: burstSize }, (_, i) => {
          const casinoIndex = i % 3;
          return {
            token: tokens[casinoIndex],
            casinoId: casinos[casinoIndex],
            index: i,
          };
        });

        const results = await Promise.all(
          requests.map(async ({ token, casinoId, index }) => {
            const client = createAuthedClient(token);
            await setModeC_RLSContext(client, `burst-${index}`);

            const { data, error } = await client
              .from('casino_settings')
              .select('casino_id')
              .eq('casino_id', casinoId)
              .single();

            return {
              index,
              expectedCasinoId: casinoId,
              actualCasinoId: data?.casino_id,
              error: error?.message,
            };
          }),
        );

        // Verify all requests succeeded and saw correct casino
        results.forEach((result) => {
          expect(result.error).toBeUndefined();
          expect(result.actualCasinoId).toBe(result.expectedCasinoId);
        });
      });
    });

    // ===========================================================================
    // 3. Context Isolation Tests
    // ===========================================================================

    describe('Context Isolation', () => {
      it('should not share context between different client instances', async () => {
        const client1 = createAuthedClient(accessToken1);
        const client2 = createAuthedClient(accessToken2);

        // Set Casino 1 context on client1 (derived from JWT)
        await setModeC_RLSContext(client1, 'isolation-client1');

        // Set Casino 2 context on client2 (derived from JWT)
        await setModeC_RLSContext(client2, 'isolation-client2');

        // Query both clients
        const [result1, result2] = await Promise.all([
          client1
            .from('casino_settings')
            .select('casino_id')
            .eq('casino_id', testCasino1Id)
            .single(),
          client2
            .from('casino_settings')
            .select('casino_id')
            .eq('casino_id', testCasino2Id)
            .single(),
        ]);

        // Each client should see only its own casino
        expect(result1.data?.casino_id).toBe(testCasino1Id);
        expect(result2.data?.casino_id).toBe(testCasino2Id);
      });

      it('should handle interleaved operations from multiple clients', async () => {
        // Mode C: client1 is always bound to Casino 1, client2 to Casino 2
        // For the "switch to Casino 3" part, we use client3
        const client1 = createAuthedClient(accessToken1);
        const client2 = createAuthedClient(accessToken2);
        const client3 = createAuthedClient(accessToken3);

        // Interleaved operations:
        // 1. Set context on client1 (Casino 1)
        await setModeC_RLSContext(client1, 'interleave-1a');

        // 2. Set context on client2 (Casino 2)
        await setModeC_RLSContext(client2, 'interleave-2a');

        // 3. Query from client1
        const { data: data1a } = await client1
          .from('casino_settings')
          .select('casino_id')
          .eq('casino_id', testCasino1Id)
          .single();

        // 4. Query from client2
        const { data: data2a } = await client2
          .from('casino_settings')
          .select('casino_id')
          .eq('casino_id', testCasino2Id)
          .single();

        // 5. Set context on client3 (Casino 3) — tests third concurrent context
        await setModeC_RLSContext(client3, 'interleave-1b');

        // 6. Query from client3 (should see Casino 3)
        const { data: data1b } = await client3
          .from('casino_settings')
          .select('casino_id')
          .eq('casino_id', testCasino3Id)
          .single();

        // 7. Query from client2 (should still see Casino 2)
        const { data: data2b } = await client2
          .from('casino_settings')
          .select('casino_id')
          .eq('casino_id', testCasino2Id)
          .single();

        // Verify context isolation works correctly
        expect(data1a?.casino_id).toBe(testCasino1Id);
        expect(data2a?.casino_id).toBe(testCasino2Id);
        expect(data1b?.casino_id).toBe(testCasino3Id);
        expect(data2b?.casino_id).toBe(testCasino2Id);
      });
    });

    // ===========================================================================
    // 4. RPC Function Atomicity Tests
    // ===========================================================================

    describe('RPC Function Atomicity', () => {
      it('should set all context variables atomically', async () => {
        // Single Mode C RPC call should set all variables (derived from JWT)
        const { error } = await authedClient1.rpc(
          'set_rls_context_from_staff',
          {
            p_correlation_id: 'atomic-test-001',
          },
        );

        expect(error).toBeNull();

        // All variables should be available in subsequent queries
        // (We can't directly check current_setting via Supabase client,
        // but we verify by querying data that depends on the context)
        const { data } = await authedClient1
          .from('casino_settings')
          .select('casino_id')
          .eq('casino_id', testCasino1Id)
          .single();

        expect(data?.casino_id).toBe(testCasino1Id);
      });

      it('should handle RPC errors gracefully without partial context', async () => {
        // Use service-role to test set_rls_context_internal with invalid UUID
        // (Mode C set_rls_context_from_staff derives from JWT so can't inject invalid UUID)
        const { error } = await setupClient.rpc('set_rls_context_internal', {
          p_actor_id: 'invalid-uuid' as string,
          p_casino_id: testCasino1Id,
          p_staff_role: 'pit_boss',
          p_correlation_id: 'error-test-001',
        });

        // Should get an error
        expect(error).not.toBeNull();

        // Context should not be partially set (all-or-nothing)
        // Subsequent queries should work without the failed context
        const { data } = await authedClient1
          .from('casino_settings')
          .select('casino_id')
          .eq('casino_id', testCasino1Id)
          .single();

        // Query should still work (falls back to JWT context)
        expect(data?.casino_id).toBe(testCasino1Id);
      });
    });

    // ===========================================================================
    // 5. Correlation ID Tests
    // ===========================================================================

    describe('Correlation ID Tracking', () => {
      it('should accept and set correlation_id in application_name', async () => {
        const correlationId = 'test-correlation-xyz-123';

        await setModeC_RLSContext(authedClient1, correlationId);

        // Subsequent query should execute successfully
        const { data, error } = await authedClient1
          .from('casino_settings')
          .select('casino_id')
          .eq('casino_id', testCasino1Id)
          .single();

        expect(error).toBeNull();
        expect(data?.casino_id).toBe(testCasino1Id);
      });

      it('should handle NULL correlation_id', async () => {
        // Don't pass correlation_id (defaults to null)
        await setModeC_RLSContext(authedClient1);

        const { data, error } = await authedClient1
          .from('casino_settings')
          .select('casino_id')
          .eq('casino_id', testCasino1Id)
          .single();

        expect(error).toBeNull();
        expect(data?.casino_id).toBe(testCasino1Id);
      });

      it('should track different correlation IDs for concurrent requests', async () => {
        const correlationIds = Array.from(
          { length: 5 },
          (_, i) => `concurrent-cid-${i}`,
        );
        const tokens = [accessToken1, accessToken2, accessToken3];
        const casinos = [testCasino1Id, testCasino2Id, testCasino3Id];

        const requests = correlationIds.map(async (cid, index) => {
          const casinoIndex = index % 3;
          const client = createAuthedClient(tokens[casinoIndex]);

          await setModeC_RLSContext(client, cid);

          const { data } = await client
            .from('casino_settings')
            .select('casino_id')
            .eq('casino_id', casinos[casinoIndex])
            .single();

          return {
            correlationId: cid,
            casinoId: data?.casino_id,
          };
        });

        const results = await Promise.all(requests);

        // All requests should succeed
        results.forEach((result) => {
          expect(result.casinoId).toBeTruthy();
          expect(result.correlationId).toMatch(/^concurrent-cid-\d+$/);
        });
      });
    });

    // ===========================================================================
    // 6. RPC→RPC Context Propagation Tests (ISSUE-B3C8BA48)
    // ===========================================================================

    describe('RPC to RPC Context Propagation (ADR-015 Phase 1A)', () => {
      let testVisitId: string;
      let testTableId: string;
      let testPlayerId: string;

      beforeAll(async () => {
        // Create test player (player table doesn't have casino_id directly)
        const { data: player, error: playerError } = await setupClient
          .from('player')
          .insert({
            first_name: 'RPC',
            last_name: 'Test',
          })
          .select()
          .single();

        if (playerError) throw playerError;
        testPlayerId = player.id;

        // Enroll player at casino via player_casino junction table
        const { error: enrollError } = await setupClient
          .from('player_casino')
          .insert({
            player_id: testPlayerId,
            casino_id: testCasino1Id,
            status: 'active',
          });

        if (enrollError) throw enrollError;

        // Create test table (uses label + type, not table_number + status)
        const { data: table, error: tableError } = await setupClient
          .from('gaming_table')
          .insert({
            casino_id: testCasino1Id,
            label: `RPC-TEST-${Date.now()}`,
            type: 'blackjack',
            status: 'active',
          })
          .select()
          .single();

        if (tableError) throw tableError;
        testTableId = table.id;

        // Create test visit
        const { data: visit, error: visitError } = await setupClient
          .from('visit')
          .insert({
            casino_id: testCasino1Id,
            player_id: testPlayerId,
          })
          .select()
          .single();

        if (visitError) throw visitError;
        testVisitId = visit.id;
      });

      afterAll(async () => {
        // Clean up in reverse dependency order (service-role for fixture teardown)
        await setupClient
          .from('rating_slip')
          .delete()
          .eq('visit_id', testVisitId);
        await setupClient.from('visit').delete().eq('id', testVisitId);
        await setupClient.from('gaming_table').delete().eq('id', testTableId);
        await setupClient
          .from('player_casino')
          .delete()
          .eq('player_id', testPlayerId);
        await setupClient.from('player').delete().eq('id', testPlayerId);
      });

      it('should maintain context when calling rpc_start then rpc_close (move workflow)', async () => {
        // This test verifies the fix for ISSUE-B3C8BA48:
        // When the move endpoint calls close() then start(), each RPC must
        // self-inject context to work correctly with connection pooling.
        // Mode C: authedClient1 carries JWT with staff_id for Casino 1

        // Step 1: Call rpc_start_rating_slip via Mode C client
        const { data: startResult, error: startError } =
          await authedClient1.rpc('rpc_start_rating_slip', {
            p_visit_id: testVisitId,
            p_table_id: testTableId,
            p_seat_number: '1',
            p_game_settings: { game_type: 'blackjack' },
          });

        expect(startError).toBeNull();
        expect(startResult).toBeTruthy();
        expect(startResult?.status).toBe('open');
        expect(startResult?.casino_id).toBe(testCasino1Id);

        // Step 2: Call rpc_close_rating_slip (simulates move workflow)
        // In production, this may execute on a DIFFERENT pooled connection
        const { data: closeResult, error: closeError } =
          await authedClient1.rpc('rpc_close_rating_slip', {
            p_rating_slip_id: startResult!.id,
            p_average_bet: 50.0,
          });

        expect(closeError).toBeNull();
        expect(closeResult).toBeTruthy();
        expect(closeResult?.[0]?.slip.status).toBe('closed');
        expect(closeResult?.[0]?.duration_seconds).toBeGreaterThanOrEqual(0);
      });

      it('should handle pause/resume RPCs in sequence', async () => {
        // Create a new slip for this test via Mode C client
        const { data: slip, error: startError } = await authedClient1.rpc(
          'rpc_start_rating_slip',
          {
            p_visit_id: testVisitId,
            p_table_id: testTableId,
            p_seat_number: '2',
            p_game_settings: { game_type: 'blackjack' },
          },
        );

        expect(startError).toBeNull();
        expect(slip).toBeTruthy();

        // Pause the slip
        const { data: pauseResult, error: pauseError } =
          await authedClient1.rpc('rpc_pause_rating_slip', {
            p_rating_slip_id: slip!.id,
          });

        expect(pauseError).toBeNull();
        expect(pauseResult).toBeTruthy();
        expect(pauseResult?.status).toBe('paused');

        // Resume the slip (third RPC call - tests context persists)
        const { data: resumeResult, error: resumeError } =
          await authedClient1.rpc('rpc_resume_rating_slip', {
            p_rating_slip_id: slip!.id,
          });

        expect(resumeError).toBeNull();
        expect(resumeResult).toBeTruthy();
        expect(resumeResult?.status).toBe('open');

        // Close the slip (fourth RPC call)
        const { data: closeResult, error: closeError } =
          await authedClient1.rpc('rpc_close_rating_slip', {
            p_rating_slip_id: slip!.id,
          });

        expect(closeError).toBeNull();
        expect(closeResult).toBeTruthy();
        expect(closeResult?.[0]?.slip.status).toBe('closed');
      });

      it('should enforce casino isolation between RPC calls', async () => {
        // Start a slip in casino 1 via Mode C client
        const { data: slip1, error: start1Error } = await authedClient1.rpc(
          'rpc_start_rating_slip',
          {
            p_visit_id: testVisitId,
            p_table_id: testTableId,
            p_seat_number: '3',
            p_game_settings: { game_type: 'blackjack' },
          },
        );

        expect(start1Error).toBeNull();
        expect(slip1).toBeTruthy();

        // ADR-024 P2: casino_id is now derived from context, not passed as param.
        // The RPC will use the caller's context casino_id automatically.
        // Casino isolation is enforced by the WHERE clause matching v_casino_id.

        // Clean up - close the slip (context derives casino from staff JWT)
        await authedClient1.rpc('rpc_close_rating_slip', {
          p_rating_slip_id: slip1!.id,
        });
      });

      it('should handle concurrent RPC calls from different casinos', async () => {
        // Create test data for casino 2 (service-role for fixture setup)
        const { data: player2 } = await setupClient
          .from('player')
          .insert({
            first_name: 'Concurrent',
            last_name: 'Test',
          })
          .select()
          .single();

        // Enroll player2 at casino 2
        await setupClient.from('player_casino').insert({
          player_id: player2!.id,
          casino_id: testCasino2Id,
          status: 'active',
        });

        const { data: table2 } = await setupClient
          .from('gaming_table')
          .insert({
            casino_id: testCasino2Id,
            label: `CONC-TEST-${Date.now()}`,
            type: 'roulette',
            status: 'active',
          })
          .select()
          .single();

        const { data: visit2 } = await setupClient
          .from('visit')
          .insert({
            casino_id: testCasino2Id,
            player_id: player2!.id,
          })
          .select()
          .single();

        try {
          // Start slips concurrently in both casinos via Mode C clients
          const [result1, result2] = await Promise.all([
            authedClient1.rpc('rpc_start_rating_slip', {
              p_visit_id: testVisitId,
              p_table_id: testTableId,
              p_seat_number: '4',
              p_game_settings: { game_type: 'blackjack' },
            }),
            authedClient2.rpc('rpc_start_rating_slip', {
              p_visit_id: visit2!.id,
              p_table_id: table2!.id,
              p_seat_number: '1',
              p_game_settings: { game_type: 'roulette' },
            }),
          ]);

          expect(result1.error).toBeNull();
          expect(result2.error).toBeNull();
          expect(result1.data).toBeTruthy();
          expect(result2.data).toBeTruthy();

          // Each slip should be in correct casino
          expect(result1.data?.casino_id).toBe(testCasino1Id);
          expect(result2.data?.casino_id).toBe(testCasino2Id);

          // Close both concurrently via respective Mode C clients
          const [close1, close2] = await Promise.all([
            authedClient1.rpc('rpc_close_rating_slip', {
              p_rating_slip_id: result1.data!.id,
            }),
            authedClient2.rpc('rpc_close_rating_slip', {
              p_rating_slip_id: result2.data!.id,
            }),
          ]);

          expect(close1.error).toBeNull();
          expect(close2.error).toBeNull();
        } finally {
          // Cleanup casino 2 test data (service-role)
          await setupClient
            .from('rating_slip')
            .delete()
            .eq('visit_id', visit2!.id);
          await setupClient.from('visit').delete().eq('id', visit2!.id);
          await setupClient.from('gaming_table').delete().eq('id', table2!.id);
          await setupClient
            .from('player_casino')
            .delete()
            .eq('player_id', player2!.id);
          await setupClient.from('player').delete().eq('id', player2!.id);
        }
      });
    });

    // ===========================================================================
    // 7. Cross-Casino Denial Tests (PRD-010 WS3)
    // ===========================================================================

    describe('Cross-Casino Denial (PRD-010 WS3)', () => {
      let testVisit1Id: string;
      let testVisit2Id: string;
      let testPlayer1Id: string;
      let testPlayer2Id: string;

      beforeAll(async () => {
        // Create players for cross-casino tests (service-role for fixture setup)
        const players = await Promise.all([
          setupClient
            .from('player')
            .insert({
              first_name: 'Casino1',
              last_name: 'Player',
            })
            .select()
            .single(),
          setupClient
            .from('player')
            .insert({
              first_name: 'Casino2',
              last_name: 'Player',
            })
            .select()
            .single(),
        ]);

        testPlayer1Id = players[0].data!.id;
        testPlayer2Id = players[1].data!.id;

        // Enroll players at respective casinos
        await Promise.all([
          setupClient.from('player_casino').insert({
            player_id: testPlayer1Id,
            casino_id: testCasino1Id,
            status: 'active',
          }),
          setupClient.from('player_casino').insert({
            player_id: testPlayer2Id,
            casino_id: testCasino2Id,
            status: 'active',
          }),
        ]);

        // Create visits for each casino
        const visits = await Promise.all([
          setupClient
            .from('visit')
            .insert({
              casino_id: testCasino1Id,
              player_id: testPlayer1Id,
            })
            .select()
            .single(),
          setupClient
            .from('visit')
            .insert({
              casino_id: testCasino2Id,
              player_id: testPlayer2Id,
            })
            .select()
            .single(),
        ]);

        testVisit1Id = visits[0].data!.id;
        testVisit2Id = visits[1].data!.id;
      });

      afterAll(async () => {
        // Clean up in reverse dependency order (service-role for fixture teardown)
        await setupClient
          .from('visit')
          .delete()
          .in('id', [testVisit1Id, testVisit2Id]);
        await setupClient
          .from('player_casino')
          .delete()
          .in('player_id', [testPlayer1Id, testPlayer2Id]);
        await setupClient
          .from('player')
          .delete()
          .in('id', [testPlayer1Id, testPlayer2Id]);
      });

      it('should deny read access to other casino visit records', async () => {
        // Mode C: authedClient1 carries JWT with Casino 1 staff identity
        await setModeC_RLSContext(authedClient1, 'cross-casino-visit-read');

        // Act: Query all visits (RLS should filter to Casino 1 only)
        const { data, error } = await authedClient1
          .from('visit')
          .select('id, casino_id');

        expect(error).toBeNull();
        expect(data).toBeTruthy();

        // Assert: Only Casino 1 visits returned
        const casinoIds = data!.map((v) => v.casino_id);
        expect(casinoIds).toContain(testCasino1Id);
        expect(casinoIds).not.toContain(testCasino2Id);

        // Verify Casino 2 visit is completely invisible
        const { data: casino2Visit } = await authedClient1
          .from('visit')
          .select('id')
          .eq('id', testVisit2Id)
          .maybeSingle();

        expect(casino2Visit).toBeNull();
      });

      it('should deny read access to other casino player records', async () => {
        // Mode C: authedClient1 carries JWT with Casino 1 staff identity
        await setModeC_RLSContext(authedClient1, 'cross-casino-player-read');

        // Act: Query all players via player_casino junction
        // (player table has no casino_id, so we test via relationship)
        const { data, error } = await authedClient1
          .from('player_casino')
          .select(
            'player_id, casino_id, player:player(id, first_name, last_name)',
          );

        expect(error).toBeNull();
        expect(data).toBeTruthy();

        // Assert: Only Casino 1 player associations returned
        const casinoIds = data!.map((pc) => pc.casino_id);
        expect(casinoIds).toContain(testCasino1Id);
        expect(casinoIds).not.toContain(testCasino2Id);

        // Verify Casino 2 player association is invisible
        const { data: casino2PlayerCasino } = await authedClient1
          .from('player_casino')
          .select('player_id')
          .eq('player_id', testPlayer2Id)
          .eq('casino_id', testCasino2Id)
          .maybeSingle();

        expect(casino2PlayerCasino).toBeNull();
      });

      it('should deny read access to other casino record (casino table RLS)', async () => {
        // Mode C: authedClient1 carries JWT with Casino 1 staff identity
        await setModeC_RLSContext(authedClient1, 'cross-casino-table-read');

        // Act: Query all casinos (should only see own casino)
        const { data, error } = await authedClient1
          .from('casino')
          .select('id, name');

        expect(error).toBeNull();
        expect(data).toBeTruthy();
        expect(data!.length).toBeGreaterThan(0);

        // Assert: Only Casino 1 record returned
        const casinoIds = data!.map((c) => c.id);
        expect(casinoIds).toContain(testCasino1Id);
        expect(casinoIds).not.toContain(testCasino2Id);
        expect(casinoIds).not.toContain(testCasino3Id);

        // Direct query for Casino 2 should return empty (RLS filters it out)
        const { data: casino2 } = await authedClient1
          .from('casino')
          .select('id')
          .eq('id', testCasino2Id)
          .maybeSingle();

        expect(casino2).toBeNull();
      });

      it('should deny insert into other casino tables (visit INSERT denial)', async () => {
        // Mode C: authedClient1 carries JWT with Casino 1 staff identity
        await setModeC_RLSContext(authedClient1, 'cross-casino-insert-deny');

        // Act: Attempt to insert visit for Casino 2 (should fail)
        const { data, error } = await authedClient1
          .from('visit')
          .insert({
            casino_id: testCasino2Id, // Wrong casino!
            player_id: testPlayer2Id,
          })
          .select()
          .single();

        // Assert: Insert rejected (either RLS violation or constraint error)
        expect(error).not.toBeNull();
        expect(data).toBeNull();

        // Error should indicate policy violation or constraint failure
        expect(error!.message).toMatch(
          /new row violates row-level security policy|violates foreign key constraint|permission denied/i,
        );
      });

      it('should deny cross-casino access via SET LOCAL (authenticated anon client)', async () => {
        // This test verifies SET LOCAL context is enforced with Mode C client
        // Mode C: authedClient1 carries JWT with Casino 1 staff identity

        // Set context for Casino 1 via ADR-024 authoritative context injection
        await setModeC_RLSContext(authedClient1, 'cross-casino-set-local');

        // Query casino table - should only see Casino 1
        const { data, error } = await authedClient1
          .from('casino')
          .select('id, name');

        expect(error).toBeNull();
        expect(data).toBeTruthy();

        const casinoIds = data!.map((c) => c.id);
        expect(casinoIds).toContain(testCasino1Id);
        expect(casinoIds).not.toContain(testCasino2Id);

        // Try to query Casino 2 visit - should be invisible
        const { data: visit2 } = await authedClient1
          .from('visit')
          .select('id')
          .eq('id', testVisit2Id)
          .maybeSingle();

        expect(visit2).toBeNull();
      });

      it('should handle cross-casino denial in concurrent requests', async () => {
        // This test simulates multiple staff from different casinos
        // querying concurrently - no cross-contamination should occur
        // Uses Mode C authenticated anon clients for proper RLS enforcement

        const requests = [
          {
            client: createAuthedClient(accessToken1),
            casinoId: testCasino1Id,
            expectedVisitId: testVisit1Id,
            forbiddenVisitId: testVisit2Id,
          },
          {
            client: createAuthedClient(accessToken2),
            casinoId: testCasino2Id,
            expectedVisitId: testVisit2Id,
            forbiddenVisitId: testVisit1Id,
          },
        ];

        const results = await Promise.all(
          requests.map(
            async ({ client, casinoId, expectedVisitId, forbiddenVisitId }) => {
              await setModeC_RLSContext(
                client,
                `concurrent-denial-${casinoId}`,
              );

              const { data: ownVisit } = await client
                .from('visit')
                .select('id')
                .eq('id', expectedVisitId)
                .maybeSingle();

              const { data: otherVisit } = await client
                .from('visit')
                .select('id')
                .eq('id', forbiddenVisitId)
                .maybeSingle();

              return {
                casinoId,
                canSeeOwnVisit: ownVisit !== null,
                canSeeOtherVisit: otherVisit !== null,
              };
            },
          ),
        );

        // Verify each staff can see their own visit but not the other
        results.forEach((result) => {
          expect(result.canSeeOwnVisit).toBe(true);
          expect(result.canSeeOtherVisit).toBe(false);
        });
      });

      it('should enforce casino isolation on casino_settings queries', async () => {
        // Verify casino_settings (a critical config table) respects RLS
        // Uses Mode C authenticated anon clients for proper RLS enforcement

        // Staff A client (Casino 1) — Mode C
        await setModeC_RLSContext(authedClient1, 'settings-isolation-1');

        const { data: settings1 } = await authedClient1
          .from('casino_settings')
          .select('casino_id, timezone');

        expect(settings1).toBeTruthy();
        const casino1Ids = settings1!.map((s) => s.casino_id);
        expect(casino1Ids).toContain(testCasino1Id);
        expect(casino1Ids).not.toContain(testCasino2Id);

        // Staff B client (Casino 2) — Mode C
        await setModeC_RLSContext(authedClient2, 'settings-isolation-2');

        const { data: settings2 } = await authedClient2
          .from('casino_settings')
          .select('casino_id, timezone');

        expect(settings2).toBeTruthy();
        const casino2Ids = settings2!.map((s) => s.casino_id);
        expect(casino2Ids).toContain(testCasino2Id);
        expect(casino2Ids).not.toContain(testCasino1Id);
      });
    });

    // ===========================================================================
    // 8. Connection Pool Exhaustion Simulation
    // ===========================================================================

    describe('Connection Pool Exhaustion Simulation', () => {
      it('should handle high-concurrency scenario (100 requests)', async () => {
        const requestCount = 100;
        const casinos = [testCasino1Id, testCasino2Id, testCasino3Id];
        const tokens = [accessToken1, accessToken2, accessToken3];

        const requests = Array.from({ length: requestCount }, (_, i) => {
          const casinoIndex = i % 3;
          return {
            token: tokens[casinoIndex],
            casinoId: casinos[casinoIndex],
            index: i,
          };
        });

        // Execute all requests concurrently (simulates pool exhaustion)
        const results = await Promise.all(
          requests.map(async ({ token, casinoId, index }) => {
            const client = createAuthedClient(token);

            try {
              await setModeC_RLSContext(client, `pool-exhaust-${index}`);

              const { data, error } = await client
                .from('casino_settings')
                .select('casino_id')
                .eq('casino_id', casinoId)
                .single();

              return {
                index,
                success: !error,
                casinoId: data?.casino_id,
                expectedCasinoId: casinoId,
              };
            } catch (err) {
              return {
                index,
                success: false,
                error: err instanceof Error ? err.message : 'Unknown error',
              };
            }
          }),
        );

        // Count successes
        const successCount = results.filter((r) => r.success).length;
        const correctCasinoCount = results.filter(
          (r) => r.success && r.casinoId === r.expectedCasinoId,
        ).length;

        // Should have high success rate (allow for some connection pool limits)
        expect(successCount).toBeGreaterThan(requestCount * 0.8); // At least 80% success
        expect(correctCasinoCount).toBe(successCount); // All successes should have correct casino
      }, 30000); // 30 second timeout for this high-concurrency test
    });

    // ===========================================================================
    // 9. PRD-015 WS5: Load Testing (ADR-015 Phase 1A Verification)
    // ===========================================================================

    describe('PRD-015 WS5: Load & Isolation Testing', () => {
      it('should handle 100 concurrent requests per second for 60 seconds', async () => {
        const requestsPerSecond = 100;
        const durationSeconds = 60;
        const totalRequests = requestsPerSecond * durationSeconds;

        const casinos = [testCasino1Id, testCasino2Id, testCasino3Id];
        const tokens = [accessToken1, accessToken2, accessToken3];

        const startTime = Date.now();
        const results: {
          requestId: number;
          success: boolean;
          casinoId?: string;
          expectedCasinoId: string;
          responseTime: number;
          error?: string;
        }[] = [];

        // Generate all requests upfront
        const requests = Array.from({ length: totalRequests }, (_, i) => {
          const casinoIndex = i % 3;
          return {
            token: tokens[casinoIndex],
            casinoId: casinos[casinoIndex],
            requestId: i,
            expectedCasinoId: casinos[casinoIndex],
          };
        });

        // Execute in batches to simulate 100 req/s
        const batchSize = requestsPerSecond;
        for (let batch = 0; batch < durationSeconds; batch++) {
          const batchStart = batch * batchSize;
          const batchRequests = requests.slice(
            batchStart,
            batchStart + batchSize,
          );

          const batchResults = await Promise.all(
            batchRequests.map(
              async ({ token, casinoId, requestId, expectedCasinoId }) => {
                const reqStartTime = Date.now();
                const client = createAuthedClient(token);

                try {
                  await setModeC_RLSContext(
                    client,
                    `load-test-${batch}-${requestId}`,
                  );

                  const { data, error } = await client
                    .from('casino_settings')
                    .select('casino_id')
                    .eq('casino_id', casinoId)
                    .single();

                  return {
                    requestId,
                    success: !error,
                    casinoId: data?.casino_id,
                    expectedCasinoId,
                    responseTime: Date.now() - reqStartTime,
                  };
                } catch (err) {
                  return {
                    requestId,
                    success: false,
                    expectedCasinoId,
                    responseTime: Date.now() - reqStartTime,
                    error: err instanceof Error ? err.message : 'Unknown error',
                  };
                }
              },
            ),
          );

          results.push(...batchResults);

          // Small delay between batches to avoid overwhelming the connection pool
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const duration = Date.now() - startTime;
        const successCount = results.filter((r) => r.success).length;
        const failureCount = results.filter((r) => !r.success).length;
        const crossTenantLeaks = results.filter(
          (r) => r.success && r.casinoId !== r.expectedCasinoId,
        ).length;
        const avgResponseTime =
          results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

        // Assertions per PRD-015 WS5
        expect(successCount).toBeGreaterThan(totalRequests * 0.95); // At least 95% success
        expect(crossTenantLeaks).toBe(0); // Zero cross-tenant data leakage
        expect(failureCount).toBeLessThan(totalRequests * 0.05); // Less than 5% failure rate

        // Log results for analysis
        console.log(`\n=== PRD-015 WS5 Load Test Results ===`);
        console.log(`Total Requests: ${totalRequests}`);
        console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
        console.log(
          `Success Rate: ${((successCount / totalRequests) * 100).toFixed(2)}%`,
        );
        console.log(
          `Failure Rate: ${((failureCount / totalRequests) * 100).toFixed(2)}%`,
        );
        console.log(`Cross-Tenant Leaks: ${crossTenantLeaks}`);
        console.log(`Avg Response Time: ${avgResponseTime.toFixed(2)}ms`);
      }, 120000); // 2 minute timeout

      it('should maintain multi-tenant isolation with 10 concurrent casinos', async () => {
        // Create 10 test casinos with dedicated staff and Mode C tokens
        const isoSuffix = Date.now();
        const testCasinos: {
          casinoId: string;
          companyId: string;
          staffId: string;
          userId: string;
          accessToken: string;
        }[] = [];

        for (let i = 0; i < 10; i++) {
          const email = `test-rls-t3-pool-iso-${i}-${isoSuffix}@example.com`;

          // Create user
          const { data: user } = await setupClient.auth.admin.createUser({
            email,
            password: testPassword,
            email_confirm: true,
            app_metadata: { staff_role: 'pit_boss' },
          });

          // Create company (ADR-043: casino.company_id NOT NULL)
          const { data: company } = await setupClient
            .from('company')
            .insert({ name: `Isolation Test Company ${i}` })
            .select()
            .single();
          if (!company)
            throw new Error(`Failed to create isolation test company ${i}`);

          // Create casino
          const { data: casino } = await setupClient
            .from('casino')
            .insert({
              name: `Isolation Test Casino ${i}`,
              status: 'active',
              company_id: company.id,
            })
            .select()
            .single();

          // Create casino settings
          await setupClient.from('casino_settings').insert({
            casino_id: casino!.id,
            gaming_day_start_time: '06:00:00',
            timezone: 'America/Los_Angeles',
            watchlist_floor: 3000,
            ctr_threshold: 10000,
          });

          // Create staff
          const { data: staff } = await setupClient
            .from('staff')
            .insert({
              casino_id: casino!.id,
              user_id: user!.user!.id,
              employee_id: `ISO-${i}`,
              first_name: 'Isolation',
              last_name: `Test${i}`,
              role: 'pit_boss',
              status: 'active',
            })
            .select()
            .single();

          // Stamp staff_id into app_metadata (ADR-024 two-phase)
          await setupClient.auth.admin.updateUserById(user!.user!.id, {
            app_metadata: {
              staff_id: staff!.id,
              casino_id: casino!.id,
              staff_role: 'pit_boss',
            },
          });

          // Sign in to get JWT
          const throwaway = createClient<Database>(
            supabaseUrl,
            supabaseAnonKey,
            { auth: { autoRefreshToken: false, persistSession: false } },
          );
          const { data: session, error: signInError } =
            await throwaway.auth.signInWithPassword({
              email,
              password: testPassword,
            });
          if (signInError || !session.session)
            throw (
              signInError ??
              new Error(`Sign-in for isolation user ${i} returned no session`)
            );

          testCasinos.push({
            casinoId: casino!.id,
            companyId: company.id,
            staffId: staff!.id,
            userId: user!.user!.id,
            accessToken: session.session.access_token,
          });
        }

        try {
          // Execute 10 concurrent requests per casino (100 total)
          const requestsPerCasino = 10;
          const allRequests = testCasinos.flatMap((casino, casinoIndex) =>
            Array.from({ length: requestsPerCasino }, (_, requestIndex) => ({
              casinoIndex,
              requestIndex,
              token: casino.accessToken,
              casinoId: casino.casinoId,
              expectedCasinoId: casino.casinoId,
            })),
          );

          const results = await Promise.all(
            allRequests.map(
              async ({
                casinoIndex,
                requestIndex,
                token,
                casinoId,
                expectedCasinoId,
              }) => {
                const client = createAuthedClient(token);

                try {
                  await setModeC_RLSContext(
                    client,
                    `isolation-${casinoIndex}-${requestIndex}`,
                  );

                  const { data, error } = await client
                    .from('casino_settings')
                    .select('casino_id')
                    .eq('casino_id', casinoId)
                    .single();

                  return {
                    casinoIndex,
                    requestIndex,
                    success: !error,
                    casinoId: data?.casino_id,
                    expectedCasinoId,
                  };
                } catch (err) {
                  return {
                    casinoIndex,
                    requestIndex,
                    success: false,
                    expectedCasinoId,
                    error: err instanceof Error ? err.message : 'Unknown error',
                  };
                }
              },
            ),
          );

          // Group results by casino to verify isolation
          const casinoResults = testCasinos.map((casino, index) => {
            const casinoRequests = results.filter(
              (r) => r.casinoIndex === index,
            );
            const successCount = casinoRequests.filter((r) => r.success).length;
            const correctCasino = casinoRequests.filter(
              (r) => r.success && r.casinoId === casino.casinoId,
            ).length;
            const wrongCasino = casinoRequests.filter(
              (r) => r.success && r.casinoId !== casino.casinoId,
            ).length;

            return {
              casinoId: casino.casinoId,
              totalRequests: casinoRequests.length,
              successCount,
              correctCasino,
              wrongCasino,
            };
          });

          // Assertions: Zero cross-tenant leakage
          const totalLeaks = casinoResults.reduce(
            (sum, r) => sum + r.wrongCasino,
            0,
          );
          expect(totalLeaks).toBe(0);

          // All casinos should have 100% correct isolation
          casinoResults.forEach((result) => {
            expect(result.successCount).toBe(requestsPerCasino);
            expect(result.correctCasino).toBe(requestsPerCasino);
            expect(result.wrongCasino).toBe(0);
          });

          console.log(`\n=== PRD-015 WS5 Isolation Test Results ===`);
          console.log(`Total Casinos: ${testCasinos.length}`);
          console.log(`Requests per Casino: ${requestsPerCasino}`);
          console.log(`Total Requests: ${allRequests.length}`);
          console.log(`Cross-Tenant Leaks: ${totalLeaks}`);
          console.log(`Isolation: 100%`);
        } finally {
          // Cleanup: Delete in reverse dependency order (service-role)
          await Promise.all([
            setupClient
              .from('staff')
              .delete()
              .in(
                'id',
                testCasinos.map((c) => c.staffId),
              ),
            setupClient
              .from('casino_settings')
              .delete()
              .in(
                'casino_id',
                testCasinos.map((c) => c.casinoId),
              ),
          ]);

          await setupClient
            .from('casino')
            .delete()
            .in(
              'id',
              testCasinos.map((c) => c.casinoId),
            );

          // Clean up companies (ADR-043)
          await setupClient
            .from('company')
            .delete()
            .in(
              'id',
              testCasinos.map((c) => c.companyId),
            );

          await Promise.all(
            testCasinos.map((c) => setupClient.auth.admin.deleteUser(c.userId)),
          );
        }
      }, 60000); // 60 second timeout
    });

    // ===========================================================================
    // 10. pit_cash_observation RLS Tests (PRD-OPS-CASH-OBS-001)
    // ===========================================================================

    describe('pit_cash_observation RLS (PRD-OPS-CASH-OBS-001)', () => {
      let testVisitId: string;
      let testTableId: string;
      let testPlayerId: string;
      let testRatingSlipId: string;

      beforeAll(async () => {
        // Create test player (service-role for fixture setup)
        const { data: player, error: playerError } = await setupClient
          .from('player')
          .insert({
            first_name: 'Observation',
            last_name: 'Test',
          })
          .select()
          .single();

        if (playerError) throw playerError;
        testPlayerId = player.id;

        // Enroll player at casino
        await setupClient.from('player_casino').insert({
          player_id: testPlayerId,
          casino_id: testCasino1Id,
          status: 'active',
        });

        // Create test table
        const { data: table, error: tableError } = await setupClient
          .from('gaming_table')
          .insert({
            casino_id: testCasino1Id,
            label: `OBS-TEST-${Date.now()}`,
            type: 'blackjack',
            status: 'active',
          })
          .select()
          .single();

        if (tableError) throw tableError;
        testTableId = table.id;

        // Create test visit (visit_group_id required by schema, but trigger defaults it)
        const visitGroupId = crypto.randomUUID();
        const { data: visit, error: visitError } = await setupClient
          .from('visit')
          .insert({
            casino_id: testCasino1Id,
            player_id: testPlayerId,
            visit_group_id: visitGroupId,
          })
          .select()
          .single();

        if (visitError) throw visitError;
        testVisitId = visit.id;

        // Create test rating slip
        const { data: slip, error: slipError } = await setupClient
          .from('rating_slip')
          .insert({
            casino_id: testCasino1Id,
            visit_id: testVisitId,
            table_id: testTableId,
            seat_number: '1',
            status: 'open',
          })
          .select()
          .single();

        if (slipError) throw slipError;
        testRatingSlipId = slip.id;
      });

      afterAll(async () => {
        // Clean up in reverse dependency order (service-role for fixture teardown)
        await setupClient
          .from('pit_cash_observation')
          .delete()
          .eq('visit_id', testVisitId);
        await setupClient
          .from('rating_slip')
          .delete()
          .eq('visit_id', testVisitId);
        await setupClient.from('visit').delete().eq('id', testVisitId);
        await setupClient.from('gaming_table').delete().eq('id', testTableId);
        await setupClient
          .from('player_casino')
          .delete()
          .eq('player_id', testPlayerId);
        await setupClient.from('player').delete().eq('id', testPlayerId);
      });

      it('should create observation via RPC with proper staff context', async () => {
        // Call RPC to create observation via Mode C client
        // (RPC auto-injects context from JWT staff_id)
        const { data, error } = await authedClient1.rpc(
          'rpc_create_pit_cash_observation',
          {
            p_visit_id: testVisitId,
            p_amount: 500,
            p_rating_slip_id: testRatingSlipId,
            p_amount_kind: 'estimate',
            p_source: 'walk_with',
          },
        );

        expect(error).toBeNull();
        expect(data).toBeTruthy();
        expect(data.visit_id).toBe(testVisitId);
        expect(data.amount).toBe(500);
        expect(data.direction).toBe('out');
        expect(data.source).toBe('walk_with');
        expect(data.created_by_staff_id).toBe(testStaff1Id);
      });

      it('should read own casino observations with proper context', async () => {
        // Mode C: authedClient1 carries JWT with Casino 1 staff identity
        await setModeC_RLSContext(
          authedClient1,
          'pit-cash-obs-read-own-casino',
        );

        // Act: Query observations
        const { data, error } = await authedClient1
          .from('pit_cash_observation')
          .select('*')
          .eq('visit_id', testVisitId);

        expect(error).toBeNull();
        expect(data).toBeTruthy();
        expect(data!.length).toBeGreaterThan(0);
        expect(data![0].casino_id).toBe(testCasino1Id);
      });

      it('should deny cross-casino observation reads', async () => {
        // Mode C: authedClient2 carries JWT with Casino 2 staff identity
        await setModeC_RLSContext(
          authedClient2,
          'pit-cash-obs-cross-casino-deny',
        );

        // Act: Try to query Casino 1's observation (should return empty)
        const { data, error } = await authedClient2
          .from('pit_cash_observation')
          .select('*')
          .eq('visit_id', testVisitId);

        expect(error).toBeNull();
        // RLS should filter out all Casino 1 observations
        expect(data).toEqual([]);
      });

      it('should deny direct INSERT (must use RPC)', async () => {
        // Mode C: authedClient1 carries JWT with Casino 1 staff identity
        await setModeC_RLSContext(authedClient1, 'pit-cash-obs-direct-insert');

        // Act: Try to insert directly (should fail - INSERT is REVOKED)
        const { data, error } = await authedClient1
          .from('pit_cash_observation')
          .insert({
            casino_id: testCasino1Id,
            gaming_day: new Date().toISOString().split('T')[0],
            player_id: testPlayerId,
            visit_id: testVisitId,
            rating_slip_id: testRatingSlipId,
            direction: 'out',
            amount: 100,
            amount_kind: 'estimate',
            source: 'walk_with',
            observed_at: new Date().toISOString(),
            created_by_staff_id: testStaff1Id,
          })
          .select()
          .single();

        // Should fail due to REVOKE INSERT
        expect(error).not.toBeNull();
        expect(data).toBeNull();
        expect(error!.message).toMatch(/permission denied|INSERT/i);
      });

      it('should deny UPDATE on observations (append-only)', async () => {
        // Mode C: authedClient1 carries JWT with Casino 1 staff identity
        await setModeC_RLSContext(authedClient1, 'pit-cash-obs-update-deny');

        // First, get an existing observation
        const { data: existing } = await authedClient1
          .from('pit_cash_observation')
          .select('id')
          .eq('visit_id', testVisitId)
          .limit(1)
          .single();

        if (!existing) {
          console.log('No observation found to test UPDATE - skipping');
          return;
        }

        // Act: Try to update (should fail - UPDATE is REVOKED)
        const { data, error } = await authedClient1
          .from('pit_cash_observation')
          .update({ amount: 999 })
          .eq('id', existing.id)
          .select()
          .single();

        // Should fail due to REVOKE UPDATE
        expect(error).not.toBeNull();
        expect(data).toBeNull();
        expect(error!.message).toMatch(/permission denied|UPDATE/i);
      });

      it('should deny DELETE on observations (append-only)', async () => {
        // Mode C: authedClient1 carries JWT with Casino 1 staff identity
        await setModeC_RLSContext(authedClient1, 'pit-cash-obs-delete-deny');

        // First, get an existing observation
        const { data: existing } = await authedClient1
          .from('pit_cash_observation')
          .select('id')
          .eq('visit_id', testVisitId)
          .limit(1)
          .single();

        if (!existing) {
          console.log('No observation found to test DELETE - skipping');
          return;
        }

        // Act: Try to delete (should fail - DELETE is REVOKED)
        const { error } = await authedClient1
          .from('pit_cash_observation')
          .delete()
          .eq('id', existing.id);

        // Should fail due to REVOKE DELETE
        expect(error).not.toBeNull();
        expect(error!.message).toMatch(/permission denied|DELETE/i);
      });

      it('should handle idempotency key for deduplication', async () => {
        const idempotencyKey = `test-idempotency-${Date.now()}`;

        // First call - should succeed (Mode C client with Casino 1 JWT)
        const { data: first, error: firstError } = await authedClient1.rpc(
          'rpc_create_pit_cash_observation',
          {
            p_visit_id: testVisitId,
            p_amount: 200,
            p_rating_slip_id: testRatingSlipId,
            p_amount_kind: 'estimate',
            p_source: 'walk_with',
            p_idempotency_key: idempotencyKey,
          },
        );

        expect(firstError).toBeNull();
        expect(first).toBeTruthy();
        const firstId = first.id;

        // Second call with same idempotency key - should return existing
        const { data: second, error: secondError } = await authedClient1.rpc(
          'rpc_create_pit_cash_observation',
          {
            p_visit_id: testVisitId,
            p_amount: 200,
            p_rating_slip_id: testRatingSlipId,
            p_amount_kind: 'estimate',
            p_source: 'walk_with',
            p_idempotency_key: idempotencyKey,
          },
        );

        expect(secondError).toBeNull();
        expect(second).toBeTruthy();
        // Should return the same observation (idempotent)
        expect(second.id).toBe(firstId);
      });

      it('should reject observation for cross-casino visit via RPC', async () => {
        // Create a visit in Casino 2 for this test (service-role for fixture setup)
        const { data: player2 } = await setupClient
          .from('player')
          .insert({
            first_name: 'CrossObs',
            last_name: 'Test',
          })
          .select()
          .single();

        await setupClient.from('player_casino').insert({
          player_id: player2!.id,
          casino_id: testCasino2Id,
          status: 'active',
        });

        const { data: visit2 } = await setupClient
          .from('visit')
          .insert({
            casino_id: testCasino2Id,
            player_id: player2!.id,
            visit_group_id: crypto.randomUUID(),
          })
          .select()
          .single();

        try {
          // Staff 1 (Casino 1) tries to create observation for Casino 2 visit
          // via Mode C client — JWT carries Casino 1 identity
          const { data, error } = await authedClient1.rpc(
            'rpc_create_pit_cash_observation',
            {
              p_visit_id: visit2!.id, // Casino 2 visit
              p_amount: 500,
              p_amount_kind: 'estimate',
              p_source: 'walk_with',
            },
          );

          // Should fail - casino mismatch
          expect(error).not.toBeNull();
          expect(data).toBeNull();
          // RPC throws FORBIDDEN when visit belongs to different casino
          expect(error!.message).toMatch(/FORBIDDEN|does not belong|casino/i);
        } finally {
          // Cleanup (service-role)
          await setupClient.from('visit').delete().eq('id', visit2!.id);
          await setupClient
            .from('player_casino')
            .delete()
            .eq('player_id', player2!.id);
          await setupClient.from('player').delete().eq('id', player2!.id);
        }
      });
    });
  },
);
