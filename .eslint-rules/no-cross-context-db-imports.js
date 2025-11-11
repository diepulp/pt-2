/**
 * ESLint Rule: no-cross-context-db-imports
 *
 * Purpose: Enforce bounded context integrity by preventing services from
 * directly accessing Database types for tables they don't own (per SRM).
 *
 * Reference: docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md:28-295
 *            docs/25-api-data/DTO_CANONICAL_STANDARD.md:176-243
 *
 * @example
 * // ❌ BAD (in services/loyalty/)
 * type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];
 * // Error: Service "loyalty" cannot access table "rating_slip"
 *
 * // ✅ GOOD (in services/loyalty/)
 * import type { RatingSlipTelemetryDTO } from '@/services/rating-slip/dtos';
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent cross-context Database type access (SRM bounded context violation)',
      category: 'Bounded Context Integrity',
      recommended: true,
    },
    messages: {
      boundedContextViolation:
        'BOUNDED CONTEXT VIOLATION: Service "{{serviceName}}" cannot directly access table "{{tableName}}". Must consume via published DTO from owning service ({{owningService}}). See SRM:28-295.',
      unknownService:
        'Cannot determine service ownership from file path: {{filename}}',
    },
    schema: [],
  },

  create(context) {
    const filename = context.getFilename();
    const serviceMatch = filename.match(/services\/([^/]+)\//);

    if (!serviceMatch) {
      // Not in a service directory, skip check
      return {};
    }

    const serviceName = serviceMatch[1];

    // SRM Ownership Matrix (SRM:28-295)
    // Updated: 2025-11-09
    const SRM_OWNERSHIP = {
      casino: [
        'casino',
        'casino_settings',
        'company',
        'staff',
        'game_settings',
        'audit_log',
        'report',
        'player_casino', // Casino manages player enrollment
      ],
      player: ['player'],
      visit: ['visit'],
      loyalty: ['player_loyalty', 'loyalty_ledger', 'loyalty_outbox'],
      'rating-slip': ['rating_slip'],
      finance: ['player_financial_transaction', 'finance_outbox'],
      mtl: ['mtl_entry', 'mtl_audit_note'],
      'table-context': [
        'gaming_table',
        'gaming_table_settings',
        'dealer_rotation',
        'table_inventory_snapshot',
        'table_fill',
        'table_credit',
        'table_drop_event',
      ],
      'floor-layout': [
        'floor_layout',
        'floor_layout_version',
        'floor_pit',
        'floor_table_slot',
        'floor_layout_activation',
      ],
    };

    const ownedTables = SRM_OWNERSHIP[serviceName] || [];

    // Find which service owns a given table
    function findOwningService(tableName) {
      for (const [service, tables] of Object.entries(SRM_OWNERSHIP)) {
        if (tables.includes(tableName)) {
          return service;
        }
      }
      return 'unknown';
    }

    return {
      // Detect: Database['public']['Tables']['table_name']
      MemberExpression(node) {
        // Check if this is accessing Database['public']['Tables'][...]
        if (
          node.object?.object?.property?.value === 'Tables' &&
          node.object?.property?.type === 'Literal'
        ) {
          const tableName = node.object.property.value;

          // Allow access to owned tables
          if (ownedTables.includes(tableName)) {
            return;
          }

          // Violation: accessing table from another context
          const owningService = findOwningService(tableName);

          context.report({
            node,
            messageId: 'boundedContextViolation',
            data: {
              serviceName,
              tableName,
              owningService,
            },
          });
        }

        // Also check: Database['public']['Tables']['table_name']['Row' | 'Insert' | 'Update']
        if (
          node.object?.object?.object?.property?.value === 'Tables' &&
          node.object?.object?.property?.type === 'Literal'
        ) {
          const tableName = node.object.object.property.value;

          // Allow access to owned tables
          if (ownedTables.includes(tableName)) {
            return;
          }

          // Violation: accessing table from another context
          const owningService = findOwningService(tableName);

          context.report({
            node,
            messageId: 'boundedContextViolation',
            data: {
              serviceName,
              tableName,
              owningService,
            },
          });
        }
      },
    };
  },
};
