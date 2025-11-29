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
    };

    /**
     * Extract table name from Database type expression
     * Example: Database['public']['Tables']['player']['Row'] → 'player'
     */
    function extractTableName(node) {
      // Handle: Database['public']['Tables']['player']
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
            // Now get the table name
            if (
              node.indexType?.type === 'TSLiteralType' &&
              node.indexType?.literal?.value
            ) {
              return node.indexType.literal.value;
            }
          }
        }
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
      TSTypeAliasDeclaration(node) {
        // Only check DTO type aliases
        if (!node.id.name.endsWith('DTO')) {
          return;
        }

        // Check if this is a Pick<> type
        if (
          node.typeAnnotation?.typeName?.name !== 'Pick' ||
          !node.typeAnnotation?.typeParameters?.params
        ) {
          return;
        }

        const typeArgs = node.typeAnnotation.typeParameters.params;
        if (typeArgs.length < 2) return;

        const tableTypeNode = typeArgs[0]; // Database['public']['Tables']['player']['Row']
        const fieldsNode = typeArgs[1]; // 'field1' | 'field2'

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
