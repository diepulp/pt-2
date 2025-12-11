---
description: Purge expired session checkpoints and stale memories from Memori
args:
  - name: mode
    description: "preview" to see what would be deleted, "execute" to actually delete
    required: false
    default: preview
allowed-tools: Bash
---

# Memori Cleanup

Purge expired session checkpoints and stale memories from the Memori database.

## Modes

| Mode | Description |
|------|-------------|
| `preview` (default) | Show what would be deleted without making changes |
| `execute` | Actually delete expired entries |

---

## Instructions

### Preview Mode (default)

Show what would be deleted without making changes:

```bash
docker exec memori-db psql -U memori -d memori -c "
-- Preview: Expired memories that would be deleted
SELECT
    user_id as namespace,
    category,
    metadata->>'type' as type,
    LEFT(content, 50) as content_preview,
    expires_at,
    created_at
FROM memori.memories
WHERE expires_at IS NOT NULL
  AND expires_at <= NOW()
ORDER BY expires_at DESC
LIMIT 20;
"
```

```bash
docker exec memori-db psql -U memori -d memori -c "
-- Preview: Summary of expired entries by namespace
SELECT
    user_id as namespace,
    COUNT(*) as expired_count,
    MIN(expires_at) as oldest_expiry,
    MAX(expires_at) as newest_expiry
FROM memori.memories
WHERE expires_at IS NOT NULL
  AND expires_at <= NOW()
GROUP BY user_id
ORDER BY expired_count DESC;
"
```

---

### Execute Mode

**CAUTION:** This permanently deletes data. Run preview first to verify.

```bash
docker exec memori-db psql -U memori -d memori -c "
-- Delete expired session checkpoints and other TTL memories
WITH deleted AS (
    DELETE FROM memori.memories
    WHERE expires_at IS NOT NULL
      AND expires_at <= NOW()
    RETURNING id, user_id, category, expires_at
)
SELECT
    user_id as namespace,
    category,
    COUNT(*) as deleted_count
FROM deleted
GROUP BY user_id, category
ORDER BY user_id, category;
"
```

After deletion, run a summary:

```bash
docker exec memori-db psql -U memori -d memori -c "
-- Verify cleanup: Show remaining TTL entries
SELECT
    user_id as namespace,
    COUNT(*) as remaining_ttl_entries,
    MIN(expires_at) as next_expiry,
    MAX(expires_at) as latest_expiry
FROM memori.memories
WHERE expires_at IS NOT NULL
  AND expires_at > NOW()
GROUP BY user_id
ORDER BY user_id;
"
```

---

## What Gets Cleaned Up

| Type | TTL | Namespace Pattern |
|------|-----|-------------------|
| Session checkpoints | 7 days | `session_lead_architect_{YYYY_MM}` |
| Session checkpoints | 7 days | `session_backend_{YYYY_MM}` |
| Session checkpoints | 7 days | `session_api_{YYYY_MM}` |

**NOT cleaned up (permanent):**
- `pt2_project` - Project standards, domain knowledge
- `arch_decisions` - Architectural decisions
- `mvp_progress` - MVP tracking

---

## Automated Cleanup

For automated cleanup, add a cron job or scheduled task:

```bash
# Daily cleanup at 3 AM (add to crontab)
0 3 * * * docker exec memori-db psql -U memori -d memori -c "DELETE FROM memori.memories WHERE expires_at IS NOT NULL AND expires_at <= NOW();"
```

Or use PostgreSQL's `pg_cron` extension if available:

```sql
-- Schedule daily cleanup at 3 AM UTC
SELECT cron.schedule('memori-cleanup', '0 3 * * *', $$
    DELETE FROM memori.memories
    WHERE expires_at IS NOT NULL
      AND expires_at <= NOW();
$$);
```

---

## Cleanup Report Format

After running cleanup, summarize:

```
MEMORI CLEANUP REPORT
=====================

## Before Cleanup
- Total memories: xxx
- Expired entries: xxx

## Deleted
- session_lead_architect_*: xx entries
- session_backend_*: xx entries
- session_api_*: xx entries

## After Cleanup
- Total memories: xxx
- Next scheduled expiry: YYYY-MM-DD

## Recommendation
- Run /memori-status to verify cleanup
- Consider adding automated cleanup schedule
```

---

## Related Commands

| Command | Purpose |
|---------|---------|
| `/memori-status` | Show namespace hierarchy and TTL status |
| `/arch-memory` | Query architectural decisions |
| `/backend-checkpoint restore` | Restore backend session |
| `/api-checkpoint restore` | Restore API session |
| `/arch-checkpoint restore` | Restore architect session |
