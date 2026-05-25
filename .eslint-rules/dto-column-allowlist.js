/**
 * ESLint Rule: dto-column-allowlist
 *
 * Purpose: Prevent sensitive columns (PII, internal fields) from leaking
 * into public DTOs by enforcing explicit allowlists for sensitive tables.
 *
 * Reference: docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md:217-238
 *            docs/25-api-data/DTO_CANONICAL_STANDARD.md:246-305
 *
 * @example
 * // ❌ BAD
 * export type PlayerDTO = Pick<
 *   Database['public']['Tables']['player']['Row'],
 *   'id' | 'first_name' | 'ssn' // ❌ PII leak
 * >;
 *
 * // ✅ GOOD
 * export type PlayerDTO = Pick<
 *   Database['public']['Tables']['player']['Row'],
 *   'id' | 'first_name' | 'last_name' | 'created_at'
 * >;
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce column allowlist for sensitive tables (prevent PII/internal field leakage)',
      category: 'Data Privacy',
      recommended: true,
    },
    messages: {
      forbiddenColumn:
        'COLUMN LEAK: Field "{{fieldName}}" in table "{{tableName}}" is forbidden from public DTOs. {{rationale}}. Use admin-specific DTO variant or omit field.',
      requiresDocumentation:
        'DTO DOCUMENTATION REQUIRED: DTO "{{dtoName}}" for table "{{tableName}}" must include JSDoc with Exposure and Excludes sections. See SRM:217-238.',
    },
    schema: [],
  },

  create(context) {
    // Sensitive Tables Configuration (SRM:232-236)
    const SENSITIVE_TABLES = {
      player: {
        allowed: ['id', 'first_name', 'last_name', 'created_at'],
        forbidden: ['birth_date', 'ssn', 'internal_notes', 'risk_score'],
        rationale: 'PII and operational data must not leak to public DTOs',
      },
      staff: {
        allowed: [
          'id',
          'first_name',
          'last_name',
          'role',
          'status',
          'created_at',
        ],
        forbidden: ['employee_id', 'email', 'ssn', 'casino_id'],
        rationale: 'Staff PII restricted to admin-only DTOs',
      },
      player_financial_transaction: {
        allowed: [
          'id',
          'player_id',
          'casino_id',
          'amount',
          'tender_type',
          'created_at',
          'gaming_day',
        ],
        forbidden: ['idempotency_key', 'visit_id', 'rating_slip_id'],
        rationale:
          'Internal-only fields (idempotency, FKs) not for external APIs',
      },
      loyalty_ledger: {
        allowed: [
          'id',
          'player_id',
          'casino_id',
          'points_earned',
          'reason',
          'created_at',
        ],
        forbidden: [
          'idempotency_key',
          'staff_id',
          'rating_slip_id',
          'visit_id',
        ],
        rationale: 'Internal-only fields not for external APIs',
      },
      // Wave 2 outbox infrastructure table (ADR-054). Retry/error fields are
      // internal delivery state — must never surface in consumer-facing DTOs.
      finance_outbox: {
        allowed: [
          'event_id',
          'event_type',
          'casino_id',
          'table_id',
          'player_id',
          'aggregate_id',
          'created_at',
          'processed_at',
          'fact_class',
          'origin_label',
          'payload',
        ],
        forbidden: ['delivery_attempts', 'last_attempted_at', 'last_error'],
        rationale:
          'Operational retry/error fields must not leak into consumer-facing DTOs (ADR-054 Wave 2)',
      },
    };

    // Track single-hop type aliases that resolve to a Database table Row type.
    // Populated as we encounter non-DTO TSTypeAliasDeclarations so that DTOs
    // using an intermediate alias (e.g. `type XRow = Database[...]['Row']`)
    // are covered by the same forbidden-column checks.
    const aliasToTable = new Map();

    /**
     * Extract table name from a type node.
     *
     * Handles two shapes:
     *   1. Direct: Database['public']['Tables']['player']['Row']
     *   2. Alias:  FinancialOutboxRow  (where aliasToTable has the mapping)
     */
    function extractTableName(node) {
      // Shape 1: Database['public']['Tables']['tableName']['Row'] indexed access
      if (
        node.type === 'TSIndexedAccessType' &&
        node.objectType?.type === 'TSIndexedAccessType'
      ) {
        const innerType = node.objectType;
        if (
          innerType.objectType?.type === 'TSIndexedAccessType' &&
          innerType.indexType?.type === 'TSLiteralType' &&
          innerType.indexType?.literal?.value === 'Tables'
        ) {
          const tablesAccess = innerType.objectType;
          if (
            tablesAccess.indexType?.type === 'TSLiteralType' &&
            tablesAccess.indexType?.literal?.value === 'public'
          ) {
            if (
              node.indexType?.type === 'TSLiteralType' &&
              node.indexType?.literal?.value
            ) {
              return node.indexType.literal.value;
            }
          }
        }
      }

      // Shape 2: TSTypeReference whose name is a tracked alias (e.g. FinancialOutboxRow)
      if (node.type === 'TSTypeReference' && node.typeName?.type === 'Identifier') {
        return aliasToTable.get(node.typeName.name) ?? null;
      }

      return null;
    }

    /**
     * Find the Pick<> node within a type annotation.
     * Handles both plain `Pick<...>` and intersection `Pick<...> & { ... }`.
     */
    function findPickNode(typeAnnotation) {
      if (!typeAnnotation) return null;
      if (
        typeAnnotation.type === 'TSTypeReference' &&
        typeAnnotation.typeName?.name === 'Pick'
      ) {
        return typeAnnotation;
      }
      if (typeAnnotation.type === 'TSIntersectionType') {
        return (
          typeAnnotation.types?.find(
            (t) =>
              t.type === 'TSTypeReference' && t.typeName?.name === 'Pick',
          ) ?? null
        );
      }
      return null;
    }

    /**
     * Extract field names from Pick<>'s second type argument
     * Example: 'field1' | 'field2' | 'field3' → ['field1', 'field2', 'field3']
     */
    function extractUnionLiterals(node) {
      const fields = [];

      function traverse(n) {
        if (n.type === 'TSLiteralType' && n.literal?.value) {
          fields.push(n.literal.value);
        } else if (n.type === 'TSUnionType') {
          n.types.forEach(traverse);
        }
      }

      traverse(node);
      return fields;
    }

    /**
     * Check if node has required JSDoc documentation
     */
    function hasRequiredDocumentation(node) {
      const comments = context.getSourceCode().getCommentsBefore(node);
      if (comments.length === 0) return false;

      const jsdoc = comments[comments.length - 1];
      if (jsdoc.type !== 'Block' || !jsdoc.value.includes('*')) return false;

      const docText = jsdoc.value;
      return docText.includes('Exposure:') && docText.includes('Excludes:');
    }

    return {
      // Detect: export type XxxDTO = Pick<Database[...]['table']['Row'], 'field1' | 'field2'>
      // Also handles:
      //   - Alias-based:  Pick<SomeRow, ...>  where SomeRow is a tracked alias
      //   - Intersection: Pick<...> & { ... } (e.g. FinancialOutboxEventDTO)
      TSTypeAliasDeclaration(node) {
        // Track non-DTO type aliases that resolve to a Database table Row type
        // so that DTOs using them (Pick<XRow, ...>) are still caught.
        if (!node.id.name.endsWith('DTO')) {
          const tableName = extractTableName(node.typeAnnotation);
          if (tableName) {
            aliasToTable.set(node.id.name, tableName);
          }
          return;
        }

        // Locate the Pick<> node — handles plain Pick and intersection types
        const pickNode = findPickNode(node.typeAnnotation);
        if (!pickNode || !pickNode.typeParameters?.params) return;

        const typeArgs = pickNode.typeParameters.params;
        if (typeArgs.length < 2) return;

        const tableTypeNode = typeArgs[0]; // Database[...]['Row'] or alias
        const fieldsNode = typeArgs[1];    // 'field1' | 'field2'

        const tableName = extractTableName(tableTypeNode);
        if (!tableName || !SENSITIVE_TABLES[tableName]) {
          // Not a sensitive table, skip
          return;
        }

        const config = SENSITIVE_TABLES[tableName];
        const pickedFields = extractUnionLiterals(fieldsNode);

        // Check for forbidden fields
        const violations = pickedFields.filter((field) =>
          config.forbidden.includes(field),
        );

        violations.forEach((fieldName) => {
          context.report({
            node: fieldsNode,
            messageId: 'forbiddenColumn',
            data: {
              fieldName,
              tableName,
              rationale: config.rationale,
            },
          });
        });

        // Check for required documentation
        if (!hasRequiredDocumentation(node)) {
          context.report({
            node,
            messageId: 'requiresDocumentation',
            data: {
              dtoName: node.id.name,
              tableName,
            },
          });
        }
      },
    };
  },
};
