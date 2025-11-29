// Jest test helpers (project standard)
import type { SupabaseClient } from '@supabase/supabase-js';

import type { ServiceResult } from '@/lib/http/service-response';
import type { RLSContext } from '@/lib/supabase/rls-context';
import type { Database } from '@/types/database.types';

import type { MiddlewareContext } from '../../types';

/**
 * Default mock RLS context for testing
 */
export const mockRLSContext: RLSContext = {
  actorId: 'actor-uuid-1234',
  casinoId: 'casino-uuid-5678',
  staffRole: 'admin',
};

/**
 * Create mock Supabase client for unit tests
 */
export function createMockSupabase(
  overrides?: Partial<{
    authUser: { id: string } | null;
    authError: Error | null;
    staffData: { id: string; casino_id: string; role: string } | null;
    staffError: Error | null;
    rpcError: Error | null;
    insertError: Error | null;
  }>,
): SupabaseClient<Database> {
  const opts = {
    authUser: { id: 'user-uuid' },
    authError: null,
    staffData: { id: 'staff-uuid', casino_id: 'casino-uuid', role: 'admin' },
    staffError: null,
    rpcError: null,
    insertError: null,
    ...overrides,
  };

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.authUser },
        error: opts.authError,
      }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: opts.staffData,
        error: opts.staffError,
      }),
      insert: jest.fn().mockResolvedValue({
        data: null,
        error: opts.insertError,
      }),
    }),
    rpc: jest.fn().mockResolvedValue({
      data: null,
      error: opts.rpcError,
    }),
  } as unknown as SupabaseClient<Database>;
}

/**
 * Create mock MiddlewareContext for testing
 */
export function createMockContext(
  overrides?: Partial<MiddlewareContext>,
): MiddlewareContext {
  return {
    supabase: createMockSupabase(),
    correlationId: 'test-correlation-id-' + Date.now(),
    startedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Create mock MiddlewareContext with RLS context populated
 */
export function createMockContextWithAuth(
  overrides?: Partial<MiddlewareContext>,
): MiddlewareContext {
  return createMockContext({
    rlsContext: mockRLSContext,
    ...overrides,
  });
}

/**
 * Create a mock next() function for middleware testing
 */
export function createMockNext<T>(returnValue?: Partial<T>) {
  return jest.fn().mockResolvedValue({
    ok: true,
    code: 'OK',
    data: returnValue ?? { id: 'test' },
    requestId: 'test-request-id',
    durationMs: 50,
    timestamp: new Date().toISOString(),
  } satisfies ServiceResult<T | { id: string }>);
}

/**
 * Create a failing mock next() function
 */
export function createFailingMockNext(
  error: Error = new Error('Handler failed'),
) {
  return jest.fn().mockRejectedValue(error);
}
