/**
 * Rating Slip Lifecycle E2E Test
 *
 * Tests the complete happy path flow:
 * 1. Open table (set status to active)
 * 2. Start rating slip
 * 3. Pause rating slip
 * 4. Resume rating slip
 * 5. Close rating slip
 *
 * Verifies:
 * - All state transitions succeed
 * - Duration calculation excludes pause time
 * - Proper cleanup after test
 */

import { test, expect } from "@playwright/test";

import { createTestScenario } from "./fixtures/test-data";
import type { TestScenario } from "./fixtures/test-data";

test.describe("Rating Slip Full Lifecycle E2E", () => {
  let scenario: TestScenario;

  test.beforeEach(async () => {
    // Create fresh test data for each test
    scenario = await createTestScenario();
  });

  test.afterEach(async () => {
    // Clean up test data
    if (scenario?.cleanup) {
      await scenario.cleanup();
    }
  });

  test("completes full flow: open table -> start slip -> pause -> resume -> close", async ({
    request,
  }) => {
    // Helper to create authenticated request headers
    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${scenario.authToken}`,
    };

    // STEP 1: Open Table - Set table status to active
    await test.step("Open table (set status to active)", async () => {
      const response = await request.post("/api/v1/table-context/status", {
        data: {
          tableId: scenario.tableId,
          status: "active",
        },
        headers: authHeaders,
      });

      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body.status).toBe("active");
    });

    // STEP 2: Start Rating Slip
    let ratingSlipId: string;
    let startTime: number;

    await test.step("Start rating slip", async () => {
      startTime = Date.now();

      const response = await request.post("/api/v1/rating-slip/start", {
        data: {
          playerId: scenario.playerId,
          tableId: scenario.tableId,
          visitId: scenario.visitId,
          seatNumber: "1",
          gameSettings: {
            minBet: 10,
            maxBet: 500,
          },
        },
        headers: {
          ...authHeaders,
          "X-Idempotency-Key": `start-${Date.now()}`,
        },
      });

      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body.ratingSlipId).toBeDefined();
      ratingSlipId = body.ratingSlipId;
    });

    // STEP 3: Pause Rating Slip
    let pauseStartTime: number;

    await test.step("Pause rating slip", async () => {
      // Wait a bit to accumulate some active time
      await new Promise((resolve) => setTimeout(resolve, 100));

      pauseStartTime = Date.now();

      const response = await request.post(
        `/api/v1/rating-slip/${ratingSlipId}/pause`,
        {
          headers: {
            ...authHeaders,
            "X-Idempotency-Key": `pause-${Date.now()}`,
          },
        },
      );

      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.slip.status).toBe("paused");
    });

    // STEP 4: Wait during pause (this time should NOT be counted in duration)
    await test.step("Wait during pause (time should be excluded)", async () => {
      // Wait 200ms during pause
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    // STEP 5: Resume Rating Slip
    let pauseEndTime: number;

    await test.step("Resume rating slip", async () => {
      pauseEndTime = Date.now();

      const response = await request.post(
        `/api/v1/rating-slip/${ratingSlipId}/resume`,
        {
          headers: {
            ...authHeaders,
            "X-Idempotency-Key": `resume-${Date.now()}`,
          },
        },
      );

      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.slip.status).toBe("open");
    });

    // STEP 6: Wait a bit more after resume
    await test.step("Continue playing after resume", async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // STEP 7: Close Rating Slip
    await test.step("Close rating slip with final bet", async () => {
      const closeTime = Date.now();

      const response = await request.post(
        `/api/v1/rating-slip/${ratingSlipId}/close`,
        {
          data: {
            averageBet: 50,
          },
          headers: {
            ...authHeaders,
            "X-Idempotency-Key": `close-${Date.now()}`,
          },
        },
      );

      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body.slip.status).toBe("closed");
      expect(body.durationSeconds).toBeGreaterThan(0);

      // CRITICAL VERIFICATION: Duration should exclude pause time
      const totalElapsed = (closeTime - startTime) / 1000; // Convert to seconds
      const pauseDuration = (pauseEndTime - pauseStartTime) / 1000;
      const expectedActiveDuration = totalElapsed - pauseDuration;

      // Duration should be significantly less than total elapsed time
      // (allowing for some timing variance)
      expect(body.durationSeconds).toBeLessThan(totalElapsed - 0.1);

      // Duration should be roughly equal to expected active duration
      // (allowing for up to 0.2 second variance for async operations)
      expect(
        Math.abs(body.durationSeconds - expectedActiveDuration),
      ).toBeLessThan(0.2);

      // Verify average bet was recorded
      expect(body.slip.average_bet).toBe(50);
    });
  });
});
