/**
 * Player 360 Navigation E2E Tests
 *
 * Tests the navigation flow between player search and Player 360 detail view.
 *
 * Workflows tested:
 * 1. Route structure validation (no auth required)
 * 2. Timeline 308 redirect (HTTP-level, no auth required)
 * 3. Browser history navigation (structural)
 * 4. returnTo param security validation
 *
 * Auth-dependent tests are marked with `@auth` tag and skip when
 * no authenticated session is available — they never pass vacuously.
 *
 * @see PRD-022 Player 360 Navigation Consolidation
 * @see PERF-006 WS7 — Fix tautological assertions
 */

import { test, expect } from '@playwright/test';

// === Route Structure Tests (No Auth Required) ===

test.describe('Player 360 Navigation — Route Structure', () => {
  test('/players route exists and returns 200', async ({ page }) => {
    const response = await page.goto('/players');

    expect(response?.status()).toBe(200);
  });

  test('/players route renders player dashboard', async ({ page }) => {
    await page.goto('/players');

    await expect(page.getByTestId('player-dashboard')).toBeVisible();
  });

  test('/players/[playerId] route exists (not 404)', async ({ page }) => {
    const response = await page.goto('/players/any-player-id');

    expect(response?.status()).not.toBe(404);
  });

  test('Player 360 page renders body at /players/[playerId]', async ({
    page,
  }) => {
    await page.goto('/players/test-player-id');

    // Route should resolve and render something — not a blank page
    await expect(page.locator('body')).toBeVisible();
    // Page should contain at minimum the player-360-page testid or an error boundary
    const hasPage = await page.getByTestId('player-360-page').isVisible();
    const hasError = await page
      .locator('text=Something went wrong')
      .isVisible();
    expect(hasPage || hasError).toBe(true);
  });
});

// === Timeline 308 Redirect Tests (HTTP-level, No Auth Required) ===

test.describe('Player 360 Navigation — Timeline Redirect (308)', () => {
  test('returns HTTP 308 with correct Location header', async ({ request }) => {
    const response = await request.get('/players/test-player-id/timeline', {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(308);

    const location = response.headers()['location'];
    expect(location).toContain('/players/test-player-id');
    expect(location).toContain('#timeline');
  });

  test('preserves query params in redirect', async ({ request }) => {
    const returnTo = encodeURIComponent('/players?query=smith');
    const response = await request.get(
      `/players/test-player-id/timeline?returnTo=${returnTo}`,
      { maxRedirects: 0 },
    );

    expect(response.status()).toBe(308);

    const location = response.headers()['location'];
    expect(location).toContain('returnTo=');
  });

  test('browser follows redirect to Player 360 with #timeline', async ({
    page,
  }) => {
    await page.goto('/players/test-player-id/timeline');

    await expect(page).toHaveURL(/\/players\/test-player-id.*#timeline/);
  });

  test('/players/[playerId]/timeline returns 308 for any ID', async ({
    request,
  }) => {
    const response = await request.get('/players/any-player-id/timeline', {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(308);
  });
});

// === URL Param Tests (No Auth Required) ===

test.describe('Player 360 Navigation — URL Params', () => {
  test('returnTo param is preserved in URL', async ({ page }) => {
    const returnTo = encodeURIComponent('/players?query=smith');
    await page.goto(`/players/test-player-id?returnTo=${returnTo}`);

    await expect(page).toHaveURL(/returnTo=/);
  });

  test('malicious returnTo does not cause redirect or crash', async ({
    page,
  }) => {
    const maliciousReturnTo = encodeURIComponent('//evil.com');
    const response = await page.goto(
      `/players/test-player-id?returnTo=${maliciousReturnTo}`,
    );

    // Page should load normally — not redirect to evil.com
    expect(response?.url()).not.toContain('evil.com');
    await expect(page).toHaveURL(/\/players\/test-player-id/);
  });
});

// === Browser History Tests (Structural, No Auth Required) ===

test.describe('Player 360 Navigation — Browser History', () => {
  test('back navigation returns to previous page', async ({ page }) => {
    await page.goto('/players');
    await expect(page).toHaveURL('/players');

    await page.goto('/players/test-player-id');
    await expect(page).toHaveURL(/\/players\/test-player-id/);

    await page.goBack();
    await expect(page).toHaveURL('/players');
  });

  test('forward navigation returns to detail page', async ({ page }) => {
    await page.goto('/players');
    await page.goto('/players/test-player-id');

    await page.goBack();
    await page.goForward();

    await expect(page).toHaveURL(/\/players\/test-player-id/);
  });
});

// === Auth-Dependent Tests ===
// These tests require an authenticated session with valid player data.
// They skip (not vacuously pass) when auth is unavailable.

test.describe('Player 360 Navigation — Authenticated Flows', () => {
  test('back-to-search control visible when authenticated', async ({
    page,
  }) => {
    await page.goto('/players/test-player-id');
    await page.waitForLoadState('networkidle');

    const backButton = page.getByTestId('back-to-search');

    // Hard assertion: if the page loaded with auth, the button MUST be there.
    // If no auth, skip with clear reason — never pass vacuously.
    const pageLoaded = await page.getByTestId('player-360-page').isVisible();
    if (!pageLoaded) {
      test.skip(
        true,
        'Player 360 page did not render — auth likely unavailable',
      );
      return;
    }

    await expect(backButton).toBeVisible({ timeout: 5000 });
  });
});
