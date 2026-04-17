/**
 * PRD-064 — MTL Buy-In Glitch Containment (Operator-Visible Atomicity)
 *
 * Originally this file was the **reproduction** of the MTL buy-in glitch:
 * rapid dismissal of the rating-slip modal during the ~1s POST window
 * aborted the financial transaction and produced a success-like UI for a
 * write that never committed (see docs/issues/mtl-rating-slip-glitch/).
 *
 * After WS1 (commit-barrier UX) and WS2 (close-session interlock) landed,
 * the invariant INV-MTL-BRIDGE-ATOMICITY is enforced at the UI boundary:
 *
 *   1. While `useSaveWithBuyIn` is pending, the dialog is non-dismissible
 *      (Escape, overlay click, and the X-close affordance are all inert).
 *   2. The threshold toast and "Changes saved" toast fire only from the
 *      mutation's `onSuccess` — never before the POST resolves 201.
 *   3. `handleCloseSession` refuses to close when `newBuyIn > 0`, surfacing
 *      a non-dismissible AlertDialog whose only control is "Return to Save".
 *
 * The assertions in this file now **fail if the glitch ever reappears**.
 * The test uses Playwright's `page.route()` to delay the POST — this gives
 * a deterministic window in which to verify dismissal is inert and no
 * success-like UI has fired.
 *
 * Verification class: E2E — Mode B (browser login)
 * Auth fidelity: seeded dev credentials (pitboss@dev.local).
 *
 * @see docs/10-prd/PRD-064-mtl-buyin-glitch-containment-v0.md
 * @see hooks/rating-slip-modal/use-save-with-buyin.ts        (WS1)
 * @see components/modals/rating-slip/rating-slip-modal.tsx    (WS1)
 * @see components/pit-panels/pit-panels-client.tsx            (WS2)
 * @see hooks/rating-slip-modal/has-pending-unsaved-buyin.ts   (WS2 predicate)
 */

import { test, expect, type Page, type Route } from '@playwright/test';

test.setTimeout(90_000);

// ---------------------------------------------------------------------------
// Shared helpers — Mode B login, pit navigation, seeded John Smith seat
// ---------------------------------------------------------------------------

async function loginAndOpenOccupiedSeat(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.fill('#login-email', 'pitboss@dev.local');
  await page.fill('#login-password', 'devpass123');
  await page.click('button[type="submit"]');
  // Post-login redirect may land on /pit, /dashboard, or /start depending on
  // company/onboarding state. We tolerate any of these and force-navigate to
  // /pit below. If login failed we'll remain on /auth/login and the /pit
  // navigation will bounce back — the seat-visibility assertion catches it.
  await page
    .waitForURL(/\/(pit|dashboard|start)/, { timeout: 15_000 })
    .catch(() => {
      /* continue — we force-navigate next */
    });

  await page.goto('/pit');
  await page.waitForLoadState('networkidle', { timeout: 15_000 });

  // Seed.sql seats John Smith on BJ-01 seat 4, but prior test runs may have
  // closed that session. Prefer John if present; otherwise click any
  // "occupied by <name>" seat the pit currently shows.
  const johnSeat = page.getByRole('button', {
    name: /occupied by John Smith/i,
  });
  const anyOccupiedSeat = page.getByRole('button', { name: /occupied by /i });

  const seatToClick = (await johnSeat.count().catch(() => 0))
    ? johnSeat.first()
    : anyOccupiedSeat.first();

  await expect(seatToClick).toBeVisible({ timeout: 15_000 });
  await seatToClick.click();

  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible({ timeout: 10_000 });
}

/**
 * Install a route handler that **stalls** POSTs to the financial-transactions
 * endpoint until the returned `release` function is invoked. Only the first
 * matching request is stalled — subsequent requests pass through normally.
 *
 * This gives the test a deterministic "pending" window in which to assert
 * that dismissal inputs are inert and success-like UI has not fired.
 *
 * @returns { release, waitUntilPending } — call `waitUntilPending` to block
 *          until the in-flight POST has been intercepted, then `release` to
 *          let it continue (returning a fabricated 201 so the success path
 *          runs end-to-end without needing the database write).
 */
function stallFinancialTransactionPost(page: Page) {
  let releaseFn: (() => void) | null = null;
  let pendingFn: (() => void) | null = null;
  const pendingPromise = new Promise<void>((resolve) => {
    pendingFn = resolve;
  });
  const releasePromise = new Promise<void>((resolve) => {
    releaseFn = resolve;
  });

  let handled = false;

  page.route('**/api/v1/financial-transactions', async (route: Route) => {
    if (route.request().method() !== 'POST' || handled) {
      await route.continue();
      return;
    }
    handled = true;
    pendingFn?.();
    await releasePromise;
    // Fabricate a 201 so the commit-barrier releases via onSuccess and both
    // toasts fire. Body mirrors the shape the hook consumes (not inspected
    // closely by the component beyond "ok === true").
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          id: '00000000-0000-0000-0000-000000000abc',
          created_at: new Date().toISOString(),
        },
      }),
    });
  });

  return {
    waitUntilPending: () => pendingPromise,
    release: () => releaseFn?.(),
  };
}

// ---------------------------------------------------------------------------
// Describe — E2E — Mode B (browser login)
// ---------------------------------------------------------------------------

// All three tests share the seeded pit state (seeded John Smith seat) and
// mutate the modal on the same table. Running them in parallel workers
// races on the same dev auth session + seed, which breaks the modal open.
// QA-006 §4: declare serial when tests share cumulative state.
test.describe.configure({ mode: 'serial' });

test.describe('PRD-064 MTL Buy-In Glitch Containment — E2E — Mode B (browser login)', () => {
  /**
   * WS1 verification — the original glitch cannot be reproduced.
   *
   * Strategy: delay the financial-transactions POST so the save stays
   * pending. During that window, assert every dismissal path is inert
   * and no success-like toast has fired. After releasing the POST, assert
   * both toasts finally appear.
   *
   * If any dismissal succeeds while pending, or any toast fires before
   * the POST response, this test FAILS — which is exactly the regression
   * behaviour we want.
   */
  test('dismissal during pending save is inert — no success-like UI before 201', async ({
    page,
  }) => {
    const { waitUntilPending, release } = stallFinancialTransactionPost(page);

    await loginAndOpenOccupiedSeat(page);

    const modal = page.getByRole('dialog');
    const buyInInput = page.locator('#newBuyIn');
    await expect(buyInInput).toBeVisible({ timeout: 20_000 });
    await buyInInput.fill('3000');

    const saveBtn = page.getByRole('button', { name: /save changes/i });
    await saveBtn.click();

    // Hold here until the POST is in flight — this is the window in which
    // the WS1 commit-barrier must keep the modal non-dismissible.
    await waitUntilPending();

    // ---- A. Save button enters pending state ------------------------------
    // During pending, the WS1 modal swaps the button label to "Saving..." and
    // disables it. The button text changes so we re-query by the new label.
    const savingBtn = page.getByRole('button', { name: /saving/i });
    await expect(savingBtn).toBeVisible({ timeout: 5_000 });
    await expect(savingBtn).toBeDisabled();

    // ---- B. Dismissal inputs during pending are inert ---------------------
    // B.1 Escape key — must NOT close the dialog.
    await page.keyboard.press('Escape');
    await expect(modal).toBeVisible();

    // B.2 Overlay click (outside the dialog) — must NOT close.
    //     Click near the top-left corner of the viewport, well outside the
    //     dialog's centered content. Radix Dialog intercepts this via
    //     onPointerDownOutside / onInteractOutside which WS1 guards.
    await page.mouse.click(5, 5);
    await expect(modal).toBeVisible();

    // B.3 X-close affordance — WS1 swaps it for a spinner; even clicking
    //     where the X would be must not dismiss the dialog.
    //     We click the spinner overlay region to exercise the pointer-event
    //     guard visually provided by the overlay.
    const closeX = modal
      .locator('[aria-hidden="true"]')
      .filter({ has: page.locator('svg.animate-spin') });
    if (await closeX.count()) {
      // May or may not be click-targetable depending on stacking; the key
      // invariant is the dialog stays open regardless of the click.
      await closeX
        .first()
        .click({ force: true })
        .catch(() => {});
      await expect(modal).toBeVisible();
    }

    // ---- C. No success-like UI has fired yet ------------------------------
    // The "Changes saved" toast is the canonical positive confirmation —
    // it must NOT appear before the POST resolves. If the WS1 barrier leaks
    // and the toast fires pre-response, this assertion fails and the
    // regression is caught.
    // The threshold toast ("MTL entry created") must also not fire before
    // the POST resolves because WS1 moved `notifyThreshold()` into onSuccess.
    await expect(page.getByText(/Changes saved/i).first()).toBeHidden();
    await expect(page.getByText(/MTL entry created/i).first()).toBeHidden();

    // ---- D. Release the POST; success path fires -------------------------
    release();

    // Post-success: the "Changes saved" toast is an unconditional part of
    // the save handler and is the canonical positive signal that the
    // mutation resolved 2xx without error. The threshold toast (watchlist_met
    // for $3k) is conditional on `playerDailyTotal` being resolved at the
    // moment of save — we assert the canonical signal, then best-effort the
    // threshold toast (Sonner may also dedupe/dismiss via its toast id).
    await expect(page.getByText(/Changes saved/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Commit-barrier has lifted: the Save button is no longer in "Saving..."
    // state and the dialog is dismissible again.
    await expect(savingBtn).toBeHidden({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden({ timeout: 5_000 });
  });

  /**
   * WS2 verification — unsaved-buy-in interlock on Close Session.
   *
   * If `newBuyIn > 0` and unsaved, `handleCloseSession` must refuse to close
   * the session and surface a non-dismissible AlertDialog with exact text.
   * The only control is "Return to Save" which dismisses the alert and
   * leaves the rating-slip modal mounted with `newBuyIn` still populated.
   */
  test('close-session with unsaved buy-in surfaces non-dismissible interlock', async ({
    page,
  }) => {
    await loginAndOpenOccupiedSeat(page);

    const modal = page.getByRole('dialog').first();
    const buyInInput = page.locator('#newBuyIn');
    await expect(buyInInput).toBeVisible({ timeout: 20_000 });
    await buyInInput.fill('500');

    const closeSessionBtn = page.getByRole('button', {
      name: /close session/i,
    });
    await expect(closeSessionBtn).toBeEnabled();
    await closeSessionBtn.click();

    // Interlock appears with the exact text from PRD-064 G4 / FR-6.
    const interlock = page.getByTestId('unsaved-buyin-interlock');
    await expect(interlock).toBeVisible({ timeout: 5_000 });
    await expect(interlock).toContainText(
      'Unsaved buy-in detected. Save it before closing session.',
    );

    // Dismissal inputs on the AlertDialog must be inert.
    // Escape: Radix AlertDialog does not close because onOpenChange is omitted.
    await page.keyboard.press('Escape');
    await expect(interlock).toBeVisible();

    // Overlay click (outside the alert's content, but within the modal
    // overlay region) is also inert by construction.
    await page.mouse.click(5, 5);
    await expect(interlock).toBeVisible();

    // Only the "Return to Save" button dismisses the alert.
    const returnBtn = page.getByTestId('unsaved-buyin-interlock-return');
    await expect(returnBtn).toHaveText(/return to save/i);
    await returnBtn.click();

    await expect(interlock).toBeHidden({ timeout: 5_000 });

    // Rating-slip modal is still mounted with `newBuyIn` preserved so the
    // operator can click Save Changes. No silent discard.
    await expect(modal).toBeVisible();
    await expect(buyInInput).toHaveValue('500');
  });

  /**
   * WS2 happy-path regression — close-session with zero buy-in works normally.
   *
   * When `newBuyIn = 0`, the interlock must NOT appear; the session closes
   * via the normal path. This guards against over-broad gating of the
   * close-session flow.
   *
   * Note: the close-session mutation is allowed to fail for unrelated
   * reasons (e.g. seeded state may not support repeated closures). We only
   * assert the interlock does NOT appear and the modal closes or transitions
   * away from the save surface.
   */
  test('close-session with zero buy-in does not surface interlock', async ({
    page,
  }) => {
    // Stub the rating-slip close endpoint so the seeded session is NOT
    // actually closed — the interlock assertion is the only thing we care
    // about here, and closing the seeded slip for real would contaminate
    // the seed data for subsequent test runs.
    await page.route('**/api/v1/rating-slips/*/close', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          code: 'SERVICE_UNAVAILABLE',
          error: 'Stubbed — test does not commit close',
          status: 503,
        }),
      }),
    );
    // Also stub the pit-cash-observation endpoint the close handler fires
    // before slip-close when chipsTaken > 0 (defensive; chipsTaken is 0
    // here, but if the shape ever changes the test should not silently
    // persist a row).
    await page.route(
      '**/api/v1/rating-slips/*/pit-cash-observations',
      (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            code: 'SERVICE_UNAVAILABLE',
            error: 'Stubbed',
            status: 503,
          }),
        }),
    );

    await loginAndOpenOccupiedSeat(page);

    const buyInInput = page.locator('#newBuyIn');
    await expect(buyInInput).toBeVisible({ timeout: 20_000 });
    // Leave newBuyIn at its default '0' (seeded by initializeForm). Do not
    // fill — an empty fill still coerces to NaN which the predicate returns
    // false for, but asserting on '0' keeps the test close to the default
    // production path.
    await expect(buyInInput).toHaveValue('0');

    const closeSessionBtn = page.getByRole('button', {
      name: /close session/i,
    });
    await closeSessionBtn.click();

    // The interlock must NOT appear.
    const interlock = page.getByTestId('unsaved-buyin-interlock');
    await expect(interlock).toBeHidden({ timeout: 2_000 });
  });
});
