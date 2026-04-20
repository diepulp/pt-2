---
description: View open issues and their status from the issues namespace
argument-hint: [severity|category|issue-id]
allowed-tools: Bash, Read
---

# Issue Status

**Filter:** `$ARGUMENTS`

View open issues from the Memori issues namespace.

## Instructions

### View All Open Issues (default)

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import IssuesContext

memori = create_memori_client("skill:issues")
memori.enable()
context = IssuesContext(memori)

issues = context.get_open_issues(limit=20)

if not issues:
    print("No open issues found.")
else:
    print(f"## Open Issues ({len(issues)} found)\n")
    for issue in issues:
        severity = issue.get('severity', 'unknown').upper()
        status = issue.get('status', 'open')
        title = issue.get('title', 'Untitled')
        issue_id = issue.get('issue_id', 'N/A')
        created = issue.get('created_at', 'unknown')[:10] if issue.get('created_at') else 'unknown'

        # Severity emoji
        emoji = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🟢"}.get(severity, "⚪")

        print(f"{emoji} **{issue_id}** [{severity}] {title}")
        print(f"   Status: {status} | Created: {created}")
        if issue.get('related_service'):
            print(f"   Service: {issue.get('related_service')}")
        if issue.get('related_prd'):
            print(f"   PRD: {issue.get('related_prd')}")
        print()
EOF
```

### View Issues by Severity

If argument is a severity level (critical, high, medium, low):

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import IssuesContext

memori = create_memori_client("skill:issues")
memori.enable()
context = IssuesContext(memori)

# Filter by severity
severity = "$ARGUMENTS".lower() if "$ARGUMENTS" else None
issues = context.get_open_issues(severity=severity, limit=20)

if not issues:
    print(f"No {severity or 'open'} issues found.")
else:
    print(f"## {severity.upper() if severity else 'Open'} Issues ({len(issues)} found)\n")
    for issue in issues:
        print(f"- **{issue.get('issue_id')}**: {issue.get('title')}")
        print(f"  Status: {issue.get('status')} | Category: {issue.get('category')}")
        print()
EOF
```

### View Single Issue History

If argument looks like an issue ID (ISSUE-XXXXXXXX):

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.skill_context import IssuesContext

memori = create_memori_client("skill:issues")
memori.enable()
context = IssuesContext(memori)

issue_id = "$ARGUMENTS"
history = context.get_issue_history(issue_id)

if not history:
    print(f"❌ No issue found with ID: {issue_id}")
else:
    # First entry is the original issue
    issue = history[0]
    print(f"## {issue.get('issue_id')}: {issue.get('title')}")
    print(f"**Severity:** {issue.get('severity')} | **Category:** {issue.get('category')}")
    print(f"**Status:** {issue.get('status')}")
    print(f"**Created:** {issue.get('created_at', 'unknown')[:19]}")
    print()
    print("### Description")
    print(issue.get('description', 'No description'))
    print()

    if issue.get('error_message'):
        print("### Error Message")
        print(f"```\n{issue.get('error_message')}\n```")
        print()

    if issue.get('reproduction_steps'):
        print("### Reproduction Steps")
        for i, step in enumerate(issue.get('reproduction_steps', []), 1):
            print(f"{i}. {step}")
        print()

    if issue.get('affected_files'):
        print("### Affected Files")
        for f in issue.get('affected_files', []):
            print(f"- {f}")
        print()

    # Show history
    if len(history) > 1:
        print("### History")
        for event in history[1:]:
            event_type = event.get('type', 'unknown')
            timestamp = event.get('created_at', '')[:19] if event.get('created_at') else ''

            if event_type == 'issue_update':
                print(f"- **{timestamp}** Status → {event.get('status')}")
                if event.get('notes'):
                    print(f"  {event.get('notes')}")
            elif event_type == 'debugging_step':
                print(f"- **{timestamp}** Debug: {event.get('step_description', '')[:80]}")
                if event.get('findings'):
                    print(f"  Finding: {event.get('findings')[:100]}")
EOF
```

---

## Quick SQL Query (Alternative)

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    metadata->>'issue_id' as id,
    metadata->>'severity' as severity,
    metadata->>'status' as status,
    LEFT(metadata->>'title', 50) as title,
    created_at::date as created
FROM memori.memories
WHERE user_id = 'issues'
  AND metadata->>'type' = 'issue'
  AND metadata->>'status' IN ('open', 'investigating', 'in_progress')
ORDER BY
    CASE metadata->>'severity'
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
    END,
    created_at DESC
LIMIT 20;
"
```

---

## Related Commands

| Command | Purpose |
|---------|---------|
| `/issue-log <title>` | Log new issue |
| `/issue-status` | View open issues |
| `/issue-status critical` | View critical issues only |
| `/issue-status ISSUE-XXXXX` | View specific issue history |
| `/issue-resolve <id>` | Resolve an issue |
| `/issue-checkpoint` | Save debugging session |
