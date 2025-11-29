# Skill Primitive Standardization Guide

**Version**: 1.0.0
**Date**: 2025-11-27
**Status**: CANONICAL
**Applies To**: All Claude Code skills in `.claude/skills/`

---

## Purpose

This guide standardizes how skill primitives (reference documents) are structured, maintained, and validated across all PT-2 skills. It resolves documentation disarray by establishing:

1. **Tiered documentation architecture** - Clear separation between governance docs and skill primitives
2. **Single entry point pattern** - Every skill has a QUICK_START.md
3. **Freshness validation** - Primitives track source document hashes
4. **Reality-aligned content** - Primitives describe what's DEPLOYED, not aspirational

---

## The Problem This Solves

### Before Standardization

```
Sub-agent invoked → Loads SKILL.md (1400 lines) → References 5+ governance docs
→ Governance docs describe aspirational architecture → Sub-agent implements wrong patterns
→ Validation fails → Manual correction required → Context wasted
```

### After Standardization

```
Sub-agent invoked → Reads QUICK_START.md (100 lines) → Knows exact files to create
→ Primitives describe DEPLOYED patterns → Implementation matches reality
→ Validation passes → Freshness check prevents drift
```

---

## Tiered Documentation Architecture

### Tier 1: Skill Primitives (Sub-agent Context)

**Location**: `.claude/skills/{skill-name}/references/`
**Purpose**: Everything needed to execute the skill, compressed to ~500 lines total
**Audience**: Claude sub-agents

**Characteristics**:
- Actionable, not explanatory
- Describes DEPLOYED state, not aspirational
- Minimal context for maximum efficiency
- References Tier 2 for "why" questions

### Tier 2: Governance Documents (Human Reference)

**Location**: `docs/` (organized by SDLC taxonomy)
**Purpose**: Full specifications, rationale, architectural decisions
**Audience**: Human developers, architects

**Characteristics**:
- Comprehensive specifications
- Includes aspirational architecture
- Change history and rationale
- Cross-references between documents

### Tier 3: Generated/Derived (Automation)

**Location**: `.claude/skills/{skill-name}/generated/`
**Purpose**: Auto-generated from Tier 2, always fresh
**Audience**: Validation scripts, CI

**Characteristics**:
- Machine-readable (JSON)
- Source document hashes
- Extracted data (table ownership, patterns)

---

## Standard Skill Structure

Every skill MUST follow this directory structure:

```
.claude/skills/{skill-name}/
├── SKILL.md                     # Skill definition + Quick Start section
│
├── references/                  # Tier 1: Primitives
│   ├── QUICK_START.md          # REQUIRED: Single entry point
│   ├── {domain}-rules.md       # Condensed rules for the domain
│   ├── {pattern}-guide.md      # Pattern implementation details
│   └── validation-checklist.md # Pre-completion checklist
│
├── generated/                   # Tier 3: Derived
│   └── freshness-manifest.json # Source document hashes
│
└── scripts/                     # Automation
    ├── check_primitive_freshness.py  # Validates freshness
    └── {validation-scripts}          # Domain-specific validation
```

---

## QUICK_START.md Template

Every skill MUST have a `QUICK_START.md` as the single entry point:

```markdown
# {Skill Name} - Quick Start

**Purpose**: Single entry point for {what this skill does}.
**Read this first**, then reference other docs only as needed.

---

## Step 1: {First Decision Point}

{Decision tree or flowchart - max 20 lines}

---

## Step 2: {Key Information Lookup}

{Table or list of essential data - e.g., ownership, patterns}

---

## Step 3: {Implementation Steps}

{Numbered steps with code templates}

---

## Step 4: Validate

{Validation commands}

---

## Quick Reference: {Domain Rules}

{Condensed rules - max 20 lines}

---

## Anti-Patterns

| Anti-Pattern | Correct Pattern |
|--------------|-----------------|
| ... | ... |

---

## Need More Detail?

| Topic | Reference |
|-------|-----------|
| {Topic 1} | `{file}.md` |
| {Topic 2} | `{file}.md` |
```

**Constraints**:
- Maximum 150 lines
- No aspirational content
- Code examples must match DEPLOYED patterns
- Links to other primitives, not governance docs

---

## Freshness Manifest Specification

Every skill MUST have a `generated/freshness-manifest.json`:

```json
{
  "$schema": "./freshness-manifest.schema.json",
  "version": "1.0.0",
  "generated_at": "2025-11-27T00:00:00Z",
  "description": "Tracks source document hashes to detect primitive drift",

  "source_documents": {
    "{DOC_KEY}": {
      "path": "docs/{category}/{DOCUMENT}.md",
      "version": "X.Y.Z",
      "sha256": "{64-char-hash}",
      "last_verified": "YYYY-MM-DD",
      "derived_primitives": [
        "references/{primitive}.md"
      ]
    }
  },

  "primitives": {
    "references/{primitive}.md": {
      "sources": ["{DOC_KEY}"],
      "purpose": "Description of what this primitive provides",
      "created": "YYYY-MM-DD"
    }
  },

  "validation_rules": {
    "stale_threshold_days": 30,
    "on_stale": "warn",
    "on_hash_mismatch": "error"
  }
}
```

---

## Freshness Check Script Template

Every skill SHOULD have a `scripts/check_primitive_freshness.py`:

```python
#!/usr/bin/env python3
"""
Primitive Freshness Checker for {Skill Name}

Validates that skill primitives are in sync with source governance documents.
"""

import hashlib
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
SKILL_DIR = SCRIPT_DIR.parent
PROJECT_ROOT = SKILL_DIR.parent.parent.parent
MANIFEST_PATH = SKILL_DIR / 'generated' / 'freshness-manifest.json'


def sha256_file(filepath: Path) -> str:
    if not filepath.exists():
        return "FILE_NOT_FOUND"
    sha256_hash = hashlib.sha256()
    with open(filepath, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def check_freshness():
    with open(MANIFEST_PATH, 'r') as f:
        manifest = json.load(f)

    errors = 0
    for doc_key, doc_info in manifest.get('source_documents', {}).items():
        doc_path = PROJECT_ROOT / doc_info['path']
        expected_hash = doc_info['sha256']
        actual_hash = sha256_file(doc_path)

        if actual_hash != expected_hash:
            print(f"ERROR: {doc_key} has changed!")
            print(f"  Primitives may be stale: {doc_info.get('derived_primitives', [])}")
            errors += 1
        else:
            print(f"OK: {doc_key}")

    return errors


if __name__ == '__main__':
    sys.exit(1 if check_freshness() > 0 else 0)
```

---

## SKILL.md Quick Start Section

Every SKILL.md MUST begin with a Quick Start section pointing to QUICK_START.md:

```markdown
# {Skill Name}

## Quick Start

**START HERE**: Read `references/QUICK_START.md` for the fastest path to implementation.

```
references/
├── QUICK_START.md      ← START HERE (single entry point)
├── {rules}.md          ← {Description}
├── {patterns}.md       ← {Description}
└── validation-checklist.md
```

### Pre-flight Check (Optional)

```bash
python .claude/skills/{skill-name}/scripts/check_primitive_freshness.py
```

---

## Overview
...
```

---

## Primitive Content Guidelines

### DO Include

- **Decision trees** for pattern selection
- **Tables** for quick lookup (ownership, patterns, anti-patterns)
- **Code templates** matching DEPLOYED implementation
- **Checklists** for validation
- **Links** to other primitives in the same skill

### DO NOT Include

- **Aspirational architecture** not yet implemented
- **Full rationale** (belongs in Tier 2 governance docs)
- **Change history** (belongs in Tier 2)
- **Duplicate content** from other primitives
- **Links to governance docs** in main flow (only in "Need More Detail?" section)

### Handling Aspirational Content

When source documents contain aspirational architecture:

1. **Mark clearly** in primitive: "Target structure (0% adoption currently)"
2. **Show deployed structure first**, aspirational second
3. **Include trigger conditions**: "Extract to separate file when..."
4. **Reference governance doc** for full aspirational spec

Example:
```markdown
### Current Implementation (DEPLOYED)

```
services/{domain}/
├── keys.ts
├── {feature}.ts
└── README.md
```

### Target Structure (SLAD §308-348, 0% adoption)

When to evolve: Service consumed by 2+ other services.
See `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` for full spec.
```

---

## Standardization Checklist

Use this checklist when standardizing a skill:

### Phase 1: Quick Wins (~1.5 hours)

- [ ] Create `references/QUICK_START.md` (single entry point)
- [ ] Create condensed rules file (e.g., `dto-rules.md`)
- [ ] Update `SKILL.md` with Quick Start section pointing to QUICK_START.md
- [ ] Add aspirational header to any phantom documentation

### Phase 2: Simplification (~4 hours)

- [ ] Simplify pattern/guide files (remove aspirational, keep deployed)
- [ ] Simplify reference files (extract essential tables/rules only)
- [ ] Create `generated/freshness-manifest.json` with source hashes
- [ ] Create `scripts/check_primitive_freshness.py`

### Phase 3: Automation (Optional, ~7 hours)

- [ ] Create extraction scripts for data from governance docs
- [ ] Add CI validation: primitives vs source docs
- [ ] Integrate freshness check into skill pre-flight

---

## Skills Requiring Standardization

| Skill | Status | Priority | Notes |
|-------|--------|----------|-------|
| `backend-service-builder` | ✅ DONE | - | Reference implementation |
| `frontend-design` | ✅ DONE | - | QUICK_START, frontend-rules, freshness manifest |
| `lead-architect` | ✅ DONE | - | QUICK_START, architecture-rules, freshness manifest |
| `api-builder` | ⏳ TODO | Medium | Newer skill, may be closer to standard |
| `skill-creator` | ⏳ TODO | Low | Meta-skill, update to reference this guide |

---

## Measuring Success

### Context Efficiency

| Metric | Target | Measurement |
|--------|--------|-------------|
| QUICK_START.md lines | ≤150 | `wc -l references/QUICK_START.md` |
| Total primitive lines | ≤500 | `wc -l references/*.md` |
| Context reduction | ≥50% | Compare before/after |

### Freshness

| Metric | Target | Measurement |
|--------|--------|-------------|
| Source docs tracked | 100% | `jq '.source_documents | keys | length' freshness-manifest.json` |
| Hash mismatches | 0 | `check_primitive_freshness.py` exit code |
| Stale primitives | 0 warnings | `check_primitive_freshness.py` output |

### Implementation Accuracy

| Metric | Target | Measurement |
|--------|--------|-------------|
| Pattern match to deployed | 100% | Manual audit |
| Aspirational content labeled | 100% | Manual audit |
| Validation script coverage | ≥80% | Script existence check |

---

## Reference Implementation

The `backend-service-builder` skill serves as the reference implementation:

```
.claude/skills/backend-service-builder/
├── SKILL.md                              # Quick Start section at top
├── references/
│   ├── QUICK_START.md                   # 100 lines, single entry point
│   ├── dto-rules.md                     # 100 lines, condensed rules
│   ├── service-patterns.md              # 257 lines (was 349)
│   ├── bounded-contexts.md              # 112 lines (was 278)
│   ├── validation-checklist.md
│   └── migration-workflow.md
├── generated/
│   └── freshness-manifest.json          # Tracks 4 source documents
└── scripts/
    ├── check_primitive_freshness.py     # Validates freshness
    ├── validate_service_structure.py
    └── check_doc_consistency.py
```

---

## Governance

### Ownership

- **Pattern Owner**: Lead Architect
- **Implementation**: Skill maintainers
- **Validation**: CI/CD pipeline (future)

### Change Process

1. Update governance doc (Tier 2)
2. Freshness check fails (hash mismatch)
3. Review primitive for required updates
4. Update primitive to reflect changes
5. Update manifest with new hash
6. Freshness check passes

### Exceptions

If a skill cannot follow this structure, document the exception in the skill's SKILL.md with rationale.

---

## References

- **Backend Service Builder** (reference implementation): `.claude/skills/backend-service-builder/`
- **Context Engineering**: `docs/context-engineering/`
- **SDLC Documentation Taxonomy**: `docs/SDLC_DOCS_TAXONOMY.md`

---

**End of Guide**
