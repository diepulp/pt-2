/**
 * @jest-environment node
 *
 * Rating Slip Modal Data Route Tests
 *
 * Tests for GET /api/v1/rating-slips/[id]/modal-data
 * Part of QA-ROUTE-TESTING execution (ISSUE-607F9CCB)
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { GET } from '../route';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
    }),
  ),
}));

jest.mock('@/services/rating-slip', () => ({
  createRatingSlipService: jest.fn(() => ({
    getById: jest.fn().mockResolvedValue({
      id: 'slip-123',
      visit_id: 'visit-1',
      table_id: 'table-1',
      status: 'open',
      start_time: '2025-01-01T10:00:00Z',
    }),
    getDuration: jest.fn().mockResolvedValue(3600),
    getActiveForTable: jest.fn().mockResolvedValue([]),
    getOccupiedSeatsByTables: jest.fn().mockResolvedValue(new Map()),
  })),
}));

jest.mock('@/services/visit', () => ({
  createVisitService: jest.fn(() => ({
    getById: jest.fn().mockResolvedValue({ id: 'visit-1', player_id: null }),
  })),
}));

jest.mock('@/services/player', () => ({
  createPlayerService: jest.fn(() => ({})),
}));

jest.mock('@/services/loyalty', () => ({
  createLoyaltyService: jest.fn(() => ({})),
}));

jest.mock('@/services/player-financial', () => ({
  createPlayerFinancialService: jest.fn(() => ({
    getVisitSummary: jest.fn().mockResolvedValue({
      total_in: {
        value: 0,
        type: 'actual',
        source: 'PFT',
        completeness: { status: 'unknown' },
      },
      total_out: {
        value: 0,
        type: 'actual',
        source: 'PFT',
        completeness: { status: 'unknown' },
      },
      net_amount: {
        value: 0,
        type: 'actual',
        source: 'PFT',
        completeness: { status: 'unknown' },
      },
    }),
  })),
}));

jest.mock('@/services/table-context', () => ({
  createTableContextService: jest.fn(() => ({
    getTable: jest
      .fn()
      .mockResolvedValue({ label: 'T1', type: 'blackjack', status: 'active' }),
    getActiveTables: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('@/services/rating-slip-modal/rpc', () => ({
  getModalDataViaRPC: jest.fn().mockResolvedValue({
    slip: {
      id: 'slip-123',
      visitId: 'visit-1',
      casinoId: 'casino-1',
      tableId: 'table-1',
      tableLabel: 'T1',
      tableType: 'blackjack',
      seatNumber: null,
      averageBet: 0,
      startTime: '2025-01-01T10:00:00Z',
      endTime: null,
      status: 'open',
      gamingDay: '2025-01-01',
      durationSeconds: 3600,
    },
    player: null,
    loyalty: null,
    financial: {
      totalCashIn: {
        value: 0,
        type: 'actual',
        source: 'PFT',
        completeness: { status: 'unknown' },
      },
      totalCashOut: {
        value: 0,
        type: 'actual',
        source: 'PFT',
        completeness: { status: 'unknown' },
      },
      netPosition: {
        value: 0,
        type: 'actual',
        source: 'PFT',
        completeness: { status: 'unknown' },
      },
    },
    tables: [],
  }),
}));

describe('GET /api/v1/rating-slips/[id]/modal-data', () => {
  const slipId = '123e4567-e89b-12d3-a456-426614174000';

  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with modal data on success', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/rating-slips/${slipId}/modal-data`,
    );
    const routeParams = createMockRouteParams({ id: slipId });
    const response = await GET(request, routeParams);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveProperty('slip');
    expect(body.data).toHaveProperty('financial');
  });

  it('financial section fields are FinancialValue envelopes (PRD-080 WS3)', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/rating-slips/${slipId}/modal-data`,
    );
    const routeParams = createMockRouteParams({ id: slipId });
    const response = await GET(request, routeParams);
    const body = await response.json();

    const { financial } = body.data;
    for (const field of [
      'totalCashIn',
      'totalCashOut',
      'netPosition',
    ] as const) {
      expect(financial[field]).toHaveProperty('value');
      expect(financial[field]).toHaveProperty('type');
      expect(financial[field]).toHaveProperty('source');
      expect(financial[field]).toHaveProperty('completeness');
      expect(financial[field].completeness).toHaveProperty('status');
    }
  });

  it('F-11: financial fields are type actual, NOT compliance (isolation check)', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/rating-slips/${slipId}/modal-data`,
    );
    const routeParams = createMockRouteParams({ id: slipId });
    const response = await GET(request, routeParams);
    const body = await response.json();

    const { financial } = body.data;
    // FinancialSectionDTO comes from VisitFinancialSummaryDTO (actual authority)
    // It must never carry type: 'compliance' — that would violate F-11 isolation
    expect(financial.totalCashIn.type).toBe('actual');
    expect(financial.totalCashOut.type).toBe('actual');
    expect(financial.netPosition.type).toBe('actual');
  });
});
