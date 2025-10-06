/**
 * RatingSlip Service Tests - TDD approach for RatingSlip vertical slice
 * Following Phase 2 requirements: write tests before implementation
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { createRatingSlipService } from "@/services/ratingslip";
import { createPlayerService } from "@/services/player";
import { createVisitService } from "@/services/visit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Test casino ID from database
const TEST_CASINO_ID = "550e8400-e29b-41d4-a716-446655440010";

describe("RatingSlip Service - Create RatingSlip", () => {
  let supabase: SupabaseClient<Database>;
  let ratingSlipService: ReturnType<typeof createRatingSlipService>;
  let playerService: ReturnType<typeof createPlayerService>;
  let visitService: ReturnType<typeof createVisitService>;
  let testPlayerId: string;
  let testVisitId: string;

  beforeEach(async () => {
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
    ratingSlipService = createRatingSlipService(supabase);
    playerService = createPlayerService(supabase);
    visitService = createVisitService(supabase);

    // Create test player
    const playerResult = await playerService.create({
      email: `ratingslip-test-${Date.now()}@example.com`,
      firstName: "RatingSlip",
      lastName: "Tester",
    });
    expect(playerResult.success).toBe(true);
    testPlayerId = playerResult.data!.id;

    // Create test visit
    const visitResult = await visitService.create({
      playerId: testPlayerId,
      casinoId: TEST_CASINO_ID,
      checkInDate: new Date().toISOString(),
    });
    expect(visitResult.success).toBe(true);
    testVisitId = visitResult.data!.id;
  });

  describe("Happy Path", () => {
    it("should create a rating slip with required fields", async () => {
      const result = await ratingSlipService.create({
        playerId: testPlayerId,
        visitId: testVisitId,
        averageBet: 25.0,
        gameSettings: { game: "blackjack", minBet: 10 },
        startTime: new Date().toISOString(),
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data?.playerId).toBe(testPlayerId);
      expect(result.data?.visit_id).toBe(testVisitId);
      expect(result.data?.average_bet).toBe(25.0);
      expect(result.data?.id).toBeDefined();
      expect(result.data?.status).toBeDefined(); // Should have default value
      expect(result.data?.points).toBeDefined(); // Should have default value
    });

    it("should create a rating slip with optional fields", async () => {
      const result = await ratingSlipService.create({
        playerId: testPlayerId,
        visitId: testVisitId,
        averageBet: 50.0,
        gameSettings: { game: "roulette" },
        startTime: new Date().toISOString(),
        seatNumber: 3,
        cashIn: 500,
        chipsBrought: 100,
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data?.seat_number).toBe(3);
      expect(result.data?.cash_in).toBe(500);
      expect(result.data?.chips_brought).toBe(100);
    });
  });

  describe("Foreign Key Violation Error", () => {
    it("should return error when player does not exist", async () => {
      const nonExistentPlayerId = "00000000-0000-0000-0000-000000000000";

      const result = await ratingSlipService.create({
        playerId: nonExistentPlayerId,
        visitId: testVisitId,
        averageBet: 25.0,
        gameSettings: { game: "blackjack" },
        startTime: new Date().toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("FOREIGN_KEY_VIOLATION");
      expect(result.data).toBeNull();
    });

    it("should return error when visit does not exist", async () => {
      const nonExistentVisitId = "00000000-0000-0000-0000-000000000000";

      const result = await ratingSlipService.create({
        playerId: testPlayerId,
        visitId: nonExistentVisitId,
        averageBet: 25.0,
        gameSettings: { game: "blackjack" },
        startTime: new Date().toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("FOREIGN_KEY_VIOLATION");
      expect(result.data).toBeNull();
    });
  });
});

describe("RatingSlip Service - Get By Id", () => {
  let supabase: SupabaseClient<Database>;
  let ratingSlipService: ReturnType<typeof createRatingSlipService>;
  let playerService: ReturnType<typeof createPlayerService>;
  let visitService: ReturnType<typeof createVisitService>;
  let testPlayerId: string;
  let testVisitId: string;

  beforeEach(async () => {
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
    ratingSlipService = createRatingSlipService(supabase);
    playerService = createPlayerService(supabase);
    visitService = createVisitService(supabase);

    // Create test player and visit
    const playerResult = await playerService.create({
      email: `ratingslip-getbyid-${Date.now()}@example.com`,
      firstName: "GetById",
      lastName: "Test",
    });
    expect(playerResult.success).toBe(true);
    testPlayerId = playerResult.data!.id;

    const visitResult = await visitService.create({
      playerId: testPlayerId,
      casinoId: TEST_CASINO_ID,
      checkInDate: new Date().toISOString(),
    });
    expect(visitResult.success).toBe(true);
    testVisitId = visitResult.data!.id;
  });

  describe("Happy Path", () => {
    it("should retrieve an existing rating slip by id", async () => {
      // Create a rating slip first
      const createResult = await ratingSlipService.create({
        playerId: testPlayerId,
        visitId: testVisitId,
        averageBet: 25.0,
        gameSettings: { game: "poker" },
        startTime: new Date().toISOString(),
      });
      expect(createResult.success).toBe(true);
      const ratingSlipId = createResult.data!.id;

      // Retrieve the rating slip
      const result = await ratingSlipService.getById(ratingSlipId);

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe(ratingSlipId);
      expect(result.data?.playerId).toBe(testPlayerId);
      expect(result.data?.average_bet).toBe(25.0);
    });
  });

  describe("Not Found Error", () => {
    it("should return NOT_FOUND error for non-existent rating slip", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const result = await ratingSlipService.getById(nonExistentId);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("NOT_FOUND");
      expect(result.data).toBeNull();
    });
  });
});

describe("RatingSlip Service - Update RatingSlip", () => {
  let supabase: SupabaseClient<Database>;
  let ratingSlipService: ReturnType<typeof createRatingSlipService>;
  let playerService: ReturnType<typeof createPlayerService>;
  let visitService: ReturnType<typeof createVisitService>;
  let testPlayerId: string;
  let testVisitId: string;

  beforeEach(async () => {
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
    ratingSlipService = createRatingSlipService(supabase);
    playerService = createPlayerService(supabase);
    visitService = createVisitService(supabase);

    // Create test player and visit
    const playerResult = await playerService.create({
      email: `ratingslip-update-${Date.now()}@example.com`,
      firstName: "Update",
      lastName: "Test",
    });
    expect(playerResult.success).toBe(true);
    testPlayerId = playerResult.data!.id;

    const visitResult = await visitService.create({
      playerId: testPlayerId,
      casinoId: TEST_CASINO_ID,
      checkInDate: new Date().toISOString(),
    });
    expect(visitResult.success).toBe(true);
    testVisitId = visitResult.data!.id;
  });

  describe("Happy Path", () => {
    it("should update rating slip status", async () => {
      // Create a rating slip first
      const createResult = await ratingSlipService.create({
        playerId: testPlayerId,
        visitId: testVisitId,
        averageBet: 25.0,
        gameSettings: { game: "slots" },
        startTime: new Date().toISOString(),
      });
      expect(createResult.success).toBe(true);
      const ratingSlipId = createResult.data!.id;

      // Update the status
      const result = await ratingSlipService.update(ratingSlipId, {
        status: "CLOSED",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data?.id).toBe(ratingSlipId);
      expect(result.data?.status).toBe("CLOSED");
    });

    it("should update rating slip average bet", async () => {
      // Create a rating slip first
      const createResult = await ratingSlipService.create({
        playerId: testPlayerId,
        visitId: testVisitId,
        averageBet: 25.0,
        gameSettings: { game: "blackjack" },
        startTime: new Date().toISOString(),
      });
      expect(createResult.success).toBe(true);
      const ratingSlipId = createResult.data!.id;

      // Update the average bet
      const result = await ratingSlipService.update(ratingSlipId, {
        averageBet: 50.0,
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data?.average_bet).toBe(50.0);
    });

    it("should update rating slip end time and chips taken", async () => {
      // Create a rating slip first
      const createResult = await ratingSlipService.create({
        playerId: testPlayerId,
        visitId: testVisitId,
        averageBet: 25.0,
        gameSettings: { game: "craps" },
        startTime: new Date().toISOString(),
        chipsBrought: 100,
      });
      expect(createResult.success).toBe(true);
      const ratingSlipId = createResult.data!.id;

      // Update end time and chips taken
      const endTime = new Date().toISOString();
      const result = await ratingSlipService.update(ratingSlipId, {
        endTime: endTime,
        chipsTaken: 150,
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data?.end_time).toBeDefined();
      expect(result.data?.chips_taken).toBe(150);
    });
  });

  describe("Not Found Error", () => {
    it("should return NOT_FOUND error when updating non-existent rating slip", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const result = await ratingSlipService.update(nonExistentId, {
        status: "CLOSED",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("NOT_FOUND");
      expect(result.data).toBeNull();
    });
  });
});
