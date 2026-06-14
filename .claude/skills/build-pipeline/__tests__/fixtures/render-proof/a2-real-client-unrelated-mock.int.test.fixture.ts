// FIXTURE A2 — Gate A PASS case (FIB §F.7, §J unrelated_module_mock_with_real_db_passes).
// A legitimate integration test: constructs a REAL client and mocks only an
// unrelated module. check-test-fidelity.py MUST report detected=false.
import { describe, it, expect } from '@jest/globals';
import { createServerClient } from '@/lib/supabase/server';

// Unrelated-module mocks — these must NOT flag.
jest.mock('@/services/notifications/sender');
jest.mock('../mappers');

describe('A2 real-client integration fixture', () => {
  it('uses a real Supabase client', async () => {
    const supabase = createServerClient();
    expect(supabase).toBeDefined();
  });
});
