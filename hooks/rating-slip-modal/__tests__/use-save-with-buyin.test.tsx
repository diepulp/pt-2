/**
 * Unit tests for useSaveWithBuyIn mutation hook
 *
 * Tests the combined operation of:
 * 1. Recording buy-in transaction (if newBuyIn > 0 and player exists)
 * 2. Updating average_bet via PATCH endpoint
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
import { updateAverageBet } from '@/services/rating-slip/http';

import { useSaveWithBuyIn } from '../use-save-with-buyin';

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
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
};

describe('useSaveWithBuyIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (updateAverageBet as jest.Mock).mockResolvedValue({
      id: 'slip-1',
      average_bet: 25,
    });
    (createFinancialTransaction as jest.Mock).mockResolvedValue({
      id: 'txn-1',
    });
  });

  it('should update average_bet without buy-in when newBuyIn is 0', async () => {
    const { result } = renderHook(() => useSaveWithBuyIn(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      staffId: 'staff-1',
      averageBet: 25,
      newBuyIn: 0,
    });

    expect(updateAverageBet).toHaveBeenCalledWith('slip-1', {
      average_bet: 25,
    });
    expect(createFinancialTransaction).not.toHaveBeenCalled();
  });

  it('should record buy-in transaction when newBuyIn > 0', async () => {
    const { result } = renderHook(() => useSaveWithBuyIn(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      staffId: 'staff-1',
      averageBet: 25,
      newBuyIn: 100,
    });

    expect(createFinancialTransaction).toHaveBeenCalledWith({
      casino_id: 'casino-1',
      player_id: 'player-1',
      visit_id: 'visit-1',
      rating_slip_id: 'slip-1',
      amount: 10000, // 100 * 100 = cents
      direction: 'in',
      source: 'pit',
      tender_type: 'cash',
      created_by_staff_id: 'staff-1',
    });
    expect(updateAverageBet).toHaveBeenCalledWith('slip-1', {
      average_bet: 25,
    });
  });

  it('should convert dollars to cents correctly', async () => {
    const { result } = renderHook(() => useSaveWithBuyIn(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      staffId: 'staff-1',
      averageBet: 50,
      newBuyIn: 250.5, // Test fractional dollars
    });

    expect(createFinancialTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 25050, // 250.5 * 100 = 25050 cents
      }),
    );
  });

  it('should skip buy-in transaction for ghost visit (null playerId)', async () => {
    const { result } = renderHook(() => useSaveWithBuyIn(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: null, // Ghost visit
      casinoId: 'casino-1',
      staffId: 'staff-1',
      averageBet: 25,
      newBuyIn: 100,
    });

    expect(createFinancialTransaction).not.toHaveBeenCalled();
    expect(updateAverageBet).toHaveBeenCalledWith('slip-1', {
      average_bet: 25,
    });
  });

  it('should invalidate correct queries on success', async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSaveWithBuyIn(), {
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
      averageBet: 25,
      newBuyIn: 100,
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['rating-slip-modal', 'data', 'slip-1'],
        }),
      );
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['player-financial', 'visit-summary', 'visit-1'],
        }),
      );
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['dashboard', 'slips'],
        }),
      );
    });
  });
});
