---
description: Save or restore architect chatmode session checkpoint for context continuity across /clear
args:
  - name: action
    description: "save" to checkpoint current state, "restore" to resume from last checkpoint
    required: true
---

# Architect Chatmode Session Checkpoint

Manage session checkpoints for the architect chatmode. Checkpoints persist work state to Memori, enabling session continuity across `/clear` commands.

## Actions

### `save` - Checkpoint Current Session

Before running `/clear`, save your current work state:

1. **Gather current session state:**
   - Current architectural task
   - Decisions made this session
   - Files modified (specs, ADRs, SRM)
   - Active domain/bounded context
   - Open questions requiring user input
   - Planned next steps
   - Key insights learned

2. **Save checkpoint using Python:**

```python
from lib.memori import create_memori_client, ChatmodeContext

memori = create_memori_client("architect")
memori.enable()
context = ChatmodeContext(memori)

context.save_checkpoint(
    current_task="[Current architectural task]",
    reason="context_threshold_60pct",  # or "manual", "session_end"
    decisions_made=[
        "Selected Pattern A for LoyaltyService",
        "RLS policy design for multi-tenant isolation",
    ],
    files_modified=[
        "docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md",
        "docs/80-adrs/ADR-047-loyalty-pattern.md",
    ],
    services_touched=["LoyaltyService", "PlayerService"],
    active_domain="Loyalty",
    open_questions=[
        "Should we introduce a separate audit service?",
    ],
    next_steps=[
        "Update API contracts",
        "Design RLS policies",
        "Create implementation spec",
    ],
    key_insights=[
        "Loyalty domain requires explicit DTOs due to business logic complexity",
    ],
    notes="Additional context notes..."
)
```

3. **Confirm checkpoint saved** - Look for "Chatmode checkpoint saved" in output

4. **Now safe to run `/clear`**

---

### `restore` - Resume from Checkpoint

After running `/clear`, restore your session context:

1. **Load and display checkpoint:**

```python
from lib.memori import create_memori_client, ChatmodeContext

memori = create_memori_client("architect")
memori.enable()
context = ChatmodeContext(memori)

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
    print(f"Domain: {checkpoint.get('active_domain')}")
    print(f"Next steps: {checkpoint.get('next_steps', [])}")
```

---

## Quick SQL Queries

### View Latest Checkpoint

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    content,
    metadata->>'current_task' as task,
    metadata->>'active_domain' as domain,
    metadata->>'checkpoint_reason' as reason,
    created_at
FROM memori.memories
WHERE user_id = 'pt2_architect'
  AND metadata->>'type' = 'session_checkpoint'
ORDER BY created_at DESC
LIMIT 1;
"
```

### View All Checkpoints

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    LEFT(metadata->>'current_task', 60) as task,
    metadata->>'active_domain' as domain,
    metadata->>'checkpoint_reason' as reason,
    created_at
FROM memori.memories
WHERE user_id = 'pt2_architect'
  AND metadata->>'type' = 'session_checkpoint'
ORDER BY created_at DESC
LIMIT 10;
"
```

### Count Checkpoints

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT COUNT(*) as checkpoint_count
FROM memori.memories
WHERE user_id = 'pt2_architect'
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

### Long Architecture Sessions

For extended architectural work sessions:

- Save checkpoints at natural breakpoints (after ADR, after spec)
- Use reason `manual` for these intermediate saves

### Before Major Decisions

Before making significant architectural decisions:

- Checkpoint current exploration state
- Provides context for alternatives if needed

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
  "services_touched": ["Services worked on"],
  "active_domain": "Bounded context name",
  "open_questions": ["Questions needing user input"],
  "next_steps": ["Planned next actions"],
  "key_insights": ["Important learnings"],
  "notes": "Additional context"
}
```

---

## Database Namespace

- **Client key:** `architect`
- **Database user_id:** `pt2_architect`
- **Checkpoint type:** `metadata->>'type' = 'session_checkpoint'`
