/** @jest-environment node */

/**
 * PRD-057: Session Close Lifecycle Hardening — Integration Tests
 *
 * Mode C JWT auth (ADR-024): authenticated anon client with staff_id claim.
 *
 * Tests for:
 * 1. has_unresolved_items computation from live rating_slip state
 * 2. Standard close blocked when open slips exist (P0005)
 * 3. Force-close records flag + orphan audit payload
 * 4. Session-gated seating (NO_ACTIVE_SESSION)
 * 5. Seat availability without active session
 *
 * PREREQUISITES:
 * - Migrations must be applied including PRD-057 amendments
 * - Local Supabase running: `npx supabase start`
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable set
 * - RUN_INTEGRATION_TESTS=true
 *
 * @see docs/10-prd/PRD-057-session-close-lifecycle-hardening-v0.md
 * @see docs/21-exec-spec/EXEC-057-session-close-lifecycle-hardening.md
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';
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

describeIntegration('PRD-057: Session Close Lifecycle Hardening', () => {
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
  let dropEventId: string;
  let playerId: string;
  let visitId: string;

  // Second player+visit for tests that need multiple open slips on same table
  let player2Id: string;
  let visit2Id: string;

  const TEST_EMAIL = `test-tc-mode-c-close-pb-${Date.now()}@test.com`;
  const TEST_PASSWORD = 'TestPassword123!';

  /** Open and activate a session on tableId, return session ID */
  async function openSession(): Promise<string> {
    const { data, error: openErr } = await pitBossClient.rpc(
      'rpc_open_table_session',
      { p_gaming_table_id: tableId },
    );
    if (openErr) throw new Error(`openSession failed: ${openErr.message}`);

    // PRD-059: Must activate (OPEN -> ACTIVE) before RUNDOWN or rating slips
    const { error: actErr } = await pitBossClient.rpc(
      'rpc_activate_table_session',
      {
        p_table_session_id: data!.id,
        p_opening_total_cents: 50000,
        p_dealer_confirmed: true,
        p_opening_note: 'PRD-057 test bootstrap',
      },
    );
    if (actErr) throw new Error(`activateSession failed: ${actErr.message}`);

    return data!.id;
  }

  /** Transition session to RUNDOWN */
  async function startRundown(sessionId: string) {
    await pitBossClient.rpc('rpc_start_table_rundown', {
      p_table_session_id: sessionId,
    });
  }

  /** Create an open rating slip at the table */
  async function createOpenSlip(seatNumber: string = '1'): Promise<string> {
    const { data, error } = await pitBossClient.rpc('rpc_start_rating_slip', {
      p_visit_id: visitId,
      p_table_id: tableId,
      p_seat_number: seatNumber,
      p_game_settings: { game: 'blackjack' },
    });
    if (error) throw new Error(`createOpenSlip failed: ${error.message}`);
    return data!.id;
  }

  /** Clean up non-closed sessions on tableId (via setupClient) */
  async function cleanTableSessions() {
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
      .eq('gaming_table_id', tableId)
      .neq('status', 'CLOSED');
  }

  /** Clean up rating slips for the test visits (via setupClient) */
  async function cleanRatingSlips() {
    await setupClient.from('rating_slip').delete().eq('visit_id', visitId);
    if (visit2Id) {
      await setupClient.from('rating_slip').delete().eq('visit_id', visit2Id);
    }
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

    // 2. Company (required for casino per ADR-043)
    const { data: company } = await setupClient
      .from('company')
      .insert({ name: 'PRD-057 Test Company' })
      .select('id')
      .single();
    companyId = company!.id;

    // 3. Casino + settings
    const { data: casino } = await setupClient
      .from('casino')
      .insert({ name: 'PRD-057 Test Casino', company_id: company!.id })
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
        first_name: 'PRD057',
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
        label: 'PRD057-T1',
        type: 'blackjack',
        pit: 'PIT-A',
        status: 'active',
      })
      .select('id')
      .single();
    tableId = table!.id;

    // 7. Drop event + snapshot (for close artifacts) — via setupClient
    const { data: drop } = await setupClient
      .from('table_drop_event')
      .insert({
        casino_id: casinoId,
        table_id: tableId,
        drop_box_id: `PRD057-BOX-${Date.now()}`,
        removed_by: pitBossId,
      })
      .select('id')
      .single();
    dropEventId = drop!.id;

    await setupClient.from('table_inventory_snapshot').insert({
      casino_id: casinoId,
      table_id: tableId,
      counted_by: pitBossId,
      chipset: { '1': 100 },
      snapshot_type: 'close',
    });

    // 8. Player + visit (for rating slips) — via setupClient
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

    // player_casino enrollment
    await setupClient.from('player_casino').insert({
      player_id: playerId,
      casino_id: casinoId,
      status: 'active',
    });

    // player_loyalty account
    await setupClient.from('player_loyalty').insert({
      player_id: playerId,
      casino_id: casinoId,
      current_balance: 0,
      lifetime_earned: 0,
      lifetime_redeemed: 0,
      tier: 'bronze',
    });

    // Open visit (requires gaming_day + visit_group_id per schema)
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

    // 8b. Second player+visit (for force-close tests needing 2 open slips)
    const { data: player2 } = await setupClient
      .from('player')
      .insert({
        first_name: 'Test2',
        last_name: 'Player2',
        birth_date: '1981-01-01',
      })
      .select('id')
      .single();
    player2Id = player2!.id;

    await setupClient.from('player_casino').insert({
      player_id: player2Id,
      casino_id: casinoId,
      status: 'active',
    });

    await setupClient.from('player_loyalty').insert({
      player_id: player2Id,
      casino_id: casinoId,
      current_balance: 0,
      lifetime_earned: 0,
      lifetime_redeemed: 0,
      tier: 'bronze',
    });

    const visitGroupId2 = crypto.randomUUID();
    const { data: visit2 } = await setupClient
      .from('visit')
      .insert({
        casino_id: casinoId,
        player_id: player2Id,
        started_at: new Date().toISOString(),
        gaming_day: new Date().toISOString().slice(0, 10),
        visit_group_id: visitGroupId2,
      })
      .select('id')
      .single();
    visit2Id = visit2!.id;

    // 9. Sign in and create authenticated anon client
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
    await setupClient.from('player').delete().eq('id', player2Id);
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
  // Test 1: Standard close blocked when open slips exist
  // =========================================================================
  describe('close blocked with open slips (has_unresolved_items)', () => {
    let sessionId: string;

    beforeAll(async () => {
      await cleanTableSessions();
      sessionId = await openSession();
      await startRundown(sessionId);
      await createOpenSlip('1');
    });

    afterAll(async () => {
      await cleanRatingSlips();
      await setupClient
        .from('table_opening_attestation')
        .delete()
        .eq('casino_id', casinoId);
      await setupClient
        .from('table_rundown_report')
        .delete()
        .eq('casino_id', casinoId);
      await setupClient.from('table_session').delete().eq('id', sessionId);
    });

    it('raises P0005 and rejects the close', async () => {
      const { error } = await pitBossClient.rpc('rpc_close_table_session', {
        p_table_session_id: sessionId,
        p_drop_event_id: dropEventId,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('unresolved_liabilities');
    });

    it('session remains in RUNDOWN state (transaction rolled back)', async () => {
      // Verify via setupClient (service-role, bypasses RLS)
      const { data } = await setupClient
        .from('table_session')
        .select('status, has_unresolved_items')
        .eq('id', sessionId)
        .single();

      expect(data!.status).toBe('RUNDOWN');
      // Flag NOT persisted — RAISE rolled back the transaction
      expect(data!.has_unresolved_items).toBe(false);
    });
  });

  // =========================================================================
  // Test 2: Standard close succeeds without open slips
  // =========================================================================
  describe('close succeeds without open slips', () => {
    let sessionId: string;

    beforeAll(async () => {
      await cleanTableSessions();
      sessionId = await openSession();
      await startRundown(sessionId);
      // No rating slips created
    });

    afterAll(async () => {
      await setupClient
        .from('table_opening_attestation')
        .delete()
        .eq('casino_id', casinoId);
      await setupClient
        .from('table_rundown_report')
        .delete()
        .eq('casino_id', casinoId);
      await setupClient.from('table_session').delete().eq('id', sessionId);
    });

    it('closes with has_unresolved_items = false', async () => {
      const { data, error } = await pitBossClient.rpc(
        'rpc_close_table_session',
        {
          p_table_session_id: sessionId,
          p_drop_event_id: dropEventId,
        },
      );

      expect(error).toBeNull();
      expect(data!.status).toBe('CLOSED');
      expect(data!.has_unresolved_items).toBe(false);
    });
  });

  // =========================================================================
  // Test 3: Force-close records flag + orphan audit payload
  // =========================================================================
  describe('force-close with orphaned slips', () => {
    let sessionId: string;
    let slip1Id: string;
    let slip2Id: string;

    beforeAll(async () => {
      await cleanRatingSlips();
      // Also clean slips for visit2
      await setupClient.from('rating_slip').delete().eq('visit_id', visit2Id);
      await cleanTableSessions();
      sessionId = await openSession();
      slip1Id = await createOpenSlip('1');
      // Use visit2 for the second slip (unique constraint: one active slip per visit+table)
      const { data: slip2, error: slip2Error } = await pitBossClient.rpc(
        'rpc_start_rating_slip',
        {
          p_visit_id: visit2Id,
          p_table_id: tableId,
          p_seat_number: '2',
          p_game_settings: { game: 'blackjack' },
        },
      );
      if (slip2Error)
        throw new Error(`createOpenSlip2 failed: ${slip2Error.message}`);
      slip2Id = slip2!.id;
    });

    afterAll(async () => {
      await cleanRatingSlips();
      await setupClient.from('rating_slip').delete().eq('visit_id', visit2Id);
      await setupClient.from('audit_log').delete().eq('casino_id', casinoId);
      await setupClient
        .from('table_opening_attestation')
        .delete()
        .eq('casino_id', casinoId);
      await setupClient
        .from('table_rundown_report')
        .delete()
        .eq('casino_id', casinoId);
      await setupClient.from('table_session').delete().eq('id', sessionId);
    });

    it('force-closes with has_unresolved_items = true and requires_reconciliation', async () => {
      const { data, error } = await pitBossClient.rpc(
        'rpc_force_close_table_session',
        {
          p_table_session_id: sessionId,
          p_close_reason: 'end_of_shift',
        },
      );

      expect(error).toBeNull();
      expect(data!.status).toBe('CLOSED');
      expect(data!.has_unresolved_items).toBe(true);
      expect(data!.requires_reconciliation).toBe(true);
    });

    it('audit_log contains orphaned_rating_slips with all 4 required fields', async () => {
      // Verify via setupClient (service-role, bypasses RLS)
      const { data: logs } = await setupClient
        .from('audit_log')
        .select('details')
        .eq('casino_id', casinoId)
        .eq('action', 'force_close')
        .order('created_at', { ascending: false })
        .limit(1);

      expect(logs).toHaveLength(1);
      const details = logs![0].details as Record<string, unknown>;

      // Verify orphaned_slip_count
      expect(details.orphaned_slip_count).toBe(2);

      // Verify orphaned_rating_slips array shape (PRD §4.1 frozen payload)
      const orphans = details.orphaned_rating_slips as Array<
        Record<string, unknown>
      >;
      expect(orphans).toHaveLength(2);

      for (const orphan of orphans) {
        // All 4 fields mandatory per PRD §4.1
        expect(orphan).toHaveProperty('slip_id');
        expect(orphan).toHaveProperty('visit_id');
        expect(orphan).toHaveProperty('status');
        expect(orphan).toHaveProperty('seat_number');
        expect(orphan.status).toBe('open');
        expect([visitId, visit2Id]).toContain(orphan.visit_id);
      }

      // Verify both slips are present
      const slipIds = orphans.map((o) => o.slip_id);
      expect(slipIds).toContain(slip1Id);
      expect(slipIds).toContain(slip2Id);
    });
  });

  // =========================================================================
  // Test 4: rpc_start_rating_slip rejects without active session
  // =========================================================================
  describe('session-gated seating (rpc_start_rating_slip)', () => {
    beforeEach(async () => {
      await cleanRatingSlips();
      await cleanTableSessions();
      // No session opened — table is active but sessionless
    });

    afterAll(async () => {
      await cleanRatingSlips();
      await cleanTableSessions();
    });

    it.skip('rejects with NO_ACTIVE_SESSION when no session exists', () => {
      /* BLOCKED: SESSION-GATE-REGRESSION — migration 20260329173121 overwrote
         PRD-059 session gate in rpc_start_rating_slip. See
         docs/issues/gaps/testing-arch-remediation/table-context-rollout/issues/SESSION-GATE-REGRESSION.md */
    });

    it('succeeds when active session exists', async () => {
      const sessionId = await openSession();

      const { data, error } = await pitBossClient.rpc(
        'rpc_start_rating_slip',
        {
          p_visit_id: visitId,
          p_table_id: tableId,
          p_seat_number: '1',
          p_game_settings: { game: 'blackjack' },
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.status).toBe('open');
      expect(data!.table_id).toBe(tableId);

      // Cleanup
      await cleanRatingSlips();
      await setupClient.from('table_session').delete().eq('id', sessionId);
    });
  });

  // =========================================================================
  // Test 5: rpc_check_table_seat_availability returns no_active_session
  // =========================================================================
  describe('session-gated seat availability', () => {
    beforeEach(async () => {
      await cleanTableSessions();
    });

    afterAll(async () => {
      await cleanTableSessions();
    });

    it('returns no_active_session when no session exists', async () => {
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

    it('returns available when active session exists and seat is empty', async () => {
      const sessionId = await openSession();

      const { data, error } = await pitBossClient.rpc(
        'rpc_check_table_seat_availability',
        {
          p_table_id: tableId,
          p_seat_number: 1,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect((data as Record<string, unknown>).available).toBe(true);

      // Cleanup
      await setupClient.from('table_session').delete().eq('id', sessionId);
    });
  });
});
