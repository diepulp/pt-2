---
description: Save or restore skill-creator session checkpoint for context continuity across /clear
args:
  - name: action
    description: "save" to checkpoint current state, "restore" to resume from last checkpoint
    required: true
---

# Skill Creator Session Checkpoint

Manage session checkpoints for the skill-creator skill. Checkpoints persist work state to Memori, enabling session continuity across `/clear` commands.

## Namespace Configuration

| Setting | Value |
|---------|-------|
| Client key | `skill:skill-creator` |
| Namespace | `pt2_project` (Tier 1 - permanent) |
| TTL | None (permanent storage) |

> **Note:** skill-creator uses the permanent `pt2_project` namespace since skill creation knowledge should be preserved long-term. Unlike session-specific skills (lead-architect, backend-service-builder, api-builder), skill-creator checkpoints don't expire.

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

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import SkillContext

memori = create_memori_client("skill:skill-creator")
memori.enable()
context = SkillContext(memori)

# FILL IN with current session state
result = context.save_checkpoint(
    current_task="[FILL: Current task description]",
    reason="manual",  # or "context_threshold_60pct", "session_end"
    decisions_made=[
        # [FILL: Decisions made, e.g.:]
        # "Workflow-based structure for data-analyzer skill",
        # "Include validation scripts in scripts/",
    ],
    files_modified=[
        # [FILL: Files modified, e.g.:]
        # ".claude/skills/data-analyzer/SKILL.md",
        # ".claude/skills/data-analyzer/scripts/analyze.py",
    ],
    open_questions=[
        # [FILL: Open questions, e.g.:]
        # "Should we include sample data in assets/?",
    ],
    next_steps=[
        # [FILL: Next steps, e.g.:]
        # "Complete SKILL.md documentation",
        # "Run packaging script",
    ],
    key_insights=[
        # [FILL: Key insights, e.g.:]
        # "Data skills benefit from workflow-based structure",
    ],
    workflow="skill-creation",
    notes="[FILL: Additional context notes]"
)

if result:
    print("✅ Checkpoint saved to pt2_project namespace (permanent)")
    print("You can now safely run /clear")
    print("After /clear, run '/skill-checkpoint restore' to resume")
else:
    print("❌ Checkpoint save failed!")
EOF
```

3. **Confirm checkpoint saved** - Look for "Checkpoint saved" in output

4. **Now safe to run `/clear`**

---

### `restore` - Resume from Checkpoint

After running `/clear`, restore your session context:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import SkillContext

memori = create_memori_client("skill:skill-creator")
memori.enable()
context = SkillContext(memori)

checkpoint = context.load_latest_checkpoint()
if checkpoint:
    print(context.format_checkpoint_for_resume(checkpoint))
    print("\n✅ Session restored. Continue from the next steps above.")
else:
    print("❌ No checkpoint found in pt2_project namespace.")
    print("Save a checkpoint first with: /skill-checkpoint save")
EOF
```

After running the code, summarize:
- The current task that was in progress
- The next steps to continue with
- Any open questions that need resolution

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
    metadata->>'workflow' as workflow,
    created_at
FROM memori.memories
WHERE user_id = 'pt2_project'
  AND metadata->>'type' = 'session_checkpoint'
  AND metadata->>'skill_namespace' = 'skill:skill-creator'
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
WHERE user_id = 'pt2_project'
  AND metadata->>'type' = 'session_checkpoint'
  AND metadata->>'skill_namespace' = 'skill:skill-creator'
ORDER BY created_at DESC
LIMIT 10;
"
```

### Count Checkpoints

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT COUNT(*) as checkpoint_count
FROM memori.memories
WHERE user_id = 'pt2_project'
  AND metadata->>'type' = 'session_checkpoint'
  AND metadata->>'skill_namespace' = 'skill:skill-creator';
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
  "skill_namespace": "skill:skill-creator",
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

## Comparison with Other Checkpoint Commands

| Command | Namespace | TTL | Use Case |
|---------|-----------|-----|----------|
| `/skill-checkpoint` | `pt2_project` | Permanent | Skill creation (long-term knowledge) |
| `/arch-checkpoint` | `session_lead_architect_{YYYY_MM}` | 7 days | Architecture work sessions |
| `/backend-checkpoint` | `session_backend_{YYYY_MM}` | 7 days | Backend service implementation |
| `/api-checkpoint` | `session_api_{YYYY_MM}` | 7 days | API endpoint implementation |
| `/frontend-checkpoint` | `pt2_project` | Permanent | Frontend design (long-term patterns) |
