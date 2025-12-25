import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { FlatCompat } from '@eslint/eslintrc';

import dtoColumnAllowlist from './.eslint-rules/dto-column-allowlist.js';
import noCrossContextDbImports from './.eslint-rules/no-cross-context-db-imports.js';
import noDtoTypeAssertions from './.eslint-rules/no-dto-type-assertions.js';
import noHeaderCasinoContext from './.eslint-rules/no-header-casino-context.js';
import noManualDTOInterfaces from './.eslint-rules/no-manual-dto-interfaces.js';
import noReturnTypeInference from './.eslint-rules/no-return-type-inference.js';
import noServiceResultReturn from './.eslint-rules/no-service-result-return.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      'node_modules/**',
      'trees/**', // Git worktrees - each has own node_modules, lint separately
      '.venv/**',
      'dist/**',
      '.next/**',
      'coverage/**',
      '.swc/**',
      '.qodo/**',
      '.cursor/**',
      '.backup/**', // Old backup files, not production code
      'types/database.types.ts', // Generated file, exclude from linting
      'types/remote/**', // Remote generated types
      'next-env.d.ts', // Next.js generated type declarations
      'cypress/**/*.{js,ts}', // Exclude Cypress files from main config
      'scripts/**', // Utility scripts are executed via node without linting
      '.eslint-rules/**', // ESLint plugin files (not production code)
      '.claude/**', // Agent configs, skills, commands (not production code)
      'memory/**', // Memory files (not production code)
      'components/landing-page/ui/**', // shadcn/ui generated components
      'components/landing-page/theme-provider.tsx', // next-themes wrapper
    ],
  },
  // Service layer specific configuration - PRD §3.3 Service Layer Standards
  // Excludes test files which have their own relaxed rules below
  {
    files: ['services/**/*.ts', 'services/**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.integration.test.ts', '**/*.spec.ts'],
    plugins: {
      'custom-rules': {
        rules: {
          'no-return-type-inference': noReturnTypeInference,
          'no-manual-dto-interfaces': noManualDTOInterfaces,
          'no-cross-context-db-imports': noCrossContextDbImports,
          'dto-column-allowlist': dtoColumnAllowlist,
          'no-dto-type-assertions': noDtoTypeAssertions,
          'no-service-result-return': noServiceResultReturn,
        },
      },
    },
    rules: {
      // Enable custom rule for ReturnType detection
      'custom-rules/no-return-type-inference': 'error',
      // Enable custom rule for manual DTO prevention (SRM canonical standard)
      'custom-rules/no-manual-dto-interfaces': 'error',
      // Enable bounded context enforcement (SRM:28-295)
      'custom-rules/no-cross-context-db-imports': 'error',
      // Enable column allowlist for sensitive tables (SRM:217-238)
      'custom-rules/dto-column-allowlist': 'error',
      // V1 FIX: Prevent DTO type assertions - use type guards (WORKFLOW-PRD-002)
      'custom-rules/no-dto-type-assertions': 'error',
      // V2 FIX: ADR-012 compliance - services throw, don't return ServiceResult
      'custom-rules/no-service-result-return': 'error',
      // Require explicit return types for service factories
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: false,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: false,
        },
      ],

      // Ban ReturnType inference patterns (PRD §3.3: Ban ReturnType<typeof createXService>)
      // NOTE: DTO interface checks moved to custom-rules/no-manual-dto-interfaces.js
      // which supports RPC response exceptions via JSDoc annotations
      'no-restricted-syntax': [
        'error',
        {
          // Simpler pattern: catch any type alias with ReturnType in services
          selector:
            'ExportNamedDeclaration > TSTypeAliasDeclaration > TSTypeReference[typeName.name="ReturnType"]',
          message:
            'ANTI-PATTERN: ReturnType<typeof ...> is banned in service exports (PRD §3.3). Define explicit interface: export interface XService { methodName(): ReturnType }',
        },
      ],

      // Ban @deprecated code patterns
      'no-warning-comments': [
        'error',
        {
          terms: ['@deprecated'],
          location: 'start',
        },
      ],

      // Forbid global state in services
      'no-restricted-globals': [
        'error',
        {
          name: 'globalThis',
          message:
            'Service factories must be pure and stateless. No global state allowed.',
        },
      ],

      // No console in services (use structured logging)
      'no-console': 'warn',
    },
  },
  // API Routes security configuration - V4 FIX (WORKFLOW-PRD-002)
  {
    files: ['app/api/**/*.ts', 'app/actions/**/*.ts', 'pages/api/**/*.ts'],
    ignores: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
    plugins: {
      'security-rules': {
        rules: {
          'no-header-casino-context': noHeaderCasinoContext,
        },
      },
    },
    rules: {
      // V4 FIX: Prevent casino context from headers - security vulnerability
      'security-rules/no-header-casino-context': 'error',
      // SEC-001: Block service client in production API paths (bypasses RLS)
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/lib/supabase/service',
              message:
                'SEC-001: Service client bypasses RLS. Use createClient from @/lib/supabase/server. Only allowed in tests and dev middleware.',
            },
          ],
        },
      ],
    },
  },
  // Production paths security - Block service client (SEC-001)
  {
    files: ['lib/**/*.ts'],
    ignores: [
      'lib/supabase/service.ts', // The service client itself
      'lib/server-actions/middleware/auth.ts', // Dev bypass (gated by isDevAuthBypassEnabled)
      'lib/**/__tests__/**',
      'lib/**/*.test.ts',
    ],
    rules: {
      // SEC-001: Block service client in production lib paths
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/lib/supabase/service',
              message:
                'SEC-001: Service client bypasses RLS. Only allowed in service.ts, dev auth middleware, and tests.',
            },
          ],
        },
      ],
    },
  },
  // Cypress-specific configuration
  {
    files: ['cypress/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        cy: 'readonly',
        Cypress: 'readonly',
        expect: 'readonly',
        assert: 'readonly',
      },
    },
    rules: {
      // Disable problematic rules for Cypress tests
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-expressions': 'off',
      'no-unused-vars': 'off',
      'import/no-extraneous-dependencies': 'off',
      // Allow chai assertions and expect statements
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
  ...compat.config({
    extends: [
      'next',
      'next/core-web-vitals',
      'plugin:@typescript-eslint/recommended',
      'plugin:react/recommended',
      'plugin:react-hooks/recommended',
      'plugin:import/recommended',
      'plugin:import/typescript',
      'plugin:jsx-a11y/recommended',
      'plugin:prettier/recommended',
    ],
    plugins: [
      '@typescript-eslint',
      'react',
      'import',
      'jsx-a11y',
      'prettier',
      'no-only-tests',
    ],
    rules: {
      // ===================================================================
      // PRD Section 4: Anti-Pattern Guardrails
      // ===================================================================

      // console.* - WARN globally, ERROR in services (see service config above)
      // Allows debug logging in non-service code during development
      // Service layer enforces 'no-console': 'error' for production safety
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Forbid 'as any' type casting
      '@typescript-eslint/no-explicit-any': 'error',

      // Ban test.only and describe.only to prevent accidental CI failures
      'no-only-tests/no-only-tests': 'error',

      // Service layer type enforcement + Supabase client restrictions
      // NOTE: The pattern for services/*/index was removed as it blocked legitimate
      // factory function imports. ReturnType inference is caught by no-restricted-syntax
      // rule "TSTypeReference[typeName.name='ReturnType']" in custom-rules section.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              importNames: ['createClient'],
              message:
                'Do not use createClient from @supabase/supabase-js directly. Use createClient from lib/supabase/server or lib/supabase/client.',
            },
          ],
        },
      ],

      // ===================================================================
      // Standard Rules
      // ===================================================================
      'import/no-cycle': 'error',
      'import/no-self-import': 'warn',
      'import/no-unused-modules': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'import/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
        },
      ],
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Note: no-console and no-explicit-any are enforced above in anti-pattern section
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      // Disable accessibility rules that prevent build
      'jsx-a11y/heading-has-content': 'off',
      'jsx-a11y/anchor-is-valid': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'react/no-unknown-property': 'off',
      '@next/next/no-img-element': 'off',
      'prettier/prettier': [
        'error',
        {
          trailingComma: 'all',
          semi: true,
          tabWidth: 2,
          singleQuote: true,
          printWidth: 80,
          endOfLine: 'auto',
          arrowParens: 'always',
        },
        { usePrettierrc: false },
      ],
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import/resolver': {
        typescript: {},
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },
    env: {
      browser: true,
      es2021: true,
      node: true,
    },
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      ecmaFeatures: {
        jsx: true,
      },
    },
  }),
  // ==========================================================================
  // TEST FILE OVERRIDES - Must come LAST for highest precedence
  // ADR-002: Co-located test pattern standardized (services/**/*.test.ts)
  // ==========================================================================

  // Service layer test files - relaxed rules per ADR-002 (co-located tests)
  // Note: custom-rules are already excluded via ignores in service layer config
  {
    files: [
      'services/**/*.test.ts',
      'services/**/*.integration.test.ts',
      'services/**/*.spec.ts',
    ],
    rules: {
      // Tests may use direct Supabase client for integration testing
      'no-restricted-imports': 'off',
      // Tests legitimately use type assertions for mocking
      '@typescript-eslint/consistent-type-assertions': 'off',
      // Explicit return types not required in tests
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Allow console in tests for debugging
      'no-console': 'off',
      // Allow @deprecated comments in test expectations
      'no-warning-comments': 'off',
    },
  },
  // E2E test files (Playwright) - relaxed rules
  {
    files: ['e2e/**/*.ts', 'e2e/**/*.spec.ts'],
    rules: {
      // E2E tests need direct Supabase access for setup/teardown
      'no-restricted-imports': 'off',
      // E2E tests don't need explicit return types
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Allow console in E2E tests
      'no-console': 'off',
    },
  },
  // Integration test files (__tests__ directory) - relaxed rules
  {
    files: [
      '__tests__/**/*.test.ts',
      '__tests__/**/*.spec.ts',
      '__tests__/**/*.integration.test.ts',
    ],
    rules: {
      // Integration tests need direct Supabase access for setup/teardown
      'no-restricted-imports': 'off',
      // Integration tests legitimately use type assertions for setup
      '@typescript-eslint/consistent-type-assertions': 'off',
      // Explicit return types not required in tests
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Allow console in tests for debugging
      'no-console': 'off',
      // Allow @deprecated comments in test expectations
      'no-warning-comments': 'off',
    },
  },
];

export default eslintConfig;
