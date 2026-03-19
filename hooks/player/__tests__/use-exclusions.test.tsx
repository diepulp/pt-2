/**
 * Exclusion Hook Tests
 *
 * Tests for useExclusionStatus (representative query) and
 * useCreateExclusion (representative mutation).
 *
 * @see PRD-052 GAP-7
 * @see EXEC-052 WS6
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useCreateExclusion, useExclusionStatus } from '../use-exclusions';

// Mock all HTTP fetchers
jest.mock('@/services/player/exclusion-http', () => ({
  getExclusionStatus: jest.fn(),
  listExclusions: jest.fn(),
  getActiveExclusions: jest.fn(),
  createExclusion: jest.fn(),
  liftExclusion: jest.fn(),
}));

// Import after mock so we get the mock references
import {
  createExclusion as mockCreateExclusion,
  getExclusionStatus as mockGetExclusionStatus,
} from '@/services/player/exclusion-http';

const PLAYER_ID = '123e4567-e89b-12d3-a456-426614174000';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useExclusionStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns status data for a valid playerId', async () => {
    (mockGetExclusionStatus as jest.Mock).mockResolvedValue({
      player_id: PLAYER_ID,
      status: 'blocked',
    });

    const { result } = renderHook(() => useExclusionStatus(PLAYER_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      player_id: PLAYER_ID,
      status: 'blocked',
    });
    expect(mockGetExclusionStatus).toHaveBeenCalledWith(PLAYER_ID);
  });

  it('is disabled when playerId is empty', () => {
    const { result } = renderHook(() => useExclusionStatus(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetExclusionStatus).not.toHaveBeenCalled();
  });
});

describe('useCreateExclusion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls createExclusion with correct arguments', async () => {
    const mockResult = {
      id: 'excl-1',
      player_id: PLAYER_ID,
      exclusion_type: 'trespass',
      enforcement: 'hard_block',
      reason: 'Test reason',
    };
    (mockCreateExclusion as jest.Mock).mockResolvedValue(mockResult);

    const { result } = renderHook(() => useCreateExclusion(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      playerId: PLAYER_ID,
      input: {
        exclusion_type: 'trespass',
        enforcement: 'hard_block',
        reason: 'Test reason',
      },
    });

    expect(mockCreateExclusion).toHaveBeenCalledWith(PLAYER_ID, {
      exclusion_type: 'trespass',
      enforcement: 'hard_block',
      reason: 'Test reason',
    });
  });
});
