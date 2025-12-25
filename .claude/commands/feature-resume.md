---
description: Resume feature pipeline from last checkpoint
arguments:
  - name: feature-name
    description: Feature to resume (defaults to most recent if omitted)
---

# Feature Pipeline Resume

Resume a feature pipeline from its last saved checkpoint.

## Invocation

```
/feature-resume
/feature-resume player-identity-enrollment
```

## Arguments

- `$ARGUMENTS` - Feature name (optional, defaults to most recent checkpoint)

## Action

Execute the following workflow:

### Step 1: Load Checkpoint

If `$ARGUMENTS` is provided:
- Load checkpoint from `.claude/skills/feature-pipeline/checkpoints/$ARGUMENTS.json`

If no argument:
- List all checkpoint files in `.claude/skills/feature-pipeline/checkpoints/`
- Load the most recently modified checkpoint

If no checkpoint found:
- Display: "No active feature pipeline found. Use `/feature-start <name>` to begin."
- Exit

### Step 2: Display Resume Context

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Resuming Feature Pipeline: {feature_id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Last saved: {timestamp}
Current Phase: {current_phase} - {phase_name}

Gates Passed:
  {list of passed gates with ✅}

Pending Gates:
  {list of pending gates with ⬜}

Artifacts Created:
  {list of non-null artifacts}

Resuming from: {phase_name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 3: Continue Pipeline

Based on `current_phase`, execute the appropriate phase workflow:

| Phase | Action |
|-------|--------|
| 0 | Continue SRM-First Ownership analysis |
| 1 | Continue Feature Brief creation (use template from `references/feature-brief-template.md`) |
| 2 | Continue PRD creation (delegate to `prd-writer` skill) |
| 3 | Continue SEC Note creation (use template from `references/sec-note-template.md`) |
| 4 | Continue ADR creation (delegate to `lead-architect` skill) |
| 5 | Continue EXEC-SPEC + DoD creation (use template from `references/dod-gate-template.md`) |
| 6 | Continue execution (delegate to `prd-pipeline` skill via `/prd-execute`) |

### Step 4: Gate Handling

After completing phase work, present the gate for approval:

```
Gate: {gate_name}
Approve to continue? [y/n/edit]
```

On approval:
1. Update checkpoint with gate passed
2. Increment phase
3. Continue to next phase

On rejection:
1. Accept feedback
2. Revise artifacts
3. Re-present for approval

## References

- Main skill: `.claude/skills/feature-pipeline/SKILL.md`
- Checkpoints: `.claude/skills/feature-pipeline/checkpoints/`
