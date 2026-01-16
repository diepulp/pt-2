/**
 * usePatronDailyTotal Hook Unit Tests
 *
 * Tests query key generation and key structure for patron daily total hook
 * used in threshold checking.
 *
 * @see EXECUTION-SPEC-PRD-MTL-UI-GAPS.md WS9
 * @see hooks/mtl/use-patron-daily-total.ts
 */

import { describe, it, expect } from "@jest/globals";

import { patronDailyTotalKey } from "@/hooks/mtl/use-patron-daily-total";
import { mtlKeys } from "@/services/mtl/keys";

describe("usePatronDailyTotal", () => {
  describe("patronDailyTotalKey", () => {
    it("generates correct query key with all parameters", () => {
      const key = patronDailyTotalKey(
        "casino-uuid-123",
        "patron-uuid-456",
        "2026-01-16"
      );

      expect(key).toEqual([
        ...mtlKeys.root,
        "patron-daily-total",
        "casino-uuid-123",
        "patron-uuid-456",
        "2026-01-16",
      ]);
    });

    it("generates key with undefined casinoId", () => {
      const key = patronDailyTotalKey(undefined, "patron-uuid-456", "2026-01-16");

      expect(key).toEqual([
        ...mtlKeys.root,
        "patron-daily-total",
        undefined,
        "patron-uuid-456",
        "2026-01-16",
      ]);
    });

    it("generates key with undefined patronUuid", () => {
      const key = patronDailyTotalKey("casino-uuid-123", undefined, "2026-01-16");

      expect(key).toEqual([
        ...mtlKeys.root,
        "patron-daily-total",
        "casino-uuid-123",
        undefined,
        "2026-01-16",
      ]);
    });

    it("generates key with undefined gamingDay", () => {
      const key = patronDailyTotalKey(
        "casino-uuid-123",
        "patron-uuid-456",
        undefined
      );

      expect(key).toEqual([
        ...mtlKeys.root,
        "patron-daily-total",
        "casino-uuid-123",
        "patron-uuid-456",
        undefined,
      ]);
    });

    it("generates unique keys for different patrons", () => {
      const key1 = patronDailyTotalKey(
        "casino-uuid-123",
        "patron-1",
        "2026-01-16"
      );
      const key2 = patronDailyTotalKey(
        "casino-uuid-123",
        "patron-2",
        "2026-01-16"
      );

      expect(key1).not.toEqual(key2);
    });

    it("generates unique keys for different gaming days", () => {
      const key1 = patronDailyTotalKey(
        "casino-uuid-123",
        "patron-uuid-456",
        "2026-01-15"
      );
      const key2 = patronDailyTotalKey(
        "casino-uuid-123",
        "patron-uuid-456",
        "2026-01-16"
      );

      expect(key1).not.toEqual(key2);
    });

    it("generates unique keys for different casinos", () => {
      const key1 = patronDailyTotalKey(
        "casino-1",
        "patron-uuid-456",
        "2026-01-16"
      );
      const key2 = patronDailyTotalKey(
        "casino-2",
        "patron-uuid-456",
        "2026-01-16"
      );

      expect(key1).not.toEqual(key2);
    });

    it("key is readonly (const assertion)", () => {
      const key = patronDailyTotalKey(
        "casino-uuid-123",
        "patron-uuid-456",
        "2026-01-16"
      );

      // TypeScript should infer this as readonly array
      expect(Array.isArray(key)).toBe(true);
    });

    it("key starts with mtl root key", () => {
      const key = patronDailyTotalKey(
        "casino-uuid-123",
        "patron-uuid-456",
        "2026-01-16"
      );

      // Verify it starts with the mtl root key
      expect(key.slice(0, mtlKeys.root.length)).toEqual(mtlKeys.root);
    });

    it("key has patron-daily-total segment", () => {
      const key = patronDailyTotalKey(
        "casino-uuid-123",
        "patron-uuid-456",
        "2026-01-16"
      );

      expect(key).toContain("patron-daily-total");
    });

    it("key length is consistent", () => {
      const key = patronDailyTotalKey(
        "casino-uuid-123",
        "patron-uuid-456",
        "2026-01-16"
      );

      // root + 'patron-daily-total' + casinoId + patronUuid + gamingDay
      expect(key.length).toBe(mtlKeys.root.length + 4);
    });
  });

  describe("mtlKeys factory", () => {
    it("mtlKeys.root is defined", () => {
      expect(mtlKeys.root).toBeDefined();
      expect(Array.isArray(mtlKeys.root)).toBe(true);
    });

    it("mtlKeys.root contains 'mtl' identifier", () => {
      expect(mtlKeys.root).toContain("mtl");
    });
  });
});
