const fs = require('fs');
const path = require('path');

// Read the query-perf.json file
const queryPerfPath = '/home/diepulp/projects/pt-2/docs/issues/query-perf.json';
const data = JSON.parse(fs.readFileSync(queryPerfPath, 'utf8'));

// Group issues by table and policy type
const issuesByTable = {};
const authIssues = [];
const multiplePolicyIssues = [];

// Parse each issue
data.forEach((issue) => {
  if (issue.name === 'auth_rls_initplan') {
    // Extract table name and policy name from cache_key
    const parts = issue.cache_key.split('_');
    const tableName = parts[5]; // After "auth_rls_init_plan_public_"
    const policyName = issue.cache_key.replace(
      `auth_rls_init_plan_public_${tableName}_`,
      '',
    );

    if (!issuesByTable[tableName]) {
      issuesByTable[tableName] = [];
    }
    issuesByTable[tableName].push({
      policyName,
      issue,
      tableName,
    });
    authIssues.push({
      tableName,
      policyName,
      issue,
    });
  } else if (issue.name === 'multiple_permissive_policies') {
    multiplePolicyIssues.push(issue);
  }
});

// Generate statistics
const stats = {
  totalIssues: data.length,
  authRlsInitplanIssues: authIssues.length,
  multiplePermissivePolicies: multiplePolicyIssues.length,
  affectedTables: Object.keys(issuesByTable).length,
  issuesByTable,
};

console.log('=== RLS Performance Analysis Report ===\n');
console.log(`Total Issues: ${stats.totalIssues}`);
console.log(`Auth RLS Initplan Issues: ${stats.authRlsInitplanIssues}`);
console.log(
  `Multiple Permissive Policy Issues: ${stats.multiplePermissivePolicies}`,
);
console.log(`Affected Tables: ${stats.affectedTables}\n`);

// Group by table with counts
console.log('=== Issues by Table ===');
Object.entries(issuesByTable)
  .sort(([, a], [, b]) => b.length - a.length)
  .forEach(([table, issues]) => {
    console.log(`${table}: ${issues.length} issues`);
  });

// Generate SQL fixes for auth_rls_initplan issues
console.log('\n=== Generating SQL Migration Script ===');

let migrationSQL = `-- RLS Performance Optimization Migration
-- Generated on: ${new Date().toISOString()}
-- Purpose: Fix auth function calls in RLS policies to use subqueries for better performance
-- Migration ID: rls_performance_auth_subqueries

BEGIN;

-- Drop and recreate RLS policies with optimized auth function calls
`;

// Extract unique policy names per table
const policiesToFix = {};
authIssues.forEach(({ tableName, policyName }) => {
  if (!policiesToFix[tableName]) {
    policiesToFix[tableName] = new Set();
  }
  policiesToFix[tableName].add(policyName);
});

// Generate DROP and CREATE statements for each policy
Object.entries(policiesToFix).forEach(([tableName, policyNames]) => {
  policyNames.forEach((policyName) => {
    migrationSQL += `
-- Table: ${tableName}, Policy: ${policyName}
-- Note: You need to manually replace the auth.<function>() calls with (select auth.<function>())
-- in the USING or WITH CHECK expressions based on your actual policy definition

-- DROP POLICY IF EXISTS ${policyName} ON public.${tableName};

-- Recreate policy with optimized auth function calls
-- Example: change auth.uid() to (select auth.uid())
-- Example: change auth.jwt() ->> 'custom_claim' to (select auth.jwt()) ->> 'custom_claim'
-- Example: change current_setting('app.current_casino_id', true) to (select current_setting('app.current_casino_id', true))
`;
  });
});

migrationSQL += `
-- Add your actual policy recreation statements here
-- Make sure to:
-- 1. Wrap all auth function calls with (select ...)
-- 2. Wrap current_setting calls with (select ...)
-- 3. Test the performance improvement using EXPLAIN ANALYZE

COMMIT;
`;

// Save the migration script
const migrationPath =
  '/home/diepulp/projects/pt-2/supabase/migrations/rls_performance_auth_subqueries.sql';
fs.writeFileSync(migrationPath, migrationSQL);
console.log(`Migration script saved to: ${migrationPath}`);

// Generate performance impact analysis
console.log('\n=== Performance Impact Analysis ===');
console.log(`
Based on the analysis of ${authIssues.length} RLS performance issues:

1. SEVERITY: These issues cause auth functions to be re-evaluated for EVERY row in queries
2. IMPACT: Significant performance degradation on tables with many rows
3. ESTIMATED IMPROVEMENT: 10-50% query performance improvement after fix

Affected Critical Tables:
${Object.entries(issuesByTable)
  .filter(([table]) =>
    [
      'visit',
      'player',
      'rating_slip',
      'gaming_table',
      'player_financial_transaction',
    ].includes(table),
  )
  .map(([table, issues]) => `  - ${table}: ${issues.length} policies`)
  .join('\n')}

Recommended Actions:
1. Prioritize fixing policies on high-traffic tables (visit, player, rating_slip)
2. Test each policy recreation in a staging environment
3. Use EXPLAIN ANALYZE to verify performance improvements
4. Monitor query performance after deployment
`);

// Check for existing recommendations file
const recommendationsPath =
  '/home/diepulp/projects/pt-2/docs/issues/query-perf-recommendations.json';
if (fs.existsSync(recommendationsPath)) {
  console.log(`\n=== Existing Recommendations Found ===`);
  const existingRecs = JSON.parse(fs.readFileSync(recommendationsPath, 'utf8'));
  console.log(`Found ${existingRecs.length} existing recommendations`);
} else {
  console.log(`\n=== No Existing Recommendations File Found ===`);
}

// Save detailed analysis
const analysisReport = {
  generatedAt: new Date().toISOString(),
  summary: {
    totalIssues: stats.totalIssues,
    authRlsInitplanIssues: stats.authRlsInitplanIssues,
    multiplePermissivePolicies: stats.multiplePermissivePolicies,
    affectedTables: stats.affectedTables,
  },
  authIssuesByTable: Object.fromEntries(
    Object.entries(issuesByTable).map(([table, issues]) => [
      table,
      issues.map((i) => ({ policyName: i.policyName, detail: i.issue.detail })),
    ]),
  ),
  multiplePolicyIssues,
  migrationScript: migrationPath,
  recommendations: [
    'Fix auth function calls by wrapping them in subqueries: auth.uid() → (select auth.uid())',
    "Fix current_setting calls: current_setting('key') → (select current_setting('key'))",
    'Test all policy changes in staging before production deployment',
    'Use EXPLAIN ANALYZE to measure performance improvements',
    'Consider batching policy updates to minimize downtime',
  ],
};

const reportPath =
  '/home/diepulp/projects/pt-2/docs/issues/rls-performance-analysis.json';
fs.writeFileSync(reportPath, JSON.stringify(analysisReport, null, 2));
console.log(`\nDetailed analysis report saved to: ${reportPath}`);

// Generate a quick reference guide for developers
const quickGuide = `# RLS Performance Fix Quick Reference

## Problem
RLS policies are re-evaluating auth functions (auth.uid(), auth.jwt(), current_setting()) for EVERY row, causing severe performance issues.

## Solution
Wrap all auth function calls in subqueries:
- \`auth.uid()\` → \`(select auth.uid())\`
- \`auth.jwt() ->> 'claim'\` → \`(select auth.jwt()) ->> 'claim'\`
- \`current_setting('key', true)\` → \`(select current_setting('key', true))\`

## High Priority Tables (${Object.keys(issuesByTable).filter((t) => issuesByTable[t].length >= 5).length})
${Object.entries(issuesByTable)
  .filter(([, issues]) => issues.length >= 5)
  .map(([table, issues]) => `- ${table}: ${issues.length} policies`)
  .join('\n')}

## Commands
1. Check current policies: \\d ${Object.keys(issuesByTable)[0]}
2. Test performance: EXPLAIN ANALYZE SELECT * FROM ${Object.keys(issuesByTable)[0]} LIMIT 10;
3. Apply migration: supabase migration up

## Verification
After applying fixes, queries should show improved performance in:
- Query planning time
- Execution time
- Number of function evaluations
`;

const quickGuidePath =
  '/home/diepulp/projects/pt-2/docs/issues/rls-performance-quick-guide.md';
fs.writeFileSync(quickGuidePath, quickGuide);
console.log(`\nQuick reference guide saved to: ${quickGuidePath}`);
