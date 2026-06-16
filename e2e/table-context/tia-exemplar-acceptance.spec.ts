/**
 * TIA Exemplar Acceptance — Browser Acceptance Smoke (PRD-091 WS4)
 *
 * Proves the frozen §6 operator journey end-to-end under QA-006 **Mode B**
 * (real browser login). A pit boss reaches the Pit Terminal Inventory/Rundown
 * surface and sees the canonical Table Inventory Accounting render:
 *
 *   - "Partial Table Result" (SRL-TIA-001 inventory_only label) + formatted value
 *   - the missing-drop disclosure
 *   - NO competing legacy win/loss-like result
 *   - NO "win/loss unavailable" placeholder when the canonical value renders
 *
 * Mandatory seeded target state: inventory_only (cheapest deterministic seed
 * that renders a financial value and exercises the missing-drop disclosure, R-2).
 * Mode B only — Mode A/dev-auth bypass and direct Mode C clients do NOT satisfy
 * WS4 (R-3).
 *
 * @see PRD-091 §6 / Appendix A.3 #12–#14, EXEC-091 WS4, FIB F.5, QA-006 §1/§3
 */

import { test, expect } from '@playwright/test';

import {
  createTiaInventoryOnlySeed,
  createModeBConfirmPath,
  type TiaInventoryOnlySeed,
} from './fixtures/tia-inventory-only-seed';

let seed: TiaInventoryOnlySeed;

test.beforeAll(async () => {
  seed = await createTiaInventoryOnlySeed();
});

test.afterAll(async () => {
  await seed?.cleanup();
});

test.describe('TIA Exemplar Acceptance — E2E — Mode B (browser login)', () => {
  test('pit boss sees the canonical Partial Table Result with no legacy win/loss or placeholder', async ({
    page,
  }) => {
    // Mode B: real browser session via the magic-link confirm flow (the app's
    // only login path is OTP/magic-link). The /start gateway resolves the
    // seeded active staff binding and redirects to /pit, where the pit page
    // auto-selects the casino's single seeded table.
    const confirmPath = await createModeBConfirmPath(seed.testEmail, '/start');
    // The confirm route 30x-redirects (/auth/confirm → /start → /pit); the
    // server-side redirect chain aborts the initial navigation, so settle on
    // the final URL rather than the first response.
    await page.goto(confirmPath, { waitUntil: 'commit' }).catch(() => {});
    await page.waitForURL(/\/pit/, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    // Open the Inventory/Rundown panel. The sidebar tabs are icon-only
    // (collapsed) with no accessible text; the panel keyboard shortcut
    // (Ctrl+2, handled by a window keydown listener in panel-container.tsx) is
    // the deterministic way to activate the inventory panel. The listener is
    // attached in a post-hydration effect, so a single early press can be lost
    // before React mounts — retry the press until the panel actually switches.

    // The pit terminal mounts the panel container TWICE — a desktop layer
    // (`hidden md:block`) and a mobile layer (`md:hidden`) — both present in
    // the DOM with CSS-only visibility toggling (pit-panels-client.tsx). At the
    // Desktop Chrome viewport the desktop layer is the visible one. Scope every
    // positive assertion to visible elements so the FR-1 "exactly one" count
    // measures operator-VISIBLE statements (the requirement), not raw DOM nodes.

    // The canonical accounting projection renders in the "Session Rundown" card.
    const rundownTitle = page
      .getByText('Session Rundown')
      .filter({ visible: true });
    await expect(async () => {
      await page.keyboard.press('Control+2');
      await expect(rundownTitle).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });

    // FR-5 / A.3: inventory_only → "Partial Table Result" + canonical value.
    await expect(
      page.getByText('Partial Table Result').filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByText(seed.expectedResultDisplay).filter({ visible: true }),
    ).toBeVisible();

    // Missing-drop disclosure (the inventory_only qualifier).
    await expect(
      page
        .getByText(/Telemetry-derived drop estimate not available/i)
        .filter({ visible: true }),
    ).toBeVisible();

    // FR-1 / FR-3: no competing legacy win/loss-like result, and no legacy
    // "win/loss unavailable" placeholder when the canonical value renders.
    await expect(page.getByText(/win\/loss unavailable/i)).toHaveCount(0);
    await expect(page.getByText('Win/Loss', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Final Win/Loss', { exact: true })).toHaveCount(
      0,
    );

    // FR-1: exactly one operator-visible canonical table-result statement.
    await expect(
      page.getByText('Partial Table Result').filter({ visible: true }),
    ).toHaveCount(1);
  });
});
