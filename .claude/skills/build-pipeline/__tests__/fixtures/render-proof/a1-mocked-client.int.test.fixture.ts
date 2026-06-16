// FIXTURE A1 — Gate A FAIL case (FIB §F.7, §J gate_a_synthetic_fixture_fails_on_mocked_client_constructor).
// An integration-named test that mocks the Supabase CLIENT CONSTRUCTOR.
// check-test-fidelity.py MUST report detected=true for this file.
// NOTE: `.fixture.ts` infix keeps Jest from collecting this as a live test.
import { describe, it, expect } from '@jest/globals';

jest.mock('@/lib/supabase/server', () => ({
  createServerClient: jest.fn(),
}));

describe('A1 mocked-client integration fixture', () => {
  it('pretends to be an integration test but mocks the client', () => {
    expect(true).toBe(true);
  });
});
