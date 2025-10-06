/**
 * Service Layer ESLint Rules - PRD Section 4 Anti-Pattern Guardrails
 *
 * Additional rules specifically for services/** directory
 * These enforce architectural constraints on the service layer
 */

module.exports = {
  overrides: [
    {
      // Apply strict service layer rules to services directory
      files: ["services/**/*.ts", "services/**/*.tsx"],
      rules: {
        // Forbid 'as any' type casting (PRD: violation in services/visit/index.ts:76)
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/consistent-type-assertions": [
          "error",
          {
            assertionStyle: "as",
            objectLiteralTypeAssertions: "allow-as-parameter",
          },
        ],

        // Ban deprecated code patterns
        "no-warning-comments": [
          "error",
          {
            terms: ["@deprecated"],
            location: "start",
          },
        ],

        // Require explicit return types for service factories
        "@typescript-eslint/explicit-function-return-type": [
          "error",
          {
            allowExpressions: false,
            allowTypedFunctionExpressions: true,
            allowHigherOrderFunctions: false,
          },
        ],

        // Ban ReturnType inference patterns
        "no-restricted-syntax": [
          "error",
          {
            selector: "TSTypeQuery[exprName.name=/^create.*Service$/]",
            message:
              "Do not use ReturnType<typeof createXService>. Define explicit interfaces instead.",
          },
          {
            selector: "ClassDeclaration[decorators]",
            message:
              "Do not use class-based services. Use functional factories instead.",
          },
        ],

        // Forbid global state in services
        "no-restricted-globals": [
          "error",
          {
            name: "globalThis",
            message:
              "Service factories must be pure and stateless. No global state allowed.",
          },
        ],

        // Enforce named exports only (no default exports)
        "import/no-default-export": "error",
        "import/prefer-default-export": "off",

        // No console in services (use structured logging)
        "no-console": "error",
      },
    },
    {
      // Realtime services: ban global managers
      files: ["services/**/realtime*.ts", "services/**/subscriptions*.ts"],
      rules: {
        "no-restricted-syntax": [
          "error",
          {
            selector:
              'VariableDeclaration[kind="const"] > VariableDeclarator[id.name=/.*Manager$/]',
            message:
              "Ban global real-time managers. Use hook-scoped subscriptions instead.",
          },
          {
            selector: 'CallExpression[callee.property.name="singleton"]',
            message:
              "No singleton patterns in real-time services. Each hook manages its own subscription.",
          },
        ],
      },
    },
  ],
};
