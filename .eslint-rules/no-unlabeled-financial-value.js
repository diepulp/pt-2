/**
 * ESLint Rule: no-unlabeled-financial-value
 *
 * Enforces SRC §L1 — every rendered currency value must declare its authority.
 * Phase 1.4 lint enforcement gate for PT-2 Wave 1 financial telemetry.
 *
 * Two sub-rules, activated by the `mode` option:
 *
 *   mode: 'dto' (applied to services/.../dtos.ts)
 *     Flags TS property signatures typed as `number` or `number | null` in
 *     service DTO files, UNLESS the field name appears in FINANCIAL_VALUE_FIELD_ALLOWLIST
 *     for that service. Allowlisted fields are those already migrated to FinancialValue<T>
 *     or confirmed non-currency (DEC-1 resolution).
 *
 *   mode: 'render' (applied to components/.../*.{ts,tsx} and app/.../*.{ts,tsx})
 *     Flags calls of the form `formatDollars(expr.value)` — where the argument is a
 *     MemberExpression whose property name is `value`. This pattern directly accesses the
 *     raw numeric payload of a FinancialValue envelope without going through the authority-
 *     aware <FinancialValue> component.
 *
 * Assumption (DEC-5): The `.value` accessor is the authoritative signal for raw numeric
 * extraction from FinancialValue envelopes in this codebase. Rules relying on type inference
 * would require type-aware linting (project: true) which is excluded from this enforcement
 * gate. Pattern-based detection is documented here to be explicit about coverage bounds.
 *
 * DEF-NEVER: `hold_percent` must never be flagged by this rule (FIB-S constraint).
 *
 * Reference: docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-1-FORBIDDEN-LABELS.md §5
 *            docs/21-exec-spec/PRD-078/EXEC-078-financial-telemetry-wave1-phase1.4-validation-lint-truth.md DEC-1
 */

'use strict';

// DEC-1: Denylist of FinancialValue<T> fields per service DTO file.
// Key: suffix match against the filename (e.g. 'visit/dtos.ts' matches services/visit/dtos.ts).
// Value: Set of field names that MUST be FinancialValue<T>, not bare `number` or `number | null`.
// These fields have been migrated to FinancialValue<T> in Phase 1.1–1.3.
// The rule is a regression gate: if a listed field reverts to bare number, it is flagged.
// Fields NOT in this map (or in files not in this map) are out of scope for Phase 1.4.
const FINANCIAL_VALUE_FIELD_DENYLIST = {
  'visit/dtos.ts': new Set([
    'session_total_buy_in',
    'session_total_cash_out',
    'session_net',
    'total_buy_in',
    'total_cash_out',
    'net',
  ]),
  'player-financial/dtos.ts': new Set([
    'original_total',
    'adjustment_total',
    'net_total',
  ]),
  'loyalty/dtos.ts': new Set(['theo']),
  // shift-intelligence/dtos.ts is intentionally omitted: observedValue/baselineMedian/baselineMad/
  // thresholdValue are statistical numbers in the hold_percent RatioAnomalyAlertDTO interface.
  // FIB-S DEF-NEVER prohibits flagging hold_percent-context fields; these are not currency values.
};

// DEF-NEVER: fields that must never be flagged regardless of type (FIB-S hard constraint).
const NEVER_FLAG = new Set(['hold_percent']);

/**
 * Returns the denylist Set for a given filename, or null if the file is not in Phase 1.4 scope.
 * Uses suffix matching so the rule works regardless of absolute path prefix.
 */
function getDenylistForFile(filename) {
  for (const [suffix, denylist] of Object.entries(FINANCIAL_VALUE_FIELD_DENYLIST)) {
    if (filename.endsWith(suffix) || filename.includes(`/${suffix}`)) {
      return denylist;
    }
  }
  return null;
}

/**
 * Returns true if the TSTypeAnnotation node represents `number` or `number | null`.
 * Only these two shapes are flagged — stricter types like `FinancialValue<...>` are not.
 */
function isBareNumber(typeAnnotation) {
  if (!typeAnnotation) return false;
  const inner = typeAnnotation.typeAnnotation;
  if (!inner) return false;

  // Plain `number`
  if (inner.type === 'TSNumberKeyword') return true;

  // `number | null` (union of exactly two members)
  if (inner.type === 'TSUnionType' && inner.types && inner.types.length === 2) {
    const types = inner.types;
    const hasNumber = types.some((t) => t.type === 'TSNumberKeyword');
    const hasNull = types.some((t) => t.type === 'TSNullKeyword');
    return hasNumber && hasNull;
  }

  return false;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'SRC §L1: every rendered currency value must declare its authority via FinancialValue<T> wrapper. ' +
        "mode='dto': regression gate — flags DEC-1 FinancialValue<T> fields that have reverted to bare " +
        '`number`/`number | null`. Only the 5 service DTOs and 14 fields listed in DEC-1 are in scope. ' +
        "mode='render' flags formatDollars(expr.value) call patterns — pattern-based detection " +
        'assumes `.value` is the raw-number accessor on FinancialValue envelopes (DEC-5 assumption). ' +
        'DEF-NEVER: hold_percent is unconditionally exempt.',
      category: 'Financial Telemetry Enforcement',
      recommended: true,
    },
    messages: {
      unlabeledDtoField:
        "SRC §L1: '{{name}}' was migrated to FinancialValue<T> in Phase 1.1–1.3 but has reverted to " +
        'bare `number` or `number | null`. Restore the FinancialValue<T> wrapper to preserve authority declaration.',
      unlabeledRenderCall:
        "SRC §L1: formatDollars({{arg}}.value) renders a raw numeric payload without authority declaration. " +
        'Use the <FinancialValue> component instead, which renders the authority label alongside the value.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['dto', 'render'],
            description: "'dto' activates DTO sub-rule; 'render' activates render sub-rule.",
          },
        },
        required: ['mode'],
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const filename = context.getFilename();
    const options = context.options[0] || {};
    const mode = options.mode;

    // Skip test files unconditionally
    if (filename.includes('.test.') || filename.includes('.spec.')) {
      return {};
    }

    if (mode === 'dto') {
      // §L1 DTO regression gate: flag DEC-1 FinancialValue<T> fields that have reverted to bare number.
      // Only the 5 service DTOs and fields listed in FINANCIAL_VALUE_FIELD_DENYLIST are in scope.
      const denylist = getDenylistForFile(filename);

      // File not in Phase 1.4 DTO scope — skip entirely.
      if (!denylist) return {};

      return {
        TSPropertySignature(node) {
          const keyNode = node.key;
          const name =
            keyNode.type === 'Identifier'
              ? keyNode.name
              : keyNode.type === 'Literal'
                ? String(keyNode.value)
                : null;

          if (!name) return;

          // DEF-NEVER: unconditionally exempt
          if (NEVER_FLAG.has(name)) return;

          // Only flag fields that are in the DEC-1 denylist for this file.
          // All other bare number fields in the DTO are out of scope for Phase 1.4.
          if (!denylist.has(name)) return;

          if (isBareNumber(node.typeAnnotation)) {
            context.report({
              node: keyNode,
              messageId: 'unlabeledDtoField',
              data: { name },
            });
          }
        },
      };
    }

    if (mode === 'render') {
      // §L1 Render sub-rule: flag formatDollars(expr.value) pattern
      return {
        CallExpression(node) {
          // Must be a bare `formatDollars(...)` call (not method call)
          if (
            node.callee.type !== 'Identifier' ||
            node.callee.name !== 'formatDollars'
          ) {
            return;
          }

          if (node.arguments.length === 0) return;

          const arg = node.arguments[0];

          // Flag when argument is MemberExpression with .value property
          if (
            arg.type === 'MemberExpression' &&
            !arg.computed &&
            arg.property.type === 'Identifier' &&
            arg.property.name === 'value'
          ) {
            // Reconstruct a readable representation of the object part
            const objectSource =
              arg.object.type === 'Identifier'
                ? arg.object.name
                : context.getSourceCode().getText(arg.object);

            context.report({
              node,
              messageId: 'unlabeledRenderCall',
              data: { arg: objectSource },
            });
          }
        },
      };
    }

    // Unknown mode — return empty (fail-open; schema validation catches bad mode values)
    return {};
  },
};
