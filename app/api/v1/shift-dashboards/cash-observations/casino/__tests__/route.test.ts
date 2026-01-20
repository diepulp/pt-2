/**
 * @jest-environment node
 *
 * Route Handler Tests: GET /api/v1/shift-dashboards/cash-observations/casino
 *
 * Tests for cash observations casino rollup endpoint.
 * TELEMETRY-ONLY: Observational metrics, not authoritative.
 * @see PRD-Shift-Dashboards-v0.2
 */

import { GET } from '../route';

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

// Mock service function
jest.mock('@/services/table-context/shift-cash-obs', () => ({
  getShiftCashObsCasino: jest.fn().mockResolvedValue(null),
}));

describe('GET /api/v1/shift-dashboards/cash-observations/casino', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });
});
