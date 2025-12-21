/**
 * @jest-environment node
 *
 * GET /api/v1/tables Route Handler Tests
 *
 * Tests for table list endpoint.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS3 (TableService Route Handler Tests)
 */

import { GET } from '../route';
import { createMockRequest } from '@/lib/testing/route-test-helpers';

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
jest.mock('@/services/table-context/crud', () => ({
  listTables: jest.fn().mockResolvedValue([
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      casino_id: 'casino-1',
      table_number: 'T101',
      status: 'active',
      game_type: 'blackjack',
      min_bet: 25,
      max_bet: 5000,
      pit_location: 'A',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ]),
}));

describe('GET /api/v1/tables', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('accepts request without query params', async () => {
    const request = createMockRequest('GET', '/api/v1/tables');
    const response = await GET(request);
    expect(response).toBeDefined();
  });

  it('accepts request with query params', async () => {
    const request = createMockRequest('GET', '/api/v1/tables', {
      searchParams: {
        status: 'active',
        pit: 'A',
        limit: '50',
      },
    });
    const response = await GET(request);
    expect(response).toBeDefined();
  });
});
