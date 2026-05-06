---
description: Save or restore lead-architect session checkpoint for context continuity across /clear
argument-hint: [save|restore]
allowed-tools: Bash, Read, SlashCommand
---

# Lead Architect Session Checkpoint

**Action:** `$ARGUMENTS`

Execute the checkpoint action based on the argument provided.

## Instructions

### If argument is "restore" (or empty/default)

Immediately run this Python code to restore the session:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import ArchitectContext

memori = create_memori_client("skill:lead-architect")
memori.enable()
context = ArchitectContext(memori)

checkpoint = context.load_latest_checkpoint()
if checkpoint:
    print(context.format_checkpoint_for_resume(checkpoint))
    print("\n✅ Session restored. Continue from the next steps above.")
else:
    print("❌ No checkpoint found in skill_lead_architect namespace.")
    print("Save a checkpoint first with: /arch-checkpoint save")
EOF
```

After running the code, summarize:
- The current task that was in progress
- The next steps to continue with
- Any open questions that need resolution

---

### If argument is "save"

Before saving, gather the current session state:
1. What task is currently being worked on?
2. What decisions have been made?
3. What files have been modified?
4. What validation gates have been passed?
5. What questions remain open?
6. What are the next steps?

Then run Python code to save the checkpoint with the gathered information:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import ArchitectContext

memori = create_memori_client("skill:lead-architect")
memori.enable()
context = ArchitectContext(memori)

# FILL IN with current session state
result = context.save_checkpoint(
    current_task="[FILL: Current task description]",
    reason="manual",
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
    spec_file=None,
    workflow=None,
    notes=""
)

if result:
    print("✅ Checkpoint saved successfully!")
    print("You can now safely run /clear")
    print("After /clear, run '/arch-checkpoint restore' to resume")
else:
    print("❌ Checkpoint save failed!")
EOF
```

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `/arch-checkpoint restore` | Resume session after /clear |
| `/arch-checkpoint save` | Save state before /clear |
