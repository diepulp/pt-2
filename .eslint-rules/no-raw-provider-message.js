/**
 * ESLint Rule: no-raw-provider-message
 *
 * Purpose: Enforce PRD-081 WS4 — raw Supabase/provider error fields
 * (`message`, `hint`, `details`) must never cross a user-visible or
 * client-thrown boundary.  Accessing `.message`, `.hint`, or `.details` on a
 * provider-error-shaped variable and passing the result directly into a thrown
 * error, a toast, a template literal, or JSX leaks infrastructure diagnostics
 * to the end user.
 *
 * Scope: Only runs on files that declare `'use client'` at the top or that
 * live under the `hooks/` directory (all hooks are client-side in PT-2).
 *
 * Reference: PRD-081 WS4 — Client-Side Error Handling Standardization
 *
 * @example
 * // ❌ BAD — raw provider field in thrown error
 * throw new Error(error.message);
 *
 * // ❌ BAD — raw provider field in toast
 * toast.error(error.message);
 * toast.error('Failed', { description: error.hint });
 *
 * // ❌ BAD — raw provider field in template literal
 * throw new Error(`Failed: ${error.message}`);
 *
 * // ❌ BAD — raw provider field in JSX
 * return <p>{error.message}</p>;
 *
 * // ✅ GOOD — sanitized before propagation
 * throw normalizeClientError(error);
 * toast.error(getErrorMessage(error));
 * toast.error('Failed', { description: getErrorMessage(error) });
 *
 * // ✅ GOOD — literal string (no provider data)
 * throw new Error('Something went wrong');
 */

'use strict';

/**
 * Variable names that are heuristically associated with provider / Supabase
 * error objects.  Only `.message`, `.hint`, and `.details` accesses on these
 * objects are flagged to prevent false positives on domain objects like
 * `result.message` (ThresholdCheckResult) or `alert.message` (DTO field).
 */
const PROVIDER_ERROR_NAMES = new Set([
  'error',
  'err',
  'e',
  'supabaseError',
  'pgError',
  'authError',
  'providerError',
  'apiError',
  'dbError',
  'queryError',
  'mutationError',
  'httpError',
  'fetchError',
  'networkError',
  'rpcError',
]);

/**
 * Provider diagnostic field names that must not cross user-visible boundaries.
 */
const PROVIDER_FIELDS = new Set(['message', 'hint', 'details']);

/**
 * Call expressions whose arguments are already sanitized — do not flag.
 * These wrappers are the canonical PT-2 patterns for client-side error
 * message extraction.
 */
const SAFE_CALLEE_NAMES = new Set([
  'normalizeClientError',
  'getErrorMessage',
  'logError',
  'safeErrorDetails',
  'safeDetails',
]);

/**
 * Returns true if `node` is a MemberExpression of the form `<errorVar>.<field>`
 * where `<errorVar>` is a known provider-error variable name and `<field>` is
 * one of `message`, `hint`, `details`.
 *
 * @param {import('estree').Node} node
 * @returns {boolean}
 */
function isProviderFieldAccess(node) {
  if (node.type !== 'MemberExpression') return false;
  if (node.computed) return false; // skip bracket notation

  const { object, property } = node;

  // Property must be a known provider diagnostic field
  if (property.type !== 'Identifier') return false;
  if (!PROVIDER_FIELDS.has(property.name)) return false;

  // Object must look like a provider error variable (by name heuristic)
  // Handles both simple identifiers (error.message) and chain access
  // (someObj.error.message — check the leftmost identifier).
  const objectName = getBaseIdentifierName(object);
  return objectName !== null && PROVIDER_ERROR_NAMES.has(objectName);
}

/**
 * Walks a (potentially chained) MemberExpression to find the leftmost
 * Identifier name, e.g. `foo.bar.baz` → `'foo'`.
 *
 * @param {import('estree').Node} node
 * @returns {string|null}
 */
function getBaseIdentifierName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') return getBaseIdentifierName(node.object);
  return null;
}

/**
 * Returns true if `node` is a CallExpression whose callee is one of the known
 * safe sanitizer functions.
 *
 * @param {import('estree').Node} node
 * @returns {boolean}
 */
function isSafeCall(node) {
  if (node.type !== 'CallExpression') return false;
  const { callee } = node;

  // normalizeClientError(x), getErrorMessage(x), logError(x, ...), etc.
  if (callee.type === 'Identifier') {
    return SAFE_CALLEE_NAMES.has(callee.name);
  }

  // obj.normalizeClientError(x), obj.getErrorMessage(x), etc.
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return SAFE_CALLEE_NAMES.has(callee.property.name);
  }

  return false;
}

/**
 * Returns the source text of `node` using ESLint's source-code API.
 *
 * @param {import('eslint').Rule.RuleContext} context
 * @param {import('estree').Node} node
 * @returns {string}
 */
function sourceText(context, node) {
  return context.getSourceCode().getText(node);
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'PRD-081 WS4: Raw provider error fields (message/hint/details) must not cross ' +
        'user-visible or client-thrown boundaries. Use normalizeClientError() or getErrorMessage().',
      category: 'Error Safety',
      recommended: true,
    },
    messages: {
      rawProviderMessage:
        'PRD-081 VIOLATION: `{{source}}` passes a raw provider field that may contain ' +
        'infrastructure details. ' +
        'Wrap with `normalizeClientError(error)` before propagating or displaying.',
    },
    schema: [],
  },

  create(context) {
    const filename = context.getFilename();

    // Skip test files — they can construct arbitrary errors for assertions
    if (filename.includes('.test.') || filename.includes('.spec.')) {
      return {};
    }

    // Skip the normalize-client-error.ts file itself (it IS the sanitizer)
    if (filename.includes('normalize-client-error')) {
      return {};
    }

    // Skip error-utils.ts (utility definitions, not call sites)
    if (filename.includes('error-utils')) {
      return {};
    }

    // Determine scope: only run on client-side files.
    // Strategy: check for 'use client' directive in the program body, OR check
    // if the file lives under a hooks/** path (all PT-2 hooks are client-side).
    const isHooksFile = filename.replace(/\\/g, '/').includes('/hooks/');

    // We defer the 'use client' check until we've seen the Program node,
    // so we track it via a flag set in Program:exit or by inspecting
    // directives from the AST.
    let isClientFile = isHooksFile;

    /**
     * Reports a violation at `node` with the source text of `reportNode`.
     *
     * @param {import('estree').Node} reportNode - The offending MemberExpression
     */
    function report(reportNode) {
      context.report({
        node: reportNode,
        messageId: 'rawProviderMessage',
        data: { source: sourceText(context, reportNode) },
      });
    }

    /**
     * Checks whether `argNode` is a provider field access (or contains one in
     * a TemplateLiteral) and reports if so.
     *
     * @param {import('estree').Node} argNode
     */
    function checkArgument(argNode) {
      if (!isClientFile) return;

      // Direct: error.message
      if (isProviderFieldAccess(argNode)) {
        report(argNode);
        return;
      }

      // LogicalExpression fallthrough: error.message || 'fallback'
      if (argNode.type === 'LogicalExpression') {
        if (isProviderFieldAccess(argNode.left)) {
          report(argNode.left);
        }
        return;
      }

      // TemplateLiteral: `Failed: ${error.message}`
      if (argNode.type === 'TemplateLiteral') {
        for (const expr of argNode.expressions) {
          if (isProviderFieldAccess(expr)) {
            report(expr);
          }
        }
      }
    }

    return {
      // -----------------------------------------------------------------------
      // Detect 'use client' directive at the top of the file
      // -----------------------------------------------------------------------
      Program(node) {
        if (isClientFile) return; // already flagged as client via hooks path
        const body = node.body;
        for (const stmt of body) {
          if (
            stmt.type === 'ExpressionStatement' &&
            stmt.expression.type === 'Literal' &&
            stmt.expression.value === 'use client'
          ) {
            isClientFile = true;
            break;
          }
          // Only check leading statements before the first non-directive
          if (stmt.type !== 'ExpressionStatement') break;
        }
      },

      // -----------------------------------------------------------------------
      // Pattern 1: throw new Error(error.message)
      //            throw new Error(`Failed: ${error.message}`)
      // -----------------------------------------------------------------------
      'NewExpression[callee.name="Error"]'(node) {
        if (!isClientFile) return;
        const args = node.arguments;
        if (!args || args.length === 0) return;
        checkArgument(args[0]);
      },

      // -----------------------------------------------------------------------
      // Pattern 2: toast.error(error.message)
      //            toast.error(`...${error.message}...`)
      //
      // Pattern 3: toast.error('Failed', { description: error.hint })
      // -----------------------------------------------------------------------
      CallExpression(node) {
        if (!isClientFile) return;

        // Match toast.error(...)
        const { callee } = node;
        if (
          callee.type !== 'MemberExpression' ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'error'
        ) {
          return;
        }
        // Ensure the callee object is `toast` (or any identifier — toast can be
        // aliased, but in PT-2 it is always imported as `toast` from 'sonner')
        if (
          callee.object.type !== 'Identifier' ||
          callee.object.name !== 'toast'
        ) {
          return;
        }

        // Skip if already using a safe wrapper as the first argument
        const firstArg = node.arguments[0];
        if (firstArg && isSafeCall(firstArg)) return;

        // Check first argument: toast.error(error.message) or template literal
        if (firstArg) {
          checkArgument(firstArg);
        }

        // Check second argument options object: { description: error.hint }
        const secondArg = node.arguments[1];
        if (!secondArg || secondArg.type !== 'ObjectExpression') return;

        for (const prop of secondArg.properties) {
          if (
            prop.type === 'Property' &&
            prop.key.type === 'Identifier' &&
            prop.key.name === 'description'
          ) {
            checkArgument(prop.value);
          }
        }
      },

      // -----------------------------------------------------------------------
      // Pattern 4: JSX expression container — {error.message} as child or prop
      // e.g. <p>{error.message}</p>  or  <Comp msg={error.message} />
      // -----------------------------------------------------------------------
      JSXExpressionContainer(node) {
        if (!isClientFile) return;
        const { expression } = node;
        if (!expression) return;
        checkArgument(expression);
      },
    };
  },
};
