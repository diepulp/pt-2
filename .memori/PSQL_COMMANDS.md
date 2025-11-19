# PostgreSQL Commands for Memori Agent Memory

Quick reference for exploring and querying Memori's agent session memory in the Supabase database.

**Note:** Memori is now configured for **agent session memory**, not documentation storage.

## Connection

```bash
# Via Docker (recommended)
docker exec supabase_db_pt-2 psql -U postgres -d postgres

# Or use -c flag for one-liner commands
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "SELECT COUNT(*) FROM memori.memories;"
```

## 🔍 Essential Quick Queries

### 1. Overall Summary

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    COUNT(*) as total_memories,
    COUNT(DISTINCT user_id) as agents,
    COUNT(DISTINCT category) as categories,
    ROUND(AVG(LENGTH(content))) as avg_size,
    MAX(LENGTH(content)) as max_size
FROM memori.memories;"
```

### 2. Agent Memory Distribution

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    user_id as agent,
    COUNT(*) as memories,
    ROUND(AVG(LENGTH(content))) as avg_size
FROM memori.memories
GROUP BY user_id
ORDER BY memories DESC;"
```

### 3. Category Distribution

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    category,
    COUNT(*) as count,
    ROUND(AVG(LENGTH(content))) as avg_size
FROM memori.memories
GROUP BY category
ORDER BY count DESC;"
```

### 4. View All Agent Memories

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    user_id,
    category,
    content,
    LENGTH(content) as size
FROM memori.memories
ORDER BY user_id, category;"
```

### 5. Show Recent Memories

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    user_id,
    category,
    LEFT(content, 100) as preview,
    created_at
FROM memori.memories
ORDER BY created_at DESC
LIMIT 10;"
```

### 6. View Documentation References

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    user_id,
    content,
    jsonb_array_elements_text(metadata->'relevant_docs') as doc_reference
FROM memori.memories
WHERE metadata ? 'relevant_docs'
ORDER BY user_id;"
```

## 🎯 Agent-Specific Queries

### PT2 Agent Context

```bash
# All PT2 agent memories
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT category, content
FROM memori.memories
WHERE user_id = 'pt2_agent'
ORDER BY category;"

# PT2 agent rules only
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT content
FROM memori.memories
WHERE user_id = 'pt2_agent' AND category = 'rules';"

# PT2 agent preferences
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT content
FROM memori.memories
WHERE user_id = 'pt2_agent' AND category = 'preferences';"
```

### MTL Agent Context

```bash
# MTL agent memories
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT category, content
FROM memori.memories
WHERE user_id = 'mtl_agent';"

# MTL facts (thresholds, ownership)
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT content
FROM memori.memories
WHERE user_id = 'mtl_agent' AND category = 'facts';"
```

### Player Agent Context

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT category, content
FROM memori.memories
WHERE user_id = 'player_agent';"
```

## 🔍 Search Queries

### Search by Content

```bash
# Search for specific term
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT user_id, category, content
FROM memori.memories
WHERE content ILIKE '%threshold%';"

# Search for CTR information
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT user_id, content
FROM memori.memories
WHERE content ILIKE '%CTR%' OR content ILIKE '%\$10,000%';"

# Search for service patterns
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT content
FROM memori.memories
WHERE content ILIKE '%functional factor%' OR content ILIKE '%service%';"
```

### Search by Category

```bash
# All facts
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT user_id, content
FROM memori.memories
WHERE category = 'facts';"

# All rules
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT content
FROM memori.memories
WHERE category = 'rules';"

# All preferences
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT content
FROM memori.memories
WHERE category = 'preferences';"

# All skills
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT user_id, content
FROM memori.memories
WHERE category = 'skills';"
```

## 📊 Metadata Queries

### View Memory Metadata

```bash
# Show all metadata
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    user_id,
    category,
    metadata,
    LEFT(content, 50) as preview
FROM memori.memories
LIMIT 10;"

# Extract specific metadata fields
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    user_id,
    content,
    metadata->>'type' as memory_type,
    metadata->>'importance' as importance,
    metadata->>'service' as service
FROM memori.memories
WHERE metadata IS NOT NULL;"
```

### Document References

```bash
# All doc references
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    jsonb_array_elements_text(metadata->'relevant_docs') as doc,
    COUNT(*) as referenced_by
FROM memori.memories
WHERE metadata ? 'relevant_docs'
GROUP BY doc
ORDER BY referenced_by DESC;"

# Most referenced docs
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
WITH doc_refs AS (
    SELECT jsonb_array_elements_text(metadata->'relevant_docs') as doc
    FROM memori.memories
    WHERE metadata ? 'relevant_docs'
)
SELECT doc, COUNT(*) as count
FROM doc_refs
GROUP BY doc
ORDER BY count DESC;"
```

## 🗑️ Cleanup & Maintenance

### Check for Oversized Memories

```bash
# Should return 0 for correct architecture
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT COUNT(*) as oversized_memories
FROM memori.memories
WHERE LENGTH(content) > 5000;"

# Show any oversized memories
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT user_id, LENGTH(content) as size, LEFT(content, 100) as preview
FROM memori.memories
WHERE LENGTH(content) > 1000
ORDER BY size DESC;"
```

### Verify Agent Memory Health

```bash
# Check memory distribution is reasonable
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    'Total Memories' as metric,
    COUNT(*)::text as value
FROM memori.memories
UNION ALL
SELECT
    'Avg Size (chars)',
    ROUND(AVG(LENGTH(content)))::text
FROM memori.memories
UNION ALL
SELECT
    'Max Size (chars)',
    MAX(LENGTH(content))::text
FROM memori.memories
UNION ALL
SELECT
    'Categories Used',
    COUNT(DISTINCT category)::text
FROM memori.memories
UNION ALL
SELECT
    'Agents',
    COUNT(DISTINCT user_id)::text
FROM memori.memories;"
```

### Database Size

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size
FROM pg_tables
WHERE schemaname = 'memori'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

## 📋 Schema Information

### List Memori Tables

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "\dt memori.*"
```

### Describe Memories Table

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "\d+ memori.memories"
```

### View Indexes

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "\di memori.*"
```

## 📤 Export Data

### Export All Memories to JSON

```bash
# Export to container's /tmp
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
COPY (
    SELECT
        user_id,
        category,
        content,
        metadata,
        created_at
    FROM memori.memories
    ORDER BY user_id, created_at
) TO '/tmp/memori_agent_memories.json';"

# Copy from container to host
docker cp supabase_db_pt-2:/tmp/memori_agent_memories.json ./memori_export.json
```

### Export by Agent

```bash
# Export PT2 agent memories
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
COPY (
    SELECT category, content, metadata
    FROM memori.memories
    WHERE user_id = 'pt2_agent'
) TO '/tmp/pt2_agent_memories.csv' CSV HEADER;"
```

## 🔧 Administrative Commands

### Reset Memori Database

```bash
# Delete all memories (use with caution!)
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
DELETE FROM memori.memories;"

# Delete specific agent's memories
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
DELETE FROM memori.memories
WHERE user_id = 'mtl_agent';"
```

### Vacuum Tables

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
VACUUM ANALYZE memori.memories;"
```

## 💡 Usage Tips

### Agent Memory Purpose

Memori stores:
- ✅ **Session summaries** - "Created MTLService at src/services/mtl.service.ts"
- ✅ **User preferences** - "User prefers functional factories"
- ✅ **Learned patterns** - "Always check SRM for ownership"
- ✅ **Project context** - "Working on MTL compliance features"
- ✅ **Doc references** - Pointers to relevant files (NOT file contents)

Memori does NOT store:
- ❌ **Static documentation** - Use file system instead
- ❌ **Whole documents** - Keep docs in git
- ❌ **Large content** - Memory should be < 500 chars typically

### Query Best Practices

1. **Filter by agent (user_id)** first for speed
2. **Use category** to narrow down memory type
3. **Check metadata** for doc references
4. **Verify sizes** - avg should be ~100-300 chars
5. **Monitor count** - should be 10-100 per agent, not thousands

### Expected Memory Profile

For a healthy agent memory system:

```
Total Memories: 10-100 (not thousands)
Avg Size: 100-300 chars (not 86,000!)
Max Size: < 500 chars (definitely not 86KB)
Categories: facts, preferences, rules, skills, context
Agents: pt2_agent, mtl_agent, player_agent, etc.
```

## 📚 Related Files

- `.memori/CORRECT_ARCHITECTURE.md` - Architecture guide
- `.memori/config.yml` - Memori configuration
- `scripts/memori-reset-and-seed.py` - Reset script
