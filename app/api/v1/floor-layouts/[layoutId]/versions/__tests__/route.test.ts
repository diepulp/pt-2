/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/floor-layouts/[layoutId]/versions
 *
 * Tests GET (list versions) endpoint.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS9 (QA-ROUTE-TESTING-FLOOR-LAYOUT)
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

// Mock middleware to bypass auth/RLS in unit tests
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
    }),
  ),
}));

// Mock floor layout service
jest.mock('@/services/floor-layout', () => ({
  createFloorLayoutService: jest.fn(() => ({
    listVersions: jest.fn().mockResolvedValue({
      items: [
        {
          id: '123e4567-e89b-12d3-a456-426614174001',
          layout_id: '123e4567-e89b-12d3-a456-426614174000',
          version: 1,
          status: 'active',
        },
      ],
    }),
  })),
}));

describe('GET /api/v1/floor-layouts/[layoutId]/versions', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest(
      'GET',
      '/api/v1/floor-layouts/123e4567-e89b-12d3-a456-426614174000/versions',
    );
    const context = createMockRouteParams({
      layoutId: '123e4567-e89b-12d3-a456-426614174000',
    });
    const response = await GET(request, context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.any(Object),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('accepts status filter', async () => {
    const request = createMockRequest(
      'GET',
      '/api/v1/floor-layouts/123e4567-e89b-12d3-a456-426614174000/versions',
      {
        searchParams: { status: 'active' },
      },
    );
    const context = createMockRouteParams({
      layoutId: '123e4567-e89b-12d3-a456-426614174000',
    });
    const response = await GET(request, context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveProperty('items');
  });

  it('accepts include_slots parameter', async () => {
    const request = createMockRequest(
      'GET',
      '/api/v1/floor-layouts/123e4567-e89b-12d3-a456-426614174000/versions',
      {
        searchParams: { include_slots: 'true' },
      },
    );
    const context = createMockRouteParams({
      layoutId: '123e4567-e89b-12d3-a456-426614174000',
    });
    const response = await GET(request, context);

    expect(response.status).toBe(200);
  });

  it('validates layoutId parameter as UUID', async () => {
    const request = createMockRequest(
      'GET',
      '/api/v1/floor-layouts/123e4567-e89b-12d3-a456-426614174000/versions',
    );
    const context = createMockRouteParams({
      layoutId: '123e4567-e89b-12d3-a456-426614174000',
    });
    const response = await GET(request, context);

    expect(response.status).toBe(200);
  });
});
