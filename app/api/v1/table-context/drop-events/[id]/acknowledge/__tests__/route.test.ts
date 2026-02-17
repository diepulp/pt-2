/**
 * @jest-environment node
 *
 * Route Handler Tests: PATCH /api/v1/table-context/drop-events/[id]/acknowledge
 *
 * Validates cashier drop acknowledgement HTTP boundary layer.
 * PRD-033 Cashier Workflow MVP — WS6
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { PATCH } from '../route';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

// Mock middleware to bypass auth/RLS in unit tests
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: {
        casinoId: 'casino-1',
        actorId: 'actor-1',
        staffRole: 'cashier',
      },
      startedAt: Date.now(),
    }),
  ),
}));

// Mock chip-custody service
jest.mock('@/services/table-context/chip-custody', () => ({
  acknowledgeDropReceived: jest.fn().mockResolvedValue({
    id: '123e4567-e89b-12d3-a456-426614174000',
    casino_id: 'casino-1',
    table_id: 'table-1',
    drop_box_id: 'box-001',
    seal_no: 'SEAL-001',
    gaming_day: '2026-02-17',
    seq_no: 1,
    removed_by: 'staff-security-001',
    witnessed_by: 'staff-pit-001',
    removed_at: '2026-02-17T06:00:00Z',
    delivered_at: '2026-02-17T06:30:00Z',
    delivered_scan_at: '2026-02-17T06:35:00Z',
    note: null,
    cage_received_at: '2026-02-17T07:00:00Z',
    cage_received_by: 'staff-cashier-001',
  }),
}));

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('PATCH /api/v1/table-context/drop-events/[id]/acknowledge', () => {
  it('exports PATCH handler', () => {
    expect(typeof PATCH).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope on valid request', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/table-context/drop-events/${VALID_UUID}/acknowledge`,
      {
        headers: {
          'Idempotency-Key': 'test-key-001',
          'Content-Type': 'application/json',
        },
      },
    );
    const routeParams = createMockRouteParams({ id: VALID_UUID });

    const response = await PATCH(request, routeParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.objectContaining({
        id: VALID_UUID,
        cage_received_at: expect.any(String),
        cage_received_by: expect.any(String),
      }),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('does not require request body', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/table-context/drop-events/${VALID_UUID}/acknowledge`,
      {
        headers: {
          'Idempotency-Key': 'test-key-002',
        },
      },
    );
    const routeParams = createMockRouteParams({ id: VALID_UUID });

    const response = await PATCH(request, routeParams);

    expect(response.status).toBe(200);
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/table-context/drop-events/${VALID_UUID}/acknowledge`,
      {},
    );
    const routeParams = createMockRouteParams({ id: VALID_UUID });

    const response = await PATCH(request, routeParams);

    expect(response.status).toBe(400);
  });

  it('rejects invalid UUID param', async () => {
    const request = createMockRequest(
      'PATCH',
      '/api/v1/table-context/drop-events/not-a-uuid/acknowledge',
      {
        headers: {
          'Idempotency-Key': 'test-key-003',
        },
      },
    );
    const routeParams = createMockRouteParams({ id: 'not-a-uuid' });

    const response = await PATCH(request, routeParams);

    expect(response.status).toBe(400);
  });
});
