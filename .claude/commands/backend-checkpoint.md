---
description: Save or restore backend-service-builder session checkpoint for context continuity across /clear
args:
  - name: action
    description: "save" to checkpoint current state, "restore" to resume from last checkpoint
    required: true
---

# Backend Service Builder Session Checkpoint

Manage session checkpoints for the backend-service-builder skill. Checkpoints persist work state to Memori, enabling session continuity across `/clear` commands.

## Actions

### `save` - Checkpoint Current Session

Before running `/clear`, save your current work state:

1. **Gather current session state:**
   - Current task being worked on
   - Services created or modified
   - Files created (migrations, services, tests)
   - Validation gates passed
   - Open questions requiring user input
   - Planned next steps
   - Key insights learned

2. **Save checkpoint using Python:**

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:backend-service-builder")
memori.enable()
context = SkillContext(memori)

context.save_checkpoint(
    current_task="[Current task description]",
    reason="context_threshold_60pct",  # or "manual", "session_end"
    decisions_made=[
        "Pattern A selected for LoyaltyService",
        "RLS policy design decision...",
    ],
    files_modified=[
        "supabase/migrations/20251125_xxx.sql",
        "services/loyalty/loyalty.ts",
        "services/loyalty/keys.ts",
    ],
    validation_gates_passed=[1, 2, 3],  # Workflow steps completed
    open_questions=[
        "Should we add soft delete support?",
    ],
    next_steps=[
        "Run validation scripts",
        "Add unit tests",
        "Update SRM",
    ],
    key_insights=[
        "Loyalty domain requires Pattern A due to business logic complexity",
    ],
    workflow="service-creation",
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

memori = create_memori_client("skill:backend-service-builder")
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
WHERE user_id = 'skill_backend_service_builder'
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
WHERE user_id = 'skill_backend_service_builder'
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
WHERE user_id = 'skill_backend_service_builder'
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

### Long Service Creation Sessions

For extended service implementation work:

- Save checkpoints at natural breakpoints (after migration, after service code)
- Use reason `manual` for these intermediate saves

### Before Validation

Before running validation scripts:

- Checkpoint current state
- If validation fails, checkpoint provides context for debugging

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
  "validation_gates_passed": [1, 2, 3],
  "open_questions": ["Questions needing user input"],
  "next_steps": ["Planned next actions"],
  "key_insights": ["Important learnings"],
  "workflow": "service-creation",
  "notes": "Additional context"
}
```

---

## Database Namespace

- **Client key:** `skill:backend-service-builder`
- **Database user_id:** `skill_backend_service_builder`
- **Checkpoint type:** `metadata->>'type' = 'session_checkpoint'`
