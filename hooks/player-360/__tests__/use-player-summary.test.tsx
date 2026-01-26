/**
 * usePlayerSummary Hook Tests
 *
 * Tests for the TanStack Query hook that fetches player summary data.
 * Verifies query key generation, enabling logic, and data transformation.
 *
 * @see PRD-023 Player 360 Panels v0
 * @see WS7 Testing & QA
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { player360DashboardKeys } from '@/services/player360-dashboard/keys';

// === Mocks ===

// Mock the Supabase client
const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn(),
};

jest.mock('@/lib/supabase/client', () => ({
  createBrowserComponentClient: () => mockSupabase,
}));

// Mock the CRUD function
const mockGetPlayerSummary = jest.fn();

jest.mock('@/services/player360-dashboard/crud', () => ({
  getPlayerSummary: (...args: unknown[]) => mockGetPlayerSummary(...args),
}));

// === Test Setup ===

function createWrapper() {
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
}

// Import after mocks are set up
import { usePlayerSummary } from '../use-player-summary';

// === Test Data ===

const mockSummaryData = {
  playerId: 'player-123',
  sessionValue: {
    netWinLoss: 1250,
    theoEstimate: 890,
    lastActionAt: '2026-01-26T10:00:00Z',
    trendPercent: 12.5,
  },
  cashVelocity: {
    ratePerHour: 150,
    sessionTotal: 500,
    lastBuyInAt: '2026-01-26T09:30:00Z',
  },
  engagement: {
    status: 'active' as const,
    durationMinutes: 45,
    lastSeenAt: '2026-01-26T10:00:00Z',
    isActive: true,
  },
  rewardsEligibility: {
    status: 'available' as const,
    nextEligibleAt: null,
    reasonCodes: ['AVAILABLE' as const],
    guidance: null,
  },
  gamingDay: '2026-01-26',
};

describe('usePlayerSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPlayerSummary.mockResolvedValue(mockSummaryData);
  });

  describe('query execution', () => {
    it('fetches player summary on mount', async () => {
      const { result } = renderHook(() => usePlayerSummary('player-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockGetPlayerSummary).toHaveBeenCalledWith(
        mockSupabase,
        'player-123',
        undefined,
      );
    });

    it('returns player summary data', async () => {
      const { result } = renderHook(() => usePlayerSummary('player-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      expect(result.current.data?.playerId).toBe('player-123');
      expect(result.current.data?.sessionValue.netWinLoss).toBe(1250);
    });

    it('passes gamingDay override to service', async () => {
      renderHook(
        () => usePlayerSummary('player-123', { gamingDay: '2026-01-25' }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(mockGetPlayerSummary).toHaveBeenCalled();
      });

      expect(mockGetPlayerSummary).toHaveBeenCalledWith(
        mockSupabase,
        'player-123',
        '2026-01-25',
      );
    });
  });

  describe('enabled option', () => {
    it('does not fetch when enabled is false', async () => {
      const { result } = renderHook(
        () => usePlayerSummary('player-123', { enabled: false }),
        { wrapper: createWrapper() },
      );

      // Wait a tick for the hook to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(result.current.isFetching).toBe(false);
      expect(mockGetPlayerSummary).not.toHaveBeenCalled();
    });

    it('does not fetch when playerId is empty string', async () => {
      const { result } = renderHook(() => usePlayerSummary(''), {
        wrapper: createWrapper(),
      });

      // Wait a tick for the hook to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(result.current.isFetching).toBe(false);
      expect(mockGetPlayerSummary).not.toHaveBeenCalled();
    });

    it('fetches when enabled is true and playerId is valid', async () => {
      renderHook(() => usePlayerSummary('player-123', { enabled: true }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockGetPlayerSummary).toHaveBeenCalled();
      });
    });
  });

  describe('stale time option', () => {
    it('uses default stale time of 30 seconds', async () => {
      const { result } = renderHook(() => usePlayerSummary('player-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Default stale time is 30_000ms (30 seconds)
      // Data should be fresh immediately after fetch
      expect(result.current.isStale).toBe(false);
    });

    it('accepts custom stale time', async () => {
      const { result } = renderHook(
        () => usePlayerSummary('player-123', { staleTime: 60_000 }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Custom stale time should be applied
      expect(result.current.isStale).toBe(false);
    });
  });

  describe('query key generation', () => {
    it('generates correct query key without gaming day', () => {
      const key = player360DashboardKeys.summary({ playerId: 'player-123' });

      // Keys serialize filter objects to stable strings
      expect(key).toEqual([
        'player360-dashboard',
        'summary',
        '[["playerId","player-123"]]',
      ]);
    });

    it('generates correct query key with gaming day', () => {
      const key = player360DashboardKeys.summary({
        playerId: 'player-123',
        gamingDay: '2026-01-25',
      });

      // Keys serialize filter objects to stable strings (alphabetically sorted)
      expect(key).toEqual([
        'player360-dashboard',
        'summary',
        '[["gamingDay","2026-01-25"],["playerId","player-123"]]',
      ]);
    });
  });

  describe('loading states', () => {
    it('returns isPending true while loading', async () => {
      // Make the fetch slow
      mockGetPlayerSummary.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockSummaryData), 100),
          ),
      );

      const { result } = renderHook(() => usePlayerSummary('player-123'), {
        wrapper: createWrapper(),
      });

      // Initially loading
      expect(result.current.isPending).toBe(true);
      expect(result.current.data).toBeUndefined();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });
  });

  describe('error handling', () => {
    it('returns error when fetch fails', async () => {
      const error = new Error('Failed to fetch summary');
      mockGetPlayerSummary.mockRejectedValue(error);

      const { result } = renderHook(() => usePlayerSummary('player-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBe(error);
    });
  });

  describe('data shape', () => {
    it('returns all expected DTO properties', async () => {
      const { result } = renderHook(() => usePlayerSummary('player-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      const data = result.current.data!;

      // Verify all top-level properties
      expect(data).toHaveProperty('playerId');
      expect(data).toHaveProperty('sessionValue');
      expect(data).toHaveProperty('cashVelocity');
      expect(data).toHaveProperty('engagement');
      expect(data).toHaveProperty('rewardsEligibility');
      expect(data).toHaveProperty('gamingDay');

      // Verify nested properties
      expect(data.sessionValue).toHaveProperty('netWinLoss');
      expect(data.sessionValue).toHaveProperty('theoEstimate');
      expect(data.sessionValue).toHaveProperty('trendPercent');
      expect(data.cashVelocity).toHaveProperty('ratePerHour');
      expect(data.engagement).toHaveProperty('status');
      expect(data.rewardsEligibility).toHaveProperty('reasonCodes');
    });
  });
});
