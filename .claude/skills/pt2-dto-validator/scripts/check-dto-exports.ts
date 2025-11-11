#!/usr/bin/env -S npx tsx
/**
 * PT-2 DTO Validator: Check DTO Exports
 *
 * Validates that services export DTOs for all tables they own (SRM §34-48)
 */

import * as fs from 'fs';
import * as path from 'path';

// Service ownership mapping from SRM v3.0.2 §34-48
const SERVICE_OWNERSHIP: Record<string, { tables: string[]; expectedDTOs: string[] }> = {
  casino: {
    tables: ['casino', 'casino_settings', 'company', 'staff', 'game_settings', 'player_casino', 'audit_log', 'report'],
    expectedDTOs: ['CasinoDTO', 'CasinoSettingsDTO', 'StaffDTO', 'GameSettingsDTO']
  },
  player: {
    tables: ['player'],
    expectedDTOs: ['PlayerDTO']
  },
  visit: {
    tables: ['visit'],
    expectedDTOs: ['VisitDTO']
  },
  loyalty: {
    tables: ['player_loyalty', 'loyalty_ledger', 'loyalty_outbox'],
    expectedDTOs: ['PlayerLoyaltyDTO', 'LoyaltyLedgerEntryDTO']
  },
  'rating-slip': {
    tables: ['rating_slip'],
    expectedDTOs: ['RatingSlipDTO', 'RatingSlipTelemetryDTO']
  },
  finance: {
    tables: ['player_financial_transaction', 'finance_outbox'],
    expectedDTOs: ['FinancialTransactionDTO']
  },
  mtl: {
    tables: ['mtl_entry', 'mtl_audit_note'],
    expectedDTOs: ['MTLEntryDTO', 'MTLAuditNoteDTO']
  },
  'table-context': {
    tables: [
      'gaming_table',
      'gaming_table_settings',
      'dealer_rotation',
      'table_inventory_snapshot',
      'table_fill',
      'table_credit',
      'table_drop_event'
    ],
    expectedDTOs: ['GamingTableDTO', 'DealerRotationDTO', 'TableInventoryDTO', 'TableFillDTO', 'TableCreditDTO', 'TableDropDTO']
  },
  'floor-layout': {
    tables: ['floor_layout', 'floor_layout_version', 'floor_pit', 'floor_table_slot', 'floor_layout_activation'],
    expectedDTOs: ['FloorLayoutDTO', 'FloorLayoutVersionDTO', 'FloorPitDTO', 'FloorTableSlotDTO', 'FloorLayoutActivationDTO']
  }
};

interface ValidationResult {
  service: string;
  dtosFileExists: boolean;
  foundDTOs: string[];
  missingDTOs: string[];
  unexpectedDTOs: string[];
  status: 'pass' | 'fail' | 'warning';
}

function checkServiceDTOs(serviceName: string): ValidationResult {
  const servicesDir = path.join(process.cwd(), 'services');
  const servicePath = path.join(servicesDir, serviceName);
  const dtosPath = path.join(servicePath, 'dtos.ts');

  const result: ValidationResult = {
    service: serviceName,
    dtosFileExists: false,
    foundDTOs: [],
    missingDTOs: [],
    unexpectedDTOs: [],
    status: 'pass'
  };

  // Check if service directory exists
  if (!fs.existsSync(servicePath)) {
    result.status = 'warning';
    return result;
  }

  // Check if dtos.ts exists
  if (!fs.existsSync(dtosPath)) {
    result.status = 'fail';
    result.missingDTOs = SERVICE_OWNERSHIP[serviceName].expectedDTOs;
    return result;
  }

  result.dtosFileExists = true;

  // Read dtos.ts and extract exports
  const dtosContent = fs.readFileSync(dtosPath, 'utf-8');

  // Parse exports (simple regex-based extraction)
  const exportMatches = dtosContent.matchAll(/export\s+(?:type|interface)\s+(\w+)/g);
  const foundExports = Array.from(exportMatches).map(match => match[1]);

  result.foundDTOs = foundExports;

  // Check for missing DTOs
  const expectedDTOs = SERVICE_OWNERSHIP[serviceName].expectedDTOs;
  result.missingDTOs = expectedDTOs.filter(dto => !foundExports.includes(dto));

  // Check for unexpected DTOs (informational only)
  result.unexpectedDTOs = foundExports.filter(dto => !expectedDTOs.includes(dto) && dto.endsWith('DTO'));

  // Determine status
  if (result.missingDTOs.length > 0) {
    result.status = 'fail';
  } else if (result.unexpectedDTOs.length > 0) {
    result.status = 'warning'; // Has extra DTOs (might be OK for RPC DTOs)
  } else {
    result.status = 'pass';
  }

  return result;
}

function main() {
  console.log('========================================');
  console.log('PT-2 DTO Export Validation');
  console.log('Reference: SRM v3.0.2 §34-48');
  console.log('========================================\n');

  const results: ValidationResult[] = [];

  // Check each service
  for (const serviceName of Object.keys(SERVICE_OWNERSHIP)) {
    const result = checkServiceDTOs(serviceName);
    results.push(result);
  }

  // Display results
  console.log('Service                  | dtos.ts | Status | Missing DTOs');
  console.log('------------------------ | ------- | ------ | -------------');

  for (const result of results) {
    const fileStatus = result.dtosFileExists ? '✅' : '❌';
    const statusIcon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
    const missingList = result.missingDTOs.join(', ') || '-';

    console.log(
      `${result.service.padEnd(24)} | ${fileStatus.padEnd(7)} | ${statusIcon.padEnd(6)} | ${missingList}`
    );
  }

  console.log('\n========================================\n');

  // Summary
  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const warnCount = results.filter(r => r.status === 'warning').length;

  console.log('Summary:');
  console.log(`  ✅ Passing: ${passCount}`);
  console.log(`  ❌ Failing: ${failCount}`);
  console.log(`  ⚠️  Warnings: ${warnCount}`);
  console.log('');

  // Detailed failures
  if (failCount > 0) {
    console.log('❌ FAILURES DETECTED:\n');

    for (const result of results.filter(r => r.status === 'fail')) {
      console.log(`Service: ${result.service}`);

      if (!result.dtosFileExists) {
        console.log(`  - Missing file: services/${result.service}/dtos.ts`);
      }

      if (result.missingDTOs.length > 0) {
        console.log(`  - Missing DTOs: ${result.missingDTOs.join(', ')}`);
      }

      console.log('');
    }

    console.log('Action Required:');
    console.log('  1. Create dtos.ts file for failing services');
    console.log('  2. Export required DTOs based on table ownership (SRM §34-48)');
    console.log('  3. Use Canonical pattern: export type YourDTO = Database["public"]["Tables"]["your_table"]["Row"]');
    console.log('  4. Or Contract-First pattern: export interface YourDTO { ... }');
    console.log('');
    console.log('Reference:');
    console.log('  - docs/25-api-data/DTO_CANONICAL_STANDARD.md');
    console.log('  - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md §34-48');
    console.log('');

    process.exit(1);
  }

  // Warnings
  if (warnCount > 0) {
    console.log('⚠️  WARNINGS:\n');

    for (const result of results.filter(r => r.status === 'warning')) {
      if (result.unexpectedDTOs.length > 0) {
        console.log(`Service: ${result.service}`);
        console.log(`  - Additional DTOs found: ${result.unexpectedDTOs.join(', ')}`);
        console.log(`  - This is OK if they are RPC DTOs or Contract-First patterns`);
        console.log('');
      }
    }
  }

  console.log('✅ All required DTOs are exported!');
  console.log('');
  console.log(`Total services checked: ${results.length}`);
  console.log(`Total DTOs validated: ${results.reduce((sum, r) => sum + r.foundDTOs.length, 0)}`);
  console.log('');

  process.exit(0);
}

// Run validation
main();
