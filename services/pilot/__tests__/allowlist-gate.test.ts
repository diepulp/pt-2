/** @jest-environment node */

import type { SupabaseClient } from '@supabase/supabase-js';

import { checkAllowlistGate } from '../crud';
import type { Database } from '@/types/database.types';

function makeMockClient(maybeSingleResult: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(maybeSingleResult);
  const eqStatus = jest.fn().mockReturnValue({ maybeSingle });
  const eqEmail = jest.fn().mockReturnValue({ eq: eqStatus });
  const select = jest.fn().mockReturnValue({ eq: eqEmail });
  const from = jest.fn().mockReturnValue({ select });
  return { from } as unknown as SupabaseClient<Database>;
}

describe('checkAllowlistGate', () => {
  it('returns "approved" when an active entry exists', async () => {
    const client = makeMockClient({ data: { status: 'active' }, error: null });
    expect(await checkAllowlistGate(client, 'jane@casino.com')).toBe(
      'approved',
    );
  });

  it('returns "not_approved" when no row is found (maybeSingle → null)', async () => {
    const client = makeMockClient({ data: null, error: null });
    expect(await checkAllowlistGate(client, 'unknown@casino.com')).toBe(
      'not_approved',
    );
  });

  it('returns "not_approved" on a query error (fail-closed)', async () => {
    const client = makeMockClient({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });
    expect(await checkAllowlistGate(client, 'jane@casino.com')).toBe(
      'not_approved',
    );
  });

  it('returns "not_approved" when the client throws (fail-closed)', async () => {
    const maybeSingle = jest.fn().mockRejectedValue(new Error('network error'));
    const eqStatus = jest.fn().mockReturnValue({ maybeSingle });
    const eqEmail = jest.fn().mockReturnValue({ eq: eqStatus });
    const select = jest.fn().mockReturnValue({ eq: eqEmail });
    const from = jest.fn().mockReturnValue({ select });
    const client = { from } as unknown as SupabaseClient<Database>;

    expect(await checkAllowlistGate(client, 'jane@casino.com')).toBe(
      'not_approved',
    );
  });

  it('canonicalizes the email before querying', async () => {
    const maybeSingle = jest
      .fn()
      .mockResolvedValue({ data: { status: 'active' }, error: null });
    const eqStatus = jest.fn().mockReturnValue({ maybeSingle });
    const eqEmail = jest.fn().mockReturnValue({ eq: eqStatus });
    const select = jest.fn().mockReturnValue({ eq: eqEmail });
    const from = jest.fn().mockReturnValue({ select });
    const client = { from } as unknown as SupabaseClient<Database>;

    await checkAllowlistGate(client, '  Jane@Casino.COM  ');

    // The first .eq() call should receive the canonical email
    expect(eqEmail).toHaveBeenCalledWith('email', 'jane@casino.com');
  });
});
