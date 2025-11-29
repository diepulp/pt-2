import type { Database } from "@/types/database.types";

import {
  canTransition,
  validateTransition,
  type TableTransitionResult,
} from "./table-state-machine";

type TableStatus = Database["public"]["Enums"]["table_status"];

describe("Table State Machine", () => {
  describe("canTransition", () => {
    describe("valid transitions", () => {
      it("allows inactive → active", () => {
        expect(canTransition("inactive", "active")).toBe(true);
      });

      it("allows active → inactive", () => {
        expect(canTransition("active", "inactive")).toBe(true);
      });

      it("allows active → closed", () => {
        expect(canTransition("active", "closed")).toBe(true);
      });
    });

    describe("invalid transitions", () => {
      it("rejects inactive → closed", () => {
        expect(canTransition("inactive", "closed")).toBe(false);
      });

      it("rejects closed → active", () => {
        expect(canTransition("closed", "active")).toBe(false);
      });

      it("rejects closed → inactive", () => {
        expect(canTransition("closed", "inactive")).toBe(false);
      });

      it("rejects closed → closed (terminal state)", () => {
        expect(canTransition("closed", "closed")).toBe(false);
      });

      it("rejects inactive → inactive (no-op)", () => {
        expect(canTransition("inactive", "inactive")).toBe(false);
      });

      it("rejects active → active (no-op)", () => {
        expect(canTransition("active", "active")).toBe(false);
      });
    });
  });

  describe("validateTransition", () => {
    describe("valid transitions", () => {
      it("does not throw for inactive → active", () => {
        expect(() => validateTransition("inactive", "active")).not.toThrow();
      });

      it("does not throw for active → inactive", () => {
        expect(() => validateTransition("active", "inactive")).not.toThrow();
      });

      it("does not throw for active → closed", () => {
        expect(() => validateTransition("active", "closed")).not.toThrow();
      });
    });

    describe("invalid transitions", () => {
      it("throws for inactive → closed with descriptive message", () => {
        expect(() => validateTransition("inactive", "closed")).toThrow(
          "Invalid table status transition: inactive → closed",
        );
      });

      it("throws for closed → active", () => {
        expect(() => validateTransition("closed", "active")).toThrow(
          "Invalid table status transition: closed → active",
        );
      });

      it("throws for closed → inactive", () => {
        expect(() => validateTransition("closed", "inactive")).toThrow(
          "Invalid table status transition: closed → inactive",
        );
      });
    });
  });

  describe("lifecycle scenarios", () => {
    it("completes normal table day: inactive → active → closed", () => {
      expect(() => {
        validateTransition("inactive", "active");
        validateTransition("active", "closed");
      }).not.toThrow();
    });

    it("completes table open/close cycle: inactive → active → inactive", () => {
      expect(() => {
        validateTransition("inactive", "active");
        validateTransition("active", "inactive");
      }).not.toThrow();
    });

    it("rejects skipping active state: inactive → closed", () => {
      expect(() => validateTransition("inactive", "closed")).toThrow();
    });

    it("enforces terminal state: closed prevents any transition", () => {
      const allStates: TableStatus[] = ["inactive", "active", "closed"];

      allStates.forEach((targetState) => {
        expect(canTransition("closed", targetState)).toBe(false);
      });
    });
  });

  describe("exhaustive transition matrix", () => {
    const transitions: Array<{
      from: TableStatus;
      to: TableStatus;
      valid: boolean;
    }> = [
      { from: "inactive", to: "inactive", valid: false },
      { from: "inactive", to: "active", valid: true },
      { from: "inactive", to: "closed", valid: false },
      { from: "active", to: "inactive", valid: true },
      { from: "active", to: "active", valid: false },
      { from: "active", to: "closed", valid: true },
      { from: "closed", to: "inactive", valid: false },
      { from: "closed", to: "active", valid: false },
      { from: "closed", to: "closed", valid: false },
    ];

    transitions.forEach(({ from, to, valid }) => {
      it(`${from} → ${to} is ${valid ? "valid" : "invalid"}`, () => {
        expect(canTransition(from, to)).toBe(valid);
      });
    });
  });
});
