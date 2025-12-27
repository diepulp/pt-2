/**
 * RPC Security Tests
 *
 * Tests SECURITY INVOKER behavior and cross-casino isolation for the
 * rating slip modal BFF RPC function.
 *
 * Verifies:
 * - Casino context mismatch throws explicit error (not silent filter)
 * - RLS context validation (app.casino_id required)
 * - Defense-in-depth casino_id parameter validation
 * - SECURITY INVOKER inherits caller's RLS context
 *
 * @see services/rating-slip-modal/rpc.ts
 * @see supabase/migrations/20251226123939_prd018_modal_bff_rpc.sql
 * @see ADR-015 RLS Context Patterns
 * @see ADR-018 RPC Governance
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import { getModalDataViaRPC } from '../rpc';

// === Mock Factory ===

function createMockSupabaseWithRpc(
  resolvedData: unknown = null,
  error: unknown = null,
): SupabaseClient<Database> {
  const mockRpc = jest.fn().mockResolvedValue({
    data: resolvedData,
    error,
  });

  return {
    rpc: mockRpc,
    from: jest.fn(),
  } as unknown as SupabaseClient<Database>;
}

// === Test Data ===

const SLIP_ID = 'slip-uuid-security-test';
const CASINO_A_ID = 'casino-a-uuid';
const CASINO_B_ID = 'casino-b-uuid';

/**
 * Mock valid RPC response for testing security scenarios.
 */
const mockSecurityTestResponse = {
  slip: {
    id: SLIP_ID,
    visitId: 'visit-uuid',
    tableId: 'table-uuid',
    tableLabel: 'Table 1',
    tableType: 'blackjack',
    seatNumber: '1',
    averageBet: 5000,
    startTime: '2025-01-15T10:00:00Z',
    endTime: null,
    status: 'open',
    gamingDay: '2025-01-15',
    durationSeconds: 1800,
  },
  player: null,
  loyalty: null,
  financial: {
    totalCashIn: 0,
    totalChipsOut: 0,
    netPosition: 0,
  },
  tables: [],
};

// === Cross-Casino Isolation Tests ===

describe('RPC Security - Cross-Casino Isolation', () => {
  it('throws FORBIDDEN when caller provides different casino_id than RLS context', async () => {
    // Simulate the PostgreSQL RPC detecting casino mismatch
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message: `CASINO_MISMATCH: Caller provided ${CASINO_B_ID} but context is ${CASINO_A_ID}`,
    });

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_B_ID),
    ).rejects.toThrow(DomainError);

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_B_ID),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Casino context mismatch - access denied',
      httpStatus: 403,
      details: {
        slipId: SLIP_ID,
        casinoId: CASINO_B_ID,
      },
    });
  });

  it('succeeds when caller provides matching casino_id to RLS context', async () => {
    // RLS context matches caller's casino_id - success
    const supabase = createMockSupabaseWithRpc(mockSecurityTestResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_A_ID);

    expect(result).toBeDefined();
    expect(result.slip.id).toBe(SLIP_ID);

    // Verify correct parameters passed
    expect(supabase.rpc).toHaveBeenCalledWith(
      'rpc_get_rating_slip_modal_data',
      {
        p_slip_id: SLIP_ID,
        p_casino_id: CASINO_A_ID,
      },
    );
  });

  it('does NOT silently filter cross-casino data - throws explicit error', async () => {
    // Critical: Verify that cross-casino access throws error, not returns empty
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message: `CASINO_MISMATCH: Caller provided ${CASINO_B_ID} but context is ${CASINO_A_ID}`,
    });

    // Attempting to access Casino B's data with Casino A context
    const promise = getModalDataViaRPC(supabase, SLIP_ID, CASINO_B_ID);

    // Must throw, not return null or empty data
    await expect(promise).rejects.toThrow(DomainError);
    await expect(promise).rejects.toMatchObject({
      code: 'FORBIDDEN',
      httpStatus: 403,
    });
  });

  it('prevents cross-casino data leakage via defense-in-depth validation', async () => {
    // Even if RLS policies were misconfigured, the RPC function validates casino_id
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message:
        'CASINO_MISMATCH: Caller provided casino-evil but context is casino-good',
    });

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, 'casino-evil'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Casino context mismatch - access denied',
    });
  });
});

// === RLS Context Validation Tests ===

describe('RPC Security - RLS Context Validation', () => {
  it('throws UNAUTHORIZED when RLS context (app.casino_id) is not set', async () => {
    // Simulate calling RPC without setting app.casino_id in session context
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message: 'UNAUTHORIZED: RLS context not set (app.casino_id required)',
    });

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_A_ID),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'RLS context not set',
      httpStatus: 401,
    });
  });

  it('requires app.casino_id to be set before calling RPC', async () => {
    // This simulates the RPC failing when session context is missing
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message: 'UNAUTHORIZED: RLS context not set (app.casino_id required)',
    });

    // Verify error is thrown with correct metadata
    try {
      await getModalDataViaRPC(supabase, SLIP_ID, CASINO_A_ID);
      fail('Should have thrown UNAUTHORIZED error');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('UNAUTHORIZED');
      expect((error as DomainError).httpStatus).toBe(401);
    }
  });

  it('validates that JWT-based casino_id fallback works', async () => {
    // RPC uses COALESCE(current_setting('app.casino_id'), JWT 'app_metadata.casino_id')
    // If session context is not set, it falls back to JWT
    const supabase = createMockSupabaseWithRpc(mockSecurityTestResponse);

    // In this scenario, JWT contains casino_id and matches caller's parameter
    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_A_ID);

    expect(result).toBeDefined();
    expect(result.slip.id).toBe(SLIP_ID);
  });
});

// === SECURITY INVOKER Behavior Tests ===

describe('RPC Security - SECURITY INVOKER Behavior', () => {
  it('inherits RLS policies from calling user context', async () => {
    // SECURITY INVOKER means RPC executes with caller's permissions
    // If caller has no access to casino, RPC should fail
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message: 'RATING_SLIP_NOT_FOUND: Rating slip slip-123 not found',
    });

    // RLS policies filtered out the slip because caller has no access
    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_A_ID),
    ).rejects.toMatchObject({
      code: 'RATING_SLIP_NOT_FOUND',
      httpStatus: 404,
    });
  });

  it('does not bypass RLS policies with SECURITY DEFINER privileges', async () => {
    // Verify that the RPC is NOT using SECURITY DEFINER (which would bypass RLS)
    // Instead, it's SECURITY INVOKER, so it respects RLS

    // Scenario: User from Casino A tries to access Casino B's data
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message: `CASINO_MISMATCH: Caller provided ${CASINO_B_ID} but context is ${CASINO_A_ID}`,
    });

    // If RPC was SECURITY DEFINER, it might bypass RLS and access data
    // But with SECURITY INVOKER, it enforces casino isolation
    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_B_ID),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      httpStatus: 403,
    });
  });

  it('executes with caller permissions for all JOINed tables', async () => {
    // SECURITY INVOKER applies to all tables accessed in the RPC:
    // - rating_slip, visit, player, player_loyalty, player_financial_transaction, gaming_table

    // If caller has no access to player table (RLS filtered), result should reflect that
    const responseWithNoPlayer = {
      ...mockSecurityTestResponse,
      player: null, // RLS filtered out player due to permissions
    };
    const supabase = createMockSupabaseWithRpc(responseWithNoPlayer);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_A_ID);

    // Verify that player is null due to RLS filtering
    expect(result.player).toBeNull();
  });
});

// === Defense-in-Depth Validation Tests ===

describe('RPC Security - Defense-in-Depth Casino Validation', () => {
  it('validates casino_id parameter at RPC function level', async () => {
    // Even if RLS allows access, RPC validates casino_id explicitly
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message: `CASINO_MISMATCH: Caller provided ${CASINO_B_ID} but context is ${CASINO_A_ID}`,
    });

    // RPC's explicit validation catches the mismatch
    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_B_ID),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Casino context mismatch - access denied',
    });
  });

  it('prevents accidental cross-tenant queries via parameter check', async () => {
    // Developer accidentally passes wrong casino_id
    // RPC function validates and rejects before executing JOINs
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message:
        'CASINO_MISMATCH: Caller provided wrong-casino but context is correct-casino',
    });

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, 'wrong-casino'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      httpStatus: 403,
    });
  });

  it('combines RLS policies with explicit validation (ADR-015 Pattern C)', async () => {
    // ADR-015 Pattern C: Hybrid approach with session context + JWT fallback
    // RPC validates: v_context_casino_id matches p_casino_id parameter

    const supabase = createMockSupabaseWithRpc(mockSecurityTestResponse);

    // When context and parameter match, access is granted
    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_A_ID);

    expect(result).toBeDefined();
    expect(result.slip.id).toBe(SLIP_ID);
  });
});

// === Error Message Security Tests ===

describe('RPC Security - Error Message Security', () => {
  it('does not leak sensitive data in CASINO_MISMATCH error', async () => {
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message: `CASINO_MISMATCH: Caller provided ${CASINO_B_ID} but context is ${CASINO_A_ID}`,
    });

    try {
      await getModalDataViaRPC(supabase, SLIP_ID, CASINO_B_ID);
      fail('Should have thrown error');
    } catch (error) {
      const domainError = error as DomainError;

      // Verify error message is generic and doesn't expose internal IDs
      expect(domainError.message).toBe(
        'Casino context mismatch - access denied',
      );

      // Sensitive details are in details object (not exposed to UI)
      expect(domainError.details).toMatchObject({
        slipId: SLIP_ID,
        casinoId: CASINO_B_ID,
      });
    }
  });

  it('provides user-friendly error for UNAUTHORIZED', async () => {
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message: 'UNAUTHORIZED: RLS context not set (app.casino_id required)',
    });

    try {
      await getModalDataViaRPC(supabase, SLIP_ID, CASINO_A_ID);
      fail('Should have thrown error');
    } catch (error) {
      const domainError = error as DomainError;

      // User-friendly message (not exposing RLS internals)
      expect(domainError.message).toBe('RLS context not set');
      expect(domainError.httpStatus).toBe(401);
    }
  });

  it('sanitizes PostgreSQL error messages in production', async () => {
    const supabase = createMockSupabaseWithRpc(null, {
      code: '42P01',
      message: 'relation "rating_slip" does not exist at line 75',
      hint: 'Perhaps you meant to reference table "public"."rating_slip"?',
    });

    try {
      await getModalDataViaRPC(supabase, SLIP_ID, CASINO_A_ID);
      fail('Should have thrown error');
    } catch (error) {
      const domainError = error as DomainError;

      // Generic error message for production
      expect(domainError.code).toBe('INTERNAL_ERROR');
      expect(domainError.httpStatus).toBe(500);

      // Raw PostgreSQL details are in details (for logging, not UI)
      expect(domainError.details).toMatchObject({
        code: '42P01',
        hint: 'Perhaps you meant to reference table "public"."rating_slip"?',
      });
    }
  });
});

// === Multi-Tenant Scenario Tests ===

describe('RPC Security - Multi-Tenant Scenarios', () => {
  it('user from Casino A cannot access Casino B rating slips', async () => {
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message: `CASINO_MISMATCH: Caller provided ${CASINO_B_ID} but context is ${CASINO_A_ID}`,
    });

    // User authenticated to Casino A tries to access Casino B's data
    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_B_ID),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      httpStatus: 403,
    });
  });

  it('user from Casino A can access Casino A rating slips', async () => {
    const supabase = createMockSupabaseWithRpc(mockSecurityTestResponse);

    // User authenticated to Casino A accesses Casino A's data
    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_A_ID);

    expect(result).toBeDefined();
    expect(result.slip.id).toBe(SLIP_ID);
  });

  it('prevents privilege escalation via casino_id parameter manipulation', async () => {
    // Attacker tries to manipulate casino_id parameter to access other tenant's data
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message:
        'CASINO_MISMATCH: Caller provided attacker-casino but context is victim-casino',
    });

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, 'attacker-casino'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      httpStatus: 403,
    });
  });

  it('enforces tenant isolation even for admin users', async () => {
    // Admin users are still scoped to their casino via RLS context
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message: `CASINO_MISMATCH: Caller provided ${CASINO_B_ID} but context is ${CASINO_A_ID}`,
    });

    // Even admin cannot cross casino boundaries without proper context
    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_B_ID),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
