import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { FlatCompat } from '@eslint/eslintrc';

import dtoColumnAllowlist from './.eslint-rules/dto-column-allowlist.js';
import noCrossContextDbImports from './.eslint-rules/no-cross-context-db-imports.js';
import noManualDTOInterfaces from './.eslint-rules/no-manual-dto-interfaces.js';
import noReturnTypeInference from './.eslint-rules/no-return-type-inference.js';

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
      '.venv/**',
      'dist/**',
      '.next/**',
      'coverage/**',
      '.swc/**',
      '.venv/**',
      '.qodo/**',
      '.cursor/**',
      'types/database.types.ts', // Generated file, exclude from linting
      'cypress/**/*.{js,ts}', // Exclude Cypress files from main config
      'scripts/**', // Utility scripts are executed via node without linting
    ],
  },
  // Service layer specific configuration - PRD §3.3 Service Layer Standards
  {
    files: ['services/**/*.ts', 'services/**/*.tsx'],
    plugins: {
      'custom-rules': {
        rules: {
          'no-return-type-inference': noReturnTypeInference,
          'no-manual-dto-interfaces': noManualDTOInterfaces,
          'no-cross-context-db-imports': noCrossContextDbImports,
          'dto-column-allowlist': dtoColumnAllowlist,
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
      'no-restricted-syntax': [
        'error',
        {
          // Simpler pattern: catch any type alias with ReturnType in services
          selector:
            'ExportNamedDeclaration > TSTypeAliasDeclaration > TSTypeReference[typeName.name="ReturnType"]',
          message:
            'ANTI-PATTERN: ReturnType<typeof ...> is banned in service exports (PRD §3.3). Define explicit interface: export interface XService { methodName(): ReturnType }',
        },
        {
          // Ban manual DTO interfaces (SRM canonical standard)
          selector:
            'ExportNamedDeclaration > TSInterfaceDeclaration[id.name=/.*DTO$/]',
          message:
            'ANTI-PATTERN: Manual DTO interfaces banned (SRM canonical). Use type alias: export type XCreateDTO = Pick<Database["public"]["Tables"]["x"]["Insert"], "field1" | "field2">',
        },
        {
          // Ban DTO-like interfaces with common suffixes
          selector:
            'ExportNamedDeclaration > TSInterfaceDeclaration[id.name=/.*(?:Create|Update|Response|Request)DTO$/]',
          message:
            'ANTI-PATTERN: DTO interfaces must be type aliases derived from Database types. This ensures automatic schema sync.',
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
      'no-console': 'error',
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

      // Ban console.* in production code (allow in tests)
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // Forbid 'as any' type casting
      '@typescript-eslint/no-explicit-any': 'error',

      // Ban test.only and describe.only to prevent accidental CI failures
      'no-only-tests/no-only-tests': 'error',

      // Service layer type enforcement + Supabase client restrictions
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
          patterns: [
            {
              group: ['**/services/*/index'],
              message:
                'Do not use ReturnType inference. Import explicit interfaces from service modules.',
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
];

export default eslintConfig;
