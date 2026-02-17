/**
 * @jest-environment node
 *
 * Route Handler Tests: PATCH /api/v1/table-context/credits/[id]/confirm
 *
 * Validates cashier credit confirmation HTTP boundary layer.
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
  confirmTableCredit: jest.fn().mockResolvedValue({
    id: '123e4567-e89b-12d3-a456-426614174000',
    casino_id: 'casino-1',
    table_id: 'table-1',
    request_id: 'req-credit-001',
    chipset: { '500': 10 },
    amount_cents: 500000,
    authorized_by: 'staff-pit-001',
    sent_by: 'staff-dealer-001',
    received_by: 'staff-runner-001',
    slip_no: 'CREDIT-001',
    created_at: '2026-02-17T14:00:00Z',
    status: 'confirmed',
    confirmed_at: '2026-02-17T14:20:00Z',
    confirmed_by: 'staff-cashier-001',
    confirmed_amount_cents: 500000,
    discrepancy_note: null,
  }),
}));

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('PATCH /api/v1/table-context/credits/[id]/confirm', () => {
  it('exports PATCH handler', () => {
    expect(typeof PATCH).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope on valid input', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/table-context/credits/${VALID_UUID}/confirm`,
      {
        headers: {
          'Idempotency-Key': 'test-key-001',
          'Content-Type': 'application/json',
        },
        body: {
          confirmed_amount_cents: 500000,
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
        status: 'confirmed',
        confirmed_amount_cents: 500000,
      }),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('accepts optional discrepancy_note', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/table-context/credits/${VALID_UUID}/confirm`,
      {
        headers: {
          'Idempotency-Key': 'test-key-002',
          'Content-Type': 'application/json',
        },
        body: {
          confirmed_amount_cents: 450000,
          discrepancy_note: 'Short 1 denomination',
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
      `/api/v1/table-context/credits/${VALID_UUID}/confirm`,
      {
        headers: { 'Content-Type': 'application/json' },
        body: { confirmed_amount_cents: 500000 },
      },
    );
    const routeParams = createMockRouteParams({ id: VALID_UUID });

    const response = await PATCH(request, routeParams);

    expect(response.status).toBe(400);
  });

  it('rejects invalid UUID param', async () => {
    const request = createMockRequest(
      'PATCH',
      '/api/v1/table-context/credits/not-a-uuid/confirm',
      {
        headers: {
          'Idempotency-Key': 'test-key-003',
          'Content-Type': 'application/json',
        },
        body: { confirmed_amount_cents: 500000 },
      },
    );
    const routeParams = createMockRouteParams({ id: 'not-a-uuid' });

    const response = await PATCH(request, routeParams);

    expect(response.status).toBe(400);
  });

  it('rejects non-positive amount', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/table-context/credits/${VALID_UUID}/confirm`,
      {
        headers: {
          'Idempotency-Key': 'test-key-005',
          'Content-Type': 'application/json',
        },
        body: { confirmed_amount_cents: -100 },
      },
    );
    const routeParams = createMockRouteParams({ id: VALID_UUID });

    const response = await PATCH(request, routeParams);

    expect(response.status).toBe(400);
  });
});
