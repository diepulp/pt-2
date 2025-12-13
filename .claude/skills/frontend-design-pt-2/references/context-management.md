# Context Threshold Management

**When to read**: Reference this file when context usage approaches 60% and session state must be preserved before `/clear`.

---

## Context Awareness Protocol

This skill supports long-running frontend implementation sessions. When context usage approaches **60%** of the context window, proactively manage session continuity.

### Step 1: Announce Threshold

When context is approaching 60%:

```
Context Usage Alert: Approaching 60% threshold.
Recommend saving checkpoint before /clear to preserve session state.
```

### Step 2: Save Checkpoint

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:frontend-design")
memori.enable()
context = SkillContext(memori)

context.save_checkpoint(
    current_task="[Current frontend task]",
    reason="context_threshold_60pct",
    decisions_made=["Aesthetic direction", "Component patterns"],
    files_modified=["component.tsx", "styles.css"],
    open_questions=["Outstanding design question?"],
    next_steps=["Next action 1", "Next action 2"],
    key_insights=["Key learning from session"],
    workflow="component-creation",
    notes="Additional context for resume"
)
```

### Step 3: Inform User

```
Checkpoint saved. Session state persisted to Memori.

You can now run /clear to reset context. After clearing:
- Run `/frontend-checkpoint restore` to resume from checkpoint
- Or start fresh with new context
```

---

## Post-Clear Session Resume

After `/clear`, restore session context immediately:

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:frontend-design")
memori.enable()
context = SkillContext(memori)

# Load and display formatted checkpoint
resume_context = context.format_checkpoint_for_resume()
print(resume_context)
```

---

## Slash Command Reference

| Command | Purpose |
|---------|---------|
| `/frontend-checkpoint save` | Save current session state before /clear |
| `/frontend-checkpoint restore` | Resume from last checkpoint after /clear |
