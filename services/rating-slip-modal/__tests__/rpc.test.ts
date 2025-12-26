/**
 * RPC Service Unit Tests
 *
 * Tests the `getModalDataViaRPC()` function for the rating slip modal BFF RPC.
 * Verifies:
 * - Successful data mapping from PostgreSQL JSONB to RatingSlipModalDTO
 * - Error handling for various PostgreSQL error messages
 * - Type guard validation for RPC response structure
 * - Correct DomainError codes and HTTP status mappings
 *
 * @see services/rating-slip-modal/rpc.ts
 * @see supabase/migrations/20251226123939_prd018_modal_bff_rpc.sql
 * @see PRD-018 Rating Slip Modal BFF RPC Implementation
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type { RatingSlipModalDTO } from '../dtos';
import { getModalDataViaRPC } from '../rpc';

// === Mock Factory ===

type MockRpcBuilder = {
  rpc: jest.Mock;
};

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

const SLIP_ID = 'slip-uuid-123';
const CASINO_ID = 'casino-uuid-456';
const VISIT_ID = 'visit-uuid-789';
const TABLE_ID = 'table-uuid-abc';
const PLAYER_ID = 'player-uuid-def';

/**
 * Valid RPC response matching the PostgreSQL function output structure.
 * This represents what the database returns as JSONB.
 */
const mockValidRpcResponse = {
  slip: {
    id: SLIP_ID,
    visitId: VISIT_ID,
    tableId: TABLE_ID,
    tableLabel: 'Table 1',
    tableType: 'blackjack',
    seatNumber: '3',
    averageBet: 10000, // cents
    startTime: '2025-01-15T10:00:00Z',
    endTime: null,
    status: 'open',
    gamingDay: '2025-01-15',
    durationSeconds: 3600,
  },
  player: {
    id: PLAYER_ID,
    firstName: 'John',
    lastName: 'Doe',
    cardNumber: 'CARD-12345',
  },
  loyalty: {
    currentBalance: 1500,
    tier: 'gold',
    suggestion: {
      suggestedPoints: 50,
      suggestedTheo: 2500,
      policyVersion: 'v1.0.0',
    },
  },
  financial: {
    totalCashIn: 50000,
    totalChipsOut: 30000,
    netPosition: 20000,
  },
  tables: [
    {
      id: TABLE_ID,
      label: 'Table 1',
      type: 'blackjack',
      status: 'active',
      occupiedSeats: ['3'],
    },
    {
      id: 'table-uuid-other',
      label: 'Table 2',
      type: 'roulette',
      status: 'active',
      occupiedSeats: ['1', '4'],
    },
  ],
};

/**
 * Ghost visit scenario - no player or loyalty data.
 */
const mockGhostVisitRpcResponse = {
  slip: {
    id: SLIP_ID,
    visitId: VISIT_ID,
    tableId: TABLE_ID,
    tableLabel: 'Table 1',
    tableType: 'blackjack',
    seatNumber: null,
    averageBet: 0,
    startTime: '2025-01-15T10:00:00Z',
    endTime: null,
    status: 'open',
    gamingDay: '2025-01-15',
    durationSeconds: 3600,
  },
  player: null, // Ghost visit
  loyalty: null, // No loyalty without player
  financial: {
    totalCashIn: 0,
    totalChipsOut: 0,
    netPosition: 0,
  },
  tables: [
    {
      id: TABLE_ID,
      label: 'Table 1',
      type: 'blackjack',
      status: 'active',
      occupiedSeats: [],
    },
  ],
};

/**
 * Closed slip scenario - no loyalty suggestion.
 */
const mockClosedSlipRpcResponse = {
  slip: {
    id: SLIP_ID,
    visitId: VISIT_ID,
    tableId: TABLE_ID,
    tableLabel: 'Table 1',
    tableType: 'blackjack',
    seatNumber: '3',
    averageBet: 10000,
    startTime: '2025-01-15T10:00:00Z',
    endTime: '2025-01-15T14:00:00Z', // Closed
    status: 'closed',
    gamingDay: '2025-01-15',
    durationSeconds: 14400,
  },
  player: {
    id: PLAYER_ID,
    firstName: 'John',
    lastName: 'Doe',
    cardNumber: 'CARD-12345',
  },
  loyalty: {
    currentBalance: 1550,
    tier: 'gold',
    suggestion: null, // No suggestion for closed slips
  },
  financial: {
    totalCashIn: 50000,
    totalChipsOut: 30000,
    netPosition: 20000,
  },
  tables: [],
};

// === Successful Data Mapping Tests ===

describe('getModalDataViaRPC - Successful Data Mapping', () => {
  it('maps complete RPC response to RatingSlipModalDTO', async () => {
    const supabase = createMockSupabaseWithRpc(mockValidRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    // Verify RPC was called with correct parameters
    expect(supabase.rpc).toHaveBeenCalledWith('rpc_get_rating_slip_modal_data', {
      p_slip_id: SLIP_ID,
      p_casino_id: CASINO_ID,
    });

    // Verify DTO structure
    expect(result).toMatchObject<RatingSlipModalDTO>({
      slip: {
        id: SLIP_ID,
        visitId: VISIT_ID,
        tableId: TABLE_ID,
        tableLabel: 'Table 1',
        tableType: 'blackjack',
        seatNumber: '3',
        averageBet: 10000,
        startTime: '2025-01-15T10:00:00Z',
        endTime: null,
        status: 'open',
        gamingDay: '2025-01-15',
        durationSeconds: 3600,
      },
      player: {
        id: PLAYER_ID,
        firstName: 'John',
        lastName: 'Doe',
        cardNumber: 'CARD-12345',
      },
      loyalty: {
        currentBalance: 1500,
        tier: 'gold',
        suggestion: {
          suggestedPoints: 50,
          suggestedTheo: 2500,
          policyVersion: 'v1.0.0',
        },
      },
      financial: {
        totalCashIn: 50000,
        totalChipsOut: 30000,
        netPosition: 20000,
      },
      tables: [
        {
          id: TABLE_ID,
          label: 'Table 1',
          type: 'blackjack',
          status: 'active',
          occupiedSeats: ['3'],
        },
        {
          id: 'table-uuid-other',
          label: 'Table 2',
          type: 'roulette',
          status: 'active',
          occupiedSeats: ['1', '4'],
        },
      ],
    });
  });

  it('maps ghost visit response (null player and loyalty)', async () => {
    const supabase = createMockSupabaseWithRpc(mockGhostVisitRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.player).toBeNull();
    expect(result.loyalty).toBeNull();
    expect(result.slip.seatNumber).toBeNull();
    expect(result.financial.totalCashIn).toBe(0);
    expect(result.tables).toHaveLength(1);
  });

  it('maps closed slip response (null loyalty suggestion)', async () => {
    const supabase = createMockSupabaseWithRpc(mockClosedSlipRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.slip.status).toBe('closed');
    expect(result.slip.endTime).toBe('2025-01-15T14:00:00Z');
    expect(result.loyalty?.suggestion).toBeNull();
    expect(result.tables).toHaveLength(0);
  });

  it('maps player without loyalty record', async () => {
    const responseWithPlayerButNoLoyalty = {
      ...mockValidRpcResponse,
      loyalty: null, // Player exists but no loyalty record
    };
    const supabase = createMockSupabaseWithRpc(responseWithPlayerButNoLoyalty);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.player).not.toBeNull();
    expect(result.loyalty).toBeNull();
  });

  it('maps empty tables array', async () => {
    const responseWithNoTables = {
      ...mockValidRpcResponse,
      tables: [],
    };
    const supabase = createMockSupabaseWithRpc(responseWithNoTables);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.tables).toEqual([]);
  });

  it('maps loyalty with null tier (new player)', async () => {
    const responseWithNullTier = {
      ...mockValidRpcResponse,
      loyalty: {
        currentBalance: 0,
        tier: null,
        suggestion: {
          suggestedPoints: 10,
          suggestedTheo: 500,
          policyVersion: 'v1.0.0',
        },
      },
    };
    const supabase = createMockSupabaseWithRpc(responseWithNullTier);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.loyalty?.tier).toBeNull();
    expect(result.loyalty?.currentBalance).toBe(0);
  });
});

// === Error Handling Tests ===

describe('getModalDataViaRPC - Error Handling', () => {
  it('throws RATING_SLIP_NOT_FOUND for missing slip', async () => {
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message: 'RATING_SLIP_NOT_FOUND: Rating slip slip-123 not found',
    });

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toThrow(DomainError);

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'RATING_SLIP_NOT_FOUND',
      httpStatus: 404,
      details: { slipId: SLIP_ID },
    });
  });

  it('throws VISIT_NOT_FOUND for missing visit', async () => {
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message: 'VISIT_NOT_FOUND: Visit visit-123 not found',
    });

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'VISIT_NOT_FOUND',
      httpStatus: 404,
      details: { slipId: SLIP_ID },
    });
  });

  it('throws TABLE_NOT_FOUND for missing gaming table', async () => {
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message: 'TABLE_NOT_FOUND: Gaming table table-123 not found',
    });

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'TABLE_NOT_FOUND',
      httpStatus: 404,
      details: { slipId: SLIP_ID },
    });
  });

  it('throws FORBIDDEN for CASINO_MISMATCH', async () => {
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message:
        'CASINO_MISMATCH: Caller provided casino-456 but context is casino-789',
    });

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Casino context mismatch - access denied',
      httpStatus: 403,
      details: { slipId: SLIP_ID, casinoId: CASINO_ID },
    });
  });

  it('throws UNAUTHORIZED when RLS context not set', async () => {
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'P0001',
      message: 'UNAUTHORIZED: RLS context not set (app.casino_id required)',
    });

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'RLS context not set',
      httpStatus: 401,
    });
  });

  it('throws INTERNAL_ERROR for generic database errors', async () => {
    const supabase = createMockSupabaseWithRpc(null, {
      code: '42P01',
      message: 'relation "rating_slip" does not exist',
      hint: 'Check table name',
    });

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'RPC call failed: relation "rating_slip" does not exist',
      httpStatus: 500,
      details: { code: '42P01', hint: 'Check table name' },
    });
  });

  it('throws RATING_SLIP_NOT_FOUND when data is null', async () => {
    const supabase = createMockSupabaseWithRpc(null, null); // No error, but no data

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'RATING_SLIP_NOT_FOUND',
      message: 'No data returned from RPC',
      httpStatus: 404,
      details: { slipId: SLIP_ID },
    });
  });

  it('handles error without message gracefully', async () => {
    const supabase = createMockSupabaseWithRpc(null, {
      code: 'UNKNOWN',
      // No message field
    });

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});

// === Type Guard Validation Tests ===

describe('getModalDataViaRPC - Type Guard Validation', () => {
  it('throws INTERNAL_ERROR for invalid response structure (missing slip)', async () => {
    const invalidResponse = {
      // Missing slip section
      player: null,
      loyalty: null,
      financial: { totalCashIn: 0, totalChipsOut: 0, netPosition: 0 },
      tables: [],
    };
    const supabase = createMockSupabaseWithRpc(invalidResponse);

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Invalid RPC response structure',
      httpStatus: 500,
      details: { slipId: SLIP_ID, received: 'object' },
    });
  });

  it('throws INTERNAL_ERROR for invalid slip structure', async () => {
    const invalidResponse = {
      slip: {
        id: SLIP_ID,
        // Missing required fields like visitId, tableId, etc.
      },
      player: null,
      loyalty: null,
      financial: { totalCashIn: 0, totalChipsOut: 0, netPosition: 0 },
      tables: [],
    };
    const supabase = createMockSupabaseWithRpc(invalidResponse);

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Invalid RPC response structure',
    });
  });

  it('throws INTERNAL_ERROR for missing financial section', async () => {
    const invalidResponse = {
      slip: mockValidRpcResponse.slip,
      player: null,
      loyalty: null,
      // Missing financial section
      tables: [],
    };
    const supabase = createMockSupabaseWithRpc(invalidResponse);

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Invalid RPC response structure',
    });
  });

  it('throws INTERNAL_ERROR for invalid financial structure', async () => {
    const invalidResponse = {
      slip: mockValidRpcResponse.slip,
      player: null,
      loyalty: null,
      financial: {
        totalCashIn: 'not-a-number', // Should be number
        totalChipsOut: 0,
        netPosition: 0,
      },
      tables: [],
    };
    const supabase = createMockSupabaseWithRpc(invalidResponse);

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Invalid RPC response structure',
    });
  });

  it('throws INTERNAL_ERROR for non-array tables', async () => {
    const invalidResponse = {
      slip: mockValidRpcResponse.slip,
      player: null,
      loyalty: null,
      financial: { totalCashIn: 0, totalChipsOut: 0, netPosition: 0 },
      tables: 'not-an-array', // Should be array
    };
    const supabase = createMockSupabaseWithRpc(invalidResponse);

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Invalid RPC response structure',
    });
  });

  it('throws INTERNAL_ERROR for invalid player type (not object or null)', async () => {
    const invalidResponse = {
      slip: mockValidRpcResponse.slip,
      player: 'invalid-player-type', // Should be object or null
      loyalty: null,
      financial: { totalCashIn: 0, totalChipsOut: 0, netPosition: 0 },
      tables: [],
    };
    const supabase = createMockSupabaseWithRpc(invalidResponse);

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Invalid RPC response structure',
    });
  });

  it('throws INTERNAL_ERROR for non-object response', async () => {
    const supabase = createMockSupabaseWithRpc('invalid-string-response');

    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Invalid RPC response structure',
    });
  });

  it('throws INTERNAL_ERROR for null response (not object)', async () => {
    const supabase = createMockSupabaseWithRpc(null);

    // This should trigger the "no data" error before type guard
    await expect(
      getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID),
    ).rejects.toMatchObject({
      code: 'RATING_SLIP_NOT_FOUND',
      message: 'No data returned from RPC',
    });
  });
});

// === Edge Cases ===

describe('getModalDataViaRPC - Edge Cases', () => {
  it('handles zero values in financial data', async () => {
    const responseWithZeros = {
      ...mockValidRpcResponse,
      financial: {
        totalCashIn: 0,
        totalChipsOut: 0,
        netPosition: 0,
      },
    };
    const supabase = createMockSupabaseWithRpc(responseWithZeros);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.financial.totalCashIn).toBe(0);
    expect(result.financial.totalChipsOut).toBe(0);
    expect(result.financial.netPosition).toBe(0);
  });

  it('handles negative net position (player winning)', async () => {
    const responseWithNegativeNet = {
      ...mockValidRpcResponse,
      financial: {
        totalCashIn: 10000,
        totalChipsOut: 25000,
        netPosition: -15000, // Player is up
      },
    };
    const supabase = createMockSupabaseWithRpc(responseWithNegativeNet);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.financial.netPosition).toBe(-15000);
  });

  it('handles large numbers correctly', async () => {
    const responseWithLargeNumbers = {
      ...mockValidRpcResponse,
      slip: {
        ...mockValidRpcResponse.slip,
        averageBet: 1000000, // $10,000 bet
        durationSeconds: 86400, // 24 hours
      },
      loyalty: {
        currentBalance: 999999,
        tier: 'platinum',
        suggestion: {
          suggestedPoints: 50000,
          suggestedTheo: 1000000,
          policyVersion: 'v2.0.0',
        },
      },
    };
    const supabase = createMockSupabaseWithRpc(responseWithLargeNumbers);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.slip.averageBet).toBe(1000000);
    expect(result.slip.durationSeconds).toBe(86400);
    expect(result.loyalty?.currentBalance).toBe(999999);
  });

  it('handles multiple occupied seats in tables', async () => {
    const responseWithManySeats = {
      ...mockValidRpcResponse,
      tables: [
        {
          id: TABLE_ID,
          label: 'Full Table',
          type: 'blackjack',
          status: 'active',
          occupiedSeats: ['1', '2', '3', '4', '5', '6', '7'], // 7-seat table
        },
      ],
    };
    const supabase = createMockSupabaseWithRpc(responseWithManySeats);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.tables[0].occupiedSeats).toHaveLength(7);
  });

  it('handles paused slip status', async () => {
    const pausedSlipResponse = {
      ...mockValidRpcResponse,
      slip: {
        ...mockValidRpcResponse.slip,
        status: 'paused',
      },
    };
    const supabase = createMockSupabaseWithRpc(pausedSlipResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.slip.status).toBe('paused');
  });
});
