#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Matrix Schema Validation Script (Phase A)
 *
 * Cross-validates SERVICE_RESPONSIBILITY_MATRIX.md ownership claims
 * against actual database schema (types/database.types.ts).
 */

const fs = require("fs");
const path = require("path");

const log = (message = "") => {
  process.stdout.write(`${message}\n`);
};

const MATRIX_PATH = path.join(
  __dirname,
  "../docs/bounded-context-integrity/phase-D/srm-patch/SERVICE_RESPONSIBILITY_MATRIX.md",
);
const TYPES_PATH = path.join(__dirname, "../types/database.types.ts");

function readFileOrThrow(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  return fs.readFileSync(filePath, "utf-8");
}

function extractSection(content, startRegex, endRegex) {
  const startMatch = content.match(startRegex);
  if (!startMatch) {
    return "";
  }

  const startIndex = startMatch.index + startMatch[0].length;
  const remainder = content.slice(startIndex);

  if (!endRegex) {
    return remainder;
  }

  const endMatch = remainder.match(endRegex);
  if (!endMatch) {
    return remainder;
  }

  return remainder.slice(0, endMatch.index);
}

function extractTableMetadata(content) {
  const tablesSection = extractSection(
    content,
    /\bpublic:\s*\{[\s\S]*?\bTables:\s*\{/,
    /\n\s+Views:\s*\{/,
  );

  const tablePattern = /^\s{6}([A-Za-z0-9_"-]+):\s*\{/gm;
  const seen = new Map();
  let match;

  while ((match = tablePattern.exec(tablesSection)) !== null) {
    const rawName = match[1].replace(/"/g, "");
    if (["Row", "Insert", "Update", "Relationships"].includes(rawName)) {
      continue;
    }

    const normalized = rawName.toLowerCase();
    if (!seen.has(normalized)) {
      seen.set(normalized, {
        name: rawName,
        normalized,
        quoted: rawName !== rawName.toLowerCase(),
        columns: null,
      });
    }
  }

  return Array.from(seen.values());
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTableColumns(content) {
  const tables = extractTableMetadata(content);
  const columnMap = new Map();

  tables.forEach((table) => {
    const namePattern = escapeRegex(table.name);
    const tableRegex = new RegExp(
      `${namePattern}\\s*:\\s*\\{[\\s\\S]*?Row:\\s*\\{([\\s\\S]*?)\\}\\s*;`,
      "m",
    );
    const match = tableRegex.exec(content);

    if (!match) {
      columnMap.set(table.normalized, new Set());
      return;
    }

    const rowContent = match[1];
    const columnPattern = /^\s*([A-Za-z0-9_]+)/gm;
    const columns = new Set();
    let columnMatch;

    while ((columnMatch = columnPattern.exec(rowContent)) !== null) {
      const columnName = columnMatch[1];
      if (columnName === "__typename") continue;
      columns.add(columnName);
    }

    columnMap.set(table.normalized, columns);
  });

  return columnMap;
}

function extractViewNames(content) {
  const lines = content.split("\n");
  let inPublic = false;
  let inViews = false;
  const views = new Map();

  lines.forEach((line) => {
    if (!inPublic) {
      if (/^\s*public:\s*\{/.test(line)) {
        inPublic = true;
      }
      return;
    }

    if (!inViews) {
      if (/^\s+Views:\s*\{/.test(line)) {
        inViews = true;
      }
      return;
    }

    if (/^\s+Functions:\s*\{/.test(line)) {
      inViews = false;
      return;
    }

    if (inViews) {
      const match = line.match(/^\s{6}([A-Za-z0-9_"-]+):\s*\{/);
      if (match) {
        const rawName = match[1].replace(/"/g, "");
        if (!["Row", "Insert", "Update", "Relationships"].includes(rawName)) {
          const normalized = rawName.toLowerCase();
          if (!views.has(normalized)) {
            views.set(normalized, {
              name: rawName,
              normalized,
              type: "view",
            });
          }
        }
      }
    }
  });

  return Array.from(views.values());
}

function extractEnums(content) {
  const enumsSection = extractSection(
    content,
    /\n\s+Enums:\s*\{/,
    /\n\s+CompositeTypes:\s*\{/,
  );

  const enumPattern =
    /^\s{6}([A-Za-z0-9_]+):\s*"([^"]+)"(?:\s*\|\s*"([^"]+)")*/gm;
  const enums = [];
  let match;

  while ((match = enumPattern.exec(enumsSection)) !== null) {
    const name = match[1];
    const values = match[0]
      .split("|")
      .map((part) => part.replace(/[^A-Za-z0-9_]/g, "").trim())
      .filter(Boolean)
      .slice(1);

    if (values.length) {
      enums.push({ name, values });
    }
  }

  return enums;
}

function extractFunctionNames(content) {
  const functionsSection = extractSection(
    content,
    /\n\s+Functions:\s*\{/,
    /\n\s+Enums:\s*\{/,
  );

  const functionPattern = /^\s{6}([A-Za-z0-9_]+):\s*\{/gm;
  const functions = new Set();
  let match;

  while ((match = functionPattern.exec(functionsSection)) !== null) {
    functions.add(match[1].toLowerCase());
  }

  return functions;
}

function extractOwnershipClaims(matrixPath, content) {
  const matrixContent = content || readFileOrThrow(matrixPath);
  const lines = matrixContent.split("\n");

  const ownershipClaims = [];
  const claimKeys = new Set();
  let currentService = "";
  let inOwnsSection = false;
  let skipUntilOwnsEnds = false;

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
      let matchResult;

      if (globalPattern.flags.includes("g")) {
        while ((matchResult = globalPattern.exec(line)) !== null) {
          recordClaim(matchResult[1]);
        }
      } else {
        matchResult = line.match(globalPattern);
        if (matchResult) {
          recordClaim(matchResult[1]);
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
        ownershipClaims.push({
          table: normalized,
          service: currentService,
          lineNumber: index + 1,
          context: line.trim(),
        });
      }
    }
  });

  return ownershipClaims;
}

function parseEnumCatalog(matrixContent) {
  const section = extractSection(
    matrixContent,
    /####\s+Centralized Enum Catalog/i,
    /####\s+Event/i,
  );

  const enumPattern = /^\s*create\s+type\s+([a-z0-9_]+)\s+as\s+enum/gim;
  const enums = [];
  let match;

  while ((match = enumPattern.exec(section)) !== null) {
    enums.push(match[1].toLowerCase());
  }

  return enums;
}

function buildLineIndex(content) {
  return content.split("\n").map((text, index) => ({
    text,
    lineNumber: index + 1,
  }));
}

function parseAcceptanceChecklists(matrixContent) {
  const lines = buildLineIndex(matrixContent);
  const checklists = [];
  let currentService = null;

  const serviceHeaderPattern = /^##\s+(.+?)\s*$/;
  const serviceNamePattern = /([A-Za-z0-9&\s]+?)\s+(Service|Acceptance)/i;

  for (let i = 0; i < lines.length; i++) {
    const { text, lineNumber } = lines[i];

    const serviceMatch = text.match(serviceHeaderPattern);
    if (serviceMatch) {
      const raw = serviceMatch[1].trim();
      const nameMatch = raw.match(serviceNamePattern);
      currentService = nameMatch ? nameMatch[1].trim() : raw;
      continue;
    }

    if (!text.startsWith("###")) continue;
    if (!/Acceptance Checklist \(CI\)/i.test(text)) continue;

    let checklistName = text.replace(/^###\s+/, "").trim();
    if (checklistName.toLowerCase() === "acceptance checklist (ci)") {
      checklistName = currentService
        ? `${currentService} Acceptance Checklist (CI)`
        : checklistName;
    }

    const blockLines = [];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      if (/^##\s+/.test(next.text)) break;
      if (/^###\s+/.test(next.text) && !/^\s*-\s*\[/.test(next.text)) break;
      blockLines.push(next);
      j++;
    }

    checklists.push({
      service: currentService,
      title: checklistName,
      startLine: lineNumber,
      lines: blockLines,
    });

    i = j - 1;
  }

  return checklists;
}

function collectBulletBlocks(lines) {
  const bullets = [];
  let current = null;

  lines.forEach(({ text, lineNumber }) => {
    if (/^\s*-\s*\[/.test(text)) {
      if (current) {
        bullets.push(current);
      }
      current = { lineNumber, text: text.trim() };
    } else if (current && text.trim()) {
      current.text += " " + text.trim();
    }
  });

  if (current) {
    bullets.push(current);
  }

  return bullets;
}

function parseIdentifiersFromBackticks(body) {
  const matches = body.match(/`([^`]+)`/g) || [];
  return matches
    .map((match) => match.replace(/`/g, "").trim())
    .map((identifier) => identifier.split(/\s+/)[0])
    .filter(Boolean);
}

function validateEnumCatalog(matrixContent, existingEnumSet) {
  const expectedEnums = parseEnumCatalog(matrixContent);
  const missingEnums = expectedEnums.filter(
    (enumName) => !existingEnumSet.has(enumName),
  );

  return { expectedEnums, missingEnums };
}

function validateChecklists(
  matrixContent,
  tablesMeta,
  columnMap,
  functionsSet,
) {
  const checklists = parseAcceptanceChecklists(matrixContent);
  const tableNameMap = new Map();
  tablesMeta.forEach((table) => {
    tableNameMap.set(table.normalized, table.name);
  });

  const tableLookup = (docName) => {
    const normalized = docName.toLowerCase();
    if (tableNameMap.has(normalized)) {
      return { normalized, name: tableNameMap.get(normalized) };
    }
    return null;
  };

  const issues = {
    missingTables: [],
    missingColumns: [],
    missingFunctions: [],
  };

  checklists.forEach((checklist) => {
    const bullets = collectBulletBlocks(checklist.lines);
    const serviceName = checklist.service || checklist.title;

    bullets.forEach((bullet) => {
      const match = bullet.text.match(
        /^-\s*\[[ x]\]\s*\*\*(.+?)\*\*\s*:?\s*(.*)$/i,
      );
      if (!match) return;

      const title = match[1].trim().toLowerCase();
      const body = match[2] || "";

      if (title.includes("tables present")) {
        const identifiers = parseIdentifiersFromBackticks(body);
        identifiers.forEach((identifier) => {
          const tableInfo = tableLookup(identifier);
          if (!tableInfo) {
            issues.missingTables.push({
              service: serviceName,
              expected: identifier,
              lineNumber: bullet.lineNumber,
            });
          }
        });
      }

      if (title.includes("ledger columns")) {
        const identifiers = parseIdentifiersFromBackticks(body);
        const tableInfo = tableLookup("loyalty_ledger");
        if (!tableInfo) {
          issues.missingTables.push({
            service: serviceName,
            expected: "loyalty_ledger",
            lineNumber: bullet.lineNumber,
          });
        } else {
          const columns = columnMap.get(tableInfo.normalized) || new Set();
          identifiers.forEach((identifier) => {
            if (!columns.has(identifier)) {
              issues.missingColumns.push({
                service: serviceName,
                table: tableInfo.name,
                expected: identifier,
                lineNumber: bullet.lineNumber,
              });
            }
          });
        }
      }

      if (title === "columns") {
        const identifiers = parseIdentifiersFromBackticks(body);
        const tableInfo = tableLookup("rating_slip");
        if (!tableInfo) {
          issues.missingTables.push({
            service: serviceName,
            expected: "rating_slip",
            lineNumber: bullet.lineNumber,
          });
        } else {
          const columns = columnMap.get(tableInfo.normalized) || new Set();
          identifiers.forEach((identifier) => {
            if (!columns.has(identifier)) {
              issues.missingColumns.push({
                service: serviceName,
                table: tableInfo.name,
                expected: identifier,
                lineNumber: bullet.lineNumber,
              });
            }
          });
        }
      }

      if (title.includes("atomic issuance")) {
        if (!functionsSet.has("rpc_issue_mid_session_reward")) {
          issues.missingFunctions.push({
            service: serviceName,
            function: "rpc_issue_mid_session_reward",
            lineNumber: bullet.lineNumber,
          });
        }
      }
    });
  });

  return issues;
}

function validateMatrixSchema() {
  const typesContent = readFileOrThrow(TYPES_PATH);
  const matrixContent = readFileOrThrow(MATRIX_PATH);

  const tables = extractTableMetadata(typesContent);
  const tableSet = new Set(tables.map((table) => table.normalized));
  const columnMap = extractTableColumns(typesContent);
  const functionSet = extractFunctionNames(typesContent);
  const enums = extractEnums(typesContent);
  const enumSet = new Set(enums.map((item) => item.name.toLowerCase()));
  const ownershipClaims = extractOwnershipClaims(MATRIX_PATH, matrixContent);

  const enumValidation = validateEnumCatalog(matrixContent, enumSet);
  const checklistIssues = validateChecklists(
    matrixContent,
    tables,
    columnMap,
    functionSet,
  );

  log("🔍 Validating Service Responsibility Matrix against schema...\n");
  log("━".repeat(70));
  log("📊 Schema Analysis:");
  log(`   - Found ${tables.length} tables in schema types`);
  log("📋 Matrix Analysis:");
  log(`   - Found ${ownershipClaims.length} ownership claims`);
  log(`   - Expected enums declared: ${enumValidation.expectedEnums.length}`);

  const orphanedReferences = Array.from(
    new Set(ownershipClaims.map((claim) => claim.table)),
  ).filter((table) => !tableSet.has(table));

  const ownershipMap = new Map();
  ownershipClaims.forEach((claim) => {
    if (!ownershipMap.has(claim.table)) {
      ownershipMap.set(claim.table, []);
    }
    ownershipMap.get(claim.table).push(claim);
  });

  const duplicateOwnership = [];
  ownershipMap.forEach((claims, table) => {
    const services = new Set(claims.map((entry) => entry.service));
    if (services.size > 1) {
      duplicateOwnership.push(table);
    }
  });

  log("━".repeat(70));
  log("\n🔎 Validation Results:\n");

  if (orphanedReferences.length) {
    log(`❌ ORPHANED REFERENCES (${orphanedReferences.length}):`);
    orphanedReferences.forEach((table) => {
      log(`   • ${table}`);
      (ownershipMap.get(table) || []).forEach((claim) => {
        log(
          `     - ${claim.service} Service (line ${claim.lineNumber}): ${claim.context}`,
        );
      });
      log("");
    });
  } else {
    log("✅ No orphaned references detected\n");
  }

  if (duplicateOwnership.length) {
    log(`❌ DUPLICATE OWNERSHIP (${duplicateOwnership.length}):`);
    duplicateOwnership.forEach((table) => {
      log(`   • ${table}`);
      (ownershipMap.get(table) || []).forEach((claim) => {
        log(`     - ${claim.service} Service (line ${claim.lineNumber})`);
      });
      log("");
    });
  } else {
    log("✅ No duplicate ownership detected\n");
  }

  if (enumValidation.missingEnums.length) {
    log(`❌ ENUMS MISSING IN SCHEMA (${enumValidation.missingEnums.length}):`);
    enumValidation.missingEnums.forEach((enumName) => {
      log(`   • ${enumName}`);
    });
    log("");
  } else {
    log("✅ All documented enums exist in schema\n");
  }

  if (checklistIssues.missingTables.length) {
    log(
      `❌ CHECKLIST TABLE VIOLATIONS (${checklistIssues.missingTables.length}):`,
    );
    checklistIssues.missingTables.forEach((issue) => {
      log(
        `   • ${issue.expected} missing for ${issue.service} (line ${issue.lineNumber})`,
      );
    });
    log("");
  } else {
    log("✅ All checklist tables located in schema\n");
  }

  if (checklistIssues.missingColumns.length) {
    log(
      `❌ CHECKLIST COLUMN VIOLATIONS (${checklistIssues.missingColumns.length}):`,
    );
    checklistIssues.missingColumns.forEach((issue) => {
      log(
        `   • ${issue.table}.${issue.expected} missing for ${issue.service} (line ${issue.lineNumber})`,
      );
    });
    log("");
  } else {
    log("✅ All checklist columns located in schema\n");
  }

  if (checklistIssues.missingFunctions.length) {
    log(
      `❌ CHECKLIST FUNCTION VIOLATIONS (${checklistIssues.missingFunctions.length}):`,
    );
    checklistIssues.missingFunctions.forEach((issue) => {
      log(
        `   • ${issue.function} missing for ${issue.service} (line ${issue.lineNumber})`,
      );
    });
    log("");
  } else {
    log("✅ All checklist-required functions exist in schema\n");
  }

  log("━".repeat(70));

  const success =
    orphanedReferences.length === 0 &&
    duplicateOwnership.length === 0 &&
    enumValidation.missingEnums.length === 0 &&
    checklistIssues.missingTables.length === 0 &&
    checklistIssues.missingColumns.length === 0 &&
    checklistIssues.missingFunctions.length === 0;

  const reportPath = path.join(
    __dirname,
    "../.validation/matrix_schema_validation.json",
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        success,
        timestamp: new Date().toISOString(),
        summary: {
          totalTables: tables.length,
          totalClaims: ownershipClaims.length,
          orphanedReferences: orphanedReferences.length,
          duplicateOwnership: duplicateOwnership.length,
          expectedEnums: enumValidation.expectedEnums.length,
          missingEnums: enumValidation.missingEnums.length,
          checklistMissingTables: checklistIssues.missingTables.length,
          checklistMissingColumns: checklistIssues.missingColumns.length,
          checklistMissingFunctions: checklistIssues.missingFunctions.length,
        },
        orphanedReferences: orphanedReferences.map((table) => ({
          table,
          claims: (ownershipMap.get(table) || []).map((claim) => ({
            service: claim.service,
            lineNumber: claim.lineNumber,
            context: claim.context,
          })),
        })),
        duplicateOwnership: duplicateOwnership.map((table) => ({
          table,
          services: Array.from(
            new Set(
              (ownershipMap.get(table) || []).map((claim) => claim.service),
            ),
          ),
          claims: (ownershipMap.get(table) || []).map((claim) => ({
            service: claim.service,
            lineNumber: claim.lineNumber,
          })),
        })),
        enums: {
          expected: enumValidation.expectedEnums,
          missing: enumValidation.missingEnums,
        },
        checklist: checklistIssues,
      },
      null,
      2,
    ),
  );

  log(`📝 Detailed report written to: ${reportPath}\n`);

  return {
    success,
    orphanedReferences,
    duplicateOwnership,
    missingEnums: enumValidation.missingEnums,
    checklistIssues,
  };
}

if (require.main === module) {
  try {
    const result = validateMatrixSchema();
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error("❌ Validation failed:", error.message);
    process.exit(1);
  }
}

module.exports = {
  validateMatrixSchema,
  extractTableMetadata,
  extractOwnershipClaims,
  extractViewNames,
  extractEnums,
  extractFunctionNames,
  parseAcceptanceChecklists,
  validateChecklists,
  validateEnumCatalog,
};
