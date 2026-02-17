/**
 * Bootstrap Casino Unit Tests (PRD-025 WS5)
 *
 * Tests bootstrapCasino CRUD wrapper: RPC call, claims reconciliation, error mapping.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import { bootstrapCasino } from '../crud';
import { bootstrapCasinoSchema } from '../schemas';

// === Mocks ===

jest.mock('@/lib/supabase/claims-reconcile', () => ({
  reconcileStaffClaims: jest.fn().mockResolvedValue(undefined),
}));

const { reconcileStaffClaims } = jest.requireMock(
  '@/lib/supabase/claims-reconcile',
);

// === Mock Data ===

const MOCK_USER_ID = 'auth-user-uuid-1';

const mockBootstrapResult = {
  casino_id: 'casino-uuid-1',
  staff_id: 'staff-uuid-1',
  staff_role: 'admin',
};

function createMockSupabase(rpcResult: {
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

// === Tests ===

describe('bootstrapCasino', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls rpc_bootstrap_casino with correct params', async () => {
    const supabase = createMockSupabase({
      data: [mockBootstrapResult],
      error: null,
    });

    await bootstrapCasino(supabase, {
      casino_name: 'Test Casino',
      timezone: 'America/New_York',
      gaming_day_start: '08:00',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('rpc_bootstrap_casino', {
      p_casino_name: 'Test Casino',
      p_timezone: 'America/New_York',
      p_gaming_day_start: '08:00',
    });
  });

  it('returns BootstrapCasinoResult on success', async () => {
    const supabase = createMockSupabase({
      data: [mockBootstrapResult],
      error: null,
    });

    const result = await bootstrapCasino(supabase, {
      casino_name: 'Test Casino',
    });

    expect(result).toEqual({
      casino_id: 'casino-uuid-1',
      staff_id: 'staff-uuid-1',
      staff_role: 'admin',
    });
  });

  it('calls reconcileStaffClaims after success', async () => {
    const supabase = createMockSupabase({
      data: [mockBootstrapResult],
      error: null,
    });

    await bootstrapCasino(supabase, { casino_name: 'Test Casino' });

    expect(reconcileStaffClaims).toHaveBeenCalledWith({
      staffId: 'staff-uuid-1',
      userId: MOCK_USER_ID,
      casinoId: 'casino-uuid-1',
      staffRole: 'admin',
      currentStatus: 'active',
    });
  });

  it('throws STAFF_ALREADY_BOUND on conflict (ERRCODE 23505)', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });

    await expect(
      bootstrapCasino(supabase, { casino_name: 'Test Casino' }),
    ).rejects.toMatchObject({
      code: 'STAFF_ALREADY_BOUND',
    });
    await expect(
      bootstrapCasino(supabase, { casino_name: 'Test Casino' }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('throws INTERNAL_ERROR on generic RPC error', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { code: 'PGRST000', message: 'connection error' },
    });

    await expect(
      bootstrapCasino(supabase, { casino_name: 'Test Casino' }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});

// === Schema Validation Tests ===

describe('bootstrapCasinoSchema', () => {
  it('accepts valid input with all fields', () => {
    const result = bootstrapCasinoSchema.safeParse({
      casino_name: 'Test Casino',
      timezone: 'America/Los_Angeles',
      gaming_day_start: '06:00',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with only required fields', () => {
    const result = bootstrapCasinoSchema.safeParse({
      casino_name: 'Test Casino',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty casino_name', () => {
    const result = bootstrapCasinoSchema.safeParse({
      casino_name: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects casino_name longer than 100 chars', () => {
    const result = bootstrapCasinoSchema.safeParse({
      casino_name: 'x'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid gaming_day_start format', () => {
    const result = bootstrapCasinoSchema.safeParse({
      casino_name: 'Test Casino',
      gaming_day_start: '6:00',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid HH:MM gaming_day_start format', () => {
    const result = bootstrapCasinoSchema.safeParse({
      casino_name: 'Test Casino',
      gaming_day_start: '23:59',
    });
    expect(result.success).toBe(true);
  });
});
