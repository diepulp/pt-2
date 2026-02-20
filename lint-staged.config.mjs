// ==============================================================================
// lint-staged Configuration
// ==============================================================================
// Version: 2.1.0
// Date: 2025-12-11
//
// Scope: Production code only (app, components, hooks, lib, services, utils)
// Excludes: Agent configs, skills, memory files, generated files, docs
//
// Note: RLS/ADR-015 pattern checks run BEFORE lint-staged in:
//   - .husky/pre-commit-migration-safety.sh (SQL migrations)
//   - .husky/pre-commit-service-check.sh (TypeScript services)
//   - .husky/pre-commit-api-sanity.sh (API routes)
//
// References:
//   - ADR-015: RLS Connection Pooling Strategy
//   - SEC-001: Casino-Scoped RLS Policy Matrix
// ==============================================================================

export default {
  // TypeScript/JavaScript production code only
  '**/*.{ts,tsx,js,jsx}': (filenames) => {
    // Patterns to EXCLUDE from linting (non-production code)
    const ignoredPatterns = [
      // Test files (linted separately in CI)
      '__tests__/',
      '*.test.ts',
      '*.test.tsx',
      '*.spec.ts',
      '*.spec.tsx',
      'jest.config.js',
      'jest.setup.js',
      'cypress.config.ts',
      'cypress/',

      // Generated files
      'types/database.types.ts',
      'types/remote/',

      // Agent/skill infrastructure (not production code)
      '.claude/',
      'memory/',

      // ESLint rule files (plugins, not production code)
      '.eslint-rules/',

      // Documentation
      'docs/',

      // Database migrations (SQL, not TS)
      'supabase/migrations/',

      // Generated UI components
      'components/landing-page/ui/',

      // Config files
      'package.json',
      'package-lock.json',
      'tsconfig.json',
    ];

    const filteredFiles = filenames.filter(
      (file) => !ignoredPatterns.some((pattern) => file.includes(pattern)),
    );

    if (filteredFiles.length === 0) return [];

    return [
      // ESLint with:
      // --no-warn-ignored: suppress "file ignored" warnings
      // --max-warnings=-1: don't fail on warnings (only fail on errors)
      `eslint --fix --no-warn-ignored --max-warnings=-1 ${filteredFiles.join(' ')}`,
      `prettier --write ${filteredFiles.join(' ')}`,
    ];
  },

  // Test files - prettier only (ESLint runs separately in CI)
  '**/*.{test,spec}.{ts,tsx}': (filenames) => {
    const filteredFiles = filenames.filter(
      (file) =>
        !file.includes('.claude/') &&
        !file.includes('node_modules/') &&
        !file.includes('cypress/'),
    );

    if (filteredFiles.length === 0) return [];

    return [`prettier --write ${filteredFiles.join(' ')}`];
  },

  // JSON files - prettier only (no ESLint)
  '**/*.json': (filenames) => {
    const ignoredPatterns = [
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      '.claude/',
      'node_modules/',
    ];

    const filteredFiles = filenames.filter(
      (file) => !ignoredPatterns.some((pattern) => file.includes(pattern)),
    );

    if (filteredFiles.length === 0) return [];

    return [`prettier --write ${filteredFiles.join(' ')}`];
  },
};
