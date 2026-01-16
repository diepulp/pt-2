/**
 * useThresholdNotifications Hook Unit Tests
 *
 * Tests threshold level evaluation, cumulative total calculation,
 * and threshold check logic for compliance tracking.
 *
 * Threshold Tiers per PRD-MTL-UI-GAPS:
 * - none: < $2,500
 * - warning: ≥ $2,500, < $3,000
 * - watchlist_met: ≥ $3,000, ≤ $9,000
 * - ctr_near: > $9,000, ≤ $10,000
 * - ctr_met: > $10,000 (strictly > per 31 CFR § 1021.311)
 *
 * @see EXECUTION-SPEC-PRD-MTL-UI-GAPS.md WS9
 * @see hooks/mtl/use-threshold-notifications.ts
 */

import { describe, it, expect } from "@jest/globals";

import {
  checkThreshold,
  checkCumulativeThreshold,
  type ThresholdLevel,
  type ThresholdCheckResult,
  type ThresholdConfig,
} from "@/hooks/mtl/use-threshold-notifications";

// Default threshold values for testing
const DEFAULT_CONFIG: ThresholdConfig = {
  warningThreshold: 2500,
  watchlistFloor: 3000,
  ctrThreshold: 10000,
};

describe("useThresholdNotifications", () => {
  describe("checkThreshold", () => {
    describe("none level (< $2,500)", () => {
      it("returns none for $0", () => {
        const result = checkThreshold(0, DEFAULT_CONFIG);
        expect(result.level).toBe("none");
        expect(result.shouldCreateMtl).toBe(false);
        expect(result.requiresCtr).toBe(false);
        expect(result.message).toBeNull();
      });

      it("returns none for $1,000", () => {
        const result = checkThreshold(1000, DEFAULT_CONFIG);
        expect(result.level).toBe("none");
        expect(result.shouldCreateMtl).toBe(false);
        expect(result.requiresCtr).toBe(false);
      });

      it("returns none for $2,499 (just under warning)", () => {
        const result = checkThreshold(2499, DEFAULT_CONFIG);
        expect(result.level).toBe("none");
        expect(result.shouldCreateMtl).toBe(false);
      });

      it("returns none for $2,499.99", () => {
        const result = checkThreshold(2499.99, DEFAULT_CONFIG);
        expect(result.level).toBe("none");
      });
    });

    describe("warning level (≥ $2,500, < $3,000)", () => {
      it("returns warning for $2,500 (exactly at warning threshold)", () => {
        const result = checkThreshold(2500, DEFAULT_CONFIG);
        expect(result.level).toBe("warning");
        expect(result.shouldCreateMtl).toBe(false);
        expect(result.requiresCtr).toBe(false);
        expect(result.message).toContain("Approaching watchlist threshold");
      });

      it("returns warning for $2,750", () => {
        const result = checkThreshold(2750, DEFAULT_CONFIG);
        expect(result.level).toBe("warning");
        expect(result.shouldCreateMtl).toBe(false);
      });

      it("returns warning for $2,999 (just under watchlist)", () => {
        const result = checkThreshold(2999, DEFAULT_CONFIG);
        expect(result.level).toBe("warning");
        expect(result.shouldCreateMtl).toBe(false);
      });
    });

    describe("watchlist_met level (≥ $3,000, ≤ $9,000)", () => {
      it("returns watchlist_met for $3,000 (exactly at watchlist floor)", () => {
        const result = checkThreshold(3000, DEFAULT_CONFIG);
        expect(result.level).toBe("watchlist_met");
        expect(result.shouldCreateMtl).toBe(true);
        expect(result.requiresCtr).toBe(false);
        expect(result.message).toContain("Watchlist threshold met");
      });

      it("returns watchlist_met for $5,000", () => {
        const result = checkThreshold(5000, DEFAULT_CONFIG);
        expect(result.level).toBe("watchlist_met");
        expect(result.shouldCreateMtl).toBe(true);
        expect(result.requiresCtr).toBe(false);
      });

      it("returns watchlist_met for $8,500", () => {
        const result = checkThreshold(8500, DEFAULT_CONFIG);
        expect(result.level).toBe("watchlist_met");
        expect(result.shouldCreateMtl).toBe(true);
      });

      it("returns watchlist_met for $9,000 (just under 90% CTR)", () => {
        const result = checkThreshold(9000, DEFAULT_CONFIG);
        expect(result.level).toBe("watchlist_met");
        expect(result.requiresCtr).toBe(false);
      });
    });

    describe("ctr_near level (> $9,000, ≤ $10,000)", () => {
      it("returns ctr_near for $9,001 (just over 90% CTR)", () => {
        const result = checkThreshold(9001, DEFAULT_CONFIG);
        expect(result.level).toBe("ctr_near");
        expect(result.shouldCreateMtl).toBe(true);
        expect(result.requiresCtr).toBe(false);
        expect(result.message).toContain("CTR threshold approaching");
      });

      it("returns ctr_near for $9,500", () => {
        const result = checkThreshold(9500, DEFAULT_CONFIG);
        expect(result.level).toBe("ctr_near");
        expect(result.shouldCreateMtl).toBe(true);
        expect(result.requiresCtr).toBe(false);
      });

      it("returns ctr_near for $10,000 (exactly at CTR threshold)", () => {
        const result = checkThreshold(10000, DEFAULT_CONFIG);
        // IMPORTANT: CTR uses strictly > per 31 CFR § 1021.311
        // $10,000 exactly does NOT trigger CTR, it's ctr_near
        expect(result.level).toBe("ctr_near");
        expect(result.requiresCtr).toBe(false);
      });

      it("CTR threshold is strictly > not >= (compliance critical)", () => {
        // This test verifies the 31 CFR § 1021.311 requirement
        const atThreshold = checkThreshold(10000, DEFAULT_CONFIG);
        const aboveThreshold = checkThreshold(10000.01, DEFAULT_CONFIG);

        expect(atThreshold.level).toBe("ctr_near");
        expect(atThreshold.requiresCtr).toBe(false);

        expect(aboveThreshold.level).toBe("ctr_met");
        expect(aboveThreshold.requiresCtr).toBe(true);
      });
    });

    describe("ctr_met level (> $10,000)", () => {
      it("returns ctr_met for $10,000.01 (just over CTR)", () => {
        const result = checkThreshold(10000.01, DEFAULT_CONFIG);
        expect(result.level).toBe("ctr_met");
        expect(result.shouldCreateMtl).toBe(true);
        expect(result.requiresCtr).toBe(true);
        expect(result.message).toContain("CTR REQUIRED");
      });

      it("returns ctr_met for $10,001", () => {
        const result = checkThreshold(10001, DEFAULT_CONFIG);
        expect(result.level).toBe("ctr_met");
        expect(result.requiresCtr).toBe(true);
      });

      it("returns ctr_met for $15,000", () => {
        const result = checkThreshold(15000, DEFAULT_CONFIG);
        expect(result.level).toBe("ctr_met");
        expect(result.requiresCtr).toBe(true);
      });

      it("returns ctr_met for $100,000", () => {
        const result = checkThreshold(100000, DEFAULT_CONFIG);
        expect(result.level).toBe("ctr_met");
        expect(result.requiresCtr).toBe(true);
        expect(result.message).toContain("31 CFR § 1021.311");
      });
    });

    describe("custom thresholds", () => {
      it("respects custom warning threshold", () => {
        const customConfig: ThresholdConfig = {
          warningThreshold: 5000,
          watchlistFloor: 8000, // Higher than default
          ctrThreshold: 10000,
        };

        const result = checkThreshold(4000, customConfig);
        expect(result.level).toBe("none");

        const warningResult = checkThreshold(5000, customConfig);
        expect(warningResult.level).toBe("warning");

        const watchlistResult = checkThreshold(8000, customConfig);
        expect(watchlistResult.level).toBe("watchlist_met");
      });

      it("respects custom watchlist floor", () => {
        const customConfig: ThresholdConfig = {
          ...DEFAULT_CONFIG,
          watchlistFloor: 5000,
        };

        const result = checkThreshold(4000, customConfig);
        expect(result.level).toBe("warning");

        const watchlistResult = checkThreshold(5000, customConfig);
        expect(watchlistResult.level).toBe("watchlist_met");
      });

      it("respects custom CTR threshold", () => {
        const customConfig: ThresholdConfig = {
          ...DEFAULT_CONFIG,
          ctrThreshold: 15000,
        };

        const result = checkThreshold(15000, customConfig);
        expect(result.level).toBe("ctr_near");

        const ctrResult = checkThreshold(15001, customConfig);
        expect(ctrResult.level).toBe("ctr_met");
      });
    });
  });

  describe("checkCumulativeThreshold", () => {
    it("calculates projected total correctly", () => {
      // $2,000 existing + $1,000 new = $3,000 (watchlist_met)
      const result = checkCumulativeThreshold(2000, 1000, DEFAULT_CONFIG);
      expect(result.level).toBe("watchlist_met");
    });

    it("returns none for small cumulative amounts", () => {
      // $500 existing + $500 new = $1,000 (none)
      const result = checkCumulativeThreshold(500, 500, DEFAULT_CONFIG);
      expect(result.level).toBe("none");
    });

    it("triggers warning when cumulative crosses warning threshold", () => {
      // $2,000 existing + $500 new = $2,500 (warning)
      const result = checkCumulativeThreshold(2000, 500, DEFAULT_CONFIG);
      expect(result.level).toBe("warning");
    });

    it("triggers watchlist when cumulative crosses watchlist floor", () => {
      // $2,500 existing + $500 new = $3,000 (watchlist_met)
      const result = checkCumulativeThreshold(2500, 500, DEFAULT_CONFIG);
      expect(result.level).toBe("watchlist_met");
    });

    it("triggers ctr_near when cumulative crosses 90% CTR", () => {
      // $8,500 existing + $1,000 new = $9,500 (ctr_near)
      const result = checkCumulativeThreshold(8500, 1000, DEFAULT_CONFIG);
      expect(result.level).toBe("ctr_near");
    });

    it("triggers ctr_met when cumulative exceeds CTR threshold", () => {
      // $9,500 existing + $501 new = $10,001 (ctr_met)
      const result = checkCumulativeThreshold(9500, 501, DEFAULT_CONFIG);
      expect(result.level).toBe("ctr_met");
      expect(result.requiresCtr).toBe(true);
    });

    it("handles zero new amount", () => {
      const result = checkCumulativeThreshold(5000, 0, DEFAULT_CONFIG);
      expect(result.level).toBe("watchlist_met");
    });

    it("handles zero existing total", () => {
      const result = checkCumulativeThreshold(0, 3000, DEFAULT_CONFIG);
      expect(result.level).toBe("watchlist_met");
    });

    it("handles both zero (edge case)", () => {
      const result = checkCumulativeThreshold(0, 0, DEFAULT_CONFIG);
      expect(result.level).toBe("none");
    });

    it("handles decimal amounts", () => {
      // $9,999.50 existing + $0.51 new = $10,000.01 (ctr_met)
      const result = checkCumulativeThreshold(9999.5, 0.51, DEFAULT_CONFIG);
      expect(result.level).toBe("ctr_met");
    });
  });

  describe("threshold result structure", () => {
    it("result has all required properties", () => {
      const result = checkThreshold(5000, DEFAULT_CONFIG);

      expect(result).toHaveProperty("level");
      expect(result).toHaveProperty("shouldCreateMtl");
      expect(result).toHaveProperty("requiresCtr");
      expect(result).toHaveProperty("message");
    });

    it("level is valid ThresholdLevel type", () => {
      const validLevels: ThresholdLevel[] = [
        "none",
        "warning",
        "watchlist_met",
        "ctr_near",
        "ctr_met",
      ];

      const testAmounts = [0, 2500, 3000, 9500, 15000];
      testAmounts.forEach((amount) => {
        const result = checkThreshold(amount, DEFAULT_CONFIG);
        expect(validLevels).toContain(result.level);
      });
    });

    it("shouldCreateMtl is boolean", () => {
      const result = checkThreshold(5000, DEFAULT_CONFIG);
      expect(typeof result.shouldCreateMtl).toBe("boolean");
    });

    it("requiresCtr is boolean", () => {
      const result = checkThreshold(5000, DEFAULT_CONFIG);
      expect(typeof result.requiresCtr).toBe("boolean");
    });

    it("message is string or null", () => {
      const noneResult = checkThreshold(1000, DEFAULT_CONFIG);
      expect(noneResult.message).toBeNull();

      const warningResult = checkThreshold(2500, DEFAULT_CONFIG);
      expect(typeof warningResult.message).toBe("string");
    });
  });

  describe("message content", () => {
    it("warning message mentions watchlist floor amount", () => {
      const result = checkThreshold(2500, DEFAULT_CONFIG);
      expect(result.message).toContain("$3,000");
    });

    it("watchlist message mentions MTL", () => {
      const result = checkThreshold(3500, DEFAULT_CONFIG);
      expect(result.message).toContain("MTL");
    });

    it("ctr_near message mentions ID verification", () => {
      const result = checkThreshold(9500, DEFAULT_CONFIG);
      expect(result.message).toContain("ID verification");
    });

    it("ctr_met message includes regulatory reference", () => {
      const result = checkThreshold(15000, DEFAULT_CONFIG);
      expect(result.message).toContain("31 CFR § 1021.311");
    });

    it("ctr_met message includes amount", () => {
      const result = checkThreshold(15000, DEFAULT_CONFIG);
      expect(result.message).toContain("$15,000");
    });
  });

  describe("shouldCreateMtl flag behavior", () => {
    it("is false for none level", () => {
      expect(checkThreshold(1000, DEFAULT_CONFIG).shouldCreateMtl).toBe(false);
    });

    it("is false for warning level", () => {
      expect(checkThreshold(2500, DEFAULT_CONFIG).shouldCreateMtl).toBe(false);
    });

    it("is true for watchlist_met level", () => {
      expect(checkThreshold(3000, DEFAULT_CONFIG).shouldCreateMtl).toBe(true);
    });

    it("is true for ctr_near level", () => {
      expect(checkThreshold(9500, DEFAULT_CONFIG).shouldCreateMtl).toBe(true);
    });

    it("is true for ctr_met level", () => {
      expect(checkThreshold(15000, DEFAULT_CONFIG).shouldCreateMtl).toBe(true);
    });
  });

  describe("requiresCtr flag behavior", () => {
    it("is false for none level", () => {
      expect(checkThreshold(1000, DEFAULT_CONFIG).requiresCtr).toBe(false);
    });

    it("is false for warning level", () => {
      expect(checkThreshold(2500, DEFAULT_CONFIG).requiresCtr).toBe(false);
    });

    it("is false for watchlist_met level", () => {
      expect(checkThreshold(3000, DEFAULT_CONFIG).requiresCtr).toBe(false);
    });

    it("is false for ctr_near level", () => {
      expect(checkThreshold(9500, DEFAULT_CONFIG).requiresCtr).toBe(false);
    });

    it("is true ONLY for ctr_met level", () => {
      expect(checkThreshold(15000, DEFAULT_CONFIG).requiresCtr).toBe(true);
    });
  });
});
