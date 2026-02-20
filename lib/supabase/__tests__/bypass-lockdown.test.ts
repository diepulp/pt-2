/**
 * Bypass Lockdown Tests (AUTH-HARDENING v0.1 WS4)
 *
 * Validates:
 * 1. isDevAuthBypassEnabled() requires ENABLE_DEV_AUTH=true
 * 2. assertDevAuthBypassAllowed() throws outside dev mode
 * 3. CI guard: skipAuth usage restricted to test files
 * 4. Bypass activation emits [AUTH BYPASS ENABLED] log exactly once
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { globSync } from 'glob';

// ---------------------------------------------------------------------------
// Unit tests for isDevAuthBypassEnabled / assertDevAuthBypassAllowed
// ---------------------------------------------------------------------------

describe('isDevAuthBypassEnabled', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns false when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_DEV_AUTH = 'true';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isDevAuthBypassEnabled } = require('../dev-context');
    expect(isDevAuthBypassEnabled()).toBe(false);
  });

  it('returns false in development without ENABLE_DEV_AUTH', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ENABLE_DEV_AUTH;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isDevAuthBypassEnabled } = require('../dev-context');
    expect(isDevAuthBypassEnabled()).toBe(false);
  });

  it('returns false in development when ENABLE_DEV_AUTH is not "true"', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEV_AUTH = 'false';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isDevAuthBypassEnabled } = require('../dev-context');
    expect(isDevAuthBypassEnabled()).toBe(false);
  });

  it('returns true in development with ENABLE_DEV_AUTH=true', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEV_AUTH = 'true';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isDevAuthBypassEnabled } = require('../dev-context');
    expect(isDevAuthBypassEnabled()).toBe(true);
  });
});

describe('assertDevAuthBypassAllowed', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws in production even with ENABLE_DEV_AUTH=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_DEV_AUTH = 'true';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { assertDevAuthBypassAllowed } = require('../dev-context');
    expect(() => assertDevAuthBypassAllowed()).toThrow('[AUTH LOCKDOWN]');
  });

  it('does not throw in development with ENABLE_DEV_AUTH=true', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEV_AUTH = 'true';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { assertDevAuthBypassAllowed } = require('../dev-context');
    expect(() => assertDevAuthBypassAllowed()).not.toThrow();
  });

  it('emits [AUTH BYPASS ENABLED] log exactly once', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEV_AUTH = 'true';

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { assertDevAuthBypassAllowed } = require('../dev-context');

    assertDevAuthBypassAllowed();
    assertDevAuthBypassAllowed();
    assertDevAuthBypassAllowed();

    const bypassLogs = warnSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('[AUTH BYPASS ENABLED]'),
    );
    expect(bypassLogs).toHaveLength(1);

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// CI Guard: skipAuth usage restricted to test files
// ---------------------------------------------------------------------------

describe('CI Guard: skipAuth usage', () => {
  it('skipAuth: true must not appear in non-test source files (onboarding exempt per ADR-030 D6)', () => {
    const projectRoot = join(__dirname, '..', '..', '..');

    // Scan all TypeScript files in app/, lib/, services/, components/
    const sourceFiles = globSync(
      '{app,lib,services,components}/**/*.{ts,tsx}',
      {
        cwd: projectRoot,
        absolute: true,
        ignore: [
          '**/__tests__/**',
          '**/*.test.*',
          '**/*.spec.*',
          '**/test-utils/**',
          '**/seed/**',
          '**/node_modules/**',
          '**/app/(onboarding)/**', // ADR-030 D6: onboarding routes exempt
        ],
      },
    );

    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = readFileSync(filePath, 'utf-8');
      // Match skipAuth: true or skipAuth:true (with optional whitespace)
      if (/skipAuth\s*:\s*true/.test(content)) {
        const relativePath = filePath.replace(projectRoot + '/', '');
        violations.push(relativePath);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `skipAuth: true found in production source files (AUTH-HARDENING v0.1 WS4):\n` +
          violations.map((v) => `  - ${v}`).join('\n') +
          '\n\nMove skipAuth usage to __tests__/ or test-utils/ directories.',
      );
    }
  });
});
