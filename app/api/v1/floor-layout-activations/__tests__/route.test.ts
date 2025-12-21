/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/floor-layout-activations
 *
 * Tests POST (activate layout) endpoint.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS9 (QA-ROUTE-TESTING-FLOOR-LAYOUT)
 */

import { POST } from '../route';
import { createMockRequest } from '@/lib/testing/route-test-helpers';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    rpc: jest.fn(),
  }),
}));

// Mock middleware to bypass auth/RLS in unit tests
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {
        rpc: jest.fn().mockResolvedValue({
          data: {
            id: '123e4567-e89b-12d3-a456-426614174002',
            casino_id: 'casino-1',
            layout_version_id: '123e4567-e89b-12d3-a456-426614174001',
            status: 'active',
          },
          error: null,
        }),
      },
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
    }),
  ),
}));

describe('POST /api/v1/floor-layout-activations', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/floor-layout-activations',
      {
        body: {
          casino_id: '123e4567-e89b-12d3-a456-426614174000',
          layout_version_id: '123e4567-e89b-12d3-a456-426614174001',
          activated_by: '123e4567-e89b-12d3-a456-426614174002',
        },
      },
    );
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 201 on successful activation', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/floor-layout-activations',
      {
        headers: {
          'Idempotency-Key': 'test-key-123',
          'Content-Type': 'application/json',
        },
        body: {
          casino_id: '123e4567-e89b-12d3-a456-426614174000',
          layout_version_id: '123e4567-e89b-12d3-a456-426614174001',
          activated_by: '123e4567-e89b-12d3-a456-426614174002',
        },
      },
    );
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.objectContaining({
        id: expect.any(String),
        casino_id: expect.any(String),
        layout_version_id: expect.any(String),
      }),
    });
  });

  it('accepts optional activation_request_id', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/floor-layout-activations',
      {
        headers: {
          'Idempotency-Key': 'test-key-456',
          'Content-Type': 'application/json',
        },
        body: {
          casino_id: '123e4567-e89b-12d3-a456-426614174000',
          layout_version_id: '123e4567-e89b-12d3-a456-426614174001',
          activated_by: '123e4567-e89b-12d3-a456-426614174002',
          activation_request_id: '123e4567-e89b-12d3-a456-426614174003',
        },
      },
    );
    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it('validates required fields', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/floor-layout-activations',
      {
        headers: {
          'Idempotency-Key': 'test-key-789',
          'Content-Type': 'application/json',
        },
        body: {
          // Missing required fields
          casino_id: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    );
    const response = await POST(request);

    // Zod validation should fail before reaching service layer
    expect([400, 500]).toContain(response.status);
  });
});
