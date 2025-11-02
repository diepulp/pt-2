#!/usr/bin/env node
/**
 * ADR Sync Validator (ES Module)
 *
 * Validates that .claude/memory/architecture-decisions.memory.md stays in sync
 * with the actual ADR files in docs/80-adrs/
 *
 * Checks:
 * - All ADR files are documented in memory
 * - Status fields match between source and memory
 * - Memory file timestamp is current
 * - No phantom ADRs (documented but don't exist)
 *
 * Exit codes:
 * - 0: All checks passed
 * - 1: Validation errors found
 * - 2: Critical file not found
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const ADR_DIR = path.join(__dirname, '../docs/80-adrs');
const MEMORY_FILE = path.join(
  __dirname,
  '../.claude/memory/architecture-decisions.memory.md'
);
const OUTPUT_DIR = path.join(__dirname, '../.validation');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'adr-sync-report.json');

/**
 * Extract ADR metadata from a markdown file
 */
function parseADRFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath);

  // Extract ADR number from filename (ADR-001-title.md)
  const numberMatch = filename.match(/ADR-(\d+)/i);
  const adrNumber = numberMatch ? numberMatch[1] : null;

  // Extract status (case-insensitive, handles various formats)
  const statusMatch = content.match(
    /\*\*Status\*\*:\s*([^\n]+)|Status:\s*([^\n]+)/i
  );
  let status = statusMatch ? (statusMatch[1] || statusMatch[2]).trim() : 'Unknown';

  // Normalize status
  status = status
    .replace(/✅|⚠️|⏸️|🔴/g, '') // Remove emoji
    .trim()
    .toLowerCase();

  // Extract date
  const dateMatch = content.match(
    /\*\*Date\*\*:\s*([^\n]+)|Date:\s*([^\n]+)|Date Accepted:\s*([^\n]+)/i
  );
  const date = dateMatch
    ? (dateMatch[1] || dateMatch[2] || dateMatch[3]).trim()
    : 'Unknown';

  // Extract title (from # heading)
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : filename;

  return {
    number: adrNumber,
    filename,
    title,
    status,
    date,
    path: filePath,
  };
}

/**
 * Extract ADR references from memory file
 */
function parseMemoryFile(memoryPath) {
  if (!fs.existsSync(memoryPath)) {
    throw new Error(`Memory file not found: ${memoryPath}`);
  }

  const content = fs.readFileSync(memoryPath, 'utf-8');

  // Extract last updated timestamp
  const timestampMatch = content.match(/\*\*Last Updated\*\*:\s*(\d{4}-\d{2}-\d{2})/);
  const lastUpdated = timestampMatch ? timestampMatch[1] : null;

  // Find all ADR sections (## ADR-XXX: Title)
  const adrSections = [];
  const sectionRegex = /##\s+ADR-(\d+):\s+([^\n]+)/gi;
  let match;

  while ((match = sectionRegex.exec(content)) !== null) {
    const number = match[1];
    const title = match[2].trim();

    // Try to find status for this ADR in its section
    const sectionStart = match.index;
    const nextSectionMatch = content
      .slice(sectionStart + match[0].length)
      .match(/##\s+ADR-\d+:/);
    const sectionEnd = nextSectionMatch
      ? sectionStart + match[0].length + nextSectionMatch.index
      : content.length;
    const sectionContent = content.slice(sectionStart, sectionEnd);

    // Extract status from section
    const statusMatch = sectionContent.match(/\*\*Status\*\*:\s*([^\n]+)/);
    let status = statusMatch ? statusMatch[1].trim() : 'Unknown';

    // Normalize status
    status = status
      .replace(/✅|⚠️|⏸️|🔴/g, '')
      .trim()
      .toLowerCase();

    adrSections.push({
      number,
      title,
      status,
    });
  }

  // Also check Quick Reference section
  const quickRefMatch = content.match(/\*\*Quick Reference\*\*:([\s\S]+?)---/);
  if (quickRefMatch) {
    const quickRefContent = quickRefMatch[1];
    const refRegex = /ADR-(\d+):\s+([^\n\(]+)/g;
    let refMatch;

    while ((refMatch = refRegex.exec(quickRefContent)) !== null) {
      const number = refMatch[1];
      const title = refMatch[2].trim();

      // Only add if not already in sections
      if (!adrSections.find((adr) => adr.number === number)) {
        adrSections.push({
          number,
          title,
          status: 'referenced-only',
        });
      }
    }
  }

  return {
    lastUpdated,
    adrs: adrSections,
  };
}

/**
 * Scan ADR directory for all ADR files
 */
function scanADRDirectory(adrDir) {
  if (!fs.existsSync(adrDir)) {
    throw new Error(`ADR directory not found: ${adrDir}`);
  }

  const files = fs.readdirSync(adrDir);
  const adrFiles = files.filter((f) => /^ADR-\d+.*\.md$/i.test(f));

  return adrFiles.map((filename) => {
    const filePath = path.join(adrDir, filename);
    return parseADRFile(filePath);
  });
}

/**
 * Compare actual ADRs with memory documentation
 */
function validateSync(actualADRs, memoryData) {
  const errors = [];
  const warnings = [];
  const info = [];

  // Check for missing ADRs
  actualADRs.forEach((adr) => {
    const documented = memoryData.adrs.find((m) => m.number === adr.number);
    if (!documented) {
      errors.push({
        type: 'MISSING_ADR',
        adr: adr.number,
        message: `ADR-${adr.number} exists but not documented in memory`,
        details: {
          title: adr.title,
          status: adr.status,
          date: adr.date,
        },
      });
    }
  });

  // Check for phantom ADRs (in memory but not in files)
  memoryData.adrs.forEach((memAdr) => {
    const exists = actualADRs.find((a) => a.number === memAdr.number);
    if (!exists && memAdr.status !== 'referenced-only') {
      warnings.push({
        type: 'PHANTOM_ADR',
        adr: memAdr.number,
        message: `ADR-${memAdr.number} documented in memory but file not found`,
        details: {
          title: memAdr.title,
        },
      });
    }
  });

  // Check status mismatches
  actualADRs.forEach((adr) => {
    const documented = memoryData.adrs.find((m) => m.number === adr.number);
    if (documented && documented.status !== 'referenced-only') {
      // Normalize and compare status
      const actualStatus = adr.status.toLowerCase();
      const memoryStatus = documented.status.toLowerCase();

      if (actualStatus !== memoryStatus && !actualStatus.includes(memoryStatus) && !memoryStatus.includes(actualStatus)) {
        errors.push({
          type: 'STATUS_MISMATCH',
          adr: adr.number,
          message: `Status mismatch for ADR-${adr.number}`,
          details: {
            actual: adr.status,
            memory: documented.status,
            title: adr.title,
          },
        });
      }
    }
  });

  // Check timestamp freshness (warn if >7 days old)
  if (memoryData.lastUpdated) {
    const lastUpdatedDate = new Date(memoryData.lastUpdated);
    const today = new Date();
    const daysSinceUpdate = Math.floor(
      (today - lastUpdatedDate) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceUpdate > 7) {
      warnings.push({
        type: 'STALE_TIMESTAMP',
        message: `Memory file last updated ${daysSinceUpdate} days ago (${memoryData.lastUpdated})`,
        details: {
          lastUpdated: memoryData.lastUpdated,
          daysSinceUpdate,
        },
      });
    } else {
      info.push({
        type: 'FRESH_TIMESTAMP',
        message: `Memory file updated ${daysSinceUpdate} days ago`,
      });
    }
  }

  return { errors, warnings, info };
}

/**
 * Generate report and display results
 */
function generateReport(actualADRs, memoryData, validation) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalADRs: actualADRs.length,
      documentedADRs: memoryData.adrs.filter((a) => a.status !== 'referenced-only').length,
      referencedADRs: memoryData.adrs.filter((a) => a.status === 'referenced-only').length,
      memoryLastUpdated: memoryData.lastUpdated,
      errors: validation.errors.length,
      warnings: validation.warnings.length,
    },
    actualADRs: actualADRs.map((adr) => ({
      number: adr.number,
      title: adr.title,
      status: adr.status,
      date: adr.date,
    })),
    memoryADRs: memoryData.adrs,
    validation: validation,
  };

  // Write JSON report
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));

  // Console output
  console.log('\n📋 ADR Sync Validation Report\n');
  console.log('═'.repeat(70));
  console.log(`📊 Total ADR files: ${report.summary.totalADRs}`);
  console.log(`📝 Documented in memory: ${report.summary.documentedADRs}`);
  console.log(`🔗 Referenced only: ${report.summary.referencedADRs}`);
  console.log(`📅 Memory last updated: ${report.summary.memoryLastUpdated || 'Unknown'}`);
  console.log('═'.repeat(70));

  // Display errors
  if (validation.errors.length > 0) {
    console.log(`\n❌ Errors Found: ${validation.errors.length}\n`);
    validation.errors.forEach((error, idx) => {
      console.log(`${idx + 1}. ${error.message}`);
      if (error.details) {
        Object.entries(error.details).forEach(([key, val]) => {
          console.log(`   ${key}: ${val}`);
        });
      }
      console.log('');
    });
  }

  // Display warnings
  if (validation.warnings.length > 0) {
    console.log(`⚠️  Warnings: ${validation.warnings.length}\n`);
    validation.warnings.forEach((warning, idx) => {
      console.log(`${idx + 1}. ${warning.message}`);
      if (warning.details) {
        Object.entries(warning.details).forEach(([key, val]) => {
          console.log(`   ${key}: ${val}`);
        });
      }
      console.log('');
    });
  }

  // Display info
  if (validation.info.length > 0 && validation.errors.length === 0) {
    console.log('ℹ️  Information:\n');
    validation.info.forEach((info) => {
      console.log(`  - ${info.message}`);
    });
    console.log('');
  }

  console.log('─'.repeat(70));
  console.log(`📄 Full report: ${OUTPUT_FILE}\n`);

  // Summary
  if (validation.errors.length === 0 && validation.warnings.length === 0) {
    console.log('✅ All checks passed! Memory file is in sync.\n');
    return 0;
  } else if (validation.errors.length === 0) {
    console.log('⚠️  Warnings present but no errors. Review recommended.\n');
    return 0;
  } else {
    console.log('❌ Validation failed. Please update memory file.\n');
    return 1;
  }
}

/**
 * Main execution
 */
function main() {
  try {
    console.log('🔍 Starting ADR sync validation...\n');

    // Scan actual ADR files
    const actualADRs = scanADRDirectory(ADR_DIR);
    console.log(`✓ Found ${actualADRs.length} ADR files`);

    // Parse memory file
    const memoryData = parseMemoryFile(MEMORY_FILE);
    console.log(`✓ Memory documents ${memoryData.adrs.length} ADRs`);

    // Validate sync
    const validation = validateSync(actualADRs, memoryData);
    console.log('✓ Validation complete');

    // Generate report
    const exitCode = generateReport(actualADRs, memoryData, validation);
    process.exit(exitCode);
  } catch (error) {
    console.error('\n💥 Critical error during validation:\n');
    console.error(error.message);
    console.error('\n');
    process.exit(2);
  }
}

// Run main function
main();

// Export functions for testing
export {
  parseADRFile,
  parseMemoryFile,
  scanADRDirectory,
  validateSync,
};
