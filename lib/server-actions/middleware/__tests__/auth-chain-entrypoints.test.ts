/**
 * Auth Chain Entrypoints Regression Test — AUTH-HARDENING v0.1 WS3
 *
 * Static grep gate: ensures every production server action and route handler
 * passes through the auth middleware chain (withServerAction or withAuth).
 *
 * Enforcement method: file-system glob + content scan.
 * Fails if new entrypoints skip the middleware chain.
 *
 * The allowlist MUST be reviewed in PR review to prevent silent bypass accumulation.
 */

import { readFileSync } from 'fs';
import path from 'path';

import { globSync } from 'glob';

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

/**
 * Entrypoints that legitimately skip the auth chain.
 * Each entry must have a justification comment.
 */
const AUTH_CHAIN_ALLOWLIST: Record<string, string> = {
  // Public Supabase auth callback — no user session exists yet
  'app/(public)/auth/confirm/route.ts': 'Public auth OTP verification callback',
  // 308 redirect only — no data access, no auth needed
  'app/(dashboard)/players/[playerId]/timeline/route.ts':
    'HTTP 308 redirect, no data access',
  // Legacy routes using direct Supabase client (RLS enforced at DB layer).
  // TODO(AUTH-HARDENING v0.2): Migrate to withServerAction compositor pattern.
  'app/api/v1/casinos/[casinoId]/route.ts':
    'Legacy route — RLS-only, no compositor (v0.2 migration)',
  'app/api/v1/casinos/[casinoId]/staff/route.ts':
    'Legacy route — RLS-only, no compositor (v0.2 migration)',
  'app/api/v1/casinos/[casinoId]/settings/route.ts':
    'Legacy route — RLS-only, no compositor (v0.2 migration)',
  'app/api/v1/finance/transactions/route.ts':
    'Legacy route — RLS-only, no compositor (v0.2 migration)',
  'app/api/v1/finance/transactions/[transactionId]/route.ts':
    'Legacy route — RLS-only, no compositor (v0.2 migration)',
  'app/api/v1/loyalty/balances/route.ts':
    'Legacy route — RLS-only, no compositor (v0.2 migration)',
  'app/api/v1/loyalty/mid-session-reward/route.ts':
    'Legacy route — RLS-only, no compositor (v0.2 migration)',
};

/** Patterns indicating the file uses the auth middleware chain */
const AUTH_CHAIN_PATTERNS = [/withServerAction\s*[(<]/, /withAuth\s*[(<]/];

function isServerAction(content: string): boolean {
  return content.includes("'use server'") || content.includes('"use server"');
}

function isRouteHandler(content: string): boolean {
  return /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)\s*\(/.test(
    content,
  );
}

function usesAuthChain(content: string): boolean {
  return AUTH_CHAIN_PATTERNS.some((pattern) => pattern.test(content));
}

describe('Auth chain entrypoint coverage', () => {
  const appDir = path.join(PROJECT_ROOT, 'app');
  const allTsFiles = globSync('**/*.ts', {
    cwd: appDir,
    ignore: ['**/__tests__/**', '**/*.test.*', '**/*.spec.*'],
  });

  const entrypoints = allTsFiles.filter((file) => {
    const content = readFileSync(path.join(appDir, file), 'utf-8');
    return isServerAction(content) || isRouteHandler(content);
  });

  it('finds production entrypoints', () => {
    // Sanity check — we should have a non-trivial number of entrypoints
    expect(entrypoints.length).toBeGreaterThan(10);
  });

  it.each(entrypoints)('%s uses auth chain or is allowlisted', (file) => {
    const relativePath = `app/${file}`;

    if (AUTH_CHAIN_ALLOWLIST[relativePath]) {
      // Allowlisted — pass with justification
      return;
    }

    const content = readFileSync(path.join(appDir, file), 'utf-8');
    const hasAuthChain = usesAuthChain(content);

    if (!hasAuthChain) {
      throw new Error(
        `${relativePath} is a production entrypoint (server action or route handler) ` +
          `but does NOT use withServerAction() or withAuth(). ` +
          `Either add the auth chain or add to AUTH_CHAIN_ALLOWLIST with justification.`,
      );
    }
  });

  it('allowlist entries are still valid entrypoints', () => {
    // Ensure allowlist doesn't accumulate stale entries
    for (const [file, reason] of Object.entries(AUTH_CHAIN_ALLOWLIST)) {
      const relativePath = file.replace(/^app\//, '');
      const fullPath = path.join(appDir, relativePath);
      let exists = false;
      try {
        readFileSync(fullPath, 'utf-8');
        exists = true;
      } catch {
        exists = false;
      }

      expect(exists).toBe(true);
      expect(reason.length).toBeGreaterThan(0);
    }
  });
});
