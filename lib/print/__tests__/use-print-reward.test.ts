/** @jest-environment jsdom */

import { renderHook, act } from '@testing-library/react';

import { usePrintReward } from '../hooks/use-print-reward';

// Mock printReward
const mockCleanup = jest.fn();
let mockPromiseResolve: (value: { success: boolean; error?: string }) => void;

jest.mock('../print-reward', () => ({
  printReward: jest.fn(() => ({
    promise: new Promise((resolve) => {
      mockPromiseResolve = resolve;
    }),
    cleanup: mockCleanup,
  })),
}));

// Mock requestAnimationFrame to fire synchronously
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
});

afterEach(() => {
  (window.requestAnimationFrame as jest.Mock).mockRestore();
});

describe('usePrintReward', () => {
  it('initial state is idle with null error', () => {
    const { result } = renderHook(() => usePrintReward());
    expect(result.current.state).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('transitions to printing when print() called', () => {
    const { result } = renderHook(() => usePrintReward());

    act(() => {
      result.current.print(
        {
          family: 'points_comp',
          ledger_id: 'uuid',
          reward_id: 'r',
          reward_code: 'C',
          reward_name: 'N',
          face_value_cents: 100,
          points_redeemed: 10,
          balance_after: 90,
          player_name: 'P',
          player_id: 'pid',
          casino_name: 'Casino',
          staff_name: 'Staff',
          issued_at: '2026-01-01T00:00:00Z',
        },
        'manual_print',
      );
    });

    expect(result.current.state).toBe('printing');
  });

  it('transitions to success on successful print', async () => {
    const { result } = renderHook(() => usePrintReward());

    act(() => {
      result.current.print(
        {
          family: 'points_comp',
          ledger_id: 'uuid',
          reward_id: 'r',
          reward_code: 'C',
          reward_name: 'N',
          face_value_cents: 100,
          points_redeemed: 10,
          balance_after: 90,
          player_name: 'P',
          player_id: 'pid',
          casino_name: 'Casino',
          staff_name: 'Staff',
          issued_at: '2026-01-01T00:00:00Z',
        },
        'auto_attempt',
      );
    });

    await act(async () => {
      mockPromiseResolve({ success: true });
    });

    expect(result.current.state).toBe('success');
    expect(result.current.error).toBeNull();
  });

  it('transitions to error with message on failed print', async () => {
    const { result } = renderHook(() => usePrintReward());

    act(() => {
      result.current.print(
        {
          family: 'points_comp',
          ledger_id: 'uuid',
          reward_id: 'r',
          reward_code: 'C',
          reward_name: 'N',
          face_value_cents: 100,
          points_redeemed: 10,
          balance_after: 90,
          player_name: 'P',
          player_id: 'pid',
          casino_name: 'Casino',
          staff_name: 'Staff',
          issued_at: '2026-01-01T00:00:00Z',
        },
        'manual_print',
      );
    });

    await act(async () => {
      mockPromiseResolve({ success: false, error: 'Printer not found' });
    });

    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('Printer not found');
  });

  it('resets to printing on subsequent print call (reprint)', async () => {
    const { result } = renderHook(() => usePrintReward());

    // First print → success
    act(() => {
      result.current.print(
        {
          family: 'points_comp',
          ledger_id: 'uuid',
          reward_id: 'r',
          reward_code: 'C',
          reward_name: 'N',
          face_value_cents: 100,
          points_redeemed: 10,
          balance_after: 90,
          player_name: 'P',
          player_id: 'pid',
          casino_name: 'Casino',
          staff_name: 'Staff',
          issued_at: '2026-01-01T00:00:00Z',
        },
        'manual_print',
      );
    });

    await act(async () => {
      mockPromiseResolve({ success: true });
    });
    expect(result.current.state).toBe('success');

    // Second print — should reset to printing
    act(() => {
      result.current.print(
        {
          family: 'points_comp',
          ledger_id: 'uuid',
          reward_id: 'r',
          reward_code: 'C',
          reward_name: 'N',
          face_value_cents: 100,
          points_redeemed: 10,
          balance_after: 90,
          player_name: 'P',
          player_id: 'pid',
          casino_name: 'Casino',
          staff_name: 'Staff',
          issued_at: '2026-01-01T00:00:00Z',
        },
        'manual_reprint',
      );
    });

    expect(result.current.state).toBe('printing');
  });

  it('reset() returns to idle state', async () => {
    const { result } = renderHook(() => usePrintReward());

    act(() => {
      result.current.print(
        {
          family: 'points_comp',
          ledger_id: 'uuid',
          reward_id: 'r',
          reward_code: 'C',
          reward_name: 'N',
          face_value_cents: 100,
          points_redeemed: 10,
          balance_after: 90,
          player_name: 'P',
          player_id: 'pid',
          casino_name: 'Casino',
          staff_name: 'Staff',
          issued_at: '2026-01-01T00:00:00Z',
        },
        'manual_print',
      );
    });

    await act(async () => {
      mockPromiseResolve({ success: true });
    });
    expect(result.current.state).toBe('success');

    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('calls cleanup on previous print job when re-printing', () => {
    const { result } = renderHook(() => usePrintReward());

    act(() => {
      result.current.print(
        {
          family: 'points_comp',
          ledger_id: 'uuid',
          reward_id: 'r',
          reward_code: 'C',
          reward_name: 'N',
          face_value_cents: 100,
          points_redeemed: 10,
          balance_after: 90,
          player_name: 'P',
          player_id: 'pid',
          casino_name: 'Casino',
          staff_name: 'Staff',
          issued_at: '2026-01-01T00:00:00Z',
        },
        'manual_print',
      );
    });

    // Second print should cleanup the first
    act(() => {
      result.current.print(
        {
          family: 'points_comp',
          ledger_id: 'uuid',
          reward_id: 'r',
          reward_code: 'C',
          reward_name: 'N',
          face_value_cents: 100,
          points_redeemed: 10,
          balance_after: 90,
          player_name: 'P',
          player_id: 'pid',
          casino_name: 'Casino',
          staff_name: 'Staff',
          issued_at: '2026-01-01T00:00:00Z',
        },
        'manual_reprint',
      );
    });

    expect(mockCleanup).toHaveBeenCalled();
  });
});
