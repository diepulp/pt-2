#!/usr/bin/env node

/**
 * Agent Context Compiler
 *
 * Regenerates the root AGENTS.md file based on the canonical instruction,
 * chat mode, prompt, context, and memory directories. Supports a --check mode
 * for CI to detect drift without rewriting the file.
 */

import { promises as fs } from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const CONFIG = {
  title: '# PT-2 Agent Context Map',
  inherit: 'none',
  appliesTo: ['**/*'],
  sections: {
    instructions: '.github/instructions',
    chatmodes: '.github/chatmodes',
    prompts: '.github/prompts',
    context: 'context',
  },
  memoryDir: 'memory',
  notes: [
    'See docs/patterns/SDLC_DOCS_TAXONOMY.md for documentation ownership.',
    'Subdirectories may supply their own AGENTS.md inheriting from this file.',
  ],
};

const CHECK_MODE = process.argv.includes('--check');

async function listMarkdownFiles(relativeDir) {
  const fullPath = path.join(repoRoot, relativeDir);

  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.posix.join(relativeDir, entry.name))
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function buildAgentsDocument({
  title,
  inherit,
  appliesTo,
  sections,
  memoryFiles,
  notes,
}) {
  const lines = [];
  lines.push(title);
  lines.push(`inherit: ${inherit}`);
  const appliesJoined = appliesTo.map((value) => `"${value}"`).join(', ');
  lines.push(`appliesTo: [${appliesJoined}]`);
  lines.push('');

  const sectionKeys = Object.keys(sections);
  const hasIncludes = sectionKeys.some((key) => sections[key].length > 0);
  if (hasIncludes) {
    lines.push('includes:');
    sectionKeys.forEach((key) => {
      const files = sections[key];
      if (!files.length) {
        return;
      }
      lines.push(`  ${key}:`);
      files.forEach((filePath) => {
        lines.push(`    - ${filePath}`);
      });
    });
    lines.push('');
  }

  if (memoryFiles.length) {
    lines.push('memory:');
    memoryFiles.forEach((filePath) => {
      lines.push(`  - ${filePath}`);
    });
    lines.push('');
  }

  if (notes.length) {
    lines.push('notes:');
    notes.forEach((note) => {
      const escaped = note.replace(/"/g, '\\"');
      lines.push(`  - "${escaped}"`);
    });
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

async function ensureAgentsDocument() {
  const collectedSections = {};

  for (const [key, dir] of Object.entries(CONFIG.sections)) {
    // eslint-disable-next-line no-await-in-loop
    collectedSections[key] = await listMarkdownFiles(dir);
  }

  const memoryFiles = await listMarkdownFiles(CONFIG.memoryDir);

  const document = buildAgentsDocument({
    title: CONFIG.title,
    inherit: CONFIG.inherit,
    appliesTo: CONFIG.appliesTo,
    sections: collectedSections,
    memoryFiles,
    notes: CONFIG.notes,
  });

  const agentsPath = path.join(repoRoot, 'AGENTS.md');
  let existing = null;

  try {
    existing = await fs.readFile(agentsPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  if (CHECK_MODE) {
    if (existing === null) {
      console.error('AGENTS.md is missing; run agents compiler.');
      process.exit(1);
    }
    if (existing !== document) {
      console.error('AGENTS.md is out of date. Run agents compiler to regenerate.');
      process.exit(1);
    }
    return;
  }

  if (existing === document) {
    return;
  }

  await fs.writeFile(agentsPath, document, 'utf8');
}

ensureAgentsDocument().catch((error) => {
  console.error(error);
  process.exit(1);
});
