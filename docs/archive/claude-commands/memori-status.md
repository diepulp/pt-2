---
description: Show Memori 4-tier namespace structure, memory counts, and TTL status
allowed-tools: Bash
---

# Memori Status

Display the current state of the Memori knowledge base including the 4-tier namespace hierarchy, memory counts, and TTL status for session checkpoints.

## Instructions

Run the following SQL queries to get a comprehensive status report:

### 1. Namespace Hierarchy Overview

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    CASE
        WHEN user_id = 'pt2_project' THEN '1. pt2_project'
        WHEN user_id = 'arch_decisions' THEN '2. arch_decisions'
        WHEN user_id = 'mvp_progress' THEN '3. mvp_progress'
        WHEN user_id = 'issues' THEN '3. issues'
        WHEN user_id LIKE 'session_%' THEN '4. session_* (ephemeral)'
        ELSE '?. ' || user_id || ' (legacy)'
    END as tier,
    user_id as namespace,
    COUNT(*) as total_memories,
    COUNT(*) FILTER (WHERE expires_at IS NULL) as permanent,
    COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at > NOW()) as active_ttl,
    COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= NOW()) as expired,
    MAX(created_at)::date as last_activity
FROM memori.memories
GROUP BY user_id
ORDER BY
    CASE
        WHEN user_id = 'pt2_project' THEN 1
        WHEN user_id = 'arch_decisions' THEN 2
        WHEN user_id = 'mvp_progress' THEN 3
        WHEN user_id = 'issues' THEN 3
        WHEN user_id LIKE 'session_%' THEN 4
        ELSE 5
    END,
    total_memories DESC;
"
```

### 2. Total Memory Summary

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    COUNT(*) as total_memories,
    COUNT(*) FILTER (WHERE expires_at IS NULL) as permanent,
    COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at > NOW()) as active_ttl,
    COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= NOW()) as expired_pending_cleanup,
    pg_size_pretty(pg_total_relation_size('memori.memories')) as table_size
FROM memori.memories;
"
```

### 3. Category Distribution

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    category,
    COUNT(*) as count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) as percentage
FROM memori.memories
GROUP BY category
ORDER BY count DESC;
"
```

### 4. Session Checkpoint Status (Tier 4)

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    user_id as namespace,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE expires_at > NOW()) as active,
    COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired,
    MIN(expires_at) FILTER (WHERE expires_at > NOW()) as next_expiry,
    MAX(created_at)::date as last_checkpoint
FROM memori.memories
WHERE user_id LIKE 'session_%'
  AND metadata->>'type' = 'session_checkpoint'
GROUP BY user_id
ORDER BY last_checkpoint DESC;
"
```

### 5. Recent Activity (Last 7 Days)

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    user_id as namespace,
    category,
    COUNT(*) as memories_created,
    MAX(created_at)::timestamp(0) as latest
FROM memori.memories
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id, category
ORDER BY latest DESC
LIMIT 15;
"
```

### 6. Domain Tag Distribution

```bash
docker exec memori-db psql -U memori -d memori -c "
SELECT
    tag,
    COUNT(*) as count
FROM memori.memories,
     jsonb_array_elements_text(metadata->'tags') tag
WHERE tag LIKE 'domain:%'
   OR tag LIKE 'Pattern%'
   OR tag IN ('session-checkpoint', 'architectural-decision', 'tech-debt', 'documentation-regression')
GROUP BY tag
ORDER BY count DESC
LIMIT 20;
"
```

---

## Output Format

After running queries, compile results into this format:

```
MEMORI STATUS REPORT
====================

## Namespace Hierarchy (4-Tier)

| Tier | Namespace | Total | Permanent | Active TTL | Expired |
|------|-----------|-------|-----------|------------|---------|
| 1    | pt2_project | xxx | xxx | - | - |
| 2    | arch_decisions | xxx | xxx | - | - |
| 3    | mvp_progress | xxx | xxx | - | - |
| 3    | issues | xxx | xxx | - | - |
| 4    | session_* | xxx | - | xxx | xxx |

## Summary
- Total Memories: xxx
- Permanent: xxx (xx%)
- Active TTL: xxx (xx%)
- Expired (pending cleanup): xxx

## Session Checkpoints
- lead_architect: x active, x expired
- backend: x active, x expired
- api: x active, x expired
- issues: x active, x expired

## Actions Required
- [If expired > 0] Run /memori-cleanup to purge xxx expired entries
- [If legacy namespaces exist] Consider migrating legacy namespaces
```

---

## Namespace Hierarchy Reference

| Tier | Namespace Pattern | Purpose | TTL |
|------|-------------------|---------|-----|
| 1 | `pt2_project` | Project standards, domain knowledge, UI patterns | Permanent |
| 2 | `arch_decisions` | Architectural decisions, patterns, compliance | Permanent |
| 3 | `mvp_progress` | MVP implementation tracking | Operational |
| 3 | `issues` | Bug tracking, debugging workflows | Operational |
| 4 | `session_lead_architect_{YYYY_MM}` | Architect session checkpoints | 7 days |
| 4 | `session_backend_{YYYY_MM}` | Backend builder checkpoints | 7 days |
| 4 | `session_api_{YYYY_MM}` | API builder checkpoints | 7 days |
| 4 | `session_issues_{YYYY_MM}` | Debugging session checkpoints | 7 days |

---

## Related Commands

| Command | Purpose |
|---------|---------|
| `/memori-cleanup` | Purge expired session checkpoints |
| `/arch-memory` | Query architectural decisions |
| `/memory-recall <query>` | Search memories by topic |
| `/mvp-status` | Show MVP implementation progress |
| `/issue-status` | View open issues |
| `/issue-log <title>` | Log a new issue |
| `/issue-checkpoint` | Save/restore debugging session |
