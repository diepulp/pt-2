/**
 * Admin E2E Test Helpers
 *
 * Extends shift-dashboard-helpers pattern for admin route tests.
 * Creates test scenarios with specific staff roles for role guard validation.
 *
 * @see e2e/fixtures/shift-dashboard-helpers.ts — Base fixture pattern
 */

import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface AdminTestScenario {
  casinoId: string;
  staffId: string;
  staffUserId: string;
  testEmail: string;
  testPassword: string;
  staffRole: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates a test scenario with a specific staff role.
 * Used for testing admin route access and role guard behavior.
 */
export async function createAdminTestScenario(
  role: 'admin' | 'pit_boss' | 'dealer' | 'cashier',
): Promise<AdminTestScenario> {
  const supabase = createServiceClient();
  const timestamp = Date.now();
  const testPrefix = `e2e_admin_${role}_${timestamp}`;

  // ADR-043: create company before casino (company_id NOT NULL)
  const { data: company, error: companyError } = await supabase
    .from('company')
    .insert({ name: `${testPrefix}_company` })
    .select()
    .single();

  if (companyError || !company) {
    throw new Error(`Failed to create test company: ${companyError?.message}`);
  }

  const { data: casino, error: casinoError } = await supabase
    .from('casino')
    .insert({
      name: `${testPrefix}_casino`,
      status: 'active',
      company_id: company.id,
    })
    .select()
    .single();

  if (casinoError || !casino) {
    throw new Error(`Failed to create test casino: ${casinoError?.message}`);
  }

  const testEmail = `${testPrefix}@test.com`;
  const testPassword = 'TestPassword123!';

  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      app_metadata: { casino_id: casino.id, staff_role: role },
    });

  if (authError || !authData.user) {
    throw new Error(`Failed to create auth user: ${authError?.message}`);
  }

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .insert({
      casino_id: casino.id,
      user_id: authData.user.id,
      first_name: 'Test',
      last_name: role,
      email: testEmail,
      role,
      status: 'active',
    })
    .select()
    .single();

  if (staffError || !staff) {
    throw new Error(`Failed to create staff: ${staffError?.message}`);
  }

  await supabase.auth.admin.updateUserById(authData.user.id, {
    app_metadata: {
      casino_id: casino.id,
      staff_id: staff.id,
      staff_role: role,
    },
  });

  const cleanup = async () => {
    const c = createServiceClient();
    await c.from('staff').delete().eq('id', staff.id);
    await c.from('casino').delete().eq('id', casino.id);
    await c.auth.admin.deleteUser(authData.user.id);
  };

  return {
    casinoId: casino.id,
    staffId: staff.id,
    staffUserId: authData.user.id,
    testEmail,
    testPassword,
    staffRole: role,
    cleanup,
  };
}

/**
 * Authenticates via login form (reuses shift-dashboard pattern).
 */
export async function authenticateAdmin(
  page: Page,
  email: string,
  password: string,
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
  await page.goto('/pit', { waitUntil: 'domcontentloaded', timeout: 15_000 });
  if (page.url().includes('/auth/login')) {
    throw new Error('Authentication failed: redirected back to login');
  }
}

export const ADMIN_URLS = {
  alerts: '/admin/alerts',
  reports: '/admin/reports',
  index: '/admin',
} as const;
