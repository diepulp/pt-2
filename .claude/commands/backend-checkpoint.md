---
description: Save or restore backend-service-builder session checkpoint for context continuity across /clear
argument-hint: [save|restore]
allowed-tools: Bash, Read, SlashCommand
---

# Backend Service Builder Session Checkpoint

**Action:** `$ARGUMENTS`

Execute the checkpoint action based on the argument provided.

## Instructions

### If argument is "restore" (or empty/default)

Immediately run this Python code to restore the session:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client, BackendServiceContext

memori = create_memori_client("skill:backend-service-builder")
memori.enable()
context = BackendServiceContext(memori)

checkpoint = context.load_latest_checkpoint()
if checkpoint:
    print(context.format_checkpoint_for_resume(checkpoint))
    print("\n✅ Session restored. Continue from the next steps above.")
else:
    print("❌ No checkpoint found in skill_backend_service_builder namespace.")
    print("Save a checkpoint first with: /backend-checkpoint save")
EOF
```

After running the code, summarize:

- The current task that was in progress
- The service being worked on (if any)
- The pattern being used (if any)
- The next steps to continue with
- Any open questions that need resolution

---

### If argument is "save"

Before saving, gather the current session state:

1. What task is currently being worked on?
2. What service is being built/modified?
3. What pattern is being used (Pattern A/B/C)?
4. What decisions have been made?
5. What files have been modified?
6. What validation gates have been passed?
7. What questions remain open?
8. What are the next steps?

Then run Python code to save the checkpoint with the gathered information:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client, BackendServiceContext

memori = create_memori_client("skill:backend-service-builder")
memori.enable()
context = BackendServiceContext(memori)

# FILL IN with current session state
result = context.save_checkpoint(
    current_task="[FILL: Current task description]",
    reason="manual",
    service_name="[FILL: Service name or None]",
    pattern_used="[FILL: Pattern A/B/C or None]",
    decisions_made=[
        # [FILL: Decisions made]
    ],
    files_modified=[
        # [FILL: Files modified]
    ],
    validation_gates_passed=[],
    open_questions=[
        # [FILL: Open questions]
    ],
    next_steps=[
        # [FILL: Next steps]
    ],
    key_insights=[
        # [FILL: Key insights]
    ],
    workflow=None,
    notes=""
)

if result:
    print("✅ Checkpoint saved successfully!")
    print("You can now safely run /clear")
    print("After /clear, run '/backend-checkpoint restore' to resume")
else:
    print("❌ Checkpoint save failed!")
EOF
```

---

## Quick Reference

| Command                       | Purpose                     |
| ----------------------------- | --------------------------- |
| `/backend-checkpoint restore` | Resume session after /clear |
| `/backend-checkpoint save`    | Save state before /clear    |

---

## Integration with Self-Improving Intelligence

The BackendServiceContext also provides:

- **Pattern effectiveness tracking**: `context.calculate_pattern_effectiveness("Pattern A")`
- **Adaptive recommendations**: `context.get_adaptive_recommendation(task_type, domain, complexity)`
- **Regression detection**: `context.detect_pattern_regressions()`
- **Primitive update proposals**: `context.get_pending_primitive_updates()`

Use these after restoring to check for any system learnings that might affect your current task.

---

## When to Use Checkpoints

### Context Threshold (60%)

When context usage approaches 60%:

1. Proactively suggest checkpoint save
2. Save checkpoint with reason `context_threshold_60pct`
3. Inform user context is high and recommend `/clear`
4. After `/clear`, restore checkpoint to resume

### Long Service Creation Sessions

For extended service implementation work:

- Save checkpoints at natural breakpoints (after migration, after service code)
- Use reason `manual` for these intermediate saves

### Before Validation

Before running validation scripts:

- Checkpoint current state
- If validation fails, checkpoint provides context for debugging

---

## Database Namespace

- **Client key:** `skill:backend-service-builder`
- **Database user_id:** `skill_backend_service_builder`
- **Checkpoint type:** `metadata->>'type' = 'session_checkpoint'`
