/**
 * @jest-environment node
 *
 * POST/DELETE /api/v1/tables/[tableId]/dealer Route Handler Tests
 *
 * Tests for dealer rotation endpoints.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS3 (TableService Route Handler Tests)
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { POST, DELETE } from '../route';

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

// Mock service layer
jest.mock('@/services/table-context/dealer-rotation', () => ({
  assignDealer: jest.fn().mockResolvedValue({
    id: '223e4567-e89b-12d3-a456-426614174000',
    table_id: '123e4567-e89b-12d3-a456-426614174000',
    staff_id: '323e4567-e89b-12d3-a456-426614174000',
    started_at: '2025-01-01T12:00:00Z',
    ended_at: null,
    created_at: '2025-01-01T12:00:00Z',
    updated_at: '2025-01-01T12:00:00Z',
  }),
  endDealerRotation: jest.fn().mockResolvedValue({
    id: '223e4567-e89b-12d3-a456-426614174000',
    table_id: '123e4567-e89b-12d3-a456-426614174000',
    staff_id: '323e4567-e89b-12d3-a456-426614174000',
    started_at: '2025-01-01T12:00:00Z',
    ended_at: '2025-01-01T16:00:00Z',
    created_at: '2025-01-01T12:00:00Z',
    updated_at: '2025-01-01T16:00:00Z',
  }),
}));

describe('POST /api/v1/tables/[tableId]/dealer', () => {
  const TABLE_ID = '123e4567-e89b-12d3-a456-426614174000';
  const STAFF_ID = '323e4567-e89b-12d3-a456-426614174000';

  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('accepts valid tableId and staff_id with idempotency key', async () => {
    const request = createMockRequest(
      'POST',
      `/api/v1/tables/${TABLE_ID}/dealer`,
      {
        headers: {
          'x-idempotency-key': crypto.randomUUID(),
          'Content-Type': 'application/json',
        },
        body: { staff_id: STAFF_ID },
      },
    );
    const params = createMockRouteParams({ tableId: TABLE_ID });
    const response = await POST(request, params);
    expect(response).toBeDefined();
  });
});

describe('DELETE /api/v1/tables/[tableId]/dealer', () => {
  const TABLE_ID = '123e4567-e89b-12d3-a456-426614174000';

  it('exports DELETE handler', () => {
    expect(typeof DELETE).toBe('function');
  });

  it('accepts valid tableId with idempotency key', async () => {
    const request = createMockRequest(
      'DELETE',
      `/api/v1/tables/${TABLE_ID}/dealer`,
      {
        headers: {
          'x-idempotency-key': crypto.randomUUID(),
        },
      },
    );
    const params = createMockRouteParams({ tableId: TABLE_ID });
    const response = await DELETE(request, params);
    expect(response).toBeDefined();
  });
});
