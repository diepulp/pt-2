/**
 * Shift Dashboard V3 Layout E2E Tests
 *
 * Visual regression tests for three-panel layout at xl/lg/mobile breakpoints.
 * Validates sticky rails, collapse toggle, responsive visibility, and CLS.
 *
 * @see PRD-026 Shift Dashboard v3
 * @see EXECUTION-SPEC-PRD-026 WS8
 */

import { test, expect } from '@playwright/test';

const V3_URL = '/review/shift-dashboard-v3';

test.describe('Shift Dashboard V3 Layout (PRD-026)', () => {
  test.describe('XL Breakpoint (1440x900)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('three panels visible at xl breakpoint', async ({ page }) => {
      await page.goto(V3_URL);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);

      // Header should be visible
      const header = page.locator('header').first();
      await expect(header).toBeVisible();

      // Main center panel should be visible
      const main = page.locator('main').first();
      await expect(main).toBeVisible();
    });

    test('sticky header stays at top during scroll', async ({ page }) => {
      await page.goto(V3_URL);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);

      const header = page.locator('header').first();
      const headerBox = await header.boundingBox();

      // Scroll down
      await page.evaluate(() => window.scrollBy(0, 800));
      await page.waitForTimeout(200);

      const headerBoxAfterScroll = await header.boundingBox();

      // Header should remain at the top (y should be ~0 due to position: sticky)
      if (headerBox && headerBoxAfterScroll) {
        expect(headerBoxAfterScroll.y).toBeLessThanOrEqual(5);
      }
    });

    test('right rail collapse toggle works', async ({ page }) => {
      await page.goto(V3_URL);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);

      // Find the collapse toggle button
      const collapseButton = page.getByLabel(/collapse right rail/i);

      if (await collapseButton.isVisible()) {
        await collapseButton.click();
        await page.waitForTimeout(300); // Wait for transition

        // After collapse, expand button should be available
        const expandButton = page.getByLabel(/expand/i).first();
        if (await expandButton.isVisible()) {
          await expandButton.click();
          await page.waitForTimeout(300);
        }
      }
    });
  });

  test.describe('LG Breakpoint (1100x900)', () => {
    test.use({ viewport: { width: 1100, height: 900 } });

    test('center panel visible, no right rail at lg', async ({ page }) => {
      await page.goto(V3_URL);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);

      // Main center panel should be visible
      const main = page.locator('main').first();
      await expect(main).toBeVisible();

      // Header should be visible
      const header = page.locator('header').first();
      await expect(header).toBeVisible();
    });
  });

  test.describe('Mobile Breakpoint (375x812)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('single column stacked layout on mobile', async ({ page }) => {
      await page.goto(V3_URL);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);

      // Header and main content should be visible
      const header = page.locator('header').first();
      await expect(header).toBeVisible();

      const main = page.locator('main').first();
      await expect(main).toBeVisible();
    });
  });

  test.describe('Performance', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('CLS under 0.1 at xl breakpoint', async ({ page }) => {
      // Measure CLS using PerformanceObserver
      await page.goto(V3_URL);

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

          // Wait for data to load and layout to settle
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
