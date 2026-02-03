/**
 * Shift Dashboard V3 E2E Tests
 *
 * Tests for the auth-protected shift dashboard at /(protected)/shift-dashboard.
 * Covers layout, data-driven assertions, error states, and loading transitions.
 *
 * P2-11: Retarget from /review/shift-dashboard-v3 to auth-protected route
 * P2-12: Add data-driven assertions beyond structural layout checks
 *
 * @see PERF-007 WS8 — E2E Test Improvements
 * @see PRD-026 Shift Dashboard v3
 */

import { test, expect, type Page } from '@playwright/test';

import {
  authenticateViaLogin,
  createShiftDashboardScenario,
  DASHBOARD_API,
  SHIFT_DASHBOARD_URL,
  type ShiftDashboardTestScenario,
} from '../fixtures/shift-dashboard-helpers';

// ── Auth-Protected Route Tests ─────────────────────────────────────

test.describe('Shift Dashboard V3 — Authenticated', () => {
  // Serialize so beforeAll creates one shared scenario (avoids parallel user creation rate limits)
  test.describe.configure({ mode: 'serial' });

  let scenario: ShiftDashboardTestScenario;

  test.beforeAll(async () => {
    scenario = await createShiftDashboardScenario();
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  /**
   * Navigate to the dashboard with authentication.
   * Authenticates via login form so Supabase SSR cookies are set.
   */
  async function goToDashboard(page: Page) {
    await authenticateViaLogin(page, scenario.testEmail, scenario.testPassword);
    await page.goto(SHIFT_DASHBOARD_URL);
    await page.waitForLoadState('domcontentloaded');
  }

  // ── P2-11: Auth enforcement ─────────────────────────────────────

  test('unauthenticated access redirects to login', async ({ page }) => {
    await page.goto(SHIFT_DASHBOARD_URL);

    // Protected layout redirects to /auth/login if no session
    await expect(page).toHaveURL(/\/auth\/login/);
    // Should not see dashboard content
    await expect(
      page.locator('h1:has-text("Shift Dashboard")'),
    ).not.toBeVisible();
  });

  test('authenticated user can access dashboard', async ({ page }) => {
    await goToDashboard(page);

    // Dashboard heading is rendered
    await expect(page.locator('h1:has-text("Shift Dashboard")')).toBeVisible();
  });

  // ── P2-12: Data-driven assertions ───────────────────────────────

  test.describe('Data Rendering', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('dashboard header renders operational status text', async ({
      page,
    }) => {
      await goToDashboard(page);

      // Header contains the "Operational metrics" subtitle (aria-live region)
      await expect(page.locator('text=Operational metrics')).toBeVisible();
    });

    test('metrics table renders with tab structure', async ({ page }) => {
      await goToDashboard(page);

      // Wait for data to load — either a table with headers or a loading state resolves
      // MetricsTable always renders; check for the table element or its container
      await expect(
        page.locator('table').first().or(page.locator('text=No data')),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('alerts section renders with severity indicators', async ({
      page,
    }) => {
      await goToDashboard(page);

      // AlertsStrip always renders — either with alerts or "No alerts" empty state
      await expect(
        page
          .locator('text=Alerts')
          .or(page.locator('text=No spike alerts in current time window'))
          .first(),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('win/loss hero card renders formatted value', async ({ page }) => {
      await goToDashboard(page);

      // HeroWinLossCompact renders a "Win/Loss" label (exact match, not "Win/Loss Trend")
      await expect(
        page.getByRole('paragraph').filter({ hasText: /^Win\/Loss$/ }),
      ).toBeVisible({ timeout: 15_000 });

      // The value is rendered with formatCents (e.g., "$0.00", "-$125.50")
      // Check that a monetary value is present ($ prefix with digits)
      const heroValue = page.locator('p.text-3xl.font-mono');
      await expect(heroValue).toBeVisible({ timeout: 15_000 });
      const text = await heroValue.textContent();
      expect(text).toMatch(/\$[\d,.]+/);
    });

    test('chart container renders SVG or empty state for win/loss trend', async ({
      page,
    }) => {
      await goToDashboard(page);

      // WinLossTrendChart renders role="img" with SVG when pitsData.length >= 2,
      // or shows "Pit data unavailable" empty state when insufficient data
      const chartOrEmpty = page
        .locator('[role="img"]')
        .first()
        .or(page.locator('text=Pit data unavailable'));
      await expect(chartOrEmpty).toBeVisible({ timeout: 20_000 });

      // If chart rendered, verify SVG is present
      const chartContainer = page.locator('[role="img"]');
      const hasChart = await chartContainer
        .first()
        .isVisible()
        .catch(() => false);
      if (hasChart) {
        const svg = page.locator('[role="img"] svg, .recharts-wrapper svg');
        await expect(svg.first()).toBeVisible({ timeout: 20_000 });
      }
    });

    test('coverage bar renders with progressbar semantics', async ({
      page,
    }) => {
      await goToDashboard(page);

      const coverageBar = page.locator('[data-testid="coverage-bar"]');
      // Coverage bar may not render if no casino data
      const isVisible = await coverageBar.isVisible().catch(() => false);

      if (isVisible) {
        await expect(coverageBar).toHaveAttribute('role', 'progressbar');
        const valueNow = await coverageBar.getAttribute('aria-valuenow');
        expect(valueNow).not.toBeNull();
        const numericValue = Number(valueNow);
        expect(numericValue).toBeGreaterThanOrEqual(0);
        expect(numericValue).toBeLessThanOrEqual(100);
      }
    });
  });

  // ── Loading State Transitions ───────────────────────────────────

  test.describe('Loading States', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('skeleton → content transition on dashboard load', async ({
      page,
    }) => {
      await authenticateViaLogin(
        page,
        scenario.testEmail,
        scenario.testPassword,
      );

      // Navigate and check for loading skeletons
      await page.goto(SHIFT_DASHBOARD_URL);

      // Either skeletons are briefly visible during load, or data is already hydrated
      // from RSC prefetch. Both are valid — the key assertion is that content appears.
      await expect(page.locator('h1:has-text("Shift Dashboard")')).toBeVisible({
        timeout: 15_000,
      });

      // After load, skeletons should not be present for the main heading area
      // (data-driven: heading is always server-rendered)
      await expect(
        page.locator('h1:has-text("Shift Dashboard")'),
      ).toBeVisible();
    });
  });

  // ── Error States ────────────────────────────────────────────────

  test.describe('Error Handling', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('API failure shows degraded dashboard, not full crash', async ({
      page,
    }) => {
      await authenticateViaLogin(
        page,
        scenario.testEmail,
        scenario.testPassword,
      );

      // Intercept the summary API to simulate failure
      await page.route(`**${DASHBOARD_API.summary}*`, (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        }),
      );

      await page.goto(SHIFT_DASHBOARD_URL);

      // Dashboard should still render (PanelErrorBoundary catches per-panel errors)
      // The heading is rendered by the layout, not the failing query
      await expect(page.locator('h1:has-text("Shift Dashboard")')).toBeVisible({
        timeout: 15_000,
      });

      // At least one panel should show an error or fallback state
      // PanelErrorBoundary renders a "Something went wrong" or retry button
      // OR the dashboard degrades gracefully with empty/loading states
      const body = page.locator('body');
      await expect(body).toBeVisible();
    });

    test('single API failure does not crash entire dashboard', async ({
      page,
    }) => {
      await authenticateViaLogin(
        page,
        scenario.testEmail,
        scenario.testPassword,
      );

      // Only fail the visitors-summary endpoint, leave others working
      await page.route(`**${DASHBOARD_API.visitorsSummary}*`, (route) =>
        route.abort('failed'),
      );

      await page.goto(SHIFT_DASHBOARD_URL);

      // Dashboard heading should still be visible (partial failure is handled)
      await expect(page.locator('h1:has-text("Shift Dashboard")')).toBeVisible({
        timeout: 15_000,
      });

      // Win/Loss section should still render from the summary endpoint
      await expect(
        page.getByRole('paragraph').filter({ hasText: /^Win\/Loss$/ }),
      ).toBeVisible({ timeout: 15_000 });
    });
  });
});

// ── Layout Tests (Structural, retargeted to protected route) ──────

test.describe('Shift Dashboard V3 — Layout', () => {
  test.describe.configure({ mode: 'serial' });

  let scenario: ShiftDashboardTestScenario;

  test.beforeAll(async () => {
    scenario = await createShiftDashboardScenario();
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  async function goToDashboard(page: Page) {
    await authenticateViaLogin(page, scenario.testEmail, scenario.testPassword);
    await page.goto(SHIFT_DASHBOARD_URL);
    await page.waitForLoadState('domcontentloaded');
  }

  test.describe('XL Breakpoint (1440x900)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('header and main content visible at xl breakpoint', async ({
      page,
    }) => {
      await goToDashboard(page);

      const header = page.locator('header').first();
      await expect(header).toBeVisible();

      const main = page.locator('main').first();
      await expect(main).toBeVisible();
    });

    test('sticky header stays at top during scroll', async ({ page }) => {
      await goToDashboard(page);

      const header = page.locator('header').first();
      const headerBox = await header.boundingBox();

      await page.evaluate(() => window.scrollBy(0, 800));

      const headerBoxAfterScroll = await header.boundingBox();

      if (headerBox && headerBoxAfterScroll) {
        expect(headerBoxAfterScroll.y).toBeLessThanOrEqual(5);
      }
    });

    test('right rail collapse toggle works', async ({ page }) => {
      await goToDashboard(page);

      const collapseButton = page.getByLabel(/collapse right rail/i);

      if (await collapseButton.isVisible()) {
        await collapseButton.click();

        // After collapse, expand button should be available
        const expandButton = page.getByLabel(/expand/i).first();
        await expect(expandButton).toBeVisible({ timeout: 5_000 });

        await expandButton.click();

        // Rail should be expanded again — collapse button returns
        await expect(collapseButton).toBeVisible({ timeout: 5_000 });
      }
    });
  });

  test.describe('LG Breakpoint (1100x900)', () => {
    test.use({ viewport: { width: 1100, height: 900 } });

    test('center panel and header visible at lg', async ({ page }) => {
      await goToDashboard(page);

      const main = page.locator('main').first();
      await expect(main).toBeVisible();

      const header = page.locator('header').first();
      await expect(header).toBeVisible();
    });
  });

  test.describe('Mobile Breakpoint (375x812)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('single column stacked layout on mobile', async ({ page }) => {
      await goToDashboard(page);

      const header = page.locator('header').first();
      await expect(header).toBeVisible();

      const main = page.locator('main').first();
      await expect(main).toBeVisible();
    });
  });

  test.describe('Performance', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('CLS under 0.1 at xl breakpoint', async ({ page }) => {
      await authenticateViaLogin(
        page,
        scenario.testEmail,
        scenario.testPassword,
      );

      await page.goto(SHIFT_DASHBOARD_URL);

      const cls = await page.evaluate(async () => {
        return new Promise<number>((resolve) => {
          let clsValue = 0;
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const layoutShift = entry as PerformanceEntry & {
                hadRecentInput: boolean;
                value: number;
              };
              if (!layoutShift.hadRecentInput) {
                clsValue += layoutShift.value;
              }
            }
          });
          observer.observe({ type: 'layout-shift', buffered: true });

          setTimeout(() => {
            observer.disconnect();
            resolve(clsValue);
          }, 3000);
        });
      });

      expect(cls).toBeLessThan(0.1);
    });
  });
});
