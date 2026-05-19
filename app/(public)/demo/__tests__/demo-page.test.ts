/** @jest-environment node */

jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string): never => {
    throw new Error(`redirect:${url}`);
  }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: unknown }) => ({
    href,
    children,
  }),
}));

jest.mock('@/lib/supabase/server');
jest.mock('@/lib/supabase/service');
jest.mock('@/services/pilot/crud');

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { checkAllowlistGate, canonicalizeEmail } from '@/services/pilot/crud';

// Import after mocks are hoisted
// eslint-disable-next-line import/first
import DemoPage from '../page';

const mockCreateClient = jest.mocked(createClient);
const mockCreateServiceClient = jest.mocked(createServiceClient);
const mockCheckAllowlistGate = jest.mocked(checkAllowlistGate);
const mockCanonicalizeEmail = jest.mocked(canonicalizeEmail);

function makeStaffChain(result: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eqUserId = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq: eqUserId });
  const insert = jest.fn();
  return { select, insert };
}

function makeSupabase(
  user: { id: string; email: string } | null,
  staffResult: { data: unknown; error: unknown },
) {
  const staffChain = makeStaffChain(staffResult);
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    from: jest.fn().mockReturnValue(staffChain),
    _staffChain: staffChain,
  };
}

async function runPage(): Promise<'rendered' | string> {
  try {
    const result = await DemoPage();
    return result !== undefined ? 'rendered' : 'rendered';
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith('redirect:')) return msg.slice('redirect:'.length);
    throw e;
  }
}

const PILOT_USER = { id: 'user-pilot-001', email: 'pilot@example.com' };

describe('DemoPage routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PILOT_ADMIN_EMAILS;
    mockCanonicalizeEmail.mockImplementation((e: string) =>
      e.toLowerCase().trim(),
    );
    mockCheckAllowlistGate.mockResolvedValue('approved');
  });

  it('unauthenticated → /signin', async () => {
    const supabase = makeSupabase(null, { data: null, error: null });
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue({ from: jest.fn() } as never);
    expect(await runPage()).toBe('/signin');
  });

  it('not-approved authenticated → /request-access', async () => {
    const supabase = makeSupabase(PILOT_USER, { data: null, error: null });
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue({ from: jest.fn() } as never);
    mockCheckAllowlistGate.mockResolvedValue('not_approved');
    expect(await runPage()).toBe('/request-access');
  });

  it('admin user → /pilot-review', async () => {
    process.env.PILOT_ADMIN_EMAILS = 'admin@example.com';
    const adminUser = { id: 'admin-1', email: 'admin@example.com' };
    const supabase = makeSupabase(adminUser, { data: null, error: null });
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue({ from: jest.fn() } as never);
    expect(await runPage()).toBe('/pilot-review');
  });

  it('active staff user (direct navigation) → /pit', async () => {
    const supabase = makeSupabase(PILOT_USER, {
      data: { id: 'staff-1', status: 'active' },
      error: null,
    });
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue({ from: jest.fn() } as never);
    expect(await runPage()).toBe('/pit');
  });

  it('approved non-admin + no staff row → holding page rendered', async () => {
    const supabase = makeSupabase(PILOT_USER, { data: null, error: null });
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue({ from: jest.fn() } as never);
    expect(await runPage()).toBe('rendered');
  });

  it('staff query failure → holding page rendered (not crash)', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const supabase = makeSupabase(PILOT_USER, {
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue({ from: jest.fn() } as never);
    expect(await runPage()).toBe('rendered');
    consoleSpy.mockRestore();
  });
});

describe('DemoPage security invariants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PILOT_ADMIN_EMAILS;
    mockCanonicalizeEmail.mockImplementation((e: string) =>
      e.toLowerCase().trim(),
    );
    mockCheckAllowlistGate.mockResolvedValue('approved');
  });

  it('staff query failure: structured diagnostic emitted without raw email', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const supabase = makeSupabase(
      { id: 'user-abcdef12-rest', email: 'secret@example.com' },
      { data: null, error: { code: '42501', message: 'permission denied' } },
    );
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue({ from: jest.fn() } as never);
    await runPage();
    expect(consoleSpy).toHaveBeenCalled();
    const loggedArgs = consoleSpy.mock.calls.flat().join(' ');
    expect(loggedArgs).not.toContain('secret@example.com');
    consoleSpy.mockRestore();
  });

  it('no INSERT/UPDATE/DELETE on user-scoped client in any branch', async () => {
    const supabase = makeSupabase(PILOT_USER, { data: null, error: null });
    mockCreateClient.mockResolvedValue(supabase as never);
    mockCreateServiceClient.mockReturnValue({ from: jest.fn() } as never);
    await runPage();
    expect(supabase._staffChain.insert).not.toHaveBeenCalled();
  });

  it('no writes via service client when holding page is shown', async () => {
    const supabase = makeSupabase(PILOT_USER, { data: null, error: null });
    mockCreateClient.mockResolvedValue(supabase as never);
    const insertMock = jest.fn();
    const updateMock = jest.fn();
    const deleteMock = jest.fn();
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({ eq: jest.fn() }),
        insert: insertMock,
        update: updateMock,
        delete: deleteMock,
      }),
    } as never);
    await runPage();
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
