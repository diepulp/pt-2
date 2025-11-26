---
description: Log a validation gate passage and create memory checkpoint
args:
  - name: gate_number
    description: The validation gate number (1, 2, 3, etc.)
    required: true
  - name: description
    description: Description of what was validated
    required: false
---

Log a validation gate passage and trigger a memory extraction checkpoint.

## What This Does

1. **Logs the gate** - Records validation gate event in `context.session_events`
2. **Updates state** - Adds gate number to `validation_gates_passed` in scratchpad
3. **Creates checkpoint** - Triggers memory extraction for events since last gate
4. **Preserves context** - Ensures key decisions are captured before next phase

## When to Use

- After user approves a validation gate in a workflow
- At phase completion checkpoints
- When transitioning between chatmodes in a workflow
- After significant architectural decisions are finalized

## Arguments

- `$ARGUMENTS` - Gate number and optional description
- Example: `1 Schema design approved`
- Example: `2 Implementation complete`

## Execution

Run the validation gate hook:

```bash
"$CLAUDE_PROJECT_DIR"/.claude/hooks/context-validation-gate.sh $GATE_NUMBER "$DESCRIPTION"
```

## Example Usage

After user says "approved" at Gate 1:
```
/validation-gate 1 Schema design approved
```

After implementation review passes:
```
/validation-gate 2 Service implementation complete, tests passing
```

## Notes

- Creates a checkpoint summary for the session
- Memory pipeline extracts learnings from events since last gate
- Validation gates are recorded in session scratchpad for handoff context
