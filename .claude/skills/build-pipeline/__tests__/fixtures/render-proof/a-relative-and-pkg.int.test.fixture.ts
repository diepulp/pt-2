// FIXTURE A-relative-and-pkg — Gate A FAIL via the non-@/ constructor forms.
// Both a relative-path client-constructor mock (`../supabase/client`) and the
// upstream package mock (`@supabase/supabase-js`) must flag. Two violations.
import { describe, it, expect } from '@jest/globals';

jest.mock('../supabase/client');
jest.mock('@supabase/supabase-js');

describe('relative + package client-constructor mocks', () => {
  it('flags both constructor forms', () => {
    expect(true).toBe(true);
  });
});
