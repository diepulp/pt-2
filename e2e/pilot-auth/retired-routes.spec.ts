/**
 * Pilot Auth — Retired Routes — Local Verification — Mode A (dev bypass)
 *
 * Coverage: DEC-2 (/auth/sign-up → RequestAccessForm), DEC-4 (forgot-password + update-password → redirect).
 * Verification class: Local Verification (navigation/render only; no DB writes).
 * Advisory tier — trusted-local only; does not block merge.
 *
 * Requires:
 *   - Dev server running at http://localhost:3000
 *
 * @see EXEC-083 WS10, DEC-2, DEC-4
 * @see QA-006 §1 — Local Verification taxonomy
 */

import { test, expect } from '@playwright/test';

test.describe('Retired Auth Routes — Local Verification — Mode A (dev bypass)', () => {
  test('DEC-2: /auth/sign-up renders request-access form, not a sign-up form', async ({
    page,
  }) => {
    await page.goto('/auth/sign-up');

    // Must render the request-access form elements
    await expect(
      page.getByRole('heading', { name: /request access/i }),
    ).toBeVisible();

    // Must NOT have a password field (signUp retired)
    await expect(page.getByLabel(/password/i)).not.toBeVisible();
  });

  test('DEC-4: /auth/forgot-password redirects to /auth/login', async ({
    page,
  }) => {
    await page.goto('/auth/forgot-password');

    // Expect redirect to /auth/login — wait for navigation
    await page.waitForURL('**/auth/login', { timeout: 5000 });
    expect(page.url()).toContain('/auth/login');
  });

  test('DEC-4: /auth/update-password redirects to /auth/login', async ({
    page,
  }) => {
    await page.goto('/auth/update-password');

    await page.waitForURL('**/auth/login', { timeout: 5000 });
    expect(page.url()).toContain('/auth/login');
  });

  test('/request-access page is publicly accessible without authentication', async ({
    page,
  }) => {
    await page.goto('/request-access');
    await expect(
      page.getByRole('heading', { name: /request access/i }),
    ).toBeVisible();
  });
});
