/**
 * Development Context
 *
 * Provides mock RLS context for local development without requiring
 * Supabase authentication. This allows API routes to function in dev mode.
 *
 * WARNING: This context is ONLY used when NODE_ENV === 'development'.
 * Production mode always requires real authentication.
 *
 * @see ISSUE-001 Dashboard Auth & Next.js 16 Migration
 */

import type { RLSContext } from './rls-context';

/**
 * Development-only RLS context
 *
 * Uses UUIDs that match the seed data in the development database.
 * These IDs correspond to Marcus Thompson (pit boss) from seed.sql.
 *
 * @see supabase/seed.sql - Staff section
 */
export const DEV_RLS_CONTEXT: RLSContext = {
  // Marcus Thompson - Pit Boss at Lucky Star Downtown (Casino 1)
  actorId: '5a000000-0000-0000-0000-000000000001',
  casinoId: 'ca000000-0000-0000-0000-000000000001',
  staffRole: 'pit_boss',
};

/**
 * Development auth user UUID
 *
 * This UUID is used for the dev auth.users entry linked to Marcus Thompson.
 * Created by seed.sql when running `supabase db reset`.
 */
export const DEV_AUTH_USER_ID = 'a0000000-0000-0000-0000-000000000de0';

/**
 * Development user email for login testing
 */
export const DEV_USER_EMAIL = 'pitboss@dev.local';

/**
 * Development user password (only for local development)
 * Note: This is intentionally weak - only for local dev environment
 */
export const DEV_USER_PASSWORD = 'devpass123';

/**
 * Check if running in development mode
 */
export function isDevMode(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if dev auth bypass is enabled
 *
 * AUTH-HARDENING v0.1 WS4: Requires explicit ENABLE_DEV_AUTH=true in dev mode.
 * Previous behavior (bypass-by-default) replaced with opt-in gate.
 */
export function isDevAuthBypassEnabled(): boolean {
  if (!isDevMode()) return false;

  // Explicit opt-in required (AUTH-HARDENING v0.1)
  return process.env.ENABLE_DEV_AUTH === 'true';
}

let _bypassLogEmitted = false;

/**
 * Assert dev auth bypass is allowed in the current environment.
 *
 * AUTH-HARDENING v0.1 WS4: Call at server startup to fail fast if bypass
 * env vars leak into production.
 *
 * @throws Error if bypass is requested outside development mode
 */
export function assertDevAuthBypassAllowed(): void {
  if (!isDevMode()) {
    throw new Error(
      '[AUTH LOCKDOWN] DEV_AUTH_BYPASS / ENABLE_DEV_AUTH cannot be used outside NODE_ENV=development. ' +
        'Remove these env vars from production configuration.',
    );
  }

  if (process.env.ENABLE_DEV_AUTH === 'true' && !_bypassLogEmitted) {
    _bypassLogEmitted = true;
    console.warn(
      '[AUTH BYPASS ENABLED] Development auth bypass active — RLS policies rely on JWT metadata or mock context',
    );
  }
}
