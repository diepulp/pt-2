/**
 * @jest-environment node
 *
 * GET/PATCH /api/v1/tables/[tableId]/settings Route Handler Tests
 *
 * Tests for table betting limits endpoints.
 *
 * Issue: PRD-012 (Table Betting Limits Management)
 * Workstream: WS5 (Tests)
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { GET, PATCH } from '../route';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

// Mock middleware to bypass auth/RLS
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
      startedAt: Date.now(),
    }),
  ),
}));

// Mock service layer - getTableSettings
jest.mock('@/services/table-context/table-settings', () => ({
  getTableSettings: jest.fn().mockResolvedValue({
    id: 'settings-123',
    casino_id: 'casino-1',
    table_id: '123e4567-e89b-12d3-a456-426614174000',
    min_bet: 10,
    max_bet: 500,
    active_from: '2025-01-01T00:00:00Z',
  }),
  updateTableLimits: jest.fn().mockResolvedValue({
    id: 'settings-123',
    casino_id: 'casino-1',
    table_id: '123e4567-e89b-12d3-a456-426614174000',
    min_bet: 25,
    max_bet: 1000,
    active_from: '2025-01-01T00:00:00Z',
  }),
}));

describe('GET /api/v1/tables/[tableId]/settings', () => {
  const TABLE_ID = '123e4567-e89b-12d3-a456-426614174000';

  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns table settings for valid tableId', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/tables/${TABLE_ID}/settings`,
    );
    const params = createMockRouteParams({ tableId: TABLE_ID });

    const response = await GET(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.code).toBe('OK');
    expect(body.data).toMatchObject({
      id: 'settings-123',
      table_id: TABLE_ID,
      min_bet: 10,
      max_bet: 500,
    });
  });

  it('returns ServiceHttpResult envelope', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/tables/${TABLE_ID}/settings`,
    );
    const params = createMockRouteParams({ tableId: TABLE_ID });

    const response = await GET(request, params);
    const body = await response.json();

    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.any(Object),
      requestId: expect.any(String),
    });
  });

  it('rejects invalid tableId format', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/tables/not-a-uuid/settings`,
    );
    const params = createMockRouteParams({ tableId: 'not-a-uuid' });

    const response = await GET(request, params);

    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/v1/tables/[tableId]/settings', () => {
  const TABLE_ID = '123e4567-e89b-12d3-a456-426614174000';

  it('exports PATCH handler', () => {
    expect(typeof PATCH).toBe('function');
  });

  it('updates limits with valid data and idempotency key', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/tables/${TABLE_ID}/settings`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: { min_bet: 25, max_bet: 1000 },
      },
    );
    const params = createMockRouteParams({ tableId: TABLE_ID });

    const response = await PATCH(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      min_bet: 25,
      max_bet: 1000,
    });
  });

  it('rejects missing Idempotency-Key header', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/tables/${TABLE_ID}/settings`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        body: { min_bet: 25, max_bet: 1000 },
      },
    );
    const params = createMockRouteParams({ tableId: TABLE_ID });

    const response = await PATCH(request, params);

    expect(response.status).toBe(400);
  });

  it('rejects min_bet > max_bet', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/tables/${TABLE_ID}/settings`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: { min_bet: 1000, max_bet: 100 },
      },
    );
    const params = createMockRouteParams({ tableId: TABLE_ID });

    const response = await PATCH(request, params);

    expect(response.status).toBe(400);
  });

  it('rejects negative min_bet', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/tables/${TABLE_ID}/settings`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: { min_bet: -10, max_bet: 500 },
      },
    );
    const params = createMockRouteParams({ tableId: TABLE_ID });

    const response = await PATCH(request, params);

    expect(response.status).toBe(400);
  });

  it('rejects missing min_bet field', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/tables/${TABLE_ID}/settings`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: { max_bet: 500 },
      },
    );
    const params = createMockRouteParams({ tableId: TABLE_ID });

    const response = await PATCH(request, params);

    expect(response.status).toBe(400);
  });

  it('rejects invalid tableId format', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/tables/not-a-uuid/settings`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: { min_bet: 25, max_bet: 1000 },
      },
    );
    const params = createMockRouteParams({ tableId: 'not-a-uuid' });

    const response = await PATCH(request, params);

    expect(response.status).toBe(400);
  });

  it('returns ServiceHttpResult envelope on success', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/tables/${TABLE_ID}/settings`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: { min_bet: 25, max_bet: 1000 },
      },
    );
    const params = createMockRouteParams({ tableId: TABLE_ID });

    const response = await PATCH(request, params);
    const body = await response.json();

    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.any(Object),
      requestId: expect.any(String),
    });
  });
});
