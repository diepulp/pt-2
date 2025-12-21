/**
 * @jest-environment node
 *
 * Rating Slip Move Player Route Tests
 *
 * Tests for POST /api/v1/rating-slips/[id]/move
 * Part of QA-ROUTE-TESTING execution (ISSUE-607F9CCB)
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { POST } from '../route';

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
      id: '123e4567-e89b-12d3-a456-426614174000',
      status: 'open',
      visit_id: '123e4567-e89b-12d3-a456-426614174002',
      game_settings: null,
    }),
    getActiveForTable: jest.fn().mockResolvedValue([]),
    close: jest
      .fn()
      .mockResolvedValue({ id: '123e4567-e89b-12d3-a456-426614174000' }),
    start: jest
      .fn()
      .mockResolvedValue({ id: '123e4567-e89b-12d3-a456-426614174003' }),
  })),
}));

describe('POST /api/v1/rating-slips/[id]/move', () => {
  const slipId = '123e4567-e89b-12d3-a456-426614174000';
  const tableId = '123e4567-e89b-12d3-a456-426614174001';

  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest(
      'POST',
      `/api/v1/rating-slips/${slipId}/move`,
      {
        body: { destinationTableId: tableId },
      },
    );
    const routeParams = createMockRouteParams({ id: slipId });
    const response = await POST(request, routeParams);
    expect(response.status).toBe(400);
  });

  it('returns 200 on successful move', async () => {
    const request = createMockRequest(
      'POST',
      `/api/v1/rating-slips/${slipId}/move`,
      {
        headers: {
          'Idempotency-Key': 'test-key',
          'Content-Type': 'application/json',
        },
        body: { destinationTableId: tableId },
      },
    );
    const routeParams = createMockRouteParams({ id: slipId });
    const response = await POST(request, routeParams);
    expect(response.status).toBe(200);
  });
});
