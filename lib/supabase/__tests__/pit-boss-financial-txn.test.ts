/**
 * Pit Boss Financial Transaction Tests (PRD-015 WS5)
 *
 * Tests that pit_boss role constraints are correctly enforced for financial transactions
 * as specified in SEC-005 v1.2.0 and implemented in PRD-015 WS1.
 *
 * PREREQUISITES:
 * - Migration 20251221173711_prd015_ws1_financial_rpc_self_injection.sql must be applied
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 *
 * SEC-005 v1.2.0 Constraints:
 * - pit_boss can create buy-ins (direction='in')
 * - pit_boss can ONLY use cash or chips for buy-ins
 * - pit_boss CANNOT create cash-outs (direction='out')
 * - pit_boss CANNOT create marker transactions
 *
 * @see docs/30-security/SEC-005-role-taxonomy.md
 * @see docs/10-prd/PRD-015-adr015-phase1a-remediation.md
 * @see supabase/migrations/20251221173711_prd015_ws1_financial_rpc_self_injection.sql
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database.types';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe('Pit Boss Financial Transaction Constraints (PRD-015 WS5)', () => {
  let supabase: SupabaseClient<Database>;
  let testCasinoId: string;
  let testPitBossStaffId: string;
  let testCashierStaffId: string;
  let testPitBossUserId: string;
  let testCashierUserId: string;
  let testPlayerId: string;
  let testVisitId: string;

  beforeAll(async () => {
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Create test users
    const pitBossUser = await supabase.auth.admin.createUser({
      email: 'pit-boss-financial@example.com',
      password: 'test-password-12345',
      email_confirm: true,
    });

    const cashierUser = await supabase.auth.admin.createUser({
      email: 'cashier-financial@example.com',
      password: 'test-password-12345',
      email_confirm: true,
    });

    testPitBossUserId = pitBossUser.data?.user?.id || '';
    testCashierUserId = cashierUser.data?.user?.id || '';

    // Create test casino
    const { data: casino } = await supabase
      .from('casino')
      .insert({ name: 'Financial Test Casino', status: 'active' })
      .select()
      .single();

    testCasinoId = casino!.id;

    // Create casino settings
    await supabase.from('casino_settings').insert({
      casino_id: testCasinoId,
      gaming_day_start_time: '06:00:00',
      timezone: 'America/Los_Angeles',
      watchlist_floor: 3000,
      ctr_threshold: 10000,
    });

    // Create test staff (pit_boss and cashier)
    const pitBossStaff = await supabase
      .from('staff')
      .insert({
        casino_id: testCasinoId,
        user_id: testPitBossUserId,
        employee_id: 'PB-001',
        first_name: 'Test',
        last_name: 'PitBoss',
        role: 'pit_boss',
        status: 'active',
      })
      .select()
      .single();

    const cashierStaff = await supabase
      .from('staff')
      .insert({
        casino_id: testCasinoId,
        user_id: testCashierUserId,
        employee_id: 'CSH-001',
        first_name: 'Test',
        last_name: 'Cashier',
        role: 'cashier',
        status: 'active',
      })
      .select()
      .single();

    testPitBossStaffId = pitBossStaff.data!.id;
    testCashierStaffId = cashierStaff.data!.id;

    // Create test player
    const { data: player } = await supabase
      .from('player')
      .insert({
        first_name: 'Financial',
        last_name: 'TestPlayer',
      })
      .select()
      .single();

    testPlayerId = player!.id;

    // Enroll player at casino
    await supabase.from('player_casino').insert({
      player_id: testPlayerId,
      casino_id: testCasinoId,
      status: 'active',
    });

    // Create test visit
    const { data: visit } = await supabase
      .from('visit')
      .insert({
        casino_id: testCasinoId,
        player_id: testPlayerId,
      })
      .select()
      .single();

    testVisitId = visit!.id;
  });

  afterAll(async () => {
    // Clean up in reverse dependency order
    await supabase
      .from('player_financial_transaction')
      .delete()
      .eq('casino_id', testCasinoId);
    await supabase.from('visit').delete().eq('id', testVisitId);
    await supabase.from('player_casino').delete().eq('player_id', testPlayerId);
    await supabase.from('player').delete().eq('id', testPlayerId);
    await supabase
      .from('staff')
      .delete()
      .in('id', [testPitBossStaffId, testCashierStaffId]);
    await supabase
      .from('casino_settings')
      .delete()
      .eq('casino_id', testCasinoId);
    await supabase.from('casino').delete().eq('id', testCasinoId);

    // Clean up users
    await Promise.all([
      supabase.auth.admin.deleteUser(testPitBossUserId),
      supabase.auth.admin.deleteUser(testCashierUserId),
    ]);
  });

  // ===========================================================================
  // 1. Pit Boss Buy-In Tests (ALLOWED)
  // ===========================================================================

  describe('Pit Boss Buy-In (Allowed Transactions)', () => {
    it('should allow pit_boss to create buy-in with cash', async () => {
      const { data, error } = await supabase.rpc('rpc_create_financial_txn', {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_amount: 500.0,
        p_direction: 'in',
        p_source: 'table',
        p_created_by_staff_id: testPitBossStaffId,
        p_tender_type: 'cash',
      });

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data?.amount).toBe('500');
      expect(data?.direction).toBe('in');
      expect(data?.tender_type).toBe('cash');
      expect(data?.created_by_staff_id).toBe(testPitBossStaffId);
    });

    it('should allow pit_boss to create buy-in with chips', async () => {
      const { data, error } = await supabase.rpc('rpc_create_financial_txn', {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_amount: 1000.0,
        p_direction: 'in',
        p_source: 'table',
        p_created_by_staff_id: testPitBossStaffId,
        p_tender_type: 'chips',
      });

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data?.amount).toBe('1000');
      expect(data?.direction).toBe('in');
      expect(data?.tender_type).toBe('chips');
      expect(data?.created_by_staff_id).toBe(testPitBossStaffId);
    });

    it('should allow multiple concurrent pit_boss buy-ins without race conditions', async () => {
      const buyInRequests = Array.from({ length: 5 }, (_, i) => ({
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_amount: (i + 1) * 100.0,
        p_direction: 'in' as const,
        p_source: 'table' as const,
        p_created_by_staff_id: testPitBossStaffId,
        p_tender_type: i % 2 === 0 ? ('cash' as const) : ('chips' as const),
      }));

      const results = await Promise.all(
        buyInRequests.map((params) =>
          supabase.rpc('rpc_create_financial_txn', params),
        ),
      );

      // All should succeed
      results.forEach((result, index) => {
        expect(result.error).toBeNull();
        expect(result.data).toBeTruthy();
        expect(result.data?.direction).toBe('in');
        expect(result.data?.created_by_staff_id).toBe(testPitBossStaffId);
      });
    });
  });

  // ===========================================================================
  // 2. Pit Boss Cash-Out Tests (FORBIDDEN)
  // ===========================================================================

  describe('Pit Boss Cash-Out (Forbidden Transactions)', () => {
    it('should reject pit_boss attempt to create cash-out', async () => {
      const { data, error } = await supabase.rpc('rpc_create_financial_txn', {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_amount: 500.0,
        p_direction: 'out',
        p_source: 'table',
        p_created_by_staff_id: testPitBossStaffId,
        p_tender_type: 'cash',
      });

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(
        /pit_boss can only create buy-in transactions/i,
      );
      expect(data).toBeNull();
    });

    it('should reject pit_boss attempt to create chip cash-out', async () => {
      const { data, error } = await supabase.rpc('rpc_create_financial_txn', {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_amount: 1000.0,
        p_direction: 'out',
        p_source: 'table',
        p_created_by_staff_id: testPitBossStaffId,
        p_tender_type: 'chips',
      });

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(
        /pit_boss can only create buy-in transactions/i,
      );
      expect(data).toBeNull();
    });
  });

  // ===========================================================================
  // 3. Pit Boss Marker Transaction Tests (FORBIDDEN)
  // ===========================================================================

  describe('Pit Boss Marker Transactions (Forbidden)', () => {
    it('should reject pit_boss attempt to create marker transaction', async () => {
      const { data, error } = await supabase.rpc('rpc_create_financial_txn', {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_amount: 5000.0,
        p_direction: 'in',
        p_source: 'table',
        p_created_by_staff_id: testPitBossStaffId,
        p_tender_type: 'marker',
      });

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(
        /pit_boss can only use cash or chips for buy-ins/i,
      );
      expect(data).toBeNull();
    });

    it('should reject pit_boss attempt to create check transaction', async () => {
      const { data, error } = await supabase.rpc('rpc_create_financial_txn', {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_amount: 2000.0,
        p_direction: 'in',
        p_source: 'table',
        p_created_by_staff_id: testPitBossStaffId,
        p_tender_type: 'check',
      });

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(
        /pit_boss can only use cash or chips for buy-ins/i,
      );
      expect(data).toBeNull();
    });
  });

  // ===========================================================================
  // 4. Cashier Comparison Tests (Baseline)
  // ===========================================================================

  describe('Cashier Transactions (Baseline Comparison)', () => {
    it('should allow cashier to create cash-out (for comparison)', async () => {
      const { data, error } = await supabase.rpc('rpc_create_financial_txn', {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_amount: 500.0,
        p_direction: 'out',
        p_source: 'cage',
        p_created_by_staff_id: testCashierStaffId,
        p_tender_type: 'cash',
      });

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data?.direction).toBe('out');
      expect(data?.created_by_staff_id).toBe(testCashierStaffId);
    });

    it('should allow cashier to create marker transaction (for comparison)', async () => {
      const { data, error } = await supabase.rpc('rpc_create_financial_txn', {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_amount: 5000.0,
        p_direction: 'in',
        p_source: 'cage',
        p_created_by_staff_id: testCashierStaffId,
        p_tender_type: 'marker',
      });

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(data?.tender_type).toBe('marker');
      expect(data?.created_by_staff_id).toBe(testCashierStaffId);
    });
  });

  // ===========================================================================
  // 5. Connection Pooling Safety Tests
  // ===========================================================================

  describe('Connection Pooling Safety (ADR-015 Phase 1A)', () => {
    it('should enforce pit_boss constraints under concurrent load', async () => {
      // Simulate 20 concurrent requests: 10 valid, 10 invalid
      const validRequests = Array.from({ length: 10 }, (_, i) => ({
        valid: true,
        params: {
          p_casino_id: testCasinoId,
          p_player_id: testPlayerId,
          p_visit_id: testVisitId,
          p_amount: (i + 1) * 50.0,
          p_direction: 'in' as const,
          p_source: 'table' as const,
          p_created_by_staff_id: testPitBossStaffId,
          p_tender_type: 'cash' as const,
        },
      }));

      const invalidRequests = Array.from({ length: 10 }, (_, i) => ({
        valid: false,
        params: {
          p_casino_id: testCasinoId,
          p_player_id: testPlayerId,
          p_visit_id: testVisitId,
          p_amount: (i + 1) * 50.0,
          p_direction: i % 2 === 0 ? ('out' as const) : ('in' as const),
          p_source: 'table' as const,
          p_created_by_staff_id: testPitBossStaffId,
          p_tender_type: i % 2 === 0 ? ('cash' as const) : ('marker' as const),
        },
      }));

      const allRequests = [...validRequests, ...invalidRequests].sort(
        () => Math.random() - 0.5,
      ); // Shuffle

      const results = await Promise.all(
        allRequests.map(async ({ valid, params }) => {
          const result = await supabase.rpc('rpc_create_financial_txn', params);
          return {
            valid,
            success: result.error === null,
            error: result.error?.message,
          };
        }),
      );

      // All valid requests should succeed
      const validResults = results.filter((r) => r.valid);
      expect(validResults.every((r) => r.success)).toBe(true);

      // All invalid requests should fail with pit_boss constraint error
      const invalidResults = results.filter((r) => !r.valid);
      expect(invalidResults.every((r) => !r.success)).toBe(true);
      expect(
        invalidResults.every((r) => r.error?.match(/pit_boss can only/i)),
      ).toBe(true);
    });

    it('should maintain pit_boss context isolation across concurrent transactions', async () => {
      // Create second pit boss for cross-contamination test
      const { data: user2 } = await supabase.auth.admin.createUser({
        email: 'pit-boss-2-financial@example.com',
        password: 'test-password-12345',
        email_confirm: true,
      });

      const { data: casino2 } = await supabase
        .from('casino')
        .insert({ name: 'Financial Test Casino 2', status: 'active' })
        .select()
        .single();

      await supabase.from('casino_settings').insert({
        casino_id: casino2!.id,
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
        watchlist_floor: 3000,
        ctr_threshold: 10000,
      });

      const { data: staff2 } = await supabase
        .from('staff')
        .insert({
          casino_id: casino2!.id,
          user_id: user2!.user!.id,
          employee_id: 'PB-002',
          first_name: 'Test2',
          last_name: 'PitBoss2',
          role: 'pit_boss',
          status: 'active',
        })
        .select()
        .single();

      const { data: player2 } = await supabase
        .from('player')
        .insert({ first_name: 'Player2', last_name: 'Test' })
        .select()
        .single();

      await supabase.from('player_casino').insert({
        player_id: player2!.id,
        casino_id: casino2!.id,
        status: 'active',
      });

      const { data: visit2 } = await supabase
        .from('visit')
        .insert({
          casino_id: casino2!.id,
          player_id: player2!.id,
        })
        .select()
        .single();

      try {
        // Execute concurrent transactions from both pit bosses
        const [result1, result2] = await Promise.all([
          supabase.rpc('rpc_create_financial_txn', {
            p_casino_id: testCasinoId,
            p_player_id: testPlayerId,
            p_visit_id: testVisitId,
            p_amount: 100.0,
            p_direction: 'in',
            p_source: 'table',
            p_created_by_staff_id: testPitBossStaffId,
            p_tender_type: 'cash',
          }),
          supabase.rpc('rpc_create_financial_txn', {
            p_casino_id: casino2!.id,
            p_player_id: player2!.id,
            p_visit_id: visit2!.id,
            p_amount: 200.0,
            p_direction: 'in',
            p_source: 'table',
            p_created_by_staff_id: staff2!.id,
            p_tender_type: 'chips',
          }),
        ]);

        expect(result1.error).toBeNull();
        expect(result2.error).toBeNull();
        expect(result1.data?.casino_id).toBe(testCasinoId);
        expect(result2.data?.casino_id).toBe(casino2!.id);
        expect(result1.data?.created_by_staff_id).toBe(testPitBossStaffId);
        expect(result2.data?.created_by_staff_id).toBe(staff2!.id);
      } finally {
        // Cleanup
        await supabase
          .from('player_financial_transaction')
          .delete()
          .eq('casino_id', casino2!.id);
        await supabase.from('visit').delete().eq('id', visit2!.id);
        await supabase
          .from('player_casino')
          .delete()
          .eq('player_id', player2!.id);
        await supabase.from('player').delete().eq('id', player2!.id);
        await supabase.from('staff').delete().eq('id', staff2!.id);
        await supabase
          .from('casino_settings')
          .delete()
          .eq('casino_id', casino2!.id);
        await supabase.from('casino').delete().eq('id', casino2!.id);
        await supabase.auth.admin.deleteUser(user2!.user!.id);
      }
    });
  });

  // ===========================================================================
  // 6. Error Message Clarity Tests
  // ===========================================================================

  describe('Error Message Clarity', () => {
    it('should provide clear error message for direction constraint', async () => {
      const { error } = await supabase.rpc('rpc_create_financial_txn', {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_amount: 500.0,
        p_direction: 'out',
        p_source: 'table',
        p_created_by_staff_id: testPitBossStaffId,
        p_tender_type: 'cash',
      });

      expect(error).not.toBeNull();
      expect(error?.message).toContain('pit_boss');
      expect(error?.message).toContain('buy-in');
      expect(error?.message).toContain('direction=in');
    });

    it('should provide clear error message for tender_type constraint', async () => {
      const { error } = await supabase.rpc('rpc_create_financial_txn', {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_amount: 5000.0,
        p_direction: 'in',
        p_source: 'table',
        p_created_by_staff_id: testPitBossStaffId,
        p_tender_type: 'marker',
      });

      expect(error).not.toBeNull();
      expect(error?.message).toContain('pit_boss');
      expect(error?.message).toContain('cash');
      expect(error?.message).toContain('chips');
    });
  });
});
