/**
 * Shared E2E Auth Helpers
 *
 * Single canonical source for Supabase client creation and browser/API
 * authentication in E2E tests. Eliminates the 13× duplication of
 * createServiceClient() and 11× duplication of auth login helpers.
 *
 * @see QA-006 §3  — Shared auth helper mandate
 * @see QA-006 §13 — Hydration wait rule
 */

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ---------------------------------------------------------------------------
// Service-role client — setup/teardown (bypasses RLS)
// ---------------------------------------------------------------------------

/**
 * Creates a Supabase client with the service-role key.
 * Use for fixture setup and teardown only — bypasses all RLS policies.
 */
export function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Mode C — Authenticated Supabase client (real JWT, no browser)
// ---------------------------------------------------------------------------

/**
 * Creates a Supabase client authenticated with a real JWT (Mode C).
 * Used for SECURITY DEFINER RPC calls in system verification tests.
 *
 * @param authToken - JWT obtained via signInWithPassword()
 */
export function createAuthenticatedClient(authToken: string) {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${authToken}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Mode B — Browser login via /auth/login form
// ---------------------------------------------------------------------------

/**
 * Authenticates via the real login form and navigates to a target URL (Mode B).
 *
 * Steps:
 * 1. Navigate to /auth/login, wait for form hydration
 * 2. Fill email/password, submit
 * 3. Wait for Supabase /auth/v1/token 200 response
 * 4. Hard-navigate to targetUrl (avoids RSC stream interruption)
 * 5. Verify not redirected back to login
 * 6. Wait for React hydration (document.readyState === 'complete')
 *
 * @param page - Playwright Page object
 * @param email - Test user email
 * @param password - Test user password
 * @param targetUrl - URL to navigate to after login (e.g., '/players/123')
 */
export async function authenticateAndNavigate(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  targetUrl: string,
): Promise<void> {
  await page.goto('/auth/login', { waitUntil: 'networkidle' });
  await page
    .locator('button[type="submit"]:has-text("Login")')
    .waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await Promise.all([
    page.waitForResponse(
      (resp) => resp.url().includes('/auth/v1/token') && resp.status() === 200,
    ),
    page.locator('button[type="submit"]').click(),
  ]);
  // Hard navigate to target (avoids RSC stream interruption)
  await page.goto(targetUrl, {
    waitUntil: 'load',
    timeout: 30_000,
  });
  if (page.url().includes('/auth/login')) {
    throw new Error('Authentication failed: redirected back to login');
  }
  // Wait for React hydration — scripts must finish executing before events work
  await page.waitForFunction(() => document.readyState === 'complete', {
    timeout: 15_000,
  });
}
