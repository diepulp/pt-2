/**
 * Custom ESLint Rule: no-manual-dto-interfaces
 * Prevents manual DTO interface definitions in service layer
 * SRM Canonical Standard: DTOs MUST derive from Database types
 *
 * Rationale:
 * - Manual interfaces drift from schema evolution
 * - TablesInsert/TablesUpdate auto-sync with migrations
 * - Single source of truth: types/database.types.ts
 *
 * @example ❌ BANNED
 * export interface PlayerCreateDTO {
 *   first_name: string;
 *   last_name: string;
 * }
 *
 * @example ✅ REQUIRED
 * export type PlayerCreateDTO = Pick<
 *   Database["public"]["Tables"]["player"]["Insert"],
 *   "first_name" | "last_name"
 * >;
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow manual DTO interfaces - require Database type derivation',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      noManualDTOInterface:
        "ANTI-PATTERN: Manual DTO interface '{{name}}' violates SRM canonical standard. Use type alias: export type {{name}} = Pick<Database['public']['Tables']['{{table}}']['{{operation}}'], 'field1' | 'field2'>",
      useTypeAliasNotInterface:
        "DTO '{{name}}' must be a type alias (not interface) derived from Database types. This ensures automatic sync with schema migrations.",
    },
    schema: [],
    fixable: 'code',
  },

  create(context) {
    return {
      // Detect: export interface XxxDTO { ... }
      TSInterfaceDeclaration(node) {
        const interfaceName = node.id.name;

        // Check if name ends with DTO (or common DTO suffixes)
        const isDTOName =
          /DTO$|CreateDTO$|UpdateDTO$|ResponseDTO$|RequestDTO$/i.test(
            interfaceName,
          );

        if (!isDTOName) return;

        // Check if this is exported
        const parent = node.parent;
        const isExported = parent && parent.type === 'ExportNamedDeclaration';

        if (!isExported) return;

        // Check for RPC response exception via JSDoc comment
        // Pattern: /** ... RPC response ... */ or /** ... RPC ... */
        const sourceCode = context.getSourceCode();
        const comments = sourceCode.getCommentsBefore(parent || node);
        const hasRPCAnnotation = comments.some(
          (comment) =>
            comment.type === 'Block' &&
            /\bRPC\s+(response|result|return)/i.test(comment.value)
        );

        if (hasRPCAnnotation) return; // Allow RPC response interfaces

        // Extract potential table name from DTO name
        // e.g., "PlayerCreateDTO" -> "player"
        const tableMatch = interfaceName.match(
          /^([A-Z][a-z]+)(?:Create|Update|Response)?DTO$/,
        );
        const suggestedTable = tableMatch
          ? tableMatch[1].toLowerCase()
          : 'table_name';

        // Determine operation type from DTO name
        let operation = 'Row';
        if (/CreateDTO$/i.test(interfaceName)) {
          operation = 'Insert';
        } else if (/UpdateDTO$/i.test(interfaceName)) {
          operation = 'Insert'; // Update uses Partial<Insert>
        }

        context.report({
          node,
          messageId: 'noManualDTOInterface',
          data: {
            name: interfaceName,
            table: suggestedTable,
            operation: operation,
          },
        });
      },

      // Additional check: Warn on type aliases that don't reference Database
      TSTypeAliasDeclaration(node) {
        const typeName = node.id.name;

        // Only check DTO-named types
        const isDTOName =
          /DTO$|CreateDTO$|UpdateDTO$|ResponseDTO$|RequestDTO$/i.test(typeName);

        if (!isDTOName) return;

        // Check if this is exported
        const parent = node.parent;
        const isExported = parent && parent.type === 'ExportNamedDeclaration';

        if (!isExported) return;

        // Check if type references "Database" anywhere in its definition
        const sourceCode = context.getSourceCode();
        const typeText = sourceCode.getText(node.typeAnnotation);

        // Get the full file content to check for intermediate type aliases
        const fullSource = sourceCode.getText();

        // Check if the type uses Pick/Omit/Partial (structural derivation patterns)
        const usesDerivationPattern = /\b(Pick|Omit|Partial|Required|Readonly)\s*</.test(typeText);

        // Check if the file imports Database type
        const importsDatabaseType = /import\s+.*\bDatabase\b.*from\s+['"]@\/types\/database\.types['"]/.test(fullSource);

        // Check if the referenced type in Pick/Omit is a local alias that derives from Database
        // e.g., type CasinoRow = Database['public']['Tables']['casino']['Row'];
        // then: export type CasinoDTO = Pick<CasinoRow, ...>
        const typeRefMatch = typeText.match(/(?:Pick|Omit|Partial|Required|Readonly)\s*<\s*(\w+)/);
        const referencedTypeName = typeRefMatch ? typeRefMatch[1] : null;

        // Check if the referenced type is a local alias derived from Database
        let referencesLocalDatabaseAlias = false;
        if (referencedTypeName && referencedTypeName !== 'Database') {
          // Look for: type ReferencedType = Database['public']...
          const localAliasPattern = new RegExp(
            `type\\s+${referencedTypeName}\\s*=\\s*Database\\s*\\[`
          );
          referencesLocalDatabaseAlias = localAliasPattern.test(fullSource);
        }

        // If it doesn't reference Database directly or via local alias, it's likely manually defined
        const referencesDatabase =
          typeText.includes('Database') ||
          referencesLocalDatabaseAlias ||
          (usesDerivationPattern && importsDatabaseType && referencedTypeName);

        if (!referencesDatabase) {
          // Extract potential table name
          const tableMatch = typeName.match(
            /^([A-Z][a-z]+)(?:Create|Update|Response)?DTO$/,
          );
          const suggestedTable = tableMatch
            ? tableMatch[1].toLowerCase()
            : 'table_name';

          let operation = 'Row';
          if (/CreateDTO$/i.test(typeName)) {
            operation = 'Insert';
          } else if (/UpdateDTO$/i.test(typeName)) {
            operation = 'Insert';
          }

          context.report({
            node,
            messageId: 'useTypeAliasNotInterface',
            data: {
              name: typeName,
              table: suggestedTable,
              operation: operation,
            },
          });
        }
      },
    };
  },
};
