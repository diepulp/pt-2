/**
 * CSV Utilities — Barrel Export
 *
 * Re-exports all public APIs from the lib/csv/ module family.
 */

// Column auto-detection
export {
  autoDetectMappings,
  CANONICAL_FIELDS,
  CANONICAL_FIELD_LABELS,
} from './column-auto-detect';
export type { CanonicalField } from './column-auto-detect';

// Cell value sanitization (formula injection prevention)
export { sanitizeCellValue, sanitizeRecord } from './csv-sanitize';

// Structural repair (bare-quote neutralization)
export {
  repairCsvStructure,
  hasValidCsvQuoting,
  CsvMultilineQuotedFieldError,
} from './csv-structural-repair';
export type {
  CsvDialect,
  RepairedLine,
  RepairReport,
  RepairResult,
} from './csv-structural-repair';

// Header and field normalization
export {
  normalizeHeaders,
  normalizeFieldValue,
  applyColumnMapping,
} from './header-normalization';
