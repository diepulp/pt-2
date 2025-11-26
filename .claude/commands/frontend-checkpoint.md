---
description: Save or restore frontend-design session checkpoint for context continuity across /clear
args:
  - name: action
    description: "save" to checkpoint current state, "restore" to resume from last checkpoint
    required: true
---

# Frontend Design Session Checkpoint

Manage session checkpoints for the frontend-design skill. Checkpoints persist work state to Memori, enabling session continuity across `/clear` commands.

## Actions

### `save` - Checkpoint Current Session

Before running `/clear`, save your current work state:

1. **Gather current session state:**
   - Current task being worked on
   - Components created or modified
   - Aesthetic direction chosen
   - Design decisions made
   - Open questions requiring user input
   - Planned next steps
   - Key insights learned

2. **Save checkpoint using Python:**

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:frontend-design")
memori.enable()
context = SkillContext(memori)

context.save_checkpoint(
    current_task="[Current task description]",
    reason="context_threshold_60pct",  # or "manual", "session_end"
    decisions_made=[
        "Minimalist aesthetic with texture overlays",
        "Using shadcn/ui Table with virtualization",
        "Tailwind v4 custom theme tokens",
    ],
    files_modified=[
        "app/components/player-lookup-table.tsx",
        "app/components/player-lookup-table.test.tsx",
        "app/globals.css",
    ],
    open_questions=[
        "Should we add dark mode support?",
    ],
    next_steps=[
        "Add loading skeletons",
        "Implement pagination",
        "Add keyboard navigation",
    ],
    key_insights=[
        "Large tables require @tanstack/react-virtual",
        "Noise texture adds depth to minimalist designs",
    ],
    workflow="component-creation",
    notes="Additional context notes..."
)
```

3. **Confirm checkpoint saved** - Look for "Session checkpoint saved" in output

4. **Now safe to run `/clear`**

---

### `restore` - Resume from Checkpoint

After running `/clear`, restore your session context:

1. **Load and display checkpoint:**

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:frontend-design")
memori.enable()
context = SkillContext(memori)

# Load and format the latest checkpoint
resume_context = context.format_checkpoint_for_resume()
print(resume_context)
```

2. **Review the displayed context** and continue from the next steps

3. **Alternatively, load raw checkpoint data:**

```python
checkpoint = context.load_latest_checkpoint()
if checkpoint:
    print(f"Task: {checkpoint.get('current_task')}")
    print(f"Next steps: {checkpoint.get('next_steps', [])}")
    print(f"Open questions: {checkpoint.get('open_questions', [])}")
```

---

## Quick SQL Queries

### View Latest Checkpoint

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    content,
    metadata->>'current_task' as task,
    metadata->>'checkpoint_reason' as reason,
    metadata->>'next_steps' as next_steps,
    created_at
FROM memori.memories
WHERE user_id = 'skill_frontend_design'
  AND metadata->>'type' = 'session_checkpoint'
ORDER BY created_at DESC
LIMIT 1;
"
```

### View All Checkpoints

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    LEFT(metadata->>'current_task', 60) as task,
    metadata->>'checkpoint_reason' as reason,
    created_at
FROM memori.memories
WHERE user_id = 'skill_frontend_design'
  AND metadata->>'type' = 'session_checkpoint'
ORDER BY created_at DESC
LIMIT 10;
"
```

### Count Checkpoints

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT COUNT(*) as checkpoint_count
FROM memori.memories
WHERE user_id = 'skill_frontend_design'
  AND metadata->>'type' = 'session_checkpoint';
"
```

---

## When to Use Checkpoints

### Context Threshold (60%)

When context usage approaches 60%:

1. Proactively suggest checkpoint save
2. Save checkpoint with reason `context_threshold_60pct`
3. Inform user context is high and recommend `/clear`
4. After `/clear`, restore checkpoint to resume

### Long Component Creation Sessions

For extended frontend implementation work:

- Save checkpoints at natural breakpoints (after component, after styling)
- Use reason `manual` for these intermediate saves

### Before Major Refactors

Before restructuring component architecture:

- Checkpoint current state
- Provides context for rollback if needed

---

## Checkpoint Metadata Schema

```json
{
  "type": "session_checkpoint",
  "checkpoint_reason": "context_threshold_60pct | manual | session_end",
  "current_task": "Description of current task",
  "timestamp": "ISO 8601 timestamp",
  "decisions_made": ["List of decisions"],
  "files_modified": ["List of file paths"],
  "open_questions": ["Questions needing user input"],
  "next_steps": ["Planned next actions"],
  "key_insights": ["Important learnings"],
  "workflow": "component-creation",
  "notes": "Additional context"
}
```

---

## Database Namespace

- **Client key:** `skill:frontend-design`
- **Database user_id:** `skill_frontend_design`
- **Checkpoint type:** `metadata->>'type' = 'session_checkpoint'`
