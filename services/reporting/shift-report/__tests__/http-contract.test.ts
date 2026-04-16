/** @jest-environment node */
/**
 * Shift Report HTTP Contract Tests
 *
 * Tests the PDF and send route handler contracts.
 * Validates HTTP boundary layer compliance: Content-Type,
 * Content-Disposition, ServiceHttpResult envelope, and Zod validation.
 *
 * Strategy: Mock withServerAction to return pre-built results.
 * The route handler's outer layer (validation, response formatting)
 * is exercised. Service internals are tested in assembler.test.ts.
 *
 * @see EXEC-065 WS5
 * @see QA-005 Route Handler Test Coverage
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

// Mock @react-pdf/renderer
jest.mock('@react-pdf/renderer', () => ({
  renderToBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-pdf-content')),
  Document: 'Document',
  Page: 'Page',
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: unknown) => s },
}));

// Mock PDF template
jest.mock('@/services/reporting/shift-report/pdf/template', () => ({
  ShiftReportPdf: () => null,
}));

// Mock assembly service
jest.mock('@/services/reporting/shift-report', () => ({
  createShiftReportService: jest.fn(() => ({
    assembleShiftReport: jest.fn(),
  })),
}));

// Mock email
jest.mock('@/lib/email/resend-adapter', () => ({
  createResendProvider: jest.fn(() => ({})),
}));

jest.mock('@/services/email', () => ({
  createEmailService: jest.fn(() => ({
    sendShiftReport: jest.fn(),
  })),
}));

// ── Mock DTO for middleware return ──────────────────────────────────────────

const MOCK_DTO = {
  executiveSummary: {
    casinoName: 'Test Casino',
    gamingDay: '2026-04-15',
    shiftBoundary: 'day' as const,
    windowStart: '2026-04-15T06:00:00Z',
    windowEnd: '2026-04-15T14:00:00Z',
    tablesCount: 2,
    pitsCount: 1,
    fillsTotalCents: 18000_00,
    creditsTotalCents: 8000_00,
    winLossInventoryTotalCents: 12000_00,
    winLossEstimatedTotalCents: 11600_00,
    snapshotCoverageRatio: 1,
    coverageTier: 'FULL',
  },
  financialSummary: null,
  ratingCoverage: null,
  complianceSummary: null,
  anomalies: null,
  baselineQuality: null,
  loyaltyLiability: null,
  footer: {
    generatedAt: '2026-04-15T14:00:00Z',
    referenceId: 'SR-2026-04-15-day',
    gamingDay: '2026-04-15',
    shiftBoundary: 'day' as const,
    casinoName: 'Test Casino',
    windowStart: '2026-04-15T06:00:00Z',
    windowEnd: '2026-04-15T14:00:00Z',
  },
  availability: {
    executiveSummary: true,
    financialSummary: false,
    ratingCoverage: false,
    complianceSummary: false,
    anomalies: false,
    baselineQuality: false,
    loyaltyLiability: false,
  },
  errors: [],
};

// ── Middleware mock with mode switching ─────────────────────────────────────

const mockWithServerAction = jest.fn();

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: (...args: unknown[]) => mockWithServerAction(...args),
}));

// Constants for valid test data
const VALID_IDEMPOTENCY_KEY = '123e4567-e89b-12d3-a456-426614174000';

// Import routes after all mocks
import { POST as postPdf } from '@/app/api/v1/reports/shift-summary/pdf/route';
import { POST as postSend } from '@/app/api/v1/reports/shift-summary/send/route';

// ── Tests: PDF Route ───────────────────────────────────────────────────────

describe('POST /api/v1/reports/shift-summary/pdf', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: withServerAction returns success with DTO
    mockWithServerAction.mockResolvedValue({
      ok: true,
      code: 'OK',
      data: { dto: MOCK_DTO, casinoName: 'Test Casino' },
      requestId: 'test-req-id',
      durationMs: 0,
      timestamp: new Date().toISOString(),
    });
  });

  it('exports POST handler', () => {
    expect(typeof postPdf).toBe('function');
  });

  it('returns application/pdf with Content-Disposition', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/reports/shift-summary/pdf',
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        },
        body: {
          gaming_day: '2026-04-15',
          shift_boundary: 'day',
        },
      },
    );

    const response = await postPdf(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="shift-report-.+\.pdf"$/,
    );
  });

  it('returns PDF binary body', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/reports/shift-summary/pdf',
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        },
        body: {
          gaming_day: '2026-04-15',
          shift_boundary: 'day',
        },
      },
    );

    const response = await postPdf(request);
    const body = await response.arrayBuffer();

    expect(response.status).toBe(200);
    expect(body.byteLength).toBeGreaterThan(0);
  });

  it('rejects missing Idempotency-Key with 400', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/reports/shift-summary/pdf',
      {
        headers: { 'Content-Type': 'application/json' },
        body: {
          gaming_day: '2026-04-15',
          shift_boundary: 'day',
        },
      },
    );

    const response = await postPdf(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects invalid shift_boundary with 400', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/reports/shift-summary/pdf',
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        },
        body: {
          gaming_day: '2026-04-15',
          shift_boundary: 'invalid_shift',
        },
      },
    );

    const response = await postPdf(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects missing gaming_day with 400', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/reports/shift-summary/pdf',
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        },
        body: {
          shift_boundary: 'day',
        },
      },
    );

    const response = await postPdf(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

// ── Tests: Send Route ──────────────────────────────────────────────────────

describe('POST /api/v1/reports/shift-summary/send', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: withServerAction returns success with EmailSendResult
    mockWithServerAction.mockResolvedValue({
      ok: true,
      code: 'OK',
      data: { success: true, attemptIds: ['attempt-1'], failures: [] },
      requestId: 'test-req-id',
      durationMs: 0,
      timestamp: new Date().toISOString(),
    });
  });

  it('exports POST handler', () => {
    expect(typeof postSend).toBe('function');
  });

  it('returns ServiceHttpResult<EmailSendResult> on success', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/reports/shift-summary/send',
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        },
        body: {
          gaming_day: '2026-04-15',
          shift_boundary: 'day',
          recipients: ['boss@casino.com'],
          idempotency_key: VALID_IDEMPOTENCY_KEY,
        },
      },
    );

    const response = await postSend(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.success).toBe(true);
    expect(body.data.attemptIds).toEqual(['attempt-1']);
  });

  it('rejects missing Idempotency-Key header with 400', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/reports/shift-summary/send',
      {
        headers: { 'Content-Type': 'application/json' },
        body: {
          gaming_day: '2026-04-15',
          shift_boundary: 'day',
          recipients: ['boss@casino.com'],
          idempotency_key: VALID_IDEMPOTENCY_KEY,
        },
      },
    );

    const response = await postSend(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects empty recipients with 400', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/reports/shift-summary/send',
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        },
        body: {
          gaming_day: '2026-04-15',
          shift_boundary: 'day',
          recipients: [],
          idempotency_key: VALID_IDEMPOTENCY_KEY,
        },
      },
    );

    const response = await postSend(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects invalid email addresses with 400', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/reports/shift-summary/send',
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        },
        body: {
          gaming_day: '2026-04-15',
          shift_boundary: 'day',
          recipients: ['not-an-email'],
          idempotency_key: VALID_IDEMPOTENCY_KEY,
        },
      },
    );

    const response = await postSend(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects missing idempotency_key in body with 400', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/reports/shift-summary/send',
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        },
        body: {
          gaming_day: '2026-04-15',
          shift_boundary: 'day',
          recipients: ['boss@casino.com'],
        },
      },
    );

    const response = await postSend(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
