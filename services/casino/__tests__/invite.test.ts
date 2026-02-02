/**
 * Staff Invite Unit Tests (PRD-025 WS5)
 *
 * Tests createStaffInvite, acceptStaffInvite, listStaffInvites CRUD wrappers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import {
  acceptStaffInvite,
  createStaffInvite,
  listStaffInvites,
} from '../crud';
import { acceptInviteSchema, createInviteSchema } from '../schemas';

// === Mocks ===

jest.mock('@/lib/supabase/claims-reconcile', () => ({
  reconcileStaffClaims: jest.fn().mockResolvedValue(undefined),
}));

const { reconcileStaffClaims } = jest.requireMock(
  '@/lib/supabase/claims-reconcile',
);

// === Mock Data ===

const MOCK_USER_ID = 'auth-user-uuid-1';

const mockCreateInviteResult = {
  invite_id: 'invite-uuid-1',
  raw_token: 'a'.repeat(64),
  expires_at: '2026-02-03T14:00:00Z',
};

const mockAcceptInviteResult = {
  staff_id: 'staff-uuid-2',
  casino_id: 'casino-uuid-1',
  staff_role: 'dealer',
};

const mockInviteRow = {
  id: 'invite-uuid-1',
  casino_id: 'casino-uuid-1',
  email: 'test@example.com',
  staff_role: 'dealer' as const,
  expires_at: '2026-02-03T14:00:00Z',
  accepted_at: null,
  created_at: '2026-01-31T14:00:00Z',
};

// === Helpers ===

function createMockRpcSupabase(rpcResult: {
  data: unknown;
  error: unknown;
}): SupabaseClient<Database> {
  return {
    rpc: jest.fn().mockResolvedValue(rpcResult),
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: MOCK_USER_ID } },
        error: null,
      }),
    },
  } as unknown as SupabaseClient<Database>;
}

function createMockSelectSupabase(selectResult: {
  data: unknown;
  error: unknown;
}): SupabaseClient<Database> {
  const builder = {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue(selectResult),
  };
  return {
    from: jest.fn().mockReturnValue(builder),
  } as unknown as SupabaseClient<Database>;
}

// === createStaffInvite Tests ===

describe('createStaffInvite', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls rpc_create_staff_invite with correct params', async () => {
    const supabase = createMockRpcSupabase({
      data: [mockCreateInviteResult],
      error: null,
    });

    await createStaffInvite(supabase, {
      email: 'test@example.com',
      role: 'dealer',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('rpc_create_staff_invite', {
      p_email: 'test@example.com',
      p_role: 'dealer',
    });
  });

  it('returns CreateInviteResult with 64-char raw_token', async () => {
    const supabase = createMockRpcSupabase({
      data: [mockCreateInviteResult],
      error: null,
    });

    const result = await createStaffInvite(supabase, {
      email: 'test@example.com',
      role: 'dealer',
    });

    expect(result.invite_id).toBe('invite-uuid-1');
    expect(result.raw_token).toHaveLength(64);
    expect(result.expires_at).toBeTruthy();
  });

  it('throws INVITE_ALREADY_EXISTS on duplicate (ERRCODE 23505)', async () => {
    const supabase = createMockRpcSupabase({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });

    await expect(
      createStaffInvite(supabase, { email: 'dup@example.com', role: 'dealer' }),
    ).rejects.toMatchObject({ code: 'INVITE_ALREADY_EXISTS' });
  });

  it('throws FORBIDDEN on non-admin (ERRCODE P0001)', async () => {
    const supabase = createMockRpcSupabase({
      data: null,
      error: { code: 'P0001', message: 'FORBIDDEN: admin role required' },
    });

    await expect(
      createStaffInvite(supabase, {
        email: 'test@example.com',
        role: 'dealer',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws INTERNAL_ERROR on generic error', async () => {
    const supabase = createMockRpcSupabase({
      data: null,
      error: { code: 'PGRST000', message: 'connection error' },
    });

    await expect(
      createStaffInvite(supabase, {
        email: 'test@example.com',
        role: 'dealer',
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

// === acceptStaffInvite Tests ===

describe('acceptStaffInvite', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns AcceptInviteResult on success', async () => {
    const supabase = createMockRpcSupabase({
      data: [mockAcceptInviteResult],
      error: null,
    });

    const result = await acceptStaffInvite(supabase, { token: 'a'.repeat(64) });

    expect(result).toEqual({
      staff_id: 'staff-uuid-2',
      casino_id: 'casino-uuid-1',
      staff_role: 'dealer',
    });
  });

  it('calls reconcileStaffClaims after success', async () => {
    const supabase = createMockRpcSupabase({
      data: [mockAcceptInviteResult],
      error: null,
    });

    await acceptStaffInvite(supabase, { token: 'a'.repeat(64) });

    expect(reconcileStaffClaims).toHaveBeenCalledWith({
      staffId: 'staff-uuid-2',
      userId: MOCK_USER_ID,
      casinoId: 'casino-uuid-1',
      staffRole: 'dealer',
      currentStatus: 'active',
    });
  });

  it('throws INVITE_NOT_FOUND on invalid token (ERRCODE P0002)', async () => {
    const supabase = createMockRpcSupabase({
      data: null,
      error: { code: 'P0002', message: 'NOT_FOUND: invalid invite token' },
    });

    await expect(
      acceptStaffInvite(supabase, { token: 'b'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'INVITE_NOT_FOUND' });
  });

  it('throws INVITE_EXPIRED on expired token (ERRCODE P0003)', async () => {
    const supabase = createMockRpcSupabase({
      data: null,
      error: { code: 'P0003', message: 'GONE: invite has expired' },
    });

    await expect(
      acceptStaffInvite(supabase, { token: 'c'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'INVITE_EXPIRED' });
  });

  it('throws STAFF_ALREADY_BOUND on already-accepted (ERRCODE 23505)', async () => {
    const supabase = createMockRpcSupabase({
      data: null,
      error: {
        code: '23505',
        message: 'CONFLICT: user already has staff binding',
      },
    });

    await expect(
      acceptStaffInvite(supabase, { token: 'd'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'STAFF_ALREADY_BOUND' });
  });
});

// === listStaffInvites Tests ===

describe('listStaffInvites', () => {
  it('returns array of StaffInviteDTO (no token_hash)', async () => {
    const supabase = createMockSelectSupabase({
      data: [mockInviteRow],
      error: null,
    });

    const result = await listStaffInvites(supabase);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(mockInviteRow);
    expect(result[0]).not.toHaveProperty('token_hash');
  });

  it('returns empty array when no invites exist', async () => {
    const supabase = createMockSelectSupabase({
      data: [],
      error: null,
    });

    const result = await listStaffInvites(supabase);

    expect(result).toEqual([]);
  });

  it('throws INTERNAL_ERROR on database error', async () => {
    const supabase = createMockSelectSupabase({
      data: null,
      error: { code: 'PGRST000', message: 'connection error' },
    });

    await expect(listStaffInvites(supabase)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});

// === Schema Validation Tests ===

describe('createInviteSchema', () => {
  it('accepts valid input', () => {
    const result = createInviteSchema.safeParse({
      email: 'test@example.com',
      role: 'dealer',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all 4 valid roles', () => {
    for (const role of ['dealer', 'pit_boss', 'cashier', 'admin']) {
      const result = createInviteSchema.safeParse({
        email: 'test@example.com',
        role,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid email', () => {
    const result = createInviteSchema.safeParse({
      email: 'not-an-email',
      role: 'dealer',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = createInviteSchema.safeParse({
      email: 'test@example.com',
      role: 'manager',
    });
    expect(result.success).toBe(false);
  });
});

describe('acceptInviteSchema', () => {
  it('accepts valid 64-char hex token', () => {
    const result = acceptInviteSchema.safeParse({
      token: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    });
    expect(result.success).toBe(true);
  });

  it('rejects token shorter than 64 chars', () => {
    const result = acceptInviteSchema.safeParse({
      token: 'abc123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-hex characters', () => {
    const result = acceptInviteSchema.safeParse({
      token: 'g'.repeat(64),
    });
    expect(result.success).toBe(false);
  });

  it('rejects uppercase hex', () => {
    const result = acceptInviteSchema.safeParse({
      token: 'A'.repeat(64),
    });
    expect(result.success).toBe(false);
  });
});
