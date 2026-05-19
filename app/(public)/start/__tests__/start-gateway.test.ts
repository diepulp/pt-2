/** @jest-environment node */

jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string): never => {
    throw new Error(`redirect:${url}`);
  }),
}));

jest.mock('@/lib/supabase/server');
jest.mock('@/lib/supabase/service');
jest.mock('@/services/pilot/crud');

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { checkAllowlistGate, canonicalizeEmail } from '@/services/pilot/crud';

// Import after mocks are hoisted
// eslint-disable-next-line import/first
import StartGatewayPage from '../page';

const mockCreateClient = jest.mocked(createClient);
const mockCreateServiceClient = jest.mocked(createServiceClient);
const mockCheckAllowlistGate = jest.mocked(checkAllowlistGate);
const mockCanonicalizeEmail = jest.mocked(canonicalizeEmail);

// Helpers

function makeStaffQueryChain(result: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eqUserId = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq: eqUserId });
  return { select };
}

function makeIdempotencyChain(result: { data: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eqUserId = jest.fn().mockReturnValue({ maybeSingle });
  const eqCasinoId = jest.fn().mockReturnValue({ eq: eqUserId });
  const select = jest.fn().mockReturnValue({ eq: eqCasinoId });
  return { select };
}

function makeUserSupabase(
  user: { id: string; email: string } | null,
  staffResult: { data: unknown; error: unknown },
) {
  const staffChain = makeStaffQueryChain(staffResult);
  const from = jest.fn().mockReturnValue(staffChain);
  const getUser = jest.fn().mockResolvedValue({ data: { user } });
  return { auth: { getUser }, from };
}

function makeServiceClientMock(
  idempotencyResult: { data: unknown },
  insertResult: { error: unknown },
) {
  const idempotencyChain = makeIdempotencyChain(idempotencyResult);
  const insert = jest.fn().mockResolvedValue(insertResult);
  const from = jest
    .fn()
    .mockReturnValueOnce(idempotencyChain)
    .mockReturnValue({ insert });
  return { from };
}

async function expectRedirectTo(url: string) {
  try {
    await StartGatewayPage();
    throw new Error('Expected redirect, component returned normally');
  } catch (e) {
    const msg = (e as Error).message;
    if (!msg.startsWith('redirect:')) throw e;
    expect(msg).toBe(`redirect:${url}`);
  }
}

async function getRedirectUrl(): Promise<string> {
  try {
    await StartGatewayPage();
    throw new Error('Expected redirect, component returned normally');
  } catch (e) {
    const msg = (e as Error).message;
    if (!msg.startsWith('redirect:')) throw e;
    return msg.slice('redirect:'.length);
  }
}

const DEMO_USER = { id: 'user-abc-123', email: 'pilot@example.com' };

describe('StartGatewayPage routing table', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PILOT_ADMIN_EMAILS;
    mockCanonicalizeEmail.mockImplementation((e: string) =>
      e.toLowerCase().trim(),
    );
    mockCheckAllowlistGate.mockResolvedValue('approved');
  });

  it('unauthenticated → /signin', async () => {
    const supabase = makeUserSupabase(null, { data: null, error: null });
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue({ from: jest.fn() } as never);
    await expectRedirectTo('/signin');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('not approved → /request-access', async () => {
    const supabase = makeUserSupabase(DEMO_USER, { data: null, error: null });
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue({ from: jest.fn() } as never);
    mockCheckAllowlistGate.mockResolvedValue('not_approved');
    await expectRedirectTo('/request-access');
  });

  it('admin email → /pilot-review', async () => {
    process.env.PILOT_ADMIN_EMAILS = 'admin@example.com';
    const adminUser = { id: 'admin-1', email: 'admin@example.com' };
    const supabase = makeUserSupabase(adminUser, { data: null, error: null });
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue({ from: jest.fn() } as never);
    await expectRedirectTo('/pilot-review');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('staff query error → /signin?error=service_unavailable', async () => {
    const supabase = makeUserSupabase(DEMO_USER, {
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue({ from: jest.fn() } as never);
    await expectRedirectTo('/signin?error=service_unavailable');
  });

  it('active staff row → /pit (no INSERT attempted)', async () => {
    const supabase = makeUserSupabase(DEMO_USER, {
      data: { id: 'staff-1', status: 'active', casino_id: 'ca-other' },
      error: null,
    });
    const serviceFrom = jest.fn();
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue({ from: serviceFrom } as never);
    await expectRedirectTo('/pit');
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it('no staff, idempotency row found → /pit (no INSERT)', async () => {
    const supabase = makeUserSupabase(DEMO_USER, { data: null, error: null });
    const serviceClient = makeServiceClientMock(
      { data: { id: 'existing-demo' } },
      { error: null },
    );
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue(serviceClient as never);
    await expectRedirectTo('/pit');
    // from was called once (idempotency) but not twice (INSERT)
    expect(serviceClient.from).toHaveBeenCalledTimes(1);
  });

  it('no staff, INSERT succeeds → /pit', async () => {
    const supabase = makeUserSupabase(DEMO_USER, { data: null, error: null });
    const serviceClient = makeServiceClientMock(
      { data: null },
      { error: null },
    );
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue(serviceClient as never);
    await expectRedirectTo('/pit');
    expect(serviceClient.from).toHaveBeenCalledTimes(2);
  });

  it('no staff, INSERT fails → /signin?error=service_unavailable', async () => {
    const supabase = makeUserSupabase(DEMO_USER, { data: null, error: null });
    const serviceClient = makeServiceClientMock(
      { data: null },
      { error: { code: '23503', message: 'FK violation' } },
    );
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue(serviceClient as never);
    await expectRedirectTo('/signin?error=service_unavailable');
  });
});

describe('StartGatewayPage admin path (PRD-085)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PILOT_ADMIN_EMAILS;
    mockCanonicalizeEmail.mockImplementation((e: string) =>
      e.toLowerCase().trim(),
    );
  });

  it('admin path: createServiceClient is never called', async () => {
    process.env.PILOT_ADMIN_EMAILS = 'admin@example.com';
    const adminUser = { id: 'admin-1', email: 'admin@example.com' };
    const supabase = makeUserSupabase(adminUser, { data: null, error: null });
    mockCreateClient.mockResolvedValue(supabase as never);
    await StartGatewayPage().catch(() => {});
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });
});

describe('StartGatewayPage security invariants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PILOT_ADMIN_EMAILS;
    mockCanonicalizeEmail.mockImplementation((e: string) =>
      e.toLowerCase().trim(),
    );
    mockCheckAllowlistGate.mockResolvedValue('approved');
  });

  it('never queries casino_settings table', async () => {
    const supabase = makeUserSupabase(DEMO_USER, {
      data: { id: 'staff-1', status: 'active', casino_id: 'ca-1' },
      error: null,
    });
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue({ from: jest.fn() } as never);
    await StartGatewayPage().catch(() => {});
    const tableCalls = supabase.from.mock.calls.map(([t]: [string]) => t);
    expect(tableCalls).not.toContain('casino_settings');
  });

  it('never redirects to /register or /bootstrap', async () => {
    const supabase = makeUserSupabase(DEMO_USER, { data: null, error: null });
    const serviceClient = makeServiceClientMock(
      { data: null },
      { error: null },
    );
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue(serviceClient as never);
    const destination = await getRedirectUrl();
    expect(destination).not.toBe('/register');
    expect(destination).not.toBe('/bootstrap');
  });

  it('redirect mock is never called with /register or /bootstrap in any scenario', async () => {
    // Test the no-staff, insert-succeeds path
    const supabase = makeUserSupabase(DEMO_USER, { data: null, error: null });
    const serviceClient = makeServiceClientMock(
      { data: null },
      { error: null },
    );
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue(serviceClient as never);
    await StartGatewayPage().catch(() => {});
    const redirectCalls = (redirect as jest.Mock).mock.calls.map(
      ([url]: [string]) => url,
    );
    expect(redirectCalls).not.toContain('/register');
    expect(redirectCalls).not.toContain('/bootstrap');
  });
});
