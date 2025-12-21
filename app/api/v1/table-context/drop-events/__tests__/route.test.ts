/**
 * @jest-environment node
 *
 * Route Handler Tests: POST /api/v1/table-context/drop-events
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS6 (TableContextService table-context endpoints)
 */

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

describe('POST /api/v1/table-context/drop-events', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });
});
