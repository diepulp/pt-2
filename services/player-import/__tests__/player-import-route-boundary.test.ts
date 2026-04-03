/** @jest-environment node */

/**
 * Player Import Batch List Route Handler -- Boundary Test
 *
 * Tests GET /api/v1/player-import/batches at the HTTP boundary layer.
 * Validates request -> response shape, casino_id scoping via RLS context,
 * and error handling when the service layer throws.
 *
 * Mock strategy:
 * - withServerAction: intercepted to inject controlled MiddlewareContext
 * - createClient: mocked to avoid next/headers cookies() in Jest
 *
 * @see PLAYER-IMPORT-POSTURE.md
 * @see ADR-044 Testing Governance Standard
 */

import { NextRequest } from 'next/server';

import type { ServiceResult } from '@/lib/http/service-response';

// ---------------------------------------------------------------------------
// Fixture: minimal ImportBatchDTO list shape
// ---------------------------------------------------------------------------
const BATCH_FIXTURE = {
  id: 'batch-001',
  casino_id: 'casino-abc-123',
  created_by_staff_id: 'staff-001',
  idempotency_key: 'idem-key-001',
  file_name: 'player-list.csv',
  vendor_label: 'vendor-a',
  column_mapping: { email: 'Email', first_name: 'First Name' },
  total_rows: 42,
  report_summary: null,
  status: 'staging' as const,
  created_at: '2026-03-15T12:00:00Z',
  updated_at: '2026-03-15T12:00:00Z',
  storage_path: null,
  original_file_name: null,
  claimed_by: null,
  claimed_at: null,
  heartbeat_at: null,
  attempt_count: 0,
  last_error_at: null,
  last_error_code: null,
};

// ---------------------------------------------------------------------------
// Track service calls to assert casino_id scoping
// ---------------------------------------------------------------------------
const listBatchesSpy = jest.fn();

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/services/player-import', () => ({
  createPlayerImportService: jest.fn(() => ({
    listBatches: listBatchesSpy,
  })),
}));

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn(
    async (
      _supabase: unknown,
      handler: (
        ctx: Record<string, unknown>,
      ) => Promise<ServiceResult<unknown>>,
      _options: unknown,
    ) => {
      // Inject controlled MiddlewareContext -- handler receives this directly
      return handler({
        supabase: { __mock: true },
        correlationId: 'test-correlation-id',
        startedAt: Date.now(),
        rlsContext: {
          actorId: 'actor-001',
          casinoId: 'casino-abc-123',
          staffRole: 'pit_boss',
        },
      });
    },
  ),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are in place
// ---------------------------------------------------------------------------
import { GET } from '@/app/api/v1/player-import/batches/route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/player-import/batches -- boundary test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: happy-path returning a single batch
    listBatchesSpy.mockResolvedValue({
      items: [BATCH_FIXTURE],
      cursor: null,
    });
  });

  it('returns 200 with paginated batch list shape', async () => {
    const request = new NextRequest(
      new URL('/api/v1/player-import/batches', 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: {
        items: [
          expect.objectContaining({
            id: BATCH_FIXTURE.id,
            casino_id: BATCH_FIXTURE.casino_id,
            file_name: BATCH_FIXTURE.file_name,
            status: 'staging',
            total_rows: 42,
          }),
        ],
        cursor: null,
      },
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('passes RLS-scoped supabase to service (casino_id isolation)', async () => {
    const request = new NextRequest(
      new URL('/api/v1/player-import/batches', 'http://localhost:3000'),
      { method: 'GET' },
    );

    await GET(request);

    // The service factory receives the RLS-scoped supabase from MiddlewareContext.
    // withServerAction was called, which means RLS context was applied before
    // the handler executed. Verify the service was invoked with the filters
    // derived from query params (default: no filters).
    const { createPlayerImportService } = jest.requireMock(
      '@/services/player-import',
    ) as { createPlayerImportService: jest.Mock };

    expect(createPlayerImportService).toHaveBeenCalledWith(
      expect.objectContaining({ __mock: true }),
    );
    expect(listBatchesSpy).toHaveBeenCalledWith({
      status: undefined,
      cursor: undefined,
      limit: 20, // default from batchListQuerySchema
    });
  });

  it('returns error when service throws DomainError', async () => {
    // Simulate a service-level error (e.g., INTERNAL_ERROR)
    const { DomainError } = jest.requireActual(
      '@/lib/errors/domain-errors',
    ) as typeof import('@/lib/errors/domain-errors');

    listBatchesSpy.mockRejectedValue(
      new DomainError('INTERNAL_ERROR', 'Database connection failed'),
    );

    const request = new NextRequest(
      new URL('/api/v1/player-import/batches', 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      ok: false,
      code: 'INTERNAL_ERROR',
      error: expect.stringContaining('Database connection failed'),
    });
  });
});
