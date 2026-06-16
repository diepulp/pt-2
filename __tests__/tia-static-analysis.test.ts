/**
 * TIA Static Analysis Tests — PRD-090 WS6
 *
 * SRL enforcement IDs covered in this file:
 *   TIA-CANON-SURFACE-LABEL-CONFORMANCE (tia.consumer_render_only)
 *   TIA-CANON-LEGACY-ALIAS-BOUNDARY     (tia.rpc_exclusion — extends suppression gate)
 *
 * Additional tests (no SRL enforcement ID):
 *   tia.rpc_exclusion              — TIA service + rundown exemplar do not call quarantined RPCs
 *   tia.consumer_render_only       — RundownSummaryPanel renders, not re-derives
 *   tia.rpc_compute_table_rundown_fate — DEC-2 quarantine boundary holds across all operator-facing sources
 *
 * @see __tests__/tia-suppression-gate.test.ts — TIA-CANON-LEGACY-ALIAS-BOUNDARY (field suppression)
 * @see EXEC-090 WS6, PRD-090 DEC-2, SRL-TIA-001, ADR-059
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

function activeLines(content: string): string {
  return content
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return (
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('*') &&
        !trimmed.startsWith('/*')
      );
    })
    .join('\n');
}

// ── tia.rpc_exclusion ────────────────────────────────────────────────────────

describe('tia.rpc_exclusion', () => {
  // TableInventoryAccounting service must not call rpc_shift_table_metrics.
  // The rundown exemplar path (useTableAccountingProjection hook) must not call
  // rpc_compute_table_rundown.

  it('TableInventoryAccounting service does not call rpc_shift_table_metrics', () => {
    const src = readFile(
      'services/table-context/table-inventory-accounting.ts',
    );
    expect(src).not.toContain('rpc_shift_table_metrics');
  });

  it('TableInventoryAccounting service does not call rpc_compute_table_rundown', () => {
    const src = readFile(
      'services/table-context/table-inventory-accounting.ts',
    );
    expect(src).not.toContain('rpc_compute_table_rundown');
  });

  it('useTableAccountingProjection hook does not call rpc_compute_table_rundown', () => {
    const src = readFile('hooks/table-context/use-table-rundown.ts');
    const active = activeLines(src);
    expect(active).not.toContain('rpc_compute_table_rundown');
  });

  it('useTableAccountingProjection hook does not call rpc_shift_table_metrics', () => {
    const src = readFile('hooks/table-context/use-table-rundown.ts');
    expect(src).not.toContain('rpc_shift_table_metrics');
  });

  it('accounting-projection route handler does not call rpc_compute_table_rundown', () => {
    const src = readFile(
      'app/api/v1/table-context/table-sessions/[sessionId]/accounting-projection/route.ts',
    );
    expect(src).not.toContain('rpc_compute_table_rundown');
  });
});

// ── tia.consumer_render_only — TIA-CANON-SURFACE-LABEL-CONFORMANCE ────────────

describe('tia.consumer_render_only — TIA-CANON-SURFACE-LABEL-CONFORMANCE', () => {
  // RundownSummaryPanel must render calculation_kind / projected_table_win_loss_cents /
  // partial_table_result_cents as received from the API — no re-derivation from raw inputs.
  // SRL law 5: consumers render only.

  const panelSrc = readFile('components/table/rundown-summary-panel.tsx');
  const panelActive = activeLines(panelSrc);

  it('renders calculation_kind to determine display state — no local derivation', () => {
    // Must branch on calculation_kind
    expect(panelSrc).toContain('calculation_kind');
    // Must display the three canonical states
    expect(panelSrc).toContain("'telemetry_drop_formula'");
    expect(panelSrc).toContain("'inventory_only'");
    expect(panelSrc).toContain("'integrity_failure'");
  });

  it('renders projected_table_win_loss_cents as received — no formula re-computation', () => {
    // Must access the field
    expect(panelSrc).toContain('projected_table_win_loss_cents');
    // Must NOT contain formula arithmetic operators with raw input fields
    // (opening_inventory_cents, closing_inventory_cents, fills_total_cents, etc.)
    expect(panelActive).not.toContain('opening_inventory_cents');
    expect(panelActive).not.toContain('closing_inventory_cents');
    expect(panelActive).not.toContain('fills_total_cents');
    expect(panelActive).not.toContain('credits_total_cents');
  });

  it('renders partial_table_result_cents as received — no four-operand re-computation', () => {
    expect(panelSrc).toContain('partial_table_result_cents');
  });

  it('does not compute win/loss from raw telemetry or inventory fields', () => {
    // The panel must not reference raw computation inputs
    expect(panelActive).not.toContain(
      'telemetry_derived_drop_estimate_cents +',
    );
    expect(panelActive).not.toContain('+ closing_inventory');
    expect(panelActive).not.toContain('- opening_inventory');
    // No arithmetic with drop/fill/credit fields directly
    expect(panelActive).not.toMatch(/drop.*\+.*inventory/);
    expect(panelActive).not.toMatch(/inventory.*\-.*fills/);
  });

  it('uses useTableAccountingProjection hook (not the quarantined useTableRundown)', () => {
    expect(panelSrc).toContain('useTableAccountingProjection');
    expect(panelActive).not.toContain('useTableRundown');
    expect(panelActive).not.toContain('computeTableRundown');
  });

  it('integrity_failure renders disclosure (no result label) — TIA-CANON-SURFACE-LABEL-CONFORMANCE', () => {
    // integrity_failure branch must render a disclosure, not a win/loss figure
    expect(panelSrc).toContain("'integrity_failure'");
    expect(panelSrc).toContain('integrity_issues');
    // Must NOT render "Win/Loss" label in integrity_failure branch
    // (The panel renders three distinct JSX branches; only telemetry/inventory branches
    //  render a label; integrity_failure renders an alert)
    const integritySection = panelSrc.slice(
      panelSrc.indexOf("'integrity_failure'"),
      panelSrc.indexOf("'integrity_failure'") + 400,
    );
    expect(integritySection).not.toContain('Win/Loss');
    expect(integritySection).not.toContain('Estimated Win');
    expect(integritySection).not.toContain('Final Win');
  });
});

// ── tia.rpc_compute_table_rundown_fate — DEC-2 quarantine boundary ────────────

describe('tia.rpc_compute_table_rundown_fate', () => {
  // DEC-2: rpc_compute_table_rundown is quarantined. No active operator-facing path
  // may call it. Only services/table-context/rundown.ts contains the quarantined
  // function (the only legitimate location — the QUARANTINED export itself).
  //
  // Grep scope: app/, components/, hooks/, services/ (excluding test files)
  // Exclusion: services/table-context/rundown.ts (the quarantined source itself)

  const operatorSources: Array<{ file: string; content: string }> = [];

  beforeAll(() => {
    // Collect all operator-facing source files (exclude test files and quarantine source)
    const dirs = ['app', 'components', 'hooks', 'services'];
    for (const dir of dirs) {
      const dirPath = path.join(ROOT, dir);
      if (!fs.existsSync(dirPath)) continue;

      collectFiles(dirPath, operatorSources, [
        // Exclude test files
        '.test.ts',
        '.test.tsx',
        '.spec.ts',
        '.spec.tsx',
        '__tests__',
        // Exclude the quarantine source itself (the only legitimate location)
        path.join(ROOT, 'services', 'table-context', 'rundown.ts'),
      ]);
    }
  });

  it('no active operator-facing source calls rpc_compute_table_rundown (DEC-2 quarantine)', () => {
    // Detect actual RPC invocations: .rpc('rpc_compute_table_rundown'
    // Type references like Database['public']['Functions']['rpc_compute_table_rundown']
    // are not invocations and are excluded by this pattern.
    const invocationPattern = /\.rpc\(['"]rpc_compute_table_rundown['"]/;
    const violations: string[] = [];

    for (const { file, content } of operatorSources) {
      const active = activeLines(content);
      if (invocationPattern.test(active)) {
        violations.push(path.relative(ROOT, file));
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `DEC-2 quarantine violation: rpc_compute_table_rundown found in active code:\n` +
          violations.map((f) => `  - ${f}`).join('\n'),
      );
    }
    expect(violations).toHaveLength(0);
  });

  it('RundownSummaryPanel does not call rpc_compute_table_rundown', () => {
    const src = readFile('components/table/rundown-summary-panel.tsx');
    expect(activeLines(src)).not.toMatch(
      /\.rpc\(['"]rpc_compute_table_rundown['"]/,
    );
  });

  it('useTableAccountingProjection hook does not call rpc_compute_table_rundown', () => {
    const src = readFile('hooks/table-context/use-table-rundown.ts');
    expect(activeLines(src)).not.toMatch(
      /\.rpc\(['"]rpc_compute_table_rundown['"]/,
    );
  });

  it('accounting-projection route does not call rpc_compute_table_rundown', () => {
    const src = readFile(
      'app/api/v1/table-context/table-sessions/[sessionId]/accounting-projection/route.ts',
    );
    expect(activeLines(src)).not.toMatch(
      /\.rpc\(['"]rpc_compute_table_rundown['"]/,
    );
  });

  it('computeTableRundown is marked QUARANTINED in rundown.ts', () => {
    const src = readFile('services/table-context/rundown.ts');
    // Verify the quarantine marker exists (DEC-2 audit trail)
    expect(src).toContain('QUARANTINED');
    expect(src).toContain('PRD-090 DEC-2');
  });
});

// ── Helper: recursive file collector ─────────────────────────────────────────

function collectFiles(
  dir: string,
  result: Array<{ file: string; content: string }>,
  exclude: string[],
): void {
  if (exclude.includes(dir)) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (exclude.some((ex) => fullPath.includes(ex))) continue;

    if (entry.isDirectory()) {
      // Skip node_modules, .next, __tests__ directories
      if (
        ['node_modules', '.next', '__tests__', 'trees', '.claude'].includes(
          entry.name,
        )
      )
        continue;
      collectFiles(fullPath, result, exclude);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.spec.tsx')
    ) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        result.push({ file: fullPath, content });
      } catch {
        // skip unreadable files
      }
    }
  }
}
