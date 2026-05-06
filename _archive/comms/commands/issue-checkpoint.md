---
description: Save or restore debugging session checkpoint for context continuity across /clear
argument-hint: [save|restore]
allowed-tools: Bash, Read
---

# Debugging Session Checkpoint

**Action:** `$ARGUMENTS`

Save or restore a debugging session for context continuity across /clear.

## Namespace Configuration

| Setting | Value |
|---------|-------|
| Client key | `skill:issues` or `debugger` |
| Permanent namespace | `issues` (Tier 3) |
| Session namespace | `session_issues_{YYYY_MM}` (Tier 4) |
| TTL | **7 days** (auto-expires) |

---

## Instructions

### If argument is "restore" (or empty/default)

Immediately run this Python code to restore the session:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import IssuesContext

memori = create_memori_client("skill:issues")
memori.enable()
context = IssuesContext(memori)

checkpoint = context.load_latest_checkpoint()
if checkpoint:
    print(context.format_checkpoint_for_resume(checkpoint))
    print(f"\nNamespace: {checkpoint.get('source_namespace', 'unknown')}")
    if checkpoint.get('ttl_days'):
        print(f"TTL: {checkpoint.get('ttl_days')} days")
    print("\n✅ Debugging session restored. Continue from the next steps above.")
else:
    print("❌ No active debugging checkpoint found.")
    print("Checkpoints expire after 7 days.")
    print("Save a new checkpoint with: /issue-checkpoint save")
EOF
```

After running the code, summarize:
- The issue being debugged (if any)
- The current hypothesis
- Key findings so far
- The next debugging steps to continue with

---

### If argument is "save"

Before saving, gather the current debugging session state:

1. What issue are you debugging? (Issue ID if known)
2. What is your current hypothesis about the cause?
3. What files have you examined?
4. What have you found so far?
5. What are the next steps to try?

Then run Python code to save the checkpoint:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import IssuesContext

memori = create_memori_client("skill:issues")
memori.enable()
context = IssuesContext(memori)

# FILL IN with current debugging session state
result = context.save_checkpoint(
    current_task="[FILL: What debugging task is in progress]",
    reason="manual",
    issue_id=None,  # [FILL: Issue ID if tracking a specific issue]
    hypothesis="[FILL: Current hypothesis about the cause]",
    findings=[
        # [FILL: Key findings so far]
    ],
    files_examined=[
        # [FILL: Files that have been examined]
    ],
    next_steps=[
        # [FILL: Next debugging steps to try]
    ],
    notes=""  # [FILL: Additional context notes]
)

if result:
    print("✅ Debugging checkpoint saved!")
    print("TTL: 7 days (auto-expires)")
    print("\nYou can now safely run /clear")
    print("After /clear, run '/issue-checkpoint restore' to resume")
else:
    print("❌ Checkpoint save failed!")
EOF
```

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `/issue-checkpoint restore` | Resume debugging session after /clear |
| `/issue-checkpoint save` | Save debugging state before /clear |

---

## Quick SQL Queries

### View Latest Debugging Checkpoint

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    user_id as namespace,
    LEFT(metadata->>'current_task', 60) as task,
    metadata->>'issue_id' as issue,
    metadata->>'hypothesis' as hypothesis,
    metadata->>'checkpoint_reason' as reason,
    expires_at,
    created_at
FROM memori.memories
WHERE user_id LIKE 'session_issues_%'
  AND metadata->>'type' = 'session_checkpoint'
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY created_at DESC
LIMIT 1;
"
```

### View All Debugging Checkpoints

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    user_id as namespace,
    LEFT(metadata->>'current_task', 50) as task,
    metadata->>'issue_id' as issue,
    expires_at,
    created_at
FROM memori.memories
WHERE user_id LIKE 'session_issues_%'
  AND metadata->>'type' = 'session_checkpoint'
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY created_at DESC
LIMIT 10;
"
```

---

## When to Use Checkpoints

### Before /clear

When context is getting full:
1. Save checkpoint with `/issue-checkpoint save`
2. Run `/clear`
3. Restore with `/issue-checkpoint restore`

### Long Debugging Sessions

For extended debugging:
- Save checkpoints at natural breakpoints
- Record hypothesis changes
- Track files examined

### Context Threshold (60%)

When context usage approaches 60%:
1. Proactively suggest checkpoint save
2. Save with reason `context_threshold_60pct`
3. After `/clear`, restore to resume

---

## Related Commands

| Command | Purpose |
|---------|---------|
| `/issue-log <title>` | Log new issue |
| `/issue-status` | View open issues |
| `/issue-status <id>` | View issue history |
| `/issue-resolve <id>` | Resolve an issue |
| `/issue-checkpoint save` | Save debugging session |
| `/issue-checkpoint restore` | Restore debugging session |
| `/memori-cleanup` | Purge expired checkpoints |
