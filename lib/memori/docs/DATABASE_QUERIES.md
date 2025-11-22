# PostgreSQL Commands for Memori Database (via Docker)

Quick reference for inspecting and managing the Memori PostgreSQL database.

---

## Basic Connection

### Connect to Supabase PostgreSQL Container

```bash
# Basic connection (default postgres database)
docker exec -it supabase_db_pt-2 psql -U postgres -d postgres

# Or using the connection string
docker exec -it supabase_db_pt-2 psql postgresql://postgres:postgres@localhost:5432/postgres

# Explore withou exiting, no -c one-shot query
docker exec -it supabase_db_pt-2 psql -U postgres -d postgres
```

---

## Essential psql Meta-Commands

### Schema & Table Discovery

```sql
-- List all schemas
\dn

-- List all tables in memori schema
\dt memori.*

-- List all tables in all schemas
\dt *.*

-- Describe a specific table (columns, types, constraints)
\d memori.memories
\d memori.entities
\d memori.relationships
\d memori.conversations

-- List all indexes on a table
\di memori.*

-- Show table sizes
\dt+ memori.*

-- List all functions in memori schema
\df memori.*

-- List all extensions
\dx
```

### Database Info

```sql
-- Current database
\conninfo

-- List all databases
\l

-- Show current search_path
SHOW search_path;

-- Set search_path to memori schema (avoids typing "memori." prefix)
SET search_path TO memori, public;
```

### Output Formatting

```sql
-- Expanded display (vertical format, better for wide rows)
\x

-- Toggle expanded display
\x auto

-- Normal display
\x off

-- Change output format
\pset format wrapped    -- Wrapped columns
\pset format aligned    -- Aligned columns (default)
\pset format unaligned  -- CSV-like
```

### Help & Exit

```sql
-- List all psql commands
\?

-- SQL help
\h

-- Help on specific SQL command
\h SELECT

-- Exit
\q
```

---

## Memori-Specific Queries

### Inspect Memori Schema

```sql
-- Count records in each table
SELECT
    'memories' as table_name,
    COUNT(*) as count
FROM memori.memories
UNION ALL
SELECT
    'entities' as table_name,
    COUNT(*) as count
FROM memori.entities
UNION ALL
SELECT
    'relationships' as table_name,
    COUNT(*) as count
FROM memori.relationships
UNION ALL
SELECT
    'conversations' as table_name,
    COUNT(*) as count
FROM memori.conversations;
```

### View Recent Memories

```sql
-- Recent memories (all chatmodes)
SELECT
    user_id,
    category,
    LEFT(content, 60) as content_preview,
    created_at
FROM memori.memories
ORDER BY created_at DESC
LIMIT 10;

-- Memories for specific chatmode
SELECT
    category,
    content,
    metadata,
    created_at
FROM memori.memories
WHERE user_id = 'pt2_architect'
ORDER BY created_at DESC
LIMIT 10;
```

### Chatmode Memory Breakdown

```sql
-- Count memories per chatmode
SELECT
    user_id as chatmode,
    COUNT(*) as memory_count,
    COUNT(DISTINCT category) as categories_used,
    MAX(created_at) as last_memory
FROM memori.memories
GROUP BY user_id
ORDER BY memory_count DESC;
```

### Memory Categories

```sql
-- Count by category
SELECT
    category,
    COUNT(*) as count,
    user_id
FROM memori.memories
GROUP BY category, user_id
ORDER BY count DESC;
```

### Entities Extracted

```sql
-- View extracted entities
SELECT
    entity_type,
    entity_name,
    metadata,
    created_at
FROM memori.entities
ORDER BY created_at DESC
LIMIT 20;

-- Count entities by type
SELECT
    entity_type,
    COUNT(*) as count
FROM memori.entities
GROUP BY entity_type
ORDER BY count DESC;
```

### Relationships

```sql
-- View entity relationships
SELECT
    r.relationship_type,
    e1.entity_name as from_entity,
    e2.entity_name as to_entity,
    r.metadata
FROM memori.relationships r
JOIN memori.entities e1 ON r.from_entity_id = e1.id
JOIN memori.entities e2 ON r.to_entity_id = e2.id
ORDER BY r.created_at DESC
LIMIT 10;
```

### Conversations/Sessions

```sql
-- Recent sessions
SELECT
    conversation_id,
    user_id,
    started_at,
    ended_at,
    message_count
FROM memori.conversations
ORDER BY started_at DESC
LIMIT 10;

-- Active sessions (not ended)
SELECT
    conversation_id,
    user_id,
    started_at,
    message_count
FROM memori.conversations
WHERE ended_at IS NULL;
```

### Search Memories (Full-Text)

```sql
-- Search for specific terms
SELECT
    user_id,
    category,
    content,
    created_at
FROM memori.memories
WHERE content ILIKE '%factory%'
   OR content ILIKE '%service%'
ORDER BY created_at DESC;
```

### Vector Embeddings (pgvector)

```sql
-- Check if embeddings exist
SELECT
    COUNT(*) as total_memories,
    COUNT(embedding) as memories_with_embeddings,
    COUNT(*) - COUNT(embedding) as memories_without_embeddings
FROM memori.memories;

-- Embedding dimensions (should be 1536 for OpenAI ada-002)
SELECT
    array_length(embedding, 1) as embedding_dimensions,
    COUNT(*) as count
FROM memori.memories
WHERE embedding IS NOT NULL
GROUP BY array_length(embedding, 1);
```

---

## Useful Combined Queries

### Full Memory Audit

```sql
-- Comprehensive overview
SELECT
    'Total Memories' as metric,
    COUNT(*)::text as value
FROM memori.memories
UNION ALL
SELECT
    'Unique Chatmodes',
    COUNT(DISTINCT user_id)::text
FROM memori.memories
UNION ALL
SELECT
    'Total Entities',
    COUNT(*)::text
FROM memori.entities
UNION ALL
SELECT
    'Total Relationships',
    COUNT(*)::text
FROM memori.relationships
UNION ALL
SELECT
    'Total Sessions',
    COUNT(*)::text
FROM memori.conversations;
```

### Chatmode Activity Report

```sql
-- Activity per chatmode
SELECT
    user_id as chatmode,
    COUNT(*) as memories,
    MIN(created_at) as first_memory,
    MAX(created_at) as last_memory,
    EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))/3600 as hours_active
FROM memori.memories
GROUP BY user_id
ORDER BY memories DESC;
```

### Recent Activity Timeline

```sql
-- Last 24 hours of activity
SELECT
    DATE_TRUNC('hour', created_at) as hour,
    user_id,
    COUNT(*) as memories_recorded
FROM memori.memories
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), user_id
ORDER BY hour DESC;
```

---

## Maintenance Queries

### Clear All Memori Data (DANGEROUS)

```sql
-- ⚠️ WARNING: This deletes ALL memories
TRUNCATE memori.memories CASCADE;
TRUNCATE memori.entities CASCADE;
TRUNCATE memori.relationships CASCADE;
TRUNCATE memori.conversations CASCADE;
```

### Clear Specific Chatmode

```sql
-- Delete memories for one chatmode
DELETE FROM memori.memories WHERE user_id = 'pt2_architect';
```

### Database Size

```sql
-- Size of memori schema
SELECT
    schemaname,
    pg_size_pretty(SUM(pg_total_relation_size(schemaname||'.'||tablename))::bigint) as size
FROM pg_tables
WHERE schemaname = 'memori'
GROUP BY schemaname;
```

---

## One-Liner Commands (from host, no interactive session)

```bash
# Count memories
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "SELECT COUNT(*) FROM memori.memories;"

# List tables
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "\dt memori.*"

# Recent memories
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "SELECT user_id, category, LEFT(content, 50), created_at FROM memori.memories ORDER BY created_at DESC LIMIT 5;"

# Chatmode summary
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "SELECT user_id, COUNT(*) FROM memori.memories GROUP BY user_id;"
```

---

## Quick Reference Card

```bash
# Connect
docker exec -it supabase_db_pt-2 psql -U postgres -d postgres

# Inside psql:
SET search_path TO memori, public;  -- Set default schema
\x auto                              -- Auto expand wide results
\dt                                  -- List tables
\d memories                          -- Describe memories table

# View data
SELECT * FROM memories LIMIT 10;
SELECT user_id, COUNT(*) FROM memories GROUP BY user_id;

# Exit
\q
```

---

## Debug Checklist

```sql
-- 1. Is Memori schema created?
\dn

-- 2. Are tables created?
\dt memori.*

-- 3. Is pgvector extension installed?
\dx

-- 4. Are there any memories?
SELECT COUNT(*) FROM memori.memories;

-- 5. Are embeddings being generated?
SELECT COUNT(embedding) FROM memori.memories WHERE embedding IS NOT NULL;

-- 6. Recent activity?
SELECT MAX(created_at) FROM memori.memories;
```

---

## Common Troubleshooting

### No Tables Found

```sql
-- Check if schema exists
\dn

-- If not, run initialization:
-- python lib/memori/scripts/memori-init-db.py
```

### No Embeddings

```sql
-- Check OpenAI API key is set
SELECT current_setting('app.openai_api_key', true);

-- Verify Memori is enabled with auto_ingest
-- Check client.py: auto_ingest=True
```

### Connection Refused

```bash
# Check Supabase is running
docker ps | grep supabase

# If not running:
npx supabase start
```

---

**Quick Access**: Bookmark this file for fast database inspection during development.

**Created**: 2025-11-21
**Version**: 1.0.0
**Part of**: PT-2 Memori Integration
