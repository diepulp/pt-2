/**
 * ESLint Rule: no-direct-template2b-dml
 *
 * Purpose: Prevent direct PostgREST DML (.from(table).insert/update/delete)
 * against tables with Template 2b RLS policies (session-var-only, no JWT
 * COALESCE fallback). Session vars set by the middleware's RPC are
 * transaction-local and lost across separate HTTP requests, causing writes
 * to silently affect 0 rows.
 *
 * Reference: ADR-030 D5 (INV-030-7)
 *            ISSUE-SET-PIN-SILENT-RLS-FAILURE
 *            docs/30-security/SEC-001-rls-policy-matrix.md §Template 2b
 *
 * @example
 * // ❌ BAD - Direct DML against Template 2b table
 * await supabase.from('staff').update({ pin_hash: hash }).eq('id', staffId);
 * await supabase.from('staff_pin_attempts').insert({ ... });
 *
 * // ✅ GOOD - Self-contained RPC with internal set_rls_context_from_staff()
 * await supabase.rpc('rpc_set_staff_pin', { p_pin_hash: hash });
 * await supabase.rpc('rpc_increment_pin_attempt');
 */

// Tables with Template 2b RLS policies (session-var-only, no JWT fallback).
// Maintain this list as new Template 2b policies are added.
// Source: SEC-001 §Template 2b + ADR-030 D4
const TEMPLATE_2B_TABLES = new Set([
  'staff',
  'staff_pin_attempts',
  // Future: add tables as they migrate to Template 2b
  // 'player',
  // 'player_financial_transaction',
  // 'visit',
  // 'rating_slip',
  // 'loyalty_ledger',
]);

// DML methods that are prohibited on Template 2b tables
const WRITE_METHODS = new Set(['insert', 'update', 'delete', 'upsert']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent direct PostgREST DML against tables with Template 2b RLS policies (ADR-030 D5, INV-030-7)',
      category: 'Security',
      recommended: true,
    },
    messages: {
      noDirectDml:
        'INV-030-7 VIOLATION: Direct .from(\'{{tableName}}\').{{method}}() is prohibited. ' +
        'Table `{{tableName}}` has a Template 2b RLS policy (session-var-only). ' +
        'Session vars from the middleware RPC are transaction-local and lost across HTTP requests. ' +
        'Use a SECURITY DEFINER RPC that calls set_rls_context_from_staff() internally. ' +
        'See ADR-030 D5.',
    },
    schema: [],
  },

  create(context) {
    return {
      // Detect chained pattern: .from('table').update/insert/delete(...)
      //
      // AST shape for supabase.from('staff').update({ ... }):
      //   CallExpression {
      //     callee: MemberExpression {
      //       object: CallExpression {            ← .from('staff')
      //         callee: MemberExpression {
      //           property: Identifier { name: 'from' }
      //         }
      //         arguments: [Literal { value: 'staff' }]
      //       }
      //       property: Identifier { name: 'update' }  ← .update()
      //     }
      //   }
      CallExpression(node) {
        const callee = node.callee;
        if (callee?.type !== 'MemberExpression') return;

        // Check if the method is a write method
        const methodName = callee.property?.name;
        if (!methodName || !WRITE_METHODS.has(methodName)) return;

        // Check if the object is a .from() call
        const fromCall = callee.object;
        if (fromCall?.type !== 'CallExpression') return;

        const fromCallee = fromCall.callee;
        if (fromCallee?.type !== 'MemberExpression') return;
        if (fromCallee.property?.name !== 'from') return;

        // Get the table name argument
        const tableArg = fromCall.arguments?.[0];
        if (!tableArg) return;

        let tableName = null;

        if (tableArg.type === 'Literal' && typeof tableArg.value === 'string') {
          tableName = tableArg.value;
        } else if (tableArg.type === 'TemplateLiteral' && tableArg.quasis?.length === 1) {
          // Handle simple template literals with no expressions
          tableName = tableArg.quasis[0].value?.cooked;
        }

        if (!tableName || !TEMPLATE_2B_TABLES.has(tableName)) return;

        context.report({
          node,
          messageId: 'noDirectDml',
          data: { tableName, method: methodName },
        });
      },
    };
  },
};
