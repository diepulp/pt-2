/**
 * Setup Wizard E2E Tests (PRD-030 WS5)
 *
 * Tests for the 5-step setup wizard at /setup:
 *   Step 0: Casino Basics (timezone, gaming day start, bank mode)
 *   Step 1: Game Settings (seed default games)
 *   Step 2: Create Tables (label, type, pit)
 *   Step 3: Par Targets (target bankroll per table)
 *   Step 4: Review & Complete (summary + complete setup)
 *
 * Scenarios:
 *   1. Full wizard flow — all 5 steps, bootstrap to dashboard
 *   2. Skip Setup flow — feature-flagged skip exits to dashboard
 *   3. Re-entry after completion — redirects to dashboard
 *   4. Mid-flow refresh — no duplicate data, correct step resume
 *
 * @see EXECUTION-SPEC-PRD-030.md WS5
 * @see e2e/fixtures/setup-wizard-fixtures.ts
 */

import { test, expect, type Page } from '@playwright/test';

import {
  authenticateAndNavigate,
  createServiceClient,
  createSetupWizardScenario,
  type SetupWizardScenario,
} from '../fixtures/setup-wizard-fixtures';

/** CardTitle renders as <div data-slot="card-title">, not a heading element. */
function stepTitle(page: Page, name: string) {
  return page.locator('[data-slot="card-title"]', { hasText: name });
}

/**
 * Select a timezone from the shadcn/Radix Select component.
 * Radix portals the dropdown content — click trigger then wait for option.
 *
 * Reliability approach:
 *  1. Wait for networkidle to ensure React hydration is complete.
 *  2. Click the trigger to open the dropdown.
 *  3. If option not visible, retry with keyboard (Space key).
 */
async function selectTimezone(page: Page, label: string) {
  const trigger = page.locator('#timezone');
  await trigger.waitFor({ state: 'visible', timeout: 10_000 });

  // Ensure React hydration is complete before interacting with Radix Select
  await page.waitForLoadState('networkidle');

  // Open the dropdown
  await trigger.click();

  const option = page.getByRole('option', { name: label });

  // Radix portals the listbox — may need a moment to render
  try {
    await option.waitFor({ state: 'visible', timeout: 3_000 });
  } catch {
    // Fallback: keyboard open if click only focused the trigger
    await trigger.focus();
    await trigger.press('Space');
    await option.waitFor({ state: 'visible', timeout: 5_000 });
  }

  await option.click();
}

// ── Scenario 1: Full wizard flow ────────────────────────────────────

test.describe('Setup Wizard — Full Flow', () => {
  test.describe.configure({ mode: 'serial' });

  let scenario: SetupWizardScenario;

  test.beforeAll(async () => {
    // emptyTimezone forces computeInitialStep → Step 0 (Casino Basics)
    scenario = await createSetupWizardScenario({ emptyTimezone: true });
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  test('full 5-step wizard: bootstrap to dashboard', async ({ page }) => {
    // 1. Authenticate and navigate to /start → redirects to /setup
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      '/start',
    );
    await page.waitForURL('**/setup', { timeout: 15_000 });

    // 2. Verify wizard heading and Step 0 (Casino Basics)
    await expect(page.getByText('Setup Your Casino')).toBeVisible({
      timeout: 15_000,
    });
    await expect(stepTitle(page, 'Casino Basics')).toBeVisible();

    // 3. Step 0: Select timezone (empty in fixture → Select shows placeholder)
    await selectTimezone(page, 'Los Angeles');

    // Bank mode is pre-selected (INVENTORY_COUNT from DB default)
    await expect(page.getByText('Inventory Count')).toBeVisible();

    // Click Next — saves casino settings, advances to Step 1
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // 4. Step 1: Game Settings — seed default games
    await expect(stepTitle(page, 'Game Settings')).toBeVisible({
      timeout: 15_000,
    });

    // Click Seed — server action seeds games and auto-advances to Step 2
    await page.getByRole('button', { name: 'Seed Default Games' }).click();

    // 5. Step 2: Create Tables (auto-advanced from seed)
    await expect(stepTitle(page, 'Create Tables')).toBeVisible({
      timeout: 15_000,
    });

    // Fill table label (one empty row exists by default, game type is 'blackjack')
    await page
      .getByPlaceholder('Table label (e.g. BJ-01)')
      .first()
      .fill('BJ-01');

    // Click Next — upserts table, advances to Step 3
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // 6. Step 3: Par Targets
    await expect(stepTitle(page, 'Target Bankroll (Par)')).toBeVisible({
      timeout: 15_000,
    });

    // Verify BJ-01 appears in par entry
    await expect(page.getByText('BJ-01')).toBeVisible();

    // Enter par target $5000 (dollar amount, converted to cents by action)
    await page.locator('input[type="number"]').fill('5000');

    // Click Next — saves par, advances to Step 4
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // 7. Step 4: Review & Complete
    await expect(stepTitle(page, 'Review & Complete')).toBeVisible({
      timeout: 15_000,
    });

    // Verify summary content
    await expect(page.getByText('BJ-01')).toBeVisible();
    await expect(page.getByText('Inventory Count')).toBeVisible();
    await expect(page.getByText(/games configured/)).toBeVisible();

    // 8. Complete Setup — calls rpc_complete_casino_setup, redirects to /start → /pit
    await page.getByRole('button', { name: 'Complete Setup' }).click();

    // 9. Verify redirect to /pit (dashboard)
    await page.waitForURL('**/pit', { timeout: 30_000 });
  });
});

// ── Scenario 2: Skip Setup flow ─────────────────────────────────────

test.describe('Setup Wizard — Skip Flow', () => {
  test.describe.configure({ mode: 'serial' });

  let scenario: SetupWizardScenario;

  test.beforeAll(async () => {
    scenario = await createSetupWizardScenario();
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  test('skip setup exits to dashboard', async ({ page }) => {
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      '/setup',
    );

    // Ensure wizard is rendered
    await expect(page.getByText('Setup Your Casino')).toBeVisible({
      timeout: 15_000,
    });

    // Skip button is feature-flagged (NEXT_PUBLIC_ENABLE_SKIP_SETUP=true)
    const skipVisible = await page
      .getByRole('button', { name: /Skip Setup/ })
      .isVisible();

    test.skip(!skipVisible, 'NEXT_PUBLIC_ENABLE_SKIP_SETUP not enabled');

    // Click Skip Setup — calls completeSetupAction({ skip: true })
    await page.getByRole('button', { name: /Skip Setup/ }).click();

    // Verify redirect to dashboard
    await page.waitForURL('**/pit', { timeout: 30_000 });

    // Dashboard should render without crash
    await expect(page.locator('body')).toBeVisible();
  });
});

// ── Scenario 3: Re-entry after completion ───────────────────────────

test.describe('Setup Wizard — Re-entry Redirect', () => {
  test.describe.configure({ mode: 'serial' });

  let scenario: SetupWizardScenario;

  test.beforeAll(async () => {
    // Casino with setup_status='ready' — wizard should redirect away
    scenario = await createSetupWizardScenario({ setupStatus: 'ready' });
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  test('completed casino redirects from /setup to dashboard', async ({
    page,
  }) => {
    // Authenticate and navigate to /setup — page.tsx detects setup_status='ready'
    // and redirects to /start → /pit
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      '/setup',
    );
    await page.waitForURL('**/pit', { timeout: 30_000 });

    // Should NOT see the wizard
    await expect(page.getByText('Setup Your Casino')).not.toBeVisible();
  });

  test('completed casino redirects from /start to dashboard', async ({
    page,
  }) => {
    // Authenticate and navigate to /start — gateway detects setup_status='ready' → /pit
    // The /start server component does 3 Supabase queries before redirecting
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      '/start',
    );
    await page.waitForURL('**/pit', { timeout: 30_000 });
  });
});

// ── Scenario 4: Mid-flow refresh ────────────────────────────────────

test.describe('Setup Wizard — Mid-Flow Refresh', () => {
  test.describe.configure({ mode: 'serial' });

  let scenario: SetupWizardScenario;

  test.beforeAll(async () => {
    scenario = await createSetupWizardScenario({ emptyTimezone: true });
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  test('refresh mid-wizard resumes at correct step without duplicates', async ({
    page,
  }) => {
    // 1. Authenticate and navigate to wizard
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      '/setup',
    );
    await expect(page.getByText('Setup Your Casino')).toBeVisible({
      timeout: 15_000,
    });

    // 2. Complete Step 0: Casino Basics
    await expect(stepTitle(page, 'Casino Basics')).toBeVisible();
    await selectTimezone(page, 'Los Angeles');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // 3. Complete Step 1: Seed Games (auto-advances)
    await expect(stepTitle(page, 'Game Settings')).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Seed Default Games' }).click();

    // 4. Complete Step 2: Create table BJ-01
    await expect(stepTitle(page, 'Create Tables')).toBeVisible({
      timeout: 15_000,
    });
    await page
      .getByPlaceholder('Table label (e.g. BJ-01)')
      .first()
      .fill('BJ-01');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Wait for Step 3 to confirm table was saved
    await expect(stepTitle(page, 'Target Bankroll (Par)')).toBeVisible({
      timeout: 15_000,
    });

    // 5. Refresh the page (F5)
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 6. Verify wizard resumes at correct step
    //    State: timezone set, bank_mode set, games seeded, 1 table exists
    //    computeInitialStep → 3 (Par Targets)
    await expect(page.getByText('Setup Your Casino')).toBeVisible({
      timeout: 15_000,
    });
    await expect(stepTitle(page, 'Target Bankroll (Par)')).toBeVisible({
      timeout: 15_000,
    });

    // 7. Verify BJ-01 loaded from server (existing data, not duplicated)
    await expect(page.getByText('BJ-01')).toBeVisible();

    // 8. Verify no duplicate gaming_table rows in the database
    const supabase = createServiceClient();
    const { data: tables } = await supabase
      .from('gaming_table')
      .select('id, label')
      .eq('casino_id', scenario.casinoId);
    expect(tables).toHaveLength(1);
    expect(tables![0].label).toBe('BJ-01');

    // 9. Complete remaining steps: par targets → review → complete
    await page.locator('input[type="number"]').fill('5000');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    await expect(stepTitle(page, 'Review & Complete')).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Complete Setup' }).click();

    // 10. Verify redirect to /pit
    await page.waitForURL('**/pit', { timeout: 30_000 });
  });
});
