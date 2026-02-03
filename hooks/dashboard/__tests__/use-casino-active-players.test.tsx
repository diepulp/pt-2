/**
 * useCasinoActivePlayers Hook Unit Tests
 *
 * Tests for the casino-wide active players TanStack Query hook.
 * Verifies API fetching, error handling, and query key generation.
 *
 * @see PERF-003 Casino-Wide Activity Panel
 * @see hooks/dashboard/use-casino-active-players.ts
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { dashboardKeys } from '../keys';
import { useCasinoActivePlayers } from '../use-casino-active-players';

// === Test Setup ===

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

// === Mock Data ===

const mockActivePlayersResponse = {
  ok: true,
  data: {
    items: [
      {
        slipId: 'slip-1',
        visitId: 'visit-1',
        tableId: 'table-1',
        tableName: 'Blackjack 1',
        pitName: 'Main Pit',
        seatNumber: '3',
        startTime: '2026-01-26T10:00:00Z',
        status: 'open',
        averageBet: 100,
        player: {
          id: 'player-1',
          firstName: 'John',
          lastName: 'Doe',
          birthDate: '1985-03-15',
          tier: 'Gold',
        },
      },
    ],
    count: 1,
  },
};

// === Tests ===

describe('useCasinoActivePlayers', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ===========================================================================
  // Successful Fetch
  // ===========================================================================

  describe('successful fetch', () => {
    it('returns data on successful fetch', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve(mockActivePlayersResponse),
      });

      const { result } = renderHook(() => useCasinoActivePlayers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockActivePlayersResponse.data);
      expect(result.current.data?.items).toHaveLength(1);
      expect(result.current.data?.count).toBe(1);
    });

    it('returns items array with player data', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve(mockActivePlayersResponse),
      });

      const { result } = renderHook(() => useCasinoActivePlayers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const player = result.current.data?.items[0];
      expect(player?.slipId).toBe('slip-1');
      expect(player?.player?.firstName).toBe('John');
      expect(player?.status).toBe('open');
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('error handling', () => {
    it('handles API error response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            ok: false,
            error: 'Unauthorized',
          }),
      });

      const { result } = renderHook(() => useCasinoActivePlayers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Unauthorized');
    });

    it('handles network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useCasinoActivePlayers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Network error');
    });

    it('handles missing error message in response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            ok: false,
          }),
      });

      const { result } = renderHook(() => useCasinoActivePlayers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe(
        'Failed to fetch active players',
      );
    });
  });

  // ===========================================================================
  // Search Parameter
  // ===========================================================================

  describe('search parameter', () => {
    it('passes search parameter to API', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve(mockActivePlayersResponse),
      });

      renderHook(() => useCasinoActivePlayers({ search: 'John' }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/rating-slips/active-players?search=John',
      );
    });

    it('omits search parameter when undefined', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve(mockActivePlayersResponse),
      });

      renderHook(() => useCasinoActivePlayers({ search: undefined }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/rating-slips/active-players',
      );
    });
  });

  // ===========================================================================
  // Limit Parameter
  // ===========================================================================

  describe('limit parameter', () => {
    it('passes limit parameter to API', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve(mockActivePlayersResponse),
      });

      renderHook(() => useCasinoActivePlayers({ limit: 50 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/rating-slips/active-players?limit=50',
      );
    });

    it('passes both search and limit parameters', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve(mockActivePlayersResponse),
      });

      renderHook(() => useCasinoActivePlayers({ search: 'John', limit: 100 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/rating-slips/active-players?search=John&limit=100',
      );
    });
  });

  // ===========================================================================
  // Enabled Option
  // ===========================================================================

  describe('enabled option', () => {
    it('does not fetch when disabled', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve(mockActivePlayersResponse),
      });

      const { result } = renderHook(
        () => useCasinoActivePlayers({ enabled: false }),
        { wrapper: createWrapper() },
      );

      // Wait a bit to ensure no fetch happens
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isFetching).toBe(false);
    });

    it('fetches when enabled (default)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve(mockActivePlayersResponse),
      });

      renderHook(() => useCasinoActivePlayers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Query Key Generation
  // ===========================================================================

  describe('query key generation', () => {
    it('generates correct query key without options', () => {
      const key = dashboardKeys.casinoActivePlayers();
      expect(key).toEqual(['dashboard', 'casino-active-players', {}]);
    });

    it('generates correct query key with search', () => {
      const key = dashboardKeys.casinoActivePlayers({ search: 'John' });
      expect(key).toEqual([
        'dashboard',
        'casino-active-players',
        { search: 'John' },
      ]);
    });

    it('generates correct query key with limit', () => {
      const key = dashboardKeys.casinoActivePlayers({ limit: 50 });
      expect(key).toEqual([
        'dashboard',
        'casino-active-players',
        { limit: 50 },
      ]);
    });

    it('generates correct query key with both options', () => {
      const key = dashboardKeys.casinoActivePlayers({
        search: 'John',
        limit: 100,
      });
      expect(key).toEqual([
        'dashboard',
        'casino-active-players',
        { search: 'John', limit: 100 },
      ]);
    });

    it('different options generate different keys (no cache sharing)', () => {
      const key1 = dashboardKeys.casinoActivePlayers({});
      const key2 = dashboardKeys.casinoActivePlayers({ limit: 200 });

      expect(key1).not.toEqual(key2);
    });
  });

  // ===========================================================================
  // Loading State
  // ===========================================================================

  describe('loading state', () => {
    it('returns isLoading true initially', async () => {
      global.fetch = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  json: () => Promise.resolve(mockActivePlayersResponse),
                }),
              100,
            ),
          ),
      );

      const { result } = renderHook(() => useCasinoActivePlayers(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });
});
