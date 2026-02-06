jest.mock('@/lib/server-actions/error-map', () => ({
  mapDatabaseError: jest.fn(),
}));

import type { SupabaseClient } from '@supabase/supabase-js';

import { mapDatabaseError } from '@/lib/server-actions/error-map';
import type { Database } from '@/types/database.types';

import { withTracing } from '../tracing';
import type { MiddlewareContext } from '../types';

describe('withTracing middleware', () => {
  const mockSupabase = {} as unknown as SupabaseClient<Database>;
  const mockNext = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (mapDatabaseError as jest.Mock).mockReturnValue({
      code: 'INTERNAL_ERROR',
      message: 'An error occurred',
      httpStatus: 500,
      retryable: false,
    });
  });

  function createContext(
    overrides?: Partial<MiddlewareContext>,
  ): MiddlewareContext {
    return {
      supabase: mockSupabase,
      correlationId: 'test-correlation-id',
      startedAt: Date.now() - 100, // 100ms ago
      ...overrides,
    };
  }

  it('should pass through successful result with metadata', async () => {
    mockNext.mockResolvedValue({
      ok: true,
      code: 'OK',
      data: { id: 'test' },
    });

    const ctx = createContext();
    const middleware = withTracing();

    const result = await middleware(ctx, mockNext);

    expect(result.ok).toBe(true);
    expect(result.requestId).toBe('test-correlation-id');
    expect(result.durationMs).toBeGreaterThanOrEqual(100);
    expect(result.timestamp).toBeDefined();
  });

  it('should map thrown errors to ServiceResult', async () => {
    mockNext.mockRejectedValue(new Error('Database error'));
    (mapDatabaseError as jest.Mock).mockReturnValue({
      code: 'INTERNAL_ERROR',
      message: 'Database error',
      httpStatus: 500,
      retryable: false,
    });

    const ctx = createContext();
    const middleware = withTracing();

    const result = await middleware(ctx, mockNext);

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INTERNAL_ERROR');
    expect(result.error).toBe('Database error');
    expect(result.requestId).toBe('test-correlation-id');
  });

  it('should calculate accurate duration', async () => {
    const startTime = Date.now() - 250; // 250ms ago
    mockNext.mockResolvedValue({ ok: true, code: 'OK', data: null });

    const ctx = createContext({ startedAt: startTime });
    const middleware = withTracing();

    const result = await middleware(ctx, mockNext);

    expect(result.durationMs).toBeGreaterThanOrEqual(250);
    expect(result.durationMs).toBeLessThan(500); // Reasonable upper bound
  });
});
