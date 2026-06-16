// FIXTURE A-near-miss — Gate A PASS: near-miss module paths that must NOT flag.
// `../client` lacks the load-bearing `supabase/` segment, and `supabase/admin`
// is not one of the (server|client|service) constructor terminals. Neither is
// a client-constructor mock, so detected=false.
import { describe, it, expect } from '@jest/globals';

jest.mock('../client');
jest.mock('supabase/admin');

describe('near-miss module mocks', () => {
  it('does not flag non-constructor supabase paths', () => {
    expect(true).toBe(true);
  });
});
