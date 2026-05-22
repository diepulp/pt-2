import { isPilotAdmin } from '../is-pilot-admin';

describe('isPilotAdmin', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.PILOT_ADMIN_EMAILS;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.PILOT_ADMIN_EMAILS;
    } else {
      process.env.PILOT_ADMIN_EMAILS = originalEnv;
    }
  });

  it('returns false when PILOT_ADMIN_EMAILS is undefined', () => {
    delete process.env.PILOT_ADMIN_EMAILS;
    expect(isPilotAdmin('anyone@example.com')).toBe(false);
  });

  it('returns false when PILOT_ADMIN_EMAILS is empty string', () => {
    process.env.PILOT_ADMIN_EMAILS = '';
    expect(isPilotAdmin('anyone@example.com')).toBe(false);
  });

  it('returns true for exact match on single entry', () => {
    process.env.PILOT_ADMIN_EMAILS = 'admin@example.com';
    expect(isPilotAdmin('admin@example.com')).toBe(true);
  });

  it('returns false for non-matching email on single entry', () => {
    process.env.PILOT_ADMIN_EMAILS = 'admin@example.com';
    expect(isPilotAdmin('other@example.com')).toBe(false);
  });

  it('returns true for member of comma-separated list', () => {
    process.env.PILOT_ADMIN_EMAILS = 'admin@example.com,owner@example.com';
    expect(isPilotAdmin('owner@example.com')).toBe(true);
  });

  it('returns false for non-member of comma-separated list', () => {
    process.env.PILOT_ADMIN_EMAILS = 'admin@example.com,owner@example.com';
    expect(isPilotAdmin('random@example.com')).toBe(false);
  });

  it('matches case-insensitively against env var entry', () => {
    process.env.PILOT_ADMIN_EMAILS = 'admin@example.com';
    expect(isPilotAdmin('ADMIN@EXAMPLE.COM')).toBe(true);
  });

  it('strips leading and trailing whitespace from env var entries', () => {
    process.env.PILOT_ADMIN_EMAILS =
      '  admin@example.com  ,  owner@example.com  ';
    expect(isPilotAdmin('admin@example.com')).toBe(true);
    expect(isPilotAdmin('owner@example.com')).toBe(true);
  });
});
