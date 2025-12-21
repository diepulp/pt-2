/**
 * @jest-environment node
 *
 * Rating Slip Modal Data Route Tests
 *
 * Tests for GET /api/v1/rating-slips/[id]/modal-data
 * Part of QA-ROUTE-TESTING execution (ISSUE-607F9CCB)
 */

import { GET } from '../route';
import { createMockRequest, createMockRouteParams } from '@/lib/testing/route-test-helpers';

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
    getVisitSummary: jest
      .fn()
      .mockResolvedValue({ total_in: 0, total_out: 0, net_amount: 0 }),
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

describe('GET /api/v1/rating-slips/[id]/modal-data', () => {
  const slipId = '123e4567-e89b-12d3-a456-426614174000';

  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with modal data on success', async () => {
    const request = createMockRequest('GET', `/api/v1/rating-slips/${slipId}/modal-data`);
    const routeParams = createMockRouteParams({ id: slipId });
    const response = await GET(request, routeParams);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveProperty('slip');
    expect(body.data).toHaveProperty('financial');
  });
});
