/**
 * Player Service Tests - TDD approach for Player vertical slice
 * Following Phase 2 requirements: write tests before implementation
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createPlayerService } from "@/services/player";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

describe("Player Service - Create Player", () => {
  let supabase: SupabaseClient<Database>;
  let playerService: ReturnType<typeof createPlayerService>;

  beforeEach(() => {
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
    playerService = createPlayerService(supabase);
  });

  describe("Happy Path", () => {
    it("should create a player with email and name", async () => {
      const result = await playerService.create({
        email: `test-${Date.now()}@example.com`,
        firstName: "John",
        lastName: "Doe",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data?.email).toBeDefined();
      expect(result.data?.firstName).toBe("John");
      expect(result.data?.lastName).toBe("Doe");
      expect(result.data?.id).toBeDefined();
    });
  });

  describe("Duplicate Email Error", () => {
    it("should return error when email already exists", async () => {
      const email = `duplicate-${Date.now()}@example.com`;

      // First create
      const firstResult = await playerService.create({
        email,
        firstName: "First",
        lastName: "User",
      });
      expect(firstResult.success).toBe(true);

      // Attempt duplicate
      const duplicateResult = await playerService.create({
        email,
        firstName: "Second",
        lastName: "User",
      });

      expect(duplicateResult.success).toBe(false);
      expect(duplicateResult.error).toBeDefined();
      expect(duplicateResult.error?.code).toBe("DUPLICATE_EMAIL");
      expect(duplicateResult.data).toBeNull();
    });
  });
});

describe("Player Service - Get By Id", () => {
  let supabase: SupabaseClient<Database>;
  let playerService: ReturnType<typeof createPlayerService>;

  beforeEach(() => {
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
    playerService = createPlayerService(supabase);
  });

  describe("Happy Path", () => {
    it("should retrieve an existing player by id", async () => {
      // Create a player first
      const createResult = await playerService.create({
        email: `getbyid-${Date.now()}@example.com`,
        firstName: "Jane",
        lastName: "Smith",
      });
      expect(createResult.success).toBe(true);
      const playerId = createResult.data!.id;

      // Retrieve the player
      const result = await playerService.getById(playerId);

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe(playerId);
      expect(result.data?.firstName).toBe("Jane");
      expect(result.data?.lastName).toBe("Smith");
    });
  });

  describe("Not Found Error", () => {
    it("should return NOT_FOUND error for non-existent player", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const result = await playerService.getById(nonExistentId);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("NOT_FOUND");
      expect(result.data).toBeNull();
    });
  });
});

describe("Player Service - Update Player", () => {
  let supabase: SupabaseClient<Database>;
  let playerService: ReturnType<typeof createPlayerService>;

  beforeEach(() => {
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
    playerService = createPlayerService(supabase);
  });

  describe("Happy Path", () => {
    it("should update player firstName and lastName", async () => {
      // Create a player first
      const createResult = await playerService.create({
        email: `update-${Date.now()}@example.com`,
        firstName: "Original",
        lastName: "Name",
      });
      expect(createResult.success).toBe(true);
      const playerId = createResult.data!.id;

      // Update the player
      const result = await playerService.update(playerId, {
        firstName: "Updated",
        lastName: "Person",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe(playerId);
      expect(result.data?.firstName).toBe("Updated");
      expect(result.data?.lastName).toBe("Person");
    });

    it("should update player email", async () => {
      // Create a player first
      const createResult = await playerService.create({
        email: `update-email-${Date.now()}@example.com`,
        firstName: "Email",
        lastName: "Test",
      });
      expect(createResult.success).toBe(true);
      const playerId = createResult.data!.id;

      // Update the email
      const newEmail = `updated-${Date.now()}@example.com`;
      const result = await playerService.update(playerId, {
        email: newEmail,
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data?.email).toBe(newEmail);
    });
  });

  describe("Not Found Error", () => {
    it("should return NOT_FOUND error when updating non-existent player", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const result = await playerService.update(nonExistentId, {
        firstName: "Ghost",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("NOT_FOUND");
      expect(result.data).toBeNull();
    });
  });

  describe("Duplicate Email Error", () => {
    it("should return DUPLICATE_EMAIL error when updating to existing email", async () => {
      // Create two players
      const email1 = `existing1-${Date.now()}@example.com`;
      const email2 = `existing2-${Date.now()}@example.com`;

      const player1Result = await playerService.create({
        email: email1,
        firstName: "Player",
        lastName: "One",
      });
      expect(player1Result.success).toBe(true);

      const player2Result = await playerService.create({
        email: email2,
        firstName: "Player",
        lastName: "Two",
      });
      expect(player2Result.success).toBe(true);
      const player2Id = player2Result.data!.id;

      // Try to update player2 to use player1's email
      const result = await playerService.update(player2Id, {
        email: email1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("DUPLICATE_EMAIL");
      expect(result.data).toBeNull();
    });
  });
});
