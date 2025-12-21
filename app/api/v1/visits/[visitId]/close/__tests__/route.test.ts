/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/visits/[visitId]/close
 *
 * Tests PATCH endpoint for closing a visit (check-out).
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS2 (VisitService Route Handler Tests)
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { PATCH } from '../route';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    from: jest.fn(),
  }),
}));

// Mock middleware to bypass auth/RLS in unit tests
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
    }),
  ),
}));

// Mock visit service
jest.mock('@/services/visit', () => ({
  createVisitService: jest.fn(() => ({
    getById: jest.fn().mockResolvedValue({
      id: '123e4567-e89b-12d3-a456-426614174000',
      player_id: 'player-1',
      casino_id: 'casino-1',
      visit_date: '2025-01-01',
      check_in: '2025-01-01T10:00:00Z',
      check_out: null,
      created_at: '2025-01-01T10:00:00Z',
      updated_at: '2025-01-01T10:00:00Z',
    }),
    closeVisit: jest.fn().mockResolvedValue({
      id: '123e4567-e89b-12d3-a456-426614174000',
      player_id: 'player-1',
      casino_id: 'casino-1',
      visit_date: '2025-01-01',
      check_in: '2025-01-01T10:00:00Z',
      check_out: '2025-01-01T18:00:00Z',
      created_at: '2025-01-01T10:00:00Z',
      updated_at: '2025-01-01T18:00:00Z',
    }),
  })),
}));

describe('PATCH /api/v1/visits/[visitId]/close', () => {
  it('exports PATCH handler', () => {
    expect(typeof PATCH).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const visitId = '123e4567-e89b-12d3-a456-426614174000';
    const request = createMockRequest(
      'PATCH',
      `/api/v1/visits/${visitId}/close`,
      {
        body: {},
      },
    );
    const params = createMockRouteParams({ visitId });

    const response = await PATCH(request, params);

    expect(response.status).toBe(400);
  });

  it('returns 200 with ServiceHttpResult envelope on success', async () => {
    const visitId = '123e4567-e89b-12d3-a456-426614174000';
    const request = createMockRequest(
      'PATCH',
      `/api/v1/visits/${visitId}/close`,
      {
        headers: {
          'Idempotency-Key': 'test-key-123',
          'Content-Type': 'application/json',
        },
        body: {},
      },
    );
    const params = createMockRouteParams({ visitId });

    const response = await PATCH(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.objectContaining({
        id: visitId,
        check_out: expect.any(String),
      }),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('accepts optional body with notes', async () => {
    const visitId = '123e4567-e89b-12d3-a456-426614174000';
    const request = createMockRequest(
      'PATCH',
      `/api/v1/visits/${visitId}/close`,
      {
        headers: {
          'Idempotency-Key': 'test-key-456',
          'Content-Type': 'application/json',
        },
        body: {
          notes: 'Player had a great session',
        },
      },
    );
    const params = createMockRouteParams({ visitId });

    const response = await PATCH(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('handles valid UUID in route params', async () => {
    const visitId = '123e4567-e89b-12d3-a456-426614174000';
    const request = createMockRequest(
      'PATCH',
      `/api/v1/visits/${visitId}/close`,
      {
        headers: {
          'Idempotency-Key': 'test-key-789',
          'Content-Type': 'application/json',
        },
        body: {},
      },
    );
    const params = createMockRouteParams({ visitId });

    const response = await PATCH(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.id).toBe(visitId);
  });
});
