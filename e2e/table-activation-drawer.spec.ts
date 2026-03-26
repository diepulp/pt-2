/**
 * E2E Tests: Table Activation Drawer (PRD-059)
 *
 * Validates the OPEN → ACTIVE custody gate workflow:
 * - AC-24: Predecessor close total display
 * - AC-25: Par bootstrap warning
 * - AC-26: Variance warning on amount mismatch
 * - AC-27: Note required when warnings shown
 * - AC-28: Dealer confirmation gate
 *
 * Prerequisites: Running dev server, Supabase, authenticated pit_boss session.
 *
 * @see PRD-059 OPEN Table Custody Gate — Pilot Lite
 * @see ADR-048 Open Table Custody Gate
 * @see components/table/activation-drawer.tsx
 */

import { test, expect, type Page } from '@playwright/test';

import { createServiceClient } from './fixtures/test-data';

// === Test Data Interfaces ===

interface ActivationTestScenario {
  casinoId: string;
  companyId: string;
  staffId: string;
  staffUserId: string;
  tableId: string;
  testEmail: string;
  testPassword: string;
  cleanup: () => Promise<void>;
}

// === Fixture Factory ===

/**
 * Creates a minimal test scenario for activation drawer testing.
 * Sets up: company, casino, staff (pit_boss), gaming table (active).
 * Does NOT create a session — the test opens the table via the UI.
 */
async function createActivationTestScenario(): Promise<ActivationTestScenario> {
  const supabase = createServiceClient();
  const timestamp = Date.now();
  const testPrefix = `e2e_act_${timestamp}`;

  // Create company
  const { data: company, error: companyError } = await supabase
    .from('company')
    .insert({ name: `${testPrefix}_company` })
    .select()
    .single();

  if (companyError || !company) {
    throw new Error(`Failed to create test company: ${companyError?.message}`);
  }

  // Create casino
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

  // Create auth user
  const testEmail = `${testPrefix}@test.com`;
  const testPassword = 'TestPassword123!';

  const { data: authData, error: authCreateError } =
    await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

  if (authCreateError || !authData.user) {
    throw new Error(
      `Failed to create test auth user: ${authCreateError?.message}`,
    );
  }

  // Create staff (pit_boss role — required for activation)
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .insert({
      casino_id: casino.id,
      user_id: authData.user.id,
      first_name: testPrefix,
      last_name: 'PitBoss',
      email: testEmail,
      role: 'pit_boss',
      status: 'active',
    })
    .select()
    .single();

  if (staffError || !staff) {
    throw new Error(`Failed to create test staff: ${staffError?.message}`);
  }

  // Create gaming table (active status so it shows on pit dashboard)
  const { data: table, error: tableError } = await supabase
    .from('gaming_table')
    .insert({
      casino_id: casino.id,
      label: `T-${timestamp % 1000}`,
      type: 'blackjack',
      status: 'active',
    })
    .select()
    .single();

  if (tableError || !table) {
    throw new Error(`Failed to create test table: ${tableError?.message}`);
  }

  const cleanup = async () => {
    // Delete in reverse dependency order
    await supabase
      .from('table_opening_attestation')
      .delete()
      .eq('casino_id', casino.id);
    await supabase.from('table_session').delete().eq('casino_id', casino.id);
    await supabase.from('gaming_table').delete().eq('id', table.id);
    await supabase.from('staff').delete().eq('id', staff.id);
    await supabase.from('casino').delete().eq('id', casino.id);
    await supabase.from('company').delete().eq('id', company.id);
    await supabase.auth.admin.deleteUser(authData.user.id);
  };

  return {
    casinoId: casino.id,
    companyId: company.id,
    staffId: staff.id,
    staffUserId: authData.user.id,
    tableId: table.id,
    testEmail,
    testPassword,
    cleanup,
  };
}

// === Helpers ===

/**
 * Authenticate user via browser login form
 */
async function authenticateUser(page: Page, scenario: ActivationTestScenario) {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', scenario.testEmail);
  await page.fill('input[name="password"]', scenario.testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(pit|dashboard)/, { timeout: 15000 });
}

// === Tests ===

test.describe('PRD-059: Table Activation Drawer', () => {
  let scenario: ActivationTestScenario;

  test.beforeAll(async () => {
    scenario = await createActivationTestScenario();
  });

  test.afterAll(async () => {
    await scenario.cleanup();
  });

  /**
   * AC-24: Predecessor close total display
   *
   * Navigate to pit dashboard → open table → activation drawer shows
   * predecessor close total from the previous session's closing snapshot.
   *
   * NOTE: This test requires a predecessor session with a closing snapshot.
   * Since creating that requires RPC calls, this test is marked fixme
   * until the full data pipeline can be seeded.
   */
  test.fixme('AC-24: drawer shows predecessor close total when predecessor exists', async ({
    page,
  }) => {
    await authenticateUser(page, scenario);
    await page.goto('/pit');
    await page.waitForLoadState('networkidle');

    // 1. Open a table session (creates OPEN status)
    // 2. Drawer auto-opens
    // 3. Verify "Predecessor Close" section is visible
    const drawer = page.locator('[data-slot="sheet-content"]');
    await expect(drawer).toBeVisible({ timeout: 10000 });

    // Verify predecessor section shows close total
    await expect(drawer.getByText('Predecessor Close')).toBeVisible();

    // Verify dollar amount is displayed
    await expect(drawer.locator('text=closing total')).toBeVisible();
  });

  /**
   * AC-25: Par bootstrap warning when no predecessor
   *
   * Open a table that has no previous session → drawer shows
   * amber "Par Bootstrap" warning banner.
   */
  test.fixme('AC-25: drawer shows par bootstrap warning when no predecessor', async ({
    page,
  }) => {
    await authenticateUser(page, scenario);
    await page.goto('/pit');
    await page.waitForLoadState('networkidle');

    // Open table (first session for this table — no predecessor)
    // The activation drawer should auto-open

    const drawer = page.locator('[data-slot="sheet-content"]');
    await expect(drawer).toBeVisible({ timeout: 10000 });

    // Verify par bootstrap warning is shown
    await expect(drawer.getByText('Par Bootstrap')).toBeVisible();

    // Verify the warning description
    await expect(
      drawer.getByText('No predecessor session found'),
    ).toBeVisible();

    // Verify "Predecessor Close" section is NOT shown
    await expect(drawer.getByText('Predecessor Close')).not.toBeVisible();
  });

  /**
   * AC-26: Variance warning when amounts differ
   *
   * When a predecessor exists and the user enters an opening total
   * that differs from the predecessor's closing total, a
   * "Variance Detected" warning appears.
   */
  test.fixme('AC-26: variance warning appears when opening total differs from predecessor', async ({
    page,
  }) => {
    await authenticateUser(page, scenario);
    await page.goto('/pit');
    await page.waitForLoadState('networkidle');

    const drawer = page.locator('[data-slot="sheet-content"]');
    await expect(drawer).toBeVisible({ timeout: 10000 });

    // Clear the pre-filled opening total and enter a different amount
    const openingInput = drawer.locator('#opening-total');
    await openingInput.clear();
    await openingInput.fill('999.99');

    // Verify variance warning appears
    await expect(drawer.getByText('Variance Detected')).toBeVisible();

    // Verify it mentions the discrepancy
    await expect(drawer.getByText(/differs from/)).toBeVisible();
  });

  /**
   * AC-27: Note required when warning banner is shown
   *
   * When any warning banner is displayed (bootstrap, variance,
   * or reconciliation), the note field shows a "Required" badge
   * and the activate button is disabled without a note.
   */
  test.fixme('AC-27: note field required when warning is shown, activate blocked without it', async ({
    page,
  }) => {
    await authenticateUser(page, scenario);
    await page.goto('/pit');
    await page.waitForLoadState('networkidle');

    const drawer = page.locator('[data-slot="sheet-content"]');
    await expect(drawer).toBeVisible({ timeout: 10000 });

    // For a bootstrap scenario (no predecessor), note should be required
    // Verify "Required" badge appears next to note label
    await expect(drawer.getByText('Required')).toBeVisible();

    // Enter opening total and check dealer confirmation
    const openingInput = drawer.locator('#opening-total');
    await openingInput.fill('500.00');

    const dealerCheckbox = drawer.locator('#dealer-confirmed');
    await dealerCheckbox.click();

    // Verify activate button is still disabled (no note)
    const activateButton = drawer.getByRole('button', {
      name: /Activate Table for Play/i,
    });
    await expect(activateButton).toBeDisabled();

    // Fill in the note
    const noteField = drawer.locator('#opening-note');
    await noteField.fill('Bootstrap opening — no predecessor session.');

    // Now activate button should be enabled
    await expect(activateButton).toBeEnabled();
  });

  /**
   * AC-28: Dealer confirmation gate
   *
   * The "Activate Table for Play" button remains disabled until
   * the dealer confirmation checkbox is checked.
   */
  test.fixme('AC-28: activate button disabled until dealer checkbox is checked', async ({
    page,
  }) => {
    await authenticateUser(page, scenario);
    await page.goto('/pit');
    await page.waitForLoadState('networkidle');

    const drawer = page.locator('[data-slot="sheet-content"]');
    await expect(drawer).toBeVisible({ timeout: 10000 });

    // Enter opening total
    const openingInput = drawer.locator('#opening-total');
    await openingInput.fill('1000.00');

    // Verify activate button is disabled (dealer not confirmed)
    const activateButton = drawer.getByRole('button', {
      name: /Activate Table for Play/i,
    });
    await expect(activateButton).toBeDisabled();

    // Verify dealer confirmation checkbox exists and is unchecked
    const dealerCheckbox = drawer.locator('#dealer-confirmed');
    await expect(dealerCheckbox).toBeVisible();
    await expect(dealerCheckbox).not.toBeChecked();

    // Check the dealer confirmation checkbox
    await dealerCheckbox.click();
    await expect(dealerCheckbox).toBeChecked();

    // For bootstrap scenario, also need a note
    const noteField = drawer.locator('#opening-note');
    await noteField.fill('Test activation note.');

    // Now button should be enabled
    await expect(activateButton).toBeEnabled();
  });
});
