---
description: Save or restore api-builder session checkpoint for context continuity across /clear
args:
  - name: action
    description: "save" to checkpoint current state, "restore" to resume from last checkpoint
    required: true
---

# API Builder Session Checkpoint

This command manages session checkpoints for the api-builder skill, enabling context continuity across `/clear` operations.

## Action: save

When action is "save", gather the current session state and persist it to Memori:

```python
from lib.memori import create_memori_client, SkillContext

# Initialize Memori for api-builder skill
memori = create_memori_client("skill:api-builder")
memori.enable()
context = SkillContext(memori)

# GATHER THIS INFORMATION FROM THE CURRENT SESSION:
# 1. What API implementation task is currently in progress?
# 2. What DTO patterns have been selected?
# 3. What files have been created/modified?
# 4. What validation gates have passed?
# 5. What questions remain open?
# 6. What are the immediate next steps?
# 7. What key insights have been learned?

context.save_checkpoint(
    current_task="[DESCRIBE CURRENT API TASK]",
    reason="manual",  # or "context_threshold_60pct"
    decisions_made=[
        # List architectural decisions made this session
        # e.g., "Selected Pattern B for Player DTOs",
        # "Using cursor-based pagination",
        # "Idempotency via x-idempotency-key header"
    ],
    files_modified=[
        # List files created or modified
        # e.g., "services/player/dtos.ts",
        # "services/player/schemas.ts",
        # "app/api/v1/players/route.ts"
    ],
    validation_gates_passed=[
        # List validation steps completed (1-12 from checklist)
        # e.g., [1, 2, 3, 4, 5] for first 5 gates
    ],
    open_questions=[
        # List unresolved questions
        # e.g., "Should we add rate limiting to GET endpoints?"
    ],
    next_steps=[
        # List immediate next actions
        # e.g., "Implement HTTP fetchers",
        # "Create React Query hooks",
        # "Add error mapping"
    ],
    key_insights=[
        # List learnings from this session
        # e.g., "Pattern B services must use type aliases, not interfaces"
    ],
    workflow="api-builder",
    notes="[ADDITIONAL CONTEXT FOR RESUME]"
)

print("✅ Checkpoint saved successfully")
print("You can now run /clear to reset context.")
print("After clearing, run `/api-checkpoint restore` to resume.")
```

## Action: restore

When action is "restore", load and display the most recent checkpoint:

```python
from lib.memori import create_memori_client, SkillContext

# Initialize Memori for api-builder skill
memori = create_memori_client("skill:api-builder")
memori.enable()
context = SkillContext(memori)

# Load and display checkpoint
resume_context = context.format_checkpoint_for_resume()

if resume_context:
    print("🔄 Restoring API Builder Session")
    print("=" * 50)
    print(resume_context)
    print("=" * 50)
    print("\n📋 Ready to continue from checkpoint.")
    print("Review the above context and proceed with next_steps.")
else:
    print("⚠️ No checkpoint found for api-builder skill.")
    print("Start a new session or check the namespace.")
```

## SQL Queries (for debugging)

### View Latest Checkpoint

```sql
SELECT
    content,
    metadata->>'current_task' as task,
    metadata->>'checkpoint_reason' as reason,
    metadata->>'next_steps' as next_steps,
    metadata->>'files_modified' as files,
    created_at
FROM memori.memories
WHERE user_id = 'skill_api_builder'
  AND metadata->>'type' = 'session_checkpoint'
ORDER BY created_at DESC
LIMIT 1;
```

### View All Checkpoints

```sql
SELECT
    LEFT(metadata->>'current_task', 60) as task,
    metadata->>'checkpoint_reason' as reason,
    created_at
FROM memori.memories
WHERE user_id = 'skill_api_builder'
  AND metadata->>'type' = 'session_checkpoint'
ORDER BY created_at DESC
LIMIT 10;
```

### Count Checkpoints

```sql
SELECT COUNT(*) as checkpoint_count
FROM memori.memories
WHERE user_id = 'skill_api_builder'
  AND metadata->>'type' = 'session_checkpoint';
```
