/**
 * Unit tests for useCloseWithFinancial mutation hook
 *
 * Tests the combined operation of:
 * 1. Recording chips-taken transaction (if chipsTaken > 0 and player exists)
 * 2. Closing the rating slip (with optional final average_bet)
 *
 * @see PRD-008a Rating Slip Modal Dashboard Integration - WS7
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';

// Mock dependencies
jest.mock('@/services/player-financial/http');
jest.mock('@/services/rating-slip/http');

import { createFinancialTransaction } from '@/services/player-financial/http';
import { closeRatingSlip } from '@/services/rating-slip/http';

import { useCloseWithFinancial } from '../use-close-with-financial';

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

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useCloseWithFinancial', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (closeRatingSlip as jest.Mock).mockResolvedValue({
      id: 'slip-1',
      status: 'closed',
      duration_seconds: 3600,
    });
    (createFinancialTransaction as jest.Mock).mockResolvedValue({
      id: 'txn-1',
    });
  });

  it('should close slip without transaction when chipsTaken is 0', async () => {
    const { result } = renderHook(() => useCloseWithFinancial(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      staffId: 'staff-1',
      chipsTaken: 0,
      averageBet: 25,
    });

    expect(createFinancialTransaction).not.toHaveBeenCalled();
    expect(closeRatingSlip).toHaveBeenCalledWith('slip-1', { average_bet: 25 });
  });

  it('should record chips-taken transaction when chipsTaken > 0', async () => {
    const { result } = renderHook(() => useCloseWithFinancial(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      staffId: 'staff-1',
      chipsTaken: 500,
      averageBet: 50,
    });

    expect(createFinancialTransaction).toHaveBeenCalledWith({
      casino_id: 'casino-1',
      player_id: 'player-1',
      visit_id: 'visit-1',
      rating_slip_id: 'slip-1',
      amount: 50000, // 500 * 100 = cents
      direction: 'out',
      source: 'pit',
      tender_type: 'chips',
      created_by_staff_id: 'staff-1',
    });
    expect(closeRatingSlip).toHaveBeenCalledWith('slip-1', { average_bet: 50 });
  });

  it('should pass final average_bet to close endpoint', async () => {
    const { result } = renderHook(() => useCloseWithFinancial(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      staffId: 'staff-1',
      chipsTaken: 0,
      averageBet: 100,
    });

    expect(closeRatingSlip).toHaveBeenCalledWith('slip-1', { average_bet: 100 });
  });

  it('should skip chips-taken transaction for ghost visit (null playerId)', async () => {
    const { result } = renderHook(() => useCloseWithFinancial(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: null, // Ghost visit
      casinoId: 'casino-1',
      staffId: 'staff-1',
      chipsTaken: 500,
      averageBet: 50,
    });

    expect(createFinancialTransaction).not.toHaveBeenCalled();
    expect(closeRatingSlip).toHaveBeenCalledWith('slip-1', { average_bet: 50 });
  });

  it('should invalidate correct queries on success', async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCloseWithFinancial(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      staffId: 'staff-1',
      chipsTaken: 500,
      averageBet: 50,
    });

    // Invalidate modal scope
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['rating-slip-modal'],
        }),
      );
    });

    // Invalidate visit summary
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['player-financial', 'visit-summary', 'visit-1'],
        }),
      );
    });

    // Invalidate dashboard tables
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['dashboard', 'tables'],
        }),
      );
    });

    // Invalidate dashboard slips
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['dashboard', 'slips'],
        }),
      );
    });

    // Invalidate dashboard stats
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['dashboard', 'stats', 'casino-1'],
        }),
      );
    });
  });

  it('should close without average_bet when not provided', async () => {
    const { result } = renderHook(() => useCloseWithFinancial(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      staffId: 'staff-1',
      chipsTaken: 0,
      // averageBet is undefined
    });

    expect(closeRatingSlip).toHaveBeenCalledWith('slip-1', undefined);
  });
});
