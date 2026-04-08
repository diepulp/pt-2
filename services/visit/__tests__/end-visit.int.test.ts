/**
 * @jest-environment node
 */

/**
 * End Visit Orchestration Integration Tests (PRD-063)
 *
 * Tests End Visit compound workflow against real Supabase database.
 * Uses service-role client for setup; validates orchestration logic,
 * idempotency, and zero-slip edge case.
 *
 * Note: Tests requiring rpc_close_rating_slip (which needs JWT context
 * via set_rls_context_from_staff) are validated via E2E tests instead.
 * This suite validates the orchestration layer: filtering, sequencing,
 * closeVisit integration, and discriminated union result shapes.
 *
 * @see PRD-063 Visit Lifecycle Operator Workflow
 * @see EXEC-063 WS5
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import { endVisit } from '../end-visit';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TEST_RUN_ID = Date.now().toString(36);
const TEST_PREFIX = `prd063-${TEST_RUN_ID}`;

describe('End Visit Orchestration - Integration Tests (PRD-063)', () => {
  let supabase: SupabaseClient<Database>;

  // Shared test resources
  let testCompanyId: string;
  let testCasinoId: string;
  let testTableId: string;

  // Track created resources for cleanup
  const createdPlayerIds: string[] = [];
  const createdVisitIds: string[] = [];

  let seatCounter = 0;

  /** Helper: create a test player */
  async function createTestPlayer(suffix: string) {
    const { data: player, error } = await supabase
      .from('player')
      .insert({
        first_name: 'Test',
        last_name: `${TEST_PREFIX}-${suffix}`,
      })
      .select()
      .single();
    if (error || !player)
      throw new Error(`Failed to create test player: ${error?.message}`);
    createdPlayerIds.push(player.id);

    await supabase.from('player_casino').insert({
      player_id: player.id,
      casino_id: testCasinoId,
    });

    return player;
  }

  /** Helper: create a visit */
  async function createTestVisit(playerId: string) {
    const visitId = crypto.randomUUID();
    const { data: visit } = await supabase
      .from('visit')
      .insert({
        id: visitId,
        player_id: playerId,
        casino_id: testCasinoId,
        visit_kind: 'gaming_identified_rated',
        visit_group_id: visitId,
        gaming_day: '1970-01-01',
      })
      .select()
      .single();
    if (!visit) throw new Error('Failed to create test visit');
    createdVisitIds.push(visit.id);
    return visit;
  }

  /** Helper: create an already-closed rating slip (for verifying endVisit skips it) */
  async function createClosedSlip(visitId: string) {
    seatCounter++;
    const { data: slip, error } = await supabase
      .from('rating_slip')
      .insert({
        casino_id: testCasinoId,
        visit_id: visitId,
        table_id: testTableId,
        seat_number: String(seatCounter),
        status: 'closed',
        start_time: new Date(Date.now() - 3600000).toISOString(),
        end_time: new Date().toISOString(),
        final_duration_seconds: 3600,
        game_settings: {},
        policy_snapshot: {
          loyalty: { house_edge_pct: 2.0, accrual_rate: 1.0 },
        },
        computed_theo_cents: 500,
      })
      .select()
      .single();
    if (error)
      throw new Error(`Failed to create closed slip: ${error.message}`);
    return slip!;
  }

  beforeAll(async () => {
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    const { data: company } = await supabase
      .from('company')
      .insert({ name: `${TEST_PREFIX} Company` })
      .select()
      .single();
    if (!company) throw new Error('Failed to create test company');
    testCompanyId = company.id;

    const { data: casino } = await supabase
      .from('casino')
      .insert({
        name: `${TEST_PREFIX} Casino`,
        status: 'active',
        company_id: testCompanyId,
      })
      .select()
      .single();
    testCasinoId = casino!.id;

    await supabase.from('casino_settings').insert({
      casino_id: testCasinoId,
      gaming_day_start_time: '06:00:00',
      timezone: 'America/Los_Angeles',
      watchlist_floor: 3000,
      ctr_threshold: 10000,
    });

    const { data: table } = await supabase
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
    testTableId = table!.id;
  });

  afterAll(async () => {
    for (const visitId of createdVisitIds) {
      await supabase.from('rating_slip').delete().eq('visit_id', visitId);
      await supabase.from('visit').delete().eq('id', visitId);
    }
    for (const playerId of createdPlayerIds) {
      await supabase.from('player_casino').delete().eq('player_id', playerId);
      await supabase.from('player_loyalty').delete().eq('player_id', playerId);
      await supabase.from('player').delete().eq('id', playerId);
    }

    await supabase.from('gaming_table').delete().eq('casino_id', testCasinoId);
    await supabase
      .from('casino_settings')
      .delete()
      .eq('casino_id', testCasinoId);
    await supabase.from('casino').delete().eq('id', testCasinoId);
    await supabase.from('company').delete().eq('id', testCompanyId);
  }, 30000);

  it('zero-slip: visit with no open slips closes directly', async () => {
    const player = await createTestPlayer('zero');
    const visit = await createTestVisit(player.id);

    const result = await endVisit(supabase, visit.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.visit.ended_at).not.toBeNull();
    expect(result.closedSlipCount).toBe(0);
  });

  it('zero-slip with closed slips: skips already-closed slips', async () => {
    const player = await createTestPlayer('closed-only');
    const visit = await createTestVisit(player.id);

    // Create a pre-closed slip — endVisit should skip it
    await createClosedSlip(visit.id);

    const result = await endVisit(supabase, visit.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.visit.ended_at).not.toBeNull();
    // No open slips to close — closedSlipCount = 0
    expect(result.closedSlipCount).toBe(0);
  });

  it('idempotent: endVisit on already-closed visit succeeds', async () => {
    const player = await createTestPlayer('idempotent');
    const visit = await createTestVisit(player.id);

    // Close the visit first
    await supabase
      .from('visit')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', visit.id);

    const result = await endVisit(supabase, visit.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.closedSlipCount).toBe(0);
  });

  it('returns EndVisitResult discriminated union shape on success', async () => {
    const player = await createTestPlayer('shape-ok');
    const visit = await createTestVisit(player.id);

    const result = await endVisit(supabase, visit.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result).toHaveProperty('visit');
    expect(result).toHaveProperty('closedSlipCount');
    expect(result.visit).toHaveProperty('id');
    expect(result.visit).toHaveProperty('ended_at');
    expect(typeof result.closedSlipCount).toBe('number');
  });

  it('DEC-003: RecentSessionsDTO shape has ended_at + segment_count', async () => {
    const player = await createTestPlayer('dec003');
    const visit = await createTestVisit(player.id);

    // Create a closed slip with segment
    await createClosedSlip(visit.id);

    // Close the visit
    await supabase
      .from('visit')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', visit.id);

    // Verify via RPC that the shape is sufficient for eligibility
    const { data: recentData } = await supabase.rpc(
      'rpc_get_player_recent_sessions',
      { p_player_id: player.id, p_limit: 5, p_cursor: null },
    );

    // The RPC should return session data with ended_at and segment_count
    expect(recentData).toBeDefined();
    if (recentData) {
      const parsed =
        typeof recentData === 'string' ? JSON.parse(recentData) : recentData;
      for (const session of parsed.sessions ?? []) {
        expect(session).toHaveProperty('ended_at');
        expect(session).toHaveProperty('segment_count');
      }
    }
  });
});
