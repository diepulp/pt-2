---
description: Query lead-architect Memori knowledge base for past architectural decisions, patterns, MVP progress, and documentation regressions
args:
  - name: query_type
    description: Type of query (decisions|patterns|regressions|debt|compliance|mvp|all)
    required: false
    default: all
---

# Query Lead Architect Memory

Query the Memori PostgreSQL database for architectural knowledge using the consolidated 4-tier namespace hierarchy.

## Namespace Hierarchy (4-Tier)

| Tier | Namespace | Purpose | TTL |
|------|-----------|---------|-----|
| 1 | `pt2_project` | Project standards, domain knowledge | Permanent |
| 2 | `arch_decisions` | Architectural decisions, patterns | Permanent |
| 3 | `mvp_progress` | MVP implementation tracking | Operational |
| 4 | `session_{skill}_{YYYY_MM}` | Session checkpoints | 7-day TTL |

## Database Configuration

- **Container:** `supabase_db_pt-2`
- **Schema:** `memori`
- **Table:** `memori.memories`

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
WHERE user_id IN ('arch_decisions', 'pt2_project')
  AND (category IN ('skills', 'rules', 'preferences')
       OR metadata->>'type' LIKE '%decision%'
       OR metadata->>'type' LIKE '%architectural%')
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
WHERE user_id IN ('arch_decisions', 'pt2_project')
  AND (metadata->>'pattern' IS NOT NULL
       OR metadata->>'pattern_used' IS NOT NULL)
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
WHERE user_id IN ('arch_decisions', 'pt2_project')
  AND (content ILIKE '%pattern%'
       OR metadata::text ILIKE '%pattern%')
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
WHERE user_id IN ('arch_decisions', 'pt2_project')
  AND category = 'preferences'
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
WHERE user_id IN ('arch_decisions', 'pt2_project')
  AND (metadata->>'type' = 'documentation_regression'
       OR metadata->>'regression_type' IS NOT NULL
       OR content ILIKE '%regression%'
       OR content ILIKE '%drift%'
       OR content ILIKE '%inconsisten%')
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
WHERE user_id IN ('arch_decisions', 'pt2_project')
  AND (metadata->>'type' = 'tech_debt'
       OR metadata->>'debt_category' IS NOT NULL
       OR content ILIKE '%technical debt%'
       OR content ILIKE '%tech debt%')
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
WHERE user_id IN ('arch_decisions', 'pt2_project')
  AND (metadata->>'type' = 'compliance_design'
       OR metadata->>'compliance_requirements' IS NOT NULL
       OR content ILIKE '%compliance%'
       OR content ILIKE '%RLS%'
       OR content ILIKE '%RBAC%'
       OR content ILIKE '%security%')
ORDER BY created_at DESC
LIMIT 15;
"
```

---

## Query: `mvp`

### MVP Implementation Progress

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    metadata->>'service_name' as service,
    metadata->>'prd_reference' as prd,
    metadata->>'status' as status,
    metadata->>'code_exists' as code,
    metadata->>'tests_exist' as tests,
    created_at
FROM memori.memories
WHERE user_id = 'mvp_progress'
  AND metadata->>'type' = 'service_status'
ORDER BY created_at DESC
LIMIT 20;
"
```

### MVP Milestone Transitions

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    metadata->>'phase' as phase,
    metadata->>'phase_name' as name,
    metadata->>'status' as status,
    metadata->>'services_completed' as completed,
    metadata->>'services_pending' as pending,
    created_at
FROM memori.memories
WHERE user_id = 'mvp_progress'
  AND metadata->>'type' = 'milestone_transition'
ORDER BY created_at DESC
LIMIT 10;
"
```

### MVP PRD Status

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    metadata->>'prd_id' as prd,
    metadata->>'status' as status,
    metadata->>'scope' as scope,
    metadata->>'services_defined' as services,
    created_at
FROM memori.memories
WHERE user_id = 'mvp_progress'
  AND metadata->>'type' = 'prd_status'
ORDER BY created_at DESC;
"
```

### Lead Architect Session Checkpoints (with TTL)

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    user_id as namespace,
    LEFT(metadata->>'current_task', 60) as task,
    metadata->>'checkpoint_reason' as reason,
    metadata->>'ttl_days' as ttl,
    expires_at,
    created_at
FROM memori.memories
WHERE (user_id LIKE 'session_lead_architect_%' OR user_id = 'arch_decisions')
  AND metadata->>'type' = 'session_checkpoint'
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY created_at DESC
LIMIT 5;
"
```

---

## Summary Queries (Always Run)

### Memory Distribution by Namespace (4-Tier View)

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    CASE
        WHEN user_id = 'pt2_project' THEN 'Tier 1: pt2_project'
        WHEN user_id = 'arch_decisions' THEN 'Tier 2: arch_decisions'
        WHEN user_id = 'mvp_progress' THEN 'Tier 3: mvp_progress'
        WHEN user_id LIKE 'session_%' THEN 'Tier 4: session_* (ephemeral)'
        ELSE 'Legacy: ' || user_id
    END as tier,
    user_id as namespace,
    COUNT(*) as memory_count,
    COUNT(DISTINCT category) as categories,
    MAX(created_at) as last_activity,
    COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at > NOW()) as with_ttl,
    COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= NOW()) as expired
FROM memori.memories
GROUP BY user_id
ORDER BY
    CASE
        WHEN user_id = 'pt2_project' THEN 1
        WHEN user_id = 'arch_decisions' THEN 2
        WHEN user_id = 'mvp_progress' THEN 3
        WHEN user_id LIKE 'session_%' THEN 4
        ELSE 5
    END,
    memory_count DESC;
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

### Total Memory Count with TTL Summary

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    COUNT(*) as total_memories,
    COUNT(*) FILTER (WHERE expires_at IS NULL) as permanent,
    COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at > NOW()) as active_ttl,
    COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= NOW()) as expired
FROM memori.memories;
"
```

---

## Domain-Specific Queries

### By Service Domain (with tags)

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    COALESCE(
        metadata->>'service',
        metadata->>'domain',
        (SELECT tag FROM jsonb_array_elements_text(metadata->'tags') tag WHERE tag LIKE 'domain:%' LIMIT 1),
        'general'
    ) as domain,
    COUNT(*) as memory_count,
    STRING_AGG(DISTINCT category, ', ') as categories
FROM memori.memories
WHERE user_id IN ('pt2_project', 'arch_decisions')
GROUP BY COALESCE(
    metadata->>'service',
    metadata->>'domain',
    (SELECT tag FROM jsonb_array_elements_text(metadata->'tags') tag WHERE tag LIKE 'domain:%' LIMIT 1),
    'general'
)
ORDER BY memory_count DESC;
"
```

---

## Output Format

After running queries, compile results into this format:

```markdown
# Lead Architect Memory Analytics

## Namespace Hierarchy Status
- Tier 1 (pt2_project): [count] memories - Project standards
- Tier 2 (arch_decisions): [count] memories - Architecture decisions
- Tier 3 (mvp_progress): [count] memories - MVP tracking
- Tier 4 (session_*): [count] active, [count] expired - Session checkpoints

## MVP Implementation Progress
- Phase 0 (Horizontal): [status] - TransportLayer, ErrorTaxonomy, ServiceResultPattern, QueryInfra
- Phase 1 (Core): [status] - CasinoService, PlayerService, VisitService
- Phase 2 (Session+UI): [status] - TableContextService, RatingSlipService, PitDashboard
- Phase 3 (Rewards): [status] - LoyaltyService, PlayerFinancialService, MTLService
- Current Blocker: [what's blocking progress]
- Recent Completions: [services completed recently]

## Lead Architect Checkpoints
[Recent checkpoints with current task, next steps, TTL status]

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
| `user_id` | text | Namespace (tier-based) |
| `content` | text | Memory content (100-300 chars ideal) |
| `category` | text | `facts`, `preferences`, `skills`, `rules`, `context` |
| `metadata` | jsonb | Structured data (type, importance, tags, etc.) |
| `embedding` | vector | OpenAI ada-002 embedding (1536 dims) |
| `expires_at` | timestamp | TTL expiration (NULL = permanent) |
| `created_at` | timestamp | When recorded |

### Namespace Conventions (4-Tier Hierarchy)

| Tier | Namespace | Purpose |
|------|-----------|---------|
| 1 | `pt2_project` | Project standards, domain knowledge (merged from legacy) |
| 2 | `arch_decisions` | Architectural decisions, patterns, compliance |
| 3 | `mvp_progress` | MVP implementation progress tracking |
| 4 | `session_lead_architect_{YYYY_MM}` | Lead architect session checkpoints (7-day TTL) |
| 4 | `session_backend_{YYYY_MM}` | Backend service builder checkpoints (7-day TTL) |
| 4 | `session_api_{YYYY_MM}` | API builder checkpoints (7-day TTL) |

### Domain Tags (in pt2_project namespace)

Cross-domain search is enabled via tags:
- `domain:mtl` - MTL (Marker Tracking Log) domain
- `domain:player` - Player domain
- `domain:loyalty` - Loyalty domain
- `domain:visit` - Visit/session domain

---

## Recording New Architectural Knowledge

To record architectural decisions, use `lib/memori/client.py`:

```python
from lib.memori import create_memori_client

memori = create_memori_client("skill:lead-architect")  # Maps to arch_decisions
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
    importance=0.9,
    tags=["architectural-decision", "domain:loyalty", "Pattern-A"]
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

### Check for Expired Checkpoints

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT user_id, COUNT(*) as expired_count
FROM memori.memories
WHERE expires_at IS NOT NULL AND expires_at <= NOW()
GROUP BY user_id;
"
```
