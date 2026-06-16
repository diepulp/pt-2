/** @jest-environment node */

/**
 * Route contract tests: GET /api/v1/table-context/table-sessions/[sessionId]/accounting-projection
 *
 * EXEC-090 WS3 exit gate verification:
 *   api_returns_projection: true
 *   route_local_formula: false (service mock returns projection, handler adds no derivation)
 *   no_spoofable_identity_params: true (casinoId is from rlsContext, not request)
 *   route_role_matrix_verified: true (pit_boss/admin → 200)
 *   route_negative_roles_verified: true (dealer/cashier → 403, derive not invoked)
 *   cross_casino_response_is_404: true (SESSION_NOT_FOUND → 404, not integrity_failure)
 *   service_receives_rls_context_casino_id: true
 *
 * @see EXEC-090 WS3, PRD-090, SRL-TIA-001
 */

import { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';

import { GET } from '../route';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

const mockDerive = jest.fn();
jest.mock('@/services/table-context/table-inventory-accounting', () => ({
  createTableInventoryAccountingService: jest.fn(() => ({
    derive: mockDerive,
  })),
}));

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withServerAction } = require('@/lib/server-actions/middleware') as {
  withServerAction: jest.Mock;
};

// ── Fixtures ───────────────────────────────────────────────────────────────────

const VALID_SESSION_ID = '11111111-1111-1111-1111-111111111111';
const RLS_CASINO_ID = 'aaaa0000-0000-0000-0000-000000000001';

function makeMockCtx(staffRole: string) {
  return {
    supabase: {},
    correlationId: 'test-corr-id',
    rlsContext: {
      casinoId: RLS_CASINO_ID,
      actorId: 'bbbb0000-0000-0000-0000-000000000001',
      staffRole,
      companyId: 'cccc0000-0000-0000-0000-000000000001',
    },
    startedAt: Date.now(),
  };
}

function wireWithServerAction(staffRole: string) {
  withServerAction.mockImplementation(
    (_supabase: unknown, handler: (ctx: unknown) => Promise<unknown>) =>
      handler(makeMockCtx(staffRole)),
  );
}

function makeRequest(sessionId: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/table-context/table-sessions/${sessionId}/accounting-projection`,
  );
}

function makeRouteParams(sessionId: string) {
  return { params: Promise.resolve({ sessionId }) };
}

const TELEMETRY_PROJECTION = {
  table_session_id: VALID_SESSION_ID,
  casino_id: RLS_CASINO_ID,
  calculation_kind: 'telemetry_drop_formula' as const,
  projected_table_win_loss_cents: BigInt(150_000),
  partial_table_result_cents: null,
  final_table_win_loss_cents: null,
  telemetry_derived_drop_estimate_cents: BigInt(50_000),
  drop_estimate_state: 'present' as const,
  custody_status: 'non_custody_estimate' as const,
  completeness: { status: 'complete' },
  source_authority: {
    drop: 'table_buyin_telemetry',
    snapshots: 'table_inventory_snapshot',
    fills: 'table_fill',
    credits: 'table_credit',
  },
  integrity_issues: [],
  request_id: 'test-corr-id',
  derived_at: '2026-06-01T00:00:00.000Z',
};

const INTEGRITY_FAILURE_PROJECTION = {
  ...TELEMETRY_PROJECTION,
  calculation_kind: 'integrity_failure' as const,
  projected_table_win_loss_cents: null,
  partial_table_result_cents: null,
  telemetry_derived_drop_estimate_cents: null,
  drop_estimate_state: 'absent' as const,
  source_authority: {
    drop: null,
    snapshots: null,
    fills: 'table_fill',
    credits: 'table_credit',
  },
  integrity_issues: ['missing_opening_inventory_snapshot'],
};

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  wireWithServerAction('pit_boss');
  mockDerive.mockResolvedValue(TELEMETRY_PROJECTION);
});

// ── Validation ─────────────────────────────────────────────────────────────────

describe('GET accounting-projection — param validation', () => {
  it('returns 400 when sessionId is not a valid UUID', async () => {
    // parseParams fires before withServerAction, so withServerAction is never called
    const req = makeRequest('not-a-uuid');
    const res = await GET(req, makeRouteParams('not-a-uuid'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(withServerAction).not.toHaveBeenCalled();
  });

  it('returns 400 when sessionId is empty string', async () => {
    const req = makeRequest('');
    const res = await GET(req, makeRouteParams(''));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});

// ── Role guard ─────────────────────────────────────────────────────────────────

describe('GET accounting-projection — role guard (EXEC-090 WS3)', () => {
  it('allows pit_boss → 200', async () => {
    wireWithServerAction('pit_boss');
    const res = await GET(
      makeRequest(VALID_SESSION_ID),
      makeRouteParams(VALID_SESSION_ID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('allows admin → 200', async () => {
    wireWithServerAction('admin');
    const res = await GET(
      makeRequest(VALID_SESSION_ID),
      makeRouteParams(VALID_SESSION_ID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('denies dealer → 403 with no service invocation', async () => {
    wireWithServerAction('dealer');
    const res = await GET(
      makeRequest(VALID_SESSION_ID),
      makeRouteParams(VALID_SESSION_ID),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('FORBIDDEN');
    expect(mockDerive).not.toHaveBeenCalled();
  });

  it('denies cashier → 403 with no service invocation', async () => {
    wireWithServerAction('cashier');
    const res = await GET(
      makeRequest(VALID_SESSION_ID),
      makeRouteParams(VALID_SESSION_ID),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('FORBIDDEN');
    expect(mockDerive).not.toHaveBeenCalled();
  });

  it('denies unknown role → 403 with no service invocation', async () => {
    wireWithServerAction('floor_supervisor');
    const res = await GET(
      makeRequest(VALID_SESSION_ID),
      makeRouteParams(VALID_SESSION_ID),
    );
    expect(res.status).toBe(403);
    expect(mockDerive).not.toHaveBeenCalled();
  });
});

// ── Success path ───────────────────────────────────────────────────────────────

describe('GET accounting-projection — success', () => {
  it('returns 200 with AccountingProjectionApiResponse shape', async () => {
    const res = await GET(
      makeRequest(VALID_SESSION_ID),
      makeRouteParams(VALID_SESSION_ID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      requestId: expect.any(String),
      durationMs: expect.any(Number),
      timestamp: expect.any(String),
      data: {
        table_session_id: VALID_SESSION_ID,
        casino_id: RLS_CASINO_ID,
        calculation_kind: 'telemetry_drop_formula',
        custody_status: 'non_custody_estimate',
        final_table_win_loss_cents: null,
        drop_estimate_state: 'present',
        completeness: { status: 'complete' },
        integrity_issues: [],
      },
    });
  });

  it('bigint fields are serialized as strings — not numbers (preserves overflow safety)', async () => {
    const res = await GET(
      makeRequest(VALID_SESSION_ID),
      makeRouteParams(VALID_SESSION_ID),
    );
    const body = await res.json();
    expect(typeof body.data.projected_table_win_loss_cents).toBe('string');
    expect(body.data.projected_table_win_loss_cents).toBe('150000');
    expect(typeof body.data.telemetry_derived_drop_estimate_cents).toBe(
      'string',
    );
    expect(body.data.telemetry_derived_drop_estimate_cents).toBe('50000');
    expect(body.data.partial_table_result_cents).toBeNull();
  });

  it('high-value bigint (>= 2^31) serializes without precision loss', async () => {
    const largeValue = BigInt('9223372036854775807'); // i64 max
    mockDerive.mockResolvedValueOnce({
      ...TELEMETRY_PROJECTION,
      projected_table_win_loss_cents: largeValue,
      telemetry_derived_drop_estimate_cents: largeValue,
    });
    const res = await GET(
      makeRequest(VALID_SESSION_ID),
      makeRouteParams(VALID_SESSION_ID),
    );
    const body = await res.json();
    expect(body.data.projected_table_win_loss_cents).toBe(
      '9223372036854775807',
    );
    expect(body.data.telemetry_derived_drop_estimate_cents).toBe(
      '9223372036854775807',
    );
  });

  it('passes casinoId from rlsContext — not from request (ADR-024)', async () => {
    await GET(makeRequest(VALID_SESSION_ID), makeRouteParams(VALID_SESSION_ID));
    expect(mockDerive).toHaveBeenCalledWith(
      expect.objectContaining({ casinoId: RLS_CASINO_ID }),
    );
  });

  it('passes sessionId and correlationId to service.derive', async () => {
    await GET(makeRequest(VALID_SESSION_ID), makeRouteParams(VALID_SESSION_ID));
    expect(mockDerive).toHaveBeenCalledWith({
      tableSessionId: VALID_SESSION_ID,
      casinoId: RLS_CASINO_ID,
      requestId: 'test-corr-id',
    });
  });
});

// ── integrity_failure is HTTP 200 (business state, not an error) ───────────────

describe('GET accounting-projection — integrity_failure state', () => {
  it('returns 200 when calculation_kind is integrity_failure', async () => {
    mockDerive.mockResolvedValueOnce(INTEGRITY_FAILURE_PROJECTION);
    const res = await GET(
      makeRequest(VALID_SESSION_ID),
      makeRouteParams(VALID_SESSION_ID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.calculation_kind).toBe('integrity_failure');
    expect(body.data.projected_table_win_loss_cents).toBeNull();
    expect(body.data.partial_table_result_cents).toBeNull();
    expect(body.data.integrity_issues).toEqual([
      'missing_opening_inventory_snapshot',
    ]);
  });
});

// ── Cross-casino 404 ───────────────────────────────────────────────────────────

describe('GET accounting-projection — cross-casino isolation', () => {
  it('returns 404 (not 200/integrity_failure) when session belongs to another casino', async () => {
    mockDerive.mockRejectedValueOnce(
      new DomainError('SESSION_NOT_FOUND', undefined, { httpStatus: 404 }),
    );
    const res = await GET(
      makeRequest(VALID_SESSION_ID),
      makeRouteParams(VALID_SESSION_ID),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('SESSION_NOT_FOUND');
  });
});
