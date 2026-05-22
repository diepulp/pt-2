/** @jest-environment node */

import { canonicalizeEmail } from '../crud';

describe('canonicalizeEmail', () => {
  it('lowercases the email', () => {
    expect(canonicalizeEmail('USER@CASINO.COM')).toBe('user@casino.com');
  });

  it('trims leading and trailing whitespace', () => {
    expect(canonicalizeEmail('  user@casino.com  ')).toBe('user@casino.com');
  });

  it('lowercases and trims together', () => {
    expect(canonicalizeEmail('  Jane@Casino.COM  ')).toBe('jane@casino.com');
  });

  it('is a no-op for already-canonical email', () => {
    expect(canonicalizeEmail('jane@casino.com')).toBe('jane@casino.com');
  });
});
