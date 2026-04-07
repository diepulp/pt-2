/**
 * ESLint Rule: no-unsafe-error-details
 *
 * Purpose: Enforce INV-ERR-DETAILS — every `details:` assignment must use
 * `safeErrorDetails()`, `safeDetails()`, a literal primitive, or an inline
 * object with only primitive-valued properties.  Passing a bare variable or
 * member-expression (e.g. `details: error`, `details: error.details`) risks
 * injecting a raw Error / PostgrestError object that carries circular refs,
 * crashing `JSON.stringify` with "cyclic object value".
 *
 * Reference: docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md (INV-ERR-DETAILS)
 *            docs/issues/cyclic-error/fix-gap.md
 *
 * @example
 * // ❌ BAD — raw variable or member-expression
 * new DomainError('CODE', 'msg', { details: error });
 * new DomainError('CODE', 'msg', { details: error.details });
 * return { ok: false, details: mapped.details };
 *
 * // ✅ GOOD — sanitizer wrapper
 * new DomainError('CODE', 'msg', { details: safeErrorDetails(error) });
 * return { ok: false, details: safeDetails(mapped.details) };
 *
 * // ✅ GOOD — inline primitive object
 * new DomainError('CODE', 'msg', { details: { code: error.code, message: error.message } });
 *
 * // ✅ GOOD — literal value
 * new DomainError('CODE', 'msg', { details: 'description string' });
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'INV-ERR-DETAILS: `details:` must use safeErrorDetails/safeDetails or a literal/inline-object — never a bare variable or member-expression',
      category: 'Error Safety',
      recommended: true,
    },
    messages: {
      unsafeDetails:
        'INV-ERR-DETAILS VIOLATION: `details: {{source}}` passes a raw reference that may contain circular refs. ' +
        'Wrap with `safeErrorDetails({{source}})` or `safeDetails({{source}})`, or use an inline object with primitive values.',
    },
    schema: [],
  },

  create(context) {
    const filename = context.getFilename();

    // Skip test files — they can construct arbitrary errors
    if (filename.includes('.test.') || filename.includes('.spec.')) {
      return {};
    }

    // Skip safe-error-details.ts itself (it IS the sanitizer)
    if (filename.includes('safe-error-details')) {
      return {};
    }

    /**
     * Check whether an AST value node is "safe" for use in `details:`.
     *
     * Safe values:
     *   - Literals (string, number, boolean, null)
     *   - `undefined` identifier
     *   - Object expressions  (inline { key: val })
     *   - Array expressions   (inline [ ... ])
     *   - Template literals
     *   - Call to safeErrorDetails / safeDetails / .flatten()
     *   - Conditional (ternary) — both branches checked separately
     *   - Logical expression — both sides checked separately
     *   - typeof expression
     *   - String() / Number() / Boolean() wrappers
     */
    function isSafeValue(node) {
      if (!node) return true;

      switch (node.type) {
        // Primitives
        case 'Literal':
          return true;

        // undefined
        case 'Identifier':
          return node.name === 'undefined';

        // Inline objects and arrays are safe (author controls shape)
        case 'ObjectExpression':
        case 'ArrayExpression':
          return true;

        case 'TemplateLiteral':
          return true;

        // Call expressions: allow sanitizer wrappers and known-safe calls
        case 'CallExpression': {
          const callee = node.callee;

          // safeErrorDetails(...) or safeDetails(...)
          if (
            callee.type === 'Identifier' &&
            (callee.name === 'safeErrorDetails' ||
              callee.name === 'safeDetails')
          ) {
            return true;
          }

          // obj.safeDetails(...) / obj.safeErrorDetails(...)
          if (
            callee.type === 'MemberExpression' &&
            callee.property.type === 'Identifier' &&
            (callee.property.name === 'safeErrorDetails' ||
              callee.property.name === 'safeDetails')
          ) {
            return true;
          }

          // .flatten() — Zod error flattening
          if (
            callee.type === 'MemberExpression' &&
            callee.property.type === 'Identifier' &&
            callee.property.name === 'flatten'
          ) {
            return true;
          }

          // String(...), Number(...), Boolean(...)
          if (
            callee.type === 'Identifier' &&
            (callee.name === 'String' ||
              callee.name === 'Number' ||
              callee.name === 'Boolean')
          ) {
            return true;
          }

          return false;
        }

        // Ternary: safe if both branches are safe
        case 'ConditionalExpression':
          return (
            isSafeValue(node.consequent) && isSafeValue(node.alternate)
          );

        // Logical: safe if both sides are safe
        case 'LogicalExpression':
          return isSafeValue(node.left) && isSafeValue(node.right);

        // Unary (e.g. typeof x)
        case 'UnaryExpression':
          return node.operator === 'typeof';

        // TSAsExpression / TSNonNullExpression — check inner
        case 'TSAsExpression':
        case 'TSNonNullExpression':
          return isSafeValue(node.expression);

        // Everything else (Identifier, MemberExpression, etc.) is unsafe
        default:
          return false;
      }
    }

    return {
      /**
       * Match `Property` nodes where key is `details` and value is unsafe.
       *
       * This catches:
       *   { details: error }
       *   { details: error.details }
       *   { details: mapped.details }
       *   new DomainError('X', 'Y', { details: error })
       */
      Property(node) {
        // Only match key named "details"
        if (
          node.key.type !== 'Identifier' ||
          node.key.name !== 'details'
        ) {
          return;
        }

        // Skip shorthand ({ details } is just a variable, but unlikely in error paths)
        if (node.shorthand) {
          // Still flag — `{ details }` is the same as `{ details: details }`
          const sourceCode = context.getSourceCode();
          context.report({
            node: node.value,
            messageId: 'unsafeDetails',
            data: { source: sourceCode.getText(node.value) },
          });
          return;
        }

        if (!isSafeValue(node.value)) {
          const sourceCode = context.getSourceCode();
          const valueText = sourceCode.getText(node.value);

          context.report({
            node: node.value,
            messageId: 'unsafeDetails',
            data: { source: valueText },
          });
        }
      },
    };
  },
};
