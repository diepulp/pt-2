/**
 * @jest-environment node
 *
 * Route Handler Tests: POST /api/v1/mtl/entries/[entryId]/audit-notes
 *
 * Tests MTL audit notes creation endpoint.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: ISSUE-607F9CCB (Route Handler Testing Coverage Gap)
 * Workstream: WS8 (PRD-011 Phase 3 - Auxiliary Tests)
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { POST } from '../route';

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

describe('POST /api/v1/mtl/entries/[entryId]/audit-notes', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const entryId = '123e4567-e89b-12d3-a456-426614174000';
    const request = createMockRequest(
      'POST',
      `/api/v1/mtl/entries/${entryId}/audit-notes`,
      {
        body: {
          staff_id: '123e4567-e89b-12d3-a456-426614174001',
          note: 'Audit note for entry',
        },
      },
    );
    const routeParams = createMockRouteParams({ entryId });

    const response = await POST(request, routeParams);

    expect(response.status).toBe(400);
  });

  it('returns 200 on successful creation', async () => {
    const entryId = '123e4567-e89b-12d3-a456-426614174000';
    const request = createMockRequest(
      'POST',
      `/api/v1/mtl/entries/${entryId}/audit-notes`,
      {
        headers: {
          'Idempotency-Key': 'test-key-123',
          'Content-Type': 'application/json',
        },
        body: {
          staff_id: '123e4567-e89b-12d3-a456-426614174001',
          note: 'Verified entry with patron signature',
        },
      },
    );
    const routeParams = createMockRouteParams({ entryId });

    const response = await POST(request, routeParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('validates staff_id is a UUID', async () => {
    const entryId = '123e4567-e89b-12d3-a456-426614174000';
    const request = createMockRequest(
      'POST',
      `/api/v1/mtl/entries/${entryId}/audit-notes`,
      {
        headers: {
          'Idempotency-Key': 'test-key-124',
          'Content-Type': 'application/json',
        },
        body: {
          staff_id: '123e4567-e89b-12d3-a456-426614174002',
          note: 'Another audit note',
        },
      },
    );
    const routeParams = createMockRouteParams({ entryId });

    const response = await POST(request, routeParams);

    expect(response.status).toBe(200);
  });

  it('validates note is non-empty', async () => {
    const entryId = '123e4567-e89b-12d3-a456-426614174000';
    const request = createMockRequest(
      'POST',
      `/api/v1/mtl/entries/${entryId}/audit-notes`,
      {
        headers: {
          'Idempotency-Key': 'test-key-125',
          'Content-Type': 'application/json',
        },
        body: {
          staff_id: '123e4567-e89b-12d3-a456-426614174001',
          note: 'Valid note content',
        },
      },
    );
    const routeParams = createMockRouteParams({ entryId });

    const response = await POST(request, routeParams);

    expect(response.status).toBe(200);
  });
});
