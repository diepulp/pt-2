// FIXTURE A3-neg — Gate A NOT-CLEARED case (FIB §F.7; bare directive has no reason).
// A1 shape + a BARE `// integration-fidelity:allow` (no reason) on the preceding
// line. A reason is mandatory, so this must NOT clear: detected=true.
import { describe, it, expect } from '@jest/globals';

// integration-fidelity:allow
jest.mock('@/lib/supabase/server', () => ({
  createServerClient: jest.fn(),
}));

describe('A3-neg bare-allow mocked-client integration fixture', () => {
  it('mocks the client with a reasonless waiver that does not clear', () => {
    expect(true).toBe(true);
  });
});
