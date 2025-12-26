/**
 * Rating Slip Modal Integration E2E Tests
 *
 * Tests the 4 critical workflows for PRD-008:
 * 1. Open modal from seat click
 * 2. Save changes (average bet + buy-in)
 * 3. Close session with chips-taken
 * 4. Move player to different table/seat
 *
 * @see PRD-008 Rating Slip Modal Integration
 * @see PRD-008a Dashboard Integration
 */

import { test, expect, type Page } from "@playwright/test";

import {
  createRatingSlipTestScenario,
  createTestTransaction,
  getRatingSlipStatus,
  getRatingSlipsForVisit,
  getTransactionsForVisit,
  type RatingSlipTestScenario,
} from "../fixtures/rating-slip-fixtures";

// Test scenario shared across tests in this file
let scenario: RatingSlipTestScenario;

test.describe("Rating Slip Modal Integration (PRD-008)", () => {
  // Setup: Create test data before all tests
  test.beforeAll(async () => {
    scenario = await createRatingSlipTestScenario();
  });

  // Cleanup: Remove test data after all tests
  test.afterAll(async () => {
    if (scenario) {
      await scenario.cleanup();
    }
  });

  /**
   * Helper: Authenticate via browser
   */
  async function authenticateUser(page: Page) {
    // Navigate to login page
    await page.goto("/auth/login");

    // Fill in credentials
    await page.fill('input[name="email"]', scenario.testEmail);
    await page.fill('input[name="password"]', scenario.testPassword);

    // Submit and wait for redirect
    await page.click('button[type="submit"]');

    // Wait for dashboard to load (indicates successful auth)
    await page.waitForURL(/\/(pit|dashboard)/, { timeout: 10000 });
  }

  /**
   * Test 1: Open Modal from Seat Click
   *
   * Scenario: Click an occupied seat on the pit dashboard table view
   * Expected: Modal opens with correct slip data from BFF endpoint
   */
  test("clicking occupied seat opens modal with slip data", async ({
    page,
  }) => {
    // Authenticate
    await authenticateUser(page);

    // Navigate to pit dashboard
    await page.goto("/pit");

    // Wait for tables to load
    await page.waitForSelector('[data-testid="table-grid"]', {
      timeout: 10000,
    });

    // Find and click the table with our test slip
    // The table should show as active with occupied seat
    const tableCard = page.locator(`[data-table-id="${scenario.tableId}"]`);
    await expect(tableCard).toBeVisible({ timeout: 5000 });

    // Click on the occupied seat (seat 1)
    const seat = page.locator(`[data-seat-number="${scenario.seatNumber}"]`);
    await expect(seat).toBeVisible();
    await seat.click();

    // Wait for modal to open
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Verify modal title shows player name
    const modalTitle = modal.locator('[data-testid="modal-title"]');
    await expect(modalTitle).toContainText("John TestPlayer");

    // Verify financial summary section is present
    const financialSection = modal.locator('[data-testid="financial-summary"]');
    await expect(financialSection).toBeVisible();

    // Verify loyalty points are displayed
    const loyaltySection = modal.locator('[data-testid="loyalty-points"]');
    await expect(loyaltySection).toBeVisible();
    await expect(loyaltySection).toContainText("500"); // Initial balance

    // Verify average bet field shows current value
    const averageBetInput = modal.locator('[data-testid="average-bet-input"]');
    await expect(averageBetInput).toHaveValue("25"); // $25.00 (2500 cents / 100)
  });

  /**
   * Test 2: Save Changes Flow (Average Bet + Buy-In)
   *
   * Scenario: Modify average bet, enter new buy-in, save changes
   * Expected: Average bet updated, transaction recorded, modal shows updated data
   */
  test("save changes updates average bet and records buy-in transaction", async ({
    page,
  }) => {
    // Authenticate
    await authenticateUser(page);

    // Navigate to pit dashboard
    await page.goto("/pit");

    // Wait for and click on occupied seat
    await page.waitForSelector('[data-testid="table-grid"]', {
      timeout: 10000,
    });
    const seat = page.locator(`[data-seat-number="${scenario.seatNumber}"]`);
    await seat.click();

    // Wait for modal
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Modify average bet using increment button (+$25)
    const incrementButton = modal.locator(
      '[data-testid="average-bet-increment-25"]',
    );
    await incrementButton.click();

    // Enter new buy-in amount ($100)
    const buyInInput = modal.locator('[data-testid="new-buyin-input"]');
    await buyInInput.fill("100");

    // Click Save Changes button
    const saveButton = modal.locator('button:has-text("Save Changes")');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // Wait for save to complete (button should show saving state then return)
    await expect(saveButton).toHaveText("Saving...", { timeout: 2000 });
    await expect(saveButton).not.toHaveText("Saving...", { timeout: 5000 });

    // Verify average bet was updated in database
    const updatedSlip = await getRatingSlipStatus(scenario.ratingSlipId);
    expect(updatedSlip.average_bet).toBe(5000); // $50.00 in cents (was $25 + $25 increment)

    // Verify buy-in transaction was recorded
    const transactions = await getTransactionsForVisit(scenario.visitId);
    const buyInTxn = transactions.find(
      (t) => t.direction === "in" && t.amount === 10000, // $100.00 in cents
    );
    expect(buyInTxn).toBeDefined();
    expect(buyInTxn?.tender_type).toBe("cash");
    expect(buyInTxn?.source).toBe("pit");

    // Verify modal shows updated financial summary
    const financialSection = modal.locator('[data-testid="financial-summary"]');
    await expect(financialSection).toContainText("$100.00"); // Cash In total
  });

  /**
   * Test 3: Close Session with Chips-Taken
   *
   * Scenario: Enter chips-taken amount, close session
   * Expected: Transaction recorded, slip closed, modal closes, slip removed from panel
   */
  test("close session records chips-taken and closes slip", async ({
    page,
  }) => {
    // Create a fresh slip for this test (so we don't close the shared one)
    // We'll use the API directly to create it
    const { request } = await page
      .context()
      .newPage()
      .then((p) => ({ request: p.request }));

    // First, create a new slip via the existing one
    // For this test, we'll use the existing slip but verify the close behavior

    // Authenticate
    await authenticateUser(page);

    // Navigate to pit dashboard
    await page.goto("/pit");

    // Wait for and click on occupied seat
    await page.waitForSelector('[data-testid="table-grid"]', {
      timeout: 10000,
    });
    const seat = page.locator(`[data-seat-number="${scenario.seatNumber}"]`);
    await seat.click();

    // Wait for modal
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Enter chips-taken amount ($75)
    const chipsTakenInput = modal.locator('[data-testid="chips-taken-input"]');
    await chipsTakenInput.fill("75");

    // Click Close Session button
    const closeButton = modal.locator('button:has-text("Close Session")');
    await closeButton.click();

    // Wait for close to complete (modal should close)
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // Verify chips-taken transaction was recorded
    const transactions = await getTransactionsForVisit(scenario.visitId);
    const chipsOutTxn = transactions.find(
      (t) => t.direction === "out" && t.amount === 7500, // $75.00 in cents
    );
    expect(chipsOutTxn).toBeDefined();
    expect(chipsOutTxn?.tender_type).toBe("chips");

    // Verify slip status is closed
    const closedSlip = await getRatingSlipStatus(scenario.ratingSlipId);
    expect(closedSlip.status).toBe("closed");

    // Verify slip is removed from active slips panel
    const activeSlipsPanel = page.locator('[data-testid="active-slips-panel"]');
    const slipCard = activeSlipsPanel.locator(
      `[data-slip-id="${scenario.ratingSlipId}"]`,
    );
    await expect(slipCard).not.toBeVisible();
  });

  /**
   * Test 4: Move Player Flow
   *
   * Scenario: Select destination table, enter seat, move player
   * Expected: Current slip closed, new slip at destination with same visit_id
   */
  test("move player creates new slip at destination with same visit", async ({
    page,
  }) => {
    // For this test, we need an open slip
    // Since Test 3 closed the original, we'll create a new scenario
    const moveScenario = await createRatingSlipTestScenario();

    try {
      // Authenticate with the new scenario's credentials
      await page.goto("/auth/login");
      await page.fill('input[name="email"]', moveScenario.testEmail);
      await page.fill('input[name="password"]', moveScenario.testPassword);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(pit|dashboard)/, { timeout: 10000 });

      // Navigate to pit dashboard
      await page.goto("/pit");

      // Wait for and click on occupied seat
      await page.waitForSelector('[data-testid="table-grid"]', {
        timeout: 10000,
      });
      const seat = page.locator(
        `[data-seat-number="${moveScenario.seatNumber}"]`,
      );
      await seat.click();

      // Wait for modal
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Select destination table from dropdown
      const tableSelect = modal.locator('[data-testid="move-table-select"]');
      await tableSelect.click();

      // Select the secondary table (BJ-02)
      const tableOption = page.locator(
        `[data-table-option="${moveScenario.secondaryTableId}"]`,
      );
      await tableOption.click();

      // Enter destination seat number
      const seatInput = modal.locator('[data-testid="move-seat-input"]');
      await seatInput.fill("3");

      // Click Move Player button
      const moveButton = modal.locator('button:has-text("Move Player")');
      await expect(moveButton).toBeEnabled();
      await moveButton.click();

      // Wait for move to complete (modal should refresh with new slip)
      await page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/v1/rating-slips/") &&
          resp.url().includes("/move") &&
          resp.status() === 200,
        { timeout: 5000 },
      );

      // Verify in database: original slip closed
      const originalSlip = await getRatingSlipStatus(moveScenario.ratingSlipId);
      expect(originalSlip.status).toBe("closed");

      // Verify new slip created at destination
      const slips = await getRatingSlipsForVisit(moveScenario.visitId);
      const newSlip = slips.find(
        (s) =>
          s.status === "open" &&
          s.table_id === moveScenario.secondaryTableId &&
          s.seat_number === "3",
      );
      expect(newSlip).toBeDefined();
      expect(newSlip?.visit_id).toBe(moveScenario.visitId); // Same visit for session continuity

      // Verify modal now shows new slip data
      const modalTitle = modal.locator('[data-testid="modal-title"]');
      await expect(modalTitle).toBeVisible();

      // The modal should still be open showing the new slip
      await expect(modal).toBeVisible();
    } finally {
      // Cleanup move scenario
      await moveScenario.cleanup();
    }
  });
});

/**
 * API-Level Tests for BFF Endpoint
 *
 * These tests verify the /api/v1/rating-slips/[id]/modal-data endpoint
 * directly, without browser interaction.
 */
test.describe("Rating Slip Modal BFF Endpoint", () => {
  let apiScenario: RatingSlipTestScenario;

  test.beforeAll(async () => {
    apiScenario = await createRatingSlipTestScenario();

    // Create some financial transactions for testing
    await createTestTransaction(
      apiScenario.casinoId,
      apiScenario.visitId,
      apiScenario.playerId,
      apiScenario.staffId,
      "in",
      5000, // $50.00
      "cash",
    );
  });

  test.afterAll(async () => {
    if (apiScenario) {
      await apiScenario.cleanup();
    }
  });

  test("GET /modal-data returns aggregated data from 5 services", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/v1/rating-slips/${apiScenario.ratingSlipId}/modal-data`,
      {
        headers: {
          Authorization: `Bearer ${apiScenario.authToken}`,
        },
      },
    );

    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    // Verify response structure
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();

    const { data } = body;

    // Slip section
    expect(data.slip).toBeDefined();
    expect(data.slip.id).toBe(apiScenario.ratingSlipId);
    expect(data.slip.visitId).toBe(apiScenario.visitId);
    expect(data.slip.tableId).toBe(apiScenario.tableId);
    expect(data.slip.seatNumber).toBe(apiScenario.seatNumber);
    expect(data.slip.status).toBe("open");
    expect(data.slip.averageBet).toBe(2500); // $25.00 in cents

    // Player section
    expect(data.player).toBeDefined();
    expect(data.player.id).toBe(apiScenario.playerId);
    expect(data.player.firstName).toBe("John");
    expect(data.player.lastName).toBe("TestPlayer");

    // Financial section
    expect(data.financial).toBeDefined();
    expect(data.financial.totalCashIn).toBe(5000); // $50.00 from test transaction

    // Tables section (for move player)
    expect(data.tables).toBeDefined();
    expect(Array.isArray(data.tables)).toBe(true);
  });

  test("GET /modal-data returns 404 for non-existent slip", async ({
    request,
  }) => {
    const fakeSlipId = "00000000-0000-0000-0000-000000000000";

    const response = await request.get(
      `/api/v1/rating-slips/${fakeSlipId}/modal-data`,
      {
        headers: {
          Authorization: `Bearer ${apiScenario.authToken}`,
        },
      },
    );

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("RATING_SLIP_NOT_FOUND");
  });

  test("POST /move validates destination seat availability", async ({
    request,
  }) => {
    // Try to move to an occupied seat (same seat we're already at)
    const response = await request.post(
      `/api/v1/rating-slips/${apiScenario.ratingSlipId}/move`,
      {
        headers: {
          Authorization: `Bearer ${apiScenario.authToken}`,
          "Idempotency-Key": `e2e_move_test_${Date.now()}`,
          "Content-Type": "application/json",
        },
        data: {
          destinationTableId: apiScenario.tableId,
          destinationSeatNumber: apiScenario.seatNumber, // Same seat = occupied
        },
      },
    );

    // Should fail because seat is occupied by current slip
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("SEAT_ALREADY_OCCUPIED");
  });

  test("POST /move succeeds with valid destination", async ({ request }) => {
    // Create a fresh scenario for this test
    const moveApiScenario = await createRatingSlipTestScenario();

    try {
      const response = await request.post(
        `/api/v1/rating-slips/${moveApiScenario.ratingSlipId}/move`,
        {
          headers: {
            Authorization: `Bearer ${moveApiScenario.authToken}`,
            "Idempotency-Key": `e2e_move_success_${Date.now()}`,
            "Content-Type": "application/json",
          },
          data: {
            destinationTableId: moveApiScenario.secondaryTableId,
            destinationSeatNumber: "5",
          },
        },
      );

      expect(response.ok()).toBeTruthy();
      const body = await response.json();

      expect(body.data.newSlipId).toBeDefined();
      expect(body.data.closedSlipId).toBe(moveApiScenario.ratingSlipId);

      // Verify new slip is at correct location
      const slips = await getRatingSlipsForVisit(moveApiScenario.visitId);
      const newSlip = slips.find((s) => s.id === body.data.newSlipId);
      expect(newSlip).toBeDefined();
      expect(newSlip?.table_id).toBe(moveApiScenario.secondaryTableId);
      expect(newSlip?.seat_number).toBe("5");
      expect(newSlip?.visit_id).toBe(moveApiScenario.visitId);
    } finally {
      await moveApiScenario.cleanup();
    }
  });
});

/**
 * PRD-019: Rating Slip Modal UX Refinements Tests
 *
 * Tests for the 5 UX defect fixes:
 * 1. Move player - optimistic seat updates, no auto-open
 * 2. Save changes - modal closes on success
 * 3. Points refresh - refetch button works
 * 4. Financial reactivity - chips taken updates summary
 * 5. Start time picker - no broken increment buttons
 *
 * @see PRD-019 Rating Slip Modal UX Refinements
 * @see EXECUTION-SPEC-PRD-019.md
 */
test.describe("PRD-019: Rating Slip Modal UX Refinements", () => {
  let scenario: RatingSlipTestScenario;

  test.beforeAll(async () => {
    scenario = await createRatingSlipTestScenario();
  });

  test.afterAll(async () => {
    if (scenario) {
      await scenario.cleanup();
    }
  });

  /**
   * Helper: Authenticate via browser
   */
  async function authenticateUser(page: Page) {
    await page.goto("/auth/login");
    await page.fill('input[name="email"]', scenario.testEmail);
    await page.fill('input[name="password"]', scenario.testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(pit|dashboard)/, { timeout: 10000 });
  }

  /**
   * Test 1: Move player shows optimistic seat update, no modal auto-open
   *
   * PRD-019 WS1 & WS2:
   * - Seat changes visible immediately (optimistic update)
   * - New slip modal does NOT auto-open
   * - Success toast displayed
   */
  test("move player updates seat optimistically without auto-opening new slip modal", async ({
    page,
  }) => {
    // Create a fresh scenario for this test
    const moveScenario = await createRatingSlipTestScenario();

    try {
      // Authenticate
      await page.goto("/auth/login");
      await page.fill('input[name="email"]', moveScenario.testEmail);
      await page.fill('input[name="password"]', moveScenario.testPassword);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(pit|dashboard)/, { timeout: 10000 });

      // Navigate to pit dashboard
      await page.goto("/pit");
      await page.waitForSelector('[data-testid="table-grid"]', {
        timeout: 10000,
      });

      // Click on occupied seat to open modal
      const seat = page.locator(
        `[data-seat-number="${moveScenario.seatNumber}"]`,
      );
      await seat.click();

      // Wait for modal to open
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Select destination table
      const tableSelect = modal.locator('[data-testid="move-table-select"]');
      await tableSelect.click();
      const tableOption = page.locator(
        `[data-table-option="${moveScenario.secondaryTableId}"]`,
      );
      await tableOption.click();

      // Enter destination seat
      const seatInput = modal.locator('[data-testid="move-seat-input"]');
      await seatInput.fill("3");

      // Click Move Player
      const moveButton = modal.locator('button:has-text("Move Player")');
      await moveButton.click();

      // Wait for success toast (PRD-019 WS3: toast on success)
      const toast = page.locator('text="Player moved"');
      await expect(toast).toBeVisible({ timeout: 5000 });

      // Verify modal CLOSES (PRD-019 WS2: no auto-open of new slip)
      await expect(modal).not.toBeVisible({ timeout: 5000 });

      // Verify original seat is now empty (optimistic update)
      const originalSeat = page.locator(
        `[data-seat-number="${moveScenario.seatNumber}"]`,
      );
      await expect(originalSeat).not.toHaveAttribute("data-occupied", "true");

      // User can manually click destination seat to open new slip
      // (Not verifying this as it would require navigating to different table)
    } finally {
      await moveScenario.cleanup();
    }
  });

  /**
   * Test 2: Save changes closes modal with success toast
   *
   * PRD-019 WS3:
   * - Modal closes on successful save
   * - Success toast displayed
   * - Modal stays open on error
   */
  test("save changes closes modal and shows success toast", async ({
    page,
  }) => {
    // Create fresh scenario
    const saveScenario = await createRatingSlipTestScenario();

    try {
      // Authenticate
      await page.goto("/auth/login");
      await page.fill('input[name="email"]', saveScenario.testEmail);
      await page.fill('input[name="password"]', saveScenario.testPassword);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(pit|dashboard)/, { timeout: 10000 });

      // Navigate to pit and open modal
      await page.goto("/pit");
      await page.waitForSelector('[data-testid="table-grid"]', {
        timeout: 10000,
      });

      const seat = page.locator(
        `[data-seat-number="${saveScenario.seatNumber}"]`,
      );
      await seat.click();

      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Make a change (increment average bet)
      const incrementButton = modal.locator(
        '[data-testid="average-bet-increment-25"]',
      );
      if (await incrementButton.isVisible()) {
        await incrementButton.click();
      }

      // Click Save Changes
      const saveButton = modal.locator('button:has-text("Save Changes")');
      await saveButton.click();

      // Wait for success toast
      const toast = page.locator('text="Rating slip saved"');
      await expect(toast).toBeVisible({ timeout: 5000 });

      // Verify modal closes
      await expect(modal).not.toBeVisible({ timeout: 5000 });
    } finally {
      await saveScenario.cleanup();
    }
  });

  /**
   * Test 3: Points refresh button fetches current balance
   *
   * PRD-019 WS4:
   * - Refresh button visible next to points
   * - Loading spinner appears during fetch
   * - Balance updates after refresh
   */
  test("points refresh button triggers data refetch", async ({ page }) => {
    // Authenticate
    await authenticateUser(page);

    // Navigate to pit and open modal
    await page.goto("/pit");
    await page.waitForSelector('[data-testid="table-grid"]', {
      timeout: 10000,
    });

    const seat = page.locator(`[data-seat-number="${scenario.seatNumber}"]`);
    await seat.click();

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Find refresh button (aria-label="Refresh points balance")
    const refreshButton = modal.locator(
      'button[aria-label="Refresh points balance"]',
    );
    await expect(refreshButton).toBeVisible();

    // Click refresh
    await refreshButton.click();

    // Verify loading state (RefreshCw icon should have animate-spin class)
    const spinningIcon = refreshButton.locator("svg.animate-spin");
    await expect(spinningIcon).toBeVisible({ timeout: 1000 });

    // Wait for loading to complete
    await expect(spinningIcon).not.toBeVisible({ timeout: 5000 });

    // Points balance should still be displayed (value may vary)
    const pointsDisplay = modal.locator("text=/\\d+/").first();
    await expect(pointsDisplay).toBeVisible();
  });

  /**
   * Test 4: Chips taken input reactively updates financial summary
   *
   * PRD-019 WS5:
   * - Entering chips taken immediately updates Chips Out
   * - Net Position recalculates
   * - No save required for display update
   */
  test("chips taken input reactively updates financial summary", async ({
    page,
  }) => {
    // Create scenario with known financial state
    const financialScenario = await createRatingSlipTestScenario();

    try {
      // Add initial cash-in transaction
      await createTestTransaction(
        financialScenario.casinoId,
        financialScenario.visitId,
        financialScenario.playerId,
        financialScenario.staffId,
        "in",
        10000, // $100.00
        "cash",
      );

      // Authenticate
      await page.goto("/auth/login");
      await page.fill('input[name="email"]', financialScenario.testEmail);
      await page.fill('input[name="password"]', financialScenario.testPassword);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(pit|dashboard)/, { timeout: 10000 });

      // Navigate to pit and open modal
      await page.goto("/pit");
      await page.waitForSelector('[data-testid="table-grid"]', {
        timeout: 10000,
      });

      const seat = page.locator(
        `[data-seat-number="${financialScenario.seatNumber}"]`,
      );
      await seat.click();

      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Note initial Chips Out value (should be $0.00)
      const chipsOutDisplay = modal.locator(
        '[data-testid="financial-summary"] >> text=/Chips Out.*\\$[\\d.]+/',
      );
      await expect(chipsOutDisplay).toContainText("$0.00");

      // Enter chips taken value ($50)
      const chipsTakenInput = modal.locator(
        '[data-testid="chips-taken-input"]',
      );
      await chipsTakenInput.fill("50");

      // Wait a moment for reactive update
      await page.waitForTimeout(100);

      // Verify Chips Out updated immediately (should now show $50.00)
      await expect(chipsOutDisplay).toContainText("$50.00");

      // Verify Net Position recalculated
      // Net = Cash In ($100) - Chips Out ($50) = $50.00
      const netPositionDisplay = modal.locator(
        '[data-testid="financial-summary"] >> text=/Net Position.*\\$[\\d.]+/',
      );
      await expect(netPositionDisplay).toContainText("$50.00");
    } finally {
      await financialScenario.cleanup();
    }
  });

  /**
   * Test 5: Start time picker - no broken increment buttons
   *
   * PRD-019 WS6:
   * - No +15m/-15m buttons exist (removed)
   * - Datetime-local input works for direct entry
   * - Total Change displays minutes difference
   * - Future time shows validation error
   */
  test("start time uses datetime picker without broken increment buttons", async ({
    page,
  }) => {
    // Authenticate
    await authenticateUser(page);

    // Navigate to pit and open modal
    await page.goto("/pit");
    await page.waitForSelector('[data-testid="table-grid"]', {
      timeout: 10000,
    });

    const seat = page.locator(`[data-seat-number="${scenario.seatNumber}"]`);
    await seat.click();

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Verify NO +15m/-15m buttons exist (PRD-019 WS6: removed broken buttons)
    const plus15Button = modal.locator('button:has-text("+15m")');
    const minus15Button = modal.locator('button:has-text("-15m")');
    await expect(plus15Button).not.toBeVisible();
    await expect(minus15Button).not.toBeVisible();

    // Verify datetime-local input exists and works
    const startTimeInput = modal.locator(
      'input#startTime[type="datetime-local"]',
    );
    await expect(startTimeInput).toBeVisible();

    // Get current value
    const currentValue = await startTimeInput.inputValue();
    expect(currentValue).toBeTruthy();

    // Verify "Total Change" display exists
    const totalChangeDisplay = modal.locator("text=/Total Change.*minutes/");
    await expect(totalChangeDisplay).toBeVisible();

    // Try setting a future time - should show validation error
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 2);
    const futureValue = futureDate.toISOString().slice(0, 16);

    await startTimeInput.fill(futureValue);

    // Verify validation error appears
    const validationError = modal.locator(
      'text="Start time cannot be in the future"',
    );
    await expect(validationError).toBeVisible({ timeout: 2000 });

    // Input should have error styling (border-destructive class)
    await expect(startTimeInput).toHaveClass(/border-destructive/);
  });
});
