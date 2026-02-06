jest.mock('@/lib/supabase/rls-context', () => ({
  injectRLSContext: jest.fn(),
}));

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { injectRLSContext } from '@/lib/supabase/rls-context';
import type { Database } from '@/types/database.types';

import { withRLS } from '../rls';
import type { MiddlewareContext } from '../types';

describe('withRLS middleware', () => {
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

  it('should inject RLS context and call next', async () => {
    (injectRLSContext as jest.Mock).mockResolvedValue(undefined);

    const rlsContext = {
      actorId: 'actor-uuid',
      casinoId: 'casino-uuid',
      staffRole: 'admin',
    };
    const ctx = createContext({ rlsContext });
    const middleware = withRLS();

    const result = await middleware(ctx, mockNext);

    expect(injectRLSContext).toHaveBeenCalledWith(
      mockSupabase,
      rlsContext,
      'test-correlation-id',
    );
    expect(mockNext).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, code: 'OK', data: 'test' });
  });

  it('should throw INTERNAL_ERROR when rlsContext missing', async () => {
    const ctx = createContext(); // No rlsContext
    const middleware = withRLS();

    await expect(middleware(ctx, mockNext)).rejects.toThrow(DomainError);
    await expect(middleware(ctx, mockNext)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'RLS context not available - withAuth must run first',
    });
  });

  it('should throw INTERNAL_ERROR on injection failure', async () => {
    (injectRLSContext as jest.Mock).mockRejectedValue(new Error('RPC failed'));

    const ctx = createContext({
      rlsContext: { actorId: 'a', casinoId: 'c', staffRole: 'r' },
    });
    const middleware = withRLS();

    await expect(middleware(ctx, mockNext)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to inject RLS context',
    });
  });
});
