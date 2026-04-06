/** @jest-environment node */

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
 * Auth model: ADR-024 Mode C — authenticated anon client carries JWT with
 * staff_id in app_metadata; set_rls_context_from_staff() derives context
 * server-side. RPCs called without p_internal_actor_id.
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
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable set
 *
 * @see GAP_ANALYSIS_TABLE_RUNDOWN_INTEGRATION_REWRITE_v0.4.0.md
 * @see EXECUTION-SPEC-GAP-TBL-RUNDOWN_PATCHED_v0.2.0.md WS5
 * @see ADR-024 (authoritative context derivation)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Skip integration tests if environment not configured
const isIntegrationEnvironment =
  supabaseUrl &&
  SERVICE_ROLE_KEY &&
  ANON_KEY &&
  (process.env.RUN_INTEGRATION_TESTS === 'true' ||
    process.env.RUN_INTEGRATION_TESTS === '1');

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

describeIntegration('Finance-to-Telemetry Bridge Integration Tests', () => {
  // setupClient: service-role, used only for fixture management (bypasses RLS)
  let setupClient: SupabaseClient<Database>;
  // Mode C authenticated anon client for business operations (ADR-024)
  let authedClient: SupabaseClient<Database>;

  // Test data IDs
  let companyId: string;
  let casinoId: string;
  let pitBossId: string;
  let pitBossUserId: string;
  let cashierUserId: string;
  let tableId: string;
  let playerId: string;
  let visitId: string;
  let ratingSlipId: string;

  const pitBossEmail = `test-root-t3-ftb-pitboss-${Date.now()}@example.com`;
  const cashierEmail = `test-root-t3-ftb-cashier-${Date.now()}@example.com`;
  const testPassword = 'test-password';

  beforeAll(async () => {
    // === FIXTURE SETUP (service-role) ===
    setupClient = createClient<Database>(supabaseUrl, SERVICE_ROLE_KEY);

    // 1. Create auth users WITHOUT staff_id (two-phase ADR-024 setup)
    const { data: pitBossUser, error: pitBossUserError } =
      await setupClient.auth.admin.createUser({
        email: pitBossEmail,
        password: testPassword,
        email_confirm: true,
        app_metadata: { staff_role: 'pit_boss' },
      });
    if (pitBossUserError) throw pitBossUserError;
    pitBossUserId = pitBossUser.user.id;

    const { data: cashierUser, error: cashierUserError } =
      await setupClient.auth.admin.createUser({
        email: cashierEmail,
        password: testPassword,
        email_confirm: true,
        app_metadata: { staff_role: 'cashier' },
      });
    if (cashierUserError) throw cashierUserError;
    cashierUserId = cashierUser.user.id;

    // 2. Create test company (ADR-043: company before casino)
    const { data: company, error: companyError } = await setupClient
      .from('company')
      .insert({ name: 'Bridge Test Company' })
      .select('id')
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    // 3. Create test casino with company_id
    const { data: casino, error: casinoError } = await setupClient
      .from('casino')
      .insert({ name: 'Bridge Test Casino', company_id: companyId })
      .select('id')
      .single();
    if (casinoError) throw casinoError;
    casinoId = casino.id;

    // Create casino_settings (required for compute_gaming_day)
    const { error: settingsError } = await setupClient
      .from('casino_settings')
      .insert({
        casino_id: casinoId,
        gaming_day_start_time: '06:00',
        timezone: 'America/Los_Angeles',
      });
    if (settingsError) throw settingsError;

    // 4. Create test staff records
    const { data: pitBoss, error: pitBossError } = await setupClient
      .from('staff')
      .insert({
        user_id: pitBossUserId,
        casino_id: casinoId,
        role: 'pit_boss',
        first_name: 'Bridge',
        last_name: 'Pit Boss',
        status: 'active',
      })
      .select('id')
      .single();
    if (pitBossError) throw pitBossError;
    pitBossId = pitBoss.id;

    const { error: cashierError } = await setupClient.from('staff').insert({
      user_id: cashierUserId,
      casino_id: casinoId,
      role: 'cashier',
      first_name: 'Bridge',
      last_name: 'Cashier',
      status: 'active',
    });
    if (cashierError) throw cashierError;

    // 5. Stamp staff_id into app_metadata (ADR-024 two-phase)
    await setupClient.auth.admin.updateUserById(pitBossUserId, {
      app_metadata: {
        staff_id: pitBossId,
        casino_id: casinoId,
        staff_role: 'pit_boss',
      },
    });

    // 6. Sign in via throwaway client to get JWT
    const throwaway = createClient<Database>(supabaseUrl, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: session, error: signInError } =
      await throwaway.auth.signInWithPassword({
        email: pitBossEmail,
        password: testPassword,
      });
    if (signInError || !session.session)
      throw signInError ?? new Error('Sign-in returned no session');

    // 7. Create Mode C authenticated anon client (ADR-024)
    authedClient = createClient<Database>(supabaseUrl, ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Create test table
    const { data: table, error: tableError } = await setupClient
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
    if (tableError) throw tableError;
    tableId = table.id;

    // Create test player
    const { data: player, error: playerError } = await setupClient
      .from('player')
      .insert({
        first_name: 'Bridge',
        last_name: 'TestPlayer',
        birth_date: '1985-03-15',
      })
      .select('id')
      .single();
    if (playerError) throw playerError;
    playerId = player.id;

    await setupClient.from('player_casino').insert({
      player_id: playerId,
      casino_id: casinoId,
      status: 'active',
      enrolled_by: pitBossId,
    });

    // Create test visit (ADR-026: gaming_day and visit_group_id required)
    const visitGroupId = crypto.randomUUID();
    const { data: visit, error: visitError } = await setupClient
      .from('visit')
      .insert({
        player_id: playerId,
        casino_id: casinoId,
        visit_kind: 'gaming_identified_rated',
        gaming_day: '2026-04-01',
        visit_group_id: visitGroupId,
      })
      .select('id')
      .single();
    if (visitError) throw visitError;
    visitId = visit.id;

    // Create test rating slip (accrual_kind='compliance_only' bypasses loyalty policy_snapshot constraint)
    const { data: ratingSlip, error: ratingSlipError } = await setupClient
      .from('rating_slip')
      .insert({
        visit_id: visitId,
        table_id: tableId,
        casino_id: casinoId,
        accrual_kind: 'compliance_only',
        status: 'open',
      })
      .select('id')
      .single();
    if (ratingSlipError) throw ratingSlipError;
    ratingSlipId = ratingSlip.id;
  });

  afterAll(async () => {
    // Cleanup test data in reverse order of dependencies
    await setupClient
      .from('table_buyin_telemetry')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient
      .from('player_financial_transaction')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient.from('rating_slip').delete().eq('id', ratingSlipId);
    await setupClient.from('visit').delete().eq('id', visitId);
    await setupClient.from('player_casino').delete().eq('casino_id', casinoId);
    await setupClient.from('player').delete().eq('id', playerId);
    await setupClient.from('gaming_table').delete().eq('casino_id', casinoId);
    await setupClient.from('staff').delete().eq('casino_id', casinoId);
    await setupClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient.from('casino').delete().eq('id', casinoId);
    await setupClient.from('company').delete().eq('id', companyId);
    await setupClient.auth.admin.deleteUser(pitBossUserId);
    await setupClient.auth.admin.deleteUser(cashierUserId);
  });

  describe('Automatic Bridge Trigger', () => {
    it('creates telemetry row when rated buy-in is inserted via Finance RPC', async () => {
      // Insert finance row via RPC — authedClient carries JWT with staff_id (Mode C)
      const { data: financeRow, error: financeError } = await authedClient.rpc(
        'rpc_create_financial_txn',
        {
          p_player_id: playerId,
          p_visit_id: visitId,
          p_amount: 500, // $500 (dollars)
          p_direction: 'in',
          p_source: 'pit',

          p_tender_type: 'cash',
          p_rating_slip_id: ratingSlipId,
          p_idempotency_key: `bridge-test-1-${Date.now()}`,
        },
      );

      expect(financeError).toBeNull();
      expect(financeRow).toBeDefined();

      // Wait a moment for trigger to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that telemetry row was created automatically
      const { data: telemetryRows, error: telemetryError } = await setupClient
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
      const { data: financeRow, error: financeError } = await authedClient.rpc(
        'rpc_create_financial_txn',
        {
          p_player_id: playerId,
          p_visit_id: visitId,
          p_amount: 200, // $200
          p_direction: 'in',
          p_source: 'cage',

          p_tender_type: 'cash',
          // No rating_slip_id
          p_idempotency_key: `bridge-test-unrated-${Date.now()}`,
        },
      );

      expect(financeError).toBeNull();
      expect(financeRow).toBeDefined();

      // Wait a moment for potential trigger
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that NO telemetry row was created
      const { data: telemetryRows } = await setupClient
        .from('table_buyin_telemetry')
        .select('*')
        .eq('idempotency_key', `pft:${financeRow.id}`);

      expect(telemetryRows).toBeDefined();
      expect(telemetryRows!.length).toBe(0);
    });

    it('does not create telemetry for cash-out (direction=out)', async () => {
      // Insert cash-out finance row with rating_slip_id (but should still not trigger)
      const { data: financeRow, error: financeError } = await authedClient.rpc(
        'rpc_create_financial_txn',
        {
          p_player_id: playerId,
          p_visit_id: visitId,
          p_amount: 300, // $300
          p_direction: 'out', // Cash-out
          p_source: 'cage',

          p_tender_type: 'cash',
          p_rating_slip_id: ratingSlipId,
          p_idempotency_key: `bridge-test-cashout-${Date.now()}`,
        },
      );

      expect(financeError).toBeNull();
      expect(financeRow).toBeDefined();

      // Wait a moment for potential trigger
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that NO telemetry row was created
      const { data: telemetryRows } = await setupClient
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
      const { data: financeRow1 } = await authedClient.rpc(
        'rpc_create_financial_txn',
        {
          p_player_id: playerId,
          p_visit_id: visitId,
          p_amount: 100,
          p_direction: 'in',
          p_source: 'pit',

          p_tender_type: 'cash',
          p_rating_slip_id: ratingSlipId,
          p_idempotency_key: idempotencyKey,
        },
      );

      // Wait for trigger
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second insert with same idempotency key (finance RPC returns existing)
      const { data: financeRow2 } = await authedClient.rpc(
        'rpc_create_financial_txn',
        {
          p_player_id: playerId,
          p_visit_id: visitId,
          p_amount: 100,
          p_direction: 'in',
          p_source: 'pit',

          p_tender_type: 'cash',
          p_rating_slip_id: ratingSlipId,
          p_idempotency_key: idempotencyKey,
        },
      );

      // Finance RPC should return same row (idempotent)
      expect(financeRow1!.id).toBe(financeRow2!.id);

      // Wait for potential second trigger
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that only ONE telemetry row exists
      const { data: telemetryRows } = await setupClient
        .from('table_buyin_telemetry')
        .select('*')
        .eq('idempotency_key', `pft:${financeRow1!.id}`);

      expect(telemetryRows!.length).toBe(1);
    });
  });

  describe('Manual Telemetry with Source Parameter', () => {
    it('logs telemetry with source=manual_ops by default', async () => {
      const { data, error } = await authedClient.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId,
          p_amount_cents: 2500,
          p_telemetry_kind: 'GRIND_BUYIN',
          // No p_source specified - should default to 'manual_ops'
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.source).toBe('manual_ops');
    });

    it('allows explicit source=manual_ops', async () => {
      const { data, error } = await authedClient.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId,
          p_amount_cents: 3500,
          p_telemetry_kind: 'GRIND_BUYIN',
          p_source: 'manual_ops',
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.source).toBe('manual_ops');
    });

    it('rejects invalid source value', async () => {
      const { error } = await authedClient.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId,
          p_amount_cents: 1000,
          p_telemetry_kind: 'GRIND_BUYIN',
          p_source: 'invalid_source',
        },
      );

      expect(error).not.toBeNull();
      expect(error!.message).toContain(
        'source must be finance_bridge or manual_ops',
      );
    });

    it('logs rated sub-threshold buy-in via manual path', async () => {
      // Manual telemetry for rated sub-threshold buy-in
      // (too small for Finance, but still want telemetry)
      const { data, error } = await authedClient.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId,
          p_amount_cents: 2500, // $25 - sub-threshold
          p_telemetry_kind: 'RATED_BUYIN',
          p_visit_id: visitId,
          p_rating_slip_id: ratingSlipId,
          p_tender_type: 'cash',
          p_source: 'manual_ops',
        },
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
      const { data } = await setupClient
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
      const { data } = await setupClient
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

      const { data: financeRow } = await authedClient.rpc(
        'rpc_create_financial_txn',
        {
          p_player_id: playerId,
          p_visit_id: visitId,
          p_amount: testAmountDollars,
          p_direction: 'in',
          p_source: 'pit',

          p_tender_type: 'cash',
          p_rating_slip_id: ratingSlipId,
          p_idempotency_key: `bridge-amount-${Date.now()}`,
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      const { data: telemetryRows } = await setupClient
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
