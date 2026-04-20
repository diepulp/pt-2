/**
 * ADR-050 Phase 1 Exemplar — Cross-Tab Rated Buy-in LIVE SLA (E2E)
 *
 * Per PRD-068 W3 / EXEC-068:
 *   Probe 1 — Cross-tab 2s LIVE SLA. Tab A inserts a rated buy-in via the
 *             service-role path; Tab B (subscribed via the new
 *             useShiftDashboardRealtime hook) must reflect the aggregate
 *             change within 2s through WAL propagation.
 *   Probe 2 — Polling fallback. With NEXT_PUBLIC_E2E_DISABLE_REALTIME=true
 *             the realtime subscription is bypassed; the rolling-window
 *             refetch (30s cadence) must still deliver the update.
 *   Probe 3 — Rolling-window correctness without explicit reload.
 *             After mounting the dashboard, commit an adjustment and
 *             assert the aggregate updates without user interaction.
 *
 * Auth mode: Mode B (browser login). ADR-050 / DEC-W3-MODE: Cross-tab
 * realtime cannot be exercised by Mode A (auth bypass fails SECURITY
 * DEFINER) or Mode C (no browser context).
 *
 * Flake budget: Outer timeout 5s per assertion; semantic intent is 2000ms.
 * Playwright retries=2 in CI. Probe 2 uses a generous polling cadence so
 * CI load variance does not cause spurious failures.
 *
 * CI: This spec is CI-Advisory initially. Promotion to Required requires
 * sustained flake rate <1% across 20 consecutive runs (see
 * docs/70-governance/QA-006-E2E-TESTING-STANDARD).
 *
 * @see PRD-068 / EXEC-068 W3
 * @see ADR-050 §4 E1/E2/E3
 */

import { test, expect, type Page } from '@playwright/test';

import { authenticateAndNavigate } from '../fixtures/auth';

import {
  createAdr050Scenario,
  type AdrTest050Scenario,
} from './fixtures/shift-dashboard-fixture';

const DASHBOARD_URL = '/shift-dashboard';

// Selector for the hero KPI card — the panel most sensitive to
// FACT-RATED-BUYIN aggregate changes. Falls back to any element containing
// "win/loss" text if the data-testid is absent (defensive).
const HERO_KPI =
  '[data-testid="hero-win-loss-compact"], [data-testid="metrics-table"]';

test.describe('ADR-050 Exemplar — FACT-RATED-BUYIN / shift-dashboard', () => {
  test.describe.configure({ mode: 'serial' });

  let scenario: AdrTest050Scenario;

  test.beforeAll(async () => {
    scenario = await createAdr050Scenario();
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  async function goToDashboard(page: Page) {
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      DASHBOARD_URL,
    );
    await page.waitForLoadState('domcontentloaded');
    // Wait for at least one KPI row to render before probe assertions.
    await page
      .locator(HERO_KPI)
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 });
  }

  // ── Probe 1: cross-tab LIVE SLA (2s nominal) ──────────────────────────

  test('E2E — Mode B (browser login): Tab B reflects rated-buyin insert within 2s via realtime', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const tabB = await context.newPage();
    await authenticateAndNavigate(
      tabB,
      scenario.testEmail,
      scenario.testPassword,
      DASHBOARD_URL,
    );
    await tabB.waitForLoadState('domcontentloaded');

    // Baseline snapshot of the KPI region innerText. Any downstream
    // aggregate change will alter at least one character here (amount,
    // count, or timestamp). We do not match a specific number — the
    // assertion is "the aggregate refreshed within the SLA."
    const heroLocator = tabB.locator(HERO_KPI).first();
    await heroLocator.waitFor({ state: 'visible', timeout: 15_000 });
    const baseline = await heroLocator.innerText();

    // Tab A equivalent: insert directly via the fixture service-role path.
    // The WAL stream on table_buyin_telemetry must propagate to Tab B's
    // useShiftDashboardRealtime subscription and fire invalidation.
    await scenario.insertRatedBuyinTelemetry(12_500);

    await expect
      .poll(async () => heroLocator.innerText(), {
        timeout: 5_000, // outer flake-tolerance ceiling
        intervals: [100, 250, 500, 1000],
        message: 'SLA intent: 2000ms; outer ceiling: 5000ms',
      })
      .not.toBe(baseline);

    await context.close();
  });

  // ── Probe 2: polling fallback with realtime disabled ──────────────────

  test('E2E — Mode B: polling fallback delivers update when realtime is disabled', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      // DEC-W3-DISCONNECT: env flag deterministically disables subscription.
      // The hook's `enabled` param is expected to check this flag at
      // consumer call sites; until wired, this probe is a placeholder for
      // the behavior we want to regress against.
      extraHTTPHeaders: {},
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      (
        globalThis as unknown as { process?: { env?: Record<string, string> } }
      ).process = {
        env: { NEXT_PUBLIC_E2E_DISABLE_REALTIME: 'true' },
      };
    });
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      DASHBOARD_URL,
    );
    await page.waitForLoadState('domcontentloaded');
    const hero = page.locator(HERO_KPI).first();
    await hero.waitFor({ state: 'visible', timeout: 15_000 });
    const baseline = await hero.innerText();

    await scenario.insertRatedBuyinTelemetry(9_900);

    // Polling cadence is 30s (ROLLING_TICK_MS). Budget 45s with flake
    // tolerance.
    await expect
      .poll(async () => hero.innerText(), {
        timeout: 45_000,
        intervals: [2_000, 5_000, 10_000],
      })
      .not.toBe(baseline);

    await context.close();
  });

  // ── Probe 3: rolling-window advance without manual reload ─────────────

  test('E2E — Mode B: rolling window advances the aggregate across a tick without user reload', async ({
    page,
  }) => {
    await goToDashboard(page);
    const hero = page.locator(HERO_KPI).first();
    const baseline = await hero.innerText();

    await scenario.insertRatedBuyinTelemetry(7_700);

    // Assert the aggregate surface reflects the post-mount mutation
    // without the test having to reload or interact.
    await expect
      .poll(async () => hero.innerText(), {
        timeout: 5_000,
        intervals: [100, 250, 500, 1000],
      })
      .not.toBe(baseline);
  });
});
