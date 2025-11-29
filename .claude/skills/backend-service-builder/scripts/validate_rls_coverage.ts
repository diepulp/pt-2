#!/usr/bin/env ts-node
/**
 * Validate RLS (Row Level Security) policy coverage.
 *
 * Ensures all tables have:
 * 1. RLS enabled
 * 2. At least one policy defined
 * 3. Policies follow naming conventions
 */

import * as fs from 'fs';
import * as path from 'path';

interface RLSCheck {
  table: string;
  hasRLS: boolean;
  policies: string[];
  migrationFile: string;
}

class RLSValidator {
  private checks: Map<string, RLSCheck> = new Map();
  private errors: string[] = [];
  private warnings: string[] = [];

  async validateMigrations(migrationsDir: string): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Validating RLS coverage in: ${migrationsDir}`);
    console.log(`${'='.repeat(60)}\n`);

    const migrationFiles = this.findMigrationFiles(migrationsDir);

    for (const file of migrationFiles) {
      await this.analyzeMigration(file);
    }
  }

  private findMigrationFiles(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) {
      console.error(
        `\x1b[31mError:\x1b[0m Migrations directory not found: ${dirPath}`,
      );
      return [];
    }

    return fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => path.join(dirPath, f))
      .sort();
  }

  private async analyzeMigration(filePath: string): Promise<void> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    // Find CREATE TABLE statements
    const tablePattern =
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)\s*\(/gi;
    let match;

    while ((match = tablePattern.exec(content)) !== null) {
      const tableName = match[1];

      if (!this.checks.has(tableName)) {
        this.checks.set(tableName, {
          table: tableName,
          hasRLS: false,
          policies: [],
          migrationFile: fileName,
        });
      }
    }

    // Find ENABLE ROW LEVEL SECURITY statements
    const rlsPattern =
      /ALTER\s+TABLE\s+([a-z_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;

    while ((match = rlsPattern.exec(content)) !== null) {
      const tableName = match[1];
      const check = this.checks.get(tableName);
      if (check) {
        check.hasRLS = true;
      }
    }

    // Find CREATE POLICY statements
    const policyPattern = /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+([a-z_]+)/gi;

    while ((match = policyPattern.exec(content)) !== null) {
      const policyName = match[1];
      const tableName = match[2];
      const check = this.checks.get(tableName);
      if (check) {
        check.policies.push(policyName);
      }
    }
  }

  validateResults(): void {
    for (const [tableName, check] of this.checks.entries()) {
      // Check 1: RLS enabled
      if (!check.hasRLS) {
        this.errors.push(
          `Table "${tableName}" (${check.migrationFile}): RLS not enabled. ` +
            `Add: ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`,
        );
      }

      // Check 2: At least one policy
      if (check.policies.length === 0) {
        this.errors.push(
          `Table "${tableName}" (${check.migrationFile}): No RLS policies defined. ` +
            `Add at least one policy.`,
        );
      }

      // Check 3: Policy naming conventions
      for (const policy of check.policies) {
        if (!this.isPolicyNameValid(policy, tableName)) {
          this.warnings.push(
            `Table "${tableName}": Policy "${policy}" doesn't follow naming convention. ` +
              `Expected: {role}_{action}_{table} (e.g., "casino_staff_view_${tableName}")`,
          );
        }
      }
    }
  }

  private isPolicyNameValid(policyName: string, tableName: string): boolean {
    // Expected pattern: {role}_{action}_{table}
    // Examples: casino_staff_view_player, admin_full_access_loyalty
    const pattern = /^[a-z_]+_(view|insert|update|delete|full_access)_/;
    return pattern.test(policyName);
  }

  printResults(): void {
    console.log(`\n${'-'.repeat(60)}`);
    console.log('RLS COVERAGE VALIDATION RESULTS');
    console.log(`${'-'.repeat(60)}\n`);

    console.log(`\x1b[36mTables analyzed: ${this.checks.size}\x1b[0m\n`);

    // Print table summary
    for (const [tableName, check] of this.checks.entries()) {
      const rlsStatus = check.hasRLS ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
      const policyCount = check.policies.length;
      const policyStatus =
        policyCount > 0 ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';

      console.log(`Table: ${tableName}`);
      console.log(`  RLS Enabled: ${rlsStatus}`);
      console.log(`  Policies: ${policyStatus} (${policyCount} defined)`);
      if (policyCount > 0) {
        check.policies.forEach((p) => console.log(`    - ${p}`));
      }
      console.log();
    }

    // Print warnings
    if (this.warnings.length > 0) {
      console.log(`\x1b[33mWARNINGS:\x1b[0m`);
      this.warnings.forEach((w) => console.log(`  ⚠️  ${w}`));
      console.log();
    }

    // Print errors
    if (this.errors.length > 0) {
      console.log(`\x1b[31mERRORS:\x1b[0m`);
      this.errors.forEach((e) => console.log(`  ❌ ${e}`));
      console.log();
    }

    // Summary
    if (this.errors.length > 0) {
      console.log(
        `\x1b[31m❌ VALIDATION FAILED\x1b[0m (${this.errors.length} errors, ${this.warnings.length} warnings)\n`,
      );
    } else if (this.warnings.length > 0) {
      console.log(
        `\x1b[33m⚠️  VALIDATION PASSED WITH WARNINGS\x1b[0m (${this.warnings.length} warnings)\n`,
      );
    } else {
      console.log(
        `\x1b[32m✅ VALIDATION PASSED\x1b[0m - All tables have proper RLS coverage\n`,
      );
    }
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const migrationsDir = args[0] || 'supabase/migrations';

  const validator = new RLSValidator();
  await validator.validateMigrations(migrationsDir);
  validator.validateResults();
  validator.printResults();

  process.exit(validator.hasErrors() ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
