/**
 * @jest-environment node
 *
 * Financial Surface Gate — API Envelope Contract Tests
 *
 * PRD-078 Phase 1.4 WS3: Verifies that the financial telemetry surface maintains
 * authority-declaration contracts established in Phases 1.1–1.3.
 *
 * Tests are structural (mocked supabase, no real DB). They enforce:
 *   a. ServiceHttpResult envelope shape on the rating-slip modal-data route
 *   b. FinancialValue envelope shape: { value, type, source, completeness: { status } }
 *   c. DEF-NEVER guard: hold_percent fields stay bare number (RatioAnomalyAlertDTO)
 *
 * ADR-044 S4: node environment. DEC-2: jest-node-mocked-supabase tier.
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';
import type { FinancialValue } from '@/types/financial';
import type {
  FinancialAnomalyAlertDTO,
  RatioAnomalyAlertDTO,
} from '@/services/shift-intelligence/dtos';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
    }),
  ),
}));

jest.mock('@/services/rating-slip-modal/rpc', () => ({
  getModalDataViaRPC: jest.fn().mockResolvedValue({
    slip: {
      id: 'slip-abc',
      visitId: 'visit-1',
      casinoId: 'casino-1',
      tableId: 'table-1',
      tableLabel: 'T1',
      tableType: 'blackjack',
      seatNumber: null,
      averageBet: 0,
      startTime: '2026-01-01T10:00:00Z',
      endTime: null,
      status: 'open',
      gamingDay: '2026-01-01',
      durationSeconds: 1800,
    },
    player: null,
    loyalty: null,
    financial: { totalCashIn: 5000, totalCashOut: 3000, netPosition: 2000 },
    tables: [],
  }),
}));

jest.mock('@/services/rating-slip', () => ({
  createRatingSlipService: jest.fn(() => ({
    getById: jest.fn().mockResolvedValue({
      id: 'slip-abc',
      visit_id: 'visit-1',
      table_id: 'table-1',
      status: 'open',
      start_time: '2026-01-01T10:00:00Z',
    }),
    getDuration: jest.fn().mockResolvedValue(1800),
    getActiveForTable: jest.fn().mockResolvedValue([]),
    getOccupiedSeatsByTables: jest.fn().mockResolvedValue(new Map()),
  })),
}));

jest.mock('@/services/visit', () => ({
  createVisitService: jest.fn(() => ({
    getById: jest.fn().mockResolvedValue({ id: 'visit-1', player_id: null }),
  })),
}));

jest.mock('@/services/player', () => ({
  createPlayerService: jest.fn(() => ({})),
}));

jest.mock('@/services/loyalty', () => ({
  createLoyaltyService: jest.fn(() => ({})),
}));

jest.mock('@/services/player-financial', () => ({
  createPlayerFinancialService: jest.fn(() => ({
    getVisitSummary: jest
      .fn()
      .mockResolvedValue({ total_in: 5000, total_out: 3000, net_amount: 2000 }),
  })),
}));

jest.mock('@/services/table-context', () => ({
  createTableContextService: jest.fn(() => ({
    getTable: jest
      .fn()
      .mockResolvedValue({ label: 'T1', type: 'blackjack', status: 'active' }),
    getActiveTables: jest.fn().mockResolvedValue([]),
  })),
}));

// ── Section A: ServiceHttpResult envelope shape ───────────────────────────────

describe('Financial Surface — ServiceHttpResult Envelope (PRD-078 Phase 1.4 WS3)', () => {
  const SLIP_ID = '123e4567-e89b-12d3-a456-426614174000';

  let GET: (req: Request, params: unknown) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/v1/rating-slips/[id]/modal-data/route');
    GET = mod.GET;
  });

  it('modal-data GET returns 200', async () => {
    const req = createMockRequest(
      'GET',
      `/api/v1/rating-slips/${SLIP_ID}/modal-data`,
    );
    const params = createMockRouteParams({ id: SLIP_ID });
    const res = await GET(req, params);
    expect(res.status).toBe(200);
  });

  it('modal-data response has ServiceHttpResult envelope: ok, code, data, requestId', async () => {
    const req = createMockRequest(
      'GET',
      `/api/v1/rating-slips/${SLIP_ID}/modal-data`,
    );
    const params = createMockRouteParams({ id: SLIP_ID });
    const res = await GET(req, params);
    const body = await res.json();

    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.any(Object),
      requestId: expect.any(String),
    });
  });

  it('modal-data envelope data contains slip and financial sections', async () => {
    const req = createMockRequest(
      'GET',
      `/api/v1/rating-slips/${SLIP_ID}/modal-data`,
    );
    const params = createMockRouteParams({ id: SLIP_ID });
    const res = await GET(req, params);
    const body = await res.json();

    expect(body.data).toHaveProperty('slip');
    expect(body.data).toHaveProperty('financial');
    expect(body.data.financial).toMatchObject({
      totalCashIn: expect.any(Number),
      totalCashOut: expect.any(Number),
      netPosition: expect.any(Number),
    });
  });
});

// ── Section B: FinancialValue envelope shape ──────────────────────────────────

describe('Financial Surface — FinancialValue Envelope Shape (PRD-078 Phase 1.4 WS3)', () => {
  const VALID_FINANCIAL_VALUE: FinancialValue = {
    value: 125000,
    type: 'estimated',
    source: 'rating_slip.theo',
    completeness: { status: 'complete' },
  };

  const PARTIAL_FINANCIAL_VALUE: FinancialValue = {
    value: 80000,
    type: 'observed',
    source: 'pit_cash.observation',
    completeness: { status: 'partial', coverage: 0.75 },
  };

  const UNKNOWN_FINANCIAL_VALUE: FinancialValue = {
    value: 0,
    type: 'estimated',
    source: 'rating_slip.theo',
    completeness: { status: 'unknown' },
  };

  it('FinancialValue has required authority fields: value, type, source, completeness.status', () => {
    expect(VALID_FINANCIAL_VALUE).toMatchObject({
      value: expect.any(Number),
      type: expect.stringMatching(/^(actual|estimated|observed|compliance)$/),
      source: expect.any(String),
      completeness: {
        status: expect.stringMatching(/^(complete|partial|unknown)$/),
      },
    });
  });

  it('FinancialValue partial completeness includes coverage ratio in [0, 1]', () => {
    expect(PARTIAL_FINANCIAL_VALUE.completeness.status).toBe('partial');
    expect(
      PARTIAL_FINANCIAL_VALUE.completeness.coverage,
    ).toBeGreaterThanOrEqual(0);
    expect(PARTIAL_FINANCIAL_VALUE.completeness.coverage).toBeLessThanOrEqual(
      1,
    );
  });

  it('FinancialValue unknown completeness is valid without coverage field', () => {
    expect(UNKNOWN_FINANCIAL_VALUE.completeness.status).toBe('unknown');
    expect(UNKNOWN_FINANCIAL_VALUE.completeness.coverage).toBeUndefined();
  });

  it('FinancialAnomalyAlertDTO observedValue field accepts FinancialValue or null', () => {
    const dto: FinancialAnomalyAlertDTO = {
      tableId: 'table-1',
      tableLabel: 'T1',
      metricType: 'win_loss_estimated_cents',
      readinessState: 'ready',
      observedValue: VALID_FINANCIAL_VALUE,
      baselineMedian: VALID_FINANCIAL_VALUE,
      baselineMad: {
        ...VALID_FINANCIAL_VALUE,
        value: 5000,
        type: 'observed',
        source: 'baseline.mad',
      },
      deviationScore: 2.4,
      isAnomaly: true,
      severity: 'high',
      direction: 'above',
      thresholdValue: { ...VALID_FINANCIAL_VALUE, value: 200000 },
      baselineGamingDay: '2026-01-01',
      baselineSampleCount: 30,
      message: 'Above threshold',
      sessionCount: 5,
      peakDeviation: 2.4,
      recommendedAction: 'investigate',
    };

    expect(dto.observedValue).toMatchObject({
      value: expect.any(Number),
      type: expect.any(String),
      source: expect.any(String),
      completeness: { status: expect.any(String) },
    });
  });

  it('FinancialAnomalyAlertDTO observedValue can be null (incomplete data)', () => {
    const dto: Partial<FinancialAnomalyAlertDTO> = {
      observedValue: null,
    };
    expect(dto.observedValue).toBeNull();
  });
});

// ── Section C: DEF-NEVER guard — hold_percent stays bare number ───────────────

describe('Financial Surface — DEF-NEVER: hold_percent fields are bare number (PRD-078 Phase 1.4 WS3)', () => {
  const RATIO_DTO: RatioAnomalyAlertDTO = {
    tableId: 'table-1',
    tableLabel: 'T1',
    metricType: 'hold_percent',
    readinessState: 'ready',
    observedValue: 0.21,
    baselineMedian: 0.19,
    baselineMad: 0.02,
    deviationScore: 1.1,
    isAnomaly: false,
    severity: null,
    direction: null,
    thresholdValue: 0.25,
    baselineGamingDay: '2026-01-01',
    baselineSampleCount: 30,
    message: 'Within normal range',
    sessionCount: null,
    peakDeviation: null,
    recommendedAction: null,
  };

  it('RatioAnomalyAlertDTO metricType is always hold_percent', () => {
    expect(RATIO_DTO.metricType).toBe('hold_percent');
  });

  it('DEF-NEVER: RatioAnomalyAlertDTO.observedValue is a bare number, not a FinancialValue object', () => {
    expect(typeof RATIO_DTO.observedValue).toBe('number');
    expect(RATIO_DTO.observedValue).not.toBeInstanceOf(Object);
  });

  it('DEF-NEVER: RatioAnomalyAlertDTO.baselineMedian is a bare number', () => {
    expect(typeof RATIO_DTO.baselineMedian).toBe('number');
  });

  it('DEF-NEVER: RatioAnomalyAlertDTO.thresholdValue is a bare number', () => {
    expect(typeof RATIO_DTO.thresholdValue).toBe('number');
  });

  it('DEF-NEVER: hold_percent observedValue has no .type property (not a FinancialValue)', () => {
    const value = RATIO_DTO.observedValue;
    if (value !== null) {
      expect(
        (value as unknown as Record<string, unknown>).type,
      ).toBeUndefined();
    }
  });
});
