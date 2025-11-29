# Session Continuity Guide

This skill is designed for potentially long-running architectural sessions. This guide covers how to preserve session state across context resets.

## When to Save Checkpoints

Save a checkpoint when:
- You've made significant progress and want to preserve state
- The user requests `/clear` to reset context
- Completing a natural breakpoint (phase complete)
- Ending a work session

## Checkpoint Workflow

```
1. Working on architectural task...
   - Making decisions
   - Modifying files
   - Passing validation gates

2. Ready to checkpoint (natural breakpoint or user request)
   - Run /arch-checkpoint save

3. /clear (if needed)
   - Context window reset

4. /arch-checkpoint restore
   - Session context restored

5. Continue from next_steps...
```

## Slash Command Reference

- **`/arch-checkpoint save`** - Save current session state before /clear
- **`/arch-checkpoint restore`** - Resume from last checkpoint after /clear

## Saving a Checkpoint

```python
from lib.memori import create_memori_client, ArchitectContext

memori = create_memori_client("skill:lead-architect")
memori.enable()
context = ArchitectContext(memori)

context.save_checkpoint(
    current_task="[Current architectural task]",
    reason="manual",  # or "session_end"
    decisions_made=["Decision 1", "Decision 2"],
    files_modified=["file1.md", "file2.ts"],
    validation_gates_passed=[1, 2],
    open_questions=["Outstanding question?"],
    next_steps=["Next action 1", "Next action 2"],
    key_insights=["Key learning from session"],
    spec_file="path/to/active/spec.md",
    workflow="active-workflow-name",
    notes="Additional context for resume"
)
```

## Restoring a Session

After `/clear`, restore session context:

```python
from lib.memori import create_memori_client, ArchitectContext

memori = create_memori_client("skill:lead-architect")
memori.enable()
context = ArchitectContext(memori)

# Load and display formatted checkpoint
resume_context = context.format_checkpoint_for_resume()
print(resume_context)
```

The formatted output includes:
- Current task that was in progress
- Decisions made this session
- Files modified
- Validation gates passed
- Open questions requiring user input
- Next steps to continue
- Key insights learned

## Key Methods

```python
# Save checkpoint
context.save_checkpoint(
    current_task="...",
    reason="manual",
    # ... other fields
)

# Load and format for resume
resume_text = context.format_checkpoint_for_resume()

# Get raw checkpoint data
checkpoint = context.load_latest_checkpoint()

# Count saved checkpoints
count = context.get_checkpoint_count()
```

## Database Namespace

- **Client key:** `skill:lead-architect`
- **Database user_id:** `skill_lead_architect`
- **Checkpoint type:** `metadata->>'type' = 'session_checkpoint'`
