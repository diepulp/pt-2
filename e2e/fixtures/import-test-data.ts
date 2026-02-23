/**
 * CSV Player Import E2E Test Fixtures (PRD-037 WS7)
 *
 * Provides test data factories for import wizard E2E tests.
 * Creates minimal casino + admin staff for authenticated import flow.
 *
 * Key difference from other fixtures: Does NOT create players or enrollments —
 * the import wizard itself creates those during tests.
 *
 * @see EXEC-037 WS7
 * @see e2e/fixtures/setup-wizard-fixtures.ts — Pattern reference
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

/**
 * Creates a service role client for test data setup/teardown.
 * WARNING: Bypasses RLS — use only in tests.
 */
export function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface ImportTestScenario {
  casinoId: string;
  staffId: string;
  staffUserId: string;
  testEmail: string;
  testPassword: string;
  authToken: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates a minimal casino scenario for CSV player import testing.
 *
 * Creates casino, casino_settings (setup_status='ready'), auth user (admin),
 * and staff record with full ADR-024 RLS context.
 */
export async function createImportTestScenario(): Promise<ImportTestScenario> {
  const supabase = createServiceClient();
  const timestamp = Date.now();
  const testPrefix = `e2e_import_${timestamp}`;

  // 1. Create casino
  const { data: casino, error: casinoError } = await supabase
    .from('casino')
    .insert({ name: `${testPrefix}_casino`, status: 'active' })
    .select()
    .single();

  if (casinoError || !casino) {
    throw new Error(`Failed to create casino: ${casinoError?.message}`);
  }

  // 2. Create casino_settings (setup_status='ready' for app navigation)
  type CasinoSettingsInsert =
    Database['public']['Tables']['casino_settings']['Insert'];

  const settingsInsert: CasinoSettingsInsert = {
    casino_id: casino.id,
    setup_status: 'ready',
    setup_completed_at: new Date().toISOString(),
  };

  const { error: settingsError } = await supabase
    .from('casino_settings')
    .insert(settingsInsert);

  if (settingsError) {
    throw new Error(
      `Failed to create casino_settings: ${settingsError.message}`,
    );
  }

  // 3. Create auth user with app_metadata for RLS (ADR-015 Pattern C)
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
    throw new Error(`Failed to create auth user: ${authCreateError?.message}`);
  }

  // 4. Create staff record linked to auth user
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .insert({
      casino_id: casino.id,
      user_id: authData.user.id,
      first_name: 'Test',
      last_name: 'ImportAdmin',
      email: testEmail,
      role: 'admin',
      status: 'active',
    })
    .select()
    .single();

  if (staffError || !staff) {
    throw new Error(`Failed to create staff: ${staffError?.message}`);
  }

  // 5. Update app_metadata with staff_id for full RLS context (ADR-024)
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    authData.user.id,
    {
      app_metadata: {
        casino_id: casino.id,
        staff_id: staff.id,
        staff_role: 'admin',
      },
    },
  );

  if (updateError) {
    throw new Error(`Failed to update user metadata: ${updateError.message}`);
  }

  // Stamp setup_completed_by now that we have staff.id
  await supabase
    .from('casino_settings')
    .update({ setup_completed_by: staff.id })
    .eq('casino_id', casino.id);

  // 6. Sign in to get auth token
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
    throw new Error(`Failed to sign in: ${signInError?.message}`);
  }

  // Cleanup: deletes all test data in reverse dependency order
  const cleanup = async () => {
    const c = createServiceClient();

    // 1. Get player IDs created by import (via player_casino for this casino)
    const { data: enrollments } = await c
      .from('player_casino')
      .select('player_id')
      .eq('casino_id', casino.id);

    const playerIds = enrollments?.map((e) => e.player_id) ?? [];

    // 2. Delete import data (import_row cascades from import_batch)
    await c.from('import_batch').delete().eq('casino_id', casino.id);

    // 3. Delete player_casino enrollments for this casino
    await c.from('player_casino').delete().eq('casino_id', casino.id);

    // 4. Delete player records created by import
    if (playerIds.length > 0) {
      await c.from('player').delete().in('id', playerIds);
    }

    // 5. Delete fixture data
    await c.from('staff').delete().eq('id', staff.id);
    await c.from('casino_settings').delete().eq('casino_id', casino.id);
    await c.from('casino').delete().eq('id', casino.id);

    // 6. Delete auth user
    await c.auth.admin.deleteUser(authData.user.id);
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
 * Authenticates via the login form, then navigates directly to a target URL.
 *
 * Follows the same pattern as setup-wizard-fixtures.ts to prevent
 * `net::ERR_ABORTED` errors from intermediate navigation.
 */
export async function authenticateAndNavigate(
  page: Page,
  email: string,
  password: string,
  targetUrl: string,
): Promise<void> {
  await page.goto('/auth/login', { waitUntil: 'networkidle' });

  await page.locator('button[type="submit"]:has-text("Login")').waitFor({
    state: 'visible',
    timeout: 15_000,
  });

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);

  await Promise.all([
    page.waitForResponse(
      (resp) => resp.url().includes('/auth/v1/token') && resp.status() === 200,
    ),
    page.locator('button[type="submit"]').click(),
  ]);

  // Navigate directly to target URL (skips intermediate redirects)
  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
}
