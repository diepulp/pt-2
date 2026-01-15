/**
 * Finance-to-Telemetry Bridge Integration Tests
 *
 * Integration tests for the automatic bridge from player_financial_transaction
 * to table_buyin_telemetry.
 *
 * Tests validate:
 * - Automatic bridge trigger fires on rated buy-in insert
 * - Guardrails G1-G5 per GAP_ANALYSIS v0.4.0
 * - Idempotency via 'pft:{id}' key
 * - Source dimension tracking ('finance_bridge' vs 'manual_ops')
 *
 * PREREQUISITES:
 * - Migrations applied including:
 *   - table_buyin_telemetry_source_column.sql
 *   - fn_bridge_finance_to_telemetry.sql
 *   - trg_bridge_finance_to_telemetry.sql
 *   - rpc_log_table_buyin_telemetry_source.sql
 * - Local Supabase running: `npx supabase start`
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 *
 * @see GAP_ANALYSIS_TABLE_RUNDOWN_INTEGRATION_REWRITE_v0.4.0.md
 * @see EXECUTION-SPEC-GAP-TBL-RUNDOWN_PATCHED_v0.2.0.md WS5
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Skip integration tests if environment not configured
const isIntegrationEnvironment =
  supabaseUrl &&
  supabaseServiceKey &&
  process.env.RUN_INTEGRATION_TESTS === 'true';

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

describeIntegration('Finance-to-Telemetry Bridge Integration Tests', () => {
  let serviceClient: SupabaseClient<Database>;

  // Test data IDs
  let casinoId: string;
  let pitBossId: string;
  let cashierId: string;
  let userId: string;
  let userId2: string;
  let tableId: string;
  let playerId: string;
  let visitId: string;
  let ratingSlipId: string;

  beforeAll(async () => {
    // Create service client (bypasses RLS)
    serviceClient = createClient<Database>(supabaseUrl!, supabaseServiceKey!);

    // Create test users
    const { data: userData } = await serviceClient.auth.admin.createUser({
      email: `test-pit-boss-bridge-${Date.now()}@example.com`,
      password: 'test-password',
      email_confirm: true,
    });
    if (!userData?.user) throw new Error('Failed to create test user');
    userId = userData.user.id;

    const { data: userData2 } = await serviceClient.auth.admin.createUser({
      email: `test-cashier-bridge-${Date.now()}@example.com`,
      password: 'test-password',
      email_confirm: true,
    });
    if (!userData2?.user) throw new Error('Failed to create test user 2');
    userId2 = userData2.user.id;

    // Create test casino with settings
    const { data: casino } = await serviceClient
      .from('casino')
      .insert({ name: 'Bridge Test Casino' })
      .select('id')
      .single();
    casinoId = casino!.id;

    // Create casino_settings (required for compute_gaming_day)
    await serviceClient.from('casino_settings').insert({
      casino_id: casinoId,
      gaming_day_start_time: '06:00',
      timezone: 'America/Los_Angeles',
    });

    // Create test staff (pit boss)
    const { data: pitBoss } = await serviceClient
      .from('staff')
      .insert({
        user_id: userId,
        casino_id: casinoId,
        role: 'pit_boss',
        name: 'Bridge Test Pit Boss',
        status: 'active',
      })
      .select('id')
      .single();
    pitBossId = pitBoss!.id;

    // Create test staff (cashier)
    const { data: cashier } = await serviceClient
      .from('staff')
      .insert({
        user_id: userId2,
        casino_id: casinoId,
        role: 'cashier',
        name: 'Bridge Test Cashier',
        status: 'active',
      })
      .select('id')
      .single();
    cashierId = cashier!.id;

    // Create test table
    const { data: table } = await serviceClient
      .from('gaming_table')
      .insert({
        casino_id: casinoId,
        label: 'BJ-BRIDGE-01',
        type: 'blackjack',
        pit: 'PIT-BRIDGE',
        status: 'active',
      })
      .select('id')
      .single();
    tableId = table!.id;

    // Create test player
    const { data: player } = await serviceClient
      .from('player')
      .insert({
        first_name: 'Bridge',
        last_name: 'TestPlayer',
        birth_date: '1985-03-15',
      })
      .select('id')
      .single();
    playerId = player!.id;

    await serviceClient.from('player_casino').insert({
      player_id: playerId,
      casino_id: casinoId,
      status: 'active',
      enrolled_by: pitBossId,
    });

    // Create test visit
    const { data: visit } = await serviceClient
      .from('visit')
      .insert({
        player_id: playerId,
        casino_id: casinoId,
        started_by: pitBossId,
      })
      .select('id')
      .single();
    visitId = visit!.id;

    // Create test rating slip
    const { data: ratingSlip } = await serviceClient
      .from('rating_slip')
      .insert({
        visit_id: visitId,
        table_id: tableId,
        casino_id: casinoId,
        status: 'active',
      })
      .select('id')
      .single();
    ratingSlipId = ratingSlip!.id;
  });

  afterAll(async () => {
    // Cleanup test data in reverse order of dependencies
    await serviceClient
      .from('table_buyin_telemetry')
      .delete()
      .eq('casino_id', casinoId);
    await serviceClient
      .from('player_financial_transaction')
      .delete()
      .eq('casino_id', casinoId);
    await serviceClient.from('rating_slip').delete().eq('id', ratingSlipId);
    await serviceClient.from('visit').delete().eq('id', visitId);
    await serviceClient.from('player_casino').delete().eq('casino_id', casinoId);
    await serviceClient.from('player').delete().eq('id', playerId);
    await serviceClient.from('gaming_table').delete().eq('casino_id', casinoId);
    await serviceClient.from('staff').delete().eq('casino_id', casinoId);
    await serviceClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', casinoId);
    await serviceClient.from('casino').delete().eq('id', casinoId);
    await serviceClient.auth.admin.deleteUser(userId);
    await serviceClient.auth.admin.deleteUser(userId2);
  });

  describe('Automatic Bridge Trigger', () => {
    it('creates telemetry row when rated buy-in is inserted via Finance RPC', async () => {
      // Insert finance row via RPC (which sets context properly)
      const { data: financeRow, error: financeError } = await serviceClient.rpc(
        'rpc_create_financial_txn',
        {
          p_casino_id: casinoId,
          p_player_id: playerId,
          p_visit_id: visitId,
          p_amount: 500, // $500 (dollars)
          p_direction: 'in',
          p_source: 'pit',
          p_created_by_staff_id: pitBossId,
          p_tender_type: 'cash',
          p_rating_slip_id: ratingSlipId,
          p_idempotency_key: `bridge-test-1-${Date.now()}`,
        }
      );

      expect(financeError).toBeNull();
      expect(financeRow).toBeDefined();

      // Wait a moment for trigger to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that telemetry row was created automatically
      const { data: telemetryRows, error: telemetryError } = await serviceClient
        .from('table_buyin_telemetry')
        .select('*')
        .eq('idempotency_key', `pft:${financeRow.id}`);

      expect(telemetryError).toBeNull();
      expect(telemetryRows).toBeDefined();
      expect(telemetryRows!.length).toBe(1);

      const telemetry = telemetryRows![0];
      expect(telemetry.casino_id).toBe(casinoId);
      expect(telemetry.table_id).toBe(tableId);
      expect(telemetry.visit_id).toBe(visitId);
      expect(telemetry.rating_slip_id).toBe(ratingSlipId);
      expect(telemetry.amount_cents).toBe(50000); // 500 * 100
      expect(telemetry.telemetry_kind).toBe('RATED_BUYIN');
      expect(telemetry.source).toBe('finance_bridge');
    });

    it('does not create telemetry for unrated buy-in (no rating_slip_id)', async () => {
      // Insert finance row without rating_slip_id
      const { data: financeRow, error: financeError } = await serviceClient.rpc(
        'rpc_create_financial_txn',
        {
          p_casino_id: casinoId,
          p_player_id: playerId,
          p_visit_id: visitId,
          p_amount: 200, // $200
          p_direction: 'in',
          p_source: 'cage',
          p_created_by_staff_id: cashierId,
          p_tender_type: 'cash',
          // No rating_slip_id
          p_idempotency_key: `bridge-test-unrated-${Date.now()}`,
        }
      );

      expect(financeError).toBeNull();
      expect(financeRow).toBeDefined();

      // Wait a moment for potential trigger
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that NO telemetry row was created
      const { data: telemetryRows } = await serviceClient
        .from('table_buyin_telemetry')
        .select('*')
        .eq('idempotency_key', `pft:${financeRow.id}`);

      expect(telemetryRows).toBeDefined();
      expect(telemetryRows!.length).toBe(0);
    });

    it('does not create telemetry for cash-out (direction=out)', async () => {
      // Insert cash-out finance row with rating_slip_id (but should still not trigger)
      const { data: financeRow, error: financeError } = await serviceClient.rpc(
        'rpc_create_financial_txn',
        {
          p_casino_id: casinoId,
          p_player_id: playerId,
          p_visit_id: visitId,
          p_amount: 300, // $300
          p_direction: 'out', // Cash-out
          p_source: 'cage',
          p_created_by_staff_id: cashierId,
          p_tender_type: 'cash',
          p_rating_slip_id: ratingSlipId,
          p_idempotency_key: `bridge-test-cashout-${Date.now()}`,
        }
      );

      expect(financeError).toBeNull();
      expect(financeRow).toBeDefined();

      // Wait a moment for potential trigger
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that NO telemetry row was created
      const { data: telemetryRows } = await serviceClient
        .from('table_buyin_telemetry')
        .select('*')
        .eq('idempotency_key', `pft:${financeRow.id}`);

      expect(telemetryRows).toBeDefined();
      expect(telemetryRows!.length).toBe(0);
    });
  });

  describe('Idempotency (G5)', () => {
    it('does not create duplicate telemetry for same finance row', async () => {
      const idempotencyKey = `bridge-idem-${Date.now()}`;

      // First insert
      const { data: financeRow1 } = await serviceClient.rpc(
        'rpc_create_financial_txn',
        {
          p_casino_id: casinoId,
          p_player_id: playerId,
          p_visit_id: visitId,
          p_amount: 100,
          p_direction: 'in',
          p_source: 'pit',
          p_created_by_staff_id: pitBossId,
          p_tender_type: 'cash',
          p_rating_slip_id: ratingSlipId,
          p_idempotency_key: idempotencyKey,
        }
      );

      // Wait for trigger
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second insert with same idempotency key (finance RPC returns existing)
      const { data: financeRow2 } = await serviceClient.rpc(
        'rpc_create_financial_txn',
        {
          p_casino_id: casinoId,
          p_player_id: playerId,
          p_visit_id: visitId,
          p_amount: 100,
          p_direction: 'in',
          p_source: 'pit',
          p_created_by_staff_id: pitBossId,
          p_tender_type: 'cash',
          p_rating_slip_id: ratingSlipId,
          p_idempotency_key: idempotencyKey,
        }
      );

      // Finance RPC should return same row (idempotent)
      expect(financeRow1!.id).toBe(financeRow2!.id);

      // Wait for potential second trigger
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that only ONE telemetry row exists
      const { data: telemetryRows } = await serviceClient
        .from('table_buyin_telemetry')
        .select('*')
        .eq('idempotency_key', `pft:${financeRow1!.id}`);

      expect(telemetryRows!.length).toBe(1);
    });
  });

  describe('Manual Telemetry with Source Parameter', () => {
    it('logs telemetry with source=manual_ops by default', async () => {
      const { data, error } = await serviceClient.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId,
          p_amount_cents: 2500,
          p_telemetry_kind: 'GRIND_BUYIN',
          p_actor_id: pitBossId,
          // No p_source specified - should default to 'manual_ops'
        }
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.source).toBe('manual_ops');
    });

    it('allows explicit source=manual_ops', async () => {
      const { data, error } = await serviceClient.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId,
          p_amount_cents: 3500,
          p_telemetry_kind: 'GRIND_BUYIN',
          p_actor_id: pitBossId,
          p_source: 'manual_ops',
        }
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.source).toBe('manual_ops');
    });

    it('rejects invalid source value', async () => {
      const { error } = await serviceClient.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId,
          p_amount_cents: 1000,
          p_telemetry_kind: 'GRIND_BUYIN',
          p_actor_id: pitBossId,
          p_source: 'invalid_source',
        }
      );

      expect(error).not.toBeNull();
      expect(error!.message).toContain(
        'source must be finance_bridge or manual_ops'
      );
    });

    it('logs rated sub-threshold buy-in via manual path', async () => {
      // Manual telemetry for rated sub-threshold buy-in
      // (too small for Finance, but still want telemetry)
      const { data, error } = await serviceClient.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId,
          p_amount_cents: 2500, // $25 - sub-threshold
          p_telemetry_kind: 'RATED_BUYIN',
          p_visit_id: visitId,
          p_rating_slip_id: ratingSlipId,
          p_tender_type: 'cash',
          p_actor_id: pitBossId,
          p_source: 'manual_ops',
        }
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.telemetry_kind).toBe('RATED_BUYIN');
      expect(data.source).toBe('manual_ops');
      expect(data.amount_cents).toBe(2500);
    });
  });

  describe('Source Column Distinguishes Provenance', () => {
    it('finance_bridge rows come from Finance trigger', async () => {
      // Get all finance_bridge telemetry
      const { data } = await serviceClient
        .from('table_buyin_telemetry')
        .select('*')
        .eq('casino_id', casinoId)
        .eq('source', 'finance_bridge');

      // Should have at least the row from first automatic bridge test
      expect(data).toBeDefined();
      expect(data!.length).toBeGreaterThanOrEqual(1);

      // All finance_bridge rows should be RATED_BUYIN
      for (const row of data!) {
        expect(row.telemetry_kind).toBe('RATED_BUYIN');
        expect(row.idempotency_key).toMatch(/^pft:/);
      }
    });

    it('manual_ops rows come from RPC', async () => {
      // Get all manual_ops telemetry
      const { data } = await serviceClient
        .from('table_buyin_telemetry')
        .select('*')
        .eq('casino_id', casinoId)
        .eq('source', 'manual_ops');

      // Should have rows from manual telemetry tests
      expect(data).toBeDefined();
      expect(data!.length).toBeGreaterThanOrEqual(1);

      // manual_ops rows can be either RATED_BUYIN or GRIND_BUYIN
      // They should NOT have 'pft:' idempotency key prefix
      for (const row of data!) {
        if (row.idempotency_key) {
          expect(row.idempotency_key).not.toMatch(/^pft:/);
        }
      }
    });
  });

  describe('Amount Conversion (Dollars to Cents)', () => {
    it('correctly converts Finance amount (dollars) to telemetry amount_cents', async () => {
      const testAmountDollars = 123.45;

      const { data: financeRow } = await serviceClient.rpc(
        'rpc_create_financial_txn',
        {
          p_casino_id: casinoId,
          p_player_id: playerId,
          p_visit_id: visitId,
          p_amount: testAmountDollars,
          p_direction: 'in',
          p_source: 'pit',
          p_created_by_staff_id: pitBossId,
          p_tender_type: 'cash',
          p_rating_slip_id: ratingSlipId,
          p_idempotency_key: `bridge-amount-${Date.now()}`,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      const { data: telemetryRows } = await serviceClient
        .from('table_buyin_telemetry')
        .select('*')
        .eq('idempotency_key', `pft:${financeRow!.id}`);

      expect(telemetryRows).toBeDefined();
      expect(telemetryRows!.length).toBe(1);

      // Amount should be 123.45 * 100 = 12345 cents
      expect(telemetryRows![0].amount_cents).toBe(12345);
    });
  });
});
