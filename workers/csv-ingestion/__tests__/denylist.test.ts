/** @jest-environment node */

/**
 * CI Denylist Test (INV-W4)
 *
 * Scans all worker source files for references to forbidden tables.
 * The CSV ingestion worker MUST only access `import_batch` and `import_row`.
 * Any reference to other tables is a security invariant violation.
 *
 * This is a static code analysis test — no runtime DB needed.
 *
 * @see workers/csv-ingestion/src/repo.ts (INV-W4)
 * @see PRD-039 Security Posture Table
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Root directory of the worker source code. */
const WORKER_SRC_DIR = path.resolve(__dirname, '..', 'src');

/** Tables the worker is ALLOWED to reference. */
const ALLOWED_TABLES = new Set(['import_batch', 'import_row']);

/** SQL keywords that appear after FROM/UPDATE/etc. and are NOT table names. */
const SQL_KEYWORDS = new Set([
  'skip',
  'set',
  'where',
  'select',
  'values',
  'returning',
  'conflict',
  'nothing',
  'locked',
  'limit',
  'order',
  'asc',
  'desc',
  'null',
  'now',
  'and',
  'or',
  'not',
  'in',
  'is',
  'as',
  'on',
]);

/**
 * Known PT-2 database tables that MUST NOT appear in worker source.
 * This list covers the major tables from the SRM; extend if new tables
 * are added to the schema.
 */
const FORBIDDEN_TABLES = [
  'player',
  'player_casino',
  'visit',
  'rating_slip',
  'casino',
  'casino_settings',
  'staff',
  'table_game',
  'game_type',
  'comp_transaction',
  'loyalty_accrual',
  'loyalty_tier',
  'loyalty_tier_assignment',
  'mtl_threshold',
  'shift',
  'shift_summary',
  'audit_log',
  'storage.objects',
  'auth.users',
];

/**
 * SQL keywords that indicate a table reference in context.
 * Matches patterns like: FROM player, JOIN player, INTO player, UPDATE player
 */
const SQL_TABLE_PATTERN =
  /(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?(\w+)/gi;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAllSourceFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and vendor (vendored copies are copies of allowed modules)
        if (entry.name !== 'node_modules' && entry.name !== 'vendor') {
          walk(fullPath);
        }
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('INV-W4: CI denylist — worker table references', () => {
  it('worker source directory exists', () => {
    expect(fs.existsSync(WORKER_SRC_DIR)).toBe(true);
  });

  it('worker SQL strings reference ONLY import_batch and import_row tables', () => {
    const sourceFiles = getAllSourceFiles(WORKER_SRC_DIR);
    expect(sourceFiles.length).toBeGreaterThan(0);

    const violations: { file: string; table: string; snippet: string }[] = [];

    // Extract SQL template literals (backtick strings) and scan only those
    const templateLiteralPattern = /`([^`]*)`/gs;

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relPath = path.relative(WORKER_SRC_DIR, filePath);

      let tmplMatch: RegExpExecArray | null;
      templateLiteralPattern.lastIndex = 0;
      while ((tmplMatch = templateLiteralPattern.exec(content)) !== null) {
        const sqlText = tmplMatch[1];

        let match: RegExpExecArray | null;
        SQL_TABLE_PATTERN.lastIndex = 0;
        while ((match = SQL_TABLE_PATTERN.exec(sqlText)) !== null) {
          const tableName = match[1].toLowerCase();
          if (!ALLOWED_TABLES.has(tableName) && !SQL_KEYWORDS.has(tableName)) {
            violations.push({
              file: relPath,
              table: tableName,
              snippet: match[0].trim(),
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file} → '${v.table}' in SQL: ${v.snippet}`)
        .join('\n');
      throw new Error(
        `INV-W4 VIOLATION: Worker SQL references forbidden tables:\n${report}`,
      );
    }
  });

  it('no forbidden table names appear in worker SQL strings', () => {
    const sourceFiles = getAllSourceFiles(WORKER_SRC_DIR);
    const violations: { file: string; table: string }[] = [];

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relPath = path.relative(WORKER_SRC_DIR, filePath);

      for (const table of FORBIDDEN_TABLES) {
        // Check for table name in SQL-like contexts (backtick or quote delimited)
        // Also check for public.tablename pattern
        const patterns = [
          new RegExp(`public\\.${table}\\b`, 'gi'),
          new RegExp(`['"\`]${table}['"\`]`, 'gi'),
        ];

        for (const pattern of patterns) {
          if (pattern.test(content)) {
            violations.push({ file: relPath, table });
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file} → references '${v.table}'`)
        .join('\n');
      throw new Error(
        `INV-W4 VIOLATION: Worker source mentions forbidden tables:\n${report}`,
      );
    }
  });

  it('worker only imports from allowed modules (no service layer DB imports)', () => {
    const sourceFiles = getAllSourceFiles(WORKER_SRC_DIR);
    const violations: { file: string; importLine: string }[] = [];

    // The worker should not import directly from service crud or DB modules
    // that could tempt accessing other tables
    const forbiddenImportPatterns = [
      /from\s+['"]@\/services\/(?!player-import\/schemas)/,
      /from\s+['"]@\/lib\/supabase/,
    ];

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relPath = path.relative(WORKER_SRC_DIR, filePath);

      for (const pattern of forbiddenImportPatterns) {
        const match = content.match(pattern);
        if (match) {
          violations.push({ file: relPath, importLine: match[0] });
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file} → ${v.importLine}`)
        .join('\n');
      throw new Error(
        `INV-W4 VIOLATION: Worker imports from forbidden modules:\n${report}`,
      );
    }
  });
});
