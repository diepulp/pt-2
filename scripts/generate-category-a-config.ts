#!/usr/bin/env npx tsx
/**
 * Category A Config Generator (PRD-034 WS3)
 *
 * Reads the CATEGORY-A-REGISTRY block from ADR-030, extracts the table list,
 * and emits config/rls-category-a-tables.json.
 *
 * Single-authority rule: ADR-030 is the sole source of truth.
 * No table name is hard-coded in this script.
 *
 * Usage: npm run generate:category-a
 *        npx tsx scripts/generate-category-a-config.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const ADR_030_PATH = join(
  __dirname,
  '..',
  'docs',
  '80-adrs',
  'ADR-030-auth-system-hardening.md',
);
const OUTPUT_PATH = join(
  __dirname,
  '..',
  'config',
  'rls-category-a-tables.json',
);

const REGISTRY_START = '<!-- CATEGORY-A-REGISTRY -->';
const REGISTRY_END = '<!-- /CATEGORY-A-REGISTRY -->';

function extractCategoryATables(): string[] {
  let content: string;
  try {
    content = readFileSync(ADR_030_PATH, 'utf-8');
  } catch {
    console.error(`ERROR: Cannot read ADR-030 at ${ADR_030_PATH}`);
    console.error('Ensure the file exists and is accessible.');
    process.exit(1);
  }

  const startIdx = content.indexOf(REGISTRY_START);
  const endIdx = content.indexOf(REGISTRY_END);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    console.error(
      'ERROR: ADR-030 does not contain a valid CATEGORY-A-REGISTRY block.',
    );
    console.error(
      `Expected fenced block between "${REGISTRY_START}" and "${REGISTRY_END}".`,
    );
    console.error(
      'WS5 must add this block to ADR-030 before the generator can produce output.',
    );
    process.exit(1);
  }

  const registryBlock = content.slice(startIdx + REGISTRY_START.length, endIdx);

  // Extract table names from markdown list items or backtick-quoted names
  // Supports: - `table_name`, - table_name, * `table_name`
  const tables: string[] = [];
  const lines = registryBlock.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue;
    }

    // Match list items: - `table_name` or - table_name or * `table_name`
    const listMatch = trimmed.match(/^[-*]\s+`?([a-z_][a-z0-9_]*)`?/);
    if (listMatch) {
      tables.push(listMatch[1]);
      continue;
    }

    // Match bare table names (one per line, no special chars)
    const bareMatch = trimmed.match(/^([a-z_][a-z0-9_]*)$/);
    if (bareMatch) {
      tables.push(bareMatch[1]);
    }
  }

  if (tables.length === 0) {
    console.error(
      'ERROR: CATEGORY-A-REGISTRY block is empty or contains no valid table names.',
    );
    process.exit(1);
  }

  return tables.sort();
}

function main(): void {
  const tables = extractCategoryATables();

  const config = {
    _generated: 'DO NOT EDIT. Run: npm run generate:category-a',
    _source: 'docs/80-adrs/ADR-030-auth-system-hardening.md',
    _extracted_at: new Date().toISOString(),
    categoryA: tables,
  };

  // Ensure config directory exists
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });

  writeFileSync(OUTPUT_PATH, JSON.stringify(config, null, 2) + '\n');
  console.log(
    `Generated ${OUTPUT_PATH} with ${tables.length} Category A tables:`,
  );
  tables.forEach((t) => console.log(`  - ${t}`));
}

main();
