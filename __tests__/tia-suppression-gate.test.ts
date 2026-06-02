/**
 * TIA Suppression Gate — PRD-090 WS5
 *
 * Enforcement test ID: TIA-CANON-LEGACY-ALIAS-BOUNDARY
 * SRL binding: SRL-TIA-001
 *
 * Asserts that forbidden legacy field names and surface labels are absent
 * from active operator-visible code paths in shift-metrics DTOs and services.
 *
 * This test operates on source text and is intentionally a static analysis gate.
 * It runs under the standard jest test suite (not integration).
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

// Paths in scope for forbidden field name suppression (operator-serialized boundaries)
const SHIFT_METRICS_DTO = 'services/table-context/shift-metrics/dtos.ts';
const SHIFT_METRICS_SERVICE = 'services/table-context/shift-metrics/service.ts';
const SHIFT_REPORT_ASSEMBLER = 'services/reporting/shift-report/assembler.ts';
const SHIFT_REPORT_DTOS = 'services/reporting/shift-report/dtos.ts';
const SHIFT_CHECKPOINT_CRUD = 'services/table-context/shift-checkpoint/crud.ts';

const SCOPED_SOURCES = [
  SHIFT_METRICS_DTO,
  SHIFT_METRICS_SERVICE,
  SHIFT_REPORT_ASSEMBLER,
  SHIFT_REPORT_DTOS,
  SHIFT_CHECKPOINT_CRUD,
];

// Forbidden field names (legacy aliases, suppressed per ADR-060 D3 / SRL-TIA-001)
const FORBIDDEN_FIELD_NAMES = [
  'win_loss_inventory_cents',
  'win_loss_estimated_cents',
  'estimated_drop_buyins_cents',
  'win_loss_inventory_total_cents',
  'win_loss_estimated_total_cents',
];

// Forbidden surface labels (must not appear in operator-facing render paths)
const FORBIDDEN_SURFACE_LABELS = [
  '"Estimated Win/Loss"',
  '"Final Win/Loss"',
  '"Total Drop"',
  '"Posted Drop"',
  '"Settled Result"',
  '"Reconciled Result"',
];

// Pattern to detect active field declarations (not comments or TODO lines)
function isActiveLine(line: string): boolean {
  const trimmed = line.trimStart();
  // Skip comment lines
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*')
  ) {
    return false;
  }
  return true;
}

describe('TIA-CANON-LEGACY-ALIAS-BOUNDARY: suppression gate', () => {
  describe('forbidden field names absent from shift-metrics DTO interface', () => {
    const dtoContent = readFile(SHIFT_METRICS_DTO);

    for (const field of FORBIDDEN_FIELD_NAMES) {
      test(`ShiftTableMetricsDTO does not declare "${field}"`, () => {
        const activeLines = dtoContent
          .split('\n')
          .filter(isActiveLine)
          .join('\n');
        expect(activeLines).not.toContain(`${field}:`);
        expect(activeLines).not.toContain(`${field}?:`);
      });
    }
  });

  describe('forbidden field names absent from shift-metrics service mapper', () => {
    const serviceContent = readFile(SHIFT_METRICS_SERVICE);

    for (const field of [
      'win_loss_inventory_cents',
      'win_loss_estimated_cents',
      'estimated_drop_buyins_cents',
    ]) {
      test(`service mapper does not assign "${field}"`, () => {
        const activeLines = serviceContent
          .split('\n')
          .filter(isActiveLine)
          .join('\n');
        // Allow references only as comments — no active assignments
        const assignmentPattern = new RegExp(`\\b${field}\\s*:`);
        expect(assignmentPattern.test(activeLines)).toBe(false);
      });
    }
  });

  describe('forbidden field names absent from shift-report assembler DTOs', () => {
    const reportDtoContent = readFile(SHIFT_REPORT_DTOS);

    for (const field of [
      'winLossInventoryCents',
      'winLossEstimatedCents',
      'winLossInventoryTotalCents',
      'winLossEstimatedTotalCents',
    ]) {
      test(`FinancialTableRow/FinancialSummarySection does not declare "${field}"`, () => {
        const activeLines = reportDtoContent
          .split('\n')
          .filter(isActiveLine)
          .join('\n');
        expect(activeLines).not.toContain(`${field}:`);
        expect(activeLines).not.toContain(`${field}?:`);
      });
    }
  });

  describe('forbidden surface labels absent from scoped service sources', () => {
    for (const source of SCOPED_SOURCES) {
      const content = readFile(source);

      for (const label of FORBIDDEN_SURFACE_LABELS) {
        test(`"${source}" does not contain forbidden label ${label}`, () => {
          const activeLines = content
            .split('\n')
            .filter(isActiveLine)
            .join('\n');
          expect(activeLines).not.toContain(label);
        });
      }
    }
  });

  describe('source_authority.inventory key absent from TIA service', () => {
    const tiaService = readFile(
      'services/table-context/table-inventory-accounting.ts',
    );

    test('source_authority does not reference "inventory" key', () => {
      const activeLines = tiaService
        .split('\n')
        .filter(isActiveLine)
        .join('\n');
      // inventory key must not appear as a property assignment in source_authority
      expect(activeLines).not.toMatch(/source_authority[\s\S]*?inventory\s*:/);
    });
  });
});
