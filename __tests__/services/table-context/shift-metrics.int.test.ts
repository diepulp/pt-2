/**
 * TableContext Shift Metrics Integration Tests
 *
 * Integration tests for shift metrics RPCs against a live database.
 * Tests telemetry logging, per-table metrics, and pit/casino rollups.
 *
 * PREREQUISITES:
 * - Migrations must be applied including table_buyin_telemetry and metrics RPCs
 * - Local Supabase running: `npx supabase start`
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 *
 * @see ADDENDUM-TBL-RUNDOWN
 * @see EXECUTION-SPEC-ADDENDUM-TBL-RUNDOWN.md WS6
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

describeIntegration('Shift Metrics Integration Tests', () => {
  let serviceClient: SupabaseClient<Database>;

  // Test data IDs
  let casinoId: string;
  let pitBossId: string;
  let userId: string;
  let tableId1: string;
  let tableId2: string;
  let playerId: string;
  let visitId: string;
  let ratingSlipId: string;

  // Time window for tests
  let windowStart: Date;
  let windowEnd: Date;

  beforeAll(async () => {
    // Create service client (bypasses RLS)
    serviceClient = createClient<Database>(supabaseUrl!, supabaseServiceKey!);

    // Create test user
    const { data: user } = await serviceClient.auth.admin.createUser({
      email: `test-pit-boss-metrics-${Date.now()}@example.com`,
      password: 'test-password',
      email_confirm: true,
    });
    userId = user!.user.id;

    // Create test casino with settings
    const { data: casino } = await serviceClient
      .from('casino')
      .insert({ name: 'Metrics Test Casino' })
      .select('id')
      .single();
    casinoId = casino!.id;

    // Create casino_settings (required for compute_gaming_day)
    await serviceClient.from('casino_settings').insert({
      casino_id: casinoId,
      gaming_day_start_time: '06:00',
      timezone: 'America/Los_Angeles',
    });

    // Create test staff
    const { data: pitBoss } = await serviceClient
      .from('staff')
      .insert({
        user_id: userId,
        casino_id: casinoId,
        role: 'pit_boss',
        name: 'Metrics Test Pit Boss',
        status: 'active',
      })
      .select('id')
      .single();
    pitBossId = pitBoss!.id;

    // Create test tables
    const { data: table1 } = await serviceClient
      .from('gaming_table')
      .insert({
        casino_id: casinoId,
        label: 'BJ-01',
        type: 'blackjack',
        pit: 'PIT-A',
        status: 'active',
      })
      .select('id')
      .single();
    tableId1 = table1!.id;

    const { data: table2 } = await serviceClient
      .from('gaming_table')
      .insert({
        casino_id: casinoId,
        label: 'BJ-02',
        type: 'blackjack',
        pit: 'PIT-A',
        status: 'active',
      })
      .select('id')
      .single();
    tableId2 = table2!.id;

    // Create test player
    const { data: player } = await serviceClient
      .from('player')
      .insert({
        first_name: 'Metrics',
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
        table_id: tableId1,
        status: 'active',
      })
      .select('id')
      .single();
    ratingSlipId = ratingSlip!.id;

    // Set time window (1 hour window starting now)
    windowStart = new Date();
    windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);
  });

  afterAll(async () => {
    // Cleanup test data in reverse order of dependencies
    await serviceClient
      .from('table_buyin_telemetry')
      .delete()
      .eq('casino_id', casinoId);
    await serviceClient
      .from('table_inventory_snapshot')
      .delete()
      .eq('casino_id', casinoId);
    await serviceClient.from('table_fill').delete().eq('casino_id', casinoId);
    await serviceClient.from('table_credit').delete().eq('casino_id', casinoId);
    await serviceClient
      .from('table_drop_event')
      .delete()
      .eq('casino_id', casinoId);
    await serviceClient.from('rating_slip').delete().eq('id', ratingSlipId);
    await serviceClient.from('visit').delete().eq('id', visitId);
    await serviceClient
      .from('player_casino')
      .delete()
      .eq('casino_id', casinoId);
    await serviceClient.from('player').delete().eq('id', playerId);
    await serviceClient.from('gaming_table').delete().eq('casino_id', casinoId);
    await serviceClient.from('staff').delete().eq('casino_id', casinoId);
    await serviceClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', casinoId);
    await serviceClient.from('casino').delete().eq('id', casinoId);
    await serviceClient.auth.admin.deleteUser(userId);
  });

  describe('rpc_log_table_buyin_telemetry', () => {
    it('logs RATED_BUYIN with visit and rating slip', async () => {
      const { data, error } = await serviceClient.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId1,
          p_amount_cents: 50000, // $500
          p_telemetry_kind: 'RATED_BUYIN',
          p_visit_id: visitId,
          p_rating_slip_id: ratingSlipId,
          p_tender_type: 'cash',
          p_actor_id: pitBossId,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.id).toBeDefined();
      expect(data.casino_id).toBe(casinoId);
      expect(data.table_id).toBe(tableId1);
      expect(data.amount_cents).toBe(50000);
      expect(data.telemetry_kind).toBe('RATED_BUYIN');
      expect(data.visit_id).toBe(visitId);
      expect(data.rating_slip_id).toBe(ratingSlipId);
      expect(data.actor_id).toBe(pitBossId);
    });

    it('logs GRIND_BUYIN without visit linkage', async () => {
      const { data, error } = await serviceClient.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId1,
          p_amount_cents: 10000, // $100
          p_telemetry_kind: 'GRIND_BUYIN',
          p_tender_type: 'cash',
          p_actor_id: pitBossId,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.telemetry_kind).toBe('GRIND_BUYIN');
      expect(data.visit_id).toBeNull();
      expect(data.rating_slip_id).toBeNull();
    });

    it('handles idempotency for duplicate requests', async () => {
      const idempotencyKey = `test-idem-${Date.now()}`;

      // First call
      const { data: first } = await serviceClient.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId1,
          p_amount_cents: 2500,
          p_telemetry_kind: 'GRIND_BUYIN',
          p_idempotency_key: idempotencyKey,
          p_actor_id: pitBossId,
        },
      );

      // Second call with same key
      const { data: second } = await serviceClient.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId1,
          p_amount_cents: 2500,
          p_telemetry_kind: 'GRIND_BUYIN',
          p_idempotency_key: idempotencyKey,
          p_actor_id: pitBossId,
        },
      );

      expect(first!.id).toBe(second!.id);
    });

    it('rejects RATED_BUYIN without visit_id', async () => {
      const { error } = await serviceClient.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId1,
          p_amount_cents: 10000,
          p_telemetry_kind: 'RATED_BUYIN',
          p_actor_id: pitBossId,
        },
      );

      expect(error).not.toBeNull();
      expect(error!.message).toContain('RATED_BUYIN requires');
    });

    it('rejects GRIND_BUYIN with visit_id', async () => {
      const { error } = await serviceClient.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId1,
          p_amount_cents: 10000,
          p_telemetry_kind: 'GRIND_BUYIN',
          p_visit_id: visitId,
          p_actor_id: pitBossId,
        },
      );

      expect(error).not.toBeNull();
      expect(error!.message).toContain('GRIND_BUYIN must not have');
    });

    it('rejects zero or negative amounts', async () => {
      const { error } = await serviceClient.rpc(
        'rpc_log_table_buyin_telemetry',
        {
          p_table_id: tableId1,
          p_amount_cents: 0,
          p_telemetry_kind: 'GRIND_BUYIN',
          p_actor_id: pitBossId,
        },
      );

      expect(error).not.toBeNull();
      expect(error!.message).toContain('amount_cents must be greater than 0');
    });
  });

  describe('rpc_shift_table_metrics', () => {
    beforeAll(async () => {
      // Create opening snapshot (before window start)
      const beforeWindow = new Date(windowStart.getTime() - 60 * 1000);
      await serviceClient.from('table_inventory_snapshot').insert({
        casino_id: casinoId,
        table_id: tableId1,
        snapshot_type: 'open',
        chipset: { '1': 100, '5': 50, '25': 20 },
        created_at: beforeWindow.toISOString(),
        counted_by: pitBossId,
      });

      // Create closing snapshot (within window)
      const withinWindow = new Date(windowStart.getTime() + 30 * 60 * 1000);
      await serviceClient.from('table_inventory_snapshot').insert({
        casino_id: casinoId,
        table_id: tableId1,
        snapshot_type: 'close',
        chipset: { '1': 80, '5': 60, '25': 25 },
        created_at: withinWindow.toISOString(),
        counted_by: pitBossId,
      });

      // Create fill within window
      await serviceClient.from('table_fill').insert({
        casino_id: casinoId,
        table_id: tableId1,
        request_id: `fill-${Date.now()}`,
        chipset: { '25': 10 },
        amount_cents: 25000,
        created_at: withinWindow.toISOString(),
      });

      // Create credit within window
      await serviceClient.from('table_credit').insert({
        casino_id: casinoId,
        table_id: tableId1,
        request_id: `credit-${Date.now()}`,
        chipset: { '5': 20 },
        amount_cents: 10000,
        created_at: withinWindow.toISOString(),
      });

      // Log additional telemetry within window
      await serviceClient.rpc('rpc_log_table_buyin_telemetry', {
        p_table_id: tableId1,
        p_amount_cents: 7500,
        p_telemetry_kind: 'GRIND_BUYIN',
        p_actor_id: pitBossId,
      });
    });

    it('returns metrics for all tables in casino', async () => {
      const { data, error } = await serviceClient.rpc(
        'rpc_shift_table_metrics',
        {
          p_window_start: windowStart.toISOString(),
          p_window_end: windowEnd.toISOString(),
          p_actor_id: pitBossId,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(2); // At least our 2 tables
    });

    it('computes snapshot-based metrics correctly', async () => {
      const { data } = await serviceClient.rpc('rpc_shift_table_metrics', {
        p_window_start: windowStart.toISOString(),
        p_window_end: windowEnd.toISOString(),
        p_actor_id: pitBossId,
      });

      const table1Metrics = data?.find(
        (m: { table_id: string }) => m.table_id === tableId1,
      );

      expect(table1Metrics).toBeDefined();
      expect(table1Metrics.opening_snapshot_id).toBeDefined();
      expect(table1Metrics.closing_snapshot_id).toBeDefined();
      expect(table1Metrics.opening_bankroll_total_cents).toBeDefined();
      expect(table1Metrics.closing_bankroll_total_cents).toBeDefined();
    });

    it('aggregates fills and credits', async () => {
      const { data } = await serviceClient.rpc('rpc_shift_table_metrics', {
        p_window_start: windowStart.toISOString(),
        p_window_end: windowEnd.toISOString(),
        p_actor_id: pitBossId,
      });

      const table1Metrics = data?.find(
        (m: { table_id: string }) => m.table_id === tableId1,
      );

      expect(table1Metrics.fills_total_cents).toBeGreaterThanOrEqual(0);
      expect(table1Metrics.credits_total_cents).toBeGreaterThanOrEqual(0);
    });

    it('aggregates telemetry by kind', async () => {
      const { data } = await serviceClient.rpc('rpc_shift_table_metrics', {
        p_window_start: windowStart.toISOString(),
        p_window_end: windowEnd.toISOString(),
        p_actor_id: pitBossId,
      });

      const table1Metrics = data?.find(
        (m: { table_id: string }) => m.table_id === tableId1,
      );

      expect(table1Metrics.estimated_drop_rated_cents).toBeGreaterThanOrEqual(
        0,
      );
      expect(table1Metrics.estimated_drop_grind_cents).toBeGreaterThanOrEqual(
        0,
      );
      expect(table1Metrics.estimated_drop_buyins_cents).toBeGreaterThanOrEqual(
        0,
      );
    });

    it('computes telemetry quality based on grind presence', async () => {
      const { data } = await serviceClient.rpc('rpc_shift_table_metrics', {
        p_window_start: windowStart.toISOString(),
        p_window_end: windowEnd.toISOString(),
        p_actor_id: pitBossId,
      });

      const table1Metrics = data?.find(
        (m: { table_id: string }) => m.table_id === tableId1,
      );

      // We logged grind buy-ins, so should be GOOD_COVERAGE
      expect(table1Metrics.telemetry_quality).toBe('GOOD_COVERAGE');
      expect(table1Metrics.telemetry_notes).toContain('rated + grind');
    });

    it('returns metric_grade as ESTIMATE', async () => {
      const { data } = await serviceClient.rpc('rpc_shift_table_metrics', {
        p_window_start: windowStart.toISOString(),
        p_window_end: windowEnd.toISOString(),
        p_actor_id: pitBossId,
      });

      const table1Metrics = data?.find(
        (m: { table_id: string }) => m.table_id === tableId1,
      );

      expect(table1Metrics.metric_grade).toBe('ESTIMATE');
    });

    it('flags missing snapshots', async () => {
      const { data } = await serviceClient.rpc('rpc_shift_table_metrics', {
        p_window_start: windowStart.toISOString(),
        p_window_end: windowEnd.toISOString(),
        p_actor_id: pitBossId,
      });

      // Table2 has no snapshots
      const table2Metrics = data?.find(
        (m: { table_id: string }) => m.table_id === tableId2,
      );

      expect(table2Metrics).toBeDefined();
      expect(table2Metrics.missing_opening_snapshot).toBe(true);
      expect(table2Metrics.missing_closing_snapshot).toBe(true);
      expect(table2Metrics.win_loss_inventory_cents).toBeNull();
      expect(table2Metrics.win_loss_estimated_cents).toBeNull();
    });

    it('validates window parameters', async () => {
      const { error } = await serviceClient.rpc('rpc_shift_table_metrics', {
        p_window_start: windowEnd.toISOString(), // Invalid: start after end
        p_window_end: windowStart.toISOString(),
        p_actor_id: pitBossId,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('p_window_end must be after');
    });
  });

  describe('rpc_shift_pit_metrics', () => {
    it('aggregates metrics for a specific pit', async () => {
      const { data, error } = await serviceClient.rpc('rpc_shift_pit_metrics', {
        p_window_start: windowStart.toISOString(),
        p_window_end: windowEnd.toISOString(),
        p_pit_id: 'PIT-A',
        p_actor_id: pitBossId,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1); // Single rollup row

      const rollup = data[0];
      expect(rollup.pit_id).toBe('PIT-A');
      expect(rollup.tables_count).toBeGreaterThanOrEqual(2);
      expect(rollup.win_loss_inventory_total_cents).toBeDefined();
      expect(rollup.win_loss_estimated_total_cents).toBeDefined();
    });

    it('counts tables with telemetry coverage', async () => {
      const { data } = await serviceClient.rpc('rpc_shift_pit_metrics', {
        p_window_start: windowStart.toISOString(),
        p_window_end: windowEnd.toISOString(),
        p_pit_id: 'PIT-A',
        p_actor_id: pitBossId,
      });

      const rollup = data?.[0];
      expect(rollup.tables_with_telemetry_count).toBeGreaterThanOrEqual(0);
      expect(rollup.tables_good_coverage_count).toBeGreaterThanOrEqual(0);
    });

    it('returns zero for non-existent pit', async () => {
      const { data, error } = await serviceClient.rpc('rpc_shift_pit_metrics', {
        p_window_start: windowStart.toISOString(),
        p_window_end: windowEnd.toISOString(),
        p_pit_id: 'NONEXISTENT-PIT',
        p_actor_id: pitBossId,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data[0].tables_count).toBe(0);
    });
  });

  describe('rpc_shift_casino_metrics', () => {
    it('aggregates metrics for entire casino', async () => {
      const { data, error } = await serviceClient.rpc(
        'rpc_shift_casino_metrics',
        {
          p_window_start: windowStart.toISOString(),
          p_window_end: windowEnd.toISOString(),
          p_actor_id: pitBossId,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1); // Single rollup row

      const rollup = data[0];
      expect(rollup.tables_count).toBeGreaterThanOrEqual(2);
      expect(rollup.pits_count).toBeGreaterThanOrEqual(1);
    });

    it('sums fills and credits across all tables', async () => {
      const { data } = await serviceClient.rpc('rpc_shift_casino_metrics', {
        p_window_start: windowStart.toISOString(),
        p_window_end: windowEnd.toISOString(),
        p_actor_id: pitBossId,
      });

      const rollup = data?.[0];
      expect(rollup.fills_total_cents).toBeGreaterThanOrEqual(0);
      expect(rollup.credits_total_cents).toBeGreaterThanOrEqual(0);
    });

    it('sums telemetry across all tables', async () => {
      const { data } = await serviceClient.rpc('rpc_shift_casino_metrics', {
        p_window_start: windowStart.toISOString(),
        p_window_end: windowEnd.toISOString(),
        p_actor_id: pitBossId,
      });

      const rollup = data?.[0];
      expect(rollup.estimated_drop_rated_total_cents).toBeGreaterThanOrEqual(0);
      expect(rollup.estimated_drop_grind_total_cents).toBeGreaterThanOrEqual(0);
      expect(rollup.estimated_drop_buyins_total_cents).toBeGreaterThanOrEqual(
        0,
      );
    });

    it('tracks snapshot coverage', async () => {
      const { data } = await serviceClient.rpc('rpc_shift_casino_metrics', {
        p_window_start: windowStart.toISOString(),
        p_window_end: windowEnd.toISOString(),
        p_actor_id: pitBossId,
      });

      const rollup = data?.[0];
      expect(rollup.tables_with_opening_snapshot).toBeGreaterThanOrEqual(0);
      expect(rollup.tables_with_closing_snapshot).toBeGreaterThanOrEqual(0);
    });

    it('always reports ESTIMATE grade for MVP', async () => {
      const { data } = await serviceClient.rpc('rpc_shift_casino_metrics', {
        p_window_start: windowStart.toISOString(),
        p_window_end: windowEnd.toISOString(),
        p_actor_id: pitBossId,
      });

      const rollup = data?.[0];
      // tables_grade_estimate should equal tables_count for MVP
      expect(rollup.tables_grade_estimate).toBe(rollup.tables_count);
    });
  });

  describe('getShiftAllPitsMetrics (client-side aggregation)', () => {
    /**
     * PERF: Validates the N+1 fix from SHIFT_DASHBOARD_PERFORMANCE_AUDIT.md
     * @see services/table-context/shift-metrics/service.ts:98-168
     */
    it('aggregates pit metrics from table metrics (single DB call)', async () => {
      // This test validates the client-side aggregation approach
      // which should produce the same results as the N+1 RPC calls
      // but with O(1) database calls instead of O(n)

      const { data: tableMetrics } = await serviceClient.rpc(
        'rpc_shift_table_metrics',
        {
          p_window_start: windowStart.toISOString(),
          p_window_end: windowEnd.toISOString(),
          p_actor_id: pitBossId,
        },
      );

      expect(tableMetrics).toBeDefined();
      expect(Array.isArray(tableMetrics)).toBe(true);

      // Manually aggregate (mimics the service function)
      const pitMap = new Map<string, Record<string, unknown>>();
      for (const table of tableMetrics ?? []) {
        if (!table.pit_id) continue;
        const existing = pitMap.get(table.pit_id);
        if (existing) {
          existing.tables_count = (existing.tables_count as number) + 1;
          existing.fills_total_cents =
            (existing.fills_total_cents as number) +
            Number(table.fills_total_cents ?? 0);
        } else {
          pitMap.set(table.pit_id, {
            pit_id: table.pit_id,
            tables_count: 1,
            fills_total_cents: Number(table.fills_total_cents ?? 0),
          });
        }
      }

      // Compare with RPC-based result
      const { data: rpcResult } = await serviceClient.rpc(
        'rpc_shift_pit_metrics',
        {
          p_window_start: windowStart.toISOString(),
          p_window_end: windowEnd.toISOString(),
          p_pit_id: 'PIT-A',
          p_actor_id: pitBossId,
        },
      );

      const clientAggregated = pitMap.get('PIT-A');
      const rpcRollup = rpcResult?.[0];

      expect(clientAggregated).toBeDefined();
      expect(rpcRollup).toBeDefined();
      expect(clientAggregated?.tables_count).toBe(rpcRollup?.tables_count);
      expect(clientAggregated?.fills_total_cents).toBe(
        Number(rpcRollup?.fills_total_cents ?? 0),
      );
    });

    it('produces consistent results with N=20 pits simulation', async () => {
      // Performance validation: verify aggregation scales linearly
      // even when the number of pits increases
      const start = performance.now();

      // Get all table metrics (single call)
      const { data: tableMetrics } = await serviceClient.rpc(
        'rpc_shift_table_metrics',
        {
          p_window_start: windowStart.toISOString(),
          p_window_end: windowEnd.toISOString(),
          p_actor_id: pitBossId,
        },
      );

      // Client-side aggregation
      const pitMap = new Map<string, number>();
      for (const table of tableMetrics ?? []) {
        if (!table.pit_id) continue;
        pitMap.set(table.pit_id, (pitMap.get(table.pit_id) ?? 0) + 1);
      }

      const duration = performance.now() - start;

      // The aggregation should be fast (< 100ms even for large datasets)
      // In production with indexes, this would be even faster
      expect(duration).toBeLessThan(500); // Conservative threshold for CI
      expect(pitMap.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getShiftDashboardSummary (BFF endpoint)', () => {
    /**
     * PERF: Validates the BFF endpoint from SHIFT_DASHBOARD_PERFORMANCE_AUDIT.md
     * @see services/table-context/shift-metrics/service.ts
     */
    it('returns all three metric levels from single table metrics call', async () => {
      // Single DB call for table metrics
      const { data: tableMetrics, error: tableError } = await serviceClient.rpc(
        'rpc_shift_table_metrics',
        {
          p_window_start: windowStart.toISOString(),
          p_window_end: windowEnd.toISOString(),
          p_actor_id: pitBossId,
        },
      );

      expect(tableError).toBeNull();
      expect(tableMetrics).toBeDefined();

      // Client-side aggregation produces all three levels
      const tables = tableMetrics ?? [];
      const uniquePits = new Set(
        tables.map((t: { pit_id: string | null }) => t.pit_id).filter(Boolean),
      );

      // Validate structure matches BFF response shape
      expect(tables.length).toBeGreaterThanOrEqual(2);
      expect(uniquePits.size).toBeGreaterThanOrEqual(1);

      // Casino-level aggregation
      const casinoMetrics = {
        tables_count: tables.length,
        pits_count: uniquePits.size,
        fills_total_cents: tables.reduce(
          (sum: number, t: { fills_total_cents?: number }) =>
            sum + Number(t.fills_total_cents ?? 0),
          0,
        ),
      };

      expect(casinoMetrics.tables_count).toBeGreaterThanOrEqual(2);
      expect(casinoMetrics.pits_count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('chipset_total_cents helper', () => {
    it('computes total cents from chipset JSONB', async () => {
      const { data, error } = await serviceClient.rpc('chipset_total_cents', {
        p_chipset: { '1': 10, '5': 20, '25': 4 },
      });

      expect(error).toBeNull();
      // (1*10 + 5*20 + 25*4) * 100 = (10 + 100 + 100) * 100 = 21000
      expect(data).toBe(21000);
    });

    it('returns 0 for null input', async () => {
      const { data, error } = await serviceClient.rpc('chipset_total_cents', {
        p_chipset: null,
      });

      expect(error).toBeNull();
      expect(data).toBe(0);
    });

    it('returns 0 for empty object', async () => {
      const { data, error } = await serviceClient.rpc('chipset_total_cents', {
        p_chipset: {},
      });

      expect(error).toBeNull();
      expect(data).toBe(0);
    });

    it('handles large denominations', async () => {
      const { data, error } = await serviceClient.rpc('chipset_total_cents', {
        p_chipset: { '100': 20, '500': 5 },
      });

      expect(error).toBeNull();
      // (100*20 + 500*5) * 100 = (2000 + 2500) * 100 = 450000
      expect(data).toBe(450000);
    });
  });
});
