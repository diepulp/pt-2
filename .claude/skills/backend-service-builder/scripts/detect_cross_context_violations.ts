#!/usr/bin/env ts-node
/**
 * Detect cross-context violations - services accessing tables they don't own.
 *
 * Checks against SRM ownership matrix to ensure bounded context integrity.
 */

import * as fs from 'fs';
import * as path from 'path';

// SRM Ownership Matrix
const SRM_OWNERSHIP: Record<string, string[]> = {
  casino: [
    'casino',
    'casino_settings',
    'company',
    'staff',
    'game_settings',
    'audit_log',
    'report',
  ],
  player: ['player', 'player_casino'],
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

interface Violation {
  file: string;
  line: number;
  service: string;
  accessedTable: string;
  owningService: string;
}

class CrossContextDetector {
  private violations: Violation[] = [];

  async validateService(servicePath: string): Promise<void> {
    const serviceName = path.basename(servicePath);
    const ownedTables = SRM_OWNERSHIP[serviceName] || [];

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Checking service: ${serviceName}`);
    console.log(`Owned tables: ${ownedTables.join(', ')}`);
    console.log(`${'='.repeat(60)}\n`);

    // Find all .ts files (except .test.ts)
    const files = this.findTypeScriptFiles(servicePath);

    for (const file of files) {
      await this.checkFile(file, serviceName, ownedTables);
    }
  }

  private findTypeScriptFiles(dirPath: string): string[] {
    const files: string[] = [];

    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...this.findTypeScriptFiles(fullPath));
      } else if (item.endsWith('.ts') && !item.endsWith('.test.ts')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private async checkFile(
    filePath: string,
    serviceName: string,
    ownedTables: string[],
  ): Promise<void> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Pattern: Database['public']['Tables']['table_name']
    const pattern = /Database\['public'\]\['Tables'\]\['([^']+)'\]/g;

    lines.forEach((line, index) => {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const tableName = match[1];

        // Check if this table is owned by the current service
        if (!ownedTables.includes(tableName)) {
          // Find which service owns this table
          const owningService = this.findOwningService(tableName);

          this.violations.push({
            file: filePath,
            line: index + 1,
            service: serviceName,
            accessedTable: tableName,
            owningService: owningService || 'unknown',
          });
        }
      }
    });
  }

  private findOwningService(tableName: string): string | null {
    for (const [service, tables] of Object.entries(SRM_OWNERSHIP)) {
      if (tables.includes(tableName)) {
        return service;
      }
    }
    return null;
  }

  printResults(): void {
    console.log(`\n${'-'.repeat(60)}`);
    console.log('CROSS-CONTEXT VIOLATION DETECTION RESULTS');
    console.log(`${'-'.repeat(60)}\n`);

    if (this.violations.length === 0) {
      console.log('\x1b[32m✅ NO VIOLATIONS DETECTED\x1b[0m\n');
      return;
    }

    console.log(
      `\x1b[31m❌ FOUND ${this.violations.length} VIOLATION(S)\x1b[0m\n`,
    );

    this.violations.forEach((v, i) => {
      console.log(`${i + 1}. ${path.basename(v.file)}:${v.line}`);
      console.log(`   Service: ${v.service}`);
      console.log(`   Accessed table: ${v.accessedTable}`);
      console.log(`   Owner: ${v.owningService}`);
      console.log(
        `   \x1b[33m→ Use published DTO from ${v.owningService} service instead\x1b[0m`,
      );
      console.log();
    });

    console.log(
      `\x1b[31m❌ VALIDATION FAILED\x1b[0m (${this.violations.length} violations)\n`,
    );
  }

  hasViolations(): boolean {
    return this.violations.length > 0;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(
      'Usage: ts-node detect_cross_context_violations.ts <service-path>',
    );
    console.log(
      'Example: ts-node detect_cross_context_violations.ts services/loyalty',
    );
    process.exit(1);
  }

  const servicePath = args[0];

  if (!fs.existsSync(servicePath)) {
    console.error(
      `\x1b[31mError:\x1b[0m Service path does not exist: ${servicePath}`,
    );
    process.exit(1);
  }

  const detector = new CrossContextDetector();
  await detector.validateService(servicePath);
  detector.printResults();

  process.exit(detector.hasViolations() ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
