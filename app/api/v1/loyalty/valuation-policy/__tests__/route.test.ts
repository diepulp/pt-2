/** @jest-environment node */

/**
 * Valuation Policy Route Handler Tests (PRD-053 WS5f)
 *
 * Tests GET and POST /api/v1/loyalty/valuation-policy.
 * Mocks withServerAction to test route-level logic (role gate, validation, response).
 *
 * @see EXEC-054 WS5f — Admin Surface Tests
 */

import { NextRequest } from 'next/server';

// === Mock Setup ===

const mockGetActiveValuationPolicy = jest.fn();
const mockUpdateValuationPolicy = jest.fn();

jest.mock('@/services/loyalty', () => ({
  createLoyaltyService: () => ({
    getActiveValuationPolicy: mockGetActiveValuationPolicy,
    updateValuationPolicy: mockUpdateValuationPolicy,
  }),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

// Mock withServerAction to execute handler directly with controllable rlsContext
let mockRlsContext: {
  casinoId: string;
  staffRole: string;
  actorId: string;
  companyId: string;
} | null = null;

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest
    .fn()
    .mockImplementation(
      async (
        _supabase: unknown,
        handler: (ctx: {
          supabase: unknown;
          correlationId: string;
          rlsContext: typeof mockRlsContext;
        }) => Promise<unknown>,
      ) => {
        return handler({
          supabase: {},
          correlationId: 'test-correlation-id',
          rlsContext: mockRlsContext,
        });
      },
    ),
}));

import { GET, POST } from '../route';

// === Fixtures ===

const CASINO_ID = '33333333-3333-3333-3333-333333333333';
const STAFF_ID = '55555555-5555-5555-5555-555555555555';

const POLICY_DTO = {
  id: '66666666-6666-6666-6666-666666666666',
  casinoId: CASINO_ID,
  centsPerPoint: 2,
  effectiveDate: '2026-03-20',
  versionIdentifier: 'admin-2026-03-20',
  isActive: true,
  createdByStaffId: STAFF_ID,
  createdAt: '2026-03-20T12:00:00Z',
};

function makeRequest(
  method: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
): NextRequest {
  const url = 'http://localhost:3000/api/v1/loyalty/valuation-policy';
  const reqHeaders = new Headers({
    'content-type': 'application/json',
    ...headers,
  });
  return new NextRequest(url, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// === GET Tests ===

describe('GET /api/v1/loyalty/valuation-policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRlsContext = {
      casinoId: CASINO_ID,
      staffRole: 'admin',
      actorId: STAFF_ID,
      companyId: 'company-1',
    };
  });

  it('returns 200 with ValuationPolicyDTO for authenticated caller', async () => {
    mockGetActiveValuationPolicy.mockResolvedValue(POLICY_DTO);

    const response = await GET(makeRequest('GET'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual(POLICY_DTO);
  });

  it('returns 200 with null when no active policy exists', async () => {
    mockGetActiveValuationPolicy.mockResolvedValue(null);

    const response = await GET(makeRequest('GET'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toBeNull();
  });

  it('returns 200 for pit_boss (any role can read)', async () => {
    mockRlsContext = {
      casinoId: CASINO_ID,
      staffRole: 'pit_boss',
      actorId: STAFF_ID,
      companyId: 'company-1',
    };
    mockGetActiveValuationPolicy.mockResolvedValue(POLICY_DTO);

    const response = await GET(makeRequest('GET'));

    expect(response.status).toBe(200);
  });
});

// === POST Tests ===

describe('POST /api/v1/loyalty/valuation-policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRlsContext = {
      casinoId: CASINO_ID,
      staffRole: 'admin',
      actorId: STAFF_ID,
      companyId: 'company-1',
    };
  });

  const validBody = {
    cents_per_point: 5,
    effective_date: '2026-04-01',
    version_identifier: 'admin-2026-04-01',
  };

  it('returns 200 with ValuationPolicyDTO for admin caller', async () => {
    const updatedPolicy = { ...POLICY_DTO, centsPerPoint: 5 };
    mockUpdateValuationPolicy.mockResolvedValue(updatedPolicy);

    const response = await POST(
      makeRequest('POST', validBody, {
        'Idempotency-Key': 'idem-key-1',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.centsPerPoint).toBe(5);
  });

  it('returns 403 for pit_boss', async () => {
    mockRlsContext = {
      casinoId: CASINO_ID,
      staffRole: 'pit_boss',
      actorId: STAFF_ID,
      companyId: 'company-1',
    };

    const response = await POST(
      makeRequest('POST', validBody, {
        'Idempotency-Key': 'idem-key-2',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('FORBIDDEN');
  });

  it('returns 403 for dealer', async () => {
    mockRlsContext = {
      casinoId: CASINO_ID,
      staffRole: 'dealer',
      actorId: STAFF_ID,
      companyId: 'company-1',
    };

    const response = await POST(
      makeRequest('POST', validBody, {
        'Idempotency-Key': 'idem-key-3',
      }),
    );

    expect(response.status).toBe(403);
  });

  it('returns 400 for invalid body (missing cents_per_point)', async () => {
    const response = await POST(
      makeRequest(
        'POST',
        {
          effective_date: '2026-04-01',
          version_identifier: 'admin-2026-04-01',
        },
        { 'Idempotency-Key': 'idem-key-4' },
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for negative cents_per_point', async () => {
    const response = await POST(
      makeRequest(
        'POST',
        { ...validBody, cents_per_point: -1 },
        { 'Idempotency-Key': 'idem-key-5' },
      ),
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 when Idempotency-Key header is missing', async () => {
    const response = await POST(makeRequest('POST', validBody));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
  });
});
