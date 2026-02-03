/**
 * ESLint Rule: no-temporal-bypass
 *
 * Purpose: Prevent JavaScript temporal bypass patterns that compute gaming day
 * or business-date ranges outside the canonical database authority path.
 *
 * The database is the single source of truth for casino time and gaming day.
 * Application code must never derive gaming_day, gaming-day boundaries, or
 * weekly/monthly range boundaries using JS date math.
 *
 * Reference: TEMP-003 Temporal Governance Enforcement Standard §3
 *            PRD-027 §5.1 FR-8
 *
 * Banned patterns:
 *   - toISOString().slice(0, 10)          — UTC date ≠ gaming day
 *   - getUTCFullYear/getUTCMonth/getUTCDate — UTC components for business dates
 *   - getCurrentGamingDay / getWeeksAgoDate — deprecated JS temporal functions
 *
 * @example
 * // BAD - UTC date slicing
 * const day = new Date().toISOString().slice(0, 10);
 *
 * // BAD - UTC date components for business logic
 * const month = date.getUTCMonth();
 *
 * // BAD - Deprecated temporal bypass functions
 * import { getCurrentGamingDay } from '@/services/player360-dashboard/mappers';
 *
 * // GOOD - Server helper (RSC)
 * import { getServerGamingDay } from '@/lib/gaming-day/server';
 * const gamingDay = await getServerGamingDay(supabase);
 *
 * // GOOD - Client hook
 * const { gamingDay } = useGamingDay();
 *
 * // GOOD - RPC call
 * const { data } = await supabase.rpc('rpc_current_gaming_day');
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent JS temporal bypass patterns that compute gaming day outside DB authority (TEMP-003)',
      category: 'Temporal Governance',
      recommended: true,
      url: 'https://github.com/user/pt-2/blob/main/docs/20-architecture/temporal-patterns/TEMP-003-temporal-governance-enforcement.md',
    },
    messages: {
      noISOSlice:
        'TEMPORAL BYPASS: `toISOString().slice(0, 10)` produces a UTC calendar date, not a gaming day. Gaming day must come from the database via `rpc_current_gaming_day()` or `getServerGamingDay()`. See TEMP-003 §3.1.',
      noUTCAccessor:
        'TEMPORAL BYPASS: `{{method}}()` extracts UTC date components. Business dates must come from the database. Use `rpc_current_gaming_day()`, `getServerGamingDay()`, or `useGamingDay()`. See TEMP-003 §3.1.',
      noBannedTemporalFn:
        'TEMPORAL BYPASS: `{{name}}` is a deprecated JS temporal function that bypasses the canonical DB authority path. Use `getServerGamingDay()` (RSC), `useGamingDay()` (client), or `rpc_current_gaming_day()` (RPC). See TEMP-003 §3, PRD-027.',
      noBannedTemporalImport:
        'TEMPORAL BYPASS: Importing `{{name}}` — this is a deprecated JS temporal function. Use `getServerGamingDay()` from `@/lib/gaming-day/server` (RSC) or `useGamingDay()` from `@/hooks/casino/use-gaming-day` (client). See TEMP-003 §3, PRD-027.',
    },
    schema: [],
  },

  create(context) {
    const filename = context.getFilename();

    // Only enforce in query paths: services/, app/, hooks/
    // Exclude: components/ (display-only), docs/, tests, .claude/
    const isQueryPath =
      filename.includes('/services/') ||
      filename.includes('/app/') ||
      filename.includes('/hooks/');

    if (!isQueryPath) {
      return {};
    }

    // Exclude test files
    if (
      filename.includes('.test.') ||
      filename.includes('.spec.') ||
      filename.includes('__tests__') ||
      filename.includes('__mocks__')
    ) {
      return {};
    }

    // Banned function names — deprecated JS temporal bypass functions
    const BANNED_FUNCTIONS = ['getCurrentGamingDay', 'getWeeksAgoDate', 'getServerGamingDayAt'];

    // Banned UTC accessor methods used for business-date derivation
    const BANNED_UTC_METHODS = [
      'getUTCFullYear',
      'getUTCMonth',
      'getUTCDate',
    ];

    return {
      // ---------------------------------------------------------------
      // Pattern 1: toISOString().slice(0, 10)
      // Also catches: .toISOString().substring(0, 10)
      //               .toISOString().substr(0, 10)
      // AST: CallExpression > MemberExpression(slice) > CallExpression(toISOString)
      // ---------------------------------------------------------------
      CallExpression(node) {
        if (
          node.callee?.type === 'MemberExpression' &&
          node.callee.property?.type === 'Identifier' &&
          ['slice', 'substring', 'substr'].includes(
            node.callee.property.name,
          ) &&
          node.arguments?.length >= 2
        ) {
          const firstArg = node.arguments[0];
          const secondArg = node.arguments[1];

          // Check arguments are (0, 10) — the classic UTC date slice
          const isZeroTen =
            firstArg?.type === 'Literal' &&
            firstArg.value === 0 &&
            secondArg?.type === 'Literal' &&
            secondArg.value === 10;

          if (!isZeroTen) return;

          // Check that the object is a call to toISOString()
          const obj = node.callee.object;
          if (
            obj?.type === 'CallExpression' &&
            obj.callee?.type === 'MemberExpression' &&
            obj.callee.property?.type === 'Identifier' &&
            obj.callee.property.name === 'toISOString'
          ) {
            context.report({
              node,
              messageId: 'noISOSlice',
            });
          }
        }
      },

      // ---------------------------------------------------------------
      // Pattern 2: getUTCFullYear() / getUTCMonth() / getUTCDate()
      // AST: MemberExpression with property matching banned UTC methods
      // ---------------------------------------------------------------
      MemberExpression(node) {
        if (
          node.property?.type === 'Identifier' &&
          BANNED_UTC_METHODS.includes(node.property.name)
        ) {
          context.report({
            node,
            messageId: 'noUTCAccessor',
            data: { method: node.property.name },
          });
        }
      },

      // ---------------------------------------------------------------
      // Pattern 3: Import of banned temporal functions
      // Catches: import { getCurrentGamingDay } from '...'
      // ---------------------------------------------------------------
      ImportDeclaration(node) {
        if (!node.specifiers) return;

        for (const specifier of node.specifiers) {
          const importedName =
            specifier.type === 'ImportSpecifier'
              ? specifier.imported?.name
              : specifier.type === 'ImportDefaultSpecifier'
                ? specifier.local?.name
                : null;

          if (importedName && BANNED_FUNCTIONS.includes(importedName)) {
            context.report({
              node: specifier,
              messageId: 'noBannedTemporalImport',
              data: { name: importedName },
            });
          }
        }
      },

      // ---------------------------------------------------------------
      // Pattern 4: Direct call to banned temporal functions
      // Catches: getCurrentGamingDay(), getWeeksAgoDate(4)
      // ---------------------------------------------------------------
      'CallExpression[callee.type="Identifier"]'(node) {
        if (BANNED_FUNCTIONS.includes(node.callee.name)) {
          context.report({
            node,
            messageId: 'noBannedTemporalFn',
            data: { name: node.callee.name },
          });
        }
      },

      // ---------------------------------------------------------------
      // Pattern 4b: Member-expression call to banned temporal functions
      // Catches: mappers.getCurrentGamingDay()
      // ---------------------------------------------------------------
      'CallExpression[callee.type="MemberExpression"]'(node) {
        const prop = node.callee.property;
        if (
          prop?.type === 'Identifier' &&
          BANNED_FUNCTIONS.includes(prop.name)
        ) {
          context.report({
            node,
            messageId: 'noBannedTemporalFn',
            data: { name: prop.name },
          });
        }
      },
    };
  },
};
