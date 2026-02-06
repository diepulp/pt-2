// Mock getAuthContext
jest.mock('@/lib/supabase/rls-context', () => ({
  getAuthContext: jest.fn(),
}));

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { getAuthContext } from '@/lib/supabase/rls-context';
import type { Database } from '@/types/database.types';

import { withAuth } from '../auth';
import type { MiddlewareContext } from '../types';

describe('withAuth middleware', () => {
  const mockSupabase = {} as unknown as SupabaseClient<Database>;
  const mockNext = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockNext.mockResolvedValue({ ok: true, code: 'OK', data: 'test' });
  });

  function createContext(
    overrides?: Partial<MiddlewareContext>,
  ): MiddlewareContext {
    return {
      supabase: mockSupabase,
      correlationId: 'test-correlation-id',
      startedAt: Date.now(),
      ...overrides,
    };
  }

  it('should populate rlsContext on successful auth', async () => {
    const mockRlsContext = {
      actorId: 'actor-uuid',
      casinoId: 'casino-uuid',
      staffRole: 'admin',
    };
    (getAuthContext as jest.Mock).mockResolvedValue(mockRlsContext);

    const ctx = createContext();
    const middleware = withAuth();

    await middleware(ctx, mockNext);

    expect(ctx.rlsContext).toEqual(mockRlsContext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should throw UNAUTHORIZED when no user', async () => {
    (getAuthContext as jest.Mock).mockRejectedValue(
      new Error('UNAUTHORIZED: No authenticated user'),
    );

    const ctx = createContext();
    const middleware = withAuth();

    await expect(middleware(ctx, mockNext)).rejects.toThrow(DomainError);
    await expect(middleware(ctx, mockNext)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('should throw FORBIDDEN when user not active staff', async () => {
    (getAuthContext as jest.Mock).mockRejectedValue(
      new Error('FORBIDDEN: User is not active staff'),
    );

    const ctx = createContext();
    const middleware = withAuth();

    await expect(middleware(ctx, mockNext)).rejects.toThrow(DomainError);
    await expect(middleware(ctx, mockNext)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('should throw FORBIDDEN when no casino assignment', async () => {
    (getAuthContext as jest.Mock).mockRejectedValue(
      new Error('FORBIDDEN: Staff member has no casino assignment'),
    );

    const ctx = createContext();
    const middleware = withAuth();

    await expect(middleware(ctx, mockNext)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('should throw INTERNAL_ERROR for unexpected errors', async () => {
    (getAuthContext as jest.Mock).mockRejectedValue(
      new Error('Database connection failed'),
    );

    const ctx = createContext();
    const middleware = withAuth();

    await expect(middleware(ctx, mockNext)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});
