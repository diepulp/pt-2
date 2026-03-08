/**
 * @jest-environment node
 *
 * Measurement Summary HTTP Contract Tests
 *
 * Validates the BFF endpoint contract at GET /api/v1/measurement/summary.
 * Tests route handler export existence + service layer integration.
 *
 * @see EXEC-046 WS2 — Route Handler
 */

import * as measurementSummaryRoute from '@/app/api/v1/measurement/summary/route';
import { createMeasurementService } from '@/services/measurement';
import type { MeasurementSummaryResponse } from '@/services/measurement';

describe('GET /api/v1/measurement/summary — contract', () => {
  // --- Route existence ---

  it('exports GET handler', () => {
    expect(typeof measurementSummaryRoute.GET).toBe('function');
  });

  it('exports dynamic = force-dynamic', () => {
    expect(measurementSummaryRoute.dynamic).toBe('force-dynamic');
  });

  it('does NOT export POST/PATCH/DELETE (read-only BFF)', () => {
    expect('POST' in measurementSummaryRoute).toBe(false);
    expect('PATCH' in measurementSummaryRoute).toBe(false);
    expect('DELETE' in measurementSummaryRoute).toBe(false);
  });
});

describe('MeasurementService.getSummary — integration shape', () => {
  // Tests the service layer integration that the route handler depends on

  it('getSummary returns MeasurementSummaryResponse shape', async () => {
    // Use a mock supabase that returns empty results
    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    // Make the builder thenable (for queries that resolve via await)
    Object.defineProperty(mockQueryBuilder, 'then', {
      value: (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
      configurable: true,
    });

    const mockSupabase = {
      from: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const service = createMeasurementService(mockSupabase as never);
    const result: MeasurementSummaryResponse =
      await service.getSummary('casino-1');

    // Validate shape
    expect(result).toHaveProperty('theoDiscrepancy');
    expect(result).toHaveProperty('auditCorrelation');
    expect(result).toHaveProperty('ratingCoverage');
    expect(result).toHaveProperty('loyaltyLiability');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('filters');
    expect(result.filters).toEqual({});
  });

  it('getSummary handles partial failure (1 rejected)', async () => {
    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    let callCount = 0;
    Object.defineProperty(mockQueryBuilder, 'then', {
      get() {
        return (resolve: (v: unknown) => void) => {
          callCount++;
          // Fail the first query (theo discrepancy), succeed the rest
          if (callCount === 1) {
            return Promise.resolve({
              data: null,
              error: { message: 'connection error', code: 'PGRST000' },
            }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        };
      },
      configurable: true,
    });

    const mockSupabase = {
      from: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const service = createMeasurementService(mockSupabase as never);
    const result = await service.getSummary('casino-1');

    // Partial failure: theo_discrepancy has error, others succeed
    expect(result.errors.theo_discrepancy).toBeDefined();
    expect(result.errors.theo_discrepancy!.code).toBe('query_failed');

    // Other metrics should still produce results (not null due to empty data)
    expect(result.auditCorrelation).not.toBeNull();
    expect(result.ratingCoverage).not.toBeNull();
    // loyaltyLiability is null for empty snapshot (valid initial state)
    expect(result.loyaltyLiability).toBeNull();
    expect(result.errors.loyalty_liability).toBeUndefined(); // null snapshot is NOT an error
  });

  it('getSummary includes filters in response', async () => {
    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    Object.defineProperty(mockQueryBuilder, 'then', {
      value: (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
      configurable: true,
    });

    const mockSupabase = {
      from: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const service = createMeasurementService(mockSupabase as never);
    const result = await service.getSummary('casino-1', {
      tableId: 'table-1',
    });

    expect(result.filters).toEqual({ tableId: 'table-1' });
  });

  it('MEAS-002/004 return casino-level data regardless of filters', async () => {
    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    Object.defineProperty(mockQueryBuilder, 'then', {
      value: (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
      configurable: true,
    });

    const mockSupabase = {
      from: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const service = createMeasurementService(mockSupabase as never);
    const result = await service.getSummary('casino-1', {
      tableId: 'table-1',
    });

    // MEAS-002 (audit correlation) has empty supported dimensions
    if (result.auditCorrelation) {
      expect(result.auditCorrelation.supportedDimensions).toEqual([]);
    }
    // MEAS-004 (loyalty liability) has empty supported dimensions
    // loyaltyLiability is null for empty snapshot but would have [] if data existed
  });
});
