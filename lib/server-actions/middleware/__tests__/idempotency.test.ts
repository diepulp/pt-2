import { DomainError } from '@/lib/errors/domain-errors';

import { withIdempotency } from '../idempotency';
import type { MiddlewareContext } from '../types';

describe('withIdempotency middleware', () => {
  const mockSupabase = {} as any;
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

  it('should pass through when key is present', async () => {
    const ctx = createContext({ idempotencyKey: 'test-key-123' });
    const middleware = withIdempotency(true);

    const result = await middleware(ctx, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, code: 'OK', data: 'test' });
  });

  it('should throw VALIDATION_ERROR when required key is missing', async () => {
    const ctx = createContext(); // No idempotencyKey
    const middleware = withIdempotency(true);

    await expect(middleware(ctx, mockNext)).rejects.toThrow(DomainError);
    await expect(middleware(ctx, mockNext)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Missing required x-idempotency-key header for mutation',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should pass through when required=false and key is missing', async () => {
    const ctx = createContext(); // No idempotencyKey
    const middleware = withIdempotency(false);

    const result = await middleware(ctx, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, code: 'OK', data: 'test' });
  });
});
