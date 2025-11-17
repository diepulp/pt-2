#!/usr/bin/env tsx
/**
 * SRM Line Reference Updater
 *
 * Purpose: Find and update references to SRM line numbers throughout the codebase.
 * This is critical when compressing the SRM to ensure all internal cross-references
 * remain valid.
 *
 * Features:
 * - Finds all SRM:\d+ patterns in documentation and code
 * - Supports report mode (find references without updating)
 * - Supports update mode (applies line number mapping)
 * - Validates references against current SRM content
 * - Reports broken references and provides context
 *
 * Usage:
 *   # Report mode: Find all references
 *   npm run update:srm-refs -- --report
 *
 *   # Update mode: Apply mapping from JSON file
 *   npm run update:srm-refs -- --mapping line-mapping.json
 *
 *   # Dry run: Show what would be changed without writing
 *   npm run update:srm-refs -- --mapping line-mapping.json --dry-run
 *
 * Line Mapping Format (JSON):
 *   {
 *     "49": 49,     // Line 49 stays at 49
 *     "318": 61,    // Line 318 moves to 61
 *     "405": null   // Line 405 removed (will be flagged)
 *   }
 *
 * @author PT-2 DevOps Team
 * @since 2025-11-17
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, relative } from 'path';

/** Configuration for the line reference updater */
interface UpdaterConfig {
  /** Project root directory */
  projectRoot: string;
  /** Path to the SRM file */
  srmPath: string;
  /** Directories to search for references */
  searchDirs: string[];
  /** File extensions to search */
  searchExtensions: string[];
  /** Whether to run in verbose mode */
  verbose: boolean;
  /** Whether to run in dry-run mode (no file writes) */
  dryRun: boolean;
  /** Line number mapping (old -> new) */
  lineMapping?: Record<string, number | null>;
}

/** Represents a line reference found in the codebase */
interface LineReference {
  /** The file containing the reference */
  filePath: string;
  /** Line number in the file where reference was found */
  lineNumber: number;
  /** The original matched text (e.g., "SRM:405-589") */
  matchText: string;
  /** Start line number referenced */
  startLine: number;
  /** End line number referenced (if range) */
  endLine?: number;
  /** Context around the reference */
  context: string;
  /** Full line content */
  fullLine: string;
}

/** Result of checking/updating a reference */
interface ReferenceResult {
  reference: LineReference;
  valid: boolean;
  newMatchText?: string;
  issue?: string;
}

/** Summary of the update operation */
interface UpdateSummary {
  totalReferences: number;
  validReferences: number;
  updatedReferences: number;
  removedReferences: number;
  filesScanned: number;
  filesModified: number;
  results: ReferenceResult[];
}

/**
 * Recursively find all files matching the given extensions
 *
 * @param dir - Directory to search
 * @param extensions - File extensions to match
 * @returns Array of absolute file paths
 */
function findFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules, .git, etc.
      if (!entry.startsWith('.') && entry !== 'node_modules' && entry !== 'dist') {
        files.push(...findFiles(fullPath, extensions));
      }
    } else if (stat.isFile()) {
      const hasMatchingExt = extensions.some(ext => fullPath.endsWith(ext));
      if (hasMatchingExt) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Extract line references from file content
 *
 * Matches patterns like:
 * - SRM:405
 * - SRM:405-589
 * - SRM:49-318
 *
 * @param content - File content
 * @param filePath - Path to the file (for reference)
 * @returns Array of line references
 */
function extractLineReferences(content: string, filePath: string): LineReference[] {
  const references: LineReference[] = [];
  const lines = content.split('\n');

  // Pattern: SRM:(\d+)(?:-(\d+))?
  // Captures: SRM:405 or SRM:405-589
  const lineRefPattern = /SRM:(\d+)(?:-(\d+))?/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    let match: RegExpExecArray | null;
    const matches: RegExpExecArray[] = [];

    // Reset lastIndex for global regex
    lineRefPattern.lastIndex = 0;

    while ((match = lineRefPattern.exec(line)) !== null) {
      matches.push([...match] as RegExpExecArray);
    }

    for (const m of matches) {
      const startLine = parseInt(m[1], 10);
      const endLine = m[2] ? parseInt(m[2], 10) : undefined;

      // Get context (3 lines before and after)
      const contextStart = Math.max(0, i - 3);
      const contextEnd = Math.min(lines.length - 1, i + 3);
      const context = lines.slice(contextStart, contextEnd + 1).join('\n');

      references.push({
        filePath,
        lineNumber,
        matchText: m[0],
        startLine,
        endLine,
        context,
        fullLine: line,
      });
    }
  }

  return references;
}

/**
 * Validate a line reference against the SRM content
 *
 * @param reference - The line reference to validate
 * @param srmLineCount - Total number of lines in SRM
 * @returns Whether the reference is valid
 */
function validateReference(
  reference: LineReference,
  srmLineCount: number
): boolean {
  if (reference.startLine < 1 || reference.startLine > srmLineCount) {
    return false;
  }

  if (reference.endLine) {
    if (reference.endLine < reference.startLine) {
      return false;
    }
    if (reference.endLine > srmLineCount) {
      return false;
    }
  }

  return true;
}

/**
 * Apply line mapping to a reference
 *
 * @param reference - The reference to update
 * @param mapping - Line number mapping (old -> new)
 * @returns Result with new match text or issue
 */
function applyMapping(
  reference: LineReference,
  mapping: Record<string, number | null>
): ReferenceResult {
  const { startLine, endLine, matchText } = reference;

  // Check if exact match exists in mapping
  const exactKey = endLine ? `${startLine}-${endLine}` : `${startLine}`;
  if (exactKey in mapping) {
    const newValue = mapping[exactKey];
    if (newValue === null) {
      return {
        reference,
        valid: false,
        issue: 'Reference targets removed section (mapped to null)',
      };
    }

    // For range mappings, newValue could be a range
    const newMatchText = `SRM:${newValue}`;
    return {
      reference,
      valid: true,
      newMatchText,
    };
  }

  // Try mapping individual lines
  const newStart = mapping[startLine.toString()];
  const newEnd = endLine ? mapping[endLine.toString()] : undefined;

  // Check if either line was removed
  if (newStart === null) {
    return {
      reference,
      valid: false,
      issue: `Start line ${startLine} removed from SRM`,
    };
  }

  if (newEnd === null && endLine) {
    return {
      reference,
      valid: false,
      issue: `End line ${endLine} removed from SRM`,
    };
  }

  // If no mapping found, reference stays the same
  if (newStart === undefined && (endLine === undefined || newEnd === undefined)) {
    return {
      reference,
      valid: true,
      // No change needed
    };
  }

  // Build new reference
  const mappedStart = newStart ?? startLine;
  const mappedEnd = newEnd ?? endLine;

  let newMatchText: string;
  if (mappedEnd) {
    newMatchText = `SRM:${mappedStart}-${mappedEnd}`;
  } else {
    newMatchText = `SRM:${mappedStart}`;
  }

  return {
    reference,
    valid: true,
    newMatchText,
  };
}

/**
 * Update file with new line references
 *
 * @param filePath - Path to file to update
 * @param results - Results with new match texts
 * @param dryRun - If true, don't actually write files
 * @returns Number of references updated
 */
function updateFile(
  filePath: string,
  results: ReferenceResult[],
  dryRun: boolean
): number {
  const content = readFileSync(filePath, 'utf-8');
  let updatedContent = content;
  let updateCount = 0;

  // Sort results by line number (descending) to avoid offset issues
  const sortedResults = [...results].sort(
    (a, b) => b.reference.lineNumber - a.reference.lineNumber
  );

  for (const result of sortedResults) {
    if (result.newMatchText && result.newMatchText !== result.reference.matchText) {
      // Replace the old reference with new one
      // Use line-based replacement for precision
      const lines = updatedContent.split('\n');
      const lineIdx = result.reference.lineNumber - 1;

      if (lineIdx >= 0 && lineIdx < lines.length) {
        lines[lineIdx] = lines[lineIdx].replace(
          result.reference.matchText,
          result.newMatchText
        );
        updatedContent = lines.join('\n');
        updateCount++;
      }
    }
  }

  if (updateCount > 0 && !dryRun) {
    writeFileSync(filePath, updatedContent, 'utf-8');
  }

  return updateCount;
}

/**
 * Run the line reference updater
 *
 * @param config - Updater configuration
 * @returns Update summary
 */
function runUpdater(config: UpdaterConfig): UpdateSummary {
  const { projectRoot, srmPath, searchDirs, searchExtensions, verbose, lineMapping } = config;

  // Read SRM to get line count
  const absoluteSrmPath = resolve(projectRoot, srmPath);
  if (!existsSync(absoluteSrmPath)) {
    console.error(`Error: SRM file not found at ${absoluteSrmPath}`);
    process.exit(1);
  }

  const srmContent = readFileSync(absoluteSrmPath, 'utf-8');
  const srmLineCount = srmContent.split('\n').length;

  if (verbose) {
    console.log(`SRM has ${srmLineCount} lines`);
  }

  // Find all files to scan
  const allFiles: string[] = [];
  for (const dir of searchDirs) {
    const absoluteDir = resolve(projectRoot, dir);
    const files = findFiles(absoluteDir, searchExtensions);
    allFiles.push(...files);
  }

  if (verbose) {
    console.log(`Scanning ${allFiles.length} files...\n`);
  }

  // Extract references from all files
  const allReferences: LineReference[] = [];
  for (const file of allFiles) {
    const content = readFileSync(file, 'utf-8');
    const refs = extractLineReferences(content, file);
    allReferences.push(...refs);
  }

  if (verbose) {
    console.log(`Found ${allReferences.length} line references\n`);
  }

  // Process references
  const results: ReferenceResult[] = [];

  if (lineMapping) {
    // Update mode: apply mapping
    for (const ref of allReferences) {
      const result = applyMapping(ref, lineMapping);
      results.push(result);
    }
  } else {
    // Report mode: just validate
    for (const ref of allReferences) {
      const valid = validateReference(ref, srmLineCount);
      results.push({
        reference: ref,
        valid,
        issue: valid ? undefined : 'Line reference out of range',
      });
    }
  }

  // Calculate summary
  const validReferences = results.filter(r => r.valid).length;
  const updatedReferences = results.filter(
    r => r.newMatchText && r.newMatchText !== r.reference.matchText
  ).length;
  const removedReferences = results.filter(r => !r.valid).length;

  // Apply updates if in update mode
  let filesModified = 0;
  if (lineMapping && !config.dryRun) {
    // Group results by file
    const resultsByFile = new Map<string, ReferenceResult[]>();
    for (const result of results) {
      const filePath = result.reference.filePath;
      if (!resultsByFile.has(filePath)) {
        resultsByFile.set(filePath, []);
      }
      resultsByFile.get(filePath)!.push(result);
    }

    // Update each file
    for (const [filePath, fileResults] of resultsByFile) {
      const updateCount = updateFile(filePath, fileResults, config.dryRun);
      if (updateCount > 0) {
        filesModified++;
        if (verbose) {
          const relPath = relative(projectRoot, filePath);
          console.log(`Updated ${updateCount} reference(s) in ${relPath}`);
        }
      }
    }
  }

  return {
    totalReferences: allReferences.length,
    validReferences,
    updatedReferences,
    removedReferences,
    filesScanned: allFiles.length,
    filesModified,
    results,
  };
}

/**
 * Print summary report
 *
 * @param summary - Update summary
 * @param config - Updater configuration
 */
function printReport(summary: UpdateSummary, config: UpdaterConfig): void {
  const { totalReferences, validReferences, updatedReferences, removedReferences, filesScanned, filesModified, results } = summary;
  const { lineMapping, verbose, dryRun, projectRoot } = config;

  console.log('='.repeat(80));
  console.log('SRM Line Reference Report');
  console.log('='.repeat(80));
  console.log();

  console.log(`Files scanned: ${filesScanned}`);
  console.log(`Total references: ${totalReferences}`);
  console.log(`Valid references: ${validReferences}`);

  if (lineMapping) {
    console.log(`References to update: ${updatedReferences}`);
    console.log(`References removed: ${removedReferences}`);
    console.log(`Files modified: ${filesModified}`);
    if (dryRun) {
      console.log('\n⚠️  DRY RUN MODE - No files were actually modified\n');
    }
  }

  console.log();

  // Show invalid/removed references
  const issues = results.filter(r => !r.valid || r.issue);
  if (issues.length > 0) {
    console.log('Issues Found:');
    console.log('-'.repeat(80));
    for (const issue of issues) {
      const relPath = relative(projectRoot, issue.reference.filePath);
      console.log(`\x1b[31m✗\x1b[0m ${relPath}:${issue.reference.lineNumber}`);
      console.log(`  Reference: ${issue.reference.matchText}`);
      console.log(`  Issue: ${issue.issue || 'Invalid reference'}`);
      if (verbose) {
        console.log(`  Context:\n${issue.reference.context}`);
      }
      console.log();
    }
  }

  // Show references that will be updated
  if (lineMapping && updatedReferences > 0) {
    console.log('References to Update:');
    console.log('-'.repeat(80));

    const updates = results.filter(
      r => r.newMatchText && r.newMatchText !== r.reference.matchText
    );

    if (!verbose && updates.length > 10) {
      console.log(`Showing first 10 of ${updates.length} updates...\n`);
    }

    const displayUpdates = verbose ? updates : updates.slice(0, 10);

    for (const update of displayUpdates) {
      const relPath = relative(projectRoot, update.reference.filePath);
      console.log(`\x1b[33m→\x1b[0m ${relPath}:${update.reference.lineNumber}`);
      console.log(`  ${update.reference.matchText} → ${update.newMatchText}`);
      if (verbose) {
        console.log(`  Line: ${update.reference.fullLine.trim()}`);
      }
      console.log();
    }

    if (!verbose && updates.length > 10) {
      console.log(`... and ${updates.length - 10} more. Use --verbose to see all.\n`);
    }
  }

  console.log('='.repeat(80));

  if (removedReferences > 0) {
    console.log(`\x1b[31m⚠️  WARNING: ${removedReferences} reference(s) target removed sections\x1b[0m`);
  } else if (lineMapping && updatedReferences > 0) {
    if (dryRun) {
      console.log(`\x1b[33m✓ Dry run complete - ${updatedReferences} reference(s) would be updated\x1b[0m`);
    } else {
      console.log(`\x1b[32m✓ Successfully updated ${updatedReferences} reference(s) in ${filesModified} file(s)\x1b[0m`);
    }
  } else if (lineMapping) {
    console.log('\x1b[32m✓ No updates needed - all references are current\x1b[0m');
  } else {
    console.log('\x1b[32m✓ All references are valid\x1b[0m');
  }

  console.log('='.repeat(80));
}

/**
 * Main entry point
 */
function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const dryRun = args.includes('--dry-run');
  const help = args.includes('--help') || args.includes('-h');
  const report = args.includes('--report') || args.includes('-r');

  if (help) {
    console.log(`
SRM Line Reference Updater

Purpose: Find and update references to SRM line numbers (SRM:123 or SRM:123-456)
throughout the codebase. Essential for maintaining reference integrity after
SRM compression.

Usage:
  # Report mode: Find all references without updating
  tsx scripts/update-srm-line-refs.ts --report

  # Update mode: Apply line mapping from JSON file
  tsx scripts/update-srm-line-refs.ts --mapping line-mapping.json

  # Dry run: Show what would change without writing files
  tsx scripts/update-srm-line-refs.ts --mapping line-mapping.json --dry-run

Options:
  --report, -r         Report mode (find references, don't update)
  --mapping FILE       Path to line mapping JSON file
  --dry-run            Show changes without writing files
  --verbose, -v        Show detailed output
  --help, -h           Show this help message

Line Mapping Format (JSON):
  {
    "49": 49,          // Line 49 stays at 49
    "318": 61,         // Line 318 moves to 61
    "405-589": 62,     // Range 405-589 becomes single line 62
    "590": null        // Line 590 removed (will be flagged)
  }

Exit codes:
  0 - Success (no issues or all references updated)
  1 - Error occurred or references target removed sections
    `);
    process.exit(0);
  }

  // Parse mapping file if provided
  let lineMapping: Record<string, number | null> | undefined;
  const mappingIdx = args.findIndex(arg => arg === '--mapping');
  if (mappingIdx !== -1 && args[mappingIdx + 1]) {
    const mappingFile = args[mappingIdx + 1];
    const absoluteMappingPath = resolve(process.cwd(), mappingFile);

    if (!existsSync(absoluteMappingPath)) {
      console.error(`Error: Mapping file not found at ${absoluteMappingPath}`);
      process.exit(1);
    }

    try {
      const mappingContent = readFileSync(absoluteMappingPath, 'utf-8');
      lineMapping = JSON.parse(mappingContent);
      console.log(`Loaded line mapping from ${mappingFile}\n`);
    } catch (error) {
      console.error(`Error parsing mapping file:`, error);
      process.exit(1);
    }
  } else if (!report) {
    console.error('Error: Must provide --report or --mapping option');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  // Determine project root
  const projectRoot = resolve(__dirname, '..');

  const config: UpdaterConfig = {
    projectRoot,
    srmPath: 'docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md',
    searchDirs: ['docs', 'services', 'src'],
    searchExtensions: ['.md', '.ts', '.tsx', '.js', '.jsx'],
    verbose,
    dryRun,
    lineMapping,
  };

  try {
    const summary = runUpdater(config);
    printReport(summary, config);

    // Exit with error if references target removed sections
    if (summary.removedReferences > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Error running updater:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for testing
export {
  extractLineReferences,
  validateReference,
  applyMapping,
  updateFile,
  runUpdater,
  type UpdaterConfig,
  type LineReference,
  type ReferenceResult,
  type UpdateSummary,
};
