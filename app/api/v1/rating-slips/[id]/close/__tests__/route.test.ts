/**
 * @jest-environment node
 *
 * Rating Slip Close Route Tests
 *
 * Tests for POST /api/v1/rating-slips/[id]/close
 * Part of QA-ROUTE-TESTING execution (ISSUE-607F9CCB)
 */

import { POST } from '../route';
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
    close: jest.fn().mockResolvedValue({
      id: 'slip-123',
      status: 'closed',
      duration_seconds: 3600,
    }),
  })),
}));

describe('POST /api/v1/rating-slips/[id]/close', () => {
  const slipId = '123e4567-e89b-12d3-a456-426614174000';

  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest('POST', `/api/v1/rating-slips/${slipId}/close`);
    const routeParams = createMockRouteParams({ id: slipId });
    const response = await POST(request, routeParams);
    expect(response.status).toBe(400);
  });

  it('returns 200 on success with empty body', async () => {
    const request = createMockRequest('POST', `/api/v1/rating-slips/${slipId}/close`, {
      headers: { 'Idempotency-Key': 'test-key' },
    });
    const routeParams = createMockRouteParams({ id: slipId });
    const response = await POST(request, routeParams);
    expect(response.status).toBe(200);
  });
});
