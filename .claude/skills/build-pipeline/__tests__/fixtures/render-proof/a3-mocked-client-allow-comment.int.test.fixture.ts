// FIXTURE A3 — Gate A CLEARED case (FIB §F.7, §J allow_comment_overrides_flagged_line).
// A1 shape (mocks the client constructor) BUT the immediately preceding line
// carries a valid `// integration-fidelity:allow <reason>` directive with a
// non-empty reason. check-test-fidelity.py MUST clear it: detected=false and the
// line appears in cleared[].
import { describe, it, expect } from '@jest/globals';

// integration-fidelity:allow legacy mock pending Mode C rewrite
jest.mock('@/lib/supabase/server', () => ({
  createServerClient: jest.fn(),
}));

describe('A3 cleared mocked-client integration fixture', () => {
  it('mocks the client but is explicitly waived', () => {
    expect(true).toBe(true);
  });
});
