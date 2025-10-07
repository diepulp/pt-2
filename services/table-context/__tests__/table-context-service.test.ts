/**
 * Table Context Service Tests - TDD approach for Configuration Domain
 * Following PT-2 canonical testing patterns
 * Tests cover: Gaming Table CRUD, Settings Application, Temporal Configuration, FK Violations
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  createTableContextService,
  type TableContextService,
} from "../index";
import type { Database } from "../../../types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe("Table Context Service - Gaming Table CRUD", () => {
  let supabase: SupabaseClient<Database>;
  let tableContextService: TableContextService;
  let testCasinoId: string;

  beforeEach(async () => {
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
    tableContextService = createTableContextService(supabase);

    // Create a test casino for table tests
    const casinoResult = await supabase
      .from("casino")
      .insert({
        name: `Test Casino Table ${Date.now()}`,
        location: "Test Location",
      })
      .select("id")
      .single();

    expect(casinoResult.error).toBeNull();
    testCasinoId = casinoResult.data!.id;
  });

  describe("Create Gaming Table - Happy Path", () => {
    it("should create a gaming table with required fields", async () => {
      const result = await tableContextService.create({
        name: "Blackjack Table 1",
        tableNumber: `T-${Date.now()}`,
        type: "BLACKJACK",
        casinoId: testCasinoId,
      });

      if (!result.success) {
        console.error(
          "Table create failed:",
          JSON.stringify(result.error, null, 2),
        );
      }
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data?.name).toBe("Blackjack Table 1");
      expect(result.data?.type).toBe("BLACKJACK");
      expect(result.data?.casino_id).toBe(testCasinoId);
      expect(result.data?.id).toBeDefined();
    });

    it("should create a gaming table with optional description", async () => {
      const result = await tableContextService.create({
        name: "Roulette Table 1",
        tableNumber: `T-${Date.now()}`,
        type: "ROULETTE",
        casinoId: testCasinoId,
        description: "VIP Roulette Table",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data?.description).toBe("VIP Roulette Table");
    });
  });

  describe("Create Gaming Table - Foreign Key Violation", () => {
    it("should return error when casino does not exist", async () => {
      const nonExistentCasinoId = "00000000-0000-0000-0000-000000000000";

      const result = await tableContextService.create({
        name: "Invalid Table",
        tableNumber: `T-${Date.now()}`,
        type: "BLACKJACK",
        casinoId: nonExistentCasinoId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("FOREIGN_KEY_VIOLATION");
      expect(result.data).toBeNull();
    });
  });

  describe("Get Gaming Table By ID", () => {
    it("should retrieve an existing gaming table by id", async () => {
      // Create a table first
      const createResult = await tableContextService.create({
        name: "Poker Table 1",
        tableNumber: `T-${Date.now()}`,
        type: "POKER",
        casinoId: testCasinoId,
      });
      expect(createResult.success).toBe(true);
      const tableId = createResult.data!.id;

      // Retrieve the table
      const result = await tableContextService.getById(tableId);

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe(tableId);
      expect(result.data?.name).toBe("Poker Table 1");
    });

    it("should return NOT_FOUND error for non-existent table", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const result = await tableContextService.getById(nonExistentId);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("NOT_FOUND");
      expect(result.data).toBeNull();
    });
  });

  describe("Update Gaming Table", () => {
    it("should update table name", async () => {
      // Create a table first
      const createResult = await tableContextService.create({
        name: "Baccarat Table 1",
        tableNumber: `T-${Date.now()}`,
        type: "BACCARAT",
        casinoId: testCasinoId,
      });
      expect(createResult.success).toBe(true);
      const tableId = createResult.data!.id;

      // Update the name
      const result = await tableContextService.update(tableId, {
        name: "VIP Baccarat Table 1",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data?.id).toBe(tableId);
      expect(result.data?.name).toBe("VIP Baccarat Table 1");
    });

    it("should update table description", async () => {
      // Create a table first
      const createResult = await tableContextService.create({
        name: "Craps Table 1",
        tableNumber: `T-${Date.now()}`,
        type: "CRAPS",
        casinoId: testCasinoId,
      });
      expect(createResult.success).toBe(true);
      const tableId = createResult.data!.id;

      // Update description
      const result = await tableContextService.update(tableId, {
        description: "High roller craps table",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data?.description).toBe("High roller craps table");
    });

    it("should return NOT_FOUND error when updating non-existent table", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const result = await tableContextService.update(nonExistentId, {
        name: "Updated Name",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("NOT_FOUND");
      expect(result.data).toBeNull();
    });
  });

  describe("List Gaming Tables By Casino", () => {
    it("should list all tables for a casino", async () => {
      // Create multiple tables
      await tableContextService.create({
        name: "Table 1",
        tableNumber: `T1-${Date.now()}`,
        type: "BLACKJACK",
        casinoId: testCasinoId,
      });
      await tableContextService.create({
        name: "Table 2",
        tableNumber: `T2-${Date.now()}`,
        type: "ROULETTE",
        casinoId: testCasinoId,
      });

      const result = await tableContextService.listByCasino(testCasinoId);

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data!.length).toBeGreaterThanOrEqual(2);
    });

    it("should return empty array for casino with no tables", async () => {
      // Create a new casino with no tables
      const newCasino = await supabase
        .from("casino")
        .insert({
          name: `Empty Casino ${Date.now()}`,
          location: "Test Location",
        })
        .select("id")
        .single();

      const result = await tableContextService.listByCasino(
        newCasino.data!.id,
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data!.length).toBe(0);
    });
  });

  describe("Delete Gaming Table", () => {
    it("should delete an existing gaming table", async () => {
      // Create a table first
      const createResult = await tableContextService.create({
        name: "Temporary Table",
        tableNumber: `T-${Date.now()}`,
        type: "BLACKJACK",
        casinoId: testCasinoId,
      });
      expect(createResult.success).toBe(true);
      const tableId = createResult.data!.id;

      // Delete the table
      const result = await tableContextService.delete(tableId);

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();

      // Verify table is deleted
      const getResult = await tableContextService.getById(tableId);
      expect(getResult.success).toBe(false);
      expect(getResult.error?.code).toBe("NOT_FOUND");
    });

    it("should return NOT_FOUND error when deleting non-existent table", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const result = await tableContextService.delete(nonExistentId);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });
});

describe("Table Context Service - Game Settings Operations", () => {
  let supabase: SupabaseClient<Database>;
  let tableContextService: TableContextService;
  let testCasinoId: string;
  let testTableId: string;
  let testSettingsId: string;

  beforeEach(async () => {
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
    tableContextService = createTableContextService(supabase);

    // Create test casino
    const casinoResult = await supabase
      .from("casino")
      .insert({
        name: `Test Casino Settings ${Date.now()}`,
        location: "Test Location",
      })
      .select("id")
      .single();
    testCasinoId = casinoResult.data!.id;

    // Create test gaming table
    const tableResult = await tableContextService.create({
      name: "Test Table",
      tableNumber: `T-${Date.now()}`,
      type: "BLACKJACK",
      casinoId: testCasinoId,
    });
    testTableId = tableResult.data!.id;

    // Create test game settings
    const settingsResult = await supabase
      .from("gamesettings")
      .insert({
        name: `Blackjack Settings ${Date.now()}`,
        average_rounds_per_hour: 60,
        house_edge: 0.5,
        version: 1,
      })
      .select("id")
      .single();
    testSettingsId = settingsResult.data!.id;
  });

  describe("Apply Settings - Happy Path", () => {
    it("should apply game settings to a table", async () => {
      const activeFrom = new Date().toISOString();

      const result = await tableContextService.applySettings({
        gamingTableId: testTableId,
        gameSettingsId: testSettingsId,
        activeFrom: activeFrom,
        description: "Standard blackjack configuration",
      });

      if (!result.success) {
        console.error(
          "Apply settings failed:",
          JSON.stringify(result.error, null, 2),
        );
      }
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data?.gaming_table_id).toBe(testTableId);
      expect(result.data?.game_settings_id).toBe(testSettingsId);
      expect(result.data?.is_active).toBe(true);
      expect(result.data?.description).toBe("Standard blackjack configuration");
    });

    it("should apply settings with active_until date", async () => {
      const activeFrom = new Date().toISOString();
      const activeUntil = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(); // 30 days from now

      const result = await tableContextService.applySettings({
        gamingTableId: testTableId,
        gameSettingsId: testSettingsId,
        activeFrom: activeFrom,
        activeUntil: activeUntil,
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data?.active_until).toBeDefined();
    });

    it("should deactivate previous settings when applying new ones", async () => {
      const activeFrom = new Date().toISOString();

      // Apply first settings
      const firstResult = await tableContextService.applySettings({
        gamingTableId: testTableId,
        gameSettingsId: testSettingsId,
        activeFrom: activeFrom,
        description: "First configuration",
      });
      expect(firstResult.success).toBe(true);

      // Create second settings
      const settings2Result = await supabase
        .from("gamesettings")
        .insert({
          name: `Blackjack Settings 2 ${Date.now()}`,
          average_rounds_per_hour: 70,
          house_edge: 0.45,
          version: 2,
        })
        .select("id")
        .single();
      const settings2Id = settings2Result.data!.id;

      // Apply second settings
      const secondResult = await tableContextService.applySettings({
        gamingTableId: testTableId,
        gameSettingsId: settings2Id,
        activeFrom: activeFrom,
        description: "Second configuration",
      });
      expect(secondResult.success).toBe(true);

      // Verify first settings are deactivated
      const historyResult =
        await tableContextService.getSettingsHistory(testTableId);
      expect(historyResult.success).toBe(true);
      expect(historyResult.data).toBeDefined();

      const firstSettings = historyResult.data?.find(
        (s) => s.description === "First configuration",
      );
      expect(firstSettings?.is_active).toBe(false);

      const secondSettings = historyResult.data?.find(
        (s) => s.description === "Second configuration",
      );
      expect(secondSettings?.is_active).toBe(true);
    });
  });

  describe("Apply Settings - Foreign Key Violation", () => {
    it("should return error when gaming table does not exist", async () => {
      const nonExistentTableId = "00000000-0000-0000-0000-000000000000";
      const activeFrom = new Date().toISOString();

      const result = await tableContextService.applySettings({
        gamingTableId: nonExistentTableId,
        gameSettingsId: testSettingsId,
        activeFrom: activeFrom,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("FOREIGN_KEY_VIOLATION");
      expect(result.data).toBeNull();
    });

    it("should return error when game settings does not exist", async () => {
      const nonExistentSettingsId = "00000000-0000-0000-0000-000000000000";
      const activeFrom = new Date().toISOString();

      const result = await tableContextService.applySettings({
        gamingTableId: testTableId,
        gameSettingsId: nonExistentSettingsId,
        activeFrom: activeFrom,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("FOREIGN_KEY_VIOLATION");
      expect(result.data).toBeNull();
    });
  });

  describe("Get Active Settings", () => {
    it("should retrieve active settings for a table", async () => {
      const activeFrom = new Date().toISOString();

      // Apply settings first
      const applyResult = await tableContextService.applySettings({
        gamingTableId: testTableId,
        gameSettingsId: testSettingsId,
        activeFrom: activeFrom,
      });
      expect(applyResult.success).toBe(true);

      // Get active settings
      const result = await tableContextService.getActiveSettings(testTableId);

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data?.gaming_table_id).toBe(testTableId);
      expect(result.data?.is_active).toBe(true);
      expect(result.data?.gameSettings).toBeDefined();
      expect(result.data?.gameSettings.id).toBe(testSettingsId);
    });

    it("should return null when no active settings exist", async () => {
      // Create a new table with no settings
      const newTableResult = await tableContextService.create({
        name: "No Settings Table",
        tableNumber: `T-${Date.now()}`,
        type: "ROULETTE",
        casinoId: testCasinoId,
      });
      const newTableId = newTableResult.data!.id;

      const result = await tableContextService.getActiveSettings(newTableId);

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeNull();
    });
  });

  describe("Get Settings History", () => {
    it("should retrieve all settings history for a table", async () => {
      const activeFrom = new Date().toISOString();

      // Apply settings
      await tableContextService.applySettings({
        gamingTableId: testTableId,
        gameSettingsId: testSettingsId,
        activeFrom: activeFrom,
        description: "History test",
      });

      // Get history
      const result = await tableContextService.getSettingsHistory(testTableId);

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data!.length).toBeGreaterThanOrEqual(1);
      expect(result.data![0].description).toBe("History test");
    });

    it("should return empty array for table with no settings history", async () => {
      // Create a new table with no settings
      const newTableResult = await tableContextService.create({
        name: "No History Table",
        tableNumber: `T-${Date.now()}`,
        type: "POKER",
        casinoId: testCasinoId,
      });
      const newTableId = newTableResult.data!.id;

      const result = await tableContextService.getSettingsHistory(newTableId);

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data!.length).toBe(0);
    });
  });

  describe("Deactivate Settings", () => {
    it("should deactivate active settings for a table", async () => {
      const activeFrom = new Date().toISOString();

      // Apply settings first
      const applyResult = await tableContextService.applySettings({
        gamingTableId: testTableId,
        gameSettingsId: testSettingsId,
        activeFrom: activeFrom,
      });
      expect(applyResult.success).toBe(true);

      // Deactivate settings
      const result = await tableContextService.deactivateSettings(testTableId);

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();

      // Verify settings are deactivated
      const activeResult =
        await tableContextService.getActiveSettings(testTableId);
      expect(activeResult.success).toBe(true);
      expect(activeResult.data).toBeNull();
    });
  });
});
