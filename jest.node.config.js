/**
 * jest.node.config.js — Server-side unit tests (node environment).
 *
 * Covers services/, app/, lib/, workers/, and root __tests__/ directories.
 * Excludes integration tests (.int.test.ts, .integration.test.ts),
 * component tests, hook tests, and e2e tests.
 *
 * Usage: npx jest --config jest.node.config.js
 *        npm run test:unit:node
 */

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',

  setupFilesAfterEnv: ['<rootDir>/jest.setup.node.ts'],

  // Match all *.test.ts files in __tests__ directories
  testMatch: [
    '<rootDir>/services/**/__tests__/**/*.test.ts',
    '<rootDir>/app/**/__tests__/**/*.test.ts',
    '<rootDir>/lib/**/__tests__/**/*.test.ts',
    '<rootDir>/workers/**/__tests__/**/*.test.ts',
    '<rootDir>/__tests__/**/*.test.ts',
  ],

  // Exclude integration tests, component/hook tests, and e2e
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    '\\.int\\.test\\.ts$',
    '\\.integration\\.test\\.ts$',
    '<rootDir>/__tests__/components/',
    '<rootDir>/__tests__/hooks/',
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
