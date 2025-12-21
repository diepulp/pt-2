/**
 * @jest-environment node
 *
 * Route Handler Tests: GET /api/v1/mtl/entries/[entryId]
 *
 * Tests MTL entry detail endpoint.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: ISSUE-607F9CCB (Route Handler Testing Coverage Gap)
 * Workstream: WS8 (PRD-011 Phase 3 - Auxiliary Tests)
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { GET } from '../route';

// Mock dependencies
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve({})),
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

describe('GET /api/v1/mtl/entries/[entryId]', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const entryId = '123e4567-e89b-12d3-a456-426614174000';
    const request = createMockRequest('GET', `/api/v1/mtl/entries/${entryId}`);
    const routeParams = createMockRouteParams({ entryId });

    const response = await GET(request, routeParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('accepts valid UUID entryId', async () => {
    const entryId = '123e4567-e89b-12d3-a456-426614174001';
    const request = createMockRequest('GET', `/api/v1/mtl/entries/${entryId}`);
    const routeParams = createMockRouteParams({ entryId });

    const response = await GET(request, routeParams);

    expect(response.status).toBe(200);
  });
});
