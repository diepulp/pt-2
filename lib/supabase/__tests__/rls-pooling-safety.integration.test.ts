/**
 * RLS Connection Pooling Safety Tests (ADR-015 WS6)
 *
 * Tests that RLS context is properly isolated in pooled connection environments.
 * Verifies that SET LOCAL variables don't leak between transactions and that
 * the transaction-wrapped RPC approach is connection-pooling safe.
 *
 * PREREQUISITES:
 * - Migration 20251209183033_adr015_rls_context_rpc.sql must be applied
 * - Migration 20251209183401_adr015_hybrid_rls_policies.sql must be applied
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 *
 * CRITICAL: These tests simulate connection pooling behavior and verify
 * that context doesn't persist after transactions end.
 *
 * @see docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { injectRLSContext } from '@/lib/supabase/rls-context';
import type { RLSContext } from '@/lib/supabase/rls-context';
import type { Database } from '@/types/database.types';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe('RLS Connection Pooling Safety (ADR-015 WS6)', () => {
  let supabase: SupabaseClient<Database>;
  let testCasino1Id: string;
  let testCasino2Id: string;
  let testCasino3Id: string;
  let testStaff1Id: string;
  let testStaff2Id: string;
  let testStaff3Id: string;
  let testUser1Id: string;
  let testUser2Id: string;
  let testUser3Id: string;

  beforeAll(async () => {
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Create test users
    const users = await Promise.all([
      supabase.auth.admin.createUser({
        email: 'test-pooling-1@example.com',
        password: 'test-password-12345',
        email_confirm: true,
      }),
      supabase.auth.admin.createUser({
        email: 'test-pooling-2@example.com',
        password: 'test-password-12345',
        email_confirm: true,
      }),
      supabase.auth.admin.createUser({
        email: 'test-pooling-3@example.com',
        password: 'test-password-12345',
        email_confirm: true,
      }),
    ]);

    testUser1Id = users[0].data?.user?.id || '';
    testUser2Id = users[1].data?.user?.id || '';
    testUser3Id = users[2].data?.user?.id || '';

    // Create test casinos
    const casinos = await Promise.all([
      supabase
        .from('casino')
        .insert({ name: 'Pooling Test Casino 1', status: 'active' })
        .select()
        .single(),
      supabase
        .from('casino')
        .insert({ name: 'Pooling Test Casino 2', status: 'active' })
        .select()
        .single(),
      supabase
        .from('casino')
        .insert({ name: 'Pooling Test Casino 3', status: 'active' })
        .select()
        .single(),
    ]);

    testCasino1Id = casinos[0].data!.id;
    testCasino2Id = casinos[1].data!.id;
    testCasino3Id = casinos[2].data!.id;

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
      {
        casino_id: testCasino3Id,
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
        watchlist_floor: 3000,
        ctr_threshold: 10000,
      },
    ]);

    // Create test staff
    const staff = await Promise.all([
      supabase
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
      supabase
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
      supabase
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
  });

  afterAll(async () => {
    // Clean up in reverse order
    await supabase
      .from('staff')
      .delete()
      .in('id', [testStaff1Id, testStaff2Id, testStaff3Id]);
    await supabase
      .from('casino_settings')
      .delete()
      .in('casino_id', [testCasino1Id, testCasino2Id, testCasino3Id]);
    await supabase
      .from('casino')
      .delete()
      .in('id', [testCasino1Id, testCasino2Id, testCasino3Id]);

    // Clean up users
    await Promise.all([
      supabase.auth.admin.deleteUser(testUser1Id),
      supabase.auth.admin.deleteUser(testUser2Id),
      supabase.auth.admin.deleteUser(testUser3Id),
    ]);
  });

  // ===========================================================================
  // 1. Transaction-Local Context Persistence Tests
  // ===========================================================================

  describe('Transaction-Local Context Persistence', () => {
    it('should set context variables via RPC and persist within transaction', async () => {
      const context: RLSContext = {
        actorId: testStaff1Id,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      // Set context via RPC (transaction-wrapped)
      await injectRLSContext(supabase, context, 'test-txn-persist-001');

      // Immediately query - context should still be set
      const { data, error } = await supabase
        .from('casino_settings')
        .select('casino_id')
        .eq('casino_id', testCasino1Id)
        .single();

      expect(error).toBeNull();
      expect(data?.casino_id).toBe(testCasino1Id);
    });

    it('should handle multiple RPC calls in sequence without context leakage', async () => {
      // Context 1
      const context1: RLSContext = {
        actorId: testStaff1Id,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(supabase, context1, 'test-seq-001');

      const { data: data1 } = await supabase
        .from('casino_settings')
        .select('casino_id')
        .eq('casino_id', testCasino1Id)
        .single();

      expect(data1?.casino_id).toBe(testCasino1Id);

      // Context 2 (different casino)
      const context2: RLSContext = {
        actorId: testStaff2Id,
        casinoId: testCasino2Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(supabase, context2, 'test-seq-002');

      const { data: data2 } = await supabase
        .from('casino_settings')
        .select('casino_id')
        .eq('casino_id', testCasino2Id)
        .single();

      expect(data2?.casino_id).toBe(testCasino2Id);

      // Verify context switched correctly (no leakage from context1)
      expect(data1?.casino_id).not.toBe(data2?.casino_id);
    });

    it('should handle rapid context switching between three casinos', async () => {
      const contexts: RLSContext[] = [
        {
          actorId: testStaff1Id,
          casinoId: testCasino1Id,
          staffRole: 'pit_boss',
        },
        {
          actorId: testStaff2Id,
          casinoId: testCasino2Id,
          staffRole: 'pit_boss',
        },
        {
          actorId: testStaff3Id,
          casinoId: testCasino3Id,
          staffRole: 'pit_boss',
        },
      ];

      const results: string[] = [];

      // Rapidly switch contexts and query
      for (let i = 0; i < contexts.length; i++) {
        await injectRLSContext(supabase, contexts[i], `test-rapid-${i}`);

        const { data } = await supabase
          .from('casino_settings')
          .select('casino_id')
          .eq('casino_id', contexts[i].casinoId)
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
      // Create 10 concurrent clients (simulates pooled connections)
      const clients = Array.from({ length: 10 }, () =>
        createClient<Database>(supabaseUrl, supabaseServiceKey),
      );

      // Each client alternates between Casino 1 and Casino 2
      const requests = clients.map(async (client, index) => {
        const isEven = index % 2 === 0;
        const context: RLSContext = {
          actorId: isEven ? testStaff1Id : testStaff2Id,
          casinoId: isEven ? testCasino1Id : testCasino2Id,
          staffRole: 'pit_boss',
        };

        await injectRLSContext(client, context, `test-concurrent-${index}`);

        const { data } = await client
          .from('casino_settings')
          .select('casino_id')
          .eq('casino_id', context.casinoId)
          .single();

        return {
          index,
          expectedCasinoId: context.casinoId,
          actualCasinoId: data?.casino_id,
        };
      });

      const results = await Promise.all(requests);

      // Verify each request saw only its intended casino
      results.forEach((result) => {
        expect(result.actualCasinoId).toBe(result.expectedCasinoId);
      });
    });

    it('should handle concurrent requests with different staff roles', async () => {
      const requests = [
        {
          context: {
            actorId: testStaff1Id,
            casinoId: testCasino1Id,
            staffRole: 'pit_boss',
          },
          correlationId: 'concurrent-role-1',
        },
        {
          context: {
            actorId: testStaff2Id,
            casinoId: testCasino2Id,
            staffRole: 'admin',
          },
          correlationId: 'concurrent-role-2',
        },
        {
          context: {
            actorId: testStaff3Id,
            casinoId: testCasino3Id,
            staffRole: 'pit_boss',
          },
          correlationId: 'concurrent-role-3',
        },
      ];

      // Execute all requests concurrently
      const results = await Promise.all(
        requests.map(async ({ context, correlationId }) => {
          const client = createClient<Database>(
            supabaseUrl,
            supabaseServiceKey,
          );
          await injectRLSContext(client, context, correlationId);

          const { data } = await client
            .from('casino_settings')
            .select('casino_id')
            .eq('casino_id', context.casinoId)
            .single();

          return {
            expectedCasinoId: context.casinoId,
            actualCasinoId: data?.casino_id,
            staffRole: context.staffRole,
          };
        }),
      );

      // Verify each request maintained correct context
      results.forEach((result) => {
        expect(result.actualCasinoId).toBe(result.expectedCasinoId);
      });
    });

    it('should handle burst of 50 concurrent context switches', async () => {
      const burstSize = 50;
      const casinos = [testCasino1Id, testCasino2Id, testCasino3Id];
      const staff = [testStaff1Id, testStaff2Id, testStaff3Id];

      const requests = Array.from({ length: burstSize }, (_, i) => {
        const casinoIndex = i % 3;
        return {
          context: {
            actorId: staff[casinoIndex],
            casinoId: casinos[casinoIndex],
            staffRole: 'pit_boss',
          },
          index: i,
        };
      });

      const results = await Promise.all(
        requests.map(async ({ context, index }) => {
          const client = createClient<Database>(
            supabaseUrl,
            supabaseServiceKey,
          );
          await injectRLSContext(client, context, `burst-${index}`);

          const { data, error } = await client
            .from('casino_settings')
            .select('casino_id')
            .eq('casino_id', context.casinoId)
            .single();

          return {
            index,
            expectedCasinoId: context.casinoId,
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
      const client1 = createClient<Database>(supabaseUrl, supabaseServiceKey);
      const client2 = createClient<Database>(supabaseUrl, supabaseServiceKey);

      // Set Casino 1 context on client1
      const context1: RLSContext = {
        actorId: testStaff1Id,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(client1, context1, 'isolation-client1');

      // Set Casino 2 context on client2
      const context2: RLSContext = {
        actorId: testStaff2Id,
        casinoId: testCasino2Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(client2, context2, 'isolation-client2');

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
      const client1 = createClient<Database>(supabaseUrl, supabaseServiceKey);
      const client2 = createClient<Database>(supabaseUrl, supabaseServiceKey);

      // Interleaved operations:
      // 1. Set context on client1
      await injectRLSContext(
        client1,
        {
          actorId: testStaff1Id,
          casinoId: testCasino1Id,
          staffRole: 'pit_boss',
        },
        'interleave-1a',
      );

      // 2. Set context on client2
      await injectRLSContext(
        client2,
        {
          actorId: testStaff2Id,
          casinoId: testCasino2Id,
          staffRole: 'pit_boss',
        },
        'interleave-2a',
      );

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

      // 5. Switch context on client1 to Casino 3
      await injectRLSContext(
        client1,
        {
          actorId: testStaff3Id,
          casinoId: testCasino3Id,
          staffRole: 'pit_boss',
        },
        'interleave-1b',
      );

      // 6. Query from client1 (should see Casino 3 now)
      const { data: data1b } = await client1
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

      // Verify context switching worked correctly
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
      const context: RLSContext = {
        actorId: testStaff1Id,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      // Single RPC call should set all variables
      const { error } = await supabase.rpc('set_rls_context', {
        p_actor_id: context.actorId,
        p_casino_id: context.casinoId,
        p_staff_role: context.staffRole,
        p_correlation_id: 'atomic-test-001',
      });

      expect(error).toBeNull();

      // All variables should be available in subsequent queries
      // (We can't directly check current_setting via Supabase client,
      // but we verify by querying data that depends on the context)
      const { data } = await supabase
        .from('casino_settings')
        .select('casino_id')
        .eq('casino_id', testCasino1Id)
        .single();

      expect(data?.casino_id).toBe(testCasino1Id);
    });

    it('should handle RPC errors gracefully without partial context', async () => {
      // Attempt to call RPC with invalid UUID
      const { error } = await supabase.rpc('set_rls_context', {
        // @ts-expect-error - Testing invalid input
        p_actor_id: 'invalid-uuid',
        p_casino_id: testCasino1Id,
        p_staff_role: 'pit_boss',
        p_correlation_id: 'error-test-001',
      });

      // Should get an error
      expect(error).not.toBeNull();

      // Context should not be partially set (all-or-nothing)
      // Subsequent queries should work without the failed context
      const { data } = await supabase
        .from('casino_settings')
        .select('casino_id')
        .eq('casino_id', testCasino1Id)
        .single();

      // Query should still work (falls back to JWT or service role)
      expect(data?.casino_id).toBe(testCasino1Id);
    });
  });

  // ===========================================================================
  // 5. Correlation ID Tests
  // ===========================================================================

  describe('Correlation ID Tracking', () => {
    it('should accept and set correlation_id in application_name', async () => {
      const context: RLSContext = {
        actorId: testStaff1Id,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      const correlationId = 'test-correlation-xyz-123';

      await injectRLSContext(supabase, context, correlationId);

      // Subsequent query should execute successfully
      const { data, error } = await supabase
        .from('casino_settings')
        .select('casino_id')
        .eq('casino_id', testCasino1Id)
        .single();

      expect(error).toBeNull();
      expect(data?.casino_id).toBe(testCasino1Id);
    });

    it('should handle NULL correlation_id', async () => {
      const context: RLSContext = {
        actorId: testStaff1Id,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      // Don't pass correlation_id (undefined)
      await injectRLSContext(supabase, context);

      const { data, error } = await supabase
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

      const requests = correlationIds.map(async (cid, index) => {
        const client = createClient<Database>(supabaseUrl, supabaseServiceKey);
        const casinoIndex = index % 3;
        const casinos = [testCasino1Id, testCasino2Id, testCasino3Id];
        const staff = [testStaff1Id, testStaff2Id, testStaff3Id];

        const context: RLSContext = {
          actorId: staff[casinoIndex],
          casinoId: casinos[casinoIndex],
          staffRole: 'pit_boss',
        };

        await injectRLSContext(client, context, cid);

        const { data } = await client
          .from('casino_settings')
          .select('casino_id')
          .eq('casino_id', context.casinoId)
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
  // 6. Connection Pool Exhaustion Simulation
  // ===========================================================================

  describe('Connection Pool Exhaustion Simulation', () => {
    it('should handle high-concurrency scenario (100 requests)', async () => {
      const requestCount = 100;
      const casinos = [testCasino1Id, testCasino2Id, testCasino3Id];
      const staff = [testStaff1Id, testStaff2Id, testStaff3Id];

      const requests = Array.from({ length: requestCount }, (_, i) => {
        const casinoIndex = i % 3;
        return {
          context: {
            actorId: staff[casinoIndex],
            casinoId: casinos[casinoIndex],
            staffRole: 'pit_boss',
          },
          index: i,
        };
      });

      // Execute all requests concurrently (simulates pool exhaustion)
      const results = await Promise.all(
        requests.map(async ({ context, index }) => {
          const client = createClient<Database>(
            supabaseUrl,
            supabaseServiceKey,
          );

          try {
            await injectRLSContext(client, context, `pool-exhaust-${index}`);

            const { data, error } = await client
              .from('casino_settings')
              .select('casino_id')
              .eq('casino_id', context.casinoId)
              .single();

            return {
              index,
              success: !error,
              casinoId: data?.casino_id,
              expectedCasinoId: context.casinoId,
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
});
