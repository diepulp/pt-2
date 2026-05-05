/**
 * Financial Enforcement — Truth-Telling Regression Tests
 *
 * PRD-078 Phase 1.4 WS4: Verifies that the financial telemetry surface
 * correctly applies authority labels and does not misrepresent unknown
 * or partial financial data.
 *
 * Verification class: Local Verification — Mode A (DEV bypass)
 * Advisory tier (trusted-local only; does not block merge).
 *
 * Requires:
 *   - Dev server running at http://localhost:3000
 *   - ENABLE_DEV_AUTH=true in .env.local
 *   - Local Supabase running with seed data applied (supabase db reset)
 *
 * @see PRD-078 Phase 1.4 WS4 (EXEC-078)
 * @see QA-006 §1 — Verification taxonomy (Local Verification)
 * @see DEC-3 — Playwright seed data gap resolution
 * @see DEC-4 — test:surface Jest --testPathPatterns
 */

import { test, expect } from '@playwright/test';

// ── Seed constants ────────────────────────────────────────────────────────────
// Casino 1 open slips — no computed_theo_cents (NULL), established by DEC-3.
// Players 1/3/4 are currently playing (status='open', end_time=NULL).

const SEED_TABLE_BJ01 = '6a000000-0000-0000-0000-000000000001'; // BJ-01 blackjack
const SEED_PLAYER_1_SEAT = '3'; // Player 1 open at BJ-01 seat 3
const SEED_PLAYER_1_ID = 'a1000000-0000-0000-0000-000000000001'; // visit b100...0001

// ── Authority label pattern (Phase 1.3 contract) ──────────────────────────────
// Any of these signals a labelled financial value — Phase 1.3 frozen contract.
const AUTHORITY_LABEL_PATTERN = /\b(Actual|Estimated|Observed|Compliance)\b/;

// ── Forbidden display patterns (WAVE-1-FORBIDDEN-LABELS §4.1–4.4) ─────────────
// Bare "Handle": §4.1 (must be "Hold" or "Inventory Handle")
// Bare "Win" not followed by "/Loss" or an authority qualifier: §4.2
// "Coverage quality": §4.3 prohibited in KPI context
const FORBIDDEN_BARE_HANDLE = /\bHandle\b/;
const FORBIDDEN_BARE_WIN =
  /\bWin\b(?!\s*\/\s*[Ll]oss|\s+Inventory|\s+Actual|\s+Estimated|\s+Observed|\s+Net)/;
const FORBIDDEN_COVERAGE_QUALITY = /Coverage quality/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getModalFinancialText(
  page: import('@playwright/test').Page,
): Promise<string> {
  const panel = page.locator('[role="dialog"]');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  return (await panel.textContent()) ?? '';
}

// =============================================================================
// Main describe block — QA-006 compliant label
// =============================================================================

test.describe('Financial Enforcement — Local Verification — Mode A (DEV bypass)', () => {
  // ── I5 Scenario 1: Partial completeness in the rating slip panel ────────────
  //
  // Navigate to BJ-01, which has Player 1's open slip (no computed_theo_cents).
  // Click on the occupied seat to open the "start from previous" slip panel.
  // Verify authority labels appear and forbidden labels do not.
  //
  // Selector strategy:
  //   [data-testid="table-grid"]    — pit page table grid
  //   [data-table-id]               — individual table card
  //   [data-seat-number]            — occupied seat button
  //   [data-testid="financial-value"] — FinancialValue component (Phase 1.3)
  //   [data-testid="completeness-badge"] — CompletenessBadge (fallback)
  //   [role="dialog"]               — rating slip panel/modal

  test.describe('I5-1 — Rating slip panel: authority label present, no forbidden labels', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/pit');
      await page.waitForSelector('[data-testid="table-grid"]', {
        timeout: 15_000,
      });
    });

    test('occupied seat opens slip panel', async ({ page }) => {
      const tableCard = page.locator(`[data-table-id="${SEED_TABLE_BJ01}"]`);
      await expect(tableCard).toBeVisible({ timeout: 5_000 });

      const seat = tableCard.locator(
        `[data-seat-number="${SEED_PLAYER_1_SEAT}"]`,
      );
      await expect(seat).toBeVisible();
      await seat.click();

      await expect(page.locator('[role="dialog"]')).toBeVisible({
        timeout: 10_000,
      });
    });

    test('slip panel renders an authority label for existing open slip', async ({
      page,
    }) => {
      const tableCard = page.locator(`[data-table-id="${SEED_TABLE_BJ01}"]`);
      await expect(tableCard).toBeVisible({ timeout: 5_000 });
      const seat = tableCard.locator(
        `[data-seat-number="${SEED_PLAYER_1_SEAT}"]`,
      );
      await seat.click();

      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      // Primary check: FinancialValue component (data-testid="financial-value")
      // carries its own authority label per Phase 1.3 contract.
      // SELECTOR GAP: if count() === 0, the modal financial section does not use
      // FinancialValue — authority labelling is not enforced at the component level.
      // Escalate to modal component team to adopt FinancialValue for financial fields.
      const financialValues = modal.locator('[data-testid="financial-value"]');
      const fvCount = await financialValues.count();

      if (fvCount > 0) {
        const firstText = (await financialValues.first().textContent()) ?? '';
        expect(firstText).toMatch(AUTHORITY_LABEL_PATTERN);
      } else {
        // Fallback: completeness badge is the minimal authority signal.
        // If neither is present, this test documents a coverage gap.
        const badge = modal.locator('[data-testid="completeness-badge"]');
        const badgeCount = await badge.count();
        if (badgeCount === 0) {
          // Document gap: modal renders financial data without authority labelling.
          // This is a Phase 1.4 compliance gap — modal financial section must adopt
          // FinancialValue component or equivalent authority declaration.
          test.info().annotations.push({
            type: 'gap',
            description:
              'SELECTOR GAP: rating slip modal does not render [data-testid="financial-value"] ' +
              'or [data-testid="completeness-badge"]. Authority label enforcement cannot be ' +
              'verified at component level. Manual audit required.',
          });
          // Minimum enforcement: the modal text must contain an authority keyword.
          const modalText = await getModalFinancialText(page);
          expect(modalText).toMatch(AUTHORITY_LABEL_PATTERN);
        } else {
          await expect(badge.first()).toBeVisible();
        }
      }
    });

    test('slip panel does not display bare "Handle"', async ({ page }) => {
      const tableCard = page.locator(`[data-table-id="${SEED_TABLE_BJ01}"]`);
      await expect(tableCard).toBeVisible({ timeout: 5_000 });
      const seat = tableCard.locator(
        `[data-seat-number="${SEED_PLAYER_1_SEAT}"]`,
      );
      await seat.click();

      const text = await getModalFinancialText(page);
      expect(text).not.toMatch(FORBIDDEN_BARE_HANDLE);
    });

    test('slip panel does not display unqualified "Win" (without /Loss or authority qualifier)', async ({
      page,
    }) => {
      const tableCard = page.locator(`[data-table-id="${SEED_TABLE_BJ01}"]`);
      await expect(tableCard).toBeVisible({ timeout: 5_000 });
      const seat = tableCard.locator(
        `[data-seat-number="${SEED_PLAYER_1_SEAT}"]`,
      );
      await seat.click();

      const text = await getModalFinancialText(page);
      expect(text).not.toMatch(FORBIDDEN_BARE_WIN);
    });

    test('slip panel does not display "Coverage quality"', async ({ page }) => {
      const tableCard = page.locator(`[data-table-id="${SEED_TABLE_BJ01}"]`);
      await expect(tableCard).toBeVisible({ timeout: 5_000 });
      const seat = tableCard.locator(
        `[data-seat-number="${SEED_PLAYER_1_SEAT}"]`,
      );
      await seat.click();

      const text = await getModalFinancialText(page);
      expect(text).not.toMatch(FORBIDDEN_COVERAGE_QUALITY);
    });
  });

  // ── I5 Scenario 2: Theo-unknown treatment in player-360 summary-band ────────
  //
  // Player 1 has an open slip (d1000000-0000-0000-0000-000000000001) with
  // computed_theo_cents = NULL (column omitted from seed INSERT).
  // Navigate to the player-360 panel and verify the summary-band Session Value
  // tile does NOT render "$0" or "Theo: 0" as authoritative.
  //
  // Selector strategy:
  //   [data-testid="summary-band"]         — SummaryBand container
  //   [data-testid="summary-tile-session"] — SummaryTile with category="session"
  //   /players/{id}                        — player-360 route pattern (PRD-022/023)

  test.describe('I5-2 — Player-360 summary-band: Theo-unknown not displayed as authoritative zero', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/players/${SEED_PLAYER_1_ID}`);
    });

    test('summary-band renders for player with null computed_theo_cents', async ({
      page,
    }) => {
      await expect(page.getByTestId('summary-band')).toBeVisible({
        timeout: 15_000,
      });
    });

    test('session tile does not render "Theo (Estimated): $0.00" for null theo', async ({
      page,
    }) => {
      const sessionTile = page.getByTestId('summary-tile-session');
      await expect(sessionTile).toBeVisible({ timeout: 15_000 });

      const tileText = (await sessionTile.textContent()) ?? '';

      // "$0.00" in the theo position indicates null computed_theo_cents was
      // treated as zero — a misrepresentation of data completeness.
      expect(tileText).not.toMatch(/Theo.*\$0\.00/);
    });

    test('session tile does not render bare "Theo: 0" for null theo', async ({
      page,
    }) => {
      const sessionTile = page.getByTestId('summary-tile-session');
      await expect(sessionTile).toBeVisible({ timeout: 15_000 });

      const tileText = (await sessionTile.textContent()) ?? '';
      expect(tileText).not.toMatch(/Theo:\s*0\b/);
    });

    test('session tile theo field is either absent, "Not computed", or carries an authority qualifier', async ({
      page,
    }) => {
      const sessionTile = page.getByTestId('summary-tile-session');
      await expect(sessionTile).toBeVisible({ timeout: 15_000 });

      const tileText = (await sessionTile.textContent()) ?? '';
      const hasTheoField = /Theo/i.test(tileText);

      if (!hasTheoField) {
        // Theo field hidden entirely — acceptable for null completeness.
        return;
      }

      // If "Theo" appears, it must carry the "(Estimated)" qualifier and must
      // not show a zero value that implies the theo was actually computed.
      expect(tileText).toMatch(/Theo\s*\(Estimated\)/i);
      expect(tileText).not.toMatch(/Theo.*\$0/);
    });
  });
});
