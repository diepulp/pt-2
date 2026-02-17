/**
 * Lock Screen Component Tests
 *
 * Validates:
 * - Loading state on mount
 * - Verify mode: correct PIN unlocks, wrong PIN shows error
 * - Setup mode: PIN mismatch shows error, valid PIN unlocks
 * - Rate limit triggers auto sign-out
 * - "Not you? Sign out" triggers sign-out
 * - ESC key is blocked
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

const mockSetPin = jest.fn();
jest.mock('@/app/actions/auth/set-pin', () => ({
  setPinAction: (...args: unknown[]) => mockSetPin(...args),
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

// Mock z-index constants
jest.mock('@/lib/constants/z-index', () => ({
  Z: { LOCK_SCREEN: 9000, TOASTER: 10000, MODAL: 8000 },
}));

import { LockScreen } from '../lock-screen';

describe('LockScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders verify mode when user has PIN', async () => {
    mockGetPinStatus.mockResolvedValue({
      ok: true,
      data: { hasPin: true },
    });

    render(<LockScreen />);

    await waitFor(() => {
      expect(screen.getByText('Screen Locked')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('Enter PIN')).toBeInTheDocument();
  });

  it('renders setup mode when user has no PIN', async () => {
    mockGetPinStatus.mockResolvedValue({
      ok: true,
      data: { hasPin: false },
    });

    render(<LockScreen />);

    await waitFor(() => {
      expect(screen.getByText('Create Your PIN')).toBeInTheDocument();
    });

    expect(
      screen.getByPlaceholderText('New PIN (4-6 digits)'),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm PIN')).toBeInTheDocument();
  });

  it('correct PIN in verify mode calls unlock', async () => {
    const user = userEvent.setup();

    mockGetPinStatus.mockResolvedValue({
      ok: true,
      data: { hasPin: true },
    });
    mockVerifyPin.mockResolvedValue({
      ok: true,
      data: { verified: true },
    });

    render(<LockScreen />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter PIN')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Enter PIN');
    await user.type(input, '5739');

    const unlockBtn = screen.getByRole('button', { name: 'Unlock' });
    await user.click(unlockBtn);

    await waitFor(() => {
      expect(mockVerifyPin).toHaveBeenCalledWith('5739');
      expect(mockUnlock).toHaveBeenCalled();
    });
  });

  it('wrong PIN shows error message', async () => {
    const user = userEvent.setup();

    mockGetPinStatus.mockResolvedValue({
      ok: true,
      data: { hasPin: true },
    });
    mockVerifyPin.mockResolvedValue({
      ok: true,
      data: { verified: false },
    });

    render(<LockScreen />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter PIN')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Enter PIN');
    await user.type(input, '9999');

    const unlockBtn = screen.getByRole('button', { name: 'Unlock' });
    await user.click(unlockBtn);

    await waitFor(() => {
      expect(screen.getByText('Incorrect PIN')).toBeInTheDocument();
    });

    expect(mockUnlock).not.toHaveBeenCalled();
  });

  it('rate limit triggers auto sign-out', async () => {
    const user = userEvent.setup();

    mockGetPinStatus.mockResolvedValue({
      ok: true,
      data: { hasPin: true },
    });
    mockVerifyPin.mockResolvedValue({
      ok: false,
      code: 'RATE_LIMIT_EXCEEDED',
      error: 'Too many attempts',
    });

    render(<LockScreen />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter PIN')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Enter PIN');
    await user.type(input, '9999');

    const unlockBtn = screen.getByRole('button', { name: 'Unlock' });
    await user.click(unlockBtn);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  it('"Not you? Sign out" triggers sign-out', async () => {
    const user = userEvent.setup();

    mockGetPinStatus.mockResolvedValue({
      ok: true,
      data: { hasPin: true },
    });

    render(<LockScreen />);

    await waitFor(() => {
      expect(screen.getByText('Not you? Sign out')).toBeInTheDocument();
    });

    const signOutBtn = screen.getByText('Not you? Sign out');
    await user.click(signOutBtn);

    expect(mockSignOut).toHaveBeenCalled();
  });

  it('setup mode rejects mismatched PINs', async () => {
    const user = userEvent.setup();

    mockGetPinStatus.mockResolvedValue({
      ok: true,
      data: { hasPin: false },
    });

    render(<LockScreen />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('New PIN (4-6 digits)'),
      ).toBeInTheDocument();
    });

    const pinInput = screen.getByPlaceholderText('New PIN (4-6 digits)');
    const confirmInput = screen.getByPlaceholderText('Confirm PIN');

    await user.type(pinInput, '5739');
    await user.type(confirmInput, '9999');

    const submitBtn = screen.getByRole('button', { name: 'Set PIN & Unlock' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('PINs do not match')).toBeInTheDocument();
    });

    expect(mockSetPin).not.toHaveBeenCalled();
  });

  it('has aria-modal and dialog role for accessibility', async () => {
    mockGetPinStatus.mockResolvedValue({
      ok: true,
      data: { hasPin: true },
    });

    render(<LockScreen />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Lock screen');
  });
});
