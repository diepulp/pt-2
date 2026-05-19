/**
 * Pilot Auth — Unapproved Login Rejection — Local Verification — Mode A (dev bypass)
 *
 * Coverage: sendMagicLinkAction allowlist gate surface behavior — unapproved email
 * receives closed-pilot message, NOT an OTP (RULE-5).
 * Verification class: Local Verification (magic-link form render + server action response).
 * Advisory tier — trusted-local only; does not block merge.
 *
 * NOTE (PRD-083 §7.2 risk note): Full OTP email delivery and link-click verification
 * are deferred. OTP issuance for approved emails is verified at the unit level
 * (app/actions/auth/__tests__/send-magic-link.test.ts). This spec covers the UI surface
 * behavior for the unapproved path only.
 *
 * Requires:
 *   - Dev server running at http://localhost:3000
 *   - Local Supabase running (supabase start)
 *   - The test email below must NOT be in the approved_email_allowlist seed data
 *
 * @see EXEC-083 WS10
 * @see QA-006 §1 — Local Verification taxonomy
 */

import { test, expect } from '@playwright/test';

// This email must not be seeded in the allowlist for this test to work
const UNAPPROVED_EMAIL = 'e2e-unapproved-pilot@example.com';

test.describe('Unapproved Login Rejection — Local Verification — Mode A (dev bypass)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signin');
  });

  test('unapproved email: shows closed-pilot message without issuing OTP', async ({
    page,
  }) => {
    const emailInput = page.getByRole('textbox', { name: /email/i });
    await emailInput.fill(UNAPPROVED_EMAIL);
    await page
      .getByRole('button', { name: /send.*link|sign.*in|continue/i })
      .click();

    // Expect closed-pilot message to appear
    await expect(page.getByText(/closed pilot/i)).toBeVisible({
      timeout: 10000,
    });

    // Must NOT show the "check your email" approved message
    await expect(page.getByText(/check your email/i)).not.toBeVisible();
  });

  test('not-approved state includes a link to /request-access', async ({
    page,
  }) => {
    const emailInput = page.getByRole('textbox', { name: /email/i });
    await emailInput.fill(UNAPPROVED_EMAIL);
    await page
      .getByRole('button', { name: /send.*link|sign.*in|continue/i })
      .click();

    await expect(page.getByText(/closed pilot/i)).toBeVisible({
      timeout: 10000,
    });

    // The not-approved state must have a link to request access
    const requestAccessLink = page.getByRole('link', {
      name: /request access/i,
    });
    await expect(requestAccessLink).toBeVisible();
    await expect(requestAccessLink).toHaveAttribute('href', /\/request-access/);
  });

  test('the signin page renders the email input form initially', async ({
    page,
  }) => {
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /send.*link|sign.*in|continue/i }),
    ).toBeVisible();
  });
});
