/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/finance/transactions/[transactionId] (Legacy)
 *
 * Tests GET (detail) resource endpoint.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * NOTE: This is a legacy route. New code should use /api/v1/financial-transactions/[id]
 *
 * Issue: ISSUE-607F9CCB (Rating Slip Testing Coverage Gap)
 * Workstream: WS7 (PRD-011 Phase 3 - FinancialService)
 */

import { GET } from '../route';
import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    from: jest.fn(),
  }),
}));

describe('GET /api/v1/finance/transactions/[transactionId] (Legacy)', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest(
      'GET',
      '/api/v1/finance/transactions/123e4567-e89b-12d3-a456-426614174000',
    );
    const params = createMockRouteParams({
      transactionId: '123e4567-e89b-12d3-a456-426614174000',
    });

    const response = await GET(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('validates transactionId as UUID', async () => {
    const request = createMockRequest(
      'GET',
      '/api/v1/finance/transactions/invalid-uuid',
    );
    const params = createMockRouteParams({
      transactionId: 'invalid-uuid',
    });

    const response = await GET(request, params);

    expect(response.status).toBe(400);
  });

  it('accepts valid UUID transactionId', async () => {
    const request = createMockRequest(
      'GET',
      '/api/v1/finance/transactions/123e4567-e89b-12d3-a456-426614174000',
    );
    const params = createMockRouteParams({
      transactionId: '123e4567-e89b-12d3-a456-426614174000',
    });

    const response = await GET(request, params);

    expect(response.status).toBe(200);
  });

  it('returns null data (route implementation pending)', async () => {
    const request = createMockRequest(
      'GET',
      '/api/v1/finance/transactions/123e4567-e89b-12d3-a456-426614174000',
    );
    const params = createMockRouteParams({
      transactionId: '123e4567-e89b-12d3-a456-426614174000',
    });

    const response = await GET(request, params);
    const body = await response.json();

    // Note: Legacy route returns null (implementation pending)
    expect(body.data).toBeNull();
  });
});
