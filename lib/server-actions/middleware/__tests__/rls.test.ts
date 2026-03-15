jest.mock('@/lib/supabase/rls-context', () => ({
  injectRLSContext: jest.fn(),
}));

jest.mock('@/lib/supabase/dev-context', () => ({
  isDevAuthBypassEnabled: jest.fn().mockReturnValue(false),
}));

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { isDevAuthBypassEnabled } from '@/lib/supabase/dev-context';
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

  it('should inject RLS context via RPC and call next', async () => {
    const rpcContext = {
      actorId: 'actor-uuid',
      casinoId: 'casino-uuid',
      staffRole: 'admin',
    };
    (injectRLSContext as jest.Mock).mockResolvedValue(rpcContext);

    const ctx = createContext();
    const middleware = withRLS();

    const result = await middleware(ctx, mockNext);

    expect(injectRLSContext).toHaveBeenCalledWith(
      mockSupabase,
      'test-correlation-id',
    );
    expect(ctx.rlsContext).toEqual(rpcContext);
    expect(mockNext).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, code: 'OK', data: 'test' });
  });

  it('should skip RPC and use existing rlsContext when dev bypass enabled', async () => {
    (isDevAuthBypassEnabled as jest.Mock).mockReturnValue(true);

    const devContext = {
      actorId: 'dev-a',
      casinoId: 'dev-c',
      staffRole: 'dev-r',
    };
    const ctx = createContext({ rlsContext: devContext });
    const middleware = withRLS();

    const result = await middleware(ctx, mockNext);

    expect(injectRLSContext).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, code: 'OK', data: 'test' });
  });

  it('should throw INTERNAL_ERROR on injection failure', async () => {
    (injectRLSContext as jest.Mock).mockRejectedValue(new Error('RPC failed'));

    const ctx = createContext();
    const middleware = withRLS();

    await expect(middleware(ctx, mockNext)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Failed to inject RLS context',
    });
  });
});
