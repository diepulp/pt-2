---
description: Start a new feature development pipeline at Phase 0 (SRM-First Ownership)
arguments:
  - name: feature-name
    description: kebab-case feature identifier (e.g., player-identity-enrollment)
---

# Feature Pipeline Start

Start a new feature through the linear development pipeline with explicit boundaries and executable gates.

## Invocation

```
/feature-start player-identity-enrollment
/feature-start table-session-management
```

## Arguments

- `$ARGUMENTS` - Feature name in kebab-case (e.g., `player-identity-enrollment`)

## Pipeline Overview

This command initiates a 7-phase linear pipeline:

```
Phase 0: SRM-First Ownership  → Gate: srm-ownership
Phase 1: Feature Brief        → Gate: brief-approved
Phase 2: PRD                  → Gate: prd-approved
Phase 3: SEC Note             → Gate: sec-approved
Phase 4: ADR (if needed)      → Gate: adr-frozen
Phase 5: EXEC-SPEC + DoD      → Gate: dod-executable
Phase 6: Execute              → Gate: implementation-complete
```

## Action

Execute the following workflow for `$ARGUMENTS`:

### Step 1: Initialize Feature Directory

```bash
mkdir -p docs/20-architecture/specs/$ARGUMENTS
```

### Step 2: Initialize Checkpoint

Create checkpoint file at `.claude/skills/feature-pipeline/checkpoints/$ARGUMENTS.json`:

```json
{
  "feature_id": "$ARGUMENTS",
  "current_phase": 0,
  "status": "initialized",
  "gates_passed": [],
  "gates_pending": ["srm-ownership", "brief-approved", "prd-approved", "sec-approved", "adr-frozen", "dod-executable", "implementation-complete"],
  "artifacts": {
    "feature_boundary": null,
    "feature_brief": null,
    "prd": null,
    "sec_note": null,
    "adr": null,
    "exec_spec": null,
    "dod_gates": null
  },
  "timestamp": "<current ISO timestamp>"
}
```

### Step 3: Execute Phase 0 - SRM-First Ownership

1. Load the Service Responsibility Matrix from `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
2. Identify which bounded context(s) own this feature
3. Determine:
   - **Owning Service(s)**: Which service(s) have write authority
   - **Tables/RPCs Modified**: What data this feature touches
   - **Cross-Context Contracts**: DTOs/RPCs needed for external communication
4. Generate an ownership sentence:

> "This feature belongs to **{OwnerService}** and may only touch **{Writes}**; cross-context needs go through **{Contracts}**."

5. Create `docs/20-architecture/specs/$ARGUMENTS/FEATURE_BOUNDARY.md` using the template from `.claude/skills/feature-pipeline/references/feature-boundary-template.md`

### Step 4: Gate Approval

Present the ownership sentence and Feature Boundary to the user:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Feature Pipeline: $ARGUMENTS
Phase 0: SRM-First Ownership
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ownership Sentence:
  This feature belongs to **{Service}** and may only touch
  **{Tables/RPCs}**; cross-context needs go through **{Contracts}**.

Feature Boundary created:
  docs/20-architecture/specs/$ARGUMENTS/FEATURE_BOUNDARY.md

Gate: srm-ownership
Is this ownership correct? [y/n/edit]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 5: On Approval

If approved:
1. Update checkpoint: add `srm-ownership` to `gates_passed`, increment `current_phase` to 1
2. Proceed to Phase 1: Feature Brief
3. Use template from `.claude/skills/feature-pipeline/references/feature-brief-template.md`

If rejected:
1. Accept feedback and revise the ownership sentence
2. Re-present for approval

## References

- Main skill: `.claude/skills/feature-pipeline/SKILL.md`
- Feature Boundary template: `.claude/skills/feature-pipeline/references/feature-boundary-template.md`
- Feature Brief template: `.claude/skills/feature-pipeline/references/feature-brief-template.md`
- SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
