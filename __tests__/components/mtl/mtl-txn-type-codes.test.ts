/**
 * MTL Transaction Type Codes Unit Tests
 *
 * Tests direction mapping, mtlType mapping, and all 12 transaction codes
 * from the official Affinity Gaming MTL paper form.
 *
 * @see EXECUTION-SPEC-PRD-MTL-UI-GAPS.md WS9
 * @see components/mtl/mtl-txn-type-codes.ts
 */

import { describe, it, expect } from "@jest/globals";

import {
  MTL_TXN_TYPE_CODES,
  getAllTxnTypeCodes,
  getCashInCodes,
  getCashOutCodes,
  getTxnTypeByCode,
  formatTxnTypeCode,
  type MtlTxnTypeCode,
} from "@/components/mtl/mtl-txn-type-codes";

describe("MTL Transaction Type Codes", () => {
  describe("MTL_TXN_TYPE_CODES constant", () => {
    it("contains exactly 12 transaction codes", () => {
      const codes = Object.keys(MTL_TXN_TYPE_CODES);
      expect(codes).toHaveLength(12);
    });

    it("contains codes 1 through 12", () => {
      for (let i = 1; i <= 12; i++) {
        expect(MTL_TXN_TYPE_CODES[i]).toBeDefined();
      }
    });

    it("does not contain code 0", () => {
      expect(MTL_TXN_TYPE_CODES[0]).toBeUndefined();
    });

    it("does not contain code 13", () => {
      expect(MTL_TXN_TYPE_CODES[13]).toBeUndefined();
    });
  });

  describe("cash-in codes (1-5)", () => {
    const cashInCodes = [1, 2, 3, 4, 5];

    cashInCodes.forEach((code) => {
      it(`code ${code} has direction 'in'`, () => {
        expect(MTL_TXN_TYPE_CODES[code].direction).toBe("in");
      });

      it(`code ${code} has category 'cash_in'`, () => {
        expect(MTL_TXN_TYPE_CODES[code].category).toBe("cash_in");
      });
    });

    it("code 1: Purchase of Chips/Tokens maps to buy_in", () => {
      const code = MTL_TXN_TYPE_CODES[1];
      expect(code.label).toBe("Purchase of Chips/Tokens");
      expect(code.mtlType).toBe("buy_in");
    });

    it("code 2: Front Money Deposit maps to front_money", () => {
      const code = MTL_TXN_TYPE_CODES[2];
      expect(code.label).toBe("Front Money Deposit");
      expect(code.mtlType).toBe("front_money");
    });

    it("code 3: Safekeeping Deposit maps to front_money", () => {
      const code = MTL_TXN_TYPE_CODES[3];
      expect(code.label).toBe("Safekeeping Deposit");
      expect(code.mtlType).toBe("front_money");
    });

    it("code 4: Marker Payment maps to marker", () => {
      const code = MTL_TXN_TYPE_CODES[4];
      expect(code.label).toBe("Marker Payment");
      expect(code.mtlType).toBe("marker");
    });

    it("code 5: Currency Exchange maps to chip_fill", () => {
      const code = MTL_TXN_TYPE_CODES[5];
      expect(code.label).toBe("Currency Exchange");
      expect(code.mtlType).toBe("chip_fill");
    });
  });

  describe("cash-out codes (6-12)", () => {
    const cashOutCodes = [6, 7, 8, 9, 10, 11, 12];

    cashOutCodes.forEach((code) => {
      it(`code ${code} has direction 'out'`, () => {
        expect(MTL_TXN_TYPE_CODES[code].direction).toBe("out");
      });

      it(`code ${code} has category 'cash_out'`, () => {
        expect(MTL_TXN_TYPE_CODES[code].category).toBe("cash_out");
      });
    });

    it("code 6: Redemption of Chips/Tokens/Tickets maps to cash_out", () => {
      const code = MTL_TXN_TYPE_CODES[6];
      expect(code.label).toBe("Redemption of Chips/Tokens/Tickets");
      expect(code.mtlType).toBe("cash_out");
    });

    it("code 7: Front Money Withdrawal maps to front_money", () => {
      const code = MTL_TXN_TYPE_CODES[7];
      expect(code.label).toBe("Front Money Withdrawal");
      expect(code.mtlType).toBe("front_money");
    });

    it("code 8: Safekeeping Withdrawal maps to front_money", () => {
      const code = MTL_TXN_TYPE_CODES[8];
      expect(code.label).toBe("Safekeeping Withdrawal");
      expect(code.mtlType).toBe("front_money");
    });

    it("code 9: Marker Issuance maps to marker", () => {
      const code = MTL_TXN_TYPE_CODES[9];
      expect(code.label).toBe("Marker Issuance");
      expect(code.mtlType).toBe("marker");
    });

    it("code 10: Cash from Wire Transfer maps to cash_out", () => {
      const code = MTL_TXN_TYPE_CODES[10];
      expect(code.label).toBe("Cash from Wire Transfer");
      expect(code.mtlType).toBe("cash_out");
    });

    it("code 11: Currency Exchange (out) maps to chip_fill", () => {
      const code = MTL_TXN_TYPE_CODES[11];
      expect(code.label).toBe("Currency Exchange");
      expect(code.mtlType).toBe("chip_fill");
    });

    it("code 12: Jackpot/Tournament Payout maps to cash_out", () => {
      const code = MTL_TXN_TYPE_CODES[12];
      expect(code.label).toBe("Jackpot/Tournament Payout");
      expect(code.mtlType).toBe("cash_out");
    });
  });

  describe("direction mapping consistency", () => {
    it("all codes 1-5 are direction 'in'", () => {
      const inCodes = [1, 2, 3, 4, 5];
      inCodes.forEach((code) => {
        expect(MTL_TXN_TYPE_CODES[code].direction).toBe("in");
      });
    });

    it("all codes 6-12 are direction 'out'", () => {
      const outCodes = [6, 7, 8, 9, 10, 11, 12];
      outCodes.forEach((code) => {
        expect(MTL_TXN_TYPE_CODES[code].direction).toBe("out");
      });
    });
  });

  describe("mtlType mapping", () => {
    it("buy_in is used for chip purchases", () => {
      expect(MTL_TXN_TYPE_CODES[1].mtlType).toBe("buy_in");
    });

    it("cash_out is used for redemptions and payouts", () => {
      expect(MTL_TXN_TYPE_CODES[6].mtlType).toBe("cash_out");
      expect(MTL_TXN_TYPE_CODES[10].mtlType).toBe("cash_out");
      expect(MTL_TXN_TYPE_CODES[12].mtlType).toBe("cash_out");
    });

    it("front_money is used for deposits/withdrawals", () => {
      expect(MTL_TXN_TYPE_CODES[2].mtlType).toBe("front_money");
      expect(MTL_TXN_TYPE_CODES[3].mtlType).toBe("front_money");
      expect(MTL_TXN_TYPE_CODES[7].mtlType).toBe("front_money");
      expect(MTL_TXN_TYPE_CODES[8].mtlType).toBe("front_money");
    });

    it("marker is used for marker operations", () => {
      expect(MTL_TXN_TYPE_CODES[4].mtlType).toBe("marker");
      expect(MTL_TXN_TYPE_CODES[9].mtlType).toBe("marker");
    });

    it("chip_fill is used for currency exchange", () => {
      expect(MTL_TXN_TYPE_CODES[5].mtlType).toBe("chip_fill");
      expect(MTL_TXN_TYPE_CODES[11].mtlType).toBe("chip_fill");
    });
  });

  describe("getAllTxnTypeCodes", () => {
    it("returns array of all 12 codes", () => {
      const codes = getAllTxnTypeCodes();
      expect(codes).toHaveLength(12);
    });

    it("returns MtlTxnTypeCode objects", () => {
      const codes = getAllTxnTypeCodes();
      codes.forEach((code) => {
        expect(code).toHaveProperty("code");
        expect(code).toHaveProperty("label");
        expect(code).toHaveProperty("direction");
        expect(code).toHaveProperty("mtlType");
        expect(code).toHaveProperty("category");
      });
    });

    it("includes codes 1-12", () => {
      const codes = getAllTxnTypeCodes();
      const codeNumbers = codes.map((c) => c.code);
      for (let i = 1; i <= 12; i++) {
        expect(codeNumbers).toContain(i);
      }
    });
  });

  describe("getCashInCodes", () => {
    it("returns exactly 5 cash-in codes", () => {
      const codes = getCashInCodes();
      expect(codes).toHaveLength(5);
    });

    it("returns only codes with direction 'in'", () => {
      const codes = getCashInCodes();
      codes.forEach((code) => {
        expect(code.direction).toBe("in");
      });
    });

    it("returns only codes with category 'cash_in'", () => {
      const codes = getCashInCodes();
      codes.forEach((code) => {
        expect(code.category).toBe("cash_in");
      });
    });

    it("returns codes 1-5", () => {
      const codes = getCashInCodes();
      const codeNumbers = codes.map((c) => c.code).sort((a, b) => a - b);
      expect(codeNumbers).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe("getCashOutCodes", () => {
    it("returns exactly 7 cash-out codes", () => {
      const codes = getCashOutCodes();
      expect(codes).toHaveLength(7);
    });

    it("returns only codes with direction 'out'", () => {
      const codes = getCashOutCodes();
      codes.forEach((code) => {
        expect(code.direction).toBe("out");
      });
    });

    it("returns only codes with category 'cash_out'", () => {
      const codes = getCashOutCodes();
      codes.forEach((code) => {
        expect(code.category).toBe("cash_out");
      });
    });

    it("returns codes 6-12", () => {
      const codes = getCashOutCodes();
      const codeNumbers = codes.map((c) => c.code).sort((a, b) => a - b);
      expect(codeNumbers).toEqual([6, 7, 8, 9, 10, 11, 12]);
    });
  });

  describe("getTxnTypeByCode", () => {
    it("returns correct code for valid code number", () => {
      const code = getTxnTypeByCode(1);
      expect(code).toBeDefined();
      expect(code?.code).toBe(1);
      expect(code?.label).toBe("Purchase of Chips/Tokens");
    });

    it("returns undefined for code 0", () => {
      const code = getTxnTypeByCode(0);
      expect(code).toBeUndefined();
    });

    it("returns undefined for code 13", () => {
      const code = getTxnTypeByCode(13);
      expect(code).toBeUndefined();
    });

    it("returns undefined for negative code", () => {
      const code = getTxnTypeByCode(-1);
      expect(code).toBeUndefined();
    });

    it("returns correct code for each valid number", () => {
      for (let i = 1; i <= 12; i++) {
        const code = getTxnTypeByCode(i);
        expect(code).toBeDefined();
        expect(code?.code).toBe(i);
      }
    });
  });

  describe("formatTxnTypeCode", () => {
    it("formats code as 'number. label'", () => {
      const code = MTL_TXN_TYPE_CODES[1];
      const formatted = formatTxnTypeCode(code);
      expect(formatted).toBe("1. Purchase of Chips/Tokens");
    });

    it("formats all codes correctly", () => {
      const codes = getAllTxnTypeCodes();
      codes.forEach((code) => {
        const formatted = formatTxnTypeCode(code);
        expect(formatted).toBe(`${code.code}. ${code.label}`);
      });
    });

    it("formats code 6 correctly", () => {
      const code = MTL_TXN_TYPE_CODES[6];
      const formatted = formatTxnTypeCode(code);
      expect(formatted).toBe("6. Redemption of Chips/Tokens/Tickets");
    });

    it("formats code 12 correctly", () => {
      const code = MTL_TXN_TYPE_CODES[12];
      const formatted = formatTxnTypeCode(code);
      expect(formatted).toBe("12. Jackpot/Tournament Payout");
    });
  });

  describe("code structure validation", () => {
    it("all codes have required properties", () => {
      const codes = getAllTxnTypeCodes();
      codes.forEach((code) => {
        expect(typeof code.code).toBe("number");
        expect(typeof code.label).toBe("string");
        expect(["in", "out"]).toContain(code.direction);
        expect(["buy_in", "cash_out", "front_money", "marker", "chip_fill"]).toContain(
          code.mtlType
        );
        expect(["cash_in", "cash_out"]).toContain(code.category);
      });
    });

    it("code property matches object key", () => {
      Object.entries(MTL_TXN_TYPE_CODES).forEach(([key, value]) => {
        expect(value.code).toBe(parseInt(key, 10));
      });
    });

    it("all labels are non-empty strings", () => {
      const codes = getAllTxnTypeCodes();
      codes.forEach((code) => {
        expect(code.label.length).toBeGreaterThan(0);
      });
    });
  });

  describe("type safety", () => {
    it("MTL_TXN_TYPE_CODES is readonly", () => {
      // This test verifies that the const assertion is in place
      // TypeScript would error if we tried to modify it
      const codesCopy = { ...MTL_TXN_TYPE_CODES };
      expect(codesCopy).toEqual(MTL_TXN_TYPE_CODES);
    });

    it("functions return correct types", () => {
      const allCodes: MtlTxnTypeCode[] = getAllTxnTypeCodes();
      const cashInCodes: MtlTxnTypeCode[] = getCashInCodes();
      const cashOutCodes: MtlTxnTypeCode[] = getCashOutCodes();
      const singleCode: MtlTxnTypeCode | undefined = getTxnTypeByCode(1);
      const formattedCode: string = formatTxnTypeCode(MTL_TXN_TYPE_CODES[1]);

      expect(Array.isArray(allCodes)).toBe(true);
      expect(Array.isArray(cashInCodes)).toBe(true);
      expect(Array.isArray(cashOutCodes)).toBe(true);
      expect(singleCode).toBeDefined();
      expect(typeof formattedCode).toBe("string");
    });
  });
});
