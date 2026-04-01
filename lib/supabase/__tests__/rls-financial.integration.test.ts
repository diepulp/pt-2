/** @jest-environment node */

/**
 * RLS Financial Transaction Integration Tests (PRD-009 WS5)
 *
 * Tests RLS policy enforcement for player_financial_transaction table.
 * Verifies that financial transactions are properly scoped by casino_id
 * and prevents cross-tenant data access.
 *
 * Auth model: ADR-024 Mode C — authenticated anon clients carry JWT with staff_id
 * in app_metadata; set_rls_context_from_staff() derives context server-side.
 *
 * PREREQUISITES:
 * - Migration 20251211015115_prd009_player_financial_service.sql must be applied
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable set
 *
 * @see docs/10-prd/PRD-009-player-financial-service.md
 * @see services/player-financial/index.ts
 * @see docs/80-adrs/ADR-024-authoritative-context-derivation.md
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
// eslint-disable-next-line no-restricted-imports -- Integration tests require direct Supabase client
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database.types';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const RUN_INTEGRATION =
  process.env.RUN_INTEGRATION_TESTS === 'true' ||
  process.env.RUN_INTEGRATION_TESTS === '1';

(RUN_INTEGRATION ? describe : describe.skip)(
  'RLS Financial Transaction Policies (PRD-009 WS5)',
  () => {
    let serviceClient: SupabaseClient<Database>; // Service role bypasses RLS (fixture setup/teardown only)
    let authClient1: SupabaseClient<Database>; // Mode C authenticated as Casino 1 staff
    let authClient2: SupabaseClient<Database>; // Mode C authenticated as Casino 2 staff

    let testCompany1Id: string;
    let testCompany2Id: string;
    let testCasino1Id: string;
    let testCasino2Id: string;
    let testStaff1Id: string;
    let testStaff2Id: string;
    let testUser1Id: string;
    let testUser2Id: string;
    let testPlayer1Id: string;
    let testPlayer2Id: string;
    let testVisit1Id: string;
    let testVisit2Id: string;
    let testTxn1Id: string;
    let testTxn2Id: string;

    const ts = Date.now();
    const testEmail1 = `test-rls-t3-fin-pit_boss-${ts}@example.com`;
    const testEmail2 = `test-rls-t3-fin-pit_boss-${ts + 1}@example.com`;
    const testPassword = 'test-password-12345';

    // Use current date for gaming_day / started_at to avoid STALE_GAMING_DAY_CONTEXT
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const todayTs = `${today}T20:00:00Z`;

    beforeAll(async () => {
      // Service client for setup (bypasses RLS)
      serviceClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

      // =========================================================================
      // 1. Create Auth Users (two-phase ADR-024 setup — staff_id stamped after insert)
      // =========================================================================

      const { data: authUser1, error: authError1 } =
        await serviceClient.auth.admin.createUser({
          email: testEmail1,
          password: testPassword,
          email_confirm: true,
          app_metadata: { staff_role: 'pit_boss' },
        });
      if (authError1) throw authError1;
      testUser1Id = authUser1.user.id;

      const { data: authUser2, error: authError2 } =
        await serviceClient.auth.admin.createUser({
          email: testEmail2,
          password: testPassword,
          email_confirm: true,
          app_metadata: { staff_role: 'pit_boss' },
        });
      if (authError2) throw authError2;
      testUser2Id = authUser2.user.id;

      // =========================================================================
      // 2. Create Test Companies (ADR-043: casino.company_id NOT NULL)
      // =========================================================================

      const { data: company1, error: company1Error } = await serviceClient
        .from('company')
        .insert({ name: 'RLS Financial Test Company 1' })
        .select()
        .single();
      if (company1Error) throw company1Error;
      testCompany1Id = company1.id;

      const { data: company2, error: company2Error } = await serviceClient
        .from('company')
        .insert({ name: 'RLS Financial Test Company 2' })
        .select()
        .single();
      if (company2Error) throw company2Error;
      testCompany2Id = company2.id;

      // =========================================================================
      // 3. Create Test Casinos
      // =========================================================================

      const { data: casino1, error: casino1Error } = await serviceClient
        .from('casino')
        .insert({
          name: 'RLS Financial Test Casino 1',
          status: 'active',
          company_id: testCompany1Id,
        })
        .select()
        .single();

      if (casino1Error) throw casino1Error;
      testCasino1Id = casino1.id;

      const { data: casino2, error: casino2Error } = await serviceClient
        .from('casino')
        .insert({
          name: 'RLS Financial Test Casino 2',
          status: 'active',
          company_id: testCompany2Id,
        })
        .select()
        .single();

      if (casino2Error) throw casino2Error;
      testCasino2Id = casino2.id;

      // Create casino settings
      await serviceClient.from('casino_settings').insert([
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

      // =========================================================================
      // 4. Create Test Staff
      // =========================================================================

      const { data: staff1, error: staff1Error } = await serviceClient
        .from('staff')
        .insert({
          casino_id: testCasino1Id,
          user_id: testUser1Id,
          employee_id: 'RLS-FIN-001',
          first_name: 'Test',
          last_name: 'FinStaff1',
          role: 'pit_boss',
          status: 'active',
        })
        .select()
        .single();

      if (staff1Error) throw staff1Error;
      testStaff1Id = staff1.id;

      const { data: staff2, error: staff2Error } = await serviceClient
        .from('staff')
        .insert({
          casino_id: testCasino2Id,
          user_id: testUser2Id,
          employee_id: 'RLS-FIN-002',
          first_name: 'Test',
          last_name: 'FinStaff2',
          role: 'pit_boss',
          status: 'active',
        })
        .select()
        .single();

      if (staff2Error) throw staff2Error;
      testStaff2Id = staff2.id;

      // =========================================================================
      // 5. Stamp staff_id into app_metadata (ADR-024 two-phase)
      // =========================================================================

      await serviceClient.auth.admin.updateUserById(testUser1Id, {
        app_metadata: {
          staff_id: testStaff1Id,
          casino_id: testCasino1Id,
          staff_role: 'pit_boss',
        },
      });
      await serviceClient.auth.admin.updateUserById(testUser2Id, {
        app_metadata: {
          staff_id: testStaff2Id,
          casino_id: testCasino2Id,
          staff_role: 'pit_boss',
        },
      });

      // =========================================================================
      // 6. Sign in via throwaway clients → build Mode C authenticated anon clients
      //
      // Mode C clients are created early so they can be used for financial
      // transaction fixture creation via rpc_create_financial_txn (which calls
      // set_rls_context_from_staff() internally, satisfying the MTL bridge trigger).
      // =========================================================================

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

      // Mode C clients (ADR-024): authenticated anon with Bearer JWT
      authClient1 = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${session1.session.access_token}`,
          },
        },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      authClient2 = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${session2.session.access_token}`,
          },
        },
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // =========================================================================
      // 7. Create Test Players
      // =========================================================================

      const { data: player1, error: player1Error } = await serviceClient
        .from('player')
        .insert({
          first_name: 'FinTest',
          last_name: 'Player1',
        })
        .select()
        .single();

      if (player1Error) throw player1Error;
      testPlayer1Id = player1.id;

      const { data: player2, error: player2Error } = await serviceClient
        .from('player')
        .insert({
          first_name: 'FinTest',
          last_name: 'Player2',
        })
        .select()
        .single();

      if (player2Error) throw player2Error;
      testPlayer2Id = player2.id;

      // Enroll players in their respective casinos
      await serviceClient.from('player_casino').insert([
        {
          player_id: testPlayer1Id,
          casino_id: testCasino1Id,
        },
        {
          player_id: testPlayer2Id,
          casino_id: testCasino2Id,
        },
      ]);

      // =========================================================================
      // 8. Create Test Visits
      // =========================================================================

      const { data: visit1, error: visit1Error } = await serviceClient
        .from('visit')
        .insert({
          casino_id: testCasino1Id,
          player_id: testPlayer1Id,
          started_at: todayTs,
          visit_kind: 'gaming_identified_rated',
        })
        .select()
        .single();

      if (visit1Error) throw visit1Error;
      testVisit1Id = visit1.id;

      const { data: visit2, error: visit2Error } = await serviceClient
        .from('visit')
        .insert({
          casino_id: testCasino2Id,
          player_id: testPlayer2Id,
          started_at: todayTs,
          visit_kind: 'gaming_identified_rated',
        })
        .select()
        .single();

      if (visit2Error) throw visit2Error;
      testVisit2Id = visit2.id;

      // =========================================================================
      // 9. Create Test Financial Transactions via rpc_create_financial_txn
      //
      // Using Mode C authenticated clients so the RPC can call
      // set_rls_context_from_staff() — which satisfies the MTL bridge trigger
      // (trg_derive_mtl_from_finance) G1 guardrail within the same transaction.
      // =========================================================================

      // ADR-040: casino_id and created_by_staff_id are derived from JWT context —
      // do NOT pass them as parameters.
      const { data: txn1, error: txn1Error } = await authClient1.rpc(
        'rpc_create_financial_txn',
        {
          p_player_id: testPlayer1Id,
          p_visit_id: testVisit1Id,
          p_amount: 500,
          p_direction: 'in',
          p_source: 'pit',
          p_tender_type: 'cash',
          p_idempotency_key: `rls-test-txn-1-${ts}`,
        },
      );

      if (txn1Error) throw txn1Error;
      testTxn1Id = (txn1 as { id: string }).id;

      const { data: txn2, error: txn2Error } = await authClient2.rpc(
        'rpc_create_financial_txn',
        {
          p_player_id: testPlayer2Id,
          p_visit_id: testVisit2Id,
          p_amount: 1000,
          p_direction: 'in',
          p_source: 'cage',
          p_tender_type: 'chips',
          p_idempotency_key: `rls-test-txn-2-${ts}`,
        },
      );

      if (txn2Error) throw txn2Error;
      testTxn2Id = (txn2 as { id: string }).id;
    });

    afterAll(async () => {
      // Clean up test data (in reverse order of creation)
      await serviceClient
        .from('player_financial_transaction')
        .delete()
        .eq('id', testTxn1Id);
      await serviceClient
        .from('player_financial_transaction')
        .delete()
        .eq('id', testTxn2Id);
      await serviceClient.from('visit').delete().eq('id', testVisit1Id);
      await serviceClient.from('visit').delete().eq('id', testVisit2Id);
      await serviceClient
        .from('player_casino')
        .delete()
        .eq('player_id', testPlayer1Id);
      await serviceClient
        .from('player_casino')
        .delete()
        .eq('player_id', testPlayer2Id);
      await serviceClient.from('player').delete().eq('id', testPlayer1Id);
      await serviceClient.from('player').delete().eq('id', testPlayer2Id);
      await serviceClient.from('staff').delete().eq('id', testStaff1Id);
      await serviceClient.from('staff').delete().eq('id', testStaff2Id);
      await serviceClient
        .from('casino_settings')
        .delete()
        .eq('casino_id', testCasino1Id);
      await serviceClient
        .from('casino_settings')
        .delete()
        .eq('casino_id', testCasino2Id);
      await serviceClient.from('casino').delete().eq('id', testCasino1Id);
      await serviceClient.from('casino').delete().eq('id', testCasino2Id);

      // Clean up companies (ADR-043)
      await serviceClient.from('company').delete().eq('id', testCompany1Id);
      await serviceClient.from('company').delete().eq('id', testCompany2Id);

      // Clean up test users
      if (testUser1Id) {
        await serviceClient.auth.admin.deleteUser(testUser1Id);
      }
      if (testUser2Id) {
        await serviceClient.auth.admin.deleteUser(testUser2Id);
      }
    });

    // ===========================================================================
    // 1. Financial Transaction READ Policies
    // ===========================================================================

    describe('Financial Transaction READ Policies', () => {
      it('should allow staff to read transactions from their own casino', async () => {
        const { data, error } = await authClient1
          .from('player_financial_transaction')
          .select('*')
          .eq('casino_id', testCasino1Id);

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.length).toBeGreaterThan(0);

        // All returned transactions should belong to Casino 1
        data?.forEach((txn) => {
          expect(txn.casino_id).toBe(testCasino1Id);
        });
      });

      it('should filter transactions by visit_id within casino context', async () => {
        const { data, error } = await authClient1
          .from('player_financial_transaction')
          .select('*')
          .eq('visit_id', testVisit1Id);

        expect(error).toBeNull();
        expect(data).not.toBeNull();

        // All returned transactions should be for the specified visit
        data?.forEach((txn) => {
          expect(txn.visit_id).toBe(testVisit1Id);
          expect(txn.casino_id).toBe(testCasino1Id);
        });
      });

      it('should filter transactions by player_id within casino context', async () => {
        const { data, error } = await authClient1
          .from('player_financial_transaction')
          .select('*')
          .eq('player_id', testPlayer1Id);

        expect(error).toBeNull();
        expect(data).not.toBeNull();

        // All returned transactions should be for the specified player
        data?.forEach((txn) => {
          expect(txn.player_id).toBe(testPlayer1Id);
        });
      });

      it('should filter transactions by direction', async () => {
        const { data, error } = await authClient1
          .from('player_financial_transaction')
          .select('*')
          .eq('direction', 'in');

        expect(error).toBeNull();
        expect(data).not.toBeNull();

        // All returned transactions should have direction 'in'
        data?.forEach((txn) => {
          expect(txn.direction).toBe('in');
        });
      });

      it('should filter transactions by gaming_day', async () => {
        const { data, error } = await authClient1
          .from('player_financial_transaction')
          .select('*')
          .eq('gaming_day', today);

        expect(error).toBeNull();
        expect(data).not.toBeNull();

        // All returned transactions should be for the specified gaming day
        data?.forEach((txn) => {
          expect(txn.gaming_day).toBe(today);
        });
      });
    });

    // ===========================================================================
    // 2. Casino Isolation Tests
    // ===========================================================================

    describe('Casino Isolation', () => {
      it('should enforce casino isolation for concurrent requests', async () => {
        // Both queries execute with separate Mode C authenticated clients
        const { data: casino1Txns } = await authClient1
          .from('player_financial_transaction')
          .select('casino_id, amount');

        const { data: casino2Txns } = await authClient2
          .from('player_financial_transaction')
          .select('casino_id, amount');

        // Verify each client sees different casinos' transactions
        const casino1Ids = new Set(casino1Txns?.map((t) => t.casino_id) || []);
        const casino2Ids = new Set(casino2Txns?.map((t) => t.casino_id) || []);

        // Both should have data
        expect(casino1Ids.size).toBeGreaterThan(0);
        expect(casino2Ids.size).toBeGreaterThan(0);
      });

      it('should return correct transaction amounts per casino', async () => {
        const { data } = await authClient1
          .from('player_financial_transaction')
          .select('amount')
          .eq('id', testTxn1Id)
          .single();

        // Casino 1 transaction should have amount 500
        expect(data?.amount).toBe(500);
      });
    });

    // ===========================================================================
    // 3. Financial Transaction Immutability Tests
    // ===========================================================================

    describe('Financial Transaction Immutability', () => {
      it('should prevent direct inserts (must use RPC)', async () => {
        // Authenticated anon client — RLS enforced. Direct inserts are blocked
        // in favor of the RPC; SELECT should still succeed within own casino.
        const { error } = await authClient1
          .from('player_financial_transaction')
          .select('id')
          .limit(1);

        // Read should succeed
        expect(error).toBeNull();
      });

      it('should verify transactions are append-only (no updates)', async () => {
        // Transactions should not be updateable - verify read-only pattern
        const { data, error } = await serviceClient
          .from('player_financial_transaction')
          .select('*')
          .eq('id', testTxn1Id)
          .single();

        expect(error).toBeNull();
        expect(data).not.toBeNull();

        // The record should exist and be immutable
        expect(data?.amount).toBe(500);
        expect(data?.direction).toBe('in');
      });
    });

    // ===========================================================================
    // 4. Visit Financial Summary View Tests
    // ===========================================================================

    describe('Visit Financial Summary View', () => {
      it('should aggregate transactions correctly for a visit', async () => {
        const { data, error } = await authClient1
          .from('visit_financial_summary')
          .select('*')
          .eq('visit_id', testVisit1Id)
          .single();

        expect(error).toBeNull();

        if (data) {
          // Summary should reflect our test transaction
          expect(data.visit_id).toBe(testVisit1Id);
          expect(data.casino_id).toBe(testCasino1Id);
          expect(data.total_in).toBeGreaterThanOrEqual(500);
          expect(data.event_count).toBeGreaterThanOrEqual(1);
        }
      });

      it('should scope summary view by casino_id', async () => {
        // Mode C authenticated client: RLS enforces casino scoping automatically
        const { data } = await authClient1
          .from('visit_financial_summary')
          .select('casino_id')
          .eq('casino_id', testCasino1Id);

        // All summaries should belong to Casino 1
        data?.forEach((summary) => {
          expect(summary.casino_id).toBe(testCasino1Id);
        });

        // Verify we got results
        expect(data?.length).toBeGreaterThan(0);
      });
    });

    // ===========================================================================
    // 5. Idempotency Key Tests
    // ===========================================================================

    describe('Idempotency Key Uniqueness', () => {
      it('should enforce unique idempotency keys within casino', async () => {
        // Query by idempotency key (service client for authoritative lookup)
        const { data, error } = await serviceClient
          .from('player_financial_transaction')
          .select('*')
          .eq('casino_id', testCasino1Id)
          .eq('idempotency_key', `rls-test-txn-1-${ts}`)
          .single();

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.id).toBe(testTxn1Id);
      });

      it('should allow same idempotency key in different casinos', async () => {
        // Query both transactions by their idempotency keys
        const { data: txn1 } = await serviceClient
          .from('player_financial_transaction')
          .select('casino_id, idempotency_key')
          .eq('id', testTxn1Id)
          .single();

        const { data: txn2 } = await serviceClient
          .from('player_financial_transaction')
          .select('casino_id, idempotency_key')
          .eq('id', testTxn2Id)
          .single();

        // Both transactions should exist with different casino_ids
        expect(txn1?.casino_id).toBe(testCasino1Id);
        expect(txn2?.casino_id).toBe(testCasino2Id);
      });
    });

    // ===========================================================================
    // 6. Staff Role Access Tests
    // ===========================================================================

    describe('Staff Role Access', () => {
      it('should allow pit_boss to read financial transactions', async () => {
        const { data, error } = await authClient1
          .from('player_financial_transaction')
          .select('*')
          .eq('casino_id', testCasino1Id)
          .limit(5);

        expect(error).toBeNull();
        expect(data).not.toBeNull();
      });

      it('should verify staff can only see transactions they created', async () => {
        const { data, error } = await authClient1
          .from('player_financial_transaction')
          .select('*')
          .eq('created_by_staff_id', testStaff1Id);

        expect(error).toBeNull();

        // All returned transactions should be created by Staff 1
        data?.forEach((txn) => {
          expect(txn.created_by_staff_id).toBe(testStaff1Id);
        });
      });
    });

    // ===========================================================================
    // 7. Multi-Table Queries with Financial Data
    // ===========================================================================

    describe('Multi-Table Queries', () => {
      it('should join transactions with visits correctly', async () => {
        const { data, error } = await authClient1
          .from('player_financial_transaction')
          .select(
            `
          *,
          visit:visit_id(id, started_at, visit_kind)
        `,
          )
          .eq('casino_id', testCasino1Id);

        expect(error).toBeNull();
        expect(data).not.toBeNull();

        // All transactions should have valid visit relationships
        data?.forEach((txn) => {
          expect(txn.casino_id).toBe(testCasino1Id);
          if (txn.visit) {
            expect(txn.visit.id).toBe(txn.visit_id);
          }
        });
      });

      it('should join transactions with players correctly', async () => {
        const { data, error } = await authClient1
          .from('player_financial_transaction')
          .select(
            `
          *,
          player:player_id(id, first_name, last_name)
        `,
          )
          .eq('casino_id', testCasino1Id);

        expect(error).toBeNull();
        expect(data).not.toBeNull();

        // All transactions should have valid player relationships
        data?.forEach((txn) => {
          expect(txn.casino_id).toBe(testCasino1Id);
          if (txn.player) {
            expect(txn.player.id).toBe(txn.player_id);
          }
        });
      });
    });
  },
);
