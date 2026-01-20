/**
 * Tests for SRM Line Reference Updater
 *
 * @jest-environment node
 */

import {
  extractLineReferences,
  validateReference,
  applyMapping,
} from "../update-srm-line-refs";
import type { LineReference, ReferenceResult } from "../update-srm-line-refs";

describe("SRM Line Reference Updater", () => {
  describe("extractLineReferences", () => {
    it("should extract single line references", () => {
      const content = `
## Security Policy

See SRM:590 for security patterns.
The role taxonomy is defined at SRM:650.
`;

      const references = extractLineReferences(content, "test.md");

      expect(references).toHaveLength(2);
      expect(references[0]).toMatchObject({
        matchText: "SRM:590",
        startLine: 590,
        endLine: undefined,
        lineNumber: 4,
      });
      expect(references[1]).toMatchObject({
        matchText: "SRM:650",
        startLine: 650,
        endLine: undefined,
        lineNumber: 5,
      });
    });

    it("should extract range references", () => {
      const content = `
The DTO policy (SRM:49-318) defines ownership rules.
Error taxonomy lives at SRM:405-589.
`;

      const references = extractLineReferences(content, "test.md");

      expect(references).toHaveLength(2);
      expect(references[0]).toMatchObject({
        matchText: "SRM:49-318",
        startLine: 49,
        endLine: 318,
        lineNumber: 2,
      });
      expect(references[1]).toMatchObject({
        matchText: "SRM:405-589",
        startLine: 405,
        endLine: 589,
        lineNumber: 3,
      });
    });

    it("should handle multiple references on same line", () => {
      const content = `
Compare SRM:100 with SRM:200-300 for differences.
`;

      const references = extractLineReferences(content, "test.md");

      expect(references).toHaveLength(2);
      expect(references[0].matchText).toBe("SRM:100");
      expect(references[1].matchText).toBe("SRM:200-300");
    });

    it("should capture context around references", () => {
      const content = `
Line 1
Line 2
Line 3
See SRM:590 for details
Line 5
Line 6
Line 7
`;

      const references = extractLineReferences(content, "test.md");

      expect(references).toHaveLength(1);
      expect(references[0].context).toContain("Line 2");
      expect(references[0].context).toContain("Line 3");
      expect(references[0].context).toContain("See SRM:590");
      expect(references[0].context).toContain("Line 5");
      expect(references[0].context).toContain("Line 6");
    });

    it("should handle references in code comments", () => {
      const content = `
// Security policy from SRM:590-853
export const validateAccess = () => {
  // Check role (SRM:650)
  return true;
};
`;

      const references = extractLineReferences(content, "test.ts");

      expect(references).toHaveLength(2);
      expect(references[0]).toMatchObject({
        matchText: "SRM:590-853",
        startLine: 590,
        endLine: 853,
      });
      expect(references[1]).toMatchObject({
        matchText: "SRM:650",
        startLine: 650,
      });
    });

    it("should not match partial patterns", () => {
      const content = `
This is not a reference: RM:100
Neither is this: SRM100
Or this: SRM:
`;

      const references = extractLineReferences(content, "test.md");

      expect(references).toHaveLength(0);
    });
  });

  describe("validateReference", () => {
    const srmLineCount = 2127;

    it("should validate references within range", () => {
      const ref: LineReference = {
        filePath: "test.md",
        lineNumber: 10,
        matchText: "SRM:590",
        startLine: 590,
        context: "",
        fullLine: "",
      };

      expect(validateReference(ref, srmLineCount)).toBe(true);
    });

    it("should validate range references within bounds", () => {
      const ref: LineReference = {
        filePath: "test.md",
        lineNumber: 10,
        matchText: "SRM:590-853",
        startLine: 590,
        endLine: 853,
        context: "",
        fullLine: "",
      };

      expect(validateReference(ref, srmLineCount)).toBe(true);
    });

    it("should reject references below range", () => {
      const ref: LineReference = {
        filePath: "test.md",
        lineNumber: 10,
        matchText: "SRM:0",
        startLine: 0,
        context: "",
        fullLine: "",
      };

      expect(validateReference(ref, srmLineCount)).toBe(false);
    });

    it("should reject references above range", () => {
      const ref: LineReference = {
        filePath: "test.md",
        lineNumber: 10,
        matchText: "SRM:9999",
        startLine: 9999,
        context: "",
        fullLine: "",
      };

      expect(validateReference(ref, srmLineCount)).toBe(false);
    });

    it("should reject invalid range (end before start)", () => {
      const ref: LineReference = {
        filePath: "test.md",
        lineNumber: 10,
        matchText: "SRM:853-590",
        startLine: 853,
        endLine: 590,
        context: "",
        fullLine: "",
      };

      expect(validateReference(ref, srmLineCount)).toBe(false);
    });

    it("should reject range with end out of bounds", () => {
      const ref: LineReference = {
        filePath: "test.md",
        lineNumber: 10,
        matchText: "SRM:2000-9999",
        startLine: 2000,
        endLine: 9999,
        context: "",
        fullLine: "",
      };

      expect(validateReference(ref, srmLineCount)).toBe(false);
    });
  });

  describe("applyMapping", () => {
    it("should preserve references with no mapping", () => {
      const ref: LineReference = {
        filePath: "test.md",
        lineNumber: 10,
        matchText: "SRM:100",
        startLine: 100,
        context: "",
        fullLine: "",
      };

      const mapping = {
        "50": 50,
        "200": 150,
      };

      const result = applyMapping(ref, mapping);

      expect(result.valid).toBe(true);
      expect(result.newMatchText).toBeUndefined();
    });

    it("should map single line references", () => {
      const ref: LineReference = {
        filePath: "test.md",
        lineNumber: 10,
        matchText: "SRM:590",
        startLine: 590,
        context: "",
        fullLine: "",
      };

      const mapping = {
        "590": 62,
      };

      const result = applyMapping(ref, mapping);

      expect(result.valid).toBe(true);
      expect(result.newMatchText).toBe("SRM:62");
    });

    it("should map range references", () => {
      const ref: LineReference = {
        filePath: "test.md",
        lineNumber: 10,
        matchText: "SRM:405-589",
        startLine: 405,
        endLine: 589,
        context: "",
        fullLine: "",
      };

      const mapping = {
        "405": 62,
        "589": 78,
      };

      const result = applyMapping(ref, mapping);

      expect(result.valid).toBe(true);
      expect(result.newMatchText).toBe("SRM:62-78");
    });

    it("should handle exact range mapping", () => {
      const ref: LineReference = {
        filePath: "test.md",
        lineNumber: 10,
        matchText: "SRM:405-589",
        startLine: 405,
        endLine: 589,
        context: "",
        fullLine: "",
      };

      const mapping = {
        "405-589": 62, // Range becomes single line
      };

      const result = applyMapping(ref, mapping);

      expect(result.valid).toBe(true);
      expect(result.newMatchText).toBe("SRM:62");
    });

    it("should flag removed references (null mapping)", () => {
      const ref: LineReference = {
        filePath: "test.md",
        lineNumber: 10,
        matchText: "SRM:590",
        startLine: 590,
        context: "",
        fullLine: "",
      };

      const mapping = {
        "590": null,
      };

      const result = applyMapping(ref, mapping);

      expect(result.valid).toBe(false);
      expect(result.issue).toContain("removed");
    });

    it("should flag removed ranges", () => {
      const ref: LineReference = {
        filePath: "test.md",
        lineNumber: 10,
        matchText: "SRM:405-589",
        startLine: 405,
        endLine: 589,
        context: "",
        fullLine: "",
      };

      const mapping = {
        "405": null,
        "589": 62,
      };

      const result = applyMapping(ref, mapping);

      expect(result.valid).toBe(false);
      expect(result.issue).toContain("removed");
    });

    it("should map only start line if end has no mapping", () => {
      const ref: LineReference = {
        filePath: "test.md",
        lineNumber: 10,
        matchText: "SRM:100-200",
        startLine: 100,
        endLine: 200,
        context: "",
        fullLine: "",
      };

      const mapping = {
        "100": 50,
      };

      const result = applyMapping(ref, mapping);

      expect(result.valid).toBe(true);
      expect(result.newMatchText).toBe("SRM:50-200");
    });

    it("should map only end line if start has no mapping", () => {
      const ref: LineReference = {
        filePath: "test.md",
        lineNumber: 10,
        matchText: "SRM:100-200",
        startLine: 100,
        endLine: 200,
        context: "",
        fullLine: "",
      };

      const mapping = {
        "200": 150,
      };

      const result = applyMapping(ref, mapping);

      expect(result.valid).toBe(true);
      expect(result.newMatchText).toBe("SRM:100-150");
    });
  });

  describe("Integration scenarios", () => {
    it("should handle compression scenario: security section", () => {
      // Simulate compression of Security & Tenancy section (SRM:590-853 → SRM:62)
      const content = `
# Service Pattern

For role-based access control, see SRM:590-853 for complete patterns.
Individual role capabilities are at SRM:650.
RLS policy examples start at SRM:700.
`;

      const mapping = {
        "590-853": 62, // Entire section compressed to single reference
        "590": 62,
        "650": 62,
        "700": 62,
        "853": 62,
      };

      const references = extractLineReferences(content, "test.md");
      const results = references.map((ref) => applyMapping(ref, mapping));

      expect(results).toHaveLength(3);
      expect(results[0].newMatchText).toBe("SRM:62");
      expect(results[1].newMatchText).toBe("SRM:62");
      expect(results[2].newMatchText).toBe("SRM:62");
      expect(results.every((r) => r.valid)).toBe(true);
    });

    it("should handle compression scenario: DTO policy", () => {
      // Simulate compression of DTO Contract Policy (SRM:49-318 → SRM:49-61)
      const content = `
# DTO Rules

The canonical DTO standard is at SRM:49-318.
Cross-context consumption rules are at SRM:120-180.
`;

      const mapping = {
        "49": 49, // Section starts at same line
        "318": 61, // Section end moves up
        "120": 52, // Subsections compressed
        "180": 56,
      };

      const references = extractLineReferences(content, "test.md");
      const results = references.map((ref) => applyMapping(ref, mapping));

      expect(results).toHaveLength(2);
      expect(results[0].newMatchText).toBe("SRM:49-61");
      expect(results[1].newMatchText).toBe("SRM:52-56");
    });
  });
});
