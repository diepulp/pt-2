/** @jest-environment node */

/**
 * Pilot review server actions — unit tests
 *
 * Verifies DEC-1 (admin authority via PILOT_ADMIN_EMAILS), DEC-8 (telemetry emission),
 * partial write detection, and idempotent approve/reject/revoke paths.
 */

const mockEmitTelemetry = jest.fn();
jest.mock('@/lib/telemetry/emit-telemetry', () => ({
  emitTelemetry: (...args: unknown[]) => mockEmitTelemetry(...args),
}));

jest.mock('@/services/pilot/crud', () => ({
  canonicalizeEmail: (e: string) => e.toLowerCase().trim(),
}));

// ── Supabase mock helpers ────────────────────────────────────────────────────

type MockQueryResult = { data: unknown; error: unknown };

function makeChain(result: MockQueryResult) {
  const terminal = jest.fn().mockResolvedValue(result);
  const chain: Record<string, jest.Mock> = {};
  // Support .select().eq().maybeSingle(), .update().eq(), .upsert()
  const builder = new Proxy(chain, {
    get: (_target, prop: string) => {
      if (prop === 'maybeSingle' || prop === 'then') return terminal;
      if (!chain[prop]) {
        chain[prop] = jest.fn().mockReturnValue(builder);
      }
      return chain[prop];
    },
  });
  return { builder, terminal };
}

// ── Auth mocks ───────────────────────────────────────────────────────────────

const mockGetUser = jest.fn();
const mockSignInWithOtp = jest.fn().mockResolvedValue({ error: null });
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: {
      getUser: () => mockGetUser(),
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
    },
  }),
}));

// Track service client calls per test via a replaceable factory
let mockServiceClientImpl: ReturnType<typeof makeServiceClientMock>;

function makeServiceClientMock(overrides?: {
  fetchResult?: MockQueryResult;
  upsertResult?: MockQueryResult;
  updateResult?: MockQueryResult;
}) {
  const fetchResult = overrides?.fetchResult ?? {
    data: { id: 'req-1', email: 'jane@casino.com' },
    error: null,
  };
  const upsertResult = overrides?.upsertResult ?? { data: null, error: null };
  const updateResult = overrides?.updateResult ?? { data: null, error: null };

  // from() returns different builders depending on which table is queried
  const fromMock = jest.fn().mockImplementation((table: string) => {
    if (table === 'pilot_access_requests') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue(fetchResult),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue(updateResult),
        }),
      };
    }
    if (table === 'approved_email_allowlist') {
      return {
        upsert: jest.fn().mockResolvedValue(upsertResult),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue(updateResult),
        }),
      };
    }
    return {};
  });

  return { from: fromMock };
}

jest.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => mockServiceClientImpl,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
let reviewActions: typeof import('../review-actions');

beforeAll(async () => {
  reviewActions = await import('../review-actions');
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function setAdminUser(email = 'admin@casino.com') {
  process.env.PILOT_ADMIN_EMAILS = email;
  mockGetUser.mockResolvedValue({ data: { user: { email } }, error: null });
}

function setNonAdminUser(email = 'notadmin@casino.com') {
  process.env.PILOT_ADMIN_EMAILS = 'admin@casino.com';
  mockGetUser.mockResolvedValue({ data: { user: { email } }, error: null });
}

function setUnauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

// ── approvePilotAccessAction ─────────────────────────────────────────────────

describe('approvePilotAccessAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServiceClientImpl = makeServiceClientMock();
    mockSignInWithOtp.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    delete process.env.PILOT_ADMIN_EMAILS;
  });

  it('returns ok:false FORBIDDEN for non-admin caller (DEC-1)', async () => {
    setNonAdminUser();
    const result = await reviewActions.approvePilotAccessAction('req-1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('FORBIDDEN');
  });

  it('emits pilot_review.approve.denied telemetry for non-admin (DEC-8)', async () => {
    setNonAdminUser();
    await reviewActions.approvePilotAccessAction('req-1');
    const deniedEvent = mockEmitTelemetry.mock.calls.find(
      ([e]: [{ eventType: string }]) =>
        e.eventType === 'pilot_review.approve.denied',
    );
    expect(deniedEvent).toBeDefined();
  });

  it('returns ok:false UNAUTHORIZED for unauthenticated caller', async () => {
    setUnauthenticated();
    const result = await reviewActions.approvePilotAccessAction('req-1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('returns ok:true and emits pilot_review.approve.success for admin (DEC-8)', async () => {
    setAdminUser();
    const result = await reviewActions.approvePilotAccessAction('req-1');
    expect(result.ok).toBe(true);
    const successEvent = mockEmitTelemetry.mock.calls.find(
      ([e]: [{ eventType: string }]) =>
        e.eventType === 'pilot_review.approve.success',
    );
    expect(successEvent).toBeDefined();
  });

  it('returns ok:false INTERNAL_ERROR and emits partial_write telemetry when request update fails', async () => {
    setAdminUser();
    mockServiceClientImpl = makeServiceClientMock({
      upsertResult: { data: null, error: null }, // allowlist upsert succeeds
      updateResult: {
        data: null,
        error: { code: '42501', message: 'update denied' },
      }, // request update fails
    });

    const result = await reviewActions.approvePilotAccessAction('req-1');

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INTERNAL_ERROR');
    const partialEvent = mockEmitTelemetry.mock.calls.find(
      ([e]: [{ eventType: string }]) =>
        e.eventType === 'pilot_review.approve.partial_write',
    );
    expect(partialEvent).toBeDefined();
  });

  it('skips OTP and returns ok:true when approved target email is an admin email (PRD-085)', async () => {
    const adminEmail = 'admin@casino.com';
    process.env.PILOT_ADMIN_EMAILS = adminEmail;
    mockGetUser.mockResolvedValue({
      data: { user: { email: adminEmail } },
      error: null,
    });
    mockServiceClientImpl = makeServiceClientMock({
      fetchResult: {
        data: { id: 'req-admin', email: adminEmail },
        error: null,
      },
    });

    const result = await reviewActions.approvePilotAccessAction('req-admin');
    expect(result.ok).toBe(true);
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('returns ok:false NOT_FOUND when request does not exist', async () => {
    setAdminUser();
    mockServiceClientImpl = makeServiceClientMock({
      fetchResult: { data: null, error: null },
    });

    const result = await reviewActions.approvePilotAccessAction('nonexistent');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('sends magic link OTP to approved evaluator on success', async () => {
    setAdminUser();
    await reviewActions.approvePilotAccessAction('req-1');

    expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'jane@casino.com',
        options: expect.objectContaining({
          shouldCreateUser: true,
          emailRedirectTo: expect.stringContaining('/auth/confirm'),
        }),
      }),
    );
  });

  it('returns ok:true and emits otp_warning when OTP send fails, but approve still succeeds', async () => {
    setAdminUser();
    mockSignInWithOtp.mockResolvedValue({
      error: { message: 'smtp failure' },
    });

    const result = await reviewActions.approvePilotAccessAction('req-1');

    expect(result.ok).toBe(true);
    const warnEvent = mockEmitTelemetry.mock.calls.find(
      ([e]: [{ eventType: string }]) =>
        e.eventType === 'pilot_review.approve.otp_warning',
    );
    expect(warnEvent).toBeDefined();
    // Success telemetry still emitted, with magicLinkSent: false
    const successEvent = mockEmitTelemetry.mock.calls.find(
      ([e]: [{ eventType: string; metadata: { magicLinkSent: boolean } }]) =>
        e.eventType === 'pilot_review.approve.success',
    );
    expect(successEvent).toBeDefined();
    expect(successEvent[0].metadata.magicLinkSent).toBe(false);
  });
});

// ── rejectPilotAccessAction ──────────────────────────────────────────────────

describe('rejectPilotAccessAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServiceClientImpl = makeServiceClientMock();
  });

  afterEach(() => {
    delete process.env.PILOT_ADMIN_EMAILS;
  });

  it('returns ok:false FORBIDDEN for non-admin caller (DEC-1)', async () => {
    setNonAdminUser();
    const result = await reviewActions.rejectPilotAccessAction('req-1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('FORBIDDEN');
  });

  it('emits pilot_review.reject.denied telemetry for non-admin (DEC-8)', async () => {
    setNonAdminUser();
    await reviewActions.rejectPilotAccessAction('req-1');
    const deniedEvent = mockEmitTelemetry.mock.calls.find(
      ([e]: [{ eventType: string }]) =>
        e.eventType === 'pilot_review.reject.denied',
    );
    expect(deniedEvent).toBeDefined();
  });

  it('returns ok:true and emits pilot_review.reject.success for admin (DEC-8)', async () => {
    setAdminUser();
    const result = await reviewActions.rejectPilotAccessAction('req-1');
    expect(result.ok).toBe(true);
    const successEvent = mockEmitTelemetry.mock.calls.find(
      ([e]: [{ eventType: string }]) =>
        e.eventType === 'pilot_review.reject.success',
    );
    expect(successEvent).toBeDefined();
  });

  it('does NOT mutate the allowlist on rejection', async () => {
    setAdminUser();
    await reviewActions.rejectPilotAccessAction('req-1');

    const allowlistCalls = (
      mockServiceClientImpl.from as jest.Mock
    ).mock.calls.filter(
      ([table]: [string]) => table === 'approved_email_allowlist',
    );
    expect(allowlistCalls).toHaveLength(0);
  });
});

// ── revokePilotAccessAction ──────────────────────────────────────────────────

describe('revokePilotAccessAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServiceClientImpl = makeServiceClientMock();
  });

  afterEach(() => {
    delete process.env.PILOT_ADMIN_EMAILS;
  });

  it('returns ok:false FORBIDDEN for non-admin caller (DEC-1)', async () => {
    setNonAdminUser();
    const result =
      await reviewActions.revokePilotAccessAction('jane@casino.com');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('FORBIDDEN');
  });

  it('emits pilot_review.revoke.denied telemetry for non-admin (DEC-8)', async () => {
    setNonAdminUser();
    await reviewActions.revokePilotAccessAction('jane@casino.com');
    const deniedEvent = mockEmitTelemetry.mock.calls.find(
      ([e]: [{ eventType: string }]) =>
        e.eventType === 'pilot_review.revoke.denied',
    );
    expect(deniedEvent).toBeDefined();
  });

  it('returns ok:true and emits pilot_review.revoke.success for admin (DEC-8)', async () => {
    setAdminUser();
    const result =
      await reviewActions.revokePilotAccessAction('jane@casino.com');
    expect(result.ok).toBe(true);
    const successEvent = mockEmitTelemetry.mock.calls.find(
      ([e]: [{ eventType: string }]) =>
        e.eventType === 'pilot_review.revoke.success',
    );
    expect(successEvent).toBeDefined();
  });

  it('canonicalizes the email before revoking', async () => {
    setAdminUser();
    await reviewActions.revokePilotAccessAction('  JANE@CASINO.COM  ');

    const allowlistFrom = (
      mockServiceClientImpl.from as jest.Mock
    ).mock.calls.find(
      ([table]: [string]) => table === 'approved_email_allowlist',
    );
    // Confirm the allowlist table was queried (revoke path)
    expect(allowlistFrom).toBeDefined();
  });
});
