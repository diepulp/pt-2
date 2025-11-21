#!/usr/bin/env node
/**
 * Ownership Conflict Detector (CommonJS)
 *
 * Parses SERVICE_RESPONSIBILITY_MATRIX.md to identify duplicate
 * ownership claims across service sections, considering only
 * **OWNS:** blocks.
 */

const fs = require("fs");
const path = require("path");

const MATRIX_PATH = path.join(
  __dirname,
  "../docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md"
);

function readMatrix(matrixPath = MATRIX_PATH) {
  if (!fs.existsSync(matrixPath)) {
    throw new Error(`Matrix file not found at: ${matrixPath}`);
  }

  return fs.readFileSync(matrixPath, "utf-8");
}

function detectOwnershipConflicts(matrixPath = MATRIX_PATH) {
  const content = readMatrix(matrixPath);
  const lines = content.split("\n");

  const servicePattern = /^#{2,3}\s+([A-Za-z][\w\s]+?)\s+Service/i;
  const sectionEndPattern =
    /^\*\*(PROVIDES TO|REFERENCES|DOES NOT OWN|READS|CONSUMED ENTITIES|BOUNDED CONTEXT|KEY PRINCIPLES|Integration Boundaries|READS \(Contextual Enrichment\)|DOES NOT STORE|STORES BUT DOESN'T OWN)/;
  const ownershipPatterns = [
    /^[\s]*[-*]\s*`([A-Za-z0-9_]+)`\s*(?:table|view)/i,
    /^[\s]*[-*]\s*\*\*`?([A-Za-z0-9_]+)`?\*\*/i,
    /\bowns?\b[\s:]+`?([A-Za-z0-9_]+)`?/gi,
    /\bowned entities?\b[\s:]+`?([A-Za-z0-9_]+)`?/gi,
  ];
  const excludes = new Set([
    "owned",
    "owns",
    "entity",
    "entities",
    "table",
    "tables",
    "view",
    "views",
    "data",
    "context",
    "logic",
    "config",
    "cache",
  ]);

  const claims = [];
  const claimKeys = new Set();
  let currentService = "";
  let inOwnsSection = false;
  let skipUntilOwnsEnds = false;

  lines.forEach((line, index) => {
    const serviceMatch = line.match(servicePattern);
    if (serviceMatch) {
      currentService = serviceMatch[1].trim();
      inOwnsSection = false;
      skipUntilOwnsEnds = false;
      return;
    }

    if (line.includes("**OWNS:**")) {
      inOwnsSection = true;
      skipUntilOwnsEnds = false;
      return;
    }

    if (sectionEndPattern.test(line)) {
      inOwnsSection = false;
      skipUntilOwnsEnds = true;
      return;
    }

    if (!inOwnsSection || skipUntilOwnsEnds || !currentService) {
      return;
    }

    ownershipPatterns.forEach((pattern) => {
      const globalPattern = new RegExp(pattern.source, pattern.flags || "");
      let match;

      if (globalPattern.flags.includes("g")) {
        while ((match = globalPattern.exec(line)) !== null) {
          recordClaim(match[1]);
        }
      } else {
        match = line.match(globalPattern);
        if (match) {
          recordClaim(match[1]);
        }
      }
    });

    function recordClaim(rawName) {
      if (!rawName) return;
      const normalized = rawName.toLowerCase();
      if (excludes.has(normalized)) return;
      if (!/^[a-z_][a-z0-9_]*$/i.test(normalized)) return;

      const key = `${normalized}::${currentService}`;
      if (!claimKeys.has(key)) {
        claimKeys.add(key);
        claims.push({
          entity: normalized,
          service: currentService,
          lineNumber: index + 1,
          context: line.trim(),
        });
      }
    }
  });

  const conflictMap = new Map();
  claims.forEach((claim) => {
    if (!conflictMap.has(claim.entity)) {
      conflictMap.set(claim.entity, []);
    }
    conflictMap.get(claim.entity).push(claim);
  });

  const conflicts = new Map();
  conflictMap.forEach((entityClaims, entity) => {
    const services = new Set(entityClaims.map((claim) => claim.service));
    if (services.size > 1) {
      conflicts.set(entity, entityClaims);
    }
  });

  return {
    conflicts,
    totalConflicts: conflicts.size,
  };
}

function formatConflictReport(report) {
  if (report.totalConflicts === 0) {
    return `\n✅ No ownership conflicts detected\n\nAll entities have single, clear ownership across service sections.\n\nSummary: 0 conflicts\nExit code: 0\n`;
  }

  let output =
    "🔍 Scanning SERVICE_RESPONSIBILITY_MATRIX.md for ownership conflicts...\n\n";

  report.conflicts.forEach((claims, entity) => {
    output += `❌ CONFLICT DETECTED: ${entity}\n`;
    claims.forEach((claim) => {
      output += `   📍 ${claim.service} Service (line ${claim.lineNumber}): "${claim.context}"\n`;
    });
    output += "\n";
  });

  output += "━".repeat(70) + "\n";
  output += `Summary: ${report.totalConflicts} ownership conflicts detected\n`;
  output += "Exit code: 1\n\n";
  output += "Recommended actions:\n";

  let actionIndex = 1;
  report.conflicts.forEach((claims, entity) => {
    const services = Array.from(
      new Set(claims.map((claim) => claim.service))
    ).join(" vs ");
    output += `${actionIndex}. Review ${services} ownership of "${entity}"\n`;
    actionIndex += 1;
  });

  output += `${actionIndex}. Update matrix to show single owner per entity\n`;
  output += "━".repeat(70) + "\n";

  return output;
}

if (require.main === module) {
  try {
    const report = detectOwnershipConflicts();
    console.log(formatConflictReport(report));

    const outputPath = path.join(
      __dirname,
      "../.validation/ownership_conflicts.json"
    );
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const jsonReport = {
      totalConflicts: report.totalConflicts,
      conflicts: Array.from(report.conflicts.entries()).map(
        ([entity, entries]) => ({
          entity,
          claims: entries.map((entry) => ({
            service: entry.service,
            lineNumber: entry.lineNumber,
            context: entry.context,
          })),
        })
      ),
    };

    fs.writeFileSync(outputPath, JSON.stringify(jsonReport, null, 2));
    process.exit(report.totalConflicts > 0 ? 1 : 0);
  } catch (error) {
    console.error("❌ Ownership detection failed:", error.message);
    process.exit(1);
  }
}

module.exports = {
  detectOwnershipConflicts,
  formatConflictReport,
};
