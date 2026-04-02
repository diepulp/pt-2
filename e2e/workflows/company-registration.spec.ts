/**
 * PRD-060: Company Registration E2E Tests
 *
 * Tests the full registration → bootstrap → setup user journey.
 * Write-path mandate: rpc_register_company (INSERT), rpc_bootstrap_casino (UPDATE consumed).
 *
 * Test scenarios:
 *   S1: Happy path — register → bootstrap → setup (serial, Mode B)
 *   S2a: URL bypass — /bootstrap without registration (Mode B)
 *   S2b: URL bypass — /register with pending registration (Mode B)
 *   S3: Duplicate registration CONFLICT (Mode C — API level)
 *   S4: Required fields only — no legal name (Mode B)
 *
 * @see docs/21-exec-spec/EXEC-060-company-registration-bootstrap.md
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { authenticateAndNavigate } from '../fixtures/auth';
import {
  createRegistrationScenario,
  createRegistrationWithPendingScenario,
  createServiceClient,
  type RegistrationScenario,
} from '../fixtures/company-registration-fixtures';

// ============================================================================
// S1: Happy path — E2E — Mode B (browser login)
// ============================================================================

test.describe('S1: Registration happy path — E2E — Mode B (browser login)', () => {
  test.describe.configure({ mode: 'serial' });

  let scenario: RegistrationScenario;

  test.beforeAll(async () => {
    scenario = await createRegistrationScenario();
  });

  test.afterAll(async () => {
    await scenario.cleanup();
  });

  test('register company and bootstrap casino end-to-end', async ({
    page,
  }) => {
    // Sign in and navigate to /start — should redirect to /register (no staff, no registration)
    await authenticateAndNavigate(
      page,
      scenario.email,
      scenario.password,
      '/start',
    );
    await expect(page).toHaveURL(/\/register/);

    // Fill registration form
    await page.locator('#company_name').fill('Happy Path Casino Corp');
    await page
      .locator('#legal_name')
      .fill('Happy Path Casino Corporation LLC');
    await page.locator('button[type="submit"]').click();

    // Should redirect to /bootstrap after registration
    await page.waitForURL(/\/bootstrap/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/bootstrap/);

    // Fill bootstrap form (casino name, timezone, gaming day start)
    await page.locator('#casino_name').fill('Happy Path Casino');
    await page.locator('button[type="submit"]').click();

    // Should redirect to /start then /setup (new casino needs setup)
    await page.waitForURL(/\/(start|setup)/, { timeout: 15_000 });

    // Verify DB state via service-role client
    const supabase = createServiceClient();
    const { data: reg } = await supabase
      .from('onboarding_registration')
      .select('status, company_id')
      .eq('user_id', scenario.userId)
      .single();

    expect(reg?.status).toBe('consumed');

    // Verify company has correct name and legal_name
    if (reg?.company_id) {
      const { data: company } = await supabase
        .from('company')
        .select('name, legal_name')
        .eq('id', reg.company_id)
        .single();
      expect(company?.name).toBe('Happy Path Casino Corp');
      expect(company?.legal_name).toBe('Happy Path Casino Corporation LLC');
    }
  });
});

// ============================================================================
// S2a: URL bypass — bootstrap without registration
// ============================================================================

test.describe(
  'S2a: Bootstrap without registration — E2E — Mode B (browser login)',
  () => {
    let scenario: RegistrationScenario;

    test.beforeAll(async () => {
      scenario = await createRegistrationScenario();
    });

    test.afterAll(async () => {
      await scenario.cleanup();
    });

    test('redirects to /register when navigating directly to /bootstrap', async ({
      page,
    }) => {
      await authenticateAndNavigate(
        page,
        scenario.email,
        scenario.password,
        '/bootstrap',
      );
      await expect(page).toHaveURL(/\/register/);
    });
  },
);

// ============================================================================
// S2b: URL bypass — register with pending registration
// ============================================================================

test.describe(
  'S2b: Register with pending — E2E — Mode B (browser login)',
  () => {
    let scenario: Awaited<
      ReturnType<typeof createRegistrationWithPendingScenario>
    >;

    test.beforeAll(async () => {
      scenario = await createRegistrationWithPendingScenario();
    });

    test.afterAll(async () => {
      await scenario.cleanup();
    });

    test('redirects to /bootstrap when navigating to /register with pending registration', async ({
      page,
    }) => {
      await authenticateAndNavigate(
        page,
        scenario.email,
        scenario.password,
        '/register',
      );
      await expect(page).toHaveURL(/\/bootstrap/);
    });
  },
);

// ============================================================================
// S3: Duplicate registration CONFLICT — System Verification — Mode C
// ============================================================================

test.describe(
  'S3: Duplicate registration — System Verification — Mode C (authenticated client)',
  () => {
    let scenario: Awaited<
      ReturnType<typeof createRegistrationWithPendingScenario>
    >;

    test.beforeAll(async () => {
      scenario = await createRegistrationWithPendingScenario();
    });

    test.afterAll(async () => {
      await scenario.cleanup();
    });

    test('rpc_register_company returns unique_violation (23505) on duplicate', async () => {
      // Sign in to get fresh JWT
      const supabase = createServiceClient();
      const { data: signIn } = await supabase.auth.signInWithPassword({
        email: scenario.email,
        password: scenario.password,
      });

      expect(signIn.session).not.toBeNull();

      // Create authenticated client (Mode C)
      const supabaseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      const userClient = createClient(supabaseUrl, anonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${signIn.session!.access_token}`,
          },
        },
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Attempt second registration — should fail with unique_violation
      const { error } = await userClient.rpc('rpc_register_company', {
        p_company_name: 'Duplicate Attempt',
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23505');
    });
  },
);

// ============================================================================
// S4: Required fields only — E2E — Mode B (browser login)
// ============================================================================

test.describe(
  'S4: Required fields only — E2E — Mode B (browser login)',
  () => {
    let scenario: RegistrationScenario;

    test.beforeAll(async () => {
      scenario = await createRegistrationScenario();
    });

    test.afterAll(async () => {
      await scenario.cleanup();
    });

    test('register with company name only (no legal name) succeeds', async ({
      page,
    }) => {
      await authenticateAndNavigate(
        page,
        scenario.email,
        scenario.password,
        '/start',
      );
      await expect(page).toHaveURL(/\/register/);

      // Fill only company name — leave legal_name empty
      await page.locator('#company_name').fill('Minimal Corp');
      await page.locator('button[type="submit"]').click();

      // Should redirect to /bootstrap
      await page.waitForURL(/\/bootstrap/, { timeout: 10_000 });

      // Verify legal_name is null in DB
      const supabase = createServiceClient();
      const { data: reg } = await supabase
        .from('onboarding_registration')
        .select('company_id')
        .eq('user_id', scenario.userId)
        .eq('status', 'pending')
        .single();

      if (reg?.company_id) {
        const { data: company } = await supabase
          .from('company')
          .select('legal_name')
          .eq('id', reg.company_id)
          .single();
        expect(company?.legal_name).toBeNull();
      }
    });
  },
);
