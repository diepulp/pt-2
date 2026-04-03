/** @jest-environment node */
/**
 * MeasurementService Query Tests
 *
 * Tests for measurement query functions with mocked Supabase client.
 * Verifies correct table/view selection, column access, and filter application.
 *
 * @see EXEC-046 WS1 — Service Layer
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import {
  queryTheoDiscrepancy,
  queryAuditCorrelation,
  queryRatingCoverage,
  queryLoyaltyLiability,
} from '../queries';
import type { WidgetError } from '../dtos';

// === Mock Helpers ===

type MockQueryBuilder = {
  select: jest.Mock;
  eq: jest.Mock;
  not: jest.Mock;
  in: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  maybeSingle: jest.Mock;
};

function createMockQueryBuilder(
  data: unknown = [],
  error: unknown = null,
): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error }),
  };

  // Default resolution: Promise resolving to { data, error }
  // Override the chain end to return { data, error }
  Object.defineProperty(builder, 'then', {
    value: (resolve: (value: { data: unknown; error: unknown }) => void) => {
      return Promise.resolve({ data, error }).then(resolve);
    },
    enumerable: false,
  });

  return builder;
}

function createMockSupabase(
  fromMocks: Record<string, MockQueryBuilder>,
): SupabaseClient<Database> {
  return {
    from: jest.fn((table: string) => {
      return fromMocks[table] ?? createMockQueryBuilder();
    }),
  } as unknown as SupabaseClient<Database>;
}

// === queryTheoDiscrepancy ===

describe('queryTheoDiscrepancy', () => {
  it('queries rating_slip with casino_id filter and legacy_theo_cents NOT NULL', async () => {
    const mockRows = [
      {
        id: 'slip-1',
        table_id: 'table-1',
        computed_theo_cents: 1000,
        legacy_theo_cents: 900,
      },
    ];
    const builder = createMockQueryBuilder(mockRows);
    const supabase = createMockSupabase({ rating_slip: builder });

    const result = await queryTheoDiscrepancy(supabase, 'casino-1');

    expect(supabase.from).toHaveBeenCalledWith('rating_slip');
    expect(builder.select).toHaveBeenCalledWith(
      'id, table_id, computed_theo_cents, legacy_theo_cents',
    );
    expect(builder.eq).toHaveBeenCalledWith('casino_id', 'casino-1');
    expect(builder.not).toHaveBeenCalledWith('legacy_theo_cents', 'is', null);
    expect(result.rows).toEqual(mockRows);
  });

  it('applies table_id filter directly', async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({ rating_slip: builder });

    await queryTheoDiscrepancy(supabase, 'casino-1', {
      tableId: 'table-1',
    });

    expect(builder.eq).toHaveBeenCalledWith('table_id', 'table-1');
  });

  it('resolves pit_id via floor_table_slot subquery', async () => {
    const slotBuilder = createMockQueryBuilder([
      { preferred_table_id: 'table-1' },
      { preferred_table_id: 'table-2' },
    ]);
    const slipBuilder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({
      floor_table_slot: slotBuilder,
      rating_slip: slipBuilder,
    });

    await queryTheoDiscrepancy(supabase, 'casino-1', { pitId: 'pit-1' });

    // Verify floor_table_slot subquery
    expect(supabase.from).toHaveBeenCalledWith('floor_table_slot');
    expect(slotBuilder.eq).toHaveBeenCalledWith('pit_id', 'pit-1');
    expect(slotBuilder.not).toHaveBeenCalledWith(
      'preferred_table_id',
      'is',
      null,
    );

    // Verify IN filter on rating_slip
    expect(slipBuilder.in).toHaveBeenCalledWith('table_id', [
      'table-1',
      'table-2',
    ]);
  });

  it('throws unavailable when pit has no table assignments', async () => {
    const slotBuilder = createMockQueryBuilder([]);
    const slipBuilder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({
      floor_table_slot: slotBuilder,
      rating_slip: slipBuilder,
    });

    try {
      await queryTheoDiscrepancy(supabase, 'casino-1', { pitId: 'pit-empty' });
      fail('Expected error to be thrown');
    } catch (error) {
      const widgetError = error as WidgetError;
      expect(widgetError.code).toBe('unavailable');
      expect(widgetError.message).toContain('no table assignments');
    }
  });

  it('returns empty rows for empty results', async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({ rating_slip: builder });

    const result = await queryTheoDiscrepancy(supabase, 'casino-1');
    expect(result.rows).toEqual([]);
  });

  it('throws query_failed on database error', async () => {
    const builder = createMockQueryBuilder(null, {
      message: 'connection error',
    });
    const supabase = createMockSupabase({ rating_slip: builder });

    try {
      await queryTheoDiscrepancy(supabase, 'casino-1');
      fail('Expected error to be thrown');
    } catch (error) {
      expect((error as WidgetError).code).toBe('query_failed');
    }
  });
});

// === queryAuditCorrelation ===

describe('queryAuditCorrelation', () => {
  it('queries measurement_audit_event_correlation_v with casino_id', async () => {
    const mockRows = [
      {
        casino_id: 'casino-1',
        rating_slip_id: 'slip-1',
        pft_id: 'pft-1',
        mtl_entry_id: null,
        loyalty_ledger_id: null,
      },
    ];
    const builder = createMockQueryBuilder(mockRows);
    const supabase = createMockSupabase({
      measurement_audit_event_correlation_v: builder,
    });

    const result = await queryAuditCorrelation(supabase, 'casino-1');

    expect(supabase.from).toHaveBeenCalledWith(
      'measurement_audit_event_correlation_v',
    );
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('casino_id', 'casino-1');
    expect(result.rows).toEqual(mockRows);
  });

  it('returns empty rows for no data', async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({
      measurement_audit_event_correlation_v: builder,
    });

    const result = await queryAuditCorrelation(supabase, 'casino-1');
    expect(result.rows).toEqual([]);
  });
});

// === queryRatingCoverage ===

describe('queryRatingCoverage', () => {
  it('queries measurement_rating_coverage_v with casino_id', async () => {
    const mockRows = [
      {
        casino_id: 'casino-1',
        gaming_table_id: 'table-1',
        rated_ratio: 0.8,
        rated_seconds: 3600,
        open_seconds: 4500,
        untracked_seconds: 300,
      },
    ];
    const builder = createMockQueryBuilder(mockRows);
    const supabase = createMockSupabase({
      measurement_rating_coverage_v: builder,
    });

    const result = await queryRatingCoverage(supabase, 'casino-1');

    expect(supabase.from).toHaveBeenCalledWith('measurement_rating_coverage_v');
    expect(builder.eq).toHaveBeenCalledWith('casino_id', 'casino-1');
    expect(result.rows).toHaveLength(1);
  });

  it('applies table_id filter via gaming_table_id column', async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({
      measurement_rating_coverage_v: builder,
    });

    await queryRatingCoverage(supabase, 'casino-1', { tableId: 'table-1' });

    expect(builder.eq).toHaveBeenCalledWith('gaming_table_id', 'table-1');
  });

  it('resolves pit_id via floor_table_slot then filters by gaming_table_id', async () => {
    const slotBuilder = createMockQueryBuilder([
      { preferred_table_id: 'table-1' },
    ]);
    const coverageBuilder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({
      floor_table_slot: slotBuilder,
      measurement_rating_coverage_v: coverageBuilder,
    });

    await queryRatingCoverage(supabase, 'casino-1', { pitId: 'pit-1' });

    expect(coverageBuilder.in).toHaveBeenCalledWith('gaming_table_id', [
      'table-1',
    ]);
  });

  it('throws unavailable when pit has no table assignments', async () => {
    const slotBuilder = createMockQueryBuilder([]);
    const coverageBuilder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({
      floor_table_slot: slotBuilder,
      measurement_rating_coverage_v: coverageBuilder,
    });

    try {
      await queryRatingCoverage(supabase, 'casino-1', { pitId: 'pit-empty' });
      fail('Expected error to be thrown');
    } catch (error) {
      expect((error as WidgetError).code).toBe('unavailable');
    }
  });
});

// === queryLoyaltyLiability ===

describe('queryLoyaltyLiability', () => {
  it('queries latest snapshot and active policy', async () => {
    const snapshotBuilder = createMockQueryBuilder({
      id: 'snap-1',
      casino_id: 'casino-1',
      snapshot_date: '2026-03-07',
      total_outstanding_points: 50000,
      estimated_monetary_value_cents: 25000,
      player_count: 100,
      valuation_effective_date: '2026-01-01',
      valuation_policy_version: 'v1',
      created_at: '2026-03-07T12:00:00Z',
    });
    const policyBuilder = createMockQueryBuilder({ cents_per_point: 50 });
    const supabase = createMockSupabase({
      loyalty_liability_snapshot: snapshotBuilder,
      loyalty_valuation_policy: policyBuilder,
    });

    const result = await queryLoyaltyLiability(supabase, 'casino-1');

    expect(supabase.from).toHaveBeenCalledWith('loyalty_liability_snapshot');
    expect(snapshotBuilder.eq).toHaveBeenCalledWith('casino_id', 'casino-1');
    expect(snapshotBuilder.order).toHaveBeenCalledWith('snapshot_date', {
      ascending: false,
    });
    expect(snapshotBuilder.limit).toHaveBeenCalledWith(1);

    expect(supabase.from).toHaveBeenCalledWith('loyalty_valuation_policy');
    expect(policyBuilder.eq).toHaveBeenCalledWith('casino_id', 'casino-1');
    expect(policyBuilder.eq).toHaveBeenCalledWith('is_active', true);

    expect(result.snapshot).toBeTruthy();
    expect(result.policy).toEqual({ cents_per_point: 50 });
  });

  it('returns null snapshot when no data exists (new casino)', async () => {
    const snapshotBuilder = createMockQueryBuilder(null);
    const policyBuilder = createMockQueryBuilder(null);
    const supabase = createMockSupabase({
      loyalty_liability_snapshot: snapshotBuilder,
      loyalty_valuation_policy: policyBuilder,
    });

    const result = await queryLoyaltyLiability(supabase, 'casino-1');

    expect(result.snapshot).toBeNull();
    expect(result.policy).toBeNull();
  });

  it('returns null policy when no active policy', async () => {
    const snapshotBuilder = createMockQueryBuilder({
      id: 'snap-1',
      casino_id: 'casino-1',
      snapshot_date: '2026-03-07',
      total_outstanding_points: 50000,
      estimated_monetary_value_cents: 25000,
      player_count: 100,
      valuation_effective_date: '2026-01-01',
      valuation_policy_version: 'v1',
      created_at: '2026-03-07T12:00:00Z',
    });
    const policyBuilder = createMockQueryBuilder(null);
    const supabase = createMockSupabase({
      loyalty_liability_snapshot: snapshotBuilder,
      loyalty_valuation_policy: policyBuilder,
    });

    const result = await queryLoyaltyLiability(supabase, 'casino-1');

    expect(result.snapshot).toBeTruthy();
    expect(result.policy).toBeNull();
  });
});
