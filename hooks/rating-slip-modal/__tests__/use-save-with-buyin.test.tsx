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
jest.mock('@/hooks/mtl/use-threshold-notifications', () => ({
  checkCumulativeThreshold: jest.fn(),
  notifyThreshold: jest.fn(),
}));

import {
  checkCumulativeThreshold,
  notifyThreshold,
} from '@/hooks/mtl/use-threshold-notifications';
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
      tableId: 'table-1',
      staffId: 'staff-1',
      averageBet: 25,
      newBuyIn: 0,
      chipsTaken: 0,
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
      tableId: 'table-1',
      staffId: 'staff-1',
      averageBet: 25,
      newBuyIn: 100,
      chipsTaken: 0,
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
      tableId: 'table-1',
      staffId: 'staff-1',
      averageBet: 50,
      newBuyIn: 250.5, // Test fractional dollars
      chipsTaken: 0,
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
      tableId: 'table-1',
      staffId: 'staff-1',
      averageBet: 25,
      newBuyIn: 100,
      chipsTaken: 0,
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
      tableId: 'table-1',
      staffId: 'staff-1',
      averageBet: 25,
      newBuyIn: 100,
      chipsTaken: 0,
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
          queryKey: ['dashboard', 'active-slips', 'table-1'],
        }),
      );
    });
  });

  // ==========================================================================
  // PRD-064 WS1: Commit-barrier threshold notification ordering
  //
  // Regression guard: notifyThreshold must fire AFTER the mutation resolves
  // 2xx, not at step 1 of mutationFn. Firing early produces a success-like
  // toast for a transaction that may never commit.
  // ==========================================================================

  it('should NOT fire notifyThreshold before the mutation resolves', async () => {
    // Gate the PATCH update so we can assert ordering
    let resolveUpdate: (value: unknown) => void;
    (updateAverageBet as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    (checkCumulativeThreshold as jest.Mock).mockReturnValue({
      level: 'watchlist_met',
      shouldCreateMtl: true,
      requiresCtr: false,
      message: 'MTL entry required',
    });

    const { result } = renderHook(() => useSaveWithBuyIn(), {
      wrapper: createWrapper(),
    });

    // Fire mutation but do not await — PATCH is still pending
    const pendingMutation = result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      tableId: 'table-1',
      staffId: 'staff-1',
      averageBet: 25,
      newBuyIn: 3000,
      chipsTaken: 0,
      playerDailyTotal: 0,
    });

    // Wait for onMutate + step 1 of mutationFn to execute (threshold
    // projection is synchronous within mutationFn, but onMutate awaits
    // cancelQueries before mutationFn begins).
    await waitFor(() => {
      expect(checkCumulativeThreshold).toHaveBeenCalledWith(0, 3000);
    });

    // notify must NOT have fired yet — PATCH is still pending
    expect(notifyThreshold).not.toHaveBeenCalled();

    // Now resolve the PATCH and let the mutation complete
    resolveUpdate!({ id: 'slip-1', average_bet: 25 });
    await pendingMutation;

    // After 2xx resolution, notifyThreshold fires exactly once with the projection
    await waitFor(() => {
      expect(notifyThreshold).toHaveBeenCalledTimes(1);
    });
    expect(notifyThreshold).toHaveBeenCalledWith({
      level: 'watchlist_met',
      shouldCreateMtl: true,
      requiresCtr: false,
      message: 'MTL entry required',
    });
  });

  it('should NOT fire notifyThreshold when the mutation fails', async () => {
    (updateAverageBet as jest.Mock).mockRejectedValue(
      new Error('PATCH failed — 500'),
    );
    (checkCumulativeThreshold as jest.Mock).mockReturnValue({
      level: 'watchlist_met',
      shouldCreateMtl: true,
      requiresCtr: false,
      message: 'MTL entry required',
    });

    const { result } = renderHook(() => useSaveWithBuyIn(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({
        slipId: 'slip-1',
        visitId: 'visit-1',
        playerId: 'player-1',
        casinoId: 'casino-1',
        tableId: 'table-1',
        staffId: 'staff-1',
        averageBet: 25,
        newBuyIn: 3000,
        chipsTaken: 0,
        playerDailyTotal: 0,
      }),
    ).rejects.toThrow('PATCH failed — 500');

    // Threshold was computed (pure client projection), but the notification
    // must never fire on a failed mutation — operators must not see a
    // success-class toast for a transaction that didn't commit.
    expect(checkCumulativeThreshold).toHaveBeenCalledWith(0, 3000);
    expect(notifyThreshold).not.toHaveBeenCalled();
  });
});
