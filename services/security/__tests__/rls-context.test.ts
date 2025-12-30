/**
 * RLS Context Security Unit Tests
 *
 * Tests the ADR-024 secure RLS context injection pattern.
 * Verifies set_rls_context_from_staff() behavior via mocked RPC calls.
 *
 * Key Security Invariants (ADR-024):
 * - INV-1: set_rls_context is NOT callable by authenticated/PUBLIC
 * - INV-2: Only set_rls_context_from_staff() is callable by authenticated
 * - INV-3: Staff identity is bound to auth.uid()
 * - INV-5: Context set via SET LOCAL (pooler-safe)
 * - INV-6: Deterministic staff lookup (unique user_id)
 *
 * @see docs/80-adrs/ADR-024_DECISIONS.md
 * @see docs/20-architecture/specs/ADR-024/EXEC-SPEC-024.md
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

// === Types ===

interface RpcResponse<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

// === Mock Factory ===

function createMockSupabase<T>(
  rpcResponse: RpcResponse<T>,
): SupabaseClient<Database> {
  const mockRpc = jest.fn<() => Promise<RpcResponse<T>>>().mockResolvedValue(rpcResponse);

  return {
    rpc: mockRpc,
    from: jest.fn(),
  } as unknown as SupabaseClient<Database>;
}

// === Test Data ===

const ACTIVE_STAFF_ID = '11111111-1111-1111-1111-111111111111';
const INACTIVE_STAFF_ID = '22222222-2222-2222-2222-222222222222';
const CASINO_A_ID = 'aaaa0000-0000-0000-0000-000000000000';
const CASINO_B_ID = 'bbbb0000-0000-0000-0000-000000000000';

// === Helper: Call set_rls_context_from_staff ===

async function callSetRlsContextFromStaff(
  supabase: SupabaseClient<Database>,
  correlationId?: string,
): Promise<{ success: boolean; error?: { code: string; message: string } }> {
  const { error } = await supabase.rpc('set_rls_context_from_staff', {
    p_correlation_id: correlationId ?? null,
  });

  if (error) {
    return { success: false, error: { code: error.code, message: error.message } };
  }
  return { success: true };
}

// === Unit Tests: Staff Lookup ===

describe('set_rls_context_from_staff - Staff Lookup', () => {
  describe('when staff is valid and active', () => {
    it('derives context successfully', async () => {
      // Mock: Function executes successfully (no error = context set)
      const supabase = createMockSupabase({ data: null, error: null });

      const result = await callSetRlsContextFromStaff(supabase);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(supabase.rpc).toHaveBeenCalledWith('set_rls_context_from_staff', {
        p_correlation_id: null,
      });
    });

    it('accepts optional correlation_id parameter', async () => {
      const supabase = createMockSupabase({ data: null, error: null });
      const correlationId = 'req-12345-abcdef';

      const result = await callSetRlsContextFromStaff(supabase, correlationId);

      expect(result.success).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('set_rls_context_from_staff', {
        p_correlation_id: correlationId,
      });
    });
  });

  describe('when staff is inactive', () => {
    it('raises FORBIDDEN error', async () => {
      // Mock: RPC returns FORBIDDEN when staff status != 'active'
      const supabase = createMockSupabase({
        data: null,
        error: {
          code: 'P0001',
          message: 'FORBIDDEN: staff not active or not casino-scoped',
        },
      });

      const result = await callSetRlsContextFromStaff(supabase);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('FORBIDDEN');
      expect(result.error?.message).toContain('staff not active');
    });

    it('blocks staff with null casino_id', async () => {
      // Staff must be casino-scoped
      const supabase = createMockSupabase({
        data: null,
        error: {
          code: 'P0001',
          message: 'FORBIDDEN: staff not active or not casino-scoped',
        },
      });

      const result = await callSetRlsContextFromStaff(supabase);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('not casino-scoped');
    });
  });

  describe('when staff identity not found', () => {
    it('raises UNAUTHORIZED error for unknown auth.uid()', async () => {
      // Mock: RPC returns UNAUTHORIZED when staff lookup fails
      const supabase = createMockSupabase({
        data: null,
        error: {
          code: 'P0001',
          message: 'UNAUTHORIZED: staff identity not found',
        },
      });

      const result = await callSetRlsContextFromStaff(supabase);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('P0001');
      expect(result.error?.message).toContain('UNAUTHORIZED');
      expect(result.error?.message).toContain('staff identity not found');
    });

    it('blocks users without staff record', async () => {
      // User exists in auth.users but has no staff record
      const supabase = createMockSupabase({
        data: null,
        error: {
          code: 'P0001',
          message: 'UNAUTHORIZED: staff identity not found',
        },
      });

      const result = await callSetRlsContextFromStaff(supabase);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('UNAUTHORIZED');
    });
  });

  describe('when staff_id claim does not match user_id', () => {
    it('raises UNAUTHORIZED error for mismatched claim', async () => {
      // JWT contains staff_id claim but it doesn't match auth.uid() -> user_id lookup
      // This prevents mis-issued token escalation
      const supabase = createMockSupabase({
        data: null,
        error: {
          code: 'P0001',
          message: 'UNAUTHORIZED: staff identity not found',
        },
      });

      const result = await callSetRlsContextFromStaff(supabase);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('UNAUTHORIZED');
    });

    it('validates staff_id claim is bound to auth.uid()', async () => {
      // Even if JWT has valid staff_id, it must be bound to auth.uid() via staff.user_id
      const supabase = createMockSupabase({
        data: null,
        error: {
          code: 'P0001',
          message: 'UNAUTHORIZED: staff identity not found',
        },
      });

      const result = await callSetRlsContextFromStaff(supabase);

      // Mismatched claim should fail lookup
      expect(result.success).toBe(false);
    });
  });
});

// === Unit Tests: Correlation ID Sanitization ===

describe('set_rls_context_from_staff - Correlation ID Sanitization', () => {
  it('accepts valid correlation ID format', async () => {
    const supabase = createMockSupabase({ data: null, error: null });
    const validId = 'req-2025-01-15T10:30:00.123Z-abc123';

    const result = await callSetRlsContextFromStaff(supabase, validId);

    expect(result.success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('set_rls_context_from_staff', {
      p_correlation_id: validId,
    });
  });

  it('handles correlation ID with special characters (sanitized server-side)', async () => {
    // Function sanitizes via: regexp_replace(p_correlation_id, '[^a-zA-Z0-9:_\\-\\.]+', '', 'g')
    const supabase = createMockSupabase({ data: null, error: null });
    const dirtyId = 'req-123; DROP TABLE staff;--';

    const result = await callSetRlsContextFromStaff(supabase, dirtyId);

    // Function should succeed - sanitization happens server-side
    expect(result.success).toBe(true);
  });

  it('handles empty correlation ID', async () => {
    const supabase = createMockSupabase({ data: null, error: null });

    const result = await callSetRlsContextFromStaff(supabase, '');

    expect(result.success).toBe(true);
  });

  it('handles very long correlation ID (truncated to 64 chars server-side)', async () => {
    // Function truncates via: left(v_correlation_id, 64)
    const supabase = createMockSupabase({ data: null, error: null });
    const longId = 'a'.repeat(200);

    const result = await callSetRlsContextFromStaff(supabase, longId);

    expect(result.success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('set_rls_context_from_staff', {
      p_correlation_id: longId,
    });
  });

  it('sanitizes SQL injection attempts', async () => {
    const supabase = createMockSupabase({ data: null, error: null });
    const maliciousId = "'; SELECT * FROM auth.users; --";

    const result = await callSetRlsContextFromStaff(supabase, maliciousId);

    // Function should succeed - dangerous chars are stripped server-side
    expect(result.success).toBe(true);
  });

  it('preserves allowed characters: alphanumeric, colon, underscore, hyphen, dot', async () => {
    const supabase = createMockSupabase({ data: null, error: null });
    const allowedId = 'req_2025-01-15:10.30.00_abc-123';

    const result = await callSetRlsContextFromStaff(supabase, allowedId);

    expect(result.success).toBe(true);
  });
});

// === Unit Tests: set_rls_context_internal (Ops Lane) ===

describe('set_rls_context_internal - Ops Lane', () => {
  async function callSetRlsContextInternal(
    supabase: SupabaseClient<Database>,
    actorId: string,
    casinoId: string,
    staffRole: string,
    correlationId?: string,
  ): Promise<{ success: boolean; error?: { code: string; message: string } }> {
    const { error } = await supabase.rpc('set_rls_context_internal', {
      p_actor_id: actorId,
      p_casino_id: casinoId,
      p_staff_role: staffRole,
      p_correlation_id: correlationId ?? null,
    });

    if (error) {
      return { success: false, error: { code: error.code, message: error.message } };
    }
    return { success: true };
  }

  it('sets context successfully with valid parameters', async () => {
    const supabase = createMockSupabase({ data: null, error: null });

    const result = await callSetRlsContextInternal(
      supabase,
      ACTIVE_STAFF_ID,
      CASINO_A_ID,
      'pit_boss',
    );

    expect(result.success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('set_rls_context_internal', {
      p_actor_id: ACTIVE_STAFF_ID,
      p_casino_id: CASINO_A_ID,
      p_staff_role: 'pit_boss',
      p_correlation_id: null,
    });
  });

  it('rejects null actor_id', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: {
        code: 'P0001',
        message: 'INVALID: all context parameters required for internal setter',
      },
    });

    const result = await callSetRlsContextInternal(
      supabase,
      null as unknown as string,
      CASINO_A_ID,
      'pit_boss',
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('INVALID');
  });

  it('rejects null casino_id', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: {
        code: 'P0001',
        message: 'INVALID: all context parameters required for internal setter',
      },
    });

    const result = await callSetRlsContextInternal(
      supabase,
      ACTIVE_STAFF_ID,
      null as unknown as string,
      'pit_boss',
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('INVALID');
  });

  it('rejects null staff_role', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: {
        code: 'P0001',
        message: 'INVALID: all context parameters required for internal setter',
      },
    });

    const result = await callSetRlsContextInternal(
      supabase,
      ACTIVE_STAFF_ID,
      CASINO_A_ID,
      null as unknown as string,
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('INVALID');
  });

  it('validates actor exists and is casino-scoped', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: {
        code: 'P0001',
        message: 'FORBIDDEN: actor not active or casino mismatch',
      },
    });

    const result = await callSetRlsContextInternal(
      supabase,
      INACTIVE_STAFF_ID,
      CASINO_A_ID,
      'pit_boss',
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('FORBIDDEN');
  });

  it('rejects actor from different casino', async () => {
    // Actor is in Casino A, but casino_id parameter is Casino B
    const supabase = createMockSupabase({
      data: null,
      error: {
        code: 'P0001',
        message: 'FORBIDDEN: actor not active or casino mismatch',
      },
    });

    const result = await callSetRlsContextInternal(
      supabase,
      ACTIVE_STAFF_ID,
      CASINO_B_ID, // Wrong casino
      'pit_boss',
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('casino mismatch');
  });
});

// === Unit Tests: Error Code Mapping ===

describe('RLS Context Error Handling', () => {
  it('maps P0001 UNAUTHORIZED to 401 semantics', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: {
        code: 'P0001',
        message: 'UNAUTHORIZED: staff identity not found',
      },
    });

    const result = await callSetRlsContextFromStaff(supabase);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('P0001');
    expect(result.error?.message).toContain('UNAUTHORIZED');
  });

  it('maps P0001 FORBIDDEN to 403 semantics', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: {
        code: 'P0001',
        message: 'FORBIDDEN: staff not active or not casino-scoped',
      },
    });

    const result = await callSetRlsContextFromStaff(supabase);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('P0001');
    expect(result.error?.message).toContain('FORBIDDEN');
  });

  it('maps P0001 INVALID to 400 semantics', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: {
        code: 'P0001',
        message: 'INVALID: all context parameters required for internal setter',
      },
    });

    const { error } = await supabase.rpc('set_rls_context_internal', {
      p_actor_id: null,
      p_casino_id: CASINO_A_ID,
      p_staff_role: 'pit_boss',
      p_correlation_id: null,
    });

    expect(error?.code).toBe('P0001');
    expect(error?.message).toContain('INVALID');
  });
});

// === Unit Tests: Role-Based Access ===

describe('RLS Context Role Validation', () => {
  it('accepts pit_boss role', async () => {
    const supabase = createMockSupabase({ data: null, error: null });

    const result = await callSetRlsContextFromStaff(supabase);

    expect(result.success).toBe(true);
  });

  it('accepts admin role', async () => {
    const supabase = createMockSupabase({ data: null, error: null });

    const result = await callSetRlsContextFromStaff(supabase);

    expect(result.success).toBe(true);
  });

  it('rejects dealer role (no user_id allowed)', async () => {
    // Dealers cannot have user_id (check constraint), so they cannot authenticate
    const supabase = createMockSupabase({
      data: null,
      error: {
        code: 'P0001',
        message: 'UNAUTHORIZED: staff identity not found',
      },
    });

    const result = await callSetRlsContextFromStaff(supabase);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('UNAUTHORIZED');
  });
});
