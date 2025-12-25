---
description: Freeze ADR as decision-only document, extract EXEC-SPEC and DoD
arguments:
  - name: adr-id
    description: ADR identifier (e.g., ADR-022)
---

# Feature Freeze ADR

Refactor an ADR into its canonical three-part structure:
1. **ADR-{id}_DECISIONS.md** - Frozen durable decisions only
2. **EXEC-SPEC-{id}.md** - Mutable implementation details
3. **DOD-{id}.md** - Executable gate checklist

## Invocation

```
/feature-freeze-adr ADR-022
```

## Arguments

- `$ARGUMENTS` - ADR identifier (e.g., `ADR-022`)

## Why Freeze?

ADRs that contain implementation details become "living documents" that never close. By separating:

- **Durable decisions** (hard to reverse, reused widely) → ADR (frozen)
- **Implementation details** (mutable, sprint-level) → EXEC-SPEC
- **Closure criteria** (CI-executable) → DoD

The ADR becomes a stable reference while implementation can evolve.

## Action

Execute the following workflow for `$ARGUMENTS`:

### Step 1: Locate ADR Documents

Search for existing ADR files:
```
docs/80-adrs/$ARGUMENTS*.md
docs/20-architecture/specs/$ARGUMENTS/**/*.md
```

### Step 2: Analyze ADR Content

Categorize each section of the existing ADR(s):

**ADR-Worthy (Durable Decisions):**
- Context and problem statement
- Decision rationale
- Alternatives considered and rejected
- Security invariants (INV-1, INV-2, etc.)
- Bounded context ownership declarations
- Access control matrices
- Consequences and trade-offs

**EXEC-SPEC (Implementation Details):**
- Schema definitions (CREATE TABLE, indexes)
- RLS policy SQL (USING/WITH CHECK clauses)
- Trigger and function bodies
- Migration steps
- API endpoint specifications
- UI component specifications
- Test file paths

**DoD (Closure Gates):**
- Acceptance criteria (convert to assertions)
- Test requirements (convert to CI commands)
- Validation rules (convert to gate checks)

### Step 3: Create Three Documents

#### 3a. ADR-{id}_DECISIONS.md

Location: `docs/80-adrs/$ARGUMENTS_DECISIONS.md`

Structure:
```markdown
# ADR-{id}: {Title} - Decisions

**Status:** Accepted (Frozen)
**Date:** {date}
**Decision Scope:** {feature boundary reference}

## Context
{Problem statement - why this decision was needed}

## Decision
{Clear statement of what was decided}

## Consequences
{Trade-offs accepted}

## Security Invariants
{INV-1, INV-2, etc. - durable security rules}

## Alternatives Considered
{What was rejected and why}

## References
- Feature Boundary: {path}
- EXEC-SPEC: {path}
- DoD Gates: {path}
```

#### 3b. EXEC-SPEC-{id}.md

Location: `docs/20-architecture/specs/{feature-name}/EXEC-SPEC-{id}.md`

Structure:
```markdown
# EXEC-SPEC-{id}: {Title}

**ADR Reference:** ADR-{id}_DECISIONS.md
**Status:** Draft | In Progress | Complete

## Schema

{CREATE TABLE statements, indexes, constraints}

## RLS Policies

{Policy SQL with role matrix}

## RPCs/Functions

{Function signatures and bodies}

## API Endpoints

{Route handlers, DTOs, error codes}

## UI Changes

{Component specs, form states, error mapping}

## Migration Plan

{Steps, rollback strategy, data backfill}
```

#### 3c. DOD-{id}.md

Location: `docs/20-architecture/specs/{feature-name}/DOD-{id}.md`

Structure:
```markdown
# DOD-{id}: {Title} - Definition of Done

**EXEC-SPEC:** EXEC-SPEC-{id}.md
**ADR:** ADR-{id}_DECISIONS.md

## Gates

### A) Functional Gates

| ID | Assertion | Test File | CI Command |
|----|-----------|-----------|------------|
| A1 | {assertion} | {path} | {command} |

### B) Security Gates

| ID | Assertion | Test File | CI Command | Critical |
|----|-----------|-----------|------------|----------|
| B1 | {assertion} | {path} | {command} | Yes |

### C) Data Integrity Gates

| ID | Assertion | Test File | CI Command |
|----|-----------|-----------|------------|
| C1 | {assertion} | {path} | {command} |

### D) Operability Gates

| ID | Assertion | Test File | CI Command |
|----|-----------|-----------|------------|
| D1 | {assertion} | {path} | {command} |

## CI Integration

\`\`\`bash
# Run all DoD gates
npm test -- -t "ADR-{id}"
\`\`\`
```

### Step 4: Update References

1. Update SRM references if ADR path changed
2. Update any documents that reference the old ADR structure
3. Archive or delete superseded ADR versions

### Step 5: Update Feature Checkpoint

If a feature checkpoint exists for this ADR:
1. Add `adr-frozen` to `gates_passed`
2. Update `artifacts.adr` path
3. Update `artifacts.exec_spec` path
4. Update `artifacts.dod_gates` path

### Step 6: Present Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADR Freeze Complete: $ARGUMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Created:
  ✅ ADR-{id}_DECISIONS.md (frozen, durable decisions only)
  ✅ EXEC-SPEC-{id}.md (implementation details, mutable)
  ✅ DOD-{id}.md (executable gate checklist)

Archived:
  📦 {list of superseded files}

Gate: adr-frozen
ADR now contains only durable decisions.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## References

- Main skill: `.claude/skills/feature-pipeline/SKILL.md`
- DoD template: `.claude/skills/feature-pipeline/references/dod-gate-template.md`
