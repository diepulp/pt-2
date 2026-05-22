/**
 * Pilot Auth — Direct Deeplink Containment — Local Verification — Mode A (dev bypass)
 *
 * Coverage: unauthenticated users hitting protected routes → redirect to /signin.
 * Verification class: Local Verification (navigation/redirect behavior; no DB writes).
 * Advisory tier — trusted-local only; does not block merge.
 *
 * NOTE: Authenticated-but-non-allowlisted containment (DEC-6) requires a real auth
 * session for a user NOT in the allowlist. This path is verified at the unit level
 * (gateway files in WS6) and at the service level (allowlist-gate.test.ts).
 * Full E2E verification of the authenticated non-allowlisted path requires a seeded
 * test user with a valid session and no allowlist entry — deferred to E2E Mode B
 * promotion per QA-006 CI promotion path.
 *
 * Requires:
 *   - Dev server running at http://localhost:3000
 *
 * @see EXEC-083 WS10
 * @see QA-006 §1 — Local Verification taxonomy
 */

import { test, expect } from '@playwright/test';

test.describe('Direct Deeplink Containment — Local Verification — Mode A (dev bypass)', () => {
  test('unauthenticated: /pit redirects to /signin', async ({ page }) => {
    await page.goto('/pit');
    await page.waitForURL(/\/(signin|auth\/login)/, { timeout: 5000 });
    expect(page.url()).toMatch(/\/(signin|auth\/login)/);
  });

  test('unauthenticated: /register redirects to /signin', async ({ page }) => {
    await page.goto('/register');
    await page.waitForURL(/\/(signin|auth\/login)/, { timeout: 5000 });
    expect(page.url()).toMatch(/\/(signin|auth\/login)/);
  });

  test('unauthenticated: /bootstrap redirects to /signin', async ({ page }) => {
    await page.goto('/bootstrap');
    await page.waitForURL(/\/(signin|auth\/login)/, { timeout: 5000 });
    expect(page.url()).toMatch(/\/(signin|auth\/login)/);
  });

  test('unauthenticated: /start redirects to /signin', async ({ page }) => {
    await page.goto('/start');
    await page.waitForURL(/\/(signin|auth\/login)/, { timeout: 5000 });
    expect(page.url()).toMatch(/\/(signin|auth\/login)/);
  });

  test('/request-access is publicly accessible without authentication', async ({
    page,
  }) => {
    // Must NOT redirect to /signin for public routes
    const response = await page.goto('/request-access');
    expect(response?.status()).not.toBe(404);
    expect(page.url()).toContain('/request-access');
  });
});
