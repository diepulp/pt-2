/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/mtl/entries
 *
 * Tests GET (list) and POST (create) collection endpoints for MTL entries.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 * DEC-1 (EXEC-071 WS3): casino_id REMOVE — service always receives RLS context casino_id.
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({ from: jest.fn() }),
}));

// Service-level mock — casino_id always from RLS context (DEC-1, EXEC-071 WS1)
const mockListEntries = jest
  .fn()
  .mockResolvedValue({ items: [], next_cursor: null });
const mockCreateEntry = jest.fn().mockResolvedValue({
  id: 'entry-1',
  casino_id: 'casino-1',
  patron_uuid: '123e4567-e89b-12d3-a456-426614174001',
  amount: 5000,
  direction: 'in',
});

jest.mock('@/services/mtl', () => ({
  createMtlService: jest.fn(() => ({
    listEntries: (...args: unknown[]) => mockListEntries(...args),
    createEntry: (...args: unknown[]) => mockCreateEntry(...args),
  })),
}));

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: {
        casinoId: 'casino-1',
        actorId: 'actor-1',
        staffRole: 'pit_boss',
      },
    }),
  ),
}));

// Import route handler AFTER mocks so module-level mock variables are initialized
import { GET, POST } from '../route';

describe('GET /api/v1/mtl/entries', () => {
  beforeEach(() => {
    mockListEntries.mockClear();
    mockListEntries.mockResolvedValue({ items: [], next_cursor: null });
  });

  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/entries', {
      searchParams: {},
    });
    const response = await GET(request);
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

  it('accepts casino_id filter (casino_id stripped — ignored per DEC-1)', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/entries', {
      searchParams: { casino_id: '123e4567-e89b-12d3-a456-426614174000' },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveProperty('items');
    expect(body.data).toEqual(
      expect.objectContaining({ items: expect.any(Array) }),
    );
  });

  it('accepts patron_uuid filter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/entries', {
      searchParams: {
        patron_uuid: '123e4567-e89b-12d3-a456-426614174001',
      },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it('accepts pagination parameters', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/entries', {
      searchParams: { cursor: 'next-cursor-token', limit: '50' },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it('accepts min_amount filter', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/entries', {
      searchParams: { min_amount: '1000' },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  // ── DEC-1 (EXEC-071 WS1/WS3): casino_id REMOVE ─────────────────────────────

  it('DEC-1: does not forward spoofed casino_id query param to service', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/entries', {
      searchParams: { casino_id: 'spoofed-casino-999' },
    });
    await GET(request);

    expect(mockListEntries).toHaveBeenCalledWith(
      expect.objectContaining({ casino_id: 'casino-1' }),
    );
    expect(mockListEntries).not.toHaveBeenCalledWith(
      expect.objectContaining({ casino_id: 'spoofed-casino-999' }),
    );
  });

  it('DEC-1: request with spoofed casino_id still returns 200 (param is stripped)', async () => {
    const request = createMockRequest('GET', '/api/v1/mtl/entries', {
      searchParams: { casino_id: 'spoofed-casino-999' },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});

describe('POST /api/v1/mtl/entries', () => {
  beforeEach(() => {
    mockCreateEntry.mockClear();
    mockCreateEntry.mockResolvedValue({
      id: 'entry-1',
      casino_id: 'casino-1',
      patron_uuid: '123e4567-e89b-12d3-a456-426614174001',
      amount: 5000,
      direction: 'in',
    });
  });

  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest('POST', '/api/v1/mtl/entries', {
      body: {
        patron_uuid: '123e4567-e89b-12d3-a456-426614174001',
        amount: 5000,
        direction: 'in',
      },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 201 on successful creation', async () => {
    const request = createMockRequest('POST', '/api/v1/mtl/entries', {
      headers: {
        'Idempotency-Key': 'test-key-123',
        'Content-Type': 'application/json',
      },
      body: {
        patron_uuid: '123e4567-e89b-12d3-a456-426614174001',
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        amount: 5000,
        direction: 'in',
        txn_type: 'buy_in',
        idempotency_key: 'test-key-123',
        area: 'Table Games',
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ ok: true, code: 'OK' });
  });

  it('accepts optional staff_id', async () => {
    const request = createMockRequest('POST', '/api/v1/mtl/entries', {
      headers: {
        'Idempotency-Key': 'test-key-124',
        'Content-Type': 'application/json',
      },
      body: {
        patron_uuid: '123e4567-e89b-12d3-a456-426614174001',
        casino_id: '123e4567-e89b-12d3-a456-426614174000',
        staff_id: '123e4567-e89b-12d3-a456-426614174002',
        amount: 5000,
        direction: 'in',
        txn_type: 'buy_in',
        idempotency_key: 'test-key-124',
      },
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
  });
});
