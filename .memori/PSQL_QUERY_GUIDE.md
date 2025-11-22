# PSQL Query Guide for Memori Database

Quick reference for querying Memori tables via Docker.

## Quick Start

### Connect Interactively
```bash
docker exec -it supabase_db_pt-2 psql -U postgres -d postgres
```

### Set Search Path (Required!)
```sql
SET search_path TO memori, public;
```

Now you can query without schema prefix:
```sql
SELECT * FROM memories;
SELECT * FROM chat_history;
```

## Common Queries

### Count All Memories
```sql
SELECT COUNT(*) FROM memories;
```

### Recent Memories (Last 10)
```sql
SELECT
    id,
    user_id,
    category,
    LEFT(content, 60) as preview,
    created_at
FROM memories
ORDER BY created_at DESC
LIMIT 10;
```

### Memories by Category
```sql
SELECT
    category,
    COUNT(*) as count
FROM memories
GROUP BY category
ORDER BY count DESC;
```

### Memories from Today
```sql
SELECT
    id,
    category,
    content,
    created_at
FROM memories
WHERE created_at::date = CURRENT_DATE
ORDER BY created_at DESC;
```

### Search Memory Content
```sql
SELECT
    id,
    category,
    content,
    created_at
FROM memories
WHERE content ILIKE '%LoyaltyService%'
ORDER BY created_at DESC;
```

### Chat History
```sql
SELECT
    chat_id,
    LEFT(user_input, 50) as input,
    LEFT(ai_output, 50) as output,
    timestamp
FROM chat_history
ORDER BY timestamp DESC;
```

### Memory Metadata (JSON)
```sql
SELECT
    id,
    content,
    metadata::jsonb->>'chatmode' as chatmode,
    metadata::jsonb->>'importance' as importance,
    created_at
FROM memories
WHERE metadata::jsonb->>'chatmode' = 'main'
ORDER BY created_at DESC
LIMIT 5;
```

## One-Liner Commands (Non-Interactive)

### View Recent Memories
```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SET search_path TO memori, public;
SELECT id, category, LEFT(content, 50), created_at FROM memories ORDER BY created_at DESC LIMIT 5;
"
```

### Count by Category
```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT category, COUNT(*) FROM memori.memories GROUP BY category;
"
```

### Today's Memories
```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SET search_path TO memori, public;
SELECT * FROM memories WHERE created_at::date = CURRENT_DATE;
"
```

## Useful Meta-Commands

```sql
-- List all tables in memori schema
\dt memori.*

-- Describe memories table structure
\d memori.memories

-- Show current database
\conninfo

-- Show search path
SHOW search_path;

-- Quit
\q
```

## Troubleshooting

### "relation does not exist"
**Problem**: Forgot to set search_path or use schema prefix

**Solution**: Either:
```sql
SET search_path TO memori, public;
SELECT * FROM memories;  -- Now works
```

OR:
```sql
SELECT * FROM memori.memories;  -- Fully qualified
```

### "permission denied"
**Problem**: Wrong user or database

**Solution**: Use correct connection:
```bash
docker exec -it supabase_db_pt-2 psql -U postgres -d postgres
```

## Schema Information

### Memori Tables
- `memories` - Main memory storage (our hooks write here)
- `chat_history` - Conversation interception records
- `conversations` - Session tracking
- `entities` - Extracted entities
- `relationships` - Entity relationships
- `short_term_memory` - Working memory
- `long_term_memory` - Promoted memories

### Memories Table Structure
```sql
\d memori.memories

Column    | Type      | Description
----------|-----------|-------------
id        | integer   | Primary key
user_id   | varchar   | Chatmode user ID
content   | text      | Memory content
category  | varchar   | facts/preferences/skills/rules/context
metadata  | jsonb     | Structured metadata
embedding | vector    | Semantic embedding (if pgvector)
created_at| timestamp | Creation time
updated_at| timestamp | Last update
```

## Examples

### Find All Implementation Memories
```sql
SELECT
    id,
    content,
    metadata::jsonb->>'entity_name' as entity,
    created_at
FROM memories
WHERE metadata::jsonb->>'type' = 'implementation'
ORDER BY created_at DESC;
```

### Get Session Summaries
```sql
SELECT
    id,
    content,
    metadata::jsonb->>'tasks_completed' as tasks,
    created_at
FROM memories
WHERE metadata::jsonb->>'type' = 'session_summary'
ORDER BY created_at DESC;
```

### Memory Stats
```sql
SELECT
    COUNT(*) as total_memories,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT category) as categories,
    MIN(created_at) as oldest,
    MAX(created_at) as newest
FROM memories;
```

---

**Last Updated**: 2025-11-22
**Location**: `/home/diepulp/projects/pt-2/.memori/PSQL_QUERY_GUIDE.md`
