---
description: Mark an issue as resolved with root cause and resolution details
argument-hint: <issue-id>
allowed-tools: Bash, Read
---

# Resolve Issue

**Issue ID:** `$ARGUMENTS`

Mark an issue as resolved and record the resolution details.

## Instructions

### 1. Gather Resolution Details

Before resolving, collect:

1. **Issue ID**: The issue to resolve (from argument)
2. **Resolution**: How the issue was fixed
3. **Root Cause**: What caused the issue
4. **Fix Commit**: Git commit hash (if applicable)

### 2. View Issue First (Optional)

If you need to see the issue details:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import IssuesContext

memori = create_memori_client("skill:issues")
memori.enable()
context = IssuesContext(memori)

issue_id = "$ARGUMENTS"
history = context.get_issue_history(issue_id)

if history:
    issue = history[0]
    print(f"## {issue.get('issue_id')}: {issue.get('title')}")
    print(f"Severity: {issue.get('severity')} | Status: {issue.get('status')}")
    print(f"\n{issue.get('description', 'No description')[:300]}")
else:
    print(f"❌ Issue not found: {issue_id}")
EOF
```

### 3. Resolve the Issue

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import IssuesContext

memori = create_memori_client("skill:issues")
memori.enable()
context = IssuesContext(memori)

# FILL IN with resolution details
result = context.update_issue_status(
    issue_id="$ARGUMENTS",
    status="resolved",
    notes="[FILL: Brief resolution summary]",
    resolution="[FILL: Detailed resolution - what was changed/fixed]",
    root_cause="[FILL: What caused the issue]",
    fix_commit=None  # [FILL: Git commit hash if applicable]
)

if result:
    print(f"✅ Issue $ARGUMENTS marked as RESOLVED")
    print("\nResolution recorded for future reference.")
    print("Similar issues can now find this resolution via /issue-status")
else:
    print("❌ Failed to update issue")
EOF
```

### 4. Alternative: Mark as Won't Fix

If the issue won't be fixed:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import IssuesContext

memori = create_memori_client("skill:issues")
memori.enable()
context = IssuesContext(memori)

result = context.update_issue_status(
    issue_id="$ARGUMENTS",
    status="wont_fix",
    notes="[FILL: Reason for not fixing]",
    resolution=None,
    root_cause=None,
    fix_commit=None
)

if result:
    print(f"✅ Issue $ARGUMENTS marked as WON'T FIX")
else:
    print("❌ Failed to update issue")
EOF
```

---

## Status Values

| Status | When to Use |
|--------|-------------|
| `resolved` | Issue has been fixed |
| `wont_fix` | Decided not to fix (by design, out of scope, etc.) |
| `investigating` | Still looking into the issue |
| `in_progress` | Actively working on a fix |

---

## Log a Debugging Step (Alternative)

If you're still investigating, log a debugging step instead:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import IssuesContext

memori = create_memori_client("skill:issues")
memori.enable()
context = IssuesContext(memori)

result = context.log_debugging_step(
    issue_id="$ARGUMENTS",
    step_description="[FILL: What was investigated]",
    findings="[FILL: What was discovered]",
    hypothesis="[FILL: Current theory about the cause]",
    next_action="[FILL: What to try next]",
    files_examined=[
        # [FILL: Files examined]
    ]
)

if result:
    print(f"✅ Debugging step logged for $ARGUMENTS")
else:
    print("❌ Failed to log debugging step")
EOF
```

---

## Related Commands

| Command | Purpose |
|---------|---------|
| `/issue-log <title>` | Log new issue |
| `/issue-status` | View open issues |
| `/issue-status <id>` | View issue history |
| `/issue-resolve <id>` | Resolve an issue |
| `/issue-checkpoint` | Save debugging session |
