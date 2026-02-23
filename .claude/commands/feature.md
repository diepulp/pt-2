---
description: Start new or resume existing feature design pipeline (unified command)
arguments:
  - name: feature-name
    description: kebab-case feature identifier (e.g., csv-player-import) or "status" for read-only display
---

# Feature Pipeline (Unified)

Start a new feature or resume an existing one through the design-time pipeline.

## Invocation

```
/feature csv-player-import
/feature csv-player-import          # resumes if checkpoint exists
/feature status                     # read-only status display
```

## Arguments

- `$ARGUMENTS` - Feature name in kebab-case, or `status` for read-only display

## Smart Detection Logic

```
If $ARGUMENTS == "status":
  -> display status (read-only, same as /feature-status)

If checkpoint exists for $ARGUMENTS:
  -> resume from last phase
  -> re-check current gate if previously failed

If no checkpoint exists:
  -> start new pipeline at Phase 0
  -> create checkpoint
```

## Pipeline Overview

This command drives a 6-phase design-only pipeline:

```
Phase 0: SRM Check           -> Gate: srm-ownership
Phase 1: Feature Scaffold    -> Gate: scaffold-approved
Phase 2: Design Brief / RFC  -> Gate: design-approved
Phase 3: SEC Note            -> Gate: sec-approved
Phase 4: ADR(s)              -> Gate: adr-frozen
Phase 5: PRD                 -> Gate: prd-approved
HANDOFF -> /build PRD-###
```

## Action

### Path A: Status Display

If `$ARGUMENTS` is `status`:
- List all checkpoint files in `.claude/skills/feature-pipeline/checkpoints/`
- Load the most recently modified checkpoint
- Display status (see `/feature-status` format)
- Exit

### Path B: Resume Existing Feature

If checkpoint exists at `.claude/skills/feature-pipeline/checkpoints/$ARGUMENTS.json`:

1. Load checkpoint
2. Display resume context:

```
---------------------------------------------
Resuming Feature Pipeline: {feature_id}
---------------------------------------------

Last saved: {timestamp}
Current Phase: {current_phase} - {phase_name}

Gates Passed:
  {list of passed gates}

Pending Gates:
  {list of pending gates}

Artifacts Created:
  {list of non-null artifacts}

Resuming from: {phase_name}
---------------------------------------------
```

3. Re-check current gate if previously failed
4. Continue from `current_phase` (see Phase Execution below)

### Path C: Start New Feature

If no checkpoint exists:

#### Step 1: Initialize Checkpoint

Create checkpoint at `.claude/skills/feature-pipeline/checkpoints/$ARGUMENTS.json`:

```json
{
  "feature_id": "$ARGUMENTS",
  "current_phase": 0,
  "status": "initialized",
  "gates_passed": [],
  "gates_pending": ["srm-ownership", "scaffold-approved", "design-approved", "sec-approved", "adr-frozen", "prd-approved"],
  "artifacts": {
    "feature_boundary": null,
    "scaffold": null,
    "design_brief": null,
    "sec_note": null,
    "adr": null,
    "prd": null
  },
  "timestamp": "<current ISO timestamp>"
}
```

#### Step 2: Execute Phase 0 - SRM-First Ownership

1. Load SRM from `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
2. Identify owning bounded context(s)
3. Determine writes (tables/RPCs), reads, cross-context contracts
4. Generate ownership sentence:

> "This feature belongs to **{OwnerService}** and may only touch **{Writes}**; cross-context needs go through **{Contracts}**."

5. Create `docs/20-architecture/specs/$ARGUMENTS/FEATURE_BOUNDARY.md` using `.claude/skills/feature-pipeline/references/feature-boundary-template.md`

#### Step 3: Gate Approval

```
---------------------------------------------
Feature Pipeline: $ARGUMENTS
Phase 0: SRM-First Ownership
---------------------------------------------

Ownership Sentence:
  This feature belongs to **{Service}** and may only touch
  **{Tables/RPCs}**; cross-context needs go through **{Contracts}**.

Feature Boundary created:
  docs/20-architecture/specs/$ARGUMENTS/FEATURE_BOUNDARY.md

Gate: srm-ownership
Is this ownership correct? [y/n/edit]
---------------------------------------------
```

#### Step 4: On Approval

1. Update checkpoint: add gate to `gates_passed`, increment `current_phase`
2. Continue to next phase

## Phase Execution

Based on `current_phase`, execute the appropriate workflow:

| Phase | Name | Action |
|-------|------|--------|
| 0 | SRM Check | Load SRM, generate ownership sentence, create FEATURE_BOUNDARY.md |
| 1 | Feature Scaffold | Use `docs/01-scaffolds/TEMPLATE.md`, create `docs/01-scaffolds/SCAFFOLD-###-{slug}.md` |
| 2 | Design Brief / RFC | Delegate to `lead-architect` skill, create `docs/02-design/RFC-###-{slug}.md` |
| 3 | SEC Note | Use `references/sec-note-template.md`, create SEC_NOTE.md |
| 4 | ADR(s) | Delegate to `lead-architect` skill, create `docs/80-adrs/ADR-###-{slug}.md` |
| 5 | PRD | Delegate to `prd-writer` skill, create `docs/10-prd/PRD-###-{slug}.md` |

After each phase, present gate for approval. On approval, update checkpoint and continue.

On Phase 5 approval, display handoff:

```
---------------------------------------------
Feature Design Complete: {feature-name}
---------------------------------------------

Artifacts:
  [PASS] Scaffold: docs/01-scaffolds/SCAFFOLD-###-{slug}.md
  [PASS] RFC:      docs/02-design/RFC-###-{slug}.md
  [PASS] SEC Note: docs/20-architecture/specs/{feature}/SEC_NOTE.md
  [PASS] ADR(s):   docs/80-adrs/ADR-###-{slug}.md
  [PASS] PRD:      docs/10-prd/PRD-###-{slug}.md

Next: /build PRD-###
---------------------------------------------
```

## Gate Validation Criteria

| Gate | Key Checks |
|------|------------|
| `srm-ownership` | Ownership sentence references SRM, tables/RPCs listed |
| `scaffold-approved` | 2+ options with tradeoffs, constraints listed |
| `design-approved` | Direction proposed, ADR-worthy decisions named |
| `sec-approved` | Assets/threats/controls/deferred risks documented |
| `adr-frozen` | Only durable decisions, no implementation SQL/code |
| `prd-approved` | Testable acceptance criteria, references ADR IDs |

## References

- Main skill: `.claude/skills/feature-pipeline/SKILL.md`
- Feature Boundary template: `.claude/skills/feature-pipeline/references/feature-boundary-template.md`
- Scaffold template: `docs/01-scaffolds/TEMPLATE.md`
- RFC template: `docs/02-design/TEMPLATE.md`
- SEC Note template: `.claude/skills/feature-pipeline/references/sec-note-template.md`
- SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- GOV-010: `docs/70-governance/FEATURE-DEVELOPMENT-GATE.md`
