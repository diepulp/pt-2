---
description: Query lead-architect Memori knowledge base for past architectural decisions, patterns, and documentation regressions
args:
  - name: query_type
    description: Type of query (decisions|patterns|regressions|debt|compliance|all)
    required: false
    default: all
---

# Query Lead Architect Memory

Query the Memori PostgreSQL database for architectural knowledge.

## Database Configuration

- **Container:** `supabase_db_pt-2`
- **Schema:** `memori`
- **Table:** `memori.memories`
- **Architect namespace:** `pt2_architect` (user_id field)

## Instructions for Agent

Execute the queries below based on the `$ARGUMENTS` value. Run the appropriate SQL queries using:

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "QUERY_HERE"
```

---

## Query: `all` (default)

Run ALL queries below and compile a comprehensive report.

---

## Query: `decisions`

### 1. Architectural Decisions Summary

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    user_id as namespace,
    category,
    LEFT(content, 80) as content_preview,
    metadata->>'type' as type,
    metadata->>'pattern' as pattern,
    metadata->>'importance' as importance,
    created_at
FROM memori.memories
WHERE category IN ('skills', 'rules', 'preferences')
   OR metadata->>'type' LIKE '%decision%'
   OR metadata->>'type' LIKE '%architectural%'
ORDER BY created_at DESC
LIMIT 20;
"
```

### 2. Pattern Usage Analysis

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    metadata->>'pattern' as pattern,
    metadata->>'pattern_used' as pattern_used,
    COUNT(*) as usage_count,
    AVG((metadata->>'importance')::float) as avg_importance
FROM memori.memories
WHERE metadata->>'pattern' IS NOT NULL
   OR metadata->>'pattern_used' IS NOT NULL
GROUP BY metadata->>'pattern', metadata->>'pattern_used'
ORDER BY usage_count DESC;
"
```

---

## Query: `patterns`

### Service Pattern (A/B/C) Analysis

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    content,
    metadata->>'type' as type,
    metadata->>'relevant_docs' as relevant_docs,
    created_at
FROM memori.memories
WHERE content ILIKE '%pattern%'
   OR metadata::text ILIKE '%pattern%'
ORDER BY created_at DESC
LIMIT 15;
"
```

### Architecture Preferences

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    content,
    metadata->>'type' as preference_type,
    metadata->>'importance' as importance
FROM memori.memories
WHERE category = 'preferences'
ORDER BY (metadata->>'importance')::float DESC NULLS LAST;
"
```

---

## Query: `regressions`

### Documentation Regressions & Schema Issues

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    content,
    metadata->>'regression_type' as regression_type,
    metadata->>'affected_docs' as affected_docs,
    metadata->>'resolution' as resolution,
    metadata->>'lessons_learned' as lessons,
    created_at
FROM memori.memories
WHERE metadata->>'type' = 'documentation_regression'
   OR metadata->>'regression_type' IS NOT NULL
   OR content ILIKE '%regression%'
   OR content ILIKE '%drift%'
   OR content ILIKE '%inconsisten%'
ORDER BY created_at DESC
LIMIT 20;
"
```

---

## Query: `debt`

### Technical Debt Assessments

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    content,
    metadata->>'debt_category' as category,
    metadata->>'severity' as severity,
    metadata->>'impact' as impact,
    metadata->>'remediation_strategy' as remediation,
    metadata->>'priority' as priority,
    created_at
FROM memori.memories
WHERE metadata->>'type' = 'tech_debt'
   OR metadata->>'debt_category' IS NOT NULL
   OR content ILIKE '%technical debt%'
   OR content ILIKE '%tech debt%'
ORDER BY
    CASE metadata->>'severity'
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
        ELSE 5
    END,
    created_at DESC
LIMIT 20;
"
```

---

## Query: `compliance`

### Compliance & Security Designs

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    content,
    metadata->>'compliance_requirements' as requirements,
    metadata->>'rls_policies' as rls_policies,
    metadata->>'rbac_roles' as rbac_roles,
    metadata->>'audit_log_location' as audit_log,
    created_at
FROM memori.memories
WHERE metadata->>'type' = 'compliance_design'
   OR metadata->>'compliance_requirements' IS NOT NULL
   OR content ILIKE '%compliance%'
   OR content ILIKE '%RLS%'
   OR content ILIKE '%RBAC%'
   OR content ILIKE '%security%'
ORDER BY created_at DESC
LIMIT 15;
"
```

---

## Summary Queries (Always Run)

### Memory Distribution by Namespace

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    user_id as namespace,
    COUNT(*) as memory_count,
    COUNT(DISTINCT category) as categories,
    MAX(created_at) as last_activity
FROM memori.memories
GROUP BY user_id
ORDER BY memory_count DESC;
"
```

### Category Breakdown

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    category,
    COUNT(*) as count,
    STRING_AGG(DISTINCT user_id, ', ') as namespaces
FROM memori.memories
GROUP BY category
ORDER BY count DESC;
"
```

### Total Memory Count

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT COUNT(*) as total_memories FROM memori.memories;
"
```

---

## Domain-Specific Queries

### By Service Domain

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    COALESCE(metadata->>'service', metadata->>'domain', 'general') as domain,
    COUNT(*) as memory_count,
    STRING_AGG(DISTINCT category, ', ') as categories
FROM memori.memories
WHERE metadata->>'service' IS NOT NULL
   OR metadata->>'domain' IS NOT NULL
GROUP BY COALESCE(metadata->>'service', metadata->>'domain', 'general')
ORDER BY memory_count DESC;
"
```

---

## Output Format

After running queries, compile results into this format:

```markdown
# Lead Architect Memory Analytics

## Summary
- Total Memories: [count]
- Namespaces: [list with counts]
- Categories: [breakdown]

## Architectural Decisions
[List decisions with patterns, rationale, outcomes]

## Pattern Effectiveness
[Which patterns used, success rates if tracked]

## Documentation Health
[Regressions found, resolutions, lessons learned]

## Technical Debt
[Debt items by severity and category]

## Compliance Designs
[Security/compliance architectural knowledge]

## Recommendations
[Based on historical data, what to consider for future work]
```

---

## Memori Schema Reference

The `memori.memories` table structure:

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `user_id` | text | Namespace (e.g., `pt2_architect`, `mtl_agent`) |
| `content` | text | Memory content (100-300 chars ideal) |
| `category` | text | `facts`, `preferences`, `skills`, `rules`, `context` |
| `metadata` | jsonb | Structured data (type, importance, tags, etc.) |
| `embedding` | vector | OpenAI ada-002 embedding (1536 dims) |
| `created_at` | timestamp | When recorded |

### Common Metadata Fields

```json
{
  "type": "architectural_decision | tech_debt | compliance_design | ...",
  "importance": 0.0-1.0,
  "pattern": "Pattern A | Pattern B | Pattern C",
  "domain": "Loyalty | Player | MTL | ...",
  "service": "service_name",
  "relevant_docs": ["doc1.md", "doc2.md"],
  "tags": ["tag1", "tag2"],
  "lessons_learned": ["lesson1", "lesson2"]
}
```

### Namespace Conventions

| Namespace | Purpose |
|-----------|---------|
| `pt2_architect` | Architecture agent memories |
| `pt2_agent` | Main agent session context |
| `mtl_agent` | MTL service domain |
| `player_agent` | Player service domain |
| `skill:lead-architect` | Lead architect skill (future) |

---

## Recording New Architectural Knowledge

To record architectural decisions, use `lib/memori/client.py`:

```python
from lib.memori import create_memori_client

memori = create_memori_client("architect")  # Maps to pt2_architect
memori.enable()

memori.record_memory(
    content="Use Pattern A (Contract-First) for LoyaltyService due to business logic complexity",
    category="skills",
    metadata={
        "type": "architectural_decision",
        "pattern": "Pattern A",
        "domain": "Loyalty",
        "rationale": "Business logic complexity requires explicit DTOs",
        "alternatives_considered": ["Pattern B", "Pattern C"],
        "success_outcome": "approved"
    },
    importance=0.9
)
```

---

## Troubleshooting

### No Data Found

```bash
# Check if Memori schema exists
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "\dt memori.*"

# Check if Supabase is running
docker ps | grep supabase
```

### Connection Issues

```bash
# Restart Supabase
npx supabase stop && npx supabase start
```
