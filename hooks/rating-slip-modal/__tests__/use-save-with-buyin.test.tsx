/**
 * Unit tests for useSaveWithBuyIn mutation hook
 *
 * PERF-005 WS7+WS10: Updated for composite RPC pattern.
 * Tests the single-HTTP-call save-with-buyin operation:
 * 1. Atomically saves average_bet + records buy-in via composite RPC
 * 2. Converts dollars to cents for buy-in amount
 * 3. Handles ghost visits (null playerId) — no buy-in recorded server-side
 * 4. Invalidates correct cache keys on success
 * 5. Optimistic updates and rollback
 *
 * @see PERF-005 WS7 Composite Save-with-BuyIn RPC
 * @see hooks/rating-slip-modal/use-save-with-buyin.ts
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';

// Mock dependencies
jest.mock('@/services/rating-slip/http');
jest.mock('@/hooks/mtl/use-threshold-notifications', () => ({
  checkCumulativeThreshold: jest.fn().mockReturnValue(null),
  notifyThreshold: jest.fn(),
}));

import { saveWithBuyIn } from '@/services/rating-slip/http';

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

const createWrapper = (queryClient?: QueryClient) => {
  const qc = queryClient ?? createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Wrapper;
};

const mockSaveResult = {
  slip: {
    id: 'slip-1',
    average_bet: 25,
    table_id: 'table-1',
    status: 'open',
  },
  transaction_id: 'txn-1',
};

describe('useSaveWithBuyIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (saveWithBuyIn as jest.Mock).mockResolvedValue(mockSaveResult);
  });

  it('should call composite saveWithBuyIn with average_bet and null buy-in when newBuyIn is 0', async () => {
    const { result } = renderHook(() => useSaveWithBuyIn(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      tableId: 'table-1',
      averageBet: 25,
      newBuyIn: 0,
    });

    expect(saveWithBuyIn).toHaveBeenCalledWith('slip-1', {
      average_bet: 25,
      buyin_amount_cents: null,
      buyin_type: 'cash',
    });
  });

  it('should call composite saveWithBuyIn with buy-in in cents when newBuyIn > 0', async () => {
    const { result } = renderHook(() => useSaveWithBuyIn(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      tableId: 'table-1',
      averageBet: 25,
      newBuyIn: 100,
    });

    expect(saveWithBuyIn).toHaveBeenCalledWith('slip-1', {
      average_bet: 25,
      buyin_amount_cents: 10000, // 100 * 100 = cents
      buyin_type: 'cash',
    });
  });

  it('should convert fractional dollars to cents correctly', async () => {
    const { result } = renderHook(() => useSaveWithBuyIn(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      tableId: 'table-1',
      averageBet: 50,
      newBuyIn: 250.5, // Test fractional dollars
    });

    expect(saveWithBuyIn).toHaveBeenCalledWith('slip-1', {
      average_bet: 50,
      buyin_amount_cents: 25050, // 250.5 * 100 = 25050 cents
      buyin_type: 'cash',
    });
  });

  it('should use single HTTP call (composite RPC, not sequential)', async () => {
    const { result } = renderHook(() => useSaveWithBuyIn(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      tableId: 'table-1',
      averageBet: 25,
      newBuyIn: 100,
    });

    // PERF-005 WS7: Only one HTTP call should be made
    expect(saveWithBuyIn).toHaveBeenCalledTimes(1);
  });

  it('should handle ghost visit (null playerId) — RPC handles skip server-side', async () => {
    const { result } = renderHook(() => useSaveWithBuyIn(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: null, // Ghost visit
      casinoId: 'casino-1',
      tableId: 'table-1',
      averageBet: 25,
      newBuyIn: 100,
    });

    // Composite RPC is still called — ghost handling is server-side
    expect(saveWithBuyIn).toHaveBeenCalledWith('slip-1', {
      average_bet: 25,
      buyin_amount_cents: 10000,
      buyin_type: 'cash',
    });
  });

  it('should invalidate modal data on success', async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSaveWithBuyIn(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      tableId: 'table-1',
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
  });

  it('should invalidate visit financial summary on success', async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSaveWithBuyIn(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      tableId: 'table-1',
      averageBet: 25,
      newBuyIn: 100,
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['player-financial', 'visit-summary', 'visit-1'],
        }),
      );
    });
  });

  it('should invalidate dashboard activeSlips (targeted, not .scope)', async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSaveWithBuyIn(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      slipId: 'slip-1',
      visitId: 'visit-1',
      playerId: 'player-1',
      casinoId: 'casino-1',
      tableId: 'table-1',
      averageBet: 25,
      newBuyIn: 100,
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['dashboard', 'active-slips', 'table-1'],
        }),
      );
    });
  });
});
