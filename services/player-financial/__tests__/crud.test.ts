/**
 * PlayerFinancial CRUD Service Tests
 * Following PT-2 canonical service architecture
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { createPlayerFinancialCrudService } from "../crud";
import type {
  PlayerFinancialTransactionCreateDTO,
  PlayerFinancialTransactionUpdateDTO,
} from "../crud";

// Test configuration
const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

describe("PlayerFinancial CRUD Service", () => {
  let supabase: ReturnType<typeof createClient<Database>>;
  let service: ReturnType<typeof createPlayerFinancialCrudService>;
  let testPlayerId: string;
  let testVisitId: string;
  let testCasinoId: string;
  let testTransactionId: string;

  beforeAll(async () => {
    supabase = createClient<Database>(supabaseUrl, supabaseKey);
    service = createPlayerFinancialCrudService(supabase);

    // Create test fixtures
    // 1. Create test company
    const companyResult = await supabase
      .from("company")
      .insert({ name: "Test Company Financial" })
      .select("id")
      .single();

    if (companyResult.error || !companyResult.data) {
      throw new Error(
        `Failed to create test company: ${companyResult.error?.message}`,
      );
    }

    // 2. Create test casino
    const casinoResult = await supabase
      .from("casino")
      .insert({
        name: "Test Casino Financial",
        location: "Test Location",
        company_id: companyResult.data.id,
      })
      .select("id")
      .single();

    if (casinoResult.error || !casinoResult.data) {
      throw new Error(
        `Failed to create test casino: ${casinoResult.error?.message}`,
      );
    }

    testCasinoId = casinoResult.data.id;

    // 3. Create test player
    const playerResult = await supabase
      .from("player")
      .insert({
        firstName: "Test",
        lastName: "Financial",
        email: "test.financial@example.com",
        company_id: companyResult.data.id,
      })
      .select("id")
      .single();

    if (playerResult.error || !playerResult.data) {
      throw new Error(
        `Failed to create test player: ${playerResult.error?.message}`,
      );
    }

    testPlayerId = playerResult.data.id;

    // 4. Create test visit
    const visitResult = await supabase
      .from("visit")
      .insert({
        player_id: testPlayerId,
        casino_id: testCasinoId,
        check_in_date: new Date().toISOString(),
        status: "ONGOING",
        mode: "UNRATED",
      })
      .select("id")
      .single();

    if (visitResult.error || !visitResult.data) {
      throw new Error(
        `Failed to create test visit: ${visitResult.error?.message}`,
      );
    }

    testVisitId = visitResult.data.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await supabase
      .from("player_financial_transaction")
      .delete()
      .eq("player_id", testPlayerId);
    await supabase.from("visit").delete().eq("id", testVisitId);
    await supabase.from("player").delete().eq("id", testPlayerId);
    await supabase.from("casino").delete().eq("id", testCasinoId);
  });

  afterEach(async () => {
    // Clean up transactions created in each test
    if (testTransactionId) {
      await supabase
        .from("player_financial_transaction")
        .delete()
        .eq("id", testTransactionId);
      testTransactionId = "";
    }
  });

  describe("create", () => {
    it("should create a financial transaction with cash_in", async () => {
      const createData: PlayerFinancialTransactionCreateDTO = {
        playerId: testPlayerId,
        visitId: testVisitId,
        cashIn: 500.0,
        transactionType: "DEPOSIT",
        notes: "Initial cash deposit",
      };

      const result = await service.create(createData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.player_id).toBe(testPlayerId);
      expect(result.data?.cash_in).toBe("500.00");
      expect(result.data?.transaction_type).toBe("DEPOSIT");
      expect(result.data?.reconciliation_status).toBe("PENDING");

      testTransactionId = result.data!.id;
    });

    it("should create a financial transaction with chips_brought and chips_taken", async () => {
      const createData: PlayerFinancialTransactionCreateDTO = {
        playerId: testPlayerId,
        visitId: testVisitId,
        chipsBrought: 1000,
        chipsTaken: 1500,
        transactionType: "EXCHANGE",
        netChange: 500,
        notes: "Player won chips",
      };

      const result = await service.create(createData);

      expect(result.success).toBe(true);
      expect(result.data?.chips_brought).toBe(1000);
      expect(result.data?.chips_taken).toBe(1500);
      expect(result.data?.net_change).toBe("500.00");

      testTransactionId = result.data!.id;
    });

    it("should fail when no financial values provided (constraint violation)", async () => {
      const createData: PlayerFinancialTransactionCreateDTO = {
        playerId: testPlayerId,
        visitId: testVisitId,
        transactionType: "DEPOSIT",
      };

      const result = await service.create(createData);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CONSTRAINT_VIOLATION");
      expect(result.error?.message).toContain("at least one");
    });

    it("should fail with invalid player_id (foreign key violation)", async () => {
      const createData: PlayerFinancialTransactionCreateDTO = {
        playerId: "00000000-0000-0000-0000-000000000000",
        visitId: testVisitId,
        cashIn: 100,
        transactionType: "DEPOSIT",
      };

      const result = await service.create(createData);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FOREIGN_KEY_VIOLATION");
    });
  });

  describe("getById", () => {
    beforeEach(async () => {
      const { data } = await supabase
        .from("player_financial_transaction")
        .insert({
          player_id: testPlayerId,
          visit_id: testVisitId,
          cash_in: 250.0,
          transaction_type: "DEPOSIT",
        })
        .select("id")
        .single();

      testTransactionId = data!.id;
    });

    it("should retrieve transaction by ID", async () => {
      const result = await service.getById(testTransactionId);

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(testTransactionId);
      expect(result.data?.player_id).toBe(testPlayerId);
    });

    it("should return NOT_FOUND for non-existent ID", async () => {
      const result = await service.getById(
        "00000000-0000-0000-0000-000000000000",
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  describe("update", () => {
    beforeEach(async () => {
      const { data } = await supabase
        .from("player_financial_transaction")
        .insert({
          player_id: testPlayerId,
          visit_id: testVisitId,
          cash_in: 100.0,
          transaction_type: "DEPOSIT",
          reconciliation_status: "PENDING",
        })
        .select("id")
        .single();

      testTransactionId = data!.id;
    });

    it("should update reconciliation status", async () => {
      const updateData: PlayerFinancialTransactionUpdateDTO = {
        reconciliationStatus: "RECONCILED",
        reconciledAt: new Date().toISOString(),
      };

      const result = await service.update(testTransactionId, updateData);

      expect(result.success).toBe(true);
      expect(result.data?.reconciliation_status).toBe("RECONCILED");
      expect(result.data?.reconciled_at).toBeDefined();
    });

    it("should update financial values", async () => {
      const updateData: PlayerFinancialTransactionUpdateDTO = {
        netChange: -50,
        notes: "Adjusted for discrepancy",
      };

      const result = await service.update(testTransactionId, updateData);

      expect(result.success).toBe(true);
      expect(result.data?.net_change).toBe("-50.00");
      expect(result.data?.notes).toBe("Adjusted for discrepancy");
    });

    it("should return NOT_FOUND for non-existent ID", async () => {
      const result = await service.update(
        "00000000-0000-0000-0000-000000000000",
        { notes: "test" },
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  describe("delete", () => {
    beforeEach(async () => {
      const { data } = await supabase
        .from("player_financial_transaction")
        .insert({
          player_id: testPlayerId,
          visit_id: testVisitId,
          cash_in: 50.0,
          transaction_type: "DEPOSIT",
        })
        .select("id")
        .single();

      testTransactionId = data!.id;
    });

    it("should delete transaction", async () => {
      const result = await service.delete(testTransactionId);

      expect(result.success).toBe(true);

      // Verify deletion
      const getResult = await service.getById(testTransactionId);
      expect(getResult.success).toBe(false);

      testTransactionId = ""; // Prevent afterEach cleanup
    });

    it("should return NOT_FOUND for non-existent ID", async () => {
      const result = await service.delete(
        "00000000-0000-0000-0000-000000000000",
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  describe("listByPlayer", () => {
    beforeEach(async () => {
      // Create multiple transactions
      await supabase.from("player_financial_transaction").insert([
        {
          player_id: testPlayerId,
          visit_id: testVisitId,
          cash_in: 100,
          transaction_type: "DEPOSIT",
        },
        {
          player_id: testPlayerId,
          visit_id: testVisitId,
          cash_in: 200,
          transaction_type: "DEPOSIT",
        },
        {
          player_id: testPlayerId,
          visit_id: testVisitId,
          chips_taken: 300,
          transaction_type: "WITHDRAWAL",
        },
      ]);
    });

    afterEach(async () => {
      await supabase
        .from("player_financial_transaction")
        .delete()
        .eq("player_id", testPlayerId);
    });

    it("should list all transactions for a player", async () => {
      const result = await service.listByPlayer(testPlayerId);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(result.data![0].player_id).toBe(testPlayerId);
    });

    it("should respect limit parameter", async () => {
      const result = await service.listByPlayer(testPlayerId, 2);

      expect(result.success).toBe(true);
      expect(result.data!.length).toBeLessThanOrEqual(2);
    });
  });

  describe("listByVisit", () => {
    beforeEach(async () => {
      await supabase.from("player_financial_transaction").insert([
        {
          player_id: testPlayerId,
          visit_id: testVisitId,
          cash_in: 100,
          transaction_type: "DEPOSIT",
        },
        {
          player_id: testPlayerId,
          visit_id: testVisitId,
          cash_in: 50,
          transaction_type: "DEPOSIT",
        },
      ]);
    });

    afterEach(async () => {
      await supabase
        .from("player_financial_transaction")
        .delete()
        .eq("visit_id", testVisitId);
    });

    it("should list all transactions for a visit", async () => {
      const result = await service.listByVisit(testVisitId);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].visit_id).toBe(testVisitId);
    });
  });

  describe("listByReconciliationStatus", () => {
    beforeEach(async () => {
      await supabase.from("player_financial_transaction").insert([
        {
          player_id: testPlayerId,
          visit_id: testVisitId,
          cash_in: 100,
          transaction_type: "DEPOSIT",
          reconciliation_status: "PENDING",
        },
        {
          player_id: testPlayerId,
          visit_id: testVisitId,
          cash_in: 200,
          transaction_type: "DEPOSIT",
          reconciliation_status: "PENDING",
        },
        {
          player_id: testPlayerId,
          visit_id: testVisitId,
          cash_in: 300,
          transaction_type: "DEPOSIT",
          reconciliation_status: "RECONCILED",
        },
      ]);
    });

    afterEach(async () => {
      await supabase
        .from("player_financial_transaction")
        .delete()
        .eq("player_id", testPlayerId);
    });

    it("should list transactions by reconciliation status", async () => {
      const result = await service.listByReconciliationStatus("PENDING");

      expect(result.success).toBe(true);
      expect(result.data!.length).toBeGreaterThanOrEqual(2);
      expect(
        result.data!.every((t) => t.reconciliation_status === "PENDING"),
      ).toBe(true);
    });

    it("should filter reconciled transactions", async () => {
      const result = await service.listByReconciliationStatus("RECONCILED");

      expect(result.success).toBe(true);
      expect(result.data!.length).toBeGreaterThanOrEqual(1);
      expect(
        result.data!.every((t) => t.reconciliation_status === "RECONCILED"),
      ).toBe(true);
    });
  });
});
