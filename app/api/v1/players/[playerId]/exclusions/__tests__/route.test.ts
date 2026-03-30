/**
 * @jest-environment node
 *
 * Route Handler Tests: POST /api/v1/players/[playerId]/exclusions
 *
 * Secondary contract guard: validates that the route handler rejects
 * ISO 8601 datetime in calendar date fields and accepts YYYY-MM-DD.
 *
 * @see DATE-MISMATCH.md — commit 14e02c5 regression analysis
 * @see lib/validation/date.ts — canonical dateSchema()
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { POST } from '../route';

const VALID_PLAYER_ID = '123e4567-e89b-12d3-a456-426614174000';
const IDEMPOTENCY_KEY = 'test-idempotency-key';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    from: jest.fn(),
  }),
}));

const mockCreateExclusion = jest.fn();

// Mock middleware to bypass auth/RLS
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
    }),
  ),
}));

// Mock exclusion service
jest.mock('@/services/player/exclusion', () => ({
  createExclusionService: jest.fn(() => ({
    createExclusion: mockCreateExclusion,
  })),
}));

function makeRequest(body: Record<string, unknown>) {
  return createMockRequest(
    'POST',
    `/api/v1/players/${VALID_PLAYER_ID}/exclusions`,
    {
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': IDEMPOTENCY_KEY,
      },
      body,
    },
  );
}

const validBase = {
  exclusion_type: 'trespass',
  enforcement: 'hard_block',
  reason: 'Test reason for exclusion',
};

describe('POST /api/v1/players/[playerId]/exclusions', () => {
  const routeParams = createMockRouteParams({ playerId: VALID_PLAYER_ID });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateExclusion.mockResolvedValue({
      id: 'excl-1',
      player_id: VALID_PLAYER_ID,
      ...validBase,
    });
  });

  it('accepts YYYY-MM-DD date fields (correct format)', async () => {
    const request = makeRequest({
      ...validBase,
      effective_from: '2026-04-01',
      effective_until: '2026-12-31',
      review_date: '2026-06-15',
    });

    const response = await POST(request, routeParams);
    expect(response.status).toBe(201);
  });

  it('accepts request without date fields', async () => {
    const request = makeRequest(validBase);

    const response = await POST(request, routeParams);
    expect(response.status).toBe(201);
  });

  it('rejects ISO 8601 datetime in effective_from', async () => {
    const request = makeRequest({
      ...validBase,
      effective_from: '2026-04-01T07:00:00.000Z',
    });

    const response = await POST(request, routeParams);
    expect(response.status).toBeGreaterThanOrEqual(400);

    const body = await response.json();
    expect(JSON.stringify(body)).toContain('YYYY-MM-DD');
  });

  it('rejects ISO 8601 datetime in effective_until', async () => {
    const request = makeRequest({
      ...validBase,
      effective_until: '2026-12-31T00:00:00.000Z',
    });

    const response = await POST(request, routeParams);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects ISO 8601 datetime in review_date', async () => {
    const request = makeRequest({
      ...validBase,
      review_date: '2026-06-15T00:00:00Z',
    });

    const response = await POST(request, routeParams);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
