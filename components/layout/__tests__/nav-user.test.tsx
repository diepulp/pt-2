/**
 * NavUser Component Tests
 *
 * Validates:
 * - Renders user email and role from useAuth()
 * - Renders loading skeleton when isLoading: true
 * - "Sign out" menu item triggers sign-out handler
 * - "Lock screen" menu item is present and disabled
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS3
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock useAuth
const mockUseAuth = jest.fn();
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock useSignOut
const mockSignOut = jest.fn();
const mockRetrySignOut = jest.fn();
const mockPerformLocalCleanup = jest.fn();
jest.mock('@/hooks/auth/use-sign-out', () => ({
  useSignOut: () => ({
    signOut: mockSignOut,
    isPending: false,
    errorState: { show: false, message: '' },
    retrySignOut: mockRetrySignOut,
    performLocalCleanup: mockPerformLocalCleanup,
  }),
}));

// Mock useLockScreen
const mockLock = jest.fn();
jest.mock('@/hooks/ui/use-lock-screen', () => ({
  useLockScreen: () => ({
    isLocked: false,
    lockReason: null,
    lockedAt: null,
    lock: mockLock,
    unlock: jest.fn(),
  }),
}));

import { NavUser } from '../nav-user';

describe('NavUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeleton when isLoading is true', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      staffId: null,
      casinoId: null,
      staffRole: null,
      isLoading: true,
    });

    const { container } = render(<NavUser />);

    // Skeleton elements should be present (no user data visible)
    expect(container.querySelectorAll('[class*="animate-pulse"], [data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('pitboss@casino.com')).not.toBeInTheDocument();
  });

  it('renders user email and role from useAuth()', () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'pitboss@casino.com' },
      staffId: 'staff-001',
      casinoId: 'casino-001',
      staffRole: 'pit_boss',
      isLoading: false,
    });

    render(<NavUser />);

    expect(screen.getByText('pitboss@casino.com')).toBeInTheDocument();
    expect(screen.getByText('Pit Boss')).toBeInTheDocument();
    // Initials from email
    expect(screen.getByText('PI')).toBeInTheDocument();
  });

  it('"Sign out" menu item triggers sign-out handler', async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue({
      user: { email: 'dealer@casino.com' },
      staffId: 'staff-002',
      casinoId: 'casino-001',
      staffRole: 'dealer',
      isLoading: false,
    });

    render(<NavUser />);

    // Open dropdown
    const trigger = screen.getByRole('button');
    await user.click(trigger);

    // Click "Sign out"
    const signOutItem = screen.getByText('Sign out');
    await user.click(signOutItem);

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('"Lock screen" menu item triggers lock handler', async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue({
      user: { email: 'pitboss@casino.com' },
      staffId: 'staff-001',
      casinoId: 'casino-001',
      staffRole: 'pit_boss',
      isLoading: false,
    });

    render(<NavUser />);

    // Open dropdown
    const trigger = screen.getByRole('button');
    await user.click(trigger);

    // Lock screen item exists and is enabled
    const lockItem = screen.getByText('Lock screen');
    expect(lockItem).toBeInTheDocument();

    // Click it to trigger lock
    await user.click(lockItem);
    expect(mockLock).toHaveBeenCalledWith('manual');
  });

  it('renders "??" initials when no email present', () => {
    mockUseAuth.mockReturnValue({
      user: { email: undefined },
      staffId: null,
      casinoId: null,
      staffRole: null,
      isLoading: false,
    });

    render(<NavUser />);

    expect(screen.getByText('??')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
