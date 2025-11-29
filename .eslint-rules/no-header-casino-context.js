/**
 * ESLint Rule: no-header-casino-context
 *
 * Purpose: Prevent security vulnerability where casino_id is extracted from
 * client-provided HTTP headers. Casino context MUST be derived from the
 * authenticated user's staff record via getAuthContext().
 *
 * Reference: WORKFLOW-PRD-002 V4 fix (security)
 *            lib/supabase/rls-context.ts - canonical pattern
 *
 * @example
 * // ❌ BAD - Client can spoof header
 * const casinoId = request.headers.get('x-casino-id');
 *
 * // ❌ BAD - Any casino-related header extraction
 * const casino = req.headers['casino-id'];
 *
 * // ✅ GOOD - Server-derived from authenticated staff record
 * import { getAuthContext } from '@/lib/supabase/rls-context';
 * const { casinoId } = await getAuthContext(supabase);
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent casino context extraction from HTTP headers (security vulnerability)',
      category: 'Security',
      recommended: true,
    },
    messages: {
      noHeaderCasinoContext:
        'SECURITY VIOLATION: Never extract casino_id from client headers (`{{headerName}}`). Client can spoof this value. Use `getAuthContext()` from `@/lib/supabase/rls-context` to derive casino context from authenticated user.',
      noHeaderCasinoVariable:
        'SECURITY VIOLATION: Variable `{{varName}}` appears to store casino context from headers. Use `getAuthContext()` instead.',
      suggestGetAuthContext:
        'Replace header extraction with: `const { casinoId } = await getAuthContext(supabase);`',
    },
    schema: [],
    hasSuggestions: true,
  },

  create(context) {
    const filename = context.getFilename();

    // Only apply to API routes and server-side code
    if (
      !filename.includes('/app/api/') &&
      !filename.includes('/app/actions/') &&
      !filename.includes('/pages/api/')
    ) {
      return {};
    }

    // Header names that indicate casino context extraction
    const FORBIDDEN_HEADERS = [
      'x-casino-id',
      'casino-id',
      'casinoid',
      'x-casino',
      'casino_id',
      'x_casino_id',
    ];

    // Variable names that suggest casino context from headers
    const SUSPICIOUS_VAR_PATTERNS = [
      /^casinoId$/i,
      /^casino_id$/i,
      /^casinoFromHeader/i,
      /^headerCasino/i,
    ];

    function isForbiddenHeader(value) {
      if (typeof value !== 'string') return false;
      const normalized = value.toLowerCase().replace(/[_-]/g, '');
      return FORBIDDEN_HEADERS.some(
        (h) => normalized === h.toLowerCase().replace(/[_-]/g, ''),
      );
    }

    function isSuspiciousVarName(name) {
      return SUSPICIOUS_VAR_PATTERNS.some((pattern) => pattern.test(name));
    }

    return {
      // Detect: request.headers.get('x-casino-id')
      CallExpression(node) {
        // Check for headers.get('x-casino-id') pattern
        if (
          node.callee?.type === 'MemberExpression' &&
          node.callee.property?.name === 'get' &&
          node.arguments?.length > 0
        ) {
          const arg = node.arguments[0];

          // Check if argument is a forbidden header name
          if (arg.type === 'Literal' && isForbiddenHeader(arg.value)) {
            context.report({
              node,
              messageId: 'noHeaderCasinoContext',
              data: { headerName: arg.value },
              suggest: [
                {
                  messageId: 'suggestGetAuthContext',
                  fix(fixer) {
                    // Can't auto-fix because we need to import and add await
                    return null;
                  },
                },
              ],
            });
          }
        }
      },

      // Detect: req.headers['x-casino-id'] or headers['casino-id']
      MemberExpression(node) {
        // Check for bracket notation access on headers
        if (
          node.computed &&
          node.property?.type === 'Literal' &&
          node.object?.type === 'MemberExpression' &&
          node.object.property?.name === 'headers'
        ) {
          if (isForbiddenHeader(node.property.value)) {
            context.report({
              node,
              messageId: 'noHeaderCasinoContext',
              data: { headerName: node.property.value },
            });
          }
        }

        // Check for dot notation: headers.casinoId (less common but possible)
        if (
          !node.computed &&
          node.object?.property?.name === 'headers' &&
          node.property?.name &&
          isForbiddenHeader(node.property.name)
        ) {
          context.report({
            node,
            messageId: 'noHeaderCasinoContext',
            data: { headerName: node.property.name },
          });
        }
      },

      // Detect: const casinoId = ... where RHS involves headers
      VariableDeclarator(node) {
        if (!node.id?.name || !node.init) return;

        const varName = node.id.name;

        // Check if variable name suggests casino context
        if (!isSuspiciousVarName(varName)) return;

        // Check if RHS involves headers
        const sourceCode = context.getSourceCode();
        const initText = sourceCode.getText(node.init);

        if (
          initText.includes('headers') &&
          (initText.includes('casino') ||
            initText.includes('get(') ||
            initText.includes("['"))
        ) {
          context.report({
            node,
            messageId: 'noHeaderCasinoVariable',
            data: { varName },
          });
        }
      },

      // Detect: Destructuring from headers with casino-like names
      // const { 'x-casino-id': casinoId } = headers;
      ObjectPattern(node) {
        if (!node.parent?.init) return;

        const sourceCode = context.getSourceCode();
        const initText = sourceCode.getText(node.parent.init);

        // Only check if RHS involves headers
        if (!initText.includes('headers')) return;

        node.properties.forEach((prop) => {
          if (prop.type !== 'Property') return;

          // Check key (could be string literal or identifier)
          const keyName = prop.key?.value || prop.key?.name;

          if (keyName && isForbiddenHeader(keyName)) {
            context.report({
              node: prop,
              messageId: 'noHeaderCasinoContext',
              data: { headerName: keyName },
            });
          }
        });
      },
    };
  },
};
