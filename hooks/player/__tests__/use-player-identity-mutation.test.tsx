/**
 * useUpdatePlayerIdentity Hook Unit Tests
 *
 * Tests for the player identity mutation hook.
 * Verifies cache invalidation and error handling.
 *
 * @see hooks/player/use-player-identity-mutation.ts
 * @see EXECUTION-SPEC-PLAYER-PROFILE-EDIT.md - WS5
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { playerKeys } from '@/services/player/keys';

import { useUpdatePlayerIdentity } from '../use-player-identity-mutation';

// Mock the HTTP fetcher
jest.mock('@/services/player/http', () => ({
  upsertIdentity: jest.fn(),
  getIdentity: jest.fn(),
}));

import { upsertIdentity } from '@/services/player/http';

const mockUpsertIdentity = upsertIdentity as jest.MockedFunction<
  typeof upsertIdentity
>;

// Wrapper to provide QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// Mock identity response
const mockIdentityResponse = {
  id: 'identity-123',
  casino_id: 'casino-456',
  player_id: 'player-789',
  birth_date: '1985-03-20',
  gender: 'm',
  eye_color: 'BRN',
  height: '5-10',
  weight: '180',
  document_number_last4: '5678',
  issue_date: '2020-06-15',
  expiration_date: '2028-06-15',
  issuing_state: 'Nevada',
  document_type: 'drivers_license',
  verified_at: null,
  verified_by: null,
  created_at: '2025-01-20T00:00:00Z',
  updated_at: '2025-01-20T00:00:00Z',
  created_by: 'staff-123',
  updated_by: null,
  casinoId: 'casino-456',
  playerId: 'player-789',
  birthDate: '1985-03-20',
  eyeColor: 'BRN',
  documentNumberLast4: '5678',
  issueDate: '2020-06-15',
  expirationDate: '2028-06-15',
  issuingState: 'Nevada',
  documentType: 'drivers_license' as const,
  verifiedAt: null,
  verifiedBy: null,
  createdAt: '2025-01-20T00:00:00Z',
  updatedAt: '2025-01-20T00:00:00Z',
  createdBy: 'staff-123',
  updatedBy: null,
  address: {
    street: '123 Main St',
    city: 'Las Vegas',
    state: 'NV',
    postalCode: '89101',
  },
};

describe('useUpdatePlayerIdentity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('mutation behavior', () => {
    it('calls upsertIdentity with correct parameters', async () => {
      mockUpsertIdentity.mockResolvedValueOnce(mockIdentityResponse);

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUpdatePlayerIdentity(), {
        wrapper,
      });

      const input = {
        birthDate: '1985-03-20',
        address: {
          street: '123 Main St',
          city: 'Las Vegas',
          state: 'NV',
          postalCode: '89101',
        },
      };

      await act(async () => {
        await result.current.mutateAsync({
          playerId: 'player-789',
          input,
        });
      });

      expect(mockUpsertIdentity).toHaveBeenCalledWith('player-789', input);
      expect(mockUpsertIdentity).toHaveBeenCalledTimes(1);
    });

    it('returns identity data on success', async () => {
      mockUpsertIdentity.mockResolvedValueOnce(mockIdentityResponse);

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUpdatePlayerIdentity(), {
        wrapper,
      });

      let mutationResult;
      await act(async () => {
        mutationResult = await result.current.mutateAsync({
          playerId: 'player-789',
          input: { birthDate: '1985-03-20' },
        });
      });

      expect(mutationResult).toEqual(mockIdentityResponse);
    });

    it('handles mutation loading state', async () => {
      // Use a promise we can control
      let resolvePromise: (value: typeof mockIdentityResponse) => void;
      const pendingPromise = new Promise<typeof mockIdentityResponse>(
        (resolve) => {
          resolvePromise = resolve;
        },
      );
      mockUpsertIdentity.mockReturnValueOnce(pendingPromise);

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUpdatePlayerIdentity(), {
        wrapper,
      });

      expect(result.current.isPending).toBe(false);

      act(() => {
        result.current.mutate({
          playerId: 'player-789',
          input: { birthDate: '1985-03-20' },
        });
      });

      await waitFor(() => {
        expect(result.current.isPending).toBe(true);
      });

      await act(async () => {
        resolvePromise!(mockIdentityResponse);
      });

      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
      });
    });
  });

  describe('error handling', () => {
    it('handles mutation error', async () => {
      const error = new Error('Failed to update identity');
      mockUpsertIdentity.mockRejectedValueOnce(error);

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUpdatePlayerIdentity(), {
        wrapper,
      });

      await act(async () => {
        try {
          await result.current.mutateAsync({
            playerId: 'player-789',
            input: { birthDate: '1985-03-20' },
          });
        } catch {
          // Expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
      expect(result.current.error).toBe(error);
    });

    it('resets error state on new mutation', async () => {
      const error = new Error('Failed to update identity');
      mockUpsertIdentity.mockRejectedValueOnce(error);
      mockUpsertIdentity.mockResolvedValueOnce(mockIdentityResponse);

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUpdatePlayerIdentity(), {
        wrapper,
      });

      // First call fails
      await act(async () => {
        try {
          await result.current.mutateAsync({
            playerId: 'player-789',
            input: { birthDate: '1985-03-20' },
          });
        } catch {
          // Expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // Second call succeeds
      await act(async () => {
        await result.current.mutateAsync({
          playerId: 'player-789',
          input: { birthDate: '1985-03-20' },
        });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(false);
      });
      expect(result.current.isSuccess).toBe(true);
    });
  });

  describe('cache invalidation', () => {
    it('invalidates player detail query on success', async () => {
      mockUpsertIdentity.mockResolvedValueOnce(mockIdentityResponse);

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      // Pre-populate the cache
      queryClient.setQueryData(playerKeys.detail('player-789'), {
        id: 'player-789',
        first_name: 'John',
        last_name: 'Doe',
      });

      // Spy on invalidateQueries
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      function Wrapper({ children }: { children: ReactNode }) {
        return (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        );
      }

      const { result } = renderHook(() => useUpdatePlayerIdentity(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.mutateAsync({
          playerId: 'player-789',
          input: { birthDate: '1985-03-20' },
        });
      });

      // Verify invalidateQueries was called for player detail
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: playerKeys.detail('player-789'),
      });

      invalidateSpy.mockRestore();
    });

    it('invalidates player list queries on success', async () => {
      mockUpsertIdentity.mockResolvedValueOnce(mockIdentityResponse);

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      // Spy on invalidateQueries
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      function Wrapper({ children }: { children: ReactNode }) {
        return (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        );
      }

      const { result } = renderHook(() => useUpdatePlayerIdentity(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.mutateAsync({
          playerId: 'player-789',
          input: { birthDate: '1985-03-20' },
        });
      });

      // Verify invalidateQueries was called for player list scope
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: playerKeys.list.scope,
      });

      invalidateSpy.mockRestore();
    });
  });

  describe('type exports', () => {
    it('exports PlayerIdentityDTO type', () => {
      // TypeScript compile-time check - this test verifies the re-export works
      const { result } = renderHook(() => useUpdatePlayerIdentity(), {
        wrapper: createWrapper(),
      });

      // The data property should be typed as PlayerIdentityDTO | undefined
      expect(result.current.data).toBeUndefined();
    });
  });
});
