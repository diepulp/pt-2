/** @jest-environment node */

/**
 * Valuation Policy Service Layer Tests (PRD-053 WS5f)
 *
 * Tests getActiveValuationPolicy() and updateValuationPolicy() CRUD functions.
 *
 * @see EXEC-054 WS5f — Admin Surface Tests
 */

import * as crud from '../crud';

// === Fixtures ===

const CASINO_ID = '33333333-3333-3333-3333-333333333333';
const STAFF_ID = '55555555-5555-5555-5555-555555555555';
const POLICY_ID = '66666666-6666-6666-6666-666666666666';

const ACTIVE_ROW = {
  id: POLICY_ID,
  casino_id: CASINO_ID,
  cents_per_point: 2,
  effective_date: '2026-03-20',
  version_identifier: 'admin-2026-03-20',
  is_active: true,
  created_by_staff_id: STAFF_ID,
  created_at: '2026-03-20T12:00:00Z',
};

// === Mock Helpers ===

function makeSelectChain(data: unknown, error: unknown = null) {
  const maybeSingle = jest.fn().mockResolvedValue({ data, error });
  const eq = jest.fn();
  eq.mockReturnValue({ eq, maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  return { from: jest.fn().mockReturnValue({ select }) };
}

function makeRpcMock(data: unknown, error: unknown = null) {
  return { rpc: jest.fn().mockResolvedValue({ data, error }) };
}

// === getActiveValuationPolicy Tests ===

describe('getActiveValuationPolicy', () => {
  it('returns ValuationPolicyDTO for active row', async () => {
    const { from } = makeSelectChain(ACTIVE_ROW);
    const supabase = { from } as unknown as Parameters<
      typeof crud.getActiveValuationPolicy
    >[0];

    const result = await crud.getActiveValuationPolicy(supabase, CASINO_ID);

    expect(result).toEqual({
      id: POLICY_ID,
      casinoId: CASINO_ID,
      centsPerPoint: 2,
      effectiveDate: '2026-03-20',
      versionIdentifier: 'admin-2026-03-20',
      isActive: true,
      createdByStaffId: STAFF_ID,
      createdAt: '2026-03-20T12:00:00Z',
    });
    expect(from).toHaveBeenCalledWith('loyalty_valuation_policy');
  });

  it('returns null when no active row exists', async () => {
    const { from } = makeSelectChain(null);
    const supabase = { from } as unknown as Parameters<
      typeof crud.getActiveValuationPolicy
    >[0];

    const result = await crud.getActiveValuationPolicy(supabase, CASINO_ID);

    expect(result).toBeNull();
  });

  it('throws on database error', async () => {
    const { from } = makeSelectChain(null, {
      code: '42P01',
      message: 'relation does not exist',
    });
    const supabase = { from } as unknown as Parameters<
      typeof crud.getActiveValuationPolicy
    >[0];

    await expect(
      crud.getActiveValuationPolicy(supabase, CASINO_ID),
    ).rejects.toThrow();
  });
});

// === updateValuationPolicy Tests ===

describe('updateValuationPolicy', () => {
  it('calls RPC with correct parameters (no p_casino_id)', async () => {
    const rpcResult = { ...ACTIVE_ROW, cents_per_point: 5 };
    const { rpc } = makeRpcMock(rpcResult);
    const supabase = { rpc } as unknown as Parameters<
      typeof crud.updateValuationPolicy
    >[0];

    await crud.updateValuationPolicy(supabase, {
      centsPerPoint: 5,
      effectiveDate: '2026-04-01',
      versionIdentifier: 'admin-2026-04-01',
    });

    expect(rpc).toHaveBeenCalledWith('rpc_update_valuation_policy', {
      p_cents_per_point: 5,
      p_effective_date: '2026-04-01',
      p_version_identifier: 'admin-2026-04-01',
    });

    // Verify no p_casino_id parameter (ADR-024 INV-8)
    const callArgs = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty('p_casino_id');
  });

  it('returns ValuationPolicyDTO from RPC response', async () => {
    const rpcResult = { ...ACTIVE_ROW, cents_per_point: 5 };
    const { rpc } = makeRpcMock(rpcResult);
    const supabase = { rpc } as unknown as Parameters<
      typeof crud.updateValuationPolicy
    >[0];

    const result = await crud.updateValuationPolicy(supabase, {
      centsPerPoint: 5,
      effectiveDate: '2026-04-01',
      versionIdentifier: 'admin-2026-04-01',
    });

    expect(result).toMatchObject({
      centsPerPoint: 5,
      isActive: true,
      createdByStaffId: STAFF_ID,
    });
  });

  it('throws INTERNAL_ERROR when RPC returns null', async () => {
    const { rpc } = makeRpcMock(null);
    const supabase = { rpc } as unknown as Parameters<
      typeof crud.updateValuationPolicy
    >[0];

    await expect(
      crud.updateValuationPolicy(supabase, {
        centsPerPoint: 5,
        effectiveDate: '2026-04-01',
        versionIdentifier: 'admin-2026-04-01',
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('throws on RPC error', async () => {
    const { rpc } = makeRpcMock(null, {
      code: 'P0001',
      message: 'admin role required',
    });
    const supabase = { rpc } as unknown as Parameters<
      typeof crud.updateValuationPolicy
    >[0];

    await expect(
      crud.updateValuationPolicy(supabase, {
        centsPerPoint: 5,
        effectiveDate: '2026-04-01',
        versionIdentifier: 'admin-2026-04-01',
      }),
    ).rejects.toThrow();
  });
});

// === getActiveValuationCentsPerPoint Tests ===

describe('getActiveValuationCentsPerPoint', () => {
  it('returns number when active policy exists', async () => {
    const { from } = makeSelectChain(ACTIVE_ROW);
    const supabase = { from } as unknown as Parameters<
      typeof crud.getActiveValuationCentsPerPoint
    >[0];

    const result = await crud.getActiveValuationCentsPerPoint(
      supabase,
      CASINO_ID,
    );

    expect(result).toBe(2);
    expect(typeof result).toBe('number');
  });

  it('throws VALUATION_POLICY_MISSING when no active row', async () => {
    const { from } = makeSelectChain(null);
    const supabase = { from } as unknown as Parameters<
      typeof crud.getActiveValuationCentsPerPoint
    >[0];

    await expect(
      crud.getActiveValuationCentsPerPoint(supabase, CASINO_ID),
    ).rejects.toMatchObject({ code: 'VALUATION_POLICY_MISSING' });
  });
});
