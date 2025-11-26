---
description: Save or restore service-engineer chatmode session checkpoint for context continuity across /clear
args:
  - name: action
    description: "save" to checkpoint current state, "restore" to resume from last checkpoint
    required: true
---

# Service Engineer Chatmode Session Checkpoint

Manage session checkpoints for the service-engineer chatmode. Checkpoints persist work state to Memori, enabling session continuity across `/clear` commands.

## Actions

### `save` - Checkpoint Current Session

Before running `/clear`, save your current work state:

1. **Gather current session state:**
   - Current implementation task
   - Services being implemented
   - Files modified (services, migrations, tests)
   - Active domain/bounded context
   - Open questions requiring user input
   - Planned next steps
   - Key insights learned

2. **Save checkpoint using Python:**

```python
from lib.memori import create_memori_client, ChatmodeContext

memori = create_memori_client("service-engineer")
memori.enable()
context = ChatmodeContext(memori)

context.save_checkpoint(
    current_task="[Current implementation task]",
    reason="context_threshold_60pct",  # or "manual", "session_end"
    decisions_made=[
        "Using Pattern A for domain contracts",
        "Inline mappers instead of separate file",
    ],
    files_modified=[
        "services/loyalty/loyalty.ts",
        "services/loyalty/keys.ts",
        "services/loyalty/loyalty.test.ts",
        "supabase/migrations/20251125_xxx.sql",
    ],
    services_touched=["LoyaltyService"],
    active_domain="Loyalty",
    open_questions=[
        "Should we add caching for balance queries?",
    ],
    next_steps=[
        "Add remaining unit tests",
        "Run validation scripts",
        "Update service README",
    ],
    key_insights=[
        "Balance calculations should use RPC for atomicity",
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

memori = create_memori_client("service-engineer")
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
    print(f"Services: {checkpoint.get('services_touched', [])}")
    print(f"Next steps: {checkpoint.get('next_steps', [])}")
```

---

## Quick SQL Queries

### View Latest Checkpoint

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    content,
    metadata->>'current_task' as task,
    metadata->>'services_touched' as services,
    metadata->>'checkpoint_reason' as reason,
    created_at
FROM memori.memories
WHERE user_id = 'service_engineer'
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
    metadata->>'active_domain' as domain,
    metadata->>'checkpoint_reason' as reason,
    created_at
FROM memori.memories
WHERE user_id = 'service_engineer'
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
WHERE user_id = 'service_engineer'
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

### Long Implementation Sessions

For extended service implementation work:

- Save checkpoints at natural breakpoints (after migration, after service code)
- Use reason `manual` for these intermediate saves

### Before Validation

Before running validation scripts:

- Checkpoint current state
- Provides context if validation fails

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

- **Client key:** `service-engineer`
- **Database user_id:** `service_engineer`
- **Checkpoint type:** `metadata->>'type' = 'session_checkpoint'`
