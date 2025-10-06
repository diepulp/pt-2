/**
 * Visit Service Tests - TDD approach for Visit vertical slice
 * Following Phase 2 requirements: write tests before implementation
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createVisitService } from "@/services/visit";
import { createPlayerService } from "@/services/player";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

describe("Visit Service - Create Visit", () => {
  let supabase: SupabaseClient<Database>;
  let visitService: ReturnType<typeof createVisitService>;
  let playerService: ReturnType<typeof createPlayerService>;
  let testPlayerId: string;

  beforeEach(async () => {
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
    visitService = createVisitService(supabase);
    playerService = createPlayerService(supabase);

    // Create a test player for visit tests
    const playerResult = await playerService.create({
      email: `visit-test-${Date.now()}@example.com`,
      firstName: "Visit",
      lastName: "Tester",
    });
    expect(playerResult.success).toBe(true);
    testPlayerId = playerResult.data!.id;
  });

  describe("Happy Path", () => {
    it("should create a visit with required fields", async () => {
      const result = await visitService.create({
        playerId: testPlayerId,
        casinoId: "00000000-0000-0000-0000-000000000001", // Assuming casino exists
        checkInDate: new Date().toISOString(),
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data?.player_id).toBe(testPlayerId);
      expect(result.data?.casino_id).toBe("00000000-0000-0000-0000-000000000001");
      expect(result.data?.id).toBeDefined();
      expect(result.data?.mode).toBeDefined(); // Should have default value
      expect(result.data?.status).toBeDefined(); // Should have default value
    });

    it("should create a visit with optional mode and status", async () => {
      const result = await visitService.create({
        playerId: testPlayerId,
        casinoId: "00000000-0000-0000-0000-000000000001",
        checkInDate: new Date().toISOString(),
        mode: "RATED",
        status: "ONGOING",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data?.mode).toBe("RATED");
      expect(result.data?.status).toBe("ONGOING");
    });
  });

  describe("Foreign Key Violation Error", () => {
    it("should return error when player does not exist", async () => {
      const nonExistentPlayerId = "00000000-0000-0000-0000-000000000000";

      const result = await visitService.create({
        playerId: nonExistentPlayerId,
        casinoId: "00000000-0000-0000-0000-000000000001",
        checkInDate: new Date().toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("FOREIGN_KEY_VIOLATION");
      expect(result.data).toBeNull();
    });

    it("should return error when casino does not exist", async () => {
      const nonExistentCasinoId = "00000000-0000-0000-0000-000000000000";

      const result = await visitService.create({
        playerId: testPlayerId,
        casinoId: nonExistentCasinoId,
        checkInDate: new Date().toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("FOREIGN_KEY_VIOLATION");
      expect(result.data).toBeNull();
    });
  });
});

describe("Visit Service - Get By Id", () => {
  let supabase: SupabaseClient<Database>;
  let visitService: ReturnType<typeof createVisitService>;
  let playerService: ReturnType<typeof createPlayerService>;
  let testPlayerId: string;

  beforeEach(async () => {
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
    visitService = createVisitService(supabase);
    playerService = createPlayerService(supabase);

    // Create a test player
    const playerResult = await playerService.create({
      email: `visit-getbyid-${Date.now()}@example.com`,
      firstName: "GetById",
      lastName: "Test",
    });
    expect(playerResult.success).toBe(true);
    testPlayerId = playerResult.data!.id;
  });

  describe("Happy Path", () => {
    it("should retrieve an existing visit by id", async () => {
      // Create a visit first
      const createResult = await visitService.create({
        playerId: testPlayerId,
        casinoId: "00000000-0000-0000-0000-000000000001",
        checkInDate: new Date().toISOString(),
      });
      expect(createResult.success).toBe(true);
      const visitId = createResult.data!.id;

      // Retrieve the visit
      const result = await visitService.getById(visitId);

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe(visitId);
      expect(result.data?.player_id).toBe(testPlayerId);
    });
  });

  describe("Not Found Error", () => {
    it("should return NOT_FOUND error for non-existent visit", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const result = await visitService.getById(nonExistentId);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("NOT_FOUND");
      expect(result.data).toBeNull();
    });
  });
});

describe("Visit Service - Update Visit", () => {
  let supabase: SupabaseClient<Database>;
  let visitService: ReturnType<typeof createVisitService>;
  let playerService: ReturnType<typeof createPlayerService>;
  let testPlayerId: string;

  beforeEach(async () => {
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
    visitService = createVisitService(supabase);
    playerService = createPlayerService(supabase);

    // Create a test player
    const playerResult = await playerService.create({
      email: `visit-update-${Date.now()}@example.com`,
      firstName: "Update",
      lastName: "Test",
    });
    expect(playerResult.success).toBe(true);
    testPlayerId = playerResult.data!.id;
  });

  describe("Happy Path", () => {
    it("should update visit status", async () => {
      // Create a visit first
      const createResult = await visitService.create({
        playerId: testPlayerId,
        casinoId: "00000000-0000-0000-0000-000000000001",
        checkInDate: new Date().toISOString(),
        status: "ONGOING",
      });
      expect(createResult.success).toBe(true);
      const visitId = createResult.data!.id;

      // Update the status
      const result = await visitService.update(visitId, {
        status: "COMPLETED",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data?.id).toBe(visitId);
      expect(result.data?.status).toBe("COMPLETED");
    });

    it("should update visit check_out_date", async () => {
      // Create a visit first
      const createResult = await visitService.create({
        playerId: testPlayerId,
        casinoId: "00000000-0000-0000-0000-000000000001",
        checkInDate: new Date().toISOString(),
      });
      expect(createResult.success).toBe(true);
      const visitId = createResult.data!.id;

      // Update check_out_date
      const checkOutDate = new Date().toISOString();
      const result = await visitService.update(visitId, {
        checkOutDate: checkOutDate,
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data?.check_out_date).toBe(checkOutDate);
    });

    it("should update visit mode", async () => {
      // Create a visit first
      const createResult = await visitService.create({
        playerId: testPlayerId,
        casinoId: "00000000-0000-0000-0000-000000000001",
        checkInDate: new Date().toISOString(),
        mode: "UNRATED",
      });
      expect(createResult.success).toBe(true);
      const visitId = createResult.data!.id;

      // Update mode
      const result = await visitService.update(visitId, {
        mode: "RATED",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data?.mode).toBe("RATED");
    });
  });

  describe("Not Found Error", () => {
    it("should return NOT_FOUND error when updating non-existent visit", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const result = await visitService.update(nonExistentId, {
        status: "COMPLETED",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("NOT_FOUND");
      expect(result.data).toBeNull();
    });
  });
});
