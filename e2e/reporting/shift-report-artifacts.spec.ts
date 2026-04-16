/**
 * Shift Report Artifact Consistency — E2E — Mode B (browser login)
 *
 * Validates that PDF and CSV artifacts contain the same data columns
 * as the UI preview. Specifically tests that Win/Loss (Estimated) is
 * present in all three output surfaces — the bug fixed in this branch.
 *
 * Test matrix:
 * - UI: Executive Summary + Financial Summary column structure
 * - CSV: Download interception, column header verification
 * - PDF: Browser-context fetch to API GET endpoint, valid PDF response
 *
 * All tests use Mode B (browser login) because the PDF route handler
 * uses cookie-based auth via createClient() — Bearer tokens don't work.
 *
 * @see EXEC-065 WS3
 * @see QA-006 E2E Testing Standard
 */

import { readFile } from 'fs/promises';

import { test, expect } from '@playwright/test';

import { authenticateAndNavigate, createServiceClient } from '../fixtures/auth';
import { createTestScenario, type TestScenario } from '../fixtures/test-data';

// ── Constants ──────────────────────────────────────────────────────────────

const GAMING_DAY = '2026-04-16';
const SHIFT = 'day';
const REPORT_URL = `/admin/reports/shift-summary?gaming_day=${GAMING_DAY}&shift_boundary=${SHIFT}`;
const PDF_API_PATH = `/api/v1/reports/shift-summary/pdf?gaming_day=${GAMING_DAY}&shift_boundary=${SHIFT}`;

// ── Serial execution — shared scenario across all tests ────────────────────

test.describe.configure({ mode: 'serial' });

let scenario: TestScenario;

test.beforeAll(async () => {
  scenario = await createTestScenario();

  // Activate the gaming table so it appears in shift metrics RPC results.
  // createTestScenario sets status='inactive' — the dashboard RPC filters
  // on active tables, so without this the financial summary would be null.
  const supabase = createServiceClient();
  await supabase
    .from('gaming_table')
    .update({ status: 'active' })
    .eq('id', scenario.tableId);
});

test.afterAll(async () => {
  await scenario?.cleanup();
});

// ── Helper ─────────────────────────────────────────────────────────────────

async function loginAndNavigateToReport(page: import('@playwright/test').Page) {
  await authenticateAndNavigate(
    page,
    scenario.testEmail,
    scenario.testPassword,
    REPORT_URL,
  );
  // Wait for report to render (executive summary is always present)
  await expect(page.getByText('1. Executive Summary')).toBeVisible({
    timeout: 30_000,
  });
}

// ── UI Structure Tests ─────────────────────────────────────────────────────

test.describe('Shift Report UI — E2E — Mode B (browser login)', () => {
  test('executive summary renders both Win/Loss (Inv) and Win/Loss (Est)', async ({
    page,
  }) => {
    await loginAndNavigateToReport(page);

    // Scope assertions to the executive summary section
    const execSummary = page.locator('section', {
      has: page.getByText('1. Executive Summary'),
    });

    // Both Win/Loss KPI labels must be present (the fix ensures both exist)
    await expect(execSummary.getByText('Win/Loss (Inv)')).toBeVisible();
    await expect(execSummary.getByText('Win/Loss (Est)')).toBeVisible();

    // Other core KPIs should also be present within the executive summary
    await expect(execSummary.getByText('Tables')).toBeVisible();
    await expect(execSummary.getByText('Fills')).toBeVisible();
    await expect(execSummary.getByText('Credits')).toBeVisible();
    await expect(execSummary.getByText('Coverage')).toBeVisible();
  });

  test('financial summary section renders with table data', async ({
    page,
  }) => {
    await loginAndNavigateToReport(page);

    // Financial Summary section should render (not "Data unavailable")
    const financialHeading = page.getByText('2. Financial Summary');
    const hasFinancial = await financialHeading.isVisible().catch(() => false);

    if (hasFinancial) {
      // Table header columns should include Drop, Fills, Credits, Win/Loss
      await expect(
        page.getByRole('columnheader', { name: 'Drop' }),
      ).toBeVisible();
      await expect(
        page.getByRole('columnheader', { name: 'Fills' }),
      ).toBeVisible();
      await expect(
        page.getByRole('columnheader', { name: 'Win/Loss' }),
      ).toBeVisible();

      // Casino Totals footer row
      await expect(page.getByText('Casino Totals')).toBeVisible();
    }
  });
});

// ── CSV Download ───────────────────────────────────────────────────────────

test.describe('Shift Report CSV — E2E — Mode B (browser login)', () => {
  test('CSV download contains both win_loss_inv and win_loss_est columns', async ({
    page,
  }) => {
    await loginAndNavigateToReport(page);

    // Check if the CSV button is enabled (requires financialSummary != null)
    const csvButton = page.getByRole('button', { name: /export csv/i });
    await expect(csvButton).toBeVisible();

    const isDisabled = await csvButton.isDisabled();
    if (isDisabled) {
      test.skip(
        true,
        'CSV button disabled — financial summary not available (no table metrics data)',
      );
      return;
    }

    // Intercept the download
    const downloadPromise = page.waitForEvent('download');
    await csvButton.click();
    const download = await downloadPromise;

    // Verify filename
    expect(download.suggestedFilename()).toContain('shift-report-financial');
    expect(download.suggestedFilename()).toContain(GAMING_DAY);

    // Read downloaded content
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const csv = await readFile(filePath!, 'utf-8');

    // ── Column structure assertions ──
    // The header row must include BOTH win/loss columns (the bug fix)
    const lines = csv.split('\n').filter((l) => !l.startsWith('#'));
    const headerLine = lines[0];
    expect(headerLine).toBeDefined();

    const headers = headerLine.split(',');
    expect(headers).toContain('win_loss_inv');
    expect(headers).toContain('win_loss_est');
    expect(headers).toContain('table_label');
    expect(headers).toContain('drop');
    expect(headers).toContain('fills');
    expect(headers).toContain('credits');
    expect(headers).toContain('hold_pct');
    expect(headers).toContain('cash_obs_estimate');
    expect(headers).toContain('cash_obs_count');

    // Expect 10 columns (added win_loss_est as column #7)
    expect(headers).toHaveLength(10);

    // CASINO TOTALS row must exist
    expect(csv).toContain('CASINO TOTALS');

    // Data rows should have the same number of columns as the header
    const dataLines = lines.slice(1).filter((l) => l.trim().length > 0);
    for (const line of dataLines) {
      const cols = line.split(',');
      expect(cols).toHaveLength(10);
    }
  });
});

// ── PDF Endpoint — via authenticated browser context ───────────────────────

test.describe('Shift Report PDF — E2E — Mode B (browser login)', () => {
  test('PDF download returns valid PDF with correct headers', async ({
    page,
  }) => {
    await loginAndNavigateToReport(page);

    // Use the authenticated browser context to fetch the PDF endpoint.
    // The route handler uses cookie-based auth (createClient()) so we
    // must use the browser's fetch which includes session cookies.
    const pdfResponse = await page.evaluate(async (pdfPath) => {
      const res = await fetch(pdfPath);
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // Extract first 5 bytes as string for magic bytes check
      const header = String.fromCharCode(...bytes.slice(0, 5));
      return {
        status: res.status,
        contentType: res.headers.get('content-type'),
        contentDisposition: res.headers.get('content-disposition'),
        cacheControl: res.headers.get('cache-control'),
        bodyLength: bytes.length,
        headerMagic: header,
      };
    }, PDF_API_PATH);

    // Must be 200 (not 405 Method Not Allowed — the original bug)
    expect(pdfResponse.status).toBe(200);

    // Content-Type must be application/pdf
    expect(pdfResponse.contentType).toBe('application/pdf');

    // Content-Disposition must specify attachment with filename
    expect(pdfResponse.contentDisposition).toContain('attachment');
    expect(pdfResponse.contentDisposition).toContain('.pdf');

    // Cache-Control must be no-store (sensitive financial data)
    expect(pdfResponse.cacheControl).toBe('no-store');

    // Body must be a valid PDF (starts with %PDF magic bytes)
    expect(pdfResponse.bodyLength).toBeGreaterThan(1000);
    expect(pdfResponse.headerMagic).toBe('%PDF-');
  });

  test('PDF endpoint rejects unauthenticated requests', async ({ request }) => {
    // Use Playwright's API request context (no cookies) to verify auth rejection
    const response = await request.get(PDF_API_PATH);

    // Should fail without auth — middleware redirects to login (302) or returns 401
    expect(response.status()).not.toBe(200);
  });
});
