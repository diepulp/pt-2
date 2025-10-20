#!/usr/bin/env node
/**
 * Matrix Schema Validation Script (Phase A)
 *
 * Cross-validates SERVICE_RESPONSIBILITY_MATRIX.md ownership claims
 * against actual database schema (types/database.types.ts).
 */

const fs = require('fs');
const path = require('path');

const MATRIX_PATH = path.join(
  __dirname,
  '../docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md'
);
const TYPES_PATH = path.join(__dirname, '../types/database.types.ts');

function readFileOrThrow(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  return fs.readFileSync(filePath, 'utf-8');
}

function extractSection(content, startRegex, endRegex) {
  const startMatch = content.match(startRegex);
  if (!startMatch) {
    return '';
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
    /\n\s+Views:\s*\{/
  );

  const tablePattern = /^\s{6}([A-Za-z0-9_"-]+):\s*\{/gm;
  const seen = new Map();
  let match;

  while ((match = tablePattern.exec(tablesSection)) !== null) {
    const rawName = match[1].replace(/"/g, '');
    if (['Row', 'Insert', 'Update', 'Relationships'].includes(rawName)) {
      continue;
    }

    const normalized = rawName.toLowerCase();
    if (!seen.has(normalized)) {
      seen.set(normalized, {
        name: rawName,
        normalized,
        quoted: rawName !== rawName.toLowerCase(),
        columns: null
      });
    }
  }

  return Array.from(seen.values());
}

function extractViewNames(content) {
  const lines = content.split('\n');
  let inPublic = false;
  let inViews = false;
  const views = new Map();

  lines.forEach(line => {
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
        const rawName = match[1].replace(/"/g, '');
        if (!['Row', 'Insert', 'Update', 'Relationships'].includes(rawName)) {
          const normalized = rawName.toLowerCase();
          if (!views.has(normalized)) {
            views.set(normalized, {
              name: rawName,
              normalized,
              type: 'view'
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
    /\n\s+CompositeTypes:\s*\{/
  );

  const enumPattern = /^\s{6}([A-Za-z0-9_]+):\s*"([^"]+)"(?:\s*\|\s*"([^"]+)")*/gm;
  const enums = [];
  let match;

  while ((match = enumPattern.exec(enumsSection)) !== null) {
    const name = match[1];
    const values = match[0]
      .split('|')
      .map(part => part.replace(/[^A-Za-z0-9_]/g, '').trim())
      .filter(Boolean)
      .slice(1);

    if (values.length) {
      enums.push({ name, values });
    }
  }

  return enums;
}

function extractOwnershipClaims(matrixPath, content) {
  const matrixContent = content || readFileOrThrow(matrixPath);
  const lines = matrixContent.split('\n');

  const ownershipClaims = [];
  const claimKeys = new Set();
  let currentService = '';
  let inOwnsSection = false;
  let skipUntilOwnsEnds = false;

  const servicePattern = /^#{2,3}\s+([A-Za-z][\w\s]+?)\s+Service/i;
  const sectionEndPattern = /^\*\*(PROVIDES TO|REFERENCES|DOES NOT OWN|READS|CONSUMED ENTITIES|BOUNDED CONTEXT|KEY PRINCIPLES|Integration Boundaries|READS \(Contextual Enrichment\)|DOES NOT STORE|STORES BUT DOESN'T OWN)/;
  const ownershipPatterns = [
    /^[\s]*[-*]\s*`([A-Za-z0-9_]+)`\s*(?:table|view)/i,
    /^[\s]*[-*]\s*\*\*`?([A-Za-z0-9_]+)`?\*\*/i,
    /\bowns?\b[\s:]+`?([A-Za-z0-9_]+)`?/gi,
    /\bowned entities?\b[\s:]+`?([A-Za-z0-9_]+)`?/gi
  ];
  const excludes = new Set([
    'owned',
    'owns',
    'entity',
    'entities',
    'table',
    'tables',
    'view',
    'views',
    'data',
    'context',
    'logic',
    'config',
    'cache'
  ]);

  lines.forEach((line, index) => {
    const serviceMatch = line.match(servicePattern);
    if (serviceMatch) {
      currentService = serviceMatch[1].trim();
      inOwnsSection = false;
      skipUntilOwnsEnds = false;
      return;
    }

    if (line.includes('**OWNS:**')) {
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

    ownershipPatterns.forEach(pattern => {
      const globalPattern = new RegExp(pattern.source, pattern.flags || '');
      let matchResult;

      if (globalPattern.flags.includes('g')) {
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
          context: line.trim()
        });
      }
    }
  });

  return ownershipClaims;
}

function validateMatrixSchema() {
  const typesContent = readFileOrThrow(TYPES_PATH);
  const matrixContent = readFileOrThrow(MATRIX_PATH);

  const tables = extractTableMetadata(typesContent);
  const tableSet = new Set(tables.map(table => table.normalized));
  const ownershipClaims = extractOwnershipClaims(MATRIX_PATH, matrixContent);

  console.log('🔍 Validating Service Responsibility Matrix against schema...\n');
  console.log('━'.repeat(70));
  console.log('📊 Schema Analysis:');
  console.log(`   - Found ${tables.length} tables in schema types`);
  console.log('📋 Matrix Analysis:');
  console.log(`   - Found ${ownershipClaims.length} ownership claims`);

  const orphanedReferences = Array.from(
    new Set(ownershipClaims.map(claim => claim.table))
  ).filter(table => !tableSet.has(table));

  const ownershipMap = new Map();
  ownershipClaims.forEach(claim => {
    if (!ownershipMap.has(claim.table)) {
      ownershipMap.set(claim.table, []);
    }
    ownershipMap.get(claim.table).push(claim);
  });

  const duplicateOwnership = [];
  ownershipMap.forEach((claims, table) => {
    const services = new Set(claims.map(entry => entry.service));
    if (services.size > 1) {
      duplicateOwnership.push(table);
    }
  });

  console.log('━'.repeat(70));
  console.log('\n🔎 Validation Results:\n');

  if (orphanedReferences.length) {
    console.log(`❌ ORPHANED REFERENCES (${orphanedReferences.length}):`);
    orphanedReferences.forEach(table => {
      console.log(`   • ${table}`);
      (ownershipMap.get(table) || []).forEach(claim => {
        console.log(
          `     - ${claim.service} Service (line ${claim.lineNumber}): ${claim.context}`
        );
      });
      console.log('');
    });
  } else {
    console.log('✅ No orphaned references detected\n');
  }

  if (duplicateOwnership.length) {
    console.log(`❌ DUPLICATE OWNERSHIP (${duplicateOwnership.length}):`);
    duplicateOwnership.forEach(table => {
      console.log(`   • ${table}`);
      (ownershipMap.get(table) || []).forEach(claim => {
        console.log(
          `     - ${claim.service} Service (line ${claim.lineNumber})`
        );
      });
      console.log('');
    });
  } else {
    console.log('✅ No duplicate ownership detected\n');
  }

  console.log('━'.repeat(70));

  const success = orphanedReferences.length === 0 && duplicateOwnership.length === 0;

  const reportPath = path.join(
    __dirname,
    '../.validation/matrix_schema_validation.json'
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
          duplicateOwnership: duplicateOwnership.length
        },
        orphanedReferences: orphanedReferences.map(table => ({
          table,
          claims: (ownershipMap.get(table) || []).map(claim => ({
            service: claim.service,
            lineNumber: claim.lineNumber,
            context: claim.context
          }))
        })),
        duplicateOwnership: duplicateOwnership.map(table => ({
          table,
          services: Array.from(
            new Set((ownershipMap.get(table) || []).map(claim => claim.service))
          ),
          claims: (ownershipMap.get(table) || []).map(claim => ({
            service: claim.service,
            lineNumber: claim.lineNumber
          }))
        }))
      },
      null,
      2
    )
  );

  console.log(`📝 Detailed report written to: ${reportPath}\n`);

  return {
    success,
    orphanedReferences,
    duplicateOwnership
  };
}

if (require.main === module) {
  try {
    const result = validateMatrixSchema();
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  }
}

module.exports = {
  validateMatrixSchema,
  extractTableMetadata,
  extractOwnershipClaims,
  extractViewNames,
  extractEnums
};
