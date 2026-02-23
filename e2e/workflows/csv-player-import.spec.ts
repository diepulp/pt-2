/**
 * CSV Player Import E2E Tests (PRD-037 WS7)
 *
 * Tests for the 6-step import wizard at /player-import:
 *   Step 1: File Selection (drag-drop/file picker, parse CSV)
 *   Step 2: Column Mapping (auto-detect + manual override)
 *   Step 3: Preview (summary, sample rows, warnings)
 *   Step 4: Staging Upload (chunked upload with progress)
 *   Step 5: Execute (merge via RPC)
 *   Step 6: Report (outcome summary, row details, CSV download)
 *
 * Scenarios:
 *   1. Happy Path — upload, auto-map, preview, stage, execute, report (5 created)
 *   2. Alias Detection — non-standard headers auto-detected via alias dictionary
 *   3. Validation Warnings — rows missing identifiers shown in preview
 *
 * @see EXEC-037 WS7
 * @see e2e/fixtures/import-test-data.ts
 */

import path from 'path';

import { test, expect, type Page } from '@playwright/test';

import {
  authenticateAndNavigate,
  createImportTestScenario,
  type ImportTestScenario,
} from '../fixtures/import-test-data';

const SAMPLE_CSV_DIR = path.resolve(__dirname, '../fixtures/sample-csvs');

/** CardTitle renders as <div data-slot="card-title"> in shadcn/ui */
function cardTitle(page: Page, name: string) {
  return page.locator('[data-slot="card-title"]', { hasText: name });
}

// ── Scenario 1: Happy Path ──────────────────────────────────────────

test.describe('CSV Player Import — Happy Path', () => {
  test.describe.configure({ mode: 'serial' });

  let scenario: ImportTestScenario;

  test.beforeAll(async () => {
    scenario = await createImportTestScenario();
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  test('full wizard flow: upload → map → preview → stage → execute → report', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // 1. Authenticate and navigate to import page
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      '/player-import',
    );

    // Verify page heading
    await expect(
      page.getByRole('heading', { name: 'Import Players' }),
    ).toBeVisible({ timeout: 15_000 });

    // ── Step 1: File Selection ──
    await expect(cardTitle(page, 'Select CSV File')).toBeVisible();

    // Upload valid-players.csv via hidden file input
    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(SAMPLE_CSV_DIR, 'valid-players.csv'));

    // Wait for parsing to complete
    await expect(page.getByText('5 rows detected')).toBeVisible({
      timeout: 10_000,
    });

    // Advance to column mapping
    await page.getByRole('button', { name: 'Continue to Mapping' }).click();

    // ── Step 2: Column Mapping ──
    await expect(cardTitle(page, 'Map Columns')).toBeVisible({
      timeout: 10_000,
    });

    // All 5 standard headers should auto-detect
    await expect(page.getByText('5 auto-detected')).toBeVisible();

    // Advance to preview
    await page.getByRole('button', { name: 'Continue to Preview' }).click();

    // ── Step 3: Preview ──
    await expect(cardTitle(page, 'Preview Import')).toBeVisible({
      timeout: 10_000,
    });

    // Verify summary badges
    await expect(page.getByText('5 rows')).toBeVisible();
    await expect(page.getByText('5 mapped fields')).toBeVisible();

    // No warning badges for fully valid data
    await expect(page.getByText('rows missing identifiers')).not.toBeVisible();

    // Begin upload → creates batch + stages rows
    await page.getByRole('button', { name: 'Begin Upload' }).click();

    // ── Step 4: Staging Upload ──
    await expect(cardTitle(page, 'Uploading Rows')).toBeVisible({
      timeout: 10_000,
    });

    // Wait for all rows staged (5 rows = 1 chunk, should be fast)
    await expect(page.getByText('All rows staged successfully.')).toBeVisible({
      timeout: 30_000,
    });

    // Advance to execute
    await page.getByRole('button', { name: 'Continue to Execute' }).click();

    // ── Step 5: Execute ──
    await expect(cardTitle(page, 'Execute Import')).toBeVisible({
      timeout: 10_000,
    });

    // Verify description mentions row count
    await expect(page.getByText(/merge 5 staged rows/)).toBeVisible();

    // Execute the import
    await page.getByRole('button', { name: 'Execute Import' }).click();

    // ── Step 6: Report ──
    // Report loads after execute completes (RPC + batch detail fetch)
    await expect(cardTitle(page, 'Import Results')).toBeVisible({
      timeout: 60_000,
    });

    // Verify "Created" stat shows 5 (all new players in fresh casino)
    const createdStat = page
      .locator('.text-center')
      .filter({ hasText: 'Created' });
    await expect(createdStat).toContainText('5');

    // Verify row details table loaded
    await expect(cardTitle(page, 'Row Details')).toBeVisible();

    // Verify "Created" badges appear in the row detail table
    await expect(
      page.locator('table').getByText('Created').first(),
    ).toBeVisible();

    // Verify "Start New Import" button is available
    await expect(
      page.getByRole('button', { name: 'Start New Import' }),
    ).toBeVisible();
  });
});

// ── Scenario 2: Alias Detection (non-standard headers) ─────────────

test.describe('CSV Player Import — Alias Detection', () => {
  test.describe.configure({ mode: 'serial' });

  let scenario: ImportTestScenario;

  test.beforeAll(async () => {
    scenario = await createImportTestScenario();
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  test('non-standard headers auto-detected via alias dictionary', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      '/player-import',
    );

    await expect(cardTitle(page, 'Select CSV File')).toBeVisible({
      timeout: 15_000,
    });

    // Upload file with non-standard headers (e-mail, Phone Number, fname, lname, Date of Birth)
    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(SAMPLE_CSV_DIR, 'unknown-headers.csv'));

    await expect(page.getByText('5 rows detected')).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'Continue to Mapping' }).click();

    // ── Column Mapping: all 5 alias headers should auto-detect ──
    await expect(cardTitle(page, 'Map Columns')).toBeVisible({
      timeout: 10_000,
    });

    // Alias dictionary maps: e-mail→email, Phone Number→phone,
    // fname→first_name, lname→last_name, Date of Birth→dob
    await expect(page.getByText('5 auto-detected')).toBeVisible();

    // Mapping is valid (identifier mapped) — button should be enabled
    const continueBtn = page.getByRole('button', {
      name: 'Continue to Preview',
    });
    await expect(continueBtn).toBeEnabled();

    // Complete remaining flow
    await continueBtn.click();

    await expect(cardTitle(page, 'Preview Import')).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Begin Upload' }).click();

    await expect(page.getByText('All rows staged successfully.')).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Continue to Execute' }).click();

    await expect(cardTitle(page, 'Execute Import')).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Execute Import' }).click();

    // Verify report shows all 5 created
    await expect(cardTitle(page, 'Import Results')).toBeVisible({
      timeout: 60_000,
    });

    const createdStat = page
      .locator('.text-center')
      .filter({ hasText: 'Created' });
    await expect(createdStat).toContainText('5');
  });
});

// ── Scenario 3: Validation Warnings ─────────────────────────────────

test.describe('CSV Player Import — Validation Warnings', () => {
  test.describe.configure({ mode: 'serial' });

  let scenario: ImportTestScenario;

  test.beforeAll(async () => {
    scenario = await createImportTestScenario();
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  test('rows missing identifiers shown with warnings in preview', async ({
    page,
  }) => {
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      '/player-import',
    );

    await expect(cardTitle(page, 'Select CSV File')).toBeVisible({
      timeout: 15_000,
    });

    // Upload file with 3 valid + 2 rows missing both email and phone
    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(SAMPLE_CSV_DIR, 'missing-identifiers.csv'));

    await expect(page.getByText('5 rows detected')).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'Continue to Mapping' }).click();

    // Column mapping: 4 standard headers auto-detected (no dob column)
    await expect(cardTitle(page, 'Map Columns')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('4 auto-detected')).toBeVisible();

    await page.getByRole('button', { name: 'Continue to Preview' }).click();

    // ── Preview: verify warning for 2 rows missing identifiers ──
    await expect(cardTitle(page, 'Preview Import')).toBeVisible({
      timeout: 10_000,
    });

    // Destructive badge showing count of rows without identifiers
    await expect(page.getByText('2 rows missing identifiers')).toBeVisible();

    // Warning text about rejection during execution
    await expect(
      page.getByText(/2 rows missing both email and phone will be rejected/),
    ).toBeVisible();

    // Verify the preview table is visible with sample rows
    await expect(page.locator('table')).toBeVisible();
  });
});
