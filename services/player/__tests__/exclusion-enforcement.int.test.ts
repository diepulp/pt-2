/** @jest-environment node */

/**
 * Exclusion Enforcement Integration Tests (GAP-EXCL-ENFORCE-001)
 *
 * Tests exclusion enforcement wiring across activity-creating RPCs:
 *   - rpc_start_rating_slip rejects hard_block players
 *   - rpc_resume_rating_slip rejects hard_block players
 *   - rpc_move_player rejects hard_block players
 *   - rpc_create_player_exclusion auto-closes visits + slips on hard_block
 *   - All RPCs allow soft_alert and monitor enforcement levels
 *
 * @see EXEC-055-exclusion-enforcement-wiring.md
 * @see GAP-EXCLUSION-ENFORCEMENT-BYPASS.md
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database.types';

// ============================================================================
// Type Aliases
// ============================================================================

type RpcFunctions = Database['public']['Functions'];

// ============================================================================
// 1. Type Contract Assertions — Compile-Time
// ============================================================================

// rpc_start_rating_slip: no spoofable params (ADR-024 INV-8)
type StartSlipArgs = RpcFunctions['rpc_start_rating_slip']['Args'];
type _AssertStartSlipNoCasinoId = 'p_casino_id' extends keyof StartSlipArgs
  ? never
  : true;
const _startSlipNoCasinoId: _AssertStartSlipNoCasinoId = true;

// rpc_resume_rating_slip: single param
type ResumeSlipArgs = RpcFunctions['rpc_resume_rating_slip']['Args'];
type _AssertResumeSlipHasId = ResumeSlipArgs extends {
  p_rating_slip_id: string;
}
  ? true
  : never;
const _resumeSlipHasId: _AssertResumeSlipHasId = true;

// rpc_move_player: no spoofable params
type MovePlayerArgs = RpcFunctions['rpc_move_player']['Args'];
type _AssertMoveNoCasinoId = 'p_casino_id' extends keyof MovePlayerArgs
  ? never
  : true;
const _moveNoCasinoId: _AssertMoveNoCasinoId = true;

// rpc_create_player_exclusion: has enforcement param
type CreateExclArgs = RpcFunctions['rpc_create_player_exclusion']['Args'];
type _AssertCreateExclHasEnforcement = CreateExclArgs extends {
  p_enforcement: string;
}
  ? true
  : never;
const _createExclHasEnforcement: _AssertCreateExclHasEnforcement = true;

describe('exclusion enforcement: type contracts', () => {
  it('rpc_start_rating_slip does not accept p_casino_id (ADR-024)', () => {
    expect(_startSlipNoCasinoId).toBe(true);
  });

  it('rpc_resume_rating_slip accepts p_rating_slip_id', () => {
    expect(_resumeSlipHasId).toBe(true);
  });

  it('rpc_move_player does not accept p_casino_id (ADR-024)', () => {
    expect(_moveNoCasinoId).toBe(true);
  });

  it('rpc_create_player_exclusion accepts p_enforcement', () => {
    expect(_createExclHasEnforcement).toBe(true);
  });
});

// ============================================================================
// 2. Runtime Integration Tests
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Skip runtime tests if no Supabase URL
const describeWithDb = supabaseUrl ? describe : describe.skip;

describeWithDb('exclusion enforcement: runtime (GAP-EXCL-ENFORCE-001)', () => {
  let serviceClient: SupabaseClient<Database>;
  let authClient: SupabaseClient<Database>;

  // Test resources
  let testCompanyId: string;
  let testCasinoId: string;
  let testTableId: string;
  let testTable2Id: string;
  let testStaffId: string;
  let testUserId: string;

  const TEST_RUN_ID = Date.now().toString(36);
  const TEST_PREFIX = `excl-enf-${TEST_RUN_ID}`;
  const testEmail = `${TEST_PREFIX.toLowerCase()}@test.com`;
  const testPassword = 'TestPassword123!';

  // Track created resources for cleanup
  const createdPlayerIds: string[] = [];
  const createdVisitIds: string[] = [];
  const createdSlipIds: string[] = [];
  const createdExclusionIds: string[] = [];

  beforeAll(async () => {
    serviceClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Create company
    const { data: company } = await serviceClient
      .from('company')
      .insert({ name: `${TEST_PREFIX} Company` })
      .select()
      .single();
    testCompanyId = company!.id;

    // Create casino
    const { data: casino } = await serviceClient
      .from('casino')
      .insert({
        name: `${TEST_PREFIX} Casino`,
        status: 'active',
        company_id: testCompanyId,
      })
      .select()
      .single();
    testCasinoId = casino!.id;

    // Casino settings (required for compute_gaming_day)
    await serviceClient.from('casino_settings').insert({
      casino_id: testCasinoId,
      gaming_day_start_time: '06:00:00',
      timezone: 'America/Los_Angeles',
      watchlist_floor: 3000,
      ctr_threshold: 10000,
    });

    // Two gaming tables
    const { data: table1 } = await serviceClient
      .from('gaming_table')
      .insert({
        casino_id: testCasinoId,
        label: `${TEST_PREFIX}-BJ-01`,
        pit: 'Main',
        type: 'blackjack',
        status: 'active',
      })
      .select()
      .single();
    testTableId = table1!.id;

    const { data: table2 } = await serviceClient
      .from('gaming_table')
      .insert({
        casino_id: testCasinoId,
        label: `${TEST_PREFIX}-BJ-02`,
        pit: 'Main',
        type: 'blackjack',
        status: 'active',
      })
      .select()
      .single();
    testTable2Id = table2!.id;

    // Create auth user
    const { data: authData } = await serviceClient.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });
    testUserId = authData.user!.id;

    // Create staff record (pit_boss — authorized for exclusion + slip ops)
    const { data: staff } = await serviceClient
      .from('staff')
      .insert({
        casino_id: testCasinoId,
        user_id: testUserId,
        employee_id: `${TEST_PREFIX}-PB1`,
        first_name: 'Test',
        last_name: 'PitBoss',
        email: testEmail,
        role: 'pit_boss',
        status: 'active',
      })
      .select()
      .single();
    testStaffId = staff!.id;

    // Update user app_metadata with staff_id for set_rls_context_from_staff
    await serviceClient.auth.admin.updateUserById(testUserId, {
      app_metadata: {
        staff_id: testStaffId,
        casino_id: testCasinoId,
      },
    });

    // Create authenticated client
    authClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
    await authClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
  }, 30_000);

  afterAll(async () => {
    // Clean up in reverse dependency order
    for (const id of createdSlipIds) {
      await serviceClient.from('rating_slip').delete().eq('id', id);
    }
    for (const id of createdExclusionIds) {
      await serviceClient.from('player_exclusion').delete().eq('id', id);
    }
    for (const id of createdVisitIds) {
      await serviceClient.from('rating_slip').delete().eq('visit_id', id);
      await serviceClient.from('visit').delete().eq('id', id);
    }
    for (const pid of createdPlayerIds) {
      await serviceClient.from('player_casino').delete().eq('player_id', pid);
      await serviceClient.from('player_loyalty').delete().eq('player_id', pid);
      await serviceClient.from('player').delete().eq('id', pid);
    }
    await serviceClient
      .from('audit_log')
      .delete()
      .eq('casino_id', testCasinoId);
    await serviceClient.from('staff').delete().eq('casino_id', testCasinoId);
    await serviceClient
      .from('gaming_table')
      .delete()
      .eq('casino_id', testCasinoId);
    await serviceClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', testCasinoId);
    await serviceClient.from('casino').delete().eq('id', testCasinoId);
    await serviceClient.from('company').delete().eq('id', testCompanyId);
    if (testUserId) {
      await serviceClient.auth.admin.deleteUser(testUserId);
    }
  }, 30_000);

  // Auto-incrementing seat counter to avoid seat collisions across tests
  let seatCounter = 0;

  // Helper: create player with active visit and open slip
  async function createPlayerWithSlip(opts: { seatNumber?: string } = {}) {
    seatCounter++;
    const idx = createdPlayerIds.length + 1;
    const { data: player } = await serviceClient
      .from('player')
      .insert({
        first_name: 'ExclTest',
        last_name: `Player${idx}`,
        birth_date: '1990-01-01',
      })
      .select()
      .single();
    createdPlayerIds.push(player!.id);

    await serviceClient.from('player_casino').insert({
      player_id: player!.id,
      casino_id: testCasinoId,
      status: 'active',
    });

    // Create visit via RPC (sets gaming_day correctly)
    const { data: visitResult, error: visitError } = await authClient.rpc(
      'rpc_start_or_resume_visit',
      { p_player_id: player!.id },
    );
    if (visitError) throw new Error(`startVisit failed: ${visitError.message}`);
    // PostgREST returns TABLE(visit public.visit, ...) — the `visit` column
    // is a composite type serialized as a JSON string
    const visitRows = visitResult as unknown as Array<{
      visit: string | { id: string };
    }>;
    const rawVisit = visitRows?.[0]?.visit;
    const visitObj =
      typeof rawVisit === 'string' ? JSON.parse(rawVisit) : rawVisit;
    const visitId = visitObj?.id as string;
    if (!visitId)
      throw new Error(
        `startVisit returned no visit id: ${JSON.stringify(visitResult)}`,
      );
    createdVisitIds.push(visitId);

    // Create rating slip via RPC
    const { data: slip, error: slipError } = await authClient.rpc(
      'rpc_start_rating_slip',
      {
        p_visit_id: visitId,
        p_table_id: testTableId,
        p_seat_number: opts.seatNumber ?? seatCounter.toString(),
        p_game_settings: {},
      },
    );
    if (slipError) throw new Error(`startSlip failed: ${slipError.message}`);
    // RETURNS rating_slip — PostgREST returns the row directly
    const slipId = (slip as unknown as { id: string })?.id;
    if (!slipId)
      throw new Error(`startSlip returned no id: ${JSON.stringify(slip)}`);
    createdSlipIds.push(slipId);

    return { playerId: player!.id, visitId, slipId };
  }

  // Helper: create exclusion for a player
  async function createExclusion(
    playerId: string,
    enforcement: 'hard_block' | 'soft_alert' | 'monitor',
  ) {
    const { data, error } = await authClient.rpc(
      'rpc_create_player_exclusion',
      {
        p_player_id: playerId,
        p_exclusion_type: 'self_exclusion',
        p_enforcement: enforcement,
        p_reason: `Test ${enforcement} exclusion`,
      },
    );
    if (error) throw new Error(`createExclusion failed: ${error.message}`);
    const rows = data as unknown as { id: string }[];
    if (rows?.[0]) createdExclusionIds.push(rows[0].id);
    return rows?.[0];
  }

  // ──────────────────────────────────────────────────────────────────
  // 2a. rpc_start_rating_slip — exclusion guard
  // ──────────────────────────────────────────────────────────────────

  describe('rpc_start_rating_slip exclusion guard', () => {
    it('rejects hard_block player with PLAYER_EXCLUDED', async () => {
      const { playerId, visitId } = await createPlayerWithSlip();

      // Create hard_block exclusion (auto-closes existing slip + visit)
      await createExclusion(playerId, 'hard_block');

      // Re-open a visit directly (simulate stale state)
      await serviceClient
        .from('visit')
        .update({ ended_at: null })
        .eq('id', visitId);

      // Attempt to start a new slip → should be rejected
      const { error } = await authClient.rpc('rpc_start_rating_slip', {
        p_visit_id: visitId,
        p_table_id: testTableId,
        p_seat_number: '7',
        p_game_settings: {},
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('PLAYER_EXCLUDED');
    });

    it('allows soft_alert player (no rejection)', async () => {
      const { playerId, visitId } = await createPlayerWithSlip({
        seatNumber: '6',
      });

      // Create soft_alert exclusion (does NOT auto-close)
      await createExclusion(playerId, 'soft_alert');

      // Close the existing slip to free the seat
      const { data: slips } = await serviceClient
        .from('rating_slip')
        .select('id')
        .eq('visit_id', visitId)
        .in('status', ['open', 'paused']);

      for (const s of slips ?? []) {
        await serviceClient
          .from('rating_slip')
          .update({
            status: 'closed',
            end_time: new Date().toISOString(),
            computed_theo_cents: 0,
          })
          .eq('id', s.id);
      }

      // Start a new slip → should succeed (use unique seat)
      seatCounter++;
      const { data, error } = await authClient.rpc('rpc_start_rating_slip', {
        p_visit_id: visitId,
        p_table_id: testTable2Id,
        p_seat_number: seatCounter.toString(),
        p_game_settings: {},
      });

      expect(error).toBeNull();
      expect(data).not.toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 2b. rpc_resume_rating_slip — exclusion guard
  // ──────────────────────────────────────────────────────────────────

  describe('rpc_resume_rating_slip exclusion guard', () => {
    it('rejects hard_block player with PLAYER_EXCLUDED', async () => {
      const { playerId, slipId } = await createPlayerWithSlip();

      // Pause the slip first (via RPC)
      await authClient.rpc('rpc_pause_rating_slip', {
        p_rating_slip_id: slipId,
      });

      // Insert exclusion directly via service_role (bypasses auto-close)
      // so the slip stays paused
      const { data: exclData } = await serviceClient
        .from('player_exclusion')
        .insert({
          player_id: playerId,
          casino_id: testCasinoId,
          created_by: testStaffId,
          exclusion_type: 'self_exclusion',
          enforcement: 'hard_block',
          reason: 'Test hard_block for resume',
          effective_from: new Date().toISOString(),
        })
        .select()
        .single();
      if (exclData) createdExclusionIds.push(exclData.id);

      // Attempt to resume → should be rejected by exclusion guard
      const { error } = await authClient.rpc('rpc_resume_rating_slip', {
        p_rating_slip_id: slipId,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('PLAYER_EXCLUDED');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 2c. rpc_move_player — exclusion guard
  // ──────────────────────────────────────────────────────────────────

  describe('rpc_move_player exclusion guard', () => {
    it('rejects hard_block player with PLAYER_EXCLUDED', async () => {
      const { playerId, slipId } = await createPlayerWithSlip();

      // Create hard_block (auto-closes existing)
      await createExclusion(playerId, 'hard_block');

      // Force slip back to open (simulate stale state)
      await serviceClient
        .from('rating_slip')
        .update({
          status: 'open',
          end_time: null,
          computed_theo_cents: null,
        })
        .eq('id', slipId);

      // Attempt to move → should be rejected
      const { error } = await authClient.rpc('rpc_move_player', {
        p_slip_id: slipId,
        p_new_table_id: testTable2Id,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('PLAYER_EXCLUDED');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 2d. rpc_create_player_exclusion — auto-close on hard_block
  // ──────────────────────────────────────────────────────────────────

  describe('rpc_create_player_exclusion auto-close', () => {
    it('auto-closes active visits and open slips on hard_block', async () => {
      const { playerId, visitId, slipId } = await createPlayerWithSlip();

      // Verify slip is open before exclusion
      const { data: beforeSlip } = await serviceClient
        .from('rating_slip')
        .select('status')
        .eq('id', slipId)
        .single();
      expect(beforeSlip!.status).toBe('open');

      // Create hard_block exclusion
      await createExclusion(playerId, 'hard_block');

      // Verify slip is now closed
      const { data: afterSlip } = await serviceClient
        .from('rating_slip')
        .select('status, computed_theo_cents')
        .eq('id', slipId)
        .single();
      expect(afterSlip!.status).toBe('closed');
      expect(afterSlip!.computed_theo_cents).toBe(0);

      // Verify visit is now ended
      const { data: afterVisit } = await serviceClient
        .from('visit')
        .select('ended_at')
        .eq('id', visitId)
        .single();
      expect(afterVisit!.ended_at).not.toBeNull();
    });

    it('produces audit_log entry for auto-close', async () => {
      const { playerId } = await createPlayerWithSlip();

      // Create hard_block
      await createExclusion(playerId, 'hard_block');

      // Check audit_log
      const { data: auditEntries } = await serviceClient
        .from('audit_log')
        .select('action, details')
        .eq('casino_id', testCasinoId)
        .eq('action', 'exclusion_auto_close')
        .order('created_at', { ascending: false })
        .limit(1);

      expect(auditEntries).toHaveLength(1);
      expect(auditEntries![0].details).toMatchObject({
        player_id: playerId,
        enforcement: 'hard_block',
      });
    });

    it('does NOT auto-close on soft_alert', async () => {
      const { playerId, visitId, slipId } = await createPlayerWithSlip();

      // Create soft_alert exclusion
      await createExclusion(playerId, 'soft_alert');

      // Verify slip is still open
      const { data: afterSlip } = await serviceClient
        .from('rating_slip')
        .select('status')
        .eq('id', slipId)
        .single();
      expect(afterSlip!.status).toBe('open');

      // Verify visit is still active
      const { data: afterVisit } = await serviceClient
        .from('visit')
        .select('ended_at')
        .eq('id', visitId)
        .single();
      expect(afterVisit!.ended_at).toBeNull();
    });

    it('does NOT auto-close on monitor', async () => {
      const { playerId, visitId, slipId } = await createPlayerWithSlip();

      // Create monitor exclusion
      await createExclusion(playerId, 'monitor');

      // Verify slip is still open
      const { data: afterSlip } = await serviceClient
        .from('rating_slip')
        .select('status')
        .eq('id', slipId)
        .single();
      expect(afterSlip!.status).toBe('open');

      // Verify visit is still active
      const { data: afterVisit } = await serviceClient
        .from('visit')
        .select('ended_at')
        .eq('id', visitId)
        .single();
      expect(afterVisit!.ended_at).toBeNull();
    });
  });
});
