import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import { withAudit } from '../audit';
import type { MiddlewareContext } from '../types';

describe('withAudit middleware', () => {
  const originalEnv = process.env.NODE_ENV;
  const mockInsert = jest.fn();
  const mockSupabase = {
    from: jest.fn().mockReturnValue({ insert: mockInsert }),
  } as unknown as SupabaseClient<Database>;
  const mockNext = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    mockNext.mockResolvedValue({
      ok: true,
      code: 'OK',
      data: { id: 'test' },
      requestId: 'req-123',
      durationMs: 50,
      timestamp: '2025-01-01T00:00:00Z',
    });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  function createContext(
    overrides?: Partial<MiddlewareContext>,
  ): MiddlewareContext {
    return {
      supabase: mockSupabase,
      correlationId: 'test-correlation-id',
      startedAt: Date.now() - 100,
      domain: 'loyalty',
      action: 'ledger.append',
      rlsContext: {
        actorId: 'actor-uuid',
        casinoId: 'casino-uuid',
        staffRole: 'admin',
      },
      ...overrides,
    };
  }

  it('should write audit log in production', async () => {
    process.env.NODE_ENV = 'production';

    const ctx = createContext();
    const middleware = withAudit();

    await middleware(ctx, mockNext);

    expect(mockSupabase.from).toHaveBeenCalledWith('audit_log');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        casino_id: 'casino-uuid',
        actor_id: 'actor-uuid',
        domain: 'loyalty',
        action: 'ledger.append',
      }),
    );
  });

  it('should skip audit in non-production', async () => {
    process.env.NODE_ENV = 'development';

    const ctx = createContext();
    const middleware = withAudit();

    const result = await middleware(ctx, mockNext);

    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('should not fail request on audit error', async () => {
    process.env.NODE_ENV = 'production';
    mockInsert.mockResolvedValue({ error: new Error('DB error') });
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const ctx = createContext();
    const middleware = withAudit();

    const result = await middleware(ctx, mockNext);

    expect(result.ok).toBe(true); // Request still succeeds
    expect(consoleSpy).toHaveBeenCalledWith(
      '[audit] Failed to write audit log:',
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});
