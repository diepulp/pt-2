// Mock all middleware dependencies
jest.mock('@/lib/supabase/rls-context', () => ({
  getAuthContext: jest.fn().mockResolvedValue({
    actorId: 'actor-uuid',
    casinoId: 'casino-uuid',
    staffRole: 'admin',
  }),
  injectRLSContext: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/correlation', () => ({
  runWithCorrelation: jest.fn((id, fn) => fn()),
}));

jest.mock('@/lib/server-actions/error-map', () => ({
  mapDatabaseError: jest.fn((error: unknown) => {
    // Preserve DomainError properties
    if (error && typeof error === 'object' && 'code' in error) {
      const domainError = error as { code: string; message: string };
      return {
        code: domainError.code,
        message: domainError.message,
        httpStatus: domainError.code === 'VALIDATION_ERROR' ? 400 : 500,
        retryable: false,
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: 'Error',
      httpStatus: 500,
      retryable: false,
    };
  }),
}));

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ServiceResult } from '@/lib/http/service-response';
import { getAuthContext } from '@/lib/supabase/rls-context';
import type { Database } from '@/types/database.types';

import { withServerAction, createServerActionWrapper } from '../compositor';

describe('withServerAction compositor', () => {
  const mockSupabase = {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue({ error: null }),
    }),
  } as unknown as SupabaseClient<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  it('should execute full middleware chain', async () => {
    const handler = jest.fn().mockResolvedValue({
      ok: true,
      code: 'OK',
      data: { id: 'test' },
    } as ServiceResult<{ id: string }>);

    const result = await withServerAction(mockSupabase, handler, {
      domain: 'test',
      action: 'test.action',
    });

    expect(handler).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.requestId).toBeDefined();
    expect(result.durationMs).toBeDefined();
  });

  it('should skip auth when skipAuth=true', async () => {
    const handler = jest.fn().mockResolvedValue({
      ok: true,
      code: 'OK',
      data: null,
    });

    await withServerAction(mockSupabase, handler, { skipAuth: true });

    expect(getAuthContext).not.toHaveBeenCalled();
  });

  it('should require idempotency key when configured', async () => {
    const handler = jest.fn();

    const result = await withServerAction(mockSupabase, handler, {
      requireIdempotency: true,
      // No idempotencyKey provided
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should pass with idempotency key when required', async () => {
    const handler = jest.fn().mockResolvedValue({
      ok: true,
      code: 'OK',
      data: null,
    });

    const result = await withServerAction(mockSupabase, handler, {
      requireIdempotency: true,
      idempotencyKey: 'test-key-123',
    });

    expect(result.ok).toBe(true);
    expect(handler).toHaveBeenCalled();
  });
});

describe('createServerActionWrapper', () => {
  const mockSupabase = {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue({ error: null }),
    }),
  } as any;

  it('should create wrapper with default config', async () => {
    const wrapper = createServerActionWrapper({
      domain: 'loyalty',
      requireIdempotency: true,
    });

    const handler = jest.fn().mockResolvedValue({
      ok: true,
      code: 'OK',
      data: null,
    });

    // Should fail without idempotency key (from default config)
    const result = await wrapper(mockSupabase, handler, {
      action: 'ledger.append',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
  });
});
