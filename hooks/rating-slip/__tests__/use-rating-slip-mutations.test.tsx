/**
 * Unit tests for consolidated rating slip mutation hooks
 *
 * PERF-005 WS10: Validates WS2 (cache invalidation) and WS8 (consolidation).
 *
 * Tests verify:
 * - Each hook calls the correct HTTP function
 * - onSuccess invalidates both ratingSlipKeys AND dashboardKeys (no .scope)
 * - useCloseRatingSlip triggers accrueOnClose for non-ghost visits (P0-2 fix)
 * - useCloseRatingSlip does NOT trigger accrueOnClose for ghost visits
 * - No broad .scope invalidation (WS2)
 *
 * @see hooks/rating-slip/use-rating-slip-mutations.ts
 * @see PERF-005 WS8 Consolidate Duplicate Mutations
 * @see PERF-005 WS2 Cache Invalidation Fixes
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';

// Mock HTTP service functions
jest.mock('@/services/rating-slip/http', () => ({
  startRatingSlip: jest.fn(),
  pauseRatingSlip: jest.fn(),
  resumeRatingSlip: jest.fn(),
  closeRatingSlip: jest.fn(),
  updateAverageBet: jest.fn(),
}));

// Mock loyalty accrual
jest.mock('@/services/loyalty/http', () => ({
  accrueOnClose: jest.fn(),
}));

import { accrueOnClose } from '@/services/loyalty/http';
import {
  startRatingSlip,
  pauseRatingSlip,
  resumeRatingSlip,
  closeRatingSlip,
} from '@/services/rating-slip/http';

import {
  useStartRatingSlip,
  usePauseRatingSlip,
  useResumeRatingSlip,
  useCloseRatingSlip,
} from '../use-rating-slip-mutations';

// --- Test Helpers ---

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
    logger: {
      log: () => {},
      warn: () => {},
      error: () => {},
    },
  });

const createWrapper = (queryClient: QueryClient) => {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return Wrapper;
};

// --- Mock Data ---

const mockSlipDTO = {
  id: 'slip-123',
  table_id: 'table-456',
  casino_id: 'casino-789',
  visit_id: 'visit-abc',
  status: 'open' as const,
  seat_number: '3',
  average_bet: 25,
  start_time: '2026-01-29T10:00:00Z',
  end_time: null,
  game_settings: null,
  created_at: '2026-01-29T10:00:00Z',
  updated_at: '2026-01-29T10:00:00Z',
};

const mockClosedSlipDTO = {
  ...mockSlipDTO,
  status: 'closed' as const,
  end_time: '2026-01-29T11:30:00Z',
  duration_seconds: 5400,
  final_duration_seconds: 5400,
};

// --- Tests ---

describe('useStartRatingSlip', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    (startRatingSlip as jest.Mock).mockResolvedValue(mockSlipDTO);
  });

  it('should call startRatingSlip with the input', async () => {
    const { result } = renderHook(() => useStartRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    const input = {
      visit_id: 'visit-abc',
      table_id: 'table-456',
      seat_number: '3',
    };

    await result.current.mutateAsync({ input, casinoId: 'casino-789' });

    expect(startRatingSlip).toHaveBeenCalledWith(input);
  });

  it('should invalidate ratingSlipKeys.activeForTable on success', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useStartRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      input: { visit_id: 'visit-abc', table_id: 'table-456' },
      casinoId: 'casino-789',
    });

    // Should invalidate ratingSlipKeys.activeForTable
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['rating-slip', 'active-for-table', 'table-456'],
    });
  });

  it('should invalidate dashboardKeys on success (WS8)', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useStartRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      input: { visit_id: 'visit-abc', table_id: 'table-456' },
      casinoId: 'casino-789',
    });

    // Should invalidate dashboardKeys.activeSlips
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'active-slips', 'table-456'],
    });
    // Should invalidate dashboardKeys.stats
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'stats', 'casino-789'],
    });
    // Should invalidate dashboardKeys.tables (includes serialized empty filters)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'tables', 'casino-789', '[]'],
    });
  });
});

describe('usePauseRatingSlip', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    (pauseRatingSlip as jest.Mock).mockResolvedValue({
      ...mockSlipDTO,
      status: 'paused',
    });
  });

  it('should call pauseRatingSlip with slipId', async () => {
    const { result } = renderHook(() => usePauseRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-123',
      casinoId: 'casino-789',
    });

    expect(pauseRatingSlip).toHaveBeenCalledWith('slip-123');
  });

  it('should invalidate both ratingSlipKeys and dashboardKeys on success', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => usePauseRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-123',
      casinoId: 'casino-789',
    });

    // ratingSlipKeys.activeForTable (targeted, not .scope)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['rating-slip', 'active-for-table', 'table-456'],
    });
    // dashboardKeys.activeSlips
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'active-slips', 'table-456'],
    });
    // dashboardKeys.stats
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'stats', 'casino-789'],
    });
  });

  it('should invalidate modal data for immediate UI update', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => usePauseRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-123',
      casinoId: 'casino-789',
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['rating-slip-modal', 'data', 'slip-123'],
    });
  });

  it('should NOT use broad .scope invalidation (WS2)', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => usePauseRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-123',
      casinoId: 'casino-789',
    });

    const allCalls = invalidateSpy.mock.calls.map((c) => c[0]);
    // Should not contain any .scope keys (broad invalidation)
    for (const call of allCalls) {
      const key = (call as { queryKey: readonly unknown[] }).queryKey;
      expect(key).not.toEqual(['rating-slip', 'list']);
      expect(key).not.toEqual(['rating-slip', 'for-table']);
    }
  });
});

describe('useResumeRatingSlip', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    (resumeRatingSlip as jest.Mock).mockResolvedValue(mockSlipDTO);
  });

  it('should call resumeRatingSlip with slipId', async () => {
    const { result } = renderHook(() => useResumeRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-123',
      casinoId: 'casino-789',
    });

    expect(resumeRatingSlip).toHaveBeenCalledWith('slip-123');
  });

  it('should invalidate both ratingSlipKeys and dashboardKeys on success', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useResumeRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-123',
      casinoId: 'casino-789',
    });

    // ratingSlipKeys.activeForTable
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['rating-slip', 'active-for-table', 'table-456'],
    });
    // dashboardKeys.activeSlips
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'active-slips', 'table-456'],
    });
    // dashboardKeys.stats
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'stats', 'casino-789'],
    });
  });
});

describe('useCloseRatingSlip', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    (closeRatingSlip as jest.Mock).mockResolvedValue(mockClosedSlipDTO);
    (accrueOnClose as jest.Mock).mockResolvedValue({});
  });

  it('should call closeRatingSlip with slipId and optional input', async () => {
    const { result } = renderHook(() => useCloseRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-123',
      casinoId: 'casino-789',
      input: { average_bet: 50 },
    });

    expect(closeRatingSlip).toHaveBeenCalledWith('slip-123', {
      average_bet: 50,
    });
  });

  it('should invalidate ratingSlipKeys and dashboardKeys on success', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCloseRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-123',
      casinoId: 'casino-789',
    });

    // ratingSlipKeys.activeForTable
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['rating-slip', 'active-for-table', 'table-456'],
    });
    // dashboardKeys.activeSlips
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'active-slips', 'table-456'],
    });
    // dashboardKeys.stats
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'stats', 'casino-789'],
    });
    // dashboardKeys.tables (occupancy changed, includes serialized empty filters)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'tables', 'casino-789', '[]'],
    });
  });

  it('should remove duration query on success (slip is closed)', async () => {
    const removeSpy = jest.spyOn(queryClient, 'removeQueries');

    const { result } = renderHook(() => useCloseRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-123',
      casinoId: 'casino-789',
    });

    expect(removeSpy).toHaveBeenCalledWith({
      queryKey: ['rating-slip', 'duration', 'slip-123'],
    });
  });

  it('should trigger accrueOnClose for non-ghost visits (P0-2 fix)', async () => {
    const { result } = renderHook(() => useCloseRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-123',
      casinoId: 'casino-789',
      playerId: 'player-abc',
    });

    await waitFor(() => {
      expect(accrueOnClose).toHaveBeenCalledWith({
        ratingSlipId: 'slip-123',
        casinoId: 'casino-789',
        idempotencyKey: 'slip-123',
      });
    });
  });

  it('should NOT trigger accrueOnClose for ghost visits (no playerId)', async () => {
    const { result } = renderHook(() => useCloseRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-123',
      casinoId: 'casino-789',
      playerId: null,
    });

    expect(accrueOnClose).not.toHaveBeenCalled();
  });

  it('should NOT trigger accrueOnClose when playerId is undefined', async () => {
    const { result } = renderHook(() => useCloseRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-123',
      casinoId: 'casino-789',
    });

    expect(accrueOnClose).not.toHaveBeenCalled();
  });

  it('should NOT use broad .scope invalidation (WS2)', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCloseRatingSlip(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-123',
      casinoId: 'casino-789',
    });

    const allCalls = invalidateSpy.mock.calls.map((c) => c[0]);
    for (const call of allCalls) {
      const key = (call as { queryKey: readonly unknown[] }).queryKey;
      expect(key).not.toEqual(['rating-slip', 'list']);
      expect(key).not.toEqual(['rating-slip', 'for-table']);
    }
  });
});
