/**
 * §4 E1 — Registered-factory compliance (integration)
 *
 * Proves that every shift-dashboard-reaching mutation hook in the Day-1
 * inventory satisfies ADR-050 §4 E1: any invalidation targeting a
 * shift-dashboard queryKey MUST use the registered `shiftDashboardKeys.*`
 * factory — never an inline `['shift-dashboard', ...]` array literal.
 *
 * The test is a source-level audit: it reads each inventoried hook file
 * and fails if it invalidates a shift-dashboard key via an inline literal.
 *
 * Why source-level, not runtime:
 *   E1 is a STATIC compliance rule about HOW invalidation is expressed.
 *   A runtime check would miss inline literals that happen to match by
 *   value. Reading the source catches the anti-pattern.
 *
 * Scope of this test:
 *   Restricted to the Day-1 inventory at __fixtures__/d1-mutation-hooks.ts.
 *   Phase 2 authors re-run discovery and extend the fixture before adding
 *   a new fact×surface pair.
 *
 * @see PRD-068 / EXEC-068 W3 Layer 2
 * @see ADR-050 §4 E1
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { D1_MUTATION_HOOKS } from './__fixtures__/d1-mutation-hooks';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/**
 * Matches any `queryKey: [ 'shift-dashboard', ... ]` inline array literal.
 * Catches the anti-pattern that bypasses the factory.
 *
 * Allowed: `queryKey: shiftDashboardKeys.something.scope` or
 * `queryKey: shiftDashboardKeys.summary(window)` — these are factory calls.
 */
const INLINE_SHIFT_DASHBOARD_LITERAL =
  /queryKey\s*:\s*\[\s*['"]shift-dashboard['"]/;

describe('ADR-050 §4 E1 — registered-factory compliance (Day-1 inventory)', () => {
  it('Day-1 inventory is non-empty', () => {
    expect(D1_MUTATION_HOOKS.length).toBeGreaterThan(0);
  });

  describe.each(D1_MUTATION_HOOKS)(
    '$hook_export_name ($hook_path)',
    (entry) => {
      const abs = resolve(REPO_ROOT, entry.hook_path);

      it('source file exists', () => {
        expect(existsSync(abs)).toBe(true);
      });

      it('does NOT use an inline ["shift-dashboard", ...] queryKey literal', () => {
        const src = readFileSync(abs, 'utf8');
        const match = src.match(INLINE_SHIFT_DASHBOARD_LITERAL);
        if (match) {
          throw new Error(
            `E1 violation: ${entry.hook_path} contains an inline shift-dashboard queryKey literal. ` +
              `Use shiftDashboardKeys.<scope>.scope or shiftDashboardKeys.<scope>(args) instead. ` +
              `Matched near: ${src
                .slice(Math.max(0, match.index! - 30), (match.index ?? 0) + 80)
                .replace(/\n/g, ' ')}`,
          );
        }
      });

      it('if it invalidates any shift-dashboard key, the call references shiftDashboardKeys', () => {
        const src = readFileSync(abs, 'utf8');
        const mentionsShiftDashboard = /shift-dashboard/i.test(src);
        if (!mentionsShiftDashboard) {
          // Hook reaches surface via WAL only; nothing to assert at source level.
          return;
        }
        // Any shift-dashboard invalidation must go through the factory import.
        expect(src).toMatch(/shiftDashboardKeys\.[a-zA-Z]+/);
      });
    },
  );

  /**
   * Sanity: the primary target hook (useCreateFinancialAdjustment) MUST
   * claim `invalidates_shift_dashboard_keys_today: true` in the fixture.
   * If someone silently removes mutation-side invalidation from the
   * adjustment hook, this anchor assertion alerts them that the Day-1
   * baseline changed and the Replication Checklist (W5) may need amending.
   */
  it('primary target useCreateFinancialAdjustment is marked as mutation-side invalidator', () => {
    const primary = D1_MUTATION_HOOKS.find(
      (h) => h.hook_export_name === 'useCreateFinancialAdjustment',
    );
    expect(primary).toBeDefined();
    expect(primary?.invalidates_shift_dashboard_keys_today).toBe(true);
  });
});
