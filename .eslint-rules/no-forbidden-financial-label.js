/**
 * ESLint Rule: no-forbidden-financial-label
 *
 * Enforces WAVE-1-FORBIDDEN-LABELS.md §4.1–4.5 for PT-2 Wave 1 financial telemetry.
 * Prevents deprecated or misleading financial labels from appearing in production UI
 * and DTO code.
 *
 * Sub-rules:
 *   §4.1 — 'Handle' without derived-rename exception (SRC §L3, §F3)
 *   §4.2 — 'Win' without authority qualifier (SRC §L3)
 *   §4.3 — 'Coverage' in KPI display file contexts (SRC §K1)
 *   §4.4 — 'Theo: 0' / 'Theo: $0' placeholder zero (SRC §F4)
 *   §4.5 — 'totalChipsOut'/'totalChipsIn'/'chipsOut'/'chipsIn' in services/.../dtos.ts (SRC §L3)
 *
 * Reference: docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-FORBIDDEN-LABELS.md
 */

'use strict';

// §4.3: File path pattern for KPI display context
// Matches components paths containing metric, kpi, summary, oversight, dashboard, or analytics
const KPI_FILE_PATTERN =
  /components[/\\](.*[/\\])?(metric|kpi|summary|oversight|dashboard|analytics)[^/\\]*\.tsx$/i;

// §4.2: Win lookbehind + lookahead per WAVE-1-FORBIDDEN-LABELS.md §4.2
// Flags 'Win' not preceded by a qualifier (Inventory|Estimated|Table|Pit|Actual|Net + space)
// and not followed by '/Loss' or '/loss' (case-insensitive — "Win/loss" is the same compound).
// Note: JS lookbehind requires Node.js 10+ (V8 ≥ 6.3) — safe for local ESLint execution.
const WIN_VIOLATION_REGEX =
  /(?<!(Inventory|Estimated|Table|Pit|Actual|Net)\s)\bWin\b(?!\s*\/\s*[Ll]oss)/;

// §4.4: Theo placeholder zero patterns
const THEO_ZERO_PATTERNS = [/Theo\s*:\s*0\b/, /Theo\s*:\s*\$0(\.00)?\b/];

// §4.5: DTO chip identifier names
const CHIP_IDENTIFIERS = new Set([
  'totalChipsOut',
  'totalChipsIn',
  'chipsOut',
  'chipsIn',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbids deprecated financial labels per WAVE-1-FORBIDDEN-LABELS.md §4.1–4.5 (SRC §L3, §F3, §F4, §K1). ' +
        'Phase 1.4 lint enforcement gate for PT-2 Wave 1 financial telemetry.',
      category: 'Financial Telemetry Enforcement',
      recommended: true,
    },
    messages: {
      forbiddenHandle:
        "SRC §L3 forbids 'Handle' as a financial label (WAVE-1-FORBIDDEN-LABELS §4.1). " +
        "Use 'Estimated Drop'. Transitional label 'Handle (Estimated Drop)' is permitted only during deprecation periods.",
      forbiddenWin:
        "SRC §L3 forbids unqualified 'Win' (WAVE-1-FORBIDDEN-LABELS §4.2). " +
        "Use 'Inventory Win', 'Estimated Win', 'Table Win', 'Pit Win', or 'Actual Win' depending on source authority.",
      forbiddenCoverage:
        "SRC §K1 renamed 'Coverage' to 'Attribution Ratio' to prevent conflation with completeness (WAVE-1-FORBIDDEN-LABELS §4.3). " +
        "Use <AttributionRatio> component or label 'Attribution Ratio'.",
      forbiddenTheoZero:
        "SRC §F4 forbids rendering placeholder zero as authoritative (WAVE-1-FORBIDDEN-LABELS §4.4). " +
        "Render with FinancialValue.completeness.status='unknown' and explicit 'Not computed' UI treatment.",
      forbiddenChipIdentifier:
        "SRC §L3: '{{name}}' implies observed authority (chips = physical count). " +
        "Rename to the 'Cash' variant ('totalCashOut'/'totalCashIn') to match PFT source (WAVE-1-FORBIDDEN-LABELS §4.5).",
    },
    schema: [
      {
        type: 'object',
        properties: {
          // When true, only run §4.5 DTO chip identifier checks (for services/**/dtos.ts config block)
          dtoChipIdentifiersOnly: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const filename = context.getFilename();
    const options = context.options[0] || {};
    const dtoChipIdentifiersOnly = options.dtoChipIdentifiersOnly === true;

    // Skip test files (§6.3 exemption)
    if (filename.includes('.test.') || filename.includes('.spec.')) {
      return {};
    }

    // §4.5: Is this a DTO file in services/?
    const isDtoFile =
      /services[/\\]/.test(filename) && filename.endsWith('dtos.ts');

    // If dtoChipIdentifiersOnly mode is set and file is not a DTO file, skip entirely
    if (dtoChipIdentifiersOnly && !isDtoFile) {
      return {};
    }

    // §4.3: Is this file a KPI display context?
    // Per WAVE-1-FORBIDDEN-LABELS §4.3, Coverage checks scope to components/ files only.
    // KPI_ROUTE_PATTERN is not applied here — route page.tsx files contain marketing prose
    // that legitimately uses 'coverage' as a general concept, not a financial KPI label.
    const isKpiContext = KPI_FILE_PATTERN.test(filename);

    /**
     * Check a string value for forbidden label patterns (§4.1–4.4).
     * Reports violations directly on the given AST node.
     */
    function checkStringValue(value, node) {
      if (typeof value !== 'string' || !value.trim()) return;

      // §4.1 — Handle (SRC §L3, §F3)
      if (/\bHandle\b/.test(value)) {
        // Exception: 'Handle (Estimated Drop)' is permitted as a transitional label
        if (!/\bHandle\s*\(\s*Estimated\s+Drop\s*\)/.test(value)) {
          context.report({ node, messageId: 'forbiddenHandle' });
        }
      }

      // §4.2 — Win without qualifier (SRC §L3)
      if (/\bWin\b/.test(value) && WIN_VIOLATION_REGEX.test(value)) {
        context.report({ node, messageId: 'forbiddenWin' });
      }

      // §4.3 — Coverage in KPI context (SRC §K1)
      if (isKpiContext && /\bCoverage(\s+quality)?\b/i.test(value)) {
        context.report({ node, messageId: 'forbiddenCoverage' });
      }

      // §4.4 — Theo placeholder zero (SRC §F4)
      for (const pattern of THEO_ZERO_PATTERNS) {
        if (pattern.test(value)) {
          context.report({ node, messageId: 'forbiddenTheoZero' });
          break;
        }
      }
    }

    return {
      // String literals (covers attribute values like label="Handle", const x = "Win", etc.)
      // Skip import path literals — they are never user-visible UI labels.
      Literal(node) {
        if (dtoChipIdentifiersOnly) return;
        if (node.parent && node.parent.type === 'ImportDeclaration') return;
        if (typeof node.value === 'string') {
          checkStringValue(node.value, node);
        }
      },

      // Template literals (covers `Theo: ${0}` patterns in JSX)
      TemplateLiteral(node) {
        if (dtoChipIdentifiersOnly) return;
        // Check static quasis (the non-interpolated parts)
        for (const quasi of node.quasis) {
          checkStringValue(quasi.value.cooked || quasi.value.raw, quasi);
        }
      },

      // JSX text content (covers <div>Handle</div> patterns)
      JSXText(node) {
        if (dtoChipIdentifiersOnly) return;
        checkStringValue(node.value.trim(), node);
      },

      // §4.5: TypeScript property signatures in DTO files
      // Catches: totalChipsOut: string, totalChipsIn: FinancialValue, etc.
      TSPropertySignature(node) {
        if (!isDtoFile) return;

        const keyNode = node.key;
        const name =
          keyNode.type === 'Identifier'
            ? keyNode.name
            : keyNode.type === 'Literal'
              ? String(keyNode.value)
              : null;

        if (name && CHIP_IDENTIFIERS.has(name)) {
          context.report({
            node: keyNode,
            messageId: 'forbiddenChipIdentifier',
            data: { name },
          });
        }
      },

      // §4.5: Regular object property declarations in DTO files (type aliases, etc.)
      Property(node) {
        if (!isDtoFile) return;

        const keyNode = node.key;
        const name =
          keyNode.type === 'Identifier'
            ? keyNode.name
            : keyNode.type === 'Literal'
              ? String(keyNode.value)
              : null;

        if (name && CHIP_IDENTIFIERS.has(name)) {
          context.report({
            node: keyNode,
            messageId: 'forbiddenChipIdentifier',
            data: { name },
          });
        }
      },
    };
  },
};
