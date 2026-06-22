/** @jest-environment node */

/**
 * Symptom B Reproduction — "Editing average bet resets accrued points"
 *
 * CLAIM UNDER TEST (loyalty split-brain diagnosis, fracture L-07):
 *   "Adjusting the average bet on a rating slip mutates and RESETS the points
 *    already accrued at the time of the change."
 *
 * This suite reproduces the scenario on a CLOSED slip using the REAL service
 * code paths (services/loyalty/crud::accrueOnClose and
 * services/rating-slip/crud::updateAverageBet) against local Supabase, to
 * determine empirically whether settled points mutate.
 *
 * Hypotheses (from agent-2-avgbet-accrual.md):
 *   (a) live preview recompute  — not at the ledger
 *   (b) accrual re-run REPLACES prior ledger points — TRUE mutation
 *   (c) recompute-from-current-state on next read
 *
 * AUTH: Mode C (ADR-024) — service-role for fixtures, authenticated pit_boss
 * for the real RPC/service calls.
 *
 * @see docs/issues/loyalty-split-brain/SPLIT-BRAIN-DIAGNOSIS-loyalty.md (Symptom B)
 * @see rpc_accrue_on_close ON CONFLICT (casino_id, rating_slip_id) WHERE reason='base_accrual'
 */

import { randomUUID } from 'crypto';

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { createModeCSession } from '@/lib/testing/create-mode-c-session';
import { accrueOnClose } from '@/services/loyalty/crud';
import { updateAverageBet } from '@/services/rating-slip/crud';
import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_PREFIX = 'test-symb-avgbet';

const POLICY = {
  houseEdge: 1.5,
  decisionsPerHour: 70,
  pointsConversionRate: 10.0,
  pointMultiplier: 1.0,
};

// theo = avg_bet * (house_edge/100) * duration_hours * decisions_per_hour
function calcPoints(avgBet: number, durationSeconds: number): number {
  const theo =
    avgBet *
    (POLICY.houseEdge / 100) *
    (durationSeconds / 3600) *
    POLICY.decisionsPerHour;
  return Math.round(
    theo * POLICY.pointsConversionRate * POLICY.pointMultiplier,
  );
}

interface TestFixture {
  casinoId: string;
  tableId: string;
  actorId: string;
  cleanup: () => Promise<void>;
}
interface TestPlayer {
  id: string;
  visitId: string;
  cleanup: () => Promise<void>;
}

const RUN_INTEGRATION =
  process.env.RUN_INTEGRATION_TESTS === 'true' ||
  process.env.RUN_INTEGRATION_TESTS === '1';

(RUN_INTEGRATION ? describe : describe.skip)(
  'Symptom B: average-bet edit vs settled accrued points (CLOSED slip)',
  () => {
    let setupClient: SupabaseClient<Database>;
    let pitBossClient: SupabaseClient<Database>;
    let authCleanup: (() => Promise<void>) | undefined;
    let fixture: TestFixture;
    let counter = 0;

    beforeAll(async () => {
      setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey);
      fixture = await createTestFixture(setupClient);
      const session = await createModeCSession(setupClient, {
        staffId: fixture.actorId,
        casinoId: fixture.casinoId,
        staffRole: 'pit_boss',
      });
      pitBossClient = session.client;
      authCleanup = session.cleanup;
      await setupClient
        .from('staff')
        .update({ user_id: session.userId })
        .eq('id', fixture.actorId);
    }, 30_000);

    afterAll(async () => {
      await authCleanup?.();
      await fixture?.cleanup?.();
    }, 15_000);

    async function createTestPlayer(): Promise<TestPlayer> {
      counter++;
      const { data: player } = await setupClient
        .from('player')
        .insert({
          first_name: 'SymB',
          last_name: `Test${counter}_${Date.now()}`,
          birth_date: '1985-01-15',
        })
        .select()
        .single();
      if (!player) throw new Error('player insert failed');

      await setupClient.from('player_casino').insert({
        player_id: player.id,
        casino_id: fixture.casinoId,
        status: 'active',
      });
      await setupClient.from('player_loyalty').insert({
        player_id: player.id,
        casino_id: fixture.casinoId,
        current_balance: 0,
        tier: 'bronze',
      });
      const { data: visit } = await setupClient
        .from('visit')
        .insert({
          player_id: player.id,
          casino_id: fixture.casinoId,
          started_at: new Date().toISOString(),
          ended_at: null,
          visit_kind: 'gaming_identified_rated',
          visit_group_id: randomUUID(),
        })
        .select()
        .single();
      if (!visit) throw new Error('visit insert failed');

      const cleanup = async () => {
        await setupClient
          .from('loyalty_ledger')
          .delete()
          .eq('player_id', player.id);
        await setupClient.from('rating_slip').delete().eq('visit_id', visit.id);
        await setupClient.from('visit').delete().eq('id', visit.id);
        await setupClient
          .from('player_loyalty')
          .delete()
          .eq('player_id', player.id);
        await setupClient
          .from('player_casino')
          .delete()
          .eq('player_id', player.id);
        await setupClient.from('player').delete().eq('id', player.id);
      };
      return { id: player.id, visitId: visit.id, cleanup };
    }

    /**
     * Creates a CLOSED slip. NOTE the policy_snapshot.loyalty intentionally
     * OMITS `avg_bet` — this mirrors production (every snapshot builder omits
     * it), which is exactly why theo falls through to the live slip column.
     */
    async function createClosedSlip(
      player: TestPlayer,
      avgBet: number,
      durationSeconds: number,
    ): Promise<string> {
      counter++;
      const slipId = randomUUID();
      const start = new Date(Date.now() - durationSeconds * 1000);
      const policySnapshot = {
        loyalty: {
          house_edge: POLICY.houseEdge,
          decisions_per_hour: POLICY.decisionsPerHour,
          points_conversion_rate: POLICY.pointsConversionRate,
          point_multiplier: POLICY.pointMultiplier,
          // avg_bet intentionally absent (production parity)
        },
        game_type: 'blackjack',
        captured_at: start.toISOString(),
      };
      const theoCents = Math.max(
        Math.round(
          (calcPoints(avgBet, durationSeconds) / POLICY.pointsConversionRate) *
            100,
        ),
        0,
      );
      const { error } = await setupClient.from('rating_slip').insert({
        id: slipId,
        casino_id: fixture.casinoId,
        visit_id: player.visitId,
        table_id: fixture.tableId,
        seat_number: String(counter % 6 || 1),
        average_bet: avgBet,
        status: 'closed',
        start_time: start.toISOString(),
        end_time: new Date().toISOString(),
        duration_seconds: durationSeconds,
        policy_snapshot: policySnapshot,
        accrual_kind: 'loyalty',
        computed_theo_cents: theoCents,
      });
      if (error) throw new Error(`slip insert failed: ${error.message}`);
      return slipId;
    }

    let player: TestPlayer;
    beforeEach(async () => {
      player = await createTestPlayer();
    });
    afterEach(async () => {
      await player?.cleanup?.();
    });

    it('accrues points at close from the live avg_bet (baseline)', async () => {
      const slipId = await createClosedSlip(player, 100, 3600);
      const out = await accrueOnClose(pitBossClient, {
        ratingSlipId: slipId,
        idempotencyKey: randomUUID(),
      });
      expect(out.pointsDelta).toBe(calcPoints(100, 3600));
      expect(out.isExisting).toBe(false);
    });

    it('REAL service path: updateAverageBet on a CLOSED slip is rejected', async () => {
      const slipId = await createClosedSlip(player, 100, 3600);
      await accrueOnClose(pitBossClient, {
        ratingSlipId: slipId,
        idempotencyKey: randomUUID(),
      });

      // The actual app path a user would hit:
      await expect(
        updateAverageBet(pitBossClient, slipId, 500),
      ).rejects.toMatchObject({ code: 'RATING_SLIP_INVALID_STATE' });
    });

    it('WORST CASE: forcing avg_bet to change + re-accruing does NOT mutate settled points', async () => {
      const avgBetA = 100;
      const duration = 3600;
      const slipId = await createClosedSlip(player, avgBetA, duration);

      // 1. Settle accrual at avg_bet = 100
      const first = await accrueOnClose(pitBossClient, {
        ratingSlipId: slipId,
        idempotencyKey: randomUUID(),
      });
      const settledPoints = first.pointsDelta;
      expect(settledPoints).toBe(calcPoints(avgBetA, duration)); // 1050

      const { data: balAfterFirst } = await setupClient
        .from('player_loyalty')
        .select('current_balance')
        .eq('player_id', player.id)
        .eq('casino_id', fixture.casinoId)
        .single();

      // 2. FORCE the average bet to 5x at the DB level (bypassing the service
      //    guard entirely — the most aggressive version of the reported edit).
      await setupClient
        .from('rating_slip')
        .update({ average_bet: avgBetA * 5 })
        .eq('id', slipId);

      // 3. Re-run the REAL accrual with a brand-new idempotency key.
      const second = await accrueOnClose(pitBossClient, {
        ratingSlipId: slipId,
        idempotencyKey: randomUUID(),
      });

      // ASSERT: points did NOT move; the prior entry is returned as existing.
      expect(second.isExisting).toBe(true);
      expect(second.pointsDelta).toBe(settledPoints);

      // ASSERT: exactly ONE base_accrual ledger row, unchanged points.
      const { data: ledgerRows } = await setupClient
        .from('loyalty_ledger')
        .select('id, points_delta')
        .eq('rating_slip_id', slipId)
        .eq('reason', 'base_accrual');
      expect(ledgerRows).toHaveLength(1);
      expect(ledgerRows![0].points_delta).toBe(settledPoints);

      // ASSERT: balance unchanged.
      const { data: balAfterSecond } = await setupClient
        .from('player_loyalty')
        .select('current_balance')
        .eq('player_id', player.id)
        .eq('casino_id', fixture.casinoId)
        .single();
      expect(balAfterSecond!.current_balance).toBe(
        balAfterFirst!.current_balance,
      );
    });

    it('CONTRAST: a new slip at 5x avg_bet accrues 5x points (avg_bet matters going FORWARD, not retroactively)', async () => {
      const slipLow = await createClosedSlip(player, 100, 3600);
      const low = await accrueOnClose(pitBossClient, {
        ratingSlipId: slipLow,
        idempotencyKey: randomUUID(),
      });

      const slipHigh = await createClosedSlip(player, 500, 3600);
      const high = await accrueOnClose(pitBossClient, {
        ratingSlipId: slipHigh,
        idempotencyKey: randomUUID(),
      });

      expect(low.pointsDelta).toBe(calcPoints(100, 3600)); // 1050
      expect(high.pointsDelta).toBe(calcPoints(500, 3600)); // 5250
      expect(high.pointsDelta).toBe(low.pointsDelta * 5);
    });
  },
);

async function createTestFixture(
  client: SupabaseClient<Database>,
): Promise<TestFixture> {
  const { data: company } = await client
    .from('company')
    .insert({ name: `${TEST_PREFIX} Co ${Date.now()}` })
    .select()
    .single();
  if (!company) throw new Error('company insert failed');

  const { data: casino } = await client
    .from('casino')
    .insert({
      name: `${TEST_PREFIX} Casino ${Date.now()}`,
      status: 'active',
      company_id: company.id,
    })
    .select()
    .single();
  if (!casino) throw new Error('casino insert failed');

  await client.from('casino_settings').insert({
    casino_id: casino.id,
    gaming_day_start_time: '06:00:00',
    timezone: 'America/Los_Angeles',
    watchlist_floor: 3000,
    ctr_threshold: 10000,
  });

  const { data: table } = await client
    .from('gaming_table')
    .insert({
      casino_id: casino.id,
      label: `${TEST_PREFIX}-BJ-01`,
      pit: 'Pit A',
      type: 'blackjack',
      status: 'active',
    })
    .select()
    .single();
  if (!table) throw new Error('table insert failed');

  await client.from('game_settings').insert({
    casino_id: casino.id,
    game_type: 'blackjack',
    name: 'Blackjack Standard',
    house_edge: POLICY.houseEdge,
    decisions_per_hour: POLICY.decisionsPerHour,
    points_conversion_rate: POLICY.pointsConversionRate,
    point_multiplier: POLICY.pointMultiplier,
  });

  const { data: actor } = await client
    .from('staff')
    .insert({
      casino_id: casino.id,
      employee_id: `${TEST_PREFIX}-001`,
      first_name: 'Test',
      last_name: 'PitBoss',
      email: `${TEST_PREFIX}-${Date.now()}@test.local`,
      role: 'pit_boss',
      status: 'active',
    })
    .select()
    .single();
  if (!actor) throw new Error('actor insert failed');

  const cleanup = async () => {
    await client.from('loyalty_ledger').delete().eq('casino_id', casino.id);
    await client.from('rating_slip').delete().eq('casino_id', casino.id);
    await client.from('visit').delete().eq('casino_id', casino.id);
    await client.from('player_loyalty').delete().eq('casino_id', casino.id);
    await client.from('player_casino').delete().eq('casino_id', casino.id);
    await client.from('player').delete().like('last_name', 'Test%');
    await client.from('staff').delete().eq('id', actor.id);
    await client.from('game_settings').delete().eq('casino_id', casino.id);
    await client.from('gaming_table').delete().eq('id', table.id);
    await client.from('casino_settings').delete().eq('casino_id', casino.id);
    await client.from('casino').delete().eq('id', casino.id);
    await client.from('company').delete().eq('id', company.id);
  };

  return {
    casinoId: casino.id,
    tableId: table.id,
    actorId: actor.id,
    cleanup,
  };
}
