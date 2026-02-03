/**
 * Shift Dashboard E2E Test Helpers
 *
 * Authentication fixtures and data helpers for testing the auth-protected
 * shift dashboard route at /(protected)/shift-dashboard.
 *
 * Uses service role client to create test users with proper app_metadata
 * for RLS context (ADR-015 Pattern C, ADR-024 authoritative context).
 *
 * @see PERF-007 WS8 — E2E Test Improvements
 * @see e2e/fixtures/test-data.ts — Base fixture pattern
 */

import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
  );
}

function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface ShiftDashboardTestScenario {
  casinoId: string;
  staffId: string;
  staffUserId: string;
  testEmail: string;
  testPassword: string;
  authToken: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates a minimal test scenario for shift dashboard E2E tests.
 *
 * Includes: casino, staff user with admin role, auth user with app_metadata
 * for RLS context derivation.
 */
export async function createShiftDashboardScenario(): Promise<ShiftDashboardTestScenario> {
  const supabase = createServiceClient();
  const timestamp = Date.now();
  const testPrefix = `e2e_shift_${timestamp}`;

  // Create test casino
  const { data: casino, error: casinoError } = await supabase
    .from('casino')
    .insert({
      name: `${testPrefix}_casino`,
      status: 'active',
    })
    .select()
    .single();

  if (casinoError || !casino) {
    throw new Error(`Failed to create test casino: ${casinoError?.message}`);
  }

  // Create auth user with app_metadata for RLS (ADR-015 Pattern C)
  const testEmail = `${testPrefix}_staff@test.com`;
  const testPassword = 'TestPassword123!';

  const { data: authData, error: authCreateError } =
    await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      app_metadata: {
        casino_id: casino.id,
        staff_role: 'admin',
      },
    });

  if (authCreateError || !authData.user) {
    throw new Error(
      `Failed to create test auth user: ${authCreateError?.message}`,
    );
  }

  // Create staff record linked to auth user
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .insert({
      casino_id: casino.id,
      user_id: authData.user.id,
      first_name: 'Test',
      last_name: 'ShiftSupervisor',
      email: testEmail,
      role: 'admin',
      status: 'active',
    })
    .select()
    .single();

  if (staffError || !staff) {
    throw new Error(`Failed to create test staff: ${staffError?.message}`);
  }

  // Update app_metadata with staff_id for full RLS context
  const { error: updateMetadataError } =
    await supabase.auth.admin.updateUserById(authData.user.id, {
      app_metadata: {
        casino_id: casino.id,
        staff_id: staff.id,
        staff_role: 'admin',
      },
    });

  if (updateMetadataError) {
    throw new Error(
      `Failed to update user metadata: ${updateMetadataError.message}`,
    );
  }

  // Sign in to get auth token (separate client to preserve service role)
  const authClient = createClient<Database>(
    supabaseUrl,
    supabaseServiceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: signInData, error: signInError } =
    await authClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in test user: ${signInError?.message}`);
  }

  const cleanup = async () => {
    const cleanupClient = createServiceClient();
    await cleanupClient.from('staff').delete().eq('id', staff.id);
    await cleanupClient.from('casino').delete().eq('id', casino.id);
    await cleanupClient.auth.admin.deleteUser(authData.user.id);
  };

  return {
    casinoId: casino.id,
    staffId: staff.id,
    staffUserId: authData.user.id,
    testEmail,
    testPassword,
    authToken: signInData.session.access_token,
    cleanup,
  };
}

/**
 * Authenticates a Playwright page via the login form.
 *
 * Fills the login form, confirms the Supabase auth API returns 200,
 * then performs a hard navigation to verify cookies are accepted by
 * the middleware. This is more reliable than waiting for the form's
 * soft router.push() under parallel test execution.
 */
export async function authenticateViaLogin(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Wait for networkidle to ensure React hydration completes.
  // Without this, form handlers aren't attached and fill/click become no-ops.
  await page.goto('/auth/login', { waitUntil: 'networkidle' });

  // Wait for the submit button to confirm the form is interactive
  await page.locator('button[type="submit"]:has-text("Login")').waitFor({
    state: 'visible',
    timeout: 15_000,
  });

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);

  // Click submit and wait for the Supabase auth API to confirm success
  await Promise.all([
    page.waitForResponse(
      (resp) => resp.url().includes('/auth/v1/token') && resp.status() === 200,
    ),
    page.locator('button[type="submit"]').click(),
  ]);

  // Auth API succeeded — session cookies are now set by the browser client.
  // Do a hard navigation to verify cookies work with the server-side middleware.
  // This avoids relying on Next.js router.push() soft navigation timing.
  await page.goto('/pit', { waitUntil: 'domcontentloaded', timeout: 15_000 });

  // Verify we're authenticated (not redirected back to login)
  if (page.url().includes('/auth/login')) {
    throw new Error('Authentication failed: redirected back to login');
  }
}

/**
 * API endpoint paths used by the shift dashboard.
 * Useful for route interception in E2E tests.
 */
export const DASHBOARD_API = {
  summary: '/api/v1/shift-dashboards/summary',
  cashObsSummary: '/api/v1/shift-dashboards/cash-observations/summary',
  visitorsSummary: '/api/v1/shift-dashboards/visitors-summary',
} as const;

/** Protected route path for shift dashboard */
export const SHIFT_DASHBOARD_URL = '/shift-dashboard';
