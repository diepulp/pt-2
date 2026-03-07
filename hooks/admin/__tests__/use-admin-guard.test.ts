const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockUseAuth = jest.fn();
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

import { renderHook } from '@testing-library/react';

import { useAdminGuard } from '../use-admin-guard';

describe('useAdminGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows admin role', () => {
    mockUseAuth.mockReturnValue({
      staffRole: 'admin',
      isLoading: false,
    });

    const { result } = renderHook(() => useAdminGuard());

    expect(result.current.isAuthorized).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('allows pit_boss role', () => {
    mockUseAuth.mockReturnValue({
      staffRole: 'pit_boss',
      isLoading: false,
    });

    const { result } = renderHook(() => useAdminGuard());

    expect(result.current.isAuthorized).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects dealer role', () => {
    mockUseAuth.mockReturnValue({
      staffRole: 'dealer',
      isLoading: false,
    });

    renderHook(() => useAdminGuard());

    expect(mockReplace).toHaveBeenCalledWith(
      '/shift-dashboard?toast=admin_required',
    );
  });

  it('redirects cashier role', () => {
    mockUseAuth.mockReturnValue({
      staffRole: 'cashier',
      isLoading: false,
    });

    renderHook(() => useAdminGuard());

    expect(mockReplace).toHaveBeenCalledWith(
      '/shift-dashboard?toast=admin_required',
    );
  });

  it('redirects null role', () => {
    mockUseAuth.mockReturnValue({
      staffRole: null,
      isLoading: false,
    });

    renderHook(() => useAdminGuard());

    expect(mockReplace).toHaveBeenCalledWith(
      '/shift-dashboard?toast=admin_required',
    );
  });

  it('does not redirect while loading', () => {
    mockUseAuth.mockReturnValue({
      staffRole: null,
      isLoading: true,
    });

    const { result } = renderHook(() => useAdminGuard());

    expect(result.current.isLoading).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
