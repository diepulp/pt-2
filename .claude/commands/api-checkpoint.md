---
description: Save or restore api-builder session checkpoint for context continuity across /clear
args:
  - name: action
    description: "save" to checkpoint current state, "restore" to resume from last checkpoint
    required: true
---

# API Builder Session Checkpoint

**Action:** `$ARGUMENTS`

Manage session checkpoints for the api-builder skill, enabling context continuity across `/clear` operations.

## Namespace Configuration

| Setting | Value |
|---------|-------|
| Client key | `skill:api-builder` |
| Permanent namespace | `arch_decisions` (Tier 2) |
| Session namespace | `session_api_{YYYY_MM}` (Tier 4) |
| TTL | **7 days** (auto-expires) |

> **Note:** Session checkpoints use ephemeral namespaces with 7-day TTL. Expired checkpoints are automatically excluded from queries. Use `/memori-cleanup` to purge expired entries.

## Instructions

### If argument is "restore" (or empty/default)

Immediately run this Python code to restore the session:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import SkillContext

memori = create_memori_client("skill:api-builder")
memori.enable()
context = SkillContext(memori)

checkpoint = context.load_latest_checkpoint()
if checkpoint:
    print(context.format_checkpoint_for_resume(checkpoint))
    print(f"\nNamespace: {checkpoint.get('source_namespace', 'unknown')}")
    if checkpoint.get('ttl_days'):
        print(f"TTL: {checkpoint.get('ttl_days')} days")
    print("\n✅ Session restored. Continue from the next steps above.")
else:
    print("❌ No active checkpoint found.")
    print("Checkpoints expire after 7 days.")
    print("Save a new checkpoint with: /api-checkpoint save")
EOF
```

After running the code, summarize:
- The current API implementation task that was in progress
- What DTO patterns were selected
- The next steps to continue with
- Any open questions that need resolution

---

### If argument is "save"

Before saving, gather the current session state:

1. What API implementation task is currently in progress?
2. What DTO patterns have been selected?
3. What files have been created/modified?
4. What validation gates have passed?
5. What questions remain open?
6. What are the immediate next steps?
7. What key insights have been learned?

Then run Python code to save the checkpoint:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import SkillContext

memori = create_memori_client("skill:api-builder")
memori.enable()
context = SkillContext(memori)

# FILL IN with current session state
result = context.save_checkpoint(
    current_task="[FILL: Current API task description]",
    reason="manual",  # or "context_threshold_60pct"
    decisions_made=[
        # [FILL: List architectural decisions made this session, e.g.:]
        # "Selected Pattern B for Player DTOs",
        # "Using cursor-based pagination",
        # "Idempotency via x-idempotency-key header"
    ],
    files_modified=[
        # [FILL: List files created or modified, e.g.:]
        # "services/player/dtos.ts",
        # "services/player/schemas.ts",
        # "app/api/v1/players/route.ts"
    ],
    validation_gates_passed=[
        # [FILL: List validation steps completed (1-12 from checklist), e.g.:]
        # 1, 2, 3, 4, 5
    ],
    open_questions=[
        # [FILL: List unresolved questions, e.g.:]
        # "Should we add rate limiting to GET endpoints?"
    ],
    next_steps=[
        # [FILL: List immediate next actions, e.g.:]
        # "Implement HTTP fetchers",
        # "Create React Query hooks",
        # "Add error mapping"
    ],
    key_insights=[
        # [FILL: List learnings from this session, e.g.:]
        # "Pattern B services must use type aliases, not interfaces"
    ],
    workflow="api-builder",
    notes="[FILL: Additional context for resume]"
)

if result:
    session_ns = memori.get_session_namespace()
    print(f"✅ Checkpoint saved to {session_ns}")
    print(f"TTL: 7 days (auto-expires)")
    print("You can now safely run /clear")
    print("After /clear, run '/api-checkpoint restore' to resume")
else:
    print("❌ Checkpoint save failed!")
EOF
```

---

## Quick Reference

| Command                  | Purpose                     |
|--------------------------|-----------------------------|
| `/api-checkpoint restore` | Resume session after /clear |
| `/api-checkpoint save`    | Save state before /clear    |

---

## Quick SQL Queries

### View Latest Checkpoint (with TTL)

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    user_id as namespace,
    LEFT(metadata->>'current_task', 60) as task,
    metadata->>'checkpoint_reason' as reason,
    metadata->>'ttl_days' as ttl,
    metadata->>'files_modified' as files,
    expires_at,
    created_at
FROM memori.memories
WHERE (user_id LIKE 'session_api_%' OR user_id = 'arch_decisions')
  AND metadata->>'type' = 'session_checkpoint'
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY created_at DESC
LIMIT 1;
"
```

### View All Active Checkpoints

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    user_id as namespace,
    LEFT(metadata->>'current_task', 60) as task,
    metadata->>'checkpoint_reason' as reason,
    expires_at,
    created_at
FROM memori.memories
WHERE (user_id LIKE 'session_api_%' OR user_id = 'arch_decisions')
  AND metadata->>'type' = 'session_checkpoint'
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY created_at DESC
LIMIT 10;
"
```

### View Expired Checkpoints

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    user_id as namespace,
    LEFT(metadata->>'current_task', 60) as task,
    expires_at,
    created_at
FROM memori.memories
WHERE user_id LIKE 'session_api_%'
  AND metadata->>'type' = 'session_checkpoint'
  AND expires_at IS NOT NULL
  AND expires_at <= NOW()
ORDER BY created_at DESC
LIMIT 10;
"
```

### Count Active vs Expired

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    COUNT(*) FILTER (WHERE expires_at IS NULL OR expires_at > NOW()) as active,
    COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= NOW()) as expired
FROM memori.memories
WHERE user_id LIKE 'session_api_%'
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

### Long API Implementation Sessions

For extended API development work:

- Save checkpoints at natural breakpoints (after DTOs, after route handlers)
- Use reason `manual` for these intermediate saves

### Before Validation

Before running API validation or tests:

- Checkpoint current state
- Provides context if validation fails

---

## Checkpoint Metadata Schema

```json
{
  "type": "session_checkpoint",
  "checkpoint_reason": "context_threshold_60pct | manual | session_end",
  "current_task": "Description of current API task",
  "timestamp": "ISO 8601 timestamp",
  "skill_namespace": "skill:api-builder",
  "ttl_days": 7,
  "decisions_made": ["List of decisions"],
  "files_modified": ["List of file paths"],
  "validation_gates_passed": [1, 2, 3, 4, 5],
  "open_questions": ["Questions needing user input"],
  "next_steps": ["Planned next actions"],
  "key_insights": ["Important learnings"],
  "workflow": "api-builder",
  "notes": "Additional context"
}
```

---

## Namespace Hierarchy Reference

| Tier | Namespace | Purpose | TTL |
|------|-----------|---------|-----|
| 1 | `pt2_project` | Project standards, domain knowledge | Permanent |
| 2 | `arch_decisions` | Architectural decisions, patterns | Permanent |
| 3 | `mvp_progress` | MVP implementation tracking | Operational |
| 4 | `session_api_{YYYY_MM}` | API builder checkpoints | **7 days** |
| 4 | `session_backend_{YYYY_MM}` | Backend checkpoints | **7 days** |
| 4 | `session_lead_architect_{YYYY_MM}` | Architect checkpoints | **7 days** |
