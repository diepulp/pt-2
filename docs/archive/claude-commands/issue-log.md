---
description: Log a new bug or issue to the issues namespace for tracking
argument-hint: <title>
allowed-tools: Bash, Read
---

# Log Issue

**Title:** `$ARGUMENTS`

Log a new issue or bug to the Memori issues namespace for cross-session tracking.

## Instructions

### 1. Gather Issue Details

Before logging, collect the following information:

1. **Title**: Short, descriptive title (from argument or ask user)
2. **Description**: Detailed description of the issue
3. **Severity**: critical, high, medium, or low
4. **Category**: bug, error, regression, performance, or ux
5. **Affected Files**: List of files involved (if known)
6. **Reproduction Steps**: How to reproduce (if applicable)
7. **Error Message**: The actual error (if applicable)
8. **Related PRD/Service**: Which PRD or service is affected

### 2. Log the Issue

Run the following Python code with the gathered details:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import IssuesContext

memori = create_memori_client("skill:issues")
memori.enable()
context = IssuesContext(memori)

# FILL IN with issue details
issue_id = context.log_issue(
    title="[FILL: Issue title]",
    description="[FILL: Detailed description]",
    severity="medium",  # critical, high, medium, low
    category="bug",  # bug, error, regression, performance, ux
    affected_files=[
        # [FILL: List of affected files]
    ],
    reproduction_steps=[
        # [FILL: Steps to reproduce]
    ],
    error_message=None,  # [FILL: Error message if applicable]
    stack_trace=None,  # [FILL: Stack trace if applicable]
    related_prd=None,  # [FILL: e.g., "PRD-008"]
    related_service=None,  # [FILL: e.g., "PlayerFinancialService"]
    tags=[
        # [FILL: Additional tags]
    ]
)

if issue_id:
    print(f"✅ Issue logged successfully!")
    print(f"Issue ID: {issue_id}")
    print(f"\nUse '/issue-status' to view open issues")
    print(f"Use '/issue-resolve {issue_id}' when fixed")
else:
    print("❌ Failed to log issue")
EOF
```

### 3. Output Format

After logging, display:
- The generated Issue ID (e.g., ISSUE-A1B2C3D4)
- Summary of what was logged
- Next steps for tracking

---

## Severity Guide

| Severity | When to Use |
|----------|-------------|
| **critical** | System down, data loss, security issue |
| **high** | Major feature broken, blocking work |
| **medium** | Feature partially working, workaround exists |
| **low** | Minor issue, cosmetic, nice-to-have fix |

## Category Guide

| Category | When to Use |
|----------|-------------|
| **bug** | Code not working as intended |
| **error** | Runtime error, exception |
| **regression** | Previously working feature now broken |
| **performance** | Slow, memory issues, timeouts |
| **ux** | Usability, accessibility issues |

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `/issue-log <title>` | Log new issue |
| `/issue-status` | View open issues |
| `/issue-resolve <id>` | Resolve an issue |
| `/issue-checkpoint` | Save debugging session |
