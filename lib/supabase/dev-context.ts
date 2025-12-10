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

import type { RLSContext } from "./rls-context";

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
  actorId: "5a000000-0000-0000-0000-000000000001",
  casinoId: "ca000000-0000-0000-0000-000000000001",
  staffRole: "pit_boss",
};

/**
 * Development auth user UUID
 *
 * This UUID is used for the dev auth.users entry linked to Marcus Thompson.
 * Created by seed.sql when running `supabase db reset`.
 */
export const DEV_AUTH_USER_ID = "a0000000-0000-0000-0000-000000000de0";

/**
 * Development user email for login testing
 */
export const DEV_USER_EMAIL = "pitboss@dev.local";

/**
 * Development user password (only for local development)
 * Note: This is intentionally weak - only for local dev environment
 */
export const DEV_USER_PASSWORD = "devpass123";

/**
 * Check if running in development mode
 */
export function isDevMode(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Check if dev auth bypass is enabled
 *
 * Can be disabled even in dev mode by setting DEV_AUTH_BYPASS=false
 */
export function isDevAuthBypassEnabled(): boolean {
  if (!isDevMode()) return false;

  // Allow disabling dev bypass via env var for integration testing
  if (process.env.DEV_AUTH_BYPASS === "false") return false;

  return true;
}
