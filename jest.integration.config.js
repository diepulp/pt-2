/**
 * jest.integration.config.js — Integration canary tests (node environment).
 *
 * Discovers all *.int.test.ts and *.integration.test.ts files.
 * No config-level env var gating — tests themselves use describe.skip
 * when RUN_INTEGRATION_TESTS is unset.
 *
 * Usage: npx jest --config jest.integration.config.js
 *        npm run test:integration:canary
 */

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',

  setupFilesAfterEnv: ['<rootDir>/jest.setup.node.ts'],

  // Match integration test files by naming convention
  testMatch: ['**/*.int.test.ts', '**/*.integration.test.ts'],

  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/e2e/',
  ],

  // ts-jest transform (no nextJest)
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
        },
      },
    ],
  },

  // Path aliases matching tsconfig.json
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/$1',
  },

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};
