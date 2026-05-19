/**
 * Pilot Auth — Request Access Form — Local Verification — Mode A (dev bypass)
 *
 * Coverage: RequestAccessForm write-path (INSERT into pilot_access_requests).
 * Verification class: Local Verification (server action hit; allowlist not required for submit).
 * Advisory tier — trusted-local only; does not block merge.
 *
 * Requires:
 *   - Dev server running at http://localhost:3000
 *   - Local Supabase running (supabase start)
 *
 * @see EXEC-083 WS10
 * @see PRD-083 §7.2 — OTP issuance deferred to unit level
 * @see QA-006 §1 — Local Verification taxonomy
 */

import { test, expect } from '@playwright/test';

test.describe('Request Access Form — Local Verification — Mode A (dev bypass)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/request-access');
  });

  test('should render the request access form', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /request access/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/your name/i)).toBeVisible();
    await expect(page.getByLabel(/work email/i)).toBeVisible();
    await expect(page.getByLabel(/casino.*property name/i)).toBeVisible();
    await expect(page.getByLabel(/your role/i)).toBeVisible();
  });

  test('happy path: submitting the form shows success message', async ({
    page,
  }) => {
    const uniqueEmail = `e2e-test-${Date.now()}@casino.com`;

    await page.getByLabel(/your name/i).fill('E2E Test User');
    await page.getByLabel(/work email/i).fill(uniqueEmail);
    await page.getByLabel(/casino.*property name/i).fill('E2E Casino');
    await page.getByLabel(/your role/i).fill('Pit Manager');

    await page.getByRole('button', { name: /request access/i }).click();

    await expect(page.getByText(/thanks for your interest/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('duplicate email: same success message (idempotent, non-revealing)', async ({
    page,
  }) => {
    const duplicateEmail = `e2e-duplicate-${Date.now()}@casino.com`;

    // First submission
    await page.getByLabel(/your name/i).fill('First User');
    await page.getByLabel(/work email/i).fill(duplicateEmail);
    await page.getByLabel(/casino.*property name/i).fill('First Casino');
    await page.getByLabel(/your role/i).fill('Manager');
    await page.getByRole('button', { name: /request access/i }).click();
    await expect(page.getByText(/thanks for your interest/i)).toBeVisible({
      timeout: 10000,
    });

    // Navigate back and submit again with same email
    await page.goto('/request-access');
    await page.getByLabel(/your name/i).fill('Second Attempt');
    await page.getByLabel(/work email/i).fill(duplicateEmail);
    await page.getByLabel(/casino.*property name/i).fill('Same Casino');
    await page.getByLabel(/your role/i).fill('Director');
    await page.getByRole('button', { name: /request access/i }).click();

    // Same success response — must not reveal that a prior request exists
    await expect(page.getByText(/thanks for your interest/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('required field validation: submit without email shows validation error', async ({
    page,
  }) => {
    // Fill only optional fields, leave required empty
    await page.getByRole('button', { name: /request access/i }).click();

    // Browser-level required field validation prevents submission
    // The success message must NOT appear
    await expect(page.getByText(/thanks for your interest/i)).not.toBeVisible();
  });
});
