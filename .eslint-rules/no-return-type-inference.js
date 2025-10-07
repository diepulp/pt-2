/**
 * Custom ESLint Rule: no-return-type-inference
 * Detects ReturnType<typeof createXService> pattern in service files
 * PRD §3.3: Ban ReturnType inference for service types
 */

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow ReturnType<typeof createXService> - require explicit interfaces",
      category: "Best Practices",
      recommended: true,
    },
    messages: {
      noReturnTypeInference:
        "ANTI-PATTERN: ReturnType<typeof {{name}}> is banned (PRD §3.3). Define explicit interface: export interface {{serviceName}} { ... }",
    },
    schema: [],
  },

  create(context) {
    return {
      TSTypeAliasDeclaration(node) {
        // Check if this is an exported type alias
        const parent = node.parent;
        const isExported = parent && parent.type === "ExportNamedDeclaration";

        if (!isExported) return;

        // The type is in node.typeAnnotation (for TS types)
        const typeNode = node.typeAnnotation;

        // Check if the type uses ReturnType
        if (
          typeNode &&
          typeNode.type === "TSTypeReference" &&
          typeNode.typeName &&
          typeNode.typeName.name === "ReturnType"
        ) {
          // Extract the function name from typeof expression
          const typeParams = node.typeAnnotation.typeParameters;
          if (
            typeParams &&
            typeParams.params &&
            typeParams.params[0] &&
            typeParams.params[0].type === "TSTypeQuery"
          ) {
            const funcName =
              typeParams.params[0].exprName?.name || "unknownFunction";
            const serviceName =
              node.id.name.replace(/Service$/, "Service") || "Service";

            context.report({
              node,
              messageId: "noReturnTypeInference",
              data: {
                name: funcName,
                serviceName: serviceName,
              },
            });
          }
        }
      },
    };
  },
};
