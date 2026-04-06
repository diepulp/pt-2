/** @jest-environment node */

/**
 * PRD-060: CompanyService CRUD Unit Tests
 *
 * Tests registerCompany() and getRegistrationStatus() with mocked Supabase.
 * Validates argument mapping, error code translation, and DTO shaping.
 *
 * @see docs/21-exec-spec/EXEC-060-company-registration-bootstrap.md
 * @see services/company/crud.ts
 */

import { registerCompany, getRegistrationStatus } from '../crud';

// === Mock Supabase Client ===

const mockRpc = jest.fn();
const mockMaybeSingle = jest.fn();
const mockSelect = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSupabase = { rpc: mockRpc, from: mockFrom } as any;

beforeEach(() => {
  jest.clearAllMocks();
});

// === registerCompany ===

describe('registerCompany', () => {
  test('calls rpc_register_company with correct args', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ company_id: 'c1', registration_id: 'r1' }],
      error: null,
    });

    const result = await registerCompany(mockSupabase, {
      company_name: 'Test Co',
      legal_name: 'Test Company LLC',
    });

    expect(mockRpc).toHaveBeenCalledWith('rpc_register_company', {
      p_company_name: 'Test Co',
      p_legal_name: 'Test Company LLC',
    });
    expect(result).toEqual({ company_id: 'c1', registration_id: 'r1' });
  });

  test('passes undefined for legal_name when omitted', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ company_id: 'c2', registration_id: 'r2' }],
      error: null,
    });

    await registerCompany(mockSupabase, { company_name: 'Minimal Co' });

    expect(mockRpc).toHaveBeenCalledWith('rpc_register_company', {
      p_company_name: 'Minimal Co',
      p_legal_name: undefined,
    });
  });

  test('throws REGISTRATION_CONFLICT on 23505 (unique_violation)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'unique_violation' },
    });

    await expect(
      registerCompany(mockSupabase, { company_name: 'Dupe Co' }),
    ).rejects.toThrow(/pending registration/i);
  });

  test('throws INTERNAL_ERROR on other database errors', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    });

    await expect(
      registerCompany(mockSupabase, { company_name: 'Error Co' }),
    ).rejects.toThrow(/relation does not exist/);
  });

  test('throws INTERNAL_ERROR when RPC returns no data', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      registerCompany(mockSupabase, { company_name: 'Empty Co' }),
    ).rejects.toThrow(/returned no data/);
  });

  test('handles non-array RPC response (single object)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { company_id: 'c3', registration_id: 'r3' },
      error: null,
    });

    const result = await registerCompany(mockSupabase, {
      company_name: 'Single Co',
    });

    expect(result).toEqual({ company_id: 'c3', registration_id: 'r3' });
  });
});

// === getRegistrationStatus ===

describe('getRegistrationStatus', () => {
  test('returns null when no pending registration exists', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await getRegistrationStatus(mockSupabase);

    expect(result).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith('onboarding_registration');
  });

  test('returns registration DTO when pending row exists', async () => {
    const row = {
      id: 'r1',
      user_id: 'u1',
      company_id: 'c1',
      status: 'pending',
      created_at: '2026-04-02T00:00:00Z',
    };
    mockMaybeSingle.mockResolvedValueOnce({ data: row, error: null });

    const result = await getRegistrationStatus(mockSupabase);

    expect(result).toEqual({
      id: 'r1',
      user_id: 'u1',
      company_id: 'c1',
      status: 'pending',
      created_at: '2026-04-02T00:00:00Z',
    });
  });

  test('throws INTERNAL_ERROR on query failure', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST301', message: 'connection refused' },
    });

    await expect(getRegistrationStatus(mockSupabase)).rejects.toThrow(
      /connection refused/,
    );
  });
});
