import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.next/**',
      'coverage/**',
      '.swc/**',
      '.qodo/**',
      '.cursor/**',
      'types/database.types.ts', // Generated file, exclude from linting
      'cypress/**/*.{js,ts}', // Exclude Cypress files from main config
    ],
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
    plugins: ['@typescript-eslint', 'react', 'import', 'jsx-a11y', 'prettier', 'no-only-tests'],
    rules: {
      // ===================================================================
      // PRD Section 4: Anti-Pattern Guardrails
      // ===================================================================

      // Forbid Supabase client creation in components/stores
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="createClient"]',
          message: 'Do not create Supabase clients in components or stores. Use createServerClient or createBrowserClient from utils/supabase.',
        },
      ],

      // Ban console.* in production code (allow in tests)
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // Forbid 'as any' type casting
      '@typescript-eslint/no-explicit-any': 'error',

      // Ban test.only and describe.only to prevent accidental CI failures
      'no-only-tests/no-only-tests': 'error',

      // Service layer type enforcement
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/services/*/index'],
              message: 'Do not use ReturnType inference. Import explicit interfaces from service modules.',
            },
          ],
        },
      ],

      // ===================================================================
      // Standard Rules
      // ===================================================================
      'import/no-cycle': 'warn',
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
        'warn',
        {
          trailingComma: 'all',
          semi: false,
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
