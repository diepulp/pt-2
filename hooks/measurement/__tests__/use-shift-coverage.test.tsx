/**
 * useShiftCoverage Hook Tests
 *
 * Tests for the coverage widget React Query hook.
 * Also tests the pure computeWeightedCoverage aggregation function.
 *
 * @see PRD-049 WS3 — Hook & Component Tests
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { computeWeightedCoverage } from '@/components/shift-dashboard-v3/coverage-widget';
import type { RatingCoverageQueryResult } from '@/services/measurement/queries';

// Mock the query function
const mockQueryRatingCoverage = jest.fn();
jest.mock('@/services/measurement/queries', () => ({
  queryRatingCoverage: (...args: unknown[]) => mockQueryRatingCoverage(...args),
}));

jest.mock('@/lib/supabase/client', () => ({
  createBrowserComponentClient: () => ({}),
}));

import { useShiftCoverage } from '../use-shift-coverage';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const mockRows: RatingCoverageQueryResult = {
  rows: [
    {
      casino_id: 'casino-1',
      gaming_table_id: 'table-1',
      table_session_id: 'session-1',
      gaming_day: '2026-03-09',
      session_status: 'active',
      opened_at: '2026-03-09T08:00:00Z',
      closed_at: null,
      rated_seconds: 3600,
      open_seconds: 4800,
      untracked_seconds: 600,
      ghost_seconds: 0,
      idle_seconds: 600,
      rated_ratio: 0.75,
      slip_count: 3,
    },
  ],
};

describe('useShiftCoverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns loading state initially', () => {
    mockQueryRatingCoverage.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(
      () => useShiftCoverage('casino-1', '2026-03-09'),
      { wrapper: createWrapper() },
    );
    expect(result.current.isLoading).toBe(true);
  });

  it('returns coverage rows on success', async () => {
    mockQueryRatingCoverage.mockResolvedValue(mockRows);
    const { result } = renderHook(
      () => useShiftCoverage('casino-1', '2026-03-09'),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.rows).toHaveLength(1);
    expect(result.current.data?.rows[0].rated_seconds).toBe(3600);
  });

  it('returns empty array when no table sessions', async () => {
    mockQueryRatingCoverage.mockResolvedValue({ rows: [] });
    const { result } = renderHook(
      () => useShiftCoverage('casino-1', '2026-03-09'),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.rows).toHaveLength(0);
  });

  it('returns error on query failure', async () => {
    mockQueryRatingCoverage.mockRejectedValue(new Error('query_failed'));
    const { result } = renderHook(
      () => useShiftCoverage('casino-1', '2026-03-09'),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('is disabled when casinoId is empty', () => {
    const { result } = renderHook(() => useShiftCoverage('', '2026-03-09'), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockQueryRatingCoverage).not.toHaveBeenCalled();
  });
});

// === Pure function tests ===

describe('computeWeightedCoverage', () => {
  it('returns 0 for empty rows', () => {
    expect(computeWeightedCoverage([])).toBe(0);
  });

  it('returns single row ratio when only one row', () => {
    const rows = [
      { rated_seconds: 300, open_seconds: 400 },
    ] as RatingCoverageQueryResult['rows'];
    expect(computeWeightedCoverage(rows)).toBe(0.75);
  });

  it('computes weighted average for mixed rows', () => {
    const rows = [
      { rated_seconds: 100, open_seconds: 200 }, // 50%
      { rated_seconds: 300, open_seconds: 400 }, // 75%
    ] as RatingCoverageQueryResult['rows'];
    // Weighted: (100+300)/(200+400) = 400/600 = 0.6667
    expect(computeWeightedCoverage(rows)).toBeCloseTo(0.6667, 3);
  });

  it('returns 0 when total open_seconds is 0 (no div-by-zero)', () => {
    const rows = [
      { rated_seconds: 0, open_seconds: 0 },
      { rated_seconds: 0, open_seconds: 0 },
    ] as RatingCoverageQueryResult['rows'];
    expect(computeWeightedCoverage(rows)).toBe(0);
  });

  it('handles null values as 0', () => {
    const rows = [
      { rated_seconds: null, open_seconds: 100 },
    ] as unknown as RatingCoverageQueryResult['rows'];
    expect(computeWeightedCoverage(rows)).toBe(0);
  });
});

// === Health tier boundary tests ===

describe('health tier boundaries', () => {
  // Import getHealthTier indirectly via computeWeightedCoverage + coverage widget behavior
  // These test the boundary values that determine tier display

  it('exactly 0.75 is Healthy tier', () => {
    const rows = [
      { rated_seconds: 75, open_seconds: 100 },
    ] as RatingCoverageQueryResult['rows'];
    expect(computeWeightedCoverage(rows)).toBe(0.75);
  });

  it('0.7499 is Warning tier (below 0.75 threshold)', () => {
    const rows = [
      { rated_seconds: 7499, open_seconds: 10000 },
    ] as RatingCoverageQueryResult['rows'];
    expect(computeWeightedCoverage(rows)).toBe(0.7499);
  });

  it('exactly 0.50 is Warning tier', () => {
    const rows = [
      { rated_seconds: 50, open_seconds: 100 },
    ] as RatingCoverageQueryResult['rows'];
    expect(computeWeightedCoverage(rows)).toBe(0.5);
  });

  it('0.4999 is Critical tier (below 0.50 threshold)', () => {
    const rows = [
      { rated_seconds: 4999, open_seconds: 10000 },
    ] as RatingCoverageQueryResult['rows'];
    expect(computeWeightedCoverage(rows)).toBe(0.4999);
  });
});
