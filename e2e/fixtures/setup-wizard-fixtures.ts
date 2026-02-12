/**
 * Setup Wizard E2E Test Fixtures (PRD-030 WS5)
 *
 * Provides test data factories for setup wizard E2E tests.
 * Creates minimal casino + admin staff scenarios for wizard interaction.
 *
 * Key difference from other fixtures: Does NOT create gaming_tables,
 * game_settings, or players — the wizard itself creates those during tests.
 *
 * @see EXECUTION-SPEC-PRD-030.md WS5
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

/**
 * Creates a service role client for test data setup/teardown.
 * WARNING: Bypasses RLS — use only in tests.
 */
export function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface SetupWizardScenario {
  casinoId: string;
  staffId: string;
  staffUserId: string;
  testEmail: string;
  testPassword: string;
  authToken: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates a minimal casino scenario for setup wizard testing.
 *
 * @param options.setupStatus - Casino setup status ('not_started' | 'ready')
 * @param options.emptyTimezone - If true, sets timezone to '' to force wizard Step 0
 *   (Casino Basics). Otherwise, the database default 'America/Los_Angeles' is used
 *   and the wizard starts at Step 1 (Game Seed).
 */
export async function createSetupWizardScenario(
  options: {
    setupStatus?: string;
    emptyTimezone?: boolean;
  } = {},
): Promise<SetupWizardScenario> {
  const supabase = createServiceClient();
  const timestamp = Date.now();
  const testPrefix = `e2e_setup_${timestamp}`;
  const { setupStatus = 'not_started', emptyTimezone = false } = options;

  // 1. Create casino
  const { data: casino, error: casinoError } = await supabase
    .from('casino')
    .insert({ name: `${testPrefix}_casino`, status: 'active' })
    .select()
    .single();

  if (casinoError || !casino) {
    throw new Error(`Failed to create casino: ${casinoError?.message}`);
  }

  // 2. Create casino_settings
  //    Column defaults: timezone='America/Los_Angeles', gaming_day_start_time='06:00:00',
  //    table_bank_mode='INVENTORY_COUNT', setup_status='not_started'
  type CasinoSettingsInsert =
    Database['public']['Tables']['casino_settings']['Insert'];

  const settingsInsert: CasinoSettingsInsert = {
    casino_id: casino.id,
    setup_status: setupStatus,
    // Force Step 0 by clearing timezone (DB default is 'America/Los_Angeles').
    // computeInitialStep returns 0 when timezone is falsy.
    ...(emptyTimezone ? { timezone: '' } : {}),
    // For 'ready' status, add completion timestamps
    ...(setupStatus === 'ready'
      ? { setup_completed_at: new Date().toISOString() }
      : {}),
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
      last_name: 'SetupAdmin',
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

  // For 'ready' status, stamp setup_completed_by now that we have staff.id
  if (setupStatus === 'ready') {
    await supabase
      .from('casino_settings')
      .update({ setup_completed_by: staff.id })
      .eq('casino_id', casino.id);
  }

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

  // Cleanup: deletes all data in reverse dependency order
  const cleanup = async () => {
    const c = createServiceClient();
    // Delete wizard-created data first
    await c.from('game_settings').delete().eq('casino_id', casino.id);
    await c.from('gaming_table').delete().eq('casino_id', casino.id);
    // Delete fixture data
    await c.from('staff').delete().eq('id', staff.id);
    await c.from('casino_settings').delete().eq('casino_id', casino.id);
    await c.from('casino').delete().eq('id', casino.id);
    // Delete auth user
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
 * Unlike `authenticateViaLogin` (which navigates to /pit after auth),
 * this helper navigates to the caller's target URL. This prevents
 * `net::ERR_ABORTED` errors caused by navigating away from /pit while
 * its RSC stream is still in flight.
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

  // Navigate directly to target URL (skips /pit intermediate step)
  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
}
