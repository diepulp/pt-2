/**
 * Unit tests for useCloseWithFinancial mutation hook
 *
 * Tests the combined operation of:
 * 1. Recording chips-taken observation (if chipsTaken > 0 and player exists)
 *    - NOW writes to pit_cash_observation via RPC (PRD-OPS-CASH-OBS-001)
 *    - NO LONGER writes to player_financial_transaction (regression verified)
 * 2. Closing the rating slip (with optional final average_bet)
 * 3. Error handling: surfaces errors via toast notification
 *
 * @see PRD-008a Rating Slip Modal Dashboard Integration - WS7
 * @see PRD-OPS-CASH-OBS-001 Operational Cash-Out Observations
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";

// Mock dependencies
jest.mock("@/services/pit-observation/http");
jest.mock("@/services/rating-slip/http");
jest.mock("@/services/loyalty/http");
jest.mock("@/hooks/ui", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

// REGRESSION: Verify we never import the old financial transaction service
// This import would fail if someone accidentally re-adds the import
jest.mock("@/services/player-financial/http", () => ({
  createFinancialTransaction: jest.fn(() => {
    throw new Error(
      "REGRESSION FAILURE: createFinancialTransaction should not be called. " +
        "PRD-OPS-CASH-OBS-001 requires using createPitCashObservation instead.",
    );
  }),
}));

import { toast } from "@/hooks/ui";
import { accrueOnClose } from "@/services/loyalty/http";
import {
  createPitCashObservation,
  PitObservationError,
} from "@/services/pit-observation/http";
import { closeRatingSlip } from "@/services/rating-slip/http";

import { useCloseWithFinancial } from "../use-close-with-financial";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
    logger: {
      log: () => {},
      warn: () => {},
      error: () => {},
    },
  });

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useCloseWithFinancial", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (closeRatingSlip as jest.Mock).mockResolvedValue({
      id: "slip-1",
      status: "closed",
      duration_seconds: 3600,
    });
    (createPitCashObservation as jest.Mock).mockResolvedValue({
      id: "obs-1",
      visitId: "visit-1",
      amount: 500,
      amountKind: "estimate",
      source: "walk_with",
    });
    (accrueOnClose as jest.Mock).mockResolvedValue({
      pointsAwarded: 100,
    });
  });

  describe("basic close functionality", () => {
    it("should close slip without observation when chipsTaken is 0", async () => {
      const { result } = renderHook(() => useCloseWithFinancial(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        slipId: "slip-1",
        visitId: "visit-1",
        playerId: "player-1",
        casinoId: "casino-1",
        tableId: "table-1",
        staffId: "staff-1",
        chipsTaken: 0,
        averageBet: 25,
      });

      expect(createPitCashObservation).not.toHaveBeenCalled();
      expect(closeRatingSlip).toHaveBeenCalledWith("slip-1", {
        average_bet: 25,
      });
    });

    it("should pass final average_bet to close endpoint", async () => {
      const { result } = renderHook(() => useCloseWithFinancial(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        slipId: "slip-1",
        visitId: "visit-1",
        playerId: "player-1",
        casinoId: "casino-1",
        tableId: "table-1",
        staffId: "staff-1",
        chipsTaken: 0,
        averageBet: 100,
      });

      expect(closeRatingSlip).toHaveBeenCalledWith("slip-1", {
        average_bet: 100,
      });
    });

    it("should close without average_bet when not provided", async () => {
      const { result } = renderHook(() => useCloseWithFinancial(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        slipId: "slip-1",
        visitId: "visit-1",
        playerId: "player-1",
        casinoId: "casino-1",
        tableId: "table-1",
        staffId: "staff-1",
        chipsTaken: 0,
        // averageBet is undefined
      });

      expect(closeRatingSlip).toHaveBeenCalledWith("slip-1", undefined);
    });
  });

  describe("pit cash observation (PRD-OPS-CASH-OBS-001)", () => {
    it("should record pit cash observation when chipsTaken > 0", async () => {
      const { result } = renderHook(() => useCloseWithFinancial(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        slipId: "slip-1",
        visitId: "visit-1",
        playerId: "player-1",
        casinoId: "casino-1",
        tableId: "table-1",
        staffId: "staff-1",
        chipsTaken: 500,
        averageBet: 50,
      });

      // Verify pit cash observation is called with correct payload
      expect(createPitCashObservation).toHaveBeenCalledWith({
        visitId: "visit-1",
        amount: 500, // Amount in dollars (NOT cents!)
        ratingSlipId: "slip-1",
        amountKind: "estimate",
        source: "walk_with",
        idempotencyKey: "chips-taken-slip-1",
      });
      expect(closeRatingSlip).toHaveBeenCalledWith("slip-1", {
        average_bet: 50,
      });
    });

    it("should skip observation for ghost visit (null playerId)", async () => {
      const { result } = renderHook(() => useCloseWithFinancial(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        slipId: "slip-1",
        visitId: "visit-1",
        playerId: null, // Ghost visit
        casinoId: "casino-1",
        tableId: "table-1",
        staffId: "staff-1",
        chipsTaken: 500,
        averageBet: 50,
      });

      expect(createPitCashObservation).not.toHaveBeenCalled();
      expect(closeRatingSlip).toHaveBeenCalledWith("slip-1", {
        average_bet: 50,
      });
    });

    it("should use slipId as idempotency key for deduplication", async () => {
      const { result } = renderHook(() => useCloseWithFinancial(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        slipId: "unique-slip-id",
        visitId: "visit-1",
        playerId: "player-1",
        casinoId: "casino-1",
        tableId: "table-1",
        staffId: "staff-1",
        chipsTaken: 100,
      });

      expect(createPitCashObservation).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: "chips-taken-unique-slip-id",
        }),
      );
    });
  });

  describe("error handling", () => {
    it("should surface observation errors via toast and still close slip", async () => {
      // Create an error that looks like PitObservationError
      // Note: instanceof check fails with mocked modules, so hook uses fallback message
      (createPitCashObservation as jest.Mock).mockRejectedValue(
        new Error("FORBIDDEN: Your role is not authorized"),
      );

      const { result } = renderHook(() => useCloseWithFinancial(), {
        wrapper: createWrapper(),
      });

      // Should not throw - observation failure doesn't block close
      await result.current.mutateAsync({
        slipId: "slip-1",
        visitId: "visit-1",
        playerId: "player-1",
        casinoId: "casino-1",
        tableId: "table-1",
        staffId: "staff-1",
        chipsTaken: 500,
        averageBet: 50,
      });

      // Error should be surfaced via toast (fallback message since instanceof fails in mocks)
      expect(toast.error).toHaveBeenCalledWith("Chips Taken Error", {
        description: "Failed to record chips taken observation",
      });

      // Slip close should still succeed
      expect(closeRatingSlip).toHaveBeenCalledWith("slip-1", {
        average_bet: 50,
      });
    });

    it("should handle generic errors with fallback message", async () => {
      (createPitCashObservation as jest.Mock).mockRejectedValue(
        new Error("Network error"),
      );

      const { result } = renderHook(() => useCloseWithFinancial(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        slipId: "slip-1",
        visitId: "visit-1",
        playerId: "player-1",
        casinoId: "casino-1",
        tableId: "table-1",
        staffId: "staff-1",
        chipsTaken: 500,
      });

      expect(toast.error).toHaveBeenCalledWith("Chips Taken Error", {
        description: "Failed to record chips taken observation",
      });
    });

    it("should propagate close errors (observation is best-effort, close is critical)", async () => {
      (closeRatingSlip as jest.Mock).mockRejectedValue(
        new Error("Close failed"),
      );

      const { result } = renderHook(() => useCloseWithFinancial(), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.mutateAsync({
          slipId: "slip-1",
          visitId: "visit-1",
          playerId: "player-1",
          casinoId: "casino-1",
          tableId: "table-1",
          staffId: "staff-1",
          chipsTaken: 500,
        }),
      ).rejects.toThrow("Close failed");
    });
  });

  describe("REGRESSION: financial transaction should NOT be used", () => {
    /**
     * PRD-OPS-CASH-OBS-001 REGRESSION TEST
     *
     * This test verifies that the hook does NOT call createFinancialTransaction.
     * The chips-taken feature was changed to write to pit_cash_observation instead.
     *
     * If this test fails, it means someone accidentally re-introduced the
     * financial transaction call, which would cause pit bosses to get silent
     * permission errors (SEC-005 blocks direction='out').
     */
    it("should never call createFinancialTransaction", async () => {
      // The mock for createFinancialTransaction throws an error if called
      // This test passes if no error is thrown
      const { result } = renderHook(() => useCloseWithFinancial(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        slipId: "slip-1",
        visitId: "visit-1",
        playerId: "player-1",
        casinoId: "casino-1",
        tableId: "table-1",
        staffId: "staff-1",
        chipsTaken: 500,
        averageBet: 50,
      });

      // If we got here without error, the regression test passes
      expect(createPitCashObservation).toHaveBeenCalled();
    });
  });

  describe("cache invalidation", () => {
    it("should invalidate correct queries on success", async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useCloseWithFinancial(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      });

      await result.current.mutateAsync({
        slipId: "slip-1",
        visitId: "visit-1",
        playerId: "player-1",
        casinoId: "casino-1",
        tableId: "table-1",
        staffId: "staff-1",
        chipsTaken: 500,
        averageBet: 50,
      });

      // Verify invalidateQueries was called
      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalled();
      });

      // Get all the query keys that were invalidated
      const invalidatedKeys = invalidateSpy.mock.calls.map(
        (call) => call[0]?.queryKey,
      );

      // Should invalidate modal data for this slip
      expect(invalidatedKeys).toContainEqual(
        expect.arrayContaining(["rating-slip-modal", "data", "slip-1"]),
      );

      // Should invalidate visit summary
      expect(invalidatedKeys).toContainEqual(
        expect.arrayContaining(["player-financial", "visit-summary", "visit-1"]),
      );

      // Should invalidate dashboard active slips for this table
      expect(invalidatedKeys).toContainEqual(
        expect.arrayContaining(["dashboard", "active-slips", "table-1"]),
      );

      // Should invalidate dashboard stats for casino
      expect(invalidatedKeys).toContainEqual(
        expect.arrayContaining(["dashboard", "stats", "casino-1"]),
      );
    });
  });
});
