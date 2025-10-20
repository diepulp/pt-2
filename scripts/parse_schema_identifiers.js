#!/usr/bin/env node
/**
 * Schema Identifier Parser (CommonJS)
 *
 * Extracts database tables, views, and enums from types/database.types.ts
 * and produces a machine-readable summary for matrix validation tooling.
 */

const fs = require('fs');
const path = require('path');
const {
  extractTableMetadata,
  extractViewNames,
  extractEnums
} = require('./validate_matrix_schema');

function parseSchemaIdentifiers() {
  const typesPath = path.join(__dirname, '../types/database.types.ts');

  if (!fs.existsSync(typesPath)) {
    throw new Error(`Schema types not found at: ${typesPath}`);
  }

  const content = fs.readFileSync(typesPath, 'utf-8');

  const tables = extractTableMetadata(content);
  const views = extractViewNames(content);
  const enums = extractEnums(content);

  const summary = {
    totalTables: tables.length,
    quotedIdentifiers: tables.filter(table => table.quoted).length,
    snakeCaseIdentifiers: tables.filter(table => !table.quoted).length,
    enums: enums.length,
    views: views.length
  };

  return { tables, enums, views, summary };
}

function writeSummary(result) {
  const outputPath = path.join(
    __dirname,
    '../.validation/schema_identifiers.json'
  );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log('\n✅ Schema Identifier Parser Results\n');
  console.log('━'.repeat(70));
  console.log(`📊 Tables found: ${result.summary.totalTables}`);
  console.log(`   - snake_case: ${result.summary.snakeCaseIdentifiers}`);
  console.log(`   - Quoted identifiers: ${result.summary.quotedIdentifiers}`);
  console.log(`📋 Enums found: ${result.summary.enums}`);
  console.log(`👁  Views found: ${result.summary.views}`);
  console.log('━'.repeat(70));
  console.log(`\n📝 Output written to: ${outputPath}`);

  const sampleTables = result.tables.slice(0, 5);
  if (sampleTables.length) {
    console.log('\nSample tables:');
    sampleTables.forEach(table => {
      const columnLabel =
        typeof table.columns === 'number' ? `${table.columns} columns` : 'columns n/a';
      console.log(
        `  - ${table.name} (${columnLabel})${table.quoted ? ' [QUOTED]' : ''}`
      );
    });

    if (result.tables.length > sampleTables.length) {
      console.log(`  ... and ${result.tables.length - sampleTables.length} more`);
    }
  }
}

if (require.main === module) {
  try {
    const result = parseSchemaIdentifiers();
    writeSummary(result);
  } catch (error) {
    console.error('❌ Schema parsing failed:', error.message);
    process.exit(1);
  }
}

module.exports = {
  parseSchemaIdentifiers
};
