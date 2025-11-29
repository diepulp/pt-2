/**
 * ESLint Rule: no-service-result-return
 *
 * Purpose: Enforce ADR-012 - services throw DomainError, transport returns ServiceResult.
 * Service layer functions should NOT return ServiceResult<T> - they should:
 * - Return Promise<T> on success
 * - Throw DomainError on failure
 *
 * Reference: docs/80-adrs/ADR-012-error-handling-layers.md
 *            WORKFLOW-PRD-002 V2 fix
 *
 * @example
 * // ❌ BAD - Service returns ServiceResult (violates ADR-012)
 * export async function updatePlayer(): Promise<ServiceResult<PlayerDTO>> {
 *   if (error) return { success: false, error: { code: 'FAIL' } };
 *   return { success: true, data: player };
 * }
 *
 * // ✅ GOOD - Service throws on error, returns data on success
 * export async function updatePlayer(): Promise<PlayerDTO> {
 *   if (error) throw new DomainError('FAIL', 'Something went wrong');
 *   return player;
 * }
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce ADR-012: services throw DomainError, do not return ServiceResult',
      category: 'Architecture',
      recommended: true,
    },
    messages: {
      noServiceResultReturn:
        'ADR-012 VIOLATION: Service functions must not return `ServiceResult<T>`. Services should return `Promise<{{innerType}}>` and throw `DomainError` on failure. ServiceResult is for transport layer (server actions, route handlers) only.',
      noServiceResultType:
        'ADR-012 VIOLATION: `ServiceResult` type should not be used in service layer. Import and use in transport layer only (app/actions/*, app/api/*). Services throw DomainError.',
      noSuccessErrorPattern:
        'ADR-012 VIOLATION: Returning `{ success: false, error: ... }` pattern in service layer. Throw `DomainError` instead.',
    },
    schema: [],
  },

  create(context) {
    const filename = context.getFilename();

    // Only apply to service files (not actions or API routes)
    if (!filename.includes('/services/')) {
      return {};
    }

    // Exclude transport-like files within services (if any)
    if (
      filename.includes('/actions/') ||
      filename.includes('/api/') ||
      filename.includes('.action.') ||
      filename.includes('.route.')
    ) {
      return {};
    }

    // Also exclude test files
    if (filename.includes('.test.') || filename.includes('.spec.')) {
      return {};
    }

    function extractInnerType(typeNode) {
      // Extract T from ServiceResult<T>
      if (typeNode.typeParameters?.params?.length > 0) {
        const innerType = typeNode.typeParameters.params[0];
        const sourceCode = context.getSourceCode();
        return sourceCode.getText(innerType);
      }
      return 'T';
    }

    return {
      // Detect: Promise<ServiceResult<T>> or ServiceResult<T> return types
      TSTypeReference(node) {
        const typeName = node.typeName?.name;

        // Check for direct ServiceResult usage
        if (typeName === 'ServiceResult' || typeName === 'ServiceHttpResult') {
          // Check if this is in a return type position
          const parent = node.parent;

          // Case 1: Direct return type - function(): ServiceResult<T>
          if (
            parent?.type === 'TSTypeAnnotation' &&
            (parent.parent?.type === 'FunctionDeclaration' ||
              parent.parent?.type === 'FunctionExpression' ||
              parent.parent?.type === 'ArrowFunctionExpression' ||
              parent.parent?.type === 'TSDeclareFunction')
          ) {
            context.report({
              node,
              messageId: 'noServiceResultReturn',
              data: { innerType: extractInnerType(node) },
            });
            return;
          }

          // Case 2: Promise<ServiceResult<T>>
          if (
            parent?.type === 'TSTypeParameterInstantiation' &&
            parent.parent?.typeName?.name === 'Promise'
          ) {
            context.report({
              node,
              messageId: 'noServiceResultReturn',
              data: { innerType: extractInnerType(node) },
            });
            return;
          }

          // Case 3: Type alias with ServiceResult
          if (
            parent?.type === 'TSTypeParameterInstantiation' ||
            parent?.type === 'TSTypeAliasDeclaration'
          ) {
            // Allow importing the type, just not using it in return positions
            // This is a softer check - only warn if it looks like a return type pattern
          }

          // Case 4: Interface/type defining service contract with ServiceResult
          const grandparent = parent?.parent;
          if (
            grandparent?.type === 'TSPropertySignature' ||
            grandparent?.type === 'TSMethodSignature'
          ) {
            context.report({
              node,
              messageId: 'noServiceResultType',
            });
          }
        }
      },

      // Detect: return { success: false, error: ... } pattern
      ReturnStatement(node) {
        if (!node.argument || node.argument.type !== 'ObjectExpression') {
          return;
        }

        const properties = node.argument.properties;
        const hasSuccess = properties.some(
          (p) =>
            p.type === 'Property' &&
            p.key?.name === 'success' &&
            p.value?.value === false,
        );
        const hasError = properties.some(
          (p) =>
            p.type === 'Property' &&
            (p.key?.name === 'error' || p.key?.name === 'code'),
        );

        if (hasSuccess && hasError) {
          context.report({
            node,
            messageId: 'noSuccessErrorPattern',
          });
        }
      },

      // Detect: return { success: true, data: ... } pattern (less critical but worth flagging)
      // This is commented out to avoid too many false positives
      // Uncomment if stricter enforcement is desired
      /*
      ReturnStatement(node) {
        if (!node.argument || node.argument.type !== 'ObjectExpression') {
          return;
        }

        const properties = node.argument.properties;
        const hasSuccess = properties.some(
          (p) => p.type === 'Property' && p.key?.name === 'success'
        );
        const hasData = properties.some(
          (p) => p.type === 'Property' && p.key?.name === 'data'
        );

        if (hasSuccess && hasData) {
          context.report({
            node,
            messageId: 'noSuccessErrorPattern',
          });
        }
      },
      */
    };
  },
};
