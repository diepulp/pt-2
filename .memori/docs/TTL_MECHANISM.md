# TTL Mechanism for Session Checkpoints

> **Primitive Document** - Defines the Time-To-Live (TTL) mechanism for ephemeral session checkpoints.

## Overview

Session checkpoints use a 7-day TTL to automatically expire stale context. This prevents memory bloat while preserving recent work state for session continuity.

## How It Works

```
┌──────────────────────────────────────────────────────────────────┐
│  Checkpoint Created                                              │
│  ↓                                                               │
│  expires_at = NOW() + INTERVAL '7 days'                          │
│  ↓                                                               │
│  Stored in session_{skill}_{YYYY_MM} namespace                   │
│  ↓                                                               │
│  Query filters: WHERE expires_at IS NULL OR expires_at > NOW()   │
│  ↓                                                               │
│  After 7 days: Excluded from queries (logically expired)         │
│  ↓                                                               │
│  /memori-cleanup: Physically deleted                             │
└──────────────────────────────────────────────────────────────────┘
```

## Database Implementation

### Schema

```sql
ALTER TABLE memori.memories
ADD COLUMN expires_at TIMESTAMPTZ DEFAULT NULL;

-- Index for efficient TTL queries
CREATE INDEX idx_memories_expires_at ON memori.memories(expires_at)
WHERE expires_at IS NOT NULL;

-- Index for cleanup queries
CREATE INDEX idx_memories_expired ON memori.memories(expires_at)
WHERE expires_at IS NOT NULL AND expires_at <= NOW();
```

### Python Implementation

```python
# In lib/memori/skill_context.py

def save_checkpoint(self, current_task, ...):
    from datetime import timedelta

    ttl_days = self.memori.get_session_ttl_days()  # Returns 7
    expires_at = datetime.now() + timedelta(days=ttl_days)

    metadata = {
        "type": "session_checkpoint",
        "ttl_days": ttl_days,
        ...
    }

    cur.execute("""
        INSERT INTO memori.memories (user_id, content, category, metadata, expires_at)
        VALUES (%s, %s, %s, %s, %s)
    """, (session_ns, content, "context", json.dumps(metadata), expires_at))
```

### Query Filtering

All checkpoint queries automatically exclude expired entries:

```sql
SELECT * FROM memori.memories
WHERE user_id LIKE 'session_lead_architect_%'
  AND metadata->>'type' = 'session_checkpoint'
  AND (expires_at IS NULL OR expires_at > NOW())  -- TTL filter
ORDER BY created_at DESC
LIMIT 1;
```

## Skills with TTL Checkpoints

| Skill | Namespace Pattern | TTL |
|-------|-------------------|-----|
| `skill:lead-architect` | `session_lead_architect_{YYYY_MM}` | 7 days |
| `skill:backend-service-builder` | `session_backend_{YYYY_MM}` | 7 days |
| `skill:api-builder` | `session_api_{YYYY_MM}` | 7 days |

## Skills with Permanent Checkpoints

These skills do NOT use TTL - their checkpoints are permanent:

| Skill | Namespace | Reason |
|-------|-----------|--------|
| `skill:frontend-design` | `pt2_project` | UI patterns should persist for consistency |
| `skill:skill-creator` | `pt2_project` | Skill creation knowledge is reusable |

## Configuration

```python
# In lib/memori/client.py

class MemoriClient:
    SESSION_TTL_DAYS = 7  # Configure here

    SESSION_CHECKPOINT_SKILLS = {
        "skill:lead-architect": "lead_architect",
        "skill:backend-service-builder": "backend",
        "skill:api-builder": "api",
    }

    def get_session_ttl_days(self) -> int:
        return self.SESSION_TTL_DAYS

    def get_session_namespace(self) -> Optional[str]:
        skill_short = self.SESSION_CHECKPOINT_SKILLS.get(self.chatmode)
        if not skill_short:
            return None  # Use permanent namespace

        month_suffix = datetime.now().strftime("%Y_%m")
        return f"session_{skill_short}_{month_suffix}"
```

## Cleanup Strategies

### Manual Cleanup

```bash
/memori-cleanup preview   # See what would be deleted
/memori-cleanup execute   # Delete expired entries
```

### Automated Cleanup (Cron)

```bash
# Daily at 3 AM
0 3 * * * docker exec supabase_db_pt-2 psql -U postgres -d postgres -c \
  "DELETE FROM memori.memories WHERE expires_at IS NOT NULL AND expires_at <= NOW();"
```

### PostgreSQL pg_cron

```sql
SELECT cron.schedule('memori-cleanup', '0 3 * * *', $$
    DELETE FROM memori.memories
    WHERE expires_at IS NOT NULL
      AND expires_at <= NOW();
$$);
```

## Backwards Compatibility

The `load_latest_checkpoint()` method searches both new session namespaces AND legacy namespaces:

```python
def load_latest_checkpoint(self):
    session_ns = self._get_session_namespace()

    # Search session namespace first, fall back to legacy
    cur.execute("""
        SELECT content, metadata, created_at, user_id
        FROM memori.memories
        WHERE (user_id = %s
               OR user_id = %s
               OR user_id LIKE 'session_lead_architect_%%')
          AND metadata->>'type' = 'session_checkpoint'
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY created_at DESC
        LIMIT 1
    """, (session_ns, self.memori.user_id))
```

## Monitoring

### Check TTL Status

```sql
-- Active vs expired by namespace
SELECT
    user_id,
    COUNT(*) FILTER (WHERE expires_at IS NULL) as permanent,
    COUNT(*) FILTER (WHERE expires_at > NOW()) as active_ttl,
    COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired
FROM memori.memories
WHERE user_id LIKE 'session_%'
GROUP BY user_id;
```

### Next Expiration

```sql
SELECT
    user_id,
    MIN(expires_at) as next_expiry,
    MAX(expires_at) as latest_expiry
FROM memori.memories
WHERE expires_at IS NOT NULL
  AND expires_at > NOW()
GROUP BY user_id;
```

## Design Rationale

**Why 7 days?**
- Balances short-term session continuity with storage efficiency
- Covers typical work week plus weekend gap
- Long enough to resume abandoned work, short enough to prevent stale context

**Why separate session namespaces?**
- Isolates ephemeral data from permanent knowledge
- Enables efficient cleanup without scanning permanent data
- Month suffix (`{YYYY_MM}`) groups related checkpoints

**Why TTL instead of count-based limits?**
- Time-based is more predictable for users
- Avoids losing recent checkpoints if many are created quickly
- Simpler to implement and reason about
