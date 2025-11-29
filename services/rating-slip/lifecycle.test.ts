/**
 * Rating Slip Lifecycle Tests
 *
 * Unit tests for lifecycle operations, error mapping, and type guards
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/errors/domain-errors";
import type { Database } from "@/types/database.types";

import {
  closeSlip,
  getDuration,
  isValidCloseResponse,
  isValidDurationResponse,
  isValidRatingSlipData,
  pauseSlip,
  resumeSlip,
  startSlip,
  type RatingSlipDTO,
} from "./lifecycle";

// Mock Supabase client
function createMockSupabase() {
  return {
    rpc: jest.fn(),
  } as unknown as SupabaseClient<Database>;
}

// Test fixtures
const mockRatingSlipData: RatingSlipDTO = {
  id: "test-slip-id",
  player_id: "player-123",
  casino_id: "casino-456",
  visit_id: "visit-789",
  table_id: "table-101",
  game_settings: { minBet: 25, maxBet: 500 },
  average_bet: 50,
  start_time: "2025-11-28T10:00:00Z",
  end_time: null,
  status: "open",
  policy_snapshot: { points_per_dollar: 1 },
  seat_number: "1",
};

describe("Type Guards", () => {
  describe("isValidRatingSlipData", () => {
    it("validates valid rating slip data", () => {
      expect(isValidRatingSlipData(mockRatingSlipData)).toBe(true);
    });

    it("rejects null", () => {
      expect(isValidRatingSlipData(null)).toBe(false);
    });

    it("rejects missing required fields", () => {
      const invalid = { ...mockRatingSlipData };
      delete (invalid as Partial<RatingSlipDTO>).id;
      expect(isValidRatingSlipData(invalid)).toBe(false);
    });

    it("rejects invalid status values", () => {
      const invalid = { ...mockRatingSlipData, status: "invalid" };
      expect(isValidRatingSlipData(invalid)).toBe(false);
    });

    it("accepts nullable fields as null", () => {
      const valid = {
        ...mockRatingSlipData,
        visit_id: null,
        table_id: null,
        game_settings: null,
        average_bet: null,
        end_time: null,
        policy_snapshot: null,
        seat_number: null,
      };
      expect(isValidRatingSlipData(valid)).toBe(true);
    });
  });

  describe("isValidCloseResponse", () => {
    it("validates valid close response", () => {
      const valid = [
        {
          slip: mockRatingSlipData,
          duration_seconds: 3600,
        },
      ];
      expect(isValidCloseResponse(valid)).toBe(true);
    });

    it("rejects non-array", () => {
      expect(isValidCloseResponse({ slip: mockRatingSlipData })).toBe(false);
    });

    it("rejects empty array", () => {
      expect(isValidCloseResponse([])).toBe(false);
    });

    it("rejects missing duration_seconds", () => {
      expect(isValidCloseResponse([{ slip: mockRatingSlipData }])).toBe(false);
    });

    it("rejects invalid slip data", () => {
      expect(
        isValidCloseResponse([{ slip: { id: "test" }, duration_seconds: 100 }]),
      ).toBe(false);
    });
  });

  describe("isValidDurationResponse", () => {
    it("validates positive number", () => {
      expect(isValidDurationResponse(3600)).toBe(true);
    });

    it("validates zero", () => {
      expect(isValidDurationResponse(0)).toBe(true);
    });

    it("rejects negative number", () => {
      expect(isValidDurationResponse(-100)).toBe(false);
    });

    it("rejects non-number", () => {
      expect(isValidDurationResponse("3600")).toBe(false);
    });
  });
});

describe("Lifecycle Operations", () => {
  describe("startSlip", () => {
    it("returns rating slip on success", async () => {
      const supabase = createMockSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: mockRatingSlipData,
        error: null,
      });

      const result = await startSlip(supabase, "casino-456", "actor-123", {
        playerId: "player-123",
        tableId: "table-101",
        visitId: "visit-789",
        seatNumber: "1",
        gameSettings: { minBet: 25, maxBet: 500 },
      });

      expect(result).toEqual(mockRatingSlipData);
      expect(supabase.rpc).toHaveBeenCalledWith("rpc_start_rating_slip", {
        p_casino_id: "casino-456",
        p_actor_id: "actor-123",
        p_player_id: "player-123",
        p_table_id: "table-101",
        p_visit_id: "visit-789",
        p_seat_number: "1",
        p_game_settings: { minBet: 25, maxBet: 500 },
      });
    });

    it("throws VISIT_NOT_OPEN on visit error", async () => {
      const supabase = createMockSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: { message: "Visit not open" },
      });

      await expect(
        startSlip(supabase, "casino-456", "actor-123", {
          playerId: "player-123",
          tableId: "table-101",
          visitId: "visit-789",
          seatNumber: "1",
          gameSettings: {},
        }),
      ).rejects.toThrow(DomainError);
    });

    it("throws on invalid response", async () => {
      const supabase = createMockSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: { invalid: "data" },
        error: null,
      });

      await expect(
        startSlip(supabase, "casino-456", "actor-123", {
          playerId: "player-123",
          tableId: "table-101",
          visitId: "visit-789",
          seatNumber: "1",
          gameSettings: {},
        }),
      ).rejects.toThrow(DomainError);
    });
  });

  describe("pauseSlip", () => {
    it("returns paused rating slip on success", async () => {
      const supabase = createMockSupabase();
      const pausedSlip = { ...mockRatingSlipData, status: "paused" as const };
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: pausedSlip,
        error: null,
      });

      const result = await pauseSlip(
        supabase,
        "casino-456",
        "actor-123",
        "slip-id",
      );

      expect(result.status).toBe("paused");
    });

    it("throws RATING_SLIP_NOT_OPEN on state error", async () => {
      const supabase = createMockSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: { message: "Rating slip not open" },
      });

      await expect(
        pauseSlip(supabase, "casino-456", "actor-123", "slip-id"),
      ).rejects.toThrow(DomainError);
    });
  });

  describe("resumeSlip", () => {
    it("returns resumed rating slip on success", async () => {
      const supabase = createMockSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: mockRatingSlipData,
        error: null,
      });

      const result = await resumeSlip(
        supabase,
        "casino-456",
        "actor-123",
        "slip-id",
      );

      expect(result.status).toBe("open");
    });

    it("throws RATING_SLIP_NOT_PAUSED on state error", async () => {
      const supabase = createMockSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: { message: "Rating slip not paused" },
      });

      await expect(
        resumeSlip(supabase, "casino-456", "actor-123", "slip-id"),
      ).rejects.toThrow(DomainError);
    });
  });

  describe("closeSlip", () => {
    it("returns closed slip with duration on success", async () => {
      const supabase = createMockSupabase();
      const closedSlip = {
        ...mockRatingSlipData,
        status: "closed" as const,
        end_time: "2025-11-28T11:00:00Z",
      };
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [{ slip: closedSlip, duration_seconds: 3600 }],
        error: null,
      });

      const result = await closeSlip(
        supabase,
        "casino-456",
        "actor-123",
        "slip-id",
        75.5,
      );

      expect(result.status).toBe("closed");
      expect(result.duration_seconds).toBe(3600);
    });

    it("passes optional averageBet parameter", async () => {
      const supabase = createMockSupabase();
      const closedSlip = {
        ...mockRatingSlipData,
        status: "closed" as const,
        average_bet: 100,
      };
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [{ slip: closedSlip, duration_seconds: 3600 }],
        error: null,
      });

      await closeSlip(supabase, "casino-456", "actor-123", "slip-id", 100);

      expect(supabase.rpc).toHaveBeenCalledWith("rpc_close_rating_slip", {
        p_casino_id: "casino-456",
        p_actor_id: "actor-123",
        p_rating_slip_id: "slip-id",
        p_average_bet: 100,
      });
    });
  });

  describe("getDuration", () => {
    it("returns duration in seconds", async () => {
      const supabase = createMockSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: 3600,
        error: null,
      });

      const duration = await getDuration(supabase, "slip-id");

      expect(duration).toBe(3600);
    });

    it("passes optional asOf parameter", async () => {
      const supabase = createMockSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: 1800,
        error: null,
      });

      await getDuration(supabase, "slip-id", "2025-11-28T10:30:00Z");

      expect(supabase.rpc).toHaveBeenCalledWith(
        "rpc_get_rating_slip_duration",
        {
          p_rating_slip_id: "slip-id",
          p_as_of: "2025-11-28T10:30:00Z",
        },
      );
    });

    it("throws on invalid response", async () => {
      const supabase = createMockSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: -100,
        error: null,
      });

      await expect(getDuration(supabase, "slip-id")).rejects.toThrow(
        DomainError,
      );
    });
  });
});
