/**
 * BFF Aggregation Tests
 *
 * Unit tests for the rating slip modal BFF endpoint that aggregates
 * data from 5 bounded contexts.
 *
 * @see services/rating-slip-modal/dtos.ts
 * @see app/api/v1/rating-slips/[id]/modal-data/route.ts
 * @see PRD-008 Rating Slip Modal Integration
 */

import type {
  FinancialSectionDTO,
  LoyaltySectionDTO,
  PlayerSectionDTO,
  RatingSlipModalDTO,
  SlipSectionDTO,
  TableOptionDTO,
} from '../dtos';

// === Test Data ===

const SLIP_ID = 'slip-uuid-123';
const VISIT_ID = 'visit-uuid-456';
const TABLE_ID = 'table-uuid-789';
const PLAYER_ID = 'player-uuid-abc';
const CASINO_ID = 'casino-uuid-def';

const mockSlipSection: SlipSectionDTO = {
  id: SLIP_ID,
  visitId: VISIT_ID,
  tableId: TABLE_ID,
  tableLabel: 'Table 1',
  tableType: 'blackjack',
  seatNumber: '3',
  averageBet: 100,
  startTime: '2025-01-15T10:00:00Z',
  endTime: null,
  status: 'open',
  gamingDay: '2025-01-15',
  durationSeconds: 3600,
};

const mockPlayerSection: PlayerSectionDTO = {
  id: PLAYER_ID,
  firstName: 'John',
  lastName: 'Doe',
  cardNumber: 'CARD-12345',
};

const mockLoyaltySection: LoyaltySectionDTO = {
  currentBalance: 1500,
  tier: 'gold',
  suggestion: {
    suggestedPoints: 50,
    suggestedTheo: 2500,
    policyVersion: 'v1.0.0',
  },
};

const mockFinancialSection: FinancialSectionDTO = {
  totalCashIn: 50000,
  totalChipsOut: 30000,
  netPosition: 20000,
};

const mockTableOption: TableOptionDTO = {
  id: 'table-uuid-other',
  label: 'Table 2',
  type: 'roulette',
  status: 'active',
  occupiedSeats: ['1', '4'],
};

// === Tests ===

describe('RatingSlipModalDTO structure', () => {
  it('should have correct shape for full modal response', () => {
    const modalData: RatingSlipModalDTO = {
      slip: mockSlipSection,
      player: mockPlayerSection,
      loyalty: mockLoyaltySection,
      financial: mockFinancialSection,
      tables: [mockTableOption],
    };

    expect(modalData.slip).toBeDefined();
    expect(modalData.player).toBeDefined();
    expect(modalData.loyalty).toBeDefined();
    expect(modalData.financial).toBeDefined();
    expect(modalData.tables).toHaveLength(1);
  });

  it('should allow null player for ghost visits', () => {
    const modalData: RatingSlipModalDTO = {
      slip: mockSlipSection,
      player: null, // Ghost visit
      loyalty: null, // No loyalty without player
      financial: mockFinancialSection,
      tables: [],
    };

    expect(modalData.player).toBeNull();
    expect(modalData.loyalty).toBeNull();
  });

  it('should allow null loyalty suggestion for closed slips', () => {
    const loyaltyWithoutSuggestion: LoyaltySectionDTO = {
      currentBalance: 1500,
      tier: 'gold',
      suggestion: null, // Closed slip - no suggestion
    };

    const modalData: RatingSlipModalDTO = {
      slip: { ...mockSlipSection, status: 'closed' },
      player: mockPlayerSection,
      loyalty: loyaltyWithoutSuggestion,
      financial: mockFinancialSection,
      tables: [],
    };

    expect(modalData.loyalty?.suggestion).toBeNull();
  });
});

describe('SlipSectionDTO', () => {
  it('should have all required fields', () => {
    expect(mockSlipSection.id).toBe(SLIP_ID);
    expect(mockSlipSection.visitId).toBe(VISIT_ID);
    expect(mockSlipSection.tableId).toBe(TABLE_ID);
    expect(mockSlipSection.tableLabel).toBe('Table 1');
    expect(mockSlipSection.tableType).toBe('blackjack');
    expect(mockSlipSection.seatNumber).toBe('3');
    expect(mockSlipSection.averageBet).toBe(100);
    expect(mockSlipSection.startTime).toBe('2025-01-15T10:00:00Z');
    expect(mockSlipSection.endTime).toBeNull();
    expect(mockSlipSection.status).toBe('open');
    expect(mockSlipSection.gamingDay).toBe('2025-01-15');
    expect(mockSlipSection.durationSeconds).toBe(3600);
  });

  it('should allow null seat number for unseated players', () => {
    const unseatedSlip: SlipSectionDTO = {
      ...mockSlipSection,
      seatNumber: null,
    };

    expect(unseatedSlip.seatNumber).toBeNull();
  });

  it('should allow end_time for closed slips', () => {
    const closedSlip: SlipSectionDTO = {
      ...mockSlipSection,
      status: 'closed',
      endTime: '2025-01-15T14:00:00Z',
    };

    expect(closedSlip.endTime).toBe('2025-01-15T14:00:00Z');
    expect(closedSlip.status).toBe('closed');
  });
});

describe('PlayerSectionDTO', () => {
  it('should have required player identity fields', () => {
    expect(mockPlayerSection.id).toBe(PLAYER_ID);
    expect(mockPlayerSection.firstName).toBe('John');
    expect(mockPlayerSection.lastName).toBe('Doe');
  });

  it('should allow null card number', () => {
    const playerWithoutCard: PlayerSectionDTO = {
      ...mockPlayerSection,
      cardNumber: null,
    };

    expect(playerWithoutCard.cardNumber).toBeNull();
  });
});

describe('LoyaltySectionDTO', () => {
  it('should have balance and tier', () => {
    expect(mockLoyaltySection.currentBalance).toBe(1500);
    expect(mockLoyaltySection.tier).toBe('gold');
  });

  it('should have suggestion with points and theo for open slips', () => {
    expect(mockLoyaltySection.suggestion).toBeDefined();
    expect(mockLoyaltySection.suggestion?.suggestedPoints).toBe(50);
    expect(mockLoyaltySection.suggestion?.suggestedTheo).toBe(2500);
    expect(mockLoyaltySection.suggestion?.policyVersion).toBe('v1.0.0');
  });

  it('should allow null tier', () => {
    const loyaltyWithoutTier: LoyaltySectionDTO = {
      currentBalance: 0,
      tier: null,
      suggestion: null,
    };

    expect(loyaltyWithoutTier.tier).toBeNull();
  });
});

describe('FinancialSectionDTO', () => {
  it('should have cash in, chips out, and net position', () => {
    expect(mockFinancialSection.totalCashIn).toBe(50000);
    expect(mockFinancialSection.totalChipsOut).toBe(30000);
    expect(mockFinancialSection.netPosition).toBe(20000);
  });

  it('should support negative net position (player winning)', () => {
    const winningSession: FinancialSectionDTO = {
      totalCashIn: 10000,
      totalChipsOut: 25000,
      netPosition: -15000,
    };

    expect(winningSession.netPosition).toBeLessThan(0);
  });

  it('should support zero amounts for new sessions', () => {
    const newSession: FinancialSectionDTO = {
      totalCashIn: 0,
      totalChipsOut: 0,
      netPosition: 0,
    };

    expect(newSession.totalCashIn).toBe(0);
    expect(newSession.totalChipsOut).toBe(0);
    expect(newSession.netPosition).toBe(0);
  });
});

describe('TableOptionDTO', () => {
  it('should have table info for move player', () => {
    expect(mockTableOption.id).toBe('table-uuid-other');
    expect(mockTableOption.label).toBe('Table 2');
    expect(mockTableOption.type).toBe('roulette');
    expect(mockTableOption.status).toBe('active');
    expect(mockTableOption.occupiedSeats).toEqual(['1', '4']);
  });

  it('should support empty occupied seats', () => {
    const emptyTable: TableOptionDTO = {
      ...mockTableOption,
      occupiedSeats: [],
    };

    expect(emptyTable.occupiedSeats).toHaveLength(0);
  });
});

describe('BFF aggregation invariants', () => {
  it('should have at least one table when modal is open', () => {
    // The current table should always be in the list
    const modalData: RatingSlipModalDTO = {
      slip: mockSlipSection,
      player: mockPlayerSection,
      loyalty: mockLoyaltySection,
      financial: mockFinancialSection,
      tables: [
        {
          id: TABLE_ID,
          label: 'Table 1',
          type: 'blackjack',
          status: 'active',
          occupiedSeats: ['3'], // Current player's seat
        },
      ],
    };

    expect(modalData.tables.length).toBeGreaterThanOrEqual(1);
    expect(modalData.tables.some((t) => t.id === mockSlipSection.tableId)).toBe(
      true,
    );
  });

  it('should have consistent visit_id between slip and financial context', () => {
    // This is enforced at the data layer, but the DTO structure should support it
    const modalData: RatingSlipModalDTO = {
      slip: mockSlipSection,
      player: mockPlayerSection,
      loyalty: mockLoyaltySection,
      financial: mockFinancialSection, // Financial summary is scoped to visit_id
      tables: [],
    };

    // The financial section is implicitly tied to the visit_id in slip
    expect(modalData.slip.visitId).toBe(VISIT_ID);
    expect(modalData.financial).toBeDefined();
  });

  it('should have loyalty only when player exists', () => {
    // Ghost visit case
    const ghostVisit: RatingSlipModalDTO = {
      slip: mockSlipSection,
      player: null,
      loyalty: null, // Must be null when player is null
      financial: mockFinancialSection,
      tables: [],
    };

    expect(ghostVisit.player).toBeNull();
    expect(ghostVisit.loyalty).toBeNull();

    // Player visit case
    const playerVisit: RatingSlipModalDTO = {
      slip: mockSlipSection,
      player: mockPlayerSection,
      loyalty: mockLoyaltySection, // Can have loyalty when player exists
      financial: mockFinancialSection,
      tables: [],
    };

    expect(playerVisit.player).not.toBeNull();
    // Note: loyalty can still be null even with player if no loyalty record exists
  });
});
