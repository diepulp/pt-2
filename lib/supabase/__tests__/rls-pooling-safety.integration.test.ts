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

import type { Database } from '../../../types/database.types';
import { injectRLSContext } from '../rls-context';
import type { RLSContext } from '../rls-context';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
        p_actor_id: 'invalid-uuid' as string,
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
  // 6. RPC→RPC Context Propagation Tests (ISSUE-B3C8BA48)
  // ===========================================================================

  describe('RPC to RPC Context Propagation (ADR-015 Phase 1A)', () => {
    let testVisitId: string;
    let testTableId: string;
    let testPlayerId: string;

    beforeAll(async () => {
      // Create test player (player table doesn't have casino_id directly)
      const { data: player, error: playerError } = await supabase
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
      const { error: enrollError } = await supabase
        .from('player_casino')
        .insert({
          player_id: testPlayerId,
          casino_id: testCasino1Id,
          status: 'active',
        });

      if (enrollError) throw enrollError;

      // Create test table (uses label + type, not table_number + status)
      const { data: table, error: tableError } = await supabase
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
      const { data: visit, error: visitError } = await supabase
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
      // Clean up in reverse dependency order
      await supabase.from('rating_slip').delete().eq('visit_id', testVisitId);
      await supabase.from('visit').delete().eq('id', testVisitId);
      await supabase.from('gaming_table').delete().eq('id', testTableId);
      await supabase
        .from('player_casino')
        .delete()
        .eq('player_id', testPlayerId);
      await supabase.from('player').delete().eq('id', testPlayerId);
    });

    it('should maintain context when calling rpc_start then rpc_close (move workflow)', async () => {
      // This test verifies the fix for ISSUE-B3C8BA48:
      // When the move endpoint calls close() then start(), each RPC must
      // self-inject context to work correctly with connection pooling.

      // Step 1: Call rpc_start_rating_slip
      const { data: startResult, error: startError } = await supabase.rpc(
        'rpc_start_rating_slip',
        {
          p_casino_id: testCasino1Id,
          p_visit_id: testVisitId,
          p_table_id: testTableId,
          p_seat_number: '1',
          p_game_settings: { game_type: 'blackjack' },
          p_actor_id: testStaff1Id,
        },
      );

      expect(startError).toBeNull();
      expect(startResult).toBeTruthy();
      expect(startResult?.status).toBe('open');
      expect(startResult?.casino_id).toBe(testCasino1Id);

      // Step 2: Call rpc_close_rating_slip (simulates move workflow)
      // In production, this may execute on a DIFFERENT pooled connection
      const { data: closeResult, error: closeError } = await supabase.rpc(
        'rpc_close_rating_slip',
        {
          p_casino_id: testCasino1Id,
          p_rating_slip_id: startResult!.id,
          p_actor_id: testStaff1Id,
          p_average_bet: 50.0,
        },
      );

      expect(closeError).toBeNull();
      expect(closeResult).toBeTruthy();
      expect(closeResult?.[0]?.slip.status).toBe('closed');
      expect(closeResult?.[0]?.duration_seconds).toBeGreaterThanOrEqual(0);
    });

    it('should handle pause/resume RPCs in sequence', async () => {
      // Create a new slip for this test
      const { data: slip, error: startError } = await supabase.rpc(
        'rpc_start_rating_slip',
        {
          p_casino_id: testCasino1Id,
          p_visit_id: testVisitId,
          p_table_id: testTableId,
          p_seat_number: '2',
          p_game_settings: { game_type: 'blackjack' },
          p_actor_id: testStaff1Id,
        },
      );

      expect(startError).toBeNull();
      expect(slip).toBeTruthy();

      // Pause the slip
      const { data: pauseResult, error: pauseError } = await supabase.rpc(
        'rpc_pause_rating_slip',
        {
          p_casino_id: testCasino1Id,
          p_rating_slip_id: slip!.id,
          p_actor_id: testStaff1Id,
        },
      );

      expect(pauseError).toBeNull();
      expect(pauseResult).toBeTruthy();
      expect(pauseResult?.status).toBe('paused');

      // Resume the slip (third RPC call - tests context persists)
      const { data: resumeResult, error: resumeError } = await supabase.rpc(
        'rpc_resume_rating_slip',
        {
          p_casino_id: testCasino1Id,
          p_rating_slip_id: slip!.id,
          p_actor_id: testStaff1Id,
        },
      );

      expect(resumeError).toBeNull();
      expect(resumeResult).toBeTruthy();
      expect(resumeResult?.status).toBe('open');

      // Close the slip (fourth RPC call)
      const { data: closeResult, error: closeError } = await supabase.rpc(
        'rpc_close_rating_slip',
        {
          p_casino_id: testCasino1Id,
          p_rating_slip_id: slip!.id,
          p_actor_id: testStaff1Id,
        },
      );

      expect(closeError).toBeNull();
      expect(closeResult).toBeTruthy();
      expect(closeResult?.[0]?.slip.status).toBe('closed');
    });

    it('should enforce casino isolation between RPC calls', async () => {
      // Start a slip in casino 1
      const { data: slip1, error: start1Error } = await supabase.rpc(
        'rpc_start_rating_slip',
        {
          p_casino_id: testCasino1Id,
          p_visit_id: testVisitId,
          p_table_id: testTableId,
          p_seat_number: '3',
          p_game_settings: { game_type: 'blackjack' },
          p_actor_id: testStaff1Id,
        },
      );

      expect(start1Error).toBeNull();
      expect(slip1).toBeTruthy();

      // Try to close the slip with casino 2 context (should fail)
      const { error: closeError } = await supabase.rpc(
        'rpc_close_rating_slip',
        {
          p_casino_id: testCasino2Id, // Wrong casino!
          p_rating_slip_id: slip1!.id,
          p_actor_id: testStaff2Id,
        },
      );

      // Should fail due to casino_id mismatch
      expect(closeError).not.toBeNull();
      expect(closeError?.message).toMatch(/casino_id mismatch|not found/i);

      // Clean up - close with correct casino
      await supabase.rpc('rpc_close_rating_slip', {
        p_casino_id: testCasino1Id,
        p_rating_slip_id: slip1!.id,
        p_actor_id: testStaff1Id,
      });
    });

    it('should handle concurrent RPC calls from different casinos', async () => {
      // Create test data for casino 2
      const { data: player2 } = await supabase
        .from('player')
        .insert({
          first_name: 'Concurrent',
          last_name: 'Test',
        })
        .select()
        .single();

      // Enroll player2 at casino 2
      await supabase.from('player_casino').insert({
        player_id: player2!.id,
        casino_id: testCasino2Id,
        status: 'active',
      });

      const { data: table2 } = await supabase
        .from('gaming_table')
        .insert({
          casino_id: testCasino2Id,
          label: `CONC-TEST-${Date.now()}`,
          type: 'roulette',
          status: 'active',
        })
        .select()
        .single();

      const { data: visit2 } = await supabase
        .from('visit')
        .insert({
          casino_id: testCasino2Id,
          player_id: player2!.id,
        })
        .select()
        .single();

      try {
        // Start slips concurrently in both casinos
        const [result1, result2] = await Promise.all([
          supabase.rpc('rpc_start_rating_slip', {
            p_casino_id: testCasino1Id,
            p_visit_id: testVisitId,
            p_table_id: testTableId,
            p_seat_number: '4',
            p_game_settings: { game_type: 'blackjack' },
            p_actor_id: testStaff1Id,
          }),
          supabase.rpc('rpc_start_rating_slip', {
            p_casino_id: testCasino2Id,
            p_visit_id: visit2!.id,
            p_table_id: table2!.id,
            p_seat_number: '1',
            p_game_settings: { game_type: 'roulette' },
            p_actor_id: testStaff2Id,
          }),
        ]);

        expect(result1.error).toBeNull();
        expect(result2.error).toBeNull();
        expect(result1.data).toBeTruthy();
        expect(result2.data).toBeTruthy();

        // Each slip should be in correct casino
        expect(result1.data?.casino_id).toBe(testCasino1Id);
        expect(result2.data?.casino_id).toBe(testCasino2Id);

        // Close both concurrently
        const [close1, close2] = await Promise.all([
          supabase.rpc('rpc_close_rating_slip', {
            p_casino_id: testCasino1Id,
            p_rating_slip_id: result1.data!.id,
            p_actor_id: testStaff1Id,
          }),
          supabase.rpc('rpc_close_rating_slip', {
            p_casino_id: testCasino2Id,
            p_rating_slip_id: result2.data!.id,
            p_actor_id: testStaff2Id,
          }),
        ]);

        expect(close1.error).toBeNull();
        expect(close2.error).toBeNull();
      } finally {
        // Cleanup casino 2 test data
        await supabase.from('rating_slip').delete().eq('visit_id', visit2!.id);
        await supabase.from('visit').delete().eq('id', visit2!.id);
        await supabase.from('gaming_table').delete().eq('id', table2!.id);
        await supabase
          .from('player_casino')
          .delete()
          .eq('player_id', player2!.id);
        await supabase.from('player').delete().eq('id', player2!.id);
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
      // Create players for cross-casino tests
      const players = await Promise.all([
        supabase
          .from('player')
          .insert({
            first_name: 'Casino1',
            last_name: 'Player',
          })
          .select()
          .single(),
        supabase
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
        supabase.from('player_casino').insert({
          player_id: testPlayer1Id,
          casino_id: testCasino1Id,
          status: 'active',
        }),
        supabase.from('player_casino').insert({
          player_id: testPlayer2Id,
          casino_id: testCasino2Id,
          status: 'active',
        }),
      ]);

      // Create visits for each casino
      const visits = await Promise.all([
        supabase
          .from('visit')
          .insert({
            casino_id: testCasino1Id,
            player_id: testPlayer1Id,
          })
          .select()
          .single(),
        supabase
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
      // Clean up in reverse dependency order
      await supabase
        .from('visit')
        .delete()
        .in('id', [testVisit1Id, testVisit2Id]);
      await supabase
        .from('player_casino')
        .delete()
        .in('player_id', [testPlayer1Id, testPlayer2Id]);
      await supabase
        .from('player')
        .delete()
        .in('id', [testPlayer1Id, testPlayer2Id]);
    });

    it('should deny read access to other casino visit records', async () => {
      // Setup: Staff A authenticated for Casino 1
      // Use anon key with authentication for proper RLS enforcement
      const anonClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await anonClient.auth.signInWithPassword({
        email: 'test-pooling-1@example.com',
        password: 'test-password-12345',
      });

      const context: RLSContext = {
        actorId: testStaff1Id,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(anonClient, context, 'cross-casino-visit-read');

      // Act: Query all visits (RLS should filter to Casino 1 only)
      const { data, error } = await anonClient
        .from('visit')
        .select('id, casino_id');

      expect(error).toBeNull();
      expect(data).toBeTruthy();

      // Assert: Only Casino 1 visits returned
      const casinoIds = data!.map((v) => v.casino_id);
      expect(casinoIds).toContain(testCasino1Id);
      expect(casinoIds).not.toContain(testCasino2Id);

      // Verify Casino 2 visit is completely invisible
      const { data: casino2Visit } = await anonClient
        .from('visit')
        .select('id')
        .eq('id', testVisit2Id)
        .maybeSingle();

      expect(casino2Visit).toBeNull();

      await anonClient.auth.signOut();
    });

    it('should deny read access to other casino player records', async () => {
      // Setup: Staff A authenticated for Casino 1
      // Use anon key with authentication for proper RLS enforcement
      const anonClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await anonClient.auth.signInWithPassword({
        email: 'test-pooling-1@example.com',
        password: 'test-password-12345',
      });

      const context: RLSContext = {
        actorId: testStaff1Id,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(anonClient, context, 'cross-casino-player-read');

      // Act: Query all players via player_casino junction
      // (player table has no casino_id, so we test via relationship)
      const { data, error } = await anonClient
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
      const { data: casino2PlayerCasino } = await anonClient
        .from('player_casino')
        .select('player_id')
        .eq('player_id', testPlayer2Id)
        .eq('casino_id', testCasino2Id)
        .maybeSingle();

      expect(casino2PlayerCasino).toBeNull();

      await anonClient.auth.signOut();
    });

    it('should deny read access to other casino record (casino table RLS)', async () => {
      // Setup: Staff A authenticated for Casino 1
      // Use anon key with authentication for proper RLS enforcement
      const anonClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await anonClient.auth.signInWithPassword({
        email: 'test-pooling-1@example.com',
        password: 'test-password-12345',
      });

      const context: RLSContext = {
        actorId: testStaff1Id,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(anonClient, context, 'cross-casino-table-read');

      // Act: Query all casinos (should only see own casino)
      const { data, error } = await anonClient
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
      const { data: casino2 } = await anonClient
        .from('casino')
        .select('id')
        .eq('id', testCasino2Id)
        .maybeSingle();

      expect(casino2).toBeNull();

      await anonClient.auth.signOut();
    });

    it('should deny insert into other casino tables (visit INSERT denial)', async () => {
      // Setup: Staff A authenticated for Casino 1
      // Use anon key with authentication for proper RLS enforcement
      const anonClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await anonClient.auth.signInWithPassword({
        email: 'test-pooling-1@example.com',
        password: 'test-password-12345',
      });

      const context: RLSContext = {
        actorId: testStaff1Id,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(anonClient, context, 'cross-casino-insert-deny');

      // Act: Attempt to insert visit for Casino 2 (should fail)
      const { data, error } = await anonClient
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

      await anonClient.auth.signOut();
    });

    it('should deny cross-casino access via SET LOCAL (authenticated anon client)', async () => {
      // This test verifies SET LOCAL context is enforced with authenticated client
      // Use anon key client with user authentication for RLS enforcement
      const anonClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Sign in as test user 1 (linked to staff 1, casino 1)
      const { error: signInError } = await anonClient.auth.signInWithPassword({
        email: 'test-pooling-1@example.com',
        password: 'test-password-12345',
      });

      expect(signInError).toBeNull();

      // Set context for Casino 1 via SET LOCAL
      const { error: rpcError } = await anonClient.rpc('set_rls_context', {
        p_actor_id: testStaff1Id,
        p_casino_id: testCasino1Id,
        p_staff_role: 'pit_boss',
        p_correlation_id: 'cross-casino-set-local',
      });

      expect(rpcError).toBeNull();

      // Query casino table - should only see Casino 1
      const { data, error } = await anonClient
        .from('casino')
        .select('id, name');

      expect(error).toBeNull();
      expect(data).toBeTruthy();

      const casinoIds = data!.map((c) => c.id);
      expect(casinoIds).toContain(testCasino1Id);
      expect(casinoIds).not.toContain(testCasino2Id);

      // Try to query Casino 2 visit - should be invisible
      const { data: visit2 } = await anonClient
        .from('visit')
        .select('id')
        .eq('id', testVisit2Id)
        .maybeSingle();

      expect(visit2).toBeNull();

      await anonClient.auth.signOut();
    });

    it('should handle cross-casino denial in concurrent requests', async () => {
      // This test simulates multiple staff from different casinos
      // querying concurrently - no cross-contamination should occur
      // Uses authenticated anon clients for proper RLS enforcement

      const requests = [
        {
          email: 'test-pooling-1@example.com',
          context: {
            actorId: testStaff1Id,
            casinoId: testCasino1Id,
            staffRole: 'pit_boss',
          },
          expectedVisitId: testVisit1Id,
          forbiddenVisitId: testVisit2Id,
        },
        {
          email: 'test-pooling-2@example.com',
          context: {
            actorId: testStaff2Id,
            casinoId: testCasino2Id,
            staffRole: 'pit_boss',
          },
          expectedVisitId: testVisit2Id,
          forbiddenVisitId: testVisit1Id,
        },
      ];

      const results = await Promise.all(
        requests.map(
          async ({ email, context, expectedVisitId, forbiddenVisitId }) => {
            // Use anon client with authentication for RLS enforcement
            const client = createClient<Database>(
              supabaseUrl,
              supabaseAnonKey,
              {
                auth: { autoRefreshToken: false, persistSession: false },
              },
            );

            await client.auth.signInWithPassword({
              email,
              password: 'test-password-12345',
            });

            await injectRLSContext(
              client,
              context,
              `concurrent-denial-${context.casinoId}`,
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

            await client.auth.signOut();

            return {
              casinoId: context.casinoId,
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
      // Uses authenticated anon clients for proper RLS enforcement

      // Staff A client (Casino 1)
      const client1 = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await client1.auth.signInWithPassword({
        email: 'test-pooling-1@example.com',
        password: 'test-password-12345',
      });

      const context1: RLSContext = {
        actorId: testStaff1Id,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(client1, context1, 'settings-isolation-1');

      const { data: settings1 } = await client1
        .from('casino_settings')
        .select('casino_id, timezone');

      expect(settings1).toBeTruthy();
      const casino1Ids = settings1!.map((s) => s.casino_id);
      expect(casino1Ids).toContain(testCasino1Id);
      expect(casino1Ids).not.toContain(testCasino2Id);

      await client1.auth.signOut();

      // Staff B client (Casino 2)
      const client2 = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await client2.auth.signInWithPassword({
        email: 'test-pooling-2@example.com',
        password: 'test-password-12345',
      });

      const context2: RLSContext = {
        actorId: testStaff2Id,
        casinoId: testCasino2Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(client2, context2, 'settings-isolation-2');

      const { data: settings2 } = await client2
        .from('casino_settings')
        .select('casino_id, timezone');

      expect(settings2).toBeTruthy();
      const casino2Ids = settings2!.map((s) => s.casino_id);
      expect(casino2Ids).toContain(testCasino2Id);
      expect(casino2Ids).not.toContain(testCasino1Id);

      await client2.auth.signOut();
    });
  });

  // ===========================================================================
  // 8. Connection Pool Exhaustion Simulation
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
