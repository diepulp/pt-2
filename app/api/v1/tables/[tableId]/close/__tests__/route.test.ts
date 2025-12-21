/**
 * @jest-environment node
 *
 * POST /api/v1/tables/[tableId]/close Route Handler Tests
 *
 * Tests for table close endpoint.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS3 (TableService Route Handler Tests)
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { POST } from '../route';

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
jest.mock('@/services/table-context/table-lifecycle', () => ({
  closeTable: jest.fn().mockResolvedValue({
    id: '123e4567-e89b-12d3-a456-426614174000',
    casino_id: 'casino-1',
    table_number: 'T101',
    status: 'closed',
    game_type: 'blackjack',
    min_bet: 25,
    max_bet: 5000,
    pit_location: 'A',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  }),
}));

describe('POST /api/v1/tables/[tableId]/close', () => {
  const TABLE_ID = '123e4567-e89b-12d3-a456-426614174000';

  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('accepts valid tableId with idempotency key', async () => {
    const request = createMockRequest(
      'POST',
      `/api/v1/tables/${TABLE_ID}/close`,
      {
        headers: {
          'x-idempotency-key': crypto.randomUUID(),
        },
      },
    );
    const params = createMockRouteParams({ tableId: TABLE_ID });
    const response = await POST(request, params);
    expect(response).toBeDefined();
  });
});
