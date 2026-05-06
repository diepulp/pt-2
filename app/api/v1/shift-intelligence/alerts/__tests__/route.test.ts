/** @jest-environment node */

/**
 * Alerts Route Handler — Route-Boundary Test Matrix (DEC-6, born Phase 1.2B-C)
 *
 * GET /api/v1/shift-intelligence/alerts
 *
 * 6-case matrix: 401 unauthorized, 400 invalid/missing gaming_day, 200 empty
 * array, ratio-branch ShiftAlertDTO (hold_percent), financial-branch
 * ShiftAlertDTO (drop_total), optional status query parameter parsing.
 *
 * ShiftAlertDTO is a discriminated union on metricType (Phase 1.2B-A).
 * DEF-NEVER: hold_percent is never FinancialValue.
 * thresholdValue is absent from ShiftAlertDTO — must not appear in response items (RULE-6).
 *
 * @see EXEC-076 WS2 — Phase 1.2B-C contract expansion (DEC-6)
 * @see services/shift-intelligence/dtos.ts — FinancialShiftAlertDTO | RatioShiftAlertDTO
 */

import { NextRequest } from 'next/server';

import type { ServiceResult } from '@/lib/http/service-response';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACK_FIXTURE = {
  acknowledgedBy: 'staff-uuid-001',
  acknowledgedByName: 'Jane Doe',
  notes: 'False positive — seasonal pattern',
  isFalsePositive: true,
  createdAt: '2026-05-01T14:00:00Z',
};

const RATIO_ALERT_FIXTURE = {
  id: 'alert-uuid-ratio-001',
  tableId: 'table-uuid-001',
  tableLabel: 'BJ-01',
  metricType: 'hold_percent' as const,
  gamingDay: '2026-05-01',
  status: 'open' as const,
  severity: 'low' as const,
  observedValue: 0.42,
  baselineMedian: 0.38,
  baselineMad: 0.04,
  deviationScore: 1.1,
  direction: 'above' as const,
  message: 'Hold ratio slightly elevated',
  createdAt: '2026-05-01T06:00:00Z',
  updatedAt: '2026-05-01T06:00:00Z',
  acknowledgment: null,
};

// Null-values variant: confirms nullable bare-number fields serialize as null, not FinancialValue
const RATIO_ALERT_NULL_FIXTURE = {
  ...RATIO_ALERT_FIXTURE,
  id: 'alert-uuid-ratio-002',
  observedValue: null,
  baselineMedian: null,
  baselineMad: null,
  deviationScore: null,
  direction: null,
  acknowledgment: ACK_FIXTURE,
};

const FV = (value: number, source: string) => ({
  value,
  type: 'estimated' as const,
  source,
  completeness: { status: 'complete' as const },
});

const FINANCIAL_ALERT_FIXTURE = {
  id: 'alert-uuid-fin-001',
  tableId: 'table-uuid-002',
  tableLabel: 'BJ-02',
  metricType: 'drop_total' as const,
  gamingDay: '2026-05-01',
  status: 'acknowledged' as const,
  severity: 'high' as const,
  observedValue: FV(45000, 'table_session.drop'),
  baselineMedian: FV(30000, 'table_session.drop'),
  baselineMad: FV(3000, 'table_session.drop'),
  deviationScore: 2.8,
  direction: 'above' as const,
  message: 'Drop significantly above baseline',
  createdAt: '2026-05-01T07:00:00Z',
  updatedAt: '2026-05-01T09:00:00Z',
  acknowledgment: ACK_FIXTURE,
};

// Null-values variant: confirms nullable FinancialValue fields serialize as null
const FINANCIAL_ALERT_NULL_FIXTURE = {
  ...FINANCIAL_ALERT_FIXTURE,
  id: 'alert-uuid-fin-002',
  observedValue: null,
  baselineMedian: null,
  baselineMad: null,
  deviationScore: null,
  direction: null,
  acknowledgment: null,
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockSupabase: Record<string, unknown>;
const mockGetAlerts = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/services/shift-intelligence/alerts', () => ({
  getAlerts: (...args: unknown[]) => mockGetAlerts(...args),
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
      return handler({
        supabase: mockSupabase,
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
// Import route handler (after mocks)
// ---------------------------------------------------------------------------

import { GET } from '../route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/shift-intelligence/alerts — route-boundary test', () => {
  const GAMING_DAY = '2026-05-01';

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = {};
    mockGetAlerts.mockResolvedValue([]);
  });

  // ── Case 1: 401 Unauthorized ──────────────────────────────────────────────

  it('returns 401 when auth middleware rejects the request', async () => {
    const { withServerAction } = jest.requireMock(
      '@/lib/server-actions/middleware',
    ) as { withServerAction: jest.Mock };

    withServerAction.mockImplementationOnce(async () => ({
      ok: false,
      code: 'UNAUTHORIZED',
      error: 'Unauthorized',
      status: 401,
      requestId: 'test-401-id',
      timestamp: new Date().toISOString(),
    }));

    const request = new NextRequest(
      new URL(
        `/api/v1/shift-intelligence/alerts?gaming_day=${GAMING_DAY}`,
        'http://localhost:3000',
      ),
    );

    const response = await GET(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  // ── Case 2: 400 Invalid / missing gaming_day ──────────────────────────────

  it('returns 400 when gaming_day query param is missing', async () => {
    // alertsQuerySchema requires gaming_day as z.string().date(); absence → ZodError → 400
    const request = new NextRequest(
      new URL('/api/v1/shift-intelligence/alerts', 'http://localhost:3000'),
    );

    const response = await GET(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when gaming_day is not a valid date string', async () => {
    const request = new NextRequest(
      new URL(
        '/api/v1/shift-intelligence/alerts?gaming_day=not-a-date',
        'http://localhost:3000',
      ),
    );

    const response = await GET(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // ── Case 3: 200 Empty array ───────────────────────────────────────────────

  it('returns 200 with empty alerts array when no alerts exist for gaming day', async () => {
    mockGetAlerts.mockResolvedValueOnce([]);

    const request = new NextRequest(
      new URL(
        `/api/v1/shift-intelligence/alerts?gaming_day=${GAMING_DAY}`,
        'http://localhost:3000',
      ),
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.alerts).toEqual([]);
  });

  // ── Case 4: Ratio-branch ShiftAlertDTO (hold_percent) ────────────────────
  // DEF-NEVER: hold_percent metric values are bare number | null, never FinancialValue.
  // RULE-6: thresholdValue must be absent from all ShiftAlertDTO response items.

  it('ratio-branch: observedValue/baselineMedian/baselineMad are bare number|null; thresholdValue absent', async () => {
    mockGetAlerts.mockResolvedValueOnce([
      RATIO_ALERT_FIXTURE,
      RATIO_ALERT_NULL_FIXTURE,
    ]);

    const request = new NextRequest(
      new URL(
        `/api/v1/shift-intelligence/alerts?gaming_day=${GAMING_DAY}`,
        'http://localhost:3000',
      ),
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);

    const [ratioAlert, ratioNullAlert] = body.data.alerts;

    // Full ShiftAlertDTO base fields present
    expect(ratioAlert.id).toBe('alert-uuid-ratio-001');
    expect(ratioAlert.tableId).toBeDefined();
    expect(ratioAlert.tableLabel).toBeDefined();
    expect(ratioAlert.gamingDay).toBeDefined();
    expect(ratioAlert.status).toBeDefined();
    expect(ratioAlert.severity).toBeDefined();
    expect('deviationScore' in ratioAlert).toBe(true);
    expect('direction' in ratioAlert).toBe(true);
    expect('message' in ratioAlert).toBe(true);
    expect(ratioAlert.createdAt).toBeDefined();
    expect(ratioAlert.updatedAt).toBeDefined();
    expect('acknowledgment' in ratioAlert).toBe(true);

    // DEF-NEVER: hold_percent is bare number, not a FinancialValue object
    expect(ratioAlert.metricType).toBe('hold_percent');
    expect(typeof ratioAlert.observedValue).toBe('number');
    expect(typeof ratioAlert.baselineMedian).toBe('number');
    expect(typeof ratioAlert.baselineMad).toBe('number');

    // RULE-6: thresholdValue absent from ShiftAlertDTO (not part of the DTO)
    expect('thresholdValue' in ratioAlert).toBe(false);

    // Null-values variant: nullable number|null fields serialize as bare null
    expect(ratioNullAlert.observedValue).toBeNull();
    expect(ratioNullAlert.baselineMedian).toBeNull();
    expect(ratioNullAlert.baselineMad).toBeNull();
    expect('thresholdValue' in ratioNullAlert).toBe(false);

    // Non-null acknowledgment: all fields present
    expect(ratioNullAlert.acknowledgment).not.toBeNull();
    expect(ratioNullAlert.acknowledgment.acknowledgedBy).toBeDefined();
    expect(typeof ratioNullAlert.acknowledgment.acknowledgedByName).toBe(
      'string',
    );
    expect(typeof ratioNullAlert.acknowledgment.isFalsePositive).toBe(
      'boolean',
    );
    expect(ratioNullAlert.acknowledgment.createdAt).toBeDefined();
    expect('notes' in ratioNullAlert.acknowledgment).toBe(true);
  });

  // ── Case 5: Financial-branch ShiftAlertDTO (drop_total) ───────────────────
  // Financial metric: observedValue/baselineMedian/baselineMad are FinancialValue | null.
  // RULE-5: value is integer cents (Number.isInteger).
  // RULE-6: thresholdValue absent.

  it('financial-branch: observedValue/baselineMedian/baselineMad are FinancialValue|null with integer value; thresholdValue absent', async () => {
    mockGetAlerts.mockResolvedValueOnce([
      FINANCIAL_ALERT_FIXTURE,
      FINANCIAL_ALERT_NULL_FIXTURE,
    ]);

    const request = new NextRequest(
      new URL(
        `/api/v1/shift-intelligence/alerts?gaming_day=${GAMING_DAY}`,
        'http://localhost:3000',
      ),
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);

    const [finAlert, finNullAlert] = body.data.alerts;

    // Full ShiftAlertDTO base fields present
    expect(finAlert.id).toBe('alert-uuid-fin-001');
    expect(finAlert.tableId).toBeDefined();
    expect(finAlert.tableLabel).toBeDefined();
    expect(finAlert.gamingDay).toBeDefined();
    expect(finAlert.status).toBeDefined();
    expect(finAlert.severity).toBeDefined();
    expect('deviationScore' in finAlert).toBe(true);
    expect('direction' in finAlert).toBe(true);
    expect('message' in finAlert).toBe(true);
    expect(finAlert.createdAt).toBeDefined();
    expect(finAlert.updatedAt).toBeDefined();
    expect('acknowledgment' in finAlert).toBe(true);

    // Financial metric: FinancialValue envelope on observedValue
    expect(finAlert.metricType).toBe('drop_total');
    expect(finAlert.observedValue).not.toBeNull();
    expect(typeof finAlert.observedValue).toBe('object');

    // RULE-5: value is integer cents
    expect(Number.isInteger(finAlert.observedValue.value)).toBe(true);
    expect(finAlert.observedValue.value).toBe(45000);
    expect(typeof finAlert.observedValue.type).toBe('string');
    expect(typeof finAlert.observedValue.source).toBe('string');
    expect(finAlert.observedValue.completeness.status).toBeDefined();

    expect(Number.isInteger(finAlert.baselineMedian.value)).toBe(true);
    expect(Number.isInteger(finAlert.baselineMad.value)).toBe(true);

    // RULE-6: thresholdValue absent from ShiftAlertDTO
    expect('thresholdValue' in finAlert).toBe(false);

    // Non-null acknowledgment
    expect(finAlert.acknowledgment).not.toBeNull();
    expect(finAlert.acknowledgment.acknowledgedBy).toBeDefined();
    expect(typeof finAlert.acknowledgment.isFalsePositive).toBe('boolean');
    expect(finAlert.acknowledgment.createdAt).toBeDefined();

    // Null-values variant: nullable FinancialValue fields serialize as null
    expect(finNullAlert.observedValue).toBeNull();
    expect(finNullAlert.baselineMedian).toBeNull();
    expect(finNullAlert.baselineMad).toBeNull();
    expect('thresholdValue' in finNullAlert).toBe(false);
    expect(finNullAlert.acknowledgment).toBeNull();
  });

  // ── Case 6: Optional status query parameter ────────────────────────────────

  it('passes status=open filter through to getAlerts', async () => {
    mockGetAlerts.mockResolvedValueOnce([RATIO_ALERT_FIXTURE]);

    const request = new NextRequest(
      new URL(
        `/api/v1/shift-intelligence/alerts?gaming_day=${GAMING_DAY}&status=open`,
        'http://localhost:3000',
      ),
    );

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(mockGetAlerts).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({ gaming_day: GAMING_DAY, status: 'open' }),
    );
  });

  it('passes status=acknowledged filter through to getAlerts', async () => {
    mockGetAlerts.mockResolvedValueOnce([FINANCIAL_ALERT_FIXTURE]);

    const request = new NextRequest(
      new URL(
        `/api/v1/shift-intelligence/alerts?gaming_day=${GAMING_DAY}&status=acknowledged`,
        'http://localhost:3000',
      ),
    );

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(mockGetAlerts).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        gaming_day: GAMING_DAY,
        status: 'acknowledged',
      }),
    );
  });

  it('returns 400 when status value is not a valid enum member', async () => {
    // alertsQuerySchema: status: z.enum(['open', 'acknowledged']).optional()
    const request = new NextRequest(
      new URL(
        `/api/v1/shift-intelligence/alerts?gaming_day=${GAMING_DAY}&status=invalid`,
        'http://localhost:3000',
      ),
    );

    const response = await GET(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});
