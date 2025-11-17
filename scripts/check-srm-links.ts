#!/usr/bin/env tsx
/**
 * SRM Link Checker
 *
 * Purpose: Validate all documentation links in the Service Responsibility Matrix
 * and ensure they point to existing files.
 *
 * Features:
 * - Parses markdown and YAML front matter for document references
 * - Validates both inline backtick paths and markdown links
 * - Reports broken links with line numbers
 * - Supports running from project root
 * - Exit code 1 if any links are broken
 *
 * Usage:
 *   npm run check:srm-links
 *   node --loader tsx scripts/check-srm-links.ts
 *   tsx scripts/check-srm-links.ts
 *
 * @author PT-2 DevOps Team
 * @since 2025-11-17
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

/** Configuration for the link checker */
interface CheckerConfig {
  /** Path to the SRM file relative to project root */
  srmPath: string;
  /** Project root directory */
  projectRoot: string;
  /** Whether to include verbose output */
  verbose: boolean;
}

/** Represents a document reference found in the SRM */
interface DocumentReference {
  /** The file path referenced */
  path: string;
  /** Line number where the reference was found */
  lineNumber: number;
  /** The type of reference (backtick, markdown link, yaml) */
  type: 'backtick' | 'markdown' | 'yaml';
  /** The original text containing the reference */
  context: string;
}

/** Result of checking a single reference */
interface CheckResult {
  reference: DocumentReference;
  exists: boolean;
  absolutePath: string;
}

/** Summary of the link check operation */
interface CheckSummary {
  totalReferences: number;
  validReferences: number;
  brokenReferences: number;
  results: CheckResult[];
}

/**
 * Extract document references from SRM content
 *
 * Looks for:
 * 1. YAML front matter references (source_of_truth)
 * 2. Inline backtick paths: `docs/path/to/file.md`
 * 3. Markdown links: [text](docs/path/to/file.md)
 *
 * @param content - The SRM file content
 * @returns Array of document references with line numbers
 */
function extractReferences(content: string): DocumentReference[] {
  const references: DocumentReference[] = [];
  const lines = content.split('\n');

  // Pattern 1: Backtick-wrapped paths (most common in SRM)
  // Matches: `docs/path/to/file.md`
  const backtickPattern = /`(docs\/[^`]+\.md[^`]*)`/g;

  // Pattern 2: Markdown links
  // Matches: [text](docs/path/to/file.md) or [text](docs/path/to/file.md#anchor)
  const markdownLinkPattern = /\[([^\]]+)\]\((docs\/[^)]+\.md[^)]*)\)/g;

  // Pattern 3: YAML front matter paths
  const yamlPathPattern = /^\s*-\s+(docs\/[^\s]+\.md)/;

  let inYamlFrontMatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Track YAML front matter
    if (line.trim() === '---') {
      inYamlFrontMatter = !inYamlFrontMatter;
      continue;
    }

    // Check YAML paths
    if (inYamlFrontMatter) {
      const yamlMatch = line.match(yamlPathPattern);
      if (yamlMatch) {
        references.push({
          path: yamlMatch[1],
          lineNumber,
          type: 'yaml',
          context: line.trim(),
        });
      }
      continue;
    }

    // Check backtick paths
    let match: RegExpExecArray | null;
    const backtickMatches: RegExpExecArray[] = [];
    while ((match = backtickPattern.exec(line)) !== null) {
      backtickMatches.push(match);
    }

    for (const m of backtickMatches) {
      // Remove anchor fragments and query strings
      const cleanPath = m[1].split('#')[0].split('?')[0];
      references.push({
        path: cleanPath,
        lineNumber,
        type: 'backtick',
        context: line.trim().substring(0, 100), // Limit context length
      });
    }

    // Check markdown links
    const markdownMatches: RegExpExecArray[] = [];
    while ((match = markdownLinkPattern.exec(line)) !== null) {
      markdownMatches.push(match);
    }

    for (const m of markdownMatches) {
      // Remove anchor fragments and query strings
      const cleanPath = m[2].split('#')[0].split('?')[0];
      references.push({
        path: cleanPath,
        lineNumber,
        type: 'markdown',
        context: line.trim().substring(0, 100),
      });
    }
  }

  return references;
}

/**
 * Check if a referenced file exists
 *
 * @param reference - The document reference to check
 * @param projectRoot - The project root directory
 * @returns Check result with existence status and absolute path
 */
function checkReference(
  reference: DocumentReference,
  projectRoot: string
): CheckResult {
  const absolutePath = resolve(projectRoot, reference.path);
  const exists = existsSync(absolutePath);

  return {
    reference,
    exists,
    absolutePath,
  };
}

/**
 * Format a check result for console output
 *
 * @param result - The check result to format
 * @param useColor - Whether to use ANSI color codes
 * @returns Formatted string for console output
 */
function formatResult(result: CheckResult, useColor = true): string {
  const { reference, exists, absolutePath } = result;

  const status = exists
    ? useColor
      ? '\x1b[32m✓\x1b[0m'
      : '✓'
    : useColor
      ? '\x1b[31m✗\x1b[0m'
      : '✗';

  const line = `Line ${reference.lineNumber}`.padEnd(12);
  const type = `[${reference.type}]`.padEnd(12);

  return `${status} ${line} ${type} ${reference.path}`;
}

/**
 * Run the link checker
 *
 * @param config - Checker configuration
 * @returns Check summary with all results
 */
function runChecker(config: CheckerConfig): CheckSummary {
  const { srmPath, projectRoot, verbose } = config;

  const absoluteSrmPath = resolve(projectRoot, srmPath);

  if (!existsSync(absoluteSrmPath)) {
    console.error(`Error: SRM file not found at ${absoluteSrmPath}`);
    process.exit(1);
  }

  if (verbose) {
    console.log(`Reading SRM from: ${absoluteSrmPath}`);
  }

  const content = readFileSync(absoluteSrmPath, 'utf-8');
  const references = extractReferences(content);

  if (verbose) {
    console.log(`Found ${references.length} document references\n`);
  }

  const results = references.map((ref) => checkReference(ref, projectRoot));

  const validReferences = results.filter((r) => r.exists).length;
  const brokenReferences = results.filter((r) => !r.exists).length;

  return {
    totalReferences: references.length,
    validReferences,
    brokenReferences,
    results,
  };
}

/**
 * Print summary report
 *
 * @param summary - Check summary to report
 * @param verbose - Whether to show all results or just broken links
 */
function printReport(summary: CheckSummary, verbose: boolean): void {
  const { totalReferences, validReferences, brokenReferences, results } =
    summary;

  console.log('='.repeat(80));
  console.log('SRM Link Check Report');
  console.log('='.repeat(80));
  console.log();

  if (verbose) {
    console.log('All References:');
    console.log('-'.repeat(80));
    results.forEach((result) => {
      console.log(formatResult(result));
    });
    console.log();
  }

  if (brokenReferences > 0) {
    console.log('Broken Links:');
    console.log('-'.repeat(80));
    results
      .filter((r) => !r.exists)
      .forEach((result) => {
        console.log(formatResult(result));
        if (verbose) {
          console.log(`  Context: ${result.reference.context}`);
          console.log(`  Expected: ${result.absolutePath}`);
          console.log();
        }
      });
    console.log();
  }

  console.log('Summary:');
  console.log('-'.repeat(80));
  console.log(`Total references: ${totalReferences}`);
  console.log(`Valid references: ${validReferences}`);
  console.log(`Broken references: ${brokenReferences}`);
  console.log();

  if (brokenReferences > 0) {
    console.log(
      '\x1b[31m✗ Link check FAILED\x1b[0m - Found broken references'
    );
  } else {
    console.log('\x1b[32m✓ Link check PASSED\x1b[0m - All references valid');
  }
  console.log('='.repeat(80));
}

/**
 * Main entry point
 */
function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    console.log(`
SRM Link Checker

Usage:
  tsx scripts/check-srm-links.ts [options]

Options:
  --verbose, -v    Show all references, not just broken ones
  --help, -h       Show this help message

Exit codes:
  0 - All links valid
  1 - Broken links found or error occurred
    `);
    process.exit(0);
  }

  // Determine project root (assumes script is in scripts/ directory)
  const projectRoot = resolve(__dirname, '..');

  const config: CheckerConfig = {
    srmPath: 'docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md',
    projectRoot,
    verbose,
  };

  try {
    const summary = runChecker(config);
    printReport(summary, verbose);

    // Exit with non-zero code if any links are broken
    if (summary.brokenReferences > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Error running link checker:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for testing
export {
  extractReferences,
  checkReference,
  runChecker,
  type CheckerConfig,
  type DocumentReference,
  type CheckResult,
  type CheckSummary,
};
