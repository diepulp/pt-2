---
description: Save or restore backend-service-builder session checkpoint for context continuity across /clear
argument-hint: [save|restore]
allowed-tools: Bash, Read, SlashCommand
---

# Backend Service Builder Session Checkpoint

**Action:** `$ARGUMENTS`

Execute the checkpoint action based on the argument provided.

## Namespace Configuration

| Setting | Value |
|---------|-------|
| Client key | `skill:backend-service-builder` |
| Permanent namespace | `arch_decisions` (Tier 2) |
| Session namespace | `session_backend_{YYYY_MM}` (Tier 4) |
| TTL | **7 days** (auto-expires) |

> **Note:** Session checkpoints use ephemeral namespaces with 7-day TTL. Expired checkpoints are automatically excluded from queries. Use `/memori-cleanup` to purge expired entries.

## Instructions

### If argument is "restore" (or empty/default)

Immediately run this Python code to restore the session:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import BackendServiceContext

memori = create_memori_client("skill:backend-service-builder")
memori.enable()
context = BackendServiceContext(memori)

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
    print("Save a new checkpoint with: /backend-checkpoint save")
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
from lib.memori import create_memori_client
from lib.memori.skill_context import BackendServiceContext

memori = create_memori_client("skill:backend-service-builder")
memori.enable()
context = BackendServiceContext(memori)

# FILL IN with current session state
result = context.save_checkpoint(
    current_task="[FILL: Current task description]",
    reason="manual",  # or "context_threshold_60pct", "session_end"
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
    session_ns = memori.get_session_namespace()
    print(f"✅ Checkpoint saved to {session_ns}")
    print(f"TTL: 7 days (auto-expires)")
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

## Quick SQL Queries

### View Latest Checkpoint (with TTL)

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    user_id as namespace,
    LEFT(metadata->>'current_task', 60) as task,
    metadata->>'service_name' as service,
    metadata->>'pattern_used' as pattern,
    metadata->>'checkpoint_reason' as reason,
    metadata->>'ttl_days' as ttl,
    expires_at,
    created_at
FROM memori.memories
WHERE (user_id LIKE 'session_backend_%' OR user_id = 'arch_decisions')
  AND metadata->>'type' = 'session_checkpoint'
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY created_at DESC
LIMIT 1;
"
```

### View All Active Checkpoints

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    user_id as namespace,
    LEFT(metadata->>'current_task', 60) as task,
    metadata->>'checkpoint_reason' as reason,
    expires_at,
    created_at
FROM memori.memories
WHERE (user_id LIKE 'session_backend_%' OR user_id = 'arch_decisions')
  AND metadata->>'type' = 'session_checkpoint'
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY created_at DESC
LIMIT 10;
"
```

### View Expired Checkpoints

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    user_id as namespace,
    LEFT(metadata->>'current_task', 60) as task,
    expires_at,
    created_at
FROM memori.memories
WHERE user_id LIKE 'session_backend_%'
  AND metadata->>'type' = 'session_checkpoint'
  AND expires_at IS NOT NULL
  AND expires_at <= NOW()
ORDER BY created_at DESC
LIMIT 10;
"
```

### Count Active vs Expired

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    COUNT(*) FILTER (WHERE expires_at IS NULL OR expires_at > NOW()) as active,
    COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= NOW()) as expired
FROM memori.memories
WHERE user_id LIKE 'session_backend_%'
  AND metadata->>'type' = 'session_checkpoint';
"
```

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

## Checkpoint Metadata Schema

```json
{
  "type": "session_checkpoint",
  "checkpoint_reason": "context_threshold_60pct | manual | session_end",
  "current_task": "Description of current task",
  "timestamp": "ISO 8601 timestamp",
  "skill_namespace": "skill:backend-service-builder",
  "ttl_days": 7,
  "service_name": "ServiceName or null",
  "pattern_used": "Pattern A/B/C or null",
  "decisions_made": ["List of decisions"],
  "files_modified": ["List of file paths"],
  "validation_gates_passed": [1, 2, 3],
  "open_questions": ["Questions needing user input"],
  "next_steps": ["Planned next actions"],
  "key_insights": ["Important learnings"],
  "workflow": "workflow-name or null",
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
| 4 | `session_backend_{YYYY_MM}` | Backend checkpoints | **7 days** |
| 4 | `session_lead_architect_{YYYY_MM}` | Architect checkpoints | **7 days** |
| 4 | `session_api_{YYYY_MM}` | API builder checkpoints | **7 days** |
