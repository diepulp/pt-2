---
description: Save or restore frontend-design session checkpoint for context continuity across /clear
args:
  - name: action
    description: "save" to checkpoint current state, "restore" to resume from last checkpoint
    required: true
---

# Frontend Design Session Checkpoint

**Action:** `$ARGUMENTS`

Manage session checkpoints for the frontend-design skill. Checkpoints persist work state to Memori, enabling session continuity across `/clear` commands.

## Namespace Configuration

| Setting | Value |
|---------|-------|
| Client key | `skill:frontend-design` |
| Namespace | `pt2_project` (Tier 1 - permanent) |
| TTL | None (permanent storage) |

> **Note:** frontend-design uses the permanent `pt2_project` namespace since UI patterns and design decisions should be preserved long-term for consistency. Unlike session-specific skills (lead-architect, backend-service-builder, api-builder), frontend checkpoints don't expire.

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

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import SkillContext

memori = create_memori_client("skill:frontend-design")
memori.enable()
context = SkillContext(memori)

# FILL IN with current session state
result = context.save_checkpoint(
    current_task="[FILL: Current task description]",
    reason="manual",  # or "context_threshold_60pct", "session_end"
    decisions_made=[
        # [FILL: Decisions made, e.g.:]
        # "Minimalist aesthetic with texture overlays",
        # "Using shadcn/ui Table with virtualization",
        # "Tailwind v4 custom theme tokens",
    ],
    files_modified=[
        # [FILL: Files modified, e.g.:]
        # "app/components/player-lookup-table.tsx",
        # "app/components/player-lookup-table.test.tsx",
        # "app/globals.css",
    ],
    open_questions=[
        # [FILL: Open questions, e.g.:]
        # "Should we add dark mode support?",
    ],
    next_steps=[
        # [FILL: Next steps, e.g.:]
        # "Add loading skeletons",
        # "Implement pagination",
        # "Add keyboard navigation",
    ],
    key_insights=[
        # [FILL: Key insights, e.g.:]
        # "Large tables require @tanstack/react-virtual",
        # "Noise texture adds depth to minimalist designs",
    ],
    workflow="component-creation",
    notes="[FILL: Additional context notes]"
)

if result:
    print("✅ Checkpoint saved to pt2_project namespace (permanent)")
    print("You can now safely run /clear")
    print("After /clear, run '/frontend-checkpoint restore' to resume")
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

memori = create_memori_client("skill:frontend-design")
memori.enable()
context = SkillContext(memori)

checkpoint = context.load_latest_checkpoint()
if checkpoint:
    print(context.format_checkpoint_for_resume(checkpoint))
    print("\n✅ Session restored. Continue from the next steps above.")
else:
    print("❌ No checkpoint found in pt2_project namespace.")
    print("Save a checkpoint first with: /frontend-checkpoint save")
EOF
```

After running the code, summarize:
- The current task that was in progress
- The components being worked on
- The next steps to continue with
- Any open questions that need resolution

---

## Quick SQL Queries

### View Latest Checkpoint

```bash
docker exec memori-db psql -U memori -d memori -c "
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
  AND metadata->>'skill_namespace' = 'skill:frontend-design'
ORDER BY created_at DESC
LIMIT 1;
"
```

### View All Checkpoints

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    LEFT(metadata->>'current_task', 60) as task,
    metadata->>'checkpoint_reason' as reason,
    created_at
FROM memori.memories
WHERE user_id = 'pt2_project'
  AND metadata->>'type' = 'session_checkpoint'
  AND metadata->>'skill_namespace' = 'skill:frontend-design'
ORDER BY created_at DESC
LIMIT 10;
"
```

### Count Checkpoints

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT COUNT(*) as checkpoint_count
FROM memori.memories
WHERE user_id = 'pt2_project'
  AND metadata->>'type' = 'session_checkpoint'
  AND metadata->>'skill_namespace' = 'skill:frontend-design';
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
  "skill_namespace": "skill:frontend-design",
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

## Comparison with Other Checkpoint Commands

| Command | Namespace | TTL | Use Case |
|---------|-----------|-----|----------|
| `/frontend-checkpoint` | `pt2_project` | Permanent | Frontend design (long-term patterns) |
| `/skill-checkpoint` | `pt2_project` | Permanent | Skill creation (long-term knowledge) |
| `/arch-checkpoint` | `session_lead_architect_{YYYY_MM}` | 7 days | Architecture work sessions |
| `/backend-checkpoint` | `session_backend_{YYYY_MM}` | 7 days | Backend service implementation |
| `/api-checkpoint` | `session_api_{YYYY_MM}` | 7 days | API endpoint implementation |

---

## Namespace Hierarchy Reference

| Tier | Namespace | Purpose | TTL |
|------|-----------|---------|-----|
| 1 | `pt2_project` | Project standards, domain knowledge, UI patterns | Permanent |
| 2 | `arch_decisions` | Architectural decisions, patterns | Permanent |
| 3 | `mvp_progress` | MVP implementation tracking | Operational |
| 4 | `session_*_{YYYY_MM}` | Session checkpoints | 7 days |
