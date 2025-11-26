---
description: Save or restore skill-creator session checkpoint for context continuity across /clear
args:
  - name: action
    description: "save" to checkpoint current state, "restore" to resume from last checkpoint
    required: true
---

# Skill Creator Session Checkpoint

Manage session checkpoints for the skill-creator skill. Checkpoints persist work state to Memori, enabling session continuity across `/clear` commands.

## Actions

### `save` - Checkpoint Current Session

Before running `/clear`, save your current work state:

1. **Gather current session state:**
   - Current task being worked on
   - Skill being created or modified
   - Files created (SKILL.md, scripts, references)
   - Design decisions made
   - Open questions requiring user input
   - Planned next steps
   - Key insights learned

2. **Save checkpoint using Python:**

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:skill-creator")
memori.enable()
context = SkillContext(memori)

context.save_checkpoint(
    current_task="[Current task description]",
    reason="context_threshold_60pct",  # or "manual", "session_end"
    decisions_made=[
        "Workflow-based structure for data-analyzer skill",
        "Include validation scripts in scripts/",
        "Reference patterns in references/",
    ],
    files_modified=[
        ".claude/skills/data-analyzer/SKILL.md",
        ".claude/skills/data-analyzer/scripts/analyze.py",
        ".claude/skills/data-analyzer/references/patterns.md",
    ],
    open_questions=[
        "Should we include sample data in assets/?",
    ],
    next_steps=[
        "Complete SKILL.md documentation",
        "Run packaging script",
        "Test skill invocation",
    ],
    key_insights=[
        "Data skills benefit from workflow-based structure",
        "Include sample queries for better context",
    ],
    workflow="skill-creation",
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

memori = create_memori_client("skill:skill-creator")
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
WHERE user_id = 'skill_skill_creator'
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
WHERE user_id = 'skill_skill_creator'
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
WHERE user_id = 'skill_skill_creator'
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

### Long Skill Creation Sessions

For extended skill development work:

- Save checkpoints at natural breakpoints (after SKILL.md, after scripts)
- Use reason `manual` for these intermediate saves

### Before Packaging

Before running the packaging script:

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
  "open_questions": ["Questions needing user input"],
  "next_steps": ["Planned next actions"],
  "key_insights": ["Important learnings"],
  "workflow": "skill-creation",
  "notes": "Additional context"
}
```

---

## Database Namespace

- **Client key:** `skill:skill-creator`
- **Database user_id:** `skill_skill_creator`
- **Checkpoint type:** `metadata->>'type' = 'session_checkpoint'`
