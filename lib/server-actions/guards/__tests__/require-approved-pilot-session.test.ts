/** @jest-environment node */

jest.mock('@/lib/supabase/service');
jest.mock('@/services/pilot/crud');

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { createServiceClient } from '@/lib/supabase/service';
import { canonicalizeEmail, checkAllowlistGate } from '@/services/pilot/crud';
import type { Database } from '@/types/database.types';

import { requireApprovedPilotSession } from '../require-approved-pilot-session';

const mockCreateServiceClient = jest.mocked(createServiceClient);
const mockCheckAllowlistGate = jest.mocked(checkAllowlistGate);
const mockCanonicalizeEmail = jest.mocked(canonicalizeEmail);

function makeSupabase(user: { email: string } | null, authError = false) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user },
        error: authError ? new Error('auth error') : null,
      }),
    },
  } as unknown as SupabaseClient<Database>;
}

describe('requireApprovedPilotSession — default (no opts)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PILOT_ADMIN_EMAILS;
    mockCanonicalizeEmail.mockImplementation((e: string) =>
      e.toLowerCase().trim(),
    );
    mockCreateServiceClient.mockReturnValue({} as never);
  });

  it('unauthenticated → UNAUTHORIZED', async () => {
    const supabase = makeSupabase(null);
    await expect(requireApprovedPilotSession(supabase)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('auth error → UNAUTHORIZED', async () => {
    const supabase = makeSupabase(null, true);
    await expect(requireApprovedPilotSession(supabase)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('approved user → passes, returns canonical email', async () => {
    const supabase = makeSupabase({ email: '  Pilot@EXAMPLE.com  ' });
    mockCheckAllowlistGate.mockResolvedValue('approved');
    const result = await requireApprovedPilotSession(supabase);
    expect(result.email).toBe('pilot@example.com');
  });

  it('not-approved user → FORBIDDEN', async () => {
    const supabase = makeSupabase({ email: 'outsider@example.com' });
    mockCheckAllowlistGate.mockResolvedValue('not_approved');
    await expect(requireApprovedPilotSession(supabase)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('requireProvisioningAuth:false → no admin check (same as default)', async () => {
    const supabase = makeSupabase({ email: 'pilot@example.com' });
    mockCheckAllowlistGate.mockResolvedValue('approved');
    // Even with PILOT_ADMIN_EMAILS set, the check should not run
    process.env.PILOT_ADMIN_EMAILS = 'admin@example.com';
    const result = await requireApprovedPilotSession(supabase, {
      requireProvisioningAuth: false,
    });
    expect(result.email).toBe('pilot@example.com');
  });
});

describe('requireApprovedPilotSession — requireProvisioningAuth:true', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PILOT_ADMIN_EMAILS;
    mockCanonicalizeEmail.mockImplementation((e: string) =>
      e.toLowerCase().trim(),
    );
    mockCreateServiceClient.mockReturnValue({} as never);
    mockCheckAllowlistGate.mockResolvedValue('approved');
  });

  it('approved non-admin (not in PILOT_ADMIN_EMAILS) → FORBIDDEN', async () => {
    process.env.PILOT_ADMIN_EMAILS = 'admin@example.com';
    const supabase = makeSupabase({ email: 'pilot@example.com' });
    await expect(
      requireApprovedPilotSession(supabase, { requireProvisioningAuth: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allowlisted + in PILOT_ADMIN_EMAILS → passes', async () => {
    process.env.PILOT_ADMIN_EMAILS = 'admin@example.com';
    const supabase = makeSupabase({ email: 'admin@example.com' });
    const result = await requireApprovedPilotSession(supabase, {
      requireProvisioningAuth: true,
    });
    expect(result.email).toBe('admin@example.com');
  });

  it('PILOT_ADMIN_EMAILS unset → FORBIDDEN (fail closed)', async () => {
    // PILOT_ADMIN_EMAILS not set → empty list → deny all
    const supabase = makeSupabase({ email: 'admin@example.com' });
    await expect(
      requireApprovedPilotSession(supabase, { requireProvisioningAuth: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('PILOT_ADMIN_EMAILS empty string → FORBIDDEN (fail closed)', async () => {
    process.env.PILOT_ADMIN_EMAILS = '';
    const supabase = makeSupabase({ email: 'admin@example.com' });
    await expect(
      requireApprovedPilotSession(supabase, { requireProvisioningAuth: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('PILOT_ADMIN_EMAILS set but user not in it → FORBIDDEN', async () => {
    process.env.PILOT_ADMIN_EMAILS = 'other-admin@example.com';
    const supabase = makeSupabase({ email: 'pilot@example.com' });
    await expect(
      requireApprovedPilotSession(supabase, { requireProvisioningAuth: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('non-allowlisted email that IS in PILOT_ADMIN_EMAILS → FORBIDDEN (allowlist runs first)', async () => {
    process.env.PILOT_ADMIN_EMAILS = 'unlisted-admin@example.com';
    const supabase = makeSupabase({ email: 'unlisted-admin@example.com' });
    // Allowlist gate fails — this person is in PILOT_ADMIN_EMAILS but not allowlisted
    mockCheckAllowlistGate.mockResolvedValue('not_approved');
    await expect(
      requireApprovedPilotSession(supabase, { requireProvisioningAuth: true }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Pilot access required',
    });
  });

  it('allowlist error does not grant access even to admin emails', async () => {
    process.env.PILOT_ADMIN_EMAILS = 'admin@example.com';
    const supabase = makeSupabase({ email: 'admin@example.com' });
    mockCheckAllowlistGate.mockResolvedValue('not_approved'); // fail closed on any error
    await expect(
      requireApprovedPilotSession(supabase, { requireProvisioningAuth: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('requireApprovedPilotSession — DomainError is thrown (not returned)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PILOT_ADMIN_EMAILS;
    mockCanonicalizeEmail.mockImplementation((e: string) =>
      e.toLowerCase().trim(),
    );
    mockCreateServiceClient.mockReturnValue({} as never);
  });

  it('thrown error is a DomainError instance', async () => {
    const supabase = makeSupabase(null);
    try {
      await requireApprovedPilotSession(supabase);
      fail('Expected DomainError to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
    }
  });
});
