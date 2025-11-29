/**
 * Simple State Machine Tests for DB Status Transitions
 *
 * Tests the canTransition function for table_status enum transitions
 */

import { canTransition, validateTransition } from "./table-state-machine";

describe("Table Status Transitions (DB Level)", () => {
  describe("canTransition", () => {
    it("allows inactive → active transition", () => {
      expect(canTransition("inactive", "active")).toBe(true);
    });

    it("allows active → inactive transition", () => {
      expect(canTransition("active", "inactive")).toBe(true);
    });

    it("allows active → closed transition", () => {
      expect(canTransition("active", "closed")).toBe(true);
    });

    it("disallows inactive → closed transition", () => {
      expect(canTransition("inactive", "closed")).toBe(false);
    });

    it("disallows closed → active transition", () => {
      expect(canTransition("closed", "active")).toBe(false);
    });

    it("disallows closed → inactive transition", () => {
      expect(canTransition("closed", "inactive")).toBe(false);
    });
  });

  describe("validateTransition", () => {
    it("does not throw for valid transition: inactive → active", () => {
      expect(() => validateTransition("inactive", "active")).not.toThrow();
    });

    it("does not throw for valid transition: active → inactive", () => {
      expect(() => validateTransition("active", "inactive")).not.toThrow();
    });

    it("does not throw for valid transition: active → closed", () => {
      expect(() => validateTransition("active", "closed")).not.toThrow();
    });

    it("throws for invalid transition: inactive → closed", () => {
      expect(() => validateTransition("inactive", "closed")).toThrow(
        "Invalid table status transition: inactive → closed",
      );
    });

    it("throws for invalid transition: closed → active", () => {
      expect(() => validateTransition("closed", "active")).toThrow(
        "Invalid table status transition: closed → active",
      );
    });
  });
});
