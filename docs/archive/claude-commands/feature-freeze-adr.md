---
description: Freeze ADR as decision-only document (Phase 4 gate)
arguments:
  - name: adr-id
    description: ADR identifier (e.g., ADR-022)
---

# Feature Freeze ADR

Separate durable decisions from implementation details in an ADR. This is feature-pipeline's Phase 4 gate (`adr-frozen`).

EXEC-SPEC and DoD generation happen later via `/build` — this command does NOT produce those artifacts.

## Invocation

```
/feature-freeze-adr ADR-022
```

## Arguments

- `$ARGUMENTS` - ADR identifier (e.g., `ADR-022`)

## Why Freeze?

ADRs that contain implementation details become "living documents" that never close. By separating:

- **Durable decisions** (hard to reverse, reused widely) → ADR (frozen)
- **Implementation details** (mutable, sprint-level) → flagged for build-pipeline extraction

The ADR becomes a stable reference while implementation can evolve independently.

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

**ADR-Worthy (Keep — Durable Decisions):**
- Context and problem statement
- Decision rationale
- Alternatives considered and rejected
- Security invariants (INV-1, INV-2, etc.)
- Bounded context ownership declarations
- Access control matrices
- Consequences and trade-offs

**Implementation Details (Flag for build-pipeline):**
- Schema definitions (CREATE TABLE, indexes)
- RLS policy SQL (USING/WITH CHECK clauses)
- Trigger and function bodies
- Migration steps
- API endpoint specifications
- UI component specifications
- Test file paths

### Step 3: Rewrite ADR as Decision-Only

Produce `docs/80-adrs/$ARGUMENTS_DECISIONS.md` (or update in-place if the ADR is already well-structured):

```markdown
# ADR-{id}: {Title}

**Status:** Accepted (Frozen)
**Date:** {date}
**Decision Scope:** {feature boundary reference}

## Context
{Problem statement — why this decision was needed}

## Decision
{Clear statement of what was decided}

## Consequences
{Trade-offs accepted}

## Security Invariants
{INV-1, INV-2, etc. — durable security rules}

## Alternatives Considered
{What was rejected and why}

## Implementation Notes
> The following implementation details were identified during freeze
> and should be extracted into an EXEC-SPEC by build-pipeline:
>
> - {brief list of implementation sections removed}

## References
- Feature Boundary: {path}
```

If the ADR already contains only durable decisions (no SQL, no triggers, no migration steps), mark it as frozen without rewriting.

### Step 4: Update References

1. Update SRM references if ADR path changed
2. Update any documents that reference the old ADR structure

### Step 5: Update Feature Checkpoint

If a feature checkpoint exists for this ADR:
1. Set `gates.adr-frozen.passed` to `true` with current timestamp
2. Update `artifacts.adr` path

### Step 6: Present Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADR Freeze Complete: $ARGUMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Created/Updated:
  ✅ ADR-{id}_DECISIONS.md (frozen, durable decisions only)

Implementation details flagged for build-pipeline extraction.

Gate: adr-frozen ✅
ADR now contains only durable decisions.

Next: Complete Phase 5 (PRD) or hand off via /build PRD-###
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## References

- Main skill: `.claude/skills/feature-pipeline/SKILL.md`
- Build pipeline (for EXEC-SPEC + DoD): `.claude/skills/build-pipeline/SKILL.md`
