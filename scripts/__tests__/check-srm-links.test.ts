/**
 * Tests for SRM Link Checker
 *
 * @jest-environment node
 */

import { extractReferences } from "../check-srm-links";
import type { DocumentReference } from "../check-srm-links";

describe("SRM Link Checker", () => {
  describe("extractReferences", () => {
    it("should extract YAML front matter references", () => {
      const content = `---
source_of_truth:
  - docs/30-security/SECURITY_TENANCY_UPGRADE.md
  - docs/30-security/SEC-001-rls-policy-matrix.md
---

# Content here`;

      const references = extractReferences(content);

      expect(references).toHaveLength(2);
      expect(references[0]).toMatchObject({
        path: "docs/30-security/SECURITY_TENANCY_UPGRADE.md",
        lineNumber: 3,
        type: "yaml",
      });
      expect(references[1]).toMatchObject({
        path: "docs/30-security/SEC-001-rls-policy-matrix.md",
        lineNumber: 4,
        type: "yaml",
      });
    });

    it("should extract backtick-wrapped paths", () => {
      const content = `
See the policy at \`docs/20-architecture/EDGE_TRANSPORT_POLICY.md\` for details.
Also check \`docs/25-api-data/API_SURFACE_MVP.md\`.
`;

      const references = extractReferences(content);

      expect(references).toHaveLength(2);
      expect(references[0]).toMatchObject({
        path: "docs/20-architecture/EDGE_TRANSPORT_POLICY.md",
        lineNumber: 2,
        type: "backtick",
      });
      expect(references[1]).toMatchObject({
        path: "docs/25-api-data/API_SURFACE_MVP.md",
        lineNumber: 3,
        type: "backtick",
      });
    });

    it("should extract markdown links", () => {
      const content = `
Check the [DTO Standard](docs/25-api-data/DTO_CANONICAL_STANDARD.md) for rules.
See [Error Taxonomy](docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md).
`;

      const references = extractReferences(content);

      expect(references).toHaveLength(2);
      expect(references[0]).toMatchObject({
        path: "docs/25-api-data/DTO_CANONICAL_STANDARD.md",
        lineNumber: 2,
        type: "markdown",
      });
      expect(references[1]).toMatchObject({
        path: "docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md",
        lineNumber: 3,
        type: "markdown",
      });
    });

    it("should strip anchor fragments from paths", () => {
      const content = `
See \`docs/30-security/SEC-001-rls-policy-matrix.md#casino\` for details.
Check [Policy](docs/30-security/SEC-001-rls-policy-matrix.md#section-2).
`;

      const references = extractReferences(content);

      expect(references).toHaveLength(2);
      expect(references[0].path).toBe(
        "docs/30-security/SEC-001-rls-policy-matrix.md",
      );
      expect(references[1].path).toBe(
        "docs/30-security/SEC-001-rls-policy-matrix.md",
      );
    });

    it("should strip query strings from paths", () => {
      const content = `
See \`docs/25-api-data/API_SURFACE_MVP.md?version=2\` for details.
`;

      const references = extractReferences(content);

      expect(references).toHaveLength(1);
      expect(references[0].path).toBe("docs/25-api-data/API_SURFACE_MVP.md");
    });

    it("should handle multiple references on the same line", () => {
      const content = `
Compare \`docs/20-architecture/EDGE_TRANSPORT_POLICY.md\` with \`docs/25-api-data/API_SURFACE_MVP.md\`.
`;

      const references = extractReferences(content);

      expect(references).toHaveLength(2);
      expect(references[0].lineNumber).toBe(2);
      expect(references[1].lineNumber).toBe(2);
    });

    it("should handle empty content", () => {
      const references = extractReferences("");
      expect(references).toHaveLength(0);
    });

    it("should ignore non-markdown file references", () => {
      const content = `
Check \`src/services/player.ts\` for implementation.
See \`package.json\` for dependencies.
Review \`docs/diagram.png\` for architecture.
`;

      const references = extractReferences(content);
      expect(references).toHaveLength(0);
    });

    it("should handle mixed reference types in single document", () => {
      const content = `---
source_of_truth:
  - docs/30-security/SECURITY_TENANCY_UPGRADE.md
---

# Section

See \`docs/20-architecture/EDGE_TRANSPORT_POLICY.md\` for details.

Also check the [DTO Standard](docs/25-api-data/DTO_CANONICAL_STANDARD.md).
`;

      const references = extractReferences(content);

      expect(references).toHaveLength(3);
      expect(references[0].type).toBe("yaml");
      expect(references[1].type).toBe("backtick");
      expect(references[2].type).toBe("markdown");
    });

    it("should preserve context for each reference", () => {
      const content = `
This is a line with \`docs/25-api-data/API_SURFACE_MVP.md\` reference.
`;

      const references = extractReferences(content);

      expect(references[0].context).toContain("This is a line with");
      expect(references[0].context).toContain(
        "docs/25-api-data/API_SURFACE_MVP.md",
      );
    });

    it("should truncate very long context lines", () => {
      const longLine = "A".repeat(200) + " `docs/test.md` " + "B".repeat(200);
      const references = extractReferences(longLine);

      expect(references[0].context.length).toBeLessThanOrEqual(100);
    });

    it("should handle parentheses in markdown link text", () => {
      const content = `
See [Pattern (advanced)](docs/70-governance/PATTERN.md) for details.
`;

      const references = extractReferences(content);

      expect(references).toHaveLength(1);
      expect(references[0].path).toBe("docs/70-governance/PATTERN.md");
    });

    it("should handle multiple YAML front matter blocks", () => {
      const content = `---
source_of_truth:
  - docs/first.md
---

# Content

---
metadata:
  - docs/second.md
---
`;

      const references = extractReferences(content);

      // Should extract from both YAML blocks
      expect(references).toHaveLength(2);
      expect(references[0].path).toBe("docs/first.md");
      expect(references[1].path).toBe("docs/second.md");
    });

    it("should handle inline code with multiple backticks", () => {
      const content = `
Reference: \`\`\`docs/test.md\`\`\`
`;

      // Note: Our regex will match this pattern, which is acceptable
      // In real SRM content, triple-backticks are used for code blocks
      // and won't have paths like this inline
      const references = extractReferences(content);
      expect(references).toHaveLength(1);
      expect(references[0].path).toBe("docs/test.md");
    });

    it("should report correct line numbers", () => {
      const content = `Line 1
Line 2
Line 3 with \`docs/test1.md\`
Line 4
Line 5 with \`docs/test2.md\`
`;

      const references = extractReferences(content);

      expect(references).toHaveLength(2);
      expect(references[0].lineNumber).toBe(3);
      expect(references[1].lineNumber).toBe(5);
    });
  });

  describe("Reference deduplication", () => {
    it("should keep duplicate references on different lines", () => {
      const content = `
First mention: \`docs/test.md\`
Second mention: \`docs/test.md\`
`;

      const references = extractReferences(content);

      // Should keep both since they're on different lines
      expect(references).toHaveLength(2);
      expect(references[0].lineNumber).toBe(2);
      expect(references[1].lineNumber).toBe(3);
    });

    it("should keep same path with different anchors", () => {
      const content = `
See \`docs/test.md#section1\` and \`docs/test.md#section2\`.
`;

      const references = extractReferences(content);

      // Both should be extracted (even though path is same after cleaning)
      expect(references).toHaveLength(2);
      expect(references[0].path).toBe("docs/test.md");
      expect(references[1].path).toBe("docs/test.md");
    });
  });

  describe("Edge cases", () => {
    it("should handle paths with special characters", () => {
      const content = `
See \`docs/20-architecture/SRM_v3.0.2_ARCHIVE_11-13-25.md\`.
`;

      const references = extractReferences(content);

      expect(references).toHaveLength(1);
      expect(references[0].path).toBe(
        "docs/20-architecture/SRM_v3.0.2_ARCHIVE_11-13-25.md",
      );
    });

    it("should handle nested directory paths", () => {
      const content = `
See \`docs/70-governance/patterns/domain-modeling/GOV-PAT-001.md\`.
`;

      const references = extractReferences(content);

      expect(references).toHaveLength(1);
      expect(references[0].path).toBe(
        "docs/70-governance/patterns/domain-modeling/GOV-PAT-001.md",
      );
    });

    it("should handle Windows-style line endings", () => {
      const content = `Line 1\r\nLine 2 with \`docs/test.md\`\r\nLine 3`;

      const references = extractReferences(content);

      expect(references).toHaveLength(1);
      expect(references[0].path).toBe("docs/test.md");
    });
  });
});
