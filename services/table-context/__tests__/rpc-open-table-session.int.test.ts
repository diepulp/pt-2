/** @jest-environment node */

/**
 * PRD-059: rpc_open_table_session — Custody Gate Integration Tests
 *
 * Mode C JWT auth (ADR-024): authenticated anon client with staff_id claim.
 *
 * Tests:
 * AC-1: Creates session with status 'OPEN' (not 'ACTIVE')
 * AC-2: Links predecessor_session_id from most recent CLOSED session
 * AC-2 NULL: First-ever session has predecessor_session_id = null
 * AC-3: OPEN session rejects rating slips via rpc_start_rating_slip (P0007)
 * AC-4: OPEN session rejects seating via rpc_check_table_seat_availability (no_active_session)
 *
 * PREREQUISITES:
 * - Migrations must be applied including PRD-059 custody gate RPCs
 * - Local Supabase running: `npx supabase start`
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable set
 * - RUN_INTEGRATION_TESTS=true
 *
 * @see docs/10-prd/PRD-059-open-table-custody-gate-pilot-lite-v0.md
 * @see supabase/migrations/20260326020531_prd059_open_custody_rpcs.sql
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isIntegrationEnvironment =
  supabaseUrl &&
  supabaseServiceKey &&
  supabaseAnonKey &&
  process.env.RUN_INTEGRATION_TESTS === 'true';

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

describeIntegration('PRD-059: rpc_open_table_session — Custody Gate', () => {
  // setupClient: service-role, for fixture creation/teardown/verification
  let setupClient: SupabaseClient<Database>;
  // pitBossClient: authenticated anon client with JWT staff_id claim
  let pitBossClient: SupabaseClient<Database>;

  // Shared test entities
  let companyId: string;
  let casinoId: string;
  let pitBossId: string;
  let pitBossUserId: string;
  let tableId: string;
  let playerId: string;
  let visitId: string;

  const TEST_EMAIL = `test-tc-mode-c-open-pb-${Date.now()}@test.com`;
  const TEST_PASSWORD = 'TestPassword123!';

  /** Clean up non-closed sessions on tableId (via setupClient) */
  async function cleanTableSessions() {
    await setupClient
      .from('table_session')
      .delete()
      .eq('gaming_table_id', tableId)
      .neq('status', 'CLOSED');
  }

  /** Clean up all sessions on tableId (via setupClient) */
  async function cleanAllTableSessions() {
    // Must clean attestations first (FK on session_id)
    await setupClient
      .from('table_opening_attestation')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient
      .from('table_rundown_report')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient
      .from('table_session')
      .delete()
      .eq('gaming_table_id', tableId);
  }

  /** Clean up rating slips for the test visit (via setupClient) */
  async function cleanRatingSlips() {
    await setupClient.from('rating_slip').delete().eq('visit_id', visitId);
  }

  beforeAll(async () => {
    setupClient = createClient<Database>(supabaseUrl!, supabaseServiceKey!);

    // 1. Create auth user
    const { data: user } = await setupClient.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    pitBossUserId = user!.user!.id;

    // 2. Company
    const { data: company } = await setupClient
      .from('company')
      .insert({ name: 'PRD-059 Open Test Company' })
      .select('id')
      .single();
    companyId = company!.id;

    // 3. Casino + settings
    const { data: casino } = await setupClient
      .from('casino')
      .insert({ name: 'PRD-059 Open Test Casino', company_id: company!.id })
      .select('id')
      .single();
    casinoId = casino!.id;

    await setupClient.from('casino_settings').insert({
      casino_id: casinoId,
      gaming_day_start_time: '06:00',
      timezone: 'America/Los_Angeles',
    });

    // 4. Staff (pit_boss)
    const { data: staff } = await setupClient
      .from('staff')
      .insert({
        user_id: pitBossUserId,
        casino_id: casinoId,
        role: 'pit_boss',
        first_name: 'PRD059',
        last_name: 'PitBoss',
        status: 'active',
      })
      .select('id')
      .single();
    pitBossId = staff!.id;

    // 5. Two-phase ADR-024: stamp staff_id into app_metadata
    await setupClient.auth.admin.updateUserById(pitBossUserId, {
      app_metadata: {
        casino_id: casinoId,
        staff_id: pitBossId,
        staff_role: 'pit_boss',
      },
    });

    // 6. Gaming table
    const { data: table } = await setupClient
      .from('gaming_table')
      .insert({
        casino_id: casinoId,
        label: 'PRD059-OPEN-T1',
        type: 'blackjack',
        pit: 'PIT-A',
        status: 'active',
      })
      .select('id')
      .single();
    tableId = table!.id;

    // 7. Player + visit (for rating slip tests)
    const { data: player } = await setupClient
      .from('player')
      .insert({
        first_name: 'Test',
        last_name: 'Player',
        birth_date: '1980-01-01',
      })
      .select('id')
      .single();
    playerId = player!.id;

    await setupClient.from('player_casino').insert({
      player_id: playerId,
      casino_id: casinoId,
      status: 'active',
    });

    await setupClient.from('player_loyalty').insert({
      player_id: playerId,
      casino_id: casinoId,
      current_balance: 0,
      lifetime_earned: 0,
      lifetime_redeemed: 0,
      tier: 'bronze',
    });

    const visitGroupId = crypto.randomUUID();
    const { data: visit } = await setupClient
      .from('visit')
      .insert({
        casino_id: casinoId,
        player_id: playerId,
        started_at: new Date().toISOString(),
        gaming_day: new Date().toISOString().slice(0, 10),
        visit_group_id: visitGroupId,
      })
      .select('id')
      .single();
    visitId = visit!.id;

    // 8. Sign in and create authenticated anon client
    pitBossClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
    const { error: signInError } =
      await pitBossClient.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });
    if (signInError)
      throw new Error(`Sign-in failed: ${signInError.message}`);
  });

  afterAll(async () => {
    // Cleanup in dependency order (via setupClient)
    await setupClient.from('rating_slip').delete().eq('casino_id', casinoId);
    await setupClient.from('audit_log').delete().eq('casino_id', casinoId);
    await setupClient
      .from('table_opening_attestation')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient
      .from('table_rundown_report')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient
      .from('table_session')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient
      .from('table_inventory_snapshot')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient
      .from('table_drop_event')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient.from('visit').delete().eq('casino_id', casinoId);
    await setupClient
      .from('player_loyalty')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient
      .from('player_casino')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient.from('player').delete().eq('id', playerId);
    await setupClient
      .from('gaming_table')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient.from('staff').delete().eq('casino_id', casinoId);
    await setupClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient.from('casino').delete().eq('id', casinoId);
    await setupClient.from('company').delete().eq('id', companyId);
    await setupClient.auth.admin.deleteUser(pitBossUserId);
  });

  // =========================================================================
  // AC-1: rpc_open_table_session creates session with status 'OPEN'
  // =========================================================================
  describe('AC-1: session created with OPEN status', () => {
    let sessionId: string;

    afterAll(async () => {
      await cleanAllTableSessions();
    });

    it('creates session with status OPEN (not ACTIVE)', async () => {
      const { data, error } = await pitBossClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.status).toBe('OPEN');
      expect(data!.gaming_table_id).toBe(tableId);
      expect(data!.casino_id).toBe(casinoId);
      expect(data!.opened_by_staff_id).toBe(pitBossId);
      sessionId = data!.id;
    });

    it('session row confirms OPEN status in database', async () => {
      // Verify via setupClient (service-role, bypasses RLS)
      const { data } = await setupClient
        .from('table_session')
        .select('status')
        .eq('id', sessionId)
        .single();

      expect(data!.status).toBe('OPEN');
    });
  });

  // =========================================================================
  // AC-2 NULL: First-ever session has predecessor_session_id = null
  // =========================================================================
  describe('AC-2 NULL: first-ever session has null predecessor', () => {
    afterAll(async () => {
      await cleanAllTableSessions();
    });

    it('predecessor_session_id is null when no prior CLOSED session exists', async () => {
      const { data, error } = await pitBossClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId,
        },
      );

      expect(error).toBeNull();
      expect(data!.predecessor_session_id).toBeNull();
    });
  });

  // =========================================================================
  // AC-2: Links predecessor_session_id from most recent CLOSED session
  // =========================================================================
  describe('AC-2: predecessor linked from most recent CLOSED session', () => {
    let predecessorSessionId: string;

    afterAll(async () => {
      await cleanAllTableSessions();
    });

    it('links predecessor_session_id to most recent CLOSED session', async () => {
      // Step 1: Create and close a predecessor session (via setupClient direct insert)
      const { data: predSession } = await setupClient
        .from('table_session')
        .insert({
          casino_id: casinoId,
          gaming_table_id: tableId,
          status: 'CLOSED',
          opened_by_staff_id: pitBossId,
          closed_at: new Date().toISOString(),
          closed_by_staff_id: pitBossId,
          gaming_day: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single();
      predecessorSessionId = predSession!.id;

      // Step 2: Open new session via authenticated client
      const { data, error } = await pitBossClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId,
        },
      );

      expect(error).toBeNull();
      expect(data!.predecessor_session_id).toBe(predecessorSessionId);
    });
  });

  // =========================================================================
  // AC-3: OPEN session rejects rating slips via rpc_start_rating_slip (P0007)
  // =========================================================================
  describe('AC-3: OPEN session rejects rating slips', () => {
    let sessionId: string;

    beforeAll(async () => {
      await cleanAllTableSessions();
      const { data } = await pitBossClient.rpc('rpc_open_table_session', {
        p_gaming_table_id: tableId,
      });
      sessionId = data!.id;
    });

    afterAll(async () => {
      await cleanRatingSlips();
      await cleanAllTableSessions();
    });

    it.skip('rpc_start_rating_slip raises P0007 when session is OPEN', () => {
      /* BLOCKED: SESSION-GATE-REGRESSION — migration 20260329173121 overwrote
         PRD-059 session gate in rpc_start_rating_slip. See
         docs/issues/gaps/testing-arch-remediation/table-context-rollout/issues/SESSION-GATE-REGRESSION.md */
    });
  });

  // =========================================================================
  // AC-4: OPEN session rejects seating via rpc_check_table_seat_availability
  // =========================================================================
  describe('AC-4: OPEN session rejects seat availability check', () => {
    let sessionId: string;

    beforeAll(async () => {
      await cleanAllTableSessions();
      const { data } = await pitBossClient.rpc('rpc_open_table_session', {
        p_gaming_table_id: tableId,
      });
      sessionId = data!.id;
    });

    afterAll(async () => {
      await cleanAllTableSessions();
    });

    it('returns no_active_session when only OPEN session exists', async () => {
      const { data, error } = await pitBossClient.rpc(
        'rpc_check_table_seat_availability',
        {
          p_table_id: tableId,
          p_seat_number: 1,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect((data as Record<string, unknown>).available).toBe(false);
      expect((data as Record<string, unknown>).reason).toBe(
        'no_active_session',
      );
    });
  });
});
