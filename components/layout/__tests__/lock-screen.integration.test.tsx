/**
 * Lock Screen Integration Test
 *
 * Smoke test: lock → 5 wrong PINs → rate limited → auto sign-out.
 * Verifies the full lifecycle from lock to forced sign-out.
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS7
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock server actions
const mockGetPinStatus = jest.fn();
jest.mock('@/app/actions/auth/get-pin-status', () => ({
  getPinStatusAction: (...args: unknown[]) => mockGetPinStatus(...args),
}));

const mockVerifyPin = jest.fn();
jest.mock('@/app/actions/auth/verify-pin', () => ({
  verifyPinAction: (...args: unknown[]) => mockVerifyPin(...args),
}));

jest.mock('@/app/actions/auth/set-pin', () => ({
  setPinAction: jest.fn(),
}));

// Mock useSignOut
const mockSignOut = jest.fn();
jest.mock('@/hooks/auth/use-sign-out', () => ({
  useSignOut: () => ({
    signOut: mockSignOut,
    isPending: false,
    errorState: { show: false, message: '' },
    retrySignOut: jest.fn(),
    performLocalCleanup: jest.fn(),
  }),
}));

// Mock useLockScreen
const mockUnlock = jest.fn();
jest.mock('@/hooks/ui/use-lock-screen', () => ({
  useLockScreen: () => ({
    isLocked: true,
    lockReason: 'manual',
    lockedAt: Date.now(),
    lock: jest.fn(),
    unlock: mockUnlock,
  }),
}));

jest.mock('@/lib/constants/z-index', () => ({
  Z: { LOCK_SCREEN: 9000, TOASTER: 10000, MODAL: 8000 },
}));

import { LockScreen } from '../lock-screen';

describe('LockScreen integration: rate limit → sign-out', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('auto-signs-out after rate limit response', async () => {
    const user = userEvent.setup();
    let attemptCount = 0;

    mockGetPinStatus.mockResolvedValue({
      ok: true,
      data: { hasPin: true },
    });

    // First 4 attempts: wrong PIN
    // 5th attempt: rate limited
    mockVerifyPin.mockImplementation(async () => {
      attemptCount++;
      if (attemptCount >= 5) {
        return {
          ok: false,
          code: 'RATE_LIMIT_EXCEEDED',
          error: 'Too many attempts',
        };
      }
      return { ok: true, data: { verified: false } };
    });

    render(<LockScreen />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter PIN')).toBeInTheDocument();
    });

    // Submit 5 wrong PINs
    for (let i = 0; i < 5; i++) {
      const input = screen.getByPlaceholderText('Enter PIN');
      await user.clear(input);
      await user.type(input, '9999');

      // Wait for the Unlock button to be enabled
      const unlockBtn = await screen.findByRole('button', { name: /unlock/i });
      await user.click(unlockBtn);

      if (i < 4) {
        // Wait for error message to appear before retrying
        await waitFor(() => {
          expect(screen.getByText('Incorrect PIN')).toBeInTheDocument();
        });
      }
    }

    // After 5th attempt, auto sign-out should be triggered
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });

    expect(mockVerifyPin).toHaveBeenCalledTimes(5);
    expect(mockUnlock).not.toHaveBeenCalled();
  });
});
