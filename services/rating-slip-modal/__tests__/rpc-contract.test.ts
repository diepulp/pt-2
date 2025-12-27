/**
 * RPC Contract Tests
 *
 * Tests the contract between PostgreSQL RPC output and RatingSlipModalDTO structure.
 * Validates that the RPC function returns data matching the expected DTO shape.
 *
 * Contract tests ensure:
 * - All fields are correctly mapped from JSONB to DTO types
 * - Nullable fields are properly handled (player, loyalty, loyalty.suggestion)
 * - Array fields are correctly structured (tables with occupiedSeats)
 * - Type conversions are accurate (strings, numbers, dates)
 * - Nested object structures are preserved
 *
 * @see services/rating-slip-modal/rpc.ts
 * @see services/rating-slip-modal/dtos.ts
 * @see supabase/migrations/20251226123939_prd018_modal_bff_rpc.sql
 * @see PRD-018 Rating Slip Modal BFF RPC Implementation
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import type {
  FinancialSectionDTO,
  LoyaltySectionDTO,
  PlayerSectionDTO,
  RatingSlipModalDTO,
  SlipSectionDTO,
  TableOptionDTO,
} from '../dtos';
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

const SLIP_ID = 'slip-uuid-contract-test';
const VISIT_ID = 'visit-uuid-contract';
const TABLE_ID = 'table-uuid-contract';
const PLAYER_ID = 'player-uuid-contract';
const CASINO_ID = 'casino-uuid-contract';

/**
 * Complete RPC response for contract validation.
 */
const mockCompleteRpcResponse = {
  slip: {
    id: SLIP_ID,
    visitId: VISIT_ID,
    tableId: TABLE_ID,
    tableLabel: 'Table 5',
    tableType: 'blackjack',
    seatNumber: '2',
    averageBet: 7500,
    startTime: '2025-01-20T14:30:00Z',
    endTime: null,
    status: 'open',
    gamingDay: '2025-01-20',
    durationSeconds: 5400,
  },
  player: {
    id: PLAYER_ID,
    firstName: 'Alice',
    lastName: 'Smith',
    cardNumber: 'VIP-99887',
  },
  loyalty: {
    currentBalance: 2500,
    tier: 'platinum',
    suggestion: {
      suggestedPoints: 75,
      suggestedTheo: 5000,
      policyVersion: 'v1.2.0',
    },
  },
  financial: {
    totalCashIn: 100000,
    totalChipsOut: 75000,
    netPosition: 25000,
  },
  tables: [
    {
      id: TABLE_ID,
      label: 'Table 5',
      type: 'blackjack',
      status: 'active',
      occupiedSeats: ['2', '5'],
    },
    {
      id: 'table-2-uuid',
      label: 'Table 8',
      type: 'roulette',
      status: 'active',
      occupiedSeats: ['1', '3', '7'],
    },
    {
      id: 'table-3-uuid',
      label: 'Table 12',
      type: 'baccarat',
      status: 'active',
      occupiedSeats: [],
    },
  ],
};

// === Slip Section Contract Tests ===

describe('RPC Contract - SlipSectionDTO', () => {
  it('maps all slip fields from RPC to DTO', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    const expectedSlip: SlipSectionDTO = {
      id: SLIP_ID,
      visitId: VISIT_ID,
      tableId: TABLE_ID,
      tableLabel: 'Table 5',
      tableType: 'blackjack',
      seatNumber: '2',
      averageBet: 7500,
      startTime: '2025-01-20T14:30:00Z',
      endTime: null,
      status: 'open',
      gamingDay: '2025-01-20',
      durationSeconds: 5400,
    };

    expect(result.slip).toEqual(expectedSlip);
  });

  it('preserves slip field types (string, number, null)', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    // Type assertions
    expect(typeof result.slip.id).toBe('string');
    expect(typeof result.slip.visitId).toBe('string');
    expect(typeof result.slip.tableId).toBe('string');
    expect(typeof result.slip.tableLabel).toBe('string');
    expect(typeof result.slip.tableType).toBe('string');
    expect(typeof result.slip.seatNumber).toBe('string');
    expect(typeof result.slip.averageBet).toBe('number');
    expect(typeof result.slip.startTime).toBe('string');
    expect(result.slip.endTime).toBeNull();
    expect(typeof result.slip.status).toBe('string');
    expect(typeof result.slip.gamingDay).toBe('string');
    expect(typeof result.slip.durationSeconds).toBe('number');
  });

  it('handles null seatNumber for unseated players', async () => {
    const responseWithNullSeat = {
      ...mockCompleteRpcResponse,
      slip: {
        ...mockCompleteRpcResponse.slip,
        seatNumber: null,
      },
    };
    const supabase = createMockSupabaseWithRpc(responseWithNullSeat);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.slip.seatNumber).toBeNull();
  });

  it('handles endTime for closed slips', async () => {
    const responseWithEndTime = {
      ...mockCompleteRpcResponse,
      slip: {
        ...mockCompleteRpcResponse.slip,
        endTime: '2025-01-20T16:00:00Z',
        status: 'closed',
      },
    };
    const supabase = createMockSupabaseWithRpc(responseWithEndTime);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.slip.endTime).toBe('2025-01-20T16:00:00Z');
    expect(result.slip.status).toBe('closed');
  });

  it('preserves all valid table types', async () => {
    const tableTypes = [
      'blackjack',
      'roulette',
      'baccarat',
      'craps',
      'poker',
      'other',
    ];

    for (const type of tableTypes) {
      const response = {
        ...mockCompleteRpcResponse,
        slip: { ...mockCompleteRpcResponse.slip, tableType: type },
      };
      const supabase = createMockSupabaseWithRpc(response);

      const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

      expect(result.slip.tableType).toBe(type);
    }
  });

  it('preserves all valid slip statuses', async () => {
    const statuses = ['open', 'paused', 'closed'];

    for (const status of statuses) {
      const response = {
        ...mockCompleteRpcResponse,
        slip: { ...mockCompleteRpcResponse.slip, status },
      };
      const supabase = createMockSupabaseWithRpc(response);

      const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

      expect(result.slip.status).toBe(status);
    }
  });
});

// === Player Section Contract Tests ===

describe('RPC Contract - PlayerSectionDTO', () => {
  it('maps all player fields from RPC to DTO', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    const expectedPlayer: PlayerSectionDTO = {
      id: PLAYER_ID,
      firstName: 'Alice',
      lastName: 'Smith',
      cardNumber: 'VIP-99887',
    };

    expect(result.player).toEqual(expectedPlayer);
  });

  it('preserves player field types', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.player).not.toBeNull();
    expect(typeof result.player!.id).toBe('string');
    expect(typeof result.player!.firstName).toBe('string');
    expect(typeof result.player!.lastName).toBe('string');
    expect(typeof result.player!.cardNumber).toBe('string');
  });

  it('handles null player for ghost visits', async () => {
    const responseWithNullPlayer = {
      ...mockCompleteRpcResponse,
      player: null,
    };
    const supabase = createMockSupabaseWithRpc(responseWithNullPlayer);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.player).toBeNull();
  });

  it('handles null cardNumber for players without loyalty cards', async () => {
    const responseWithNullCardNumber = {
      ...mockCompleteRpcResponse,
      player: {
        ...mockCompleteRpcResponse.player,
        cardNumber: null,
      },
    };
    const supabase = createMockSupabaseWithRpc(responseWithNullCardNumber);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.player).not.toBeNull();
    expect(result.player!.cardNumber).toBeNull();
  });
});

// === Loyalty Section Contract Tests ===

describe('RPC Contract - LoyaltySectionDTO', () => {
  it('maps all loyalty fields from RPC to DTO', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    const expectedLoyalty: LoyaltySectionDTO = {
      currentBalance: 2500,
      tier: 'platinum',
      suggestion: {
        suggestedPoints: 75,
        suggestedTheo: 5000,
        policyVersion: 'v1.2.0',
      },
    };

    expect(result.loyalty).toEqual(expectedLoyalty);
  });

  it('preserves loyalty field types', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.loyalty).not.toBeNull();
    expect(typeof result.loyalty!.currentBalance).toBe('number');
    expect(typeof result.loyalty!.tier).toBe('string');
    expect(result.loyalty!.suggestion).not.toBeNull();
    expect(typeof result.loyalty!.suggestion!.suggestedPoints).toBe('number');
    expect(typeof result.loyalty!.suggestion!.suggestedTheo).toBe('number');
    expect(typeof result.loyalty!.suggestion!.policyVersion).toBe('string');
  });

  it('handles null loyalty for ghost visits', async () => {
    const responseWithNullLoyalty = {
      ...mockCompleteRpcResponse,
      player: null,
      loyalty: null,
    };
    const supabase = createMockSupabaseWithRpc(responseWithNullLoyalty);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.loyalty).toBeNull();
  });

  it('handles null loyalty.tier for new players', async () => {
    const responseWithNullTier = {
      ...mockCompleteRpcResponse,
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

    expect(result.loyalty).not.toBeNull();
    expect(result.loyalty!.tier).toBeNull();
    expect(result.loyalty!.currentBalance).toBe(0);
  });

  it('handles null loyalty.suggestion for closed slips', async () => {
    const responseWithNullSuggestion = {
      ...mockCompleteRpcResponse,
      slip: {
        ...mockCompleteRpcResponse.slip,
        status: 'closed',
      },
      loyalty: {
        currentBalance: 2500,
        tier: 'platinum',
        suggestion: null,
      },
    };
    const supabase = createMockSupabaseWithRpc(responseWithNullSuggestion);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.loyalty).not.toBeNull();
    expect(result.loyalty!.suggestion).toBeNull();
  });

  it('handles loyalty with player but no loyalty record (null loyalty)', async () => {
    const responseWithPlayerButNoLoyalty = {
      ...mockCompleteRpcResponse,
      loyalty: null,
    };
    const supabase = createMockSupabaseWithRpc(responseWithPlayerButNoLoyalty);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.player).not.toBeNull();
    expect(result.loyalty).toBeNull();
  });
});

// === Financial Section Contract Tests ===

describe('RPC Contract - FinancialSectionDTO', () => {
  it('maps all financial fields from RPC to DTO', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    const expectedFinancial: FinancialSectionDTO = {
      totalCashIn: 100000,
      totalChipsOut: 75000,
      netPosition: 25000,
    };

    expect(result.financial).toEqual(expectedFinancial);
  });

  it('preserves financial field types (all numbers)', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(typeof result.financial.totalCashIn).toBe('number');
    expect(typeof result.financial.totalChipsOut).toBe('number');
    expect(typeof result.financial.netPosition).toBe('number');
  });

  it('handles zero financial values', async () => {
    const responseWithZeros = {
      ...mockCompleteRpcResponse,
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

  it('handles negative netPosition (player winning)', async () => {
    const responseWithNegative = {
      ...mockCompleteRpcResponse,
      financial: {
        totalCashIn: 50000,
        totalChipsOut: 100000,
        netPosition: -50000,
      },
    };
    const supabase = createMockSupabaseWithRpc(responseWithNegative);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.financial.netPosition).toBe(-50000);
  });

  it('validates netPosition calculation (totalCashIn - totalChipsOut)', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    const expectedNet =
      result.financial.totalCashIn - result.financial.totalChipsOut;
    expect(result.financial.netPosition).toBe(expectedNet);
  });
});

// === Tables Array Contract Tests ===

describe('RPC Contract - TableOptionDTO Array', () => {
  it('maps all table fields from RPC to DTO', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    const expectedTables: TableOptionDTO[] = [
      {
        id: TABLE_ID,
        label: 'Table 5',
        type: 'blackjack',
        status: 'active',
        occupiedSeats: ['2', '5'],
      },
      {
        id: 'table-2-uuid',
        label: 'Table 8',
        type: 'roulette',
        status: 'active',
        occupiedSeats: ['1', '3', '7'],
      },
      {
        id: 'table-3-uuid',
        label: 'Table 12',
        type: 'baccarat',
        status: 'active',
        occupiedSeats: [],
      },
    ];

    expect(result.tables).toEqual(expectedTables);
  });

  it('preserves table field types', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.tables).toHaveLength(3);

    result.tables.forEach((table) => {
      expect(typeof table.id).toBe('string');
      expect(typeof table.label).toBe('string');
      expect(typeof table.type).toBe('string');
      expect(typeof table.status).toBe('string');
      expect(Array.isArray(table.occupiedSeats)).toBe(true);
      table.occupiedSeats.forEach((seat) => {
        expect(typeof seat).toBe('string');
      });
    });
  });

  it('handles empty tables array', async () => {
    const responseWithNoTables = {
      ...mockCompleteRpcResponse,
      tables: [],
    };
    const supabase = createMockSupabaseWithRpc(responseWithNoTables);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.tables).toEqual([]);
    expect(Array.isArray(result.tables)).toBe(true);
  });

  it('handles tables with empty occupiedSeats arrays', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    const emptyTable = result.tables.find((t) => t.id === 'table-3-uuid');
    expect(emptyTable).toBeDefined();
    expect(emptyTable!.occupiedSeats).toEqual([]);
  });

  it('preserves seat number ordering in occupiedSeats', async () => {
    const responseWithOrderedSeats = {
      ...mockCompleteRpcResponse,
      tables: [
        {
          id: TABLE_ID,
          label: 'Full Table',
          type: 'blackjack',
          status: 'active',
          occupiedSeats: ['1', '2', '3', '4', '5', '6', '7'],
        },
      ],
    };
    const supabase = createMockSupabaseWithRpc(responseWithOrderedSeats);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.tables[0].occupiedSeats).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ]);
  });
});

// === Full DTO Structure Contract Tests ===

describe('RPC Contract - Complete RatingSlipModalDTO', () => {
  it('validates complete DTO structure matches contract', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    // Structural validation
    expect(result).toHaveProperty('slip');
    expect(result).toHaveProperty('player');
    expect(result).toHaveProperty('loyalty');
    expect(result).toHaveProperty('financial');
    expect(result).toHaveProperty('tables');

    // Type validation via TypeScript compile-time check
    const dto: RatingSlipModalDTO = result;
    expect(dto).toBeDefined();
  });

  it('validates all nested object structures', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    // Slip section
    expect(typeof result.slip).toBe('object');
    expect(result.slip).not.toBeNull();

    // Player section (nullable)
    expect(result.player === null || typeof result.player === 'object').toBe(
      true,
    );

    // Loyalty section (nullable)
    expect(result.loyalty === null || typeof result.loyalty === 'object').toBe(
      true,
    );

    // Financial section
    expect(typeof result.financial).toBe('object');
    expect(result.financial).not.toBeNull();

    // Tables array
    expect(Array.isArray(result.tables)).toBe(true);
  });

  it('validates required vs optional fields', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    // Required sections
    expect(result.slip).toBeDefined();
    expect(result.financial).toBeDefined();
    expect(result.tables).toBeDefined();

    // Optional sections (can be null)
    // player and loyalty are nullable, so we just verify they exist as properties
    expect('player' in result).toBe(true);
    expect('loyalty' in result).toBe(true);
  });

  it('ensures no extra fields beyond DTO contract', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    const expectedKeys = ['slip', 'player', 'loyalty', 'financial', 'tables'];
    const actualKeys = Object.keys(result);

    expect(actualKeys).toEqual(expect.arrayContaining(expectedKeys));
    expect(actualKeys).toHaveLength(expectedKeys.length);
  });

  it('validates data consistency across sections', async () => {
    const supabase = createMockSupabaseWithRpc(mockCompleteRpcResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    // If player exists, player.id should be consistent
    if (result.player) {
      expect(result.player.id).toBe(PLAYER_ID);
    }

    // If loyalty exists with player, they should be linked
    if (result.loyalty && result.player) {
      expect(result.player).not.toBeNull();
    }

    // Current table should be in tables list
    const currentTable = result.tables.find(
      (t) => t.id === result.slip.tableId,
    );
    if (result.tables.length > 0) {
      // If tables are returned, current table should be among them
      expect(currentTable).toBeDefined();
    }
  });
});

// === Edge Case Contract Tests ===

describe('RPC Contract - Edge Cases', () => {
  it('handles minimum valid response (ghost visit, no tables)', async () => {
    const minimalResponse = {
      slip: {
        id: SLIP_ID,
        visitId: VISIT_ID,
        tableId: TABLE_ID,
        tableLabel: 'Table 1',
        tableType: 'blackjack',
        seatNumber: null,
        averageBet: 0,
        startTime: '2025-01-20T10:00:00Z',
        endTime: null,
        status: 'open',
        gamingDay: '2025-01-20',
        durationSeconds: 0,
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
    const supabase = createMockSupabaseWithRpc(minimalResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.slip).toBeDefined();
    expect(result.player).toBeNull();
    expect(result.loyalty).toBeNull();
    expect(result.financial).toBeDefined();
    expect(result.tables).toEqual([]);
  });

  it('handles maximum complexity response', async () => {
    const maximalResponse = {
      ...mockCompleteRpcResponse,
      tables: Array(20)
        .fill(null)
        .map((_, i) => ({
          id: `table-${i}-uuid`,
          label: `Table ${i + 1}`,
          type: i % 2 === 0 ? 'blackjack' : 'roulette',
          status: 'active',
          occupiedSeats: Array(7)
            .fill(null)
            .map((_, s) => String(s + 1)),
        })),
    };
    const supabase = createMockSupabaseWithRpc(maximalResponse);

    const result = await getModalDataViaRPC(supabase, SLIP_ID, CASINO_ID);

    expect(result.tables).toHaveLength(20);
    result.tables.forEach((table) => {
      expect(table.occupiedSeats).toHaveLength(7);
    });
  });
});
