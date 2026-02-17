/**
 * ESLint Rule: no-direct-template2b-dml
 *
 * Purpose: Prevent direct PostgREST DML (.from(table).insert/update/delete)
 * against Category A tables (session-var-only RLS, no JWT COALESCE fallback).
 * Session vars set by the middleware's RPC are transaction-local and lost
 * across separate HTTP requests, causing writes to silently affect 0 rows.
 *
 * Taxonomy: "Category A" (ADR-034) = "Template 2b" (SEC-001 write-policy template)
 *
 * Reference: ADR-034 (RLS Write-Path Compatibility & Enforcement)
 *            ADR-030 D5 (INV-030-7)
 *            ISSUE-SET-PIN-SILENT-RLS-FAILURE
 *            docs/30-security/SEC-001-rls-policy-matrix.md §Template 2b
 *
 * @example
 * // ❌ BAD - Direct DML against Category A table
 * await supabase.from('staff').update({ pin_hash: hash }).eq('id', staffId);
 * await supabase.from('player_casino').upsert({ ... });
 *
 * // ✅ GOOD - Self-contained RPC with internal set_rls_context_from_staff()
 * await supabase.rpc('rpc_set_staff_pin', { p_pin_hash: hash });
 * await supabase.rpc('rpc_enroll_player', { p_player_id: id });
 */

// Category A tables: session-var-only writes, no JWT COALESCE fallback (ADR-034).
// Writes MUST use SECURITY DEFINER RPCs with internal set_rls_context_from_staff().
// Source: config/rls-category-a-tables.json (generated from ADR-030)
//
// Dynamic loading: reads from config file at lint-time so the ESLint rule stays
// in sync with the canonical ADR-030 registry without manual edits.
const CATEGORY_A_TABLES = (() => {
  const path = require('path');
  const fs = require('fs');
  const configPath = path.resolve(__dirname, '..', 'config', 'rls-category-a-tables.json');
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (Array.isArray(config.categoryA) && config.categoryA.length > 0) {
      return new Set(config.categoryA);
    }
  } catch {
    // Fall through to hardcoded fallback
  }
  // Fallback: hardcoded list if config is missing (e.g. fresh clone before generate)
  return new Set([
    'staff',
    'staff_invite',
    'staff_pin_attempts',
    'player_casino',
  ]);
})();

// DML methods that are prohibited on Template 2b tables
const WRITE_METHODS = new Set(['insert', 'update', 'delete', 'upsert']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent direct PostgREST DML against Category A tables (ADR-034, ADR-030 D5, INV-030-7)',
      category: 'Security',
      recommended: true,
    },
    messages: {
      noDirectDml:
        'ADR-034 VIOLATION: Direct .from(\'{{tableName}}\').{{method}}() is prohibited. ' +
        'Table `{{tableName}}` is Category A (session-var-only RLS, no JWT COALESCE fallback). ' +
        'Session vars from the middleware RPC are transaction-local and lost across HTTP requests. ' +
        'Use a SECURITY DEFINER RPC that calls set_rls_context_from_staff() internally. ' +
        'See ADR-034.',
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

        if (!tableName || !CATEGORY_A_TABLES.has(tableName)) return;

        context.report({
          node,
          messageId: 'noDirectDml',
          data: { tableName, method: methodName },
        });
      },
    };
  },
};
