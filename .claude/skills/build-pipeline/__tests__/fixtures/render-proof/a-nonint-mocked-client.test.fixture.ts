// FIXTURE A-nonint — a NON-integration-named test file (no .int.test / .integration.test
// suffix) that mocks the client constructor. Gate A is scoped to int-named files
// only, so this file must be IGNORED (no signals) even though it mocks the client.
import { describe, it, expect } from '@jest/globals';

jest.mock('@/lib/supabase/server', () => ({
  createServerClient: jest.fn(),
}));

describe('non-int mocked-client fixture', () => {
  it('is out of Gate A scope', () => {
    expect(true).toBe(true);
  });
});
