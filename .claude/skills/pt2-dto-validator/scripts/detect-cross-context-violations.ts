#!/usr/bin/env -S npx tsx
/**
 * PT-2 DTO Validator: Detect Cross-Context Violations
 *
 * Detects services accessing tables they don't own via Database['public']['Tables']
 * Reference: SRM §54-73, DTO_CANONICAL_STANDARD.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// Service ownership mapping from SRM v3.0.2 §34-48
const SERVICE_OWNERSHIP: Record<string, string[]> = {
  casino: ['casino', 'casino_settings', 'company', 'staff', 'game_settings', 'player_casino', 'audit_log', 'report'],
  player: ['player'],
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
    'table_drop_event'
  ],
  table: ['gaming_table', 'gaming_table_settings'], // Alias for table-context
  'floor-layout': ['floor_layout', 'floor_layout_version', 'floor_pit', 'floor_table_slot', 'floor_layout_activation']
};

// Flatten table ownership for reverse lookup
const TABLE_OWNER_MAP: Record<string, string> = {};
for (const [service, tables] of Object.entries(SERVICE_OWNERSHIP)) {
  for (const table of tables) {
    if (!TABLE_OWNER_MAP[table]) {
      TABLE_OWNER_MAP[table] = service;
    }
  }
}

interface Violation {
  file: string;
  line: number;
  service: string;
  accessedTable: string;
  owningService: string;
  snippet: string;
}

async function scanServiceFiles(serviceName: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const servicePath = path.join(process.cwd(), 'services', serviceName);

  // Check if service directory exists
  if (!fs.existsSync(servicePath)) {
    return violations;
  }

  // Get all TypeScript files in service
  const files = await glob(`${servicePath}/**/*.{ts,tsx}`, {
    ignore: ['**/node_modules/**', '**/__tests__/**', '**/*.test.ts', '**/*.spec.ts']
  });

  // Scan each file
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    // Look for Database['public']['Tables']['table_name'] patterns
    const tableAccessRegex = /Database\['public'\]\['Tables'\]\['(\w+)'\]/g;

    lines.forEach((line, index) => {
      let match;
      while ((match = tableAccessRegex.exec(line)) !== null) {
        const accessedTable = match[1];
        const ownedTables = SERVICE_OWNERSHIP[serviceName] || [];

        // Check if this service owns the table
        if (!ownedTables.includes(accessedTable)) {
          // This is a violation
          const owningService = TABLE_OWNER_MAP[accessedTable] || 'unknown';

          violations.push({
            file: path.relative(process.cwd(), file),
            line: index + 1,
            service: serviceName,
            accessedTable,
            owningService,
            snippet: line.trim()
          });
        }
      }
    });
  }

  return violations;
}

async function main() {
  console.log('========================================');
  console.log('PT-2 Cross-Context Violation Detection');
  console.log('Reference: SRM v3.0.2 §54-73');
  console.log('========================================\n');

  console.log('Scanning services for cross-context table access...\n');

  const allViolations: Violation[] = [];

  // Scan each service
  for (const serviceName of Object.keys(SERVICE_OWNERSHIP)) {
    const violations = await scanServiceFiles(serviceName);
    allViolations.push(...violations);
  }

  if (allViolations.length === 0) {
    console.log('✅ No cross-context violations detected!');
    console.log('');
    console.log('All services respect bounded context isolation.');
    console.log('Cross-context consumption uses public DTOs as expected.');
    console.log('');
    process.exit(0);
  }

  // Display violations
  console.log(`❌ FOUND ${allViolations.length} CROSS-CONTEXT VIOLATION(S):\n`);

  allViolations.forEach((violation, index) => {
    console.log(`${index + 1}. Violation in service: ${violation.service}`);
    console.log(`   File: ${violation.file}:${violation.line}`);
    console.log(`   Problem: Accessing table "${violation.accessedTable}" (owned by ${violation.owningService})`);
    console.log(`   Code: ${violation.snippet}`);
    console.log('');
  });

  console.log('========================================\n');
  console.log('HOW TO FIX:\n');

  console.log('Instead of direct table access:');
  console.log('  ❌ import type { Database } from "@/types/database.types";');
  console.log('  ❌ type RatingSlipRow = Database["public"]["Tables"]["rating_slip"]["Row"];');
  console.log('');

  console.log('Use public DTO from owning service:');
  console.log('  ✅ import type { RatingSlipDTO } from "@/services/rating-slip/dtos";');
  console.log('');

  console.log('Allowed cross-context imports (SRM §60-73):');
  console.log('  - Loyalty → RatingSlip (RatingSlipTelemetryDTO)');
  console.log('  - Loyalty → Visit (VisitDTO)');
  console.log('  - Finance → Visit (VisitDTO)');
  console.log('  - Finance → RatingSlip (RatingSlipDTO)');
  console.log('  - MTL → RatingSlip, Visit');
  console.log('  - TableContext → Casino (CasinoSettingsDTO)');
  console.log('  - RatingSlip → TableContext (GamingTableDTO)');
  console.log('  - All → Casino (CasinoDTO, StaffDTO)');
  console.log('');

  console.log('Reference:');
  console.log('  - docs/25-api-data/DTO_CANONICAL_STANDARD.md §54-92');
  console.log('  - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md');
  console.log('');

  process.exit(1);
}

// Run detection
main();
