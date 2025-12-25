---
description: Show current feature pipeline status (phase, gates passed/pending, artifacts)
arguments:
  - name: feature-name
    description: Feature to check (defaults to most recent if omitted)
---

# Feature Pipeline Status

Display the current status of a feature in the development pipeline.

## Invocation

```
/feature-status
/feature-status player-identity-enrollment
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

### Step 2: Display Status

Present the status in this format:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Feature Pipeline: {feature_id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current Phase: {current_phase} - {phase_name}
Status: {status}

Gates:
  {for each gate in order}
  ✅ {gate_name} (passed)
  ⏳ {gate_name} (current)
  ⬜ {gate_name} (pending)

Artifacts:
  Feature Boundary: {path or "(pending)"}
  Feature Brief:    {path or "(pending)"}
  PRD:              {path or "(pending)"}
  SEC Note:         {path or "(pending)"}
  ADR:              {path or "(pending)"}
  EXEC-SPEC:        {path or "(pending)"}
  DoD Gates:        {path or "(pending)"}

Last Updated: {timestamp}

Next Action: {description of what to do next based on current phase}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Phase Name Mapping

| Phase | Name |
|-------|------|
| 0 | SRM-First Ownership |
| 1 | Feature Brief |
| 2 | PRD |
| 3 | SEC Note |
| 4 | ADR (if needed) |
| 5 | EXEC-SPEC + DoD |
| 6 | Execute |

### Next Action Mapping

| Phase | Next Action |
|-------|-------------|
| 0 | Complete ownership analysis and Feature Boundary |
| 1 | Write Feature Brief with 5+ non-goals |
| 2 | Create PRD with testable acceptance criteria |
| 3 | Complete SEC Note covering assets/threats/controls |
| 4 | Freeze ADR with durable decisions only |
| 5 | Create EXEC-SPEC + DoD with CI-executable gates |
| 6 | Execute workstreams via prd-pipeline |

## References

- Main skill: `.claude/skills/feature-pipeline/SKILL.md`
- Checkpoints: `.claude/skills/feature-pipeline/checkpoints/`
