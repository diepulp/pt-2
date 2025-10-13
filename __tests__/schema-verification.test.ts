/**
 * Schema Verification Test
 *
 * Purpose: Prevent schema drift between database.types.ts and service layer DTOs
 *
 * This test ensures that:
 * 1. Service DTOs reference actual database table/column names
 * 2. Type generation hasn't been skipped after schema changes
 * 3. No PascalCase/snake_case mismatches exist
 *
 * Run after migrations: npm run db:types && npm test schema-verification
 */

import { describe, it, expect } from "@jest/globals";
import type { Database } from "../types/database.types";

describe("Schema Verification", () => {
  describe("Loyalty Service Schema Compliance", () => {
    it("should have loyalty_ledger table (not LoyaltyLedger)", () => {
      type Tables = Database["public"]["Tables"];

      // ✅ Correct: snake_case table name exists
      type LoyaltyLedger = Tables["loyalty_ledger"];

      // This is a compile-time check - if the table doesn't exist, TypeScript errors
      const _typeCheck: LoyaltyLedger = {} as LoyaltyLedger;
      expect(true).toBe(true); // Test passes if it compiles

      // ❌ Incorrect: PascalCase should NOT exist
      // @ts-expect-error - PascalCase table name should not exist
      type InvalidTable = Tables["LoyaltyLedger"];
    });

    it("should have correct player_loyalty columns", () => {
      type PlayerLoyaltyRow = Database["public"]["Tables"]["player_loyalty"]["Row"];

      // ✅ Correct field names (snake_case)
      // The type assertion itself is the test - if fields don't exist, TypeScript will error
      const validFields: (keyof PlayerLoyaltyRow)[] = [
        "id",
        "player_id",
        "current_balance",
        "lifetime_points",
        "tier",
        "tier_progress",
        "created_at",
        "updated_at",
      ];

      // If this compiles, the schema is correct
      expect(validFields.length).toBe(8);

      // ❌ Old/incorrect field names should NOT compile
      // @ts-expect-error - old field name
      const _invalid1: keyof PlayerLoyaltyRow = "points_balance";
      // @ts-expect-error - old field name
      const _invalid2: keyof PlayerLoyaltyRow = "points_earned_total";
      // @ts-expect-error - old field name
      const _invalid3: keyof PlayerLoyaltyRow = "points_redeemed_total";
      // @ts-expect-error - non-existent field
      const _invalid4: keyof PlayerLoyaltyRow = "tier_expires_at";
      // @ts-expect-error - non-existent field
      const _invalid5: keyof PlayerLoyaltyRow = "achievements";
    });

    it("should have correct loyalty_ledger columns", () => {
      type LoyaltyLedgerRow = Database["public"]["Tables"]["loyalty_ledger"]["Row"];

      // ✅ Correct field names (snake_case)
      const validFields: (keyof LoyaltyLedgerRow)[] = [
        "id",
        "player_id",
        "created_at",
        "points_change",
        "reason",
        "transaction_type",
        "event_type",
        "source",
        "session_id",
        "rating_slip_id",
        "visit_id",
      ];

      // If this compiles, the schema is correct
      expect(validFields.length).toBe(11);

      // ❌ Old/incorrect field names should NOT compile
      // @ts-expect-error - old field name
      const _invalid1: keyof LoyaltyLedgerRow = "transaction_date";
      // @ts-expect-error - old field name
      const _invalid2: keyof LoyaltyLedgerRow = "points";
      // @ts-expect-error - old field name
      const _invalid3: keyof LoyaltyLedgerRow = "direction";
      // @ts-expect-error - old field name
      const _invalid4: keyof LoyaltyLedgerRow = "description";
      // @ts-expect-error - non-existent field
      const _invalid5: keyof LoyaltyLedgerRow = "balance_after";
      // @ts-expect-error - non-existent field
      const _invalid6: keyof LoyaltyLedgerRow = "metadata";
    });
  });

  describe("RatingSlip Service Schema Compliance", () => {
    it("should NOT have points field in ratingslip table", () => {
      type RatingSlipRow = Database["public"]["Tables"]["ratingslip"]["Row"];

      // ❌ Points field should NOT exist (Wave 0 bounded context correction)
      // @ts-expect-error - points field removed per bounded context
      const _invalid: keyof RatingSlipRow = "points";

      // ✅ Valid fields should exist
      const validFields: (keyof RatingSlipRow)[] = [
        "id",
        "playerId",
        "visit_id",
        "gaming_table_id",
        "average_bet",
        "accumulated_seconds",
        "start_time",
        "end_time",
        "status",
      ];

      // If this compiles, the schema is correct
      expect(validFields.length).toBe(9);
    });

    it("should enforce bounded context separation - RatingSlip returns telemetry only", () => {
      type RatingSlipRow = Database["public"]["Tables"]["ratingslip"]["Row"];

      // ✅ RatingSlip should contain ONLY telemetry fields
      const telemetryFields: (keyof RatingSlipRow)[] = [
        "id",
        "playerId",
        "visit_id",
        "gaming_table_id",
        "average_bet",
        "accumulated_seconds",
        "start_time",
        "end_time",
        "status",
        "game_settings",
        "pause_intervals",
        "seat_number",
        "version",
      ];

      expect(telemetryFields.length).toBeGreaterThan(0);

      // ❌ Loyalty concerns should NOT exist in RatingSlip
      // @ts-expect-error - loyalty concern handled by LoyaltyService
      const _loyaltyViolation1: keyof RatingSlipRow = "points";
      // @ts-expect-error - loyalty concern handled by LoyaltyService
      const _loyaltyViolation2: keyof RatingSlipRow = "points_earned";
      // @ts-expect-error - loyalty concern handled by LoyaltyService
      const _loyaltyViolation3: keyof RatingSlipRow = "tier";
    });
  });

  describe("Type Generation Freshness Check", () => {
    it("should have database types generated", () => {
      // This test ensures database.types.ts is not a stub file
      type Tables = Database["public"]["Tables"];
      type TableNames = keyof Tables;

      const requiredTables: TableNames[] = [
        "player",
        "player_loyalty",
        "loyalty_ledger",
        "ratingslip",
        "visit",
        "casino",
      ];

      // If types are stale, this will fail at compile time
      expect(requiredTables.length).toBe(6);
    });
  });
});
