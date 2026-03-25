/**
 * PRD-057: Session Close Lifecycle Hardening — Integration Tests
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

const isIntegrationEnvironment =
  supabaseUrl &&
  supabaseServiceKey &&
  process.env.RUN_INTEGRATION_TESTS === 'true';

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

describeIntegration('PRD-057: Session Close Lifecycle Hardening', () => {
  let svc: SupabaseClient<Database>;

  // Shared test entities
  let companyId: string;
  let casinoId: string;
  let pitBossId: string;
  let pitBossUserId: string;
  let tableId: string;
  let dropEventId: string;
  let playerId: string;
  let visitId: string;

  /** Set RLS context as pit_boss */
  async function asPitBoss() {
    await svc.rpc('set_rls_context_internal', {
      p_actor_id: pitBossId,
      p_casino_id: casinoId,
      p_staff_role: 'pit_boss',
    });
  }

  /** Open a session on tableId, return session ID */
  async function openSession(): Promise<string> {
    await asPitBoss();
    const { data } = await svc.rpc('rpc_open_table_session', {
      p_gaming_table_id: tableId,
    });
    return data!.id;
  }

  /** Transition session to RUNDOWN */
  async function startRundown(sessionId: string) {
    await asPitBoss();
    await svc.rpc('rpc_start_table_rundown', {
      p_table_session_id: sessionId,
    });
  }

  /** Create an open rating slip at the table */
  async function createOpenSlip(seatNumber: string = '1'): Promise<string> {
    await asPitBoss();
    const { data } = await svc.rpc('rpc_start_rating_slip', {
      p_visit_id: visitId,
      p_table_id: tableId,
      p_seat_number: seatNumber,
      p_game_settings: { game: 'blackjack' },
    });
    return data!.id;
  }

  /** Clean up non-closed sessions on tableId */
  async function cleanTableSessions() {
    await svc
      .from('table_session')
      .delete()
      .eq('gaming_table_id', tableId)
      .neq('status', 'CLOSED');
  }

  /** Clean up rating slips for the test visit */
  async function cleanRatingSlips() {
    await svc.from('rating_slip').delete().eq('visit_id', visitId);
  }

  beforeAll(async () => {
    svc = createClient<Database>(supabaseUrl!, supabaseServiceKey!);

    // Create test user
    const { data: user } = await svc.auth.admin.createUser({
      email: `test-prd057-${Date.now()}@example.com`,
      password: 'test-password',
      email_confirm: true,
    });
    pitBossUserId = user!.user!.id;

    // Company (required for casino per ADR-043)
    const { data: company } = await svc
      .from('company')
      .insert({ name: 'PRD-057 Test Company' })
      .select('id')
      .single();
    companyId = company!.id;

    // Casino + settings
    const { data: casino } = await svc
      .from('casino')
      .insert({ name: 'PRD-057 Test Casino', company_id: company!.id })
      .select('id')
      .single();
    casinoId = casino!.id;

    await svc.from('casino_settings').insert({
      casino_id: casinoId,
      gaming_day_start_time: '06:00',
      timezone: 'America/Los_Angeles',
    });

    // Staff (pit_boss)
    const { data: staff } = await svc
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

    // Gaming table
    const { data: table } = await svc
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

    // Drop event + snapshot (for close artifacts)
    const { data: drop } = await svc
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

    await svc.from('table_inventory_snapshot').insert({
      casino_id: casinoId,
      table_id: tableId,
      counted_by: pitBossId,
      chipset: { '1': 100 },
      snapshot_type: 'close',
    });

    // Player + visit (for rating slips)
    const { data: player } = await svc
      .from('player')
      .insert({
        casino_id: casinoId,
        first_name: 'Test',
        last_name: 'Player',
      })
      .select('id')
      .single();
    playerId = player!.id;

    // player_casino enrollment
    await svc.from('player_casino').insert({
      player_id: playerId,
      casino_id: casinoId,
      status: 'active',
    });

    // player_loyalty account
    await svc.from('player_loyalty').insert({
      player_id: playerId,
      casino_id: casinoId,
      current_balance: 0,
      lifetime_earned: 0,
      lifetime_redeemed: 0,
      tier: 'bronze',
    });

    // Open visit (requires gaming_day + visit_group_id per schema)
    const visitGroupId = crypto.randomUUID();
    const { data: visit } = await svc
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
  });

  afterAll(async () => {
    // Cleanup in dependency order
    await svc.from('rating_slip').delete().eq('casino_id', casinoId);
    await svc.from('audit_log').delete().eq('casino_id', casinoId);
    await svc.from('table_rundown_report').delete().eq('casino_id', casinoId);
    await svc.from('table_session').delete().eq('casino_id', casinoId);
    await svc
      .from('table_inventory_snapshot')
      .delete()
      .eq('casino_id', casinoId);
    await svc.from('table_drop_event').delete().eq('casino_id', casinoId);
    await svc.from('visit').delete().eq('casino_id', casinoId);
    await svc.from('player_loyalty').delete().eq('casino_id', casinoId);
    await svc.from('player_casino').delete().eq('casino_id', casinoId);
    await svc.from('player').delete().eq('casino_id', casinoId);
    await svc.from('gaming_table').delete().eq('casino_id', casinoId);
    await svc.from('staff').delete().eq('casino_id', casinoId);
    await svc.from('casino_settings').delete().eq('casino_id', casinoId);
    await svc.from('casino').delete().eq('id', casinoId);
    await svc.from('company').delete().eq('id', companyId);
    await svc.auth.admin.deleteUser(pitBossUserId);
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
      await svc.from('table_session').delete().eq('id', sessionId);
    });

    it('raises P0005 and rejects the close', async () => {
      await asPitBoss();
      const { error } = await svc.rpc('rpc_close_table_session', {
        p_table_session_id: sessionId,
        p_drop_event_id: dropEventId,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('unresolved_liabilities');
    });

    it('session remains in RUNDOWN state (transaction rolled back)', async () => {
      const { data } = await svc
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
      await svc.from('table_session').delete().eq('id', sessionId);
    });

    it('closes with has_unresolved_items = false', async () => {
      await asPitBoss();
      const { data, error } = await svc.rpc('rpc_close_table_session', {
        p_table_session_id: sessionId,
        p_drop_event_id: dropEventId,
      });

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
      await cleanTableSessions();
      sessionId = await openSession();
      slip1Id = await createOpenSlip('1');
      slip2Id = await createOpenSlip('2');
    });

    afterAll(async () => {
      await cleanRatingSlips();
      await svc.from('audit_log').delete().eq('casino_id', casinoId);
      await svc.from('table_rundown_report').delete().eq('casino_id', casinoId);
      await svc.from('table_session').delete().eq('id', sessionId);
    });

    it('force-closes with has_unresolved_items = true and requires_reconciliation', async () => {
      await asPitBoss();
      const { data, error } = await svc.rpc('rpc_force_close_table_session', {
        p_table_session_id: sessionId,
        p_close_reason: 'end_of_shift',
      });

      expect(error).toBeNull();
      expect(data!.status).toBe('CLOSED');
      expect(data!.has_unresolved_items).toBe(true);
      expect(data!.requires_reconciliation).toBe(true);
    });

    it('audit_log contains orphaned_rating_slips with all 4 required fields', async () => {
      const { data: logs } = await svc
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
        expect(orphan.visit_id).toBe(visitId);
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

    it('rejects with NO_ACTIVE_SESSION when no session exists', async () => {
      await asPitBoss();
      const { error } = await svc.rpc('rpc_start_rating_slip', {
        p_visit_id: visitId,
        p_table_id: tableId,
        p_seat_number: '1',
        p_game_settings: { game: 'blackjack' },
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('NO_ACTIVE_SESSION');
    });

    it('succeeds when active session exists', async () => {
      const sessionId = await openSession();

      await asPitBoss();
      const { data, error } = await svc.rpc('rpc_start_rating_slip', {
        p_visit_id: visitId,
        p_table_id: tableId,
        p_seat_number: '1',
        p_game_settings: { game: 'blackjack' },
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.status).toBe('open');
      expect(data!.table_id).toBe(tableId);

      // Cleanup
      await cleanRatingSlips();
      await svc.from('table_session').delete().eq('id', sessionId);
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
      await asPitBoss();
      const { data, error } = await svc.rpc(
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

      await asPitBoss();
      const { data, error } = await svc.rpc(
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
      await svc.from('table_session').delete().eq('id', sessionId);
    });
  });
});
