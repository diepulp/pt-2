/**
 * ESLint Rule: no-dto-type-assertions
 *
 * Purpose: Prevent `as SomeDTO` type assertions that bypass type safety.
 * RPC responses should be validated with type guards, not cast with `as`.
 *
 * Reference: WORKFLOW-PRD-002 V1 fix, anti-patterns.memory.md
 *
 * @example
 * // ❌ BAD - Type assertion bypasses runtime validation
 * return { success: true, data: data as RatingSlipDTO };
 *
 * // ✅ GOOD - Type guard validates at runtime
 * if (!isValidRatingSlipData(data)) {
 *   throw new DomainError('INVALID_RPC_RESPONSE');
 * }
 * return { success: true, data };
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow type assertions for DTOs - require type guards for RPC responses',
      category: 'Type Safety',
      recommended: true,
    },
    messages: {
      noDTOAssertion:
        'ANTI-PATTERN: Type assertion `as {{typeName}}` bypasses runtime validation. Use a type guard function instead: `if (!isValid{{typeName}}(data)) throw new DomainError("INVALID_RPC_RESPONSE")`',
      noRPCAssertion:
        'ANTI-PATTERN: RPC response cast with `as {{typeName}}`. Supabase RPC returns `unknown` - validate with type guard before use.',
      noGenericAssertion:
        'Type assertion `as {{typeName}}` in service layer. Consider using type guard for runtime safety.',
    },
    schema: [],
  },

  create(context) {
    const filename = context.getFilename();

    // Only apply to service files
    if (!filename.includes('/services/')) {
      return {};
    }

    // Patterns that indicate DTO or response types
    const DTO_PATTERNS = [/DTO$/, /Response$/, /Result$/, /^Rpc.*Returns$/];

    // Known RPC response patterns
    const RPC_CONTEXT_PATTERNS = [/\.rpc\(/, /supabase.*rpc/i];

    function isDTOTypeName(name) {
      return DTO_PATTERNS.some((pattern) => pattern.test(name));
    }

    function isInRPCContext(node) {
      // Walk up the AST to check if we're in an RPC call context
      let current = node.parent;
      let depth = 0;
      const maxDepth = 10;

      while (current && depth < maxDepth) {
        // Check if parent is a property access on rpc result
        if (
          current.type === 'VariableDeclarator' &&
          current.init?.type === 'AwaitExpression'
        ) {
          const sourceCode = context.getSourceCode();
          const initText = sourceCode.getText(current.init);
          if (RPC_CONTEXT_PATTERNS.some((p) => p.test(initText))) {
            return true;
          }
        }

        // Check if we're in a return statement after an RPC call
        if (current.type === 'ReturnStatement') {
          // Look for nearby RPC calls in the function
          const func = findParentFunction(current);
          if (func) {
            const funcText = context.getSourceCode().getText(func);
            if (RPC_CONTEXT_PATTERNS.some((p) => p.test(funcText))) {
              return true;
            }
          }
        }

        current = current.parent;
        depth++;
      }

      return false;
    }

    function findParentFunction(node) {
      let current = node.parent;
      while (current) {
        if (
          current.type === 'FunctionDeclaration' ||
          current.type === 'FunctionExpression' ||
          current.type === 'ArrowFunctionExpression'
        ) {
          return current;
        }
        current = current.parent;
      }
      return null;
    }

    function getTypeName(typeAnnotation) {
      if (!typeAnnotation) return null;

      // Handle: as SomeType
      if (typeAnnotation.typeName?.name) {
        return typeAnnotation.typeName.name;
      }

      // Handle: as { prop: Type }
      if (typeAnnotation.type === 'TSTypeLiteral') {
        return 'ObjectLiteral';
      }

      // Handle: as SomeType[]
      if (typeAnnotation.type === 'TSArrayType') {
        return getTypeName(typeAnnotation.elementType) + '[]';
      }

      // Handle: as SomeType<T>
      if (typeAnnotation.typeName?.type === 'Identifier') {
        return typeAnnotation.typeName.name;
      }

      return null;
    }

    return {
      // Detect: expression as SomeDTO
      TSAsExpression(node) {
        const typeName = getTypeName(node.typeAnnotation);

        if (!typeName) return;

        // Skip primitive types
        if (
          ['string', 'number', 'boolean', 'unknown', 'never'].includes(typeName)
        ) {
          return;
        }

        // Check if this is a DTO type assertion
        if (isDTOTypeName(typeName)) {
          const messageId = isInRPCContext(node)
            ? 'noRPCAssertion'
            : 'noDTOAssertion';

          context.report({
            node,
            messageId,
            data: { typeName },
          });
          return;
        }

        // For other type assertions in services, provide a softer warning
        // Only if it looks like a domain type (PascalCase, not built-in)
        if (/^[A-Z][a-zA-Z]+$/.test(typeName) && !isBuiltInType(typeName)) {
          context.report({
            node,
            messageId: 'noGenericAssertion',
            data: { typeName },
          });
        }
      },
    };

    function isBuiltInType(name) {
      const builtIns = [
        'Array',
        'Object',
        'String',
        'Number',
        'Boolean',
        'Date',
        'RegExp',
        'Error',
        'Map',
        'Set',
        'Promise',
        'Record',
        'Partial',
        'Required',
        'Pick',
        'Omit',
        'Readonly',
      ];
      return builtIns.includes(name);
    }
  },
};
