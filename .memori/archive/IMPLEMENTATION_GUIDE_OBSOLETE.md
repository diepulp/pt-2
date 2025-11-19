# Memori Optimization Implementation Guide

## Summary

This guide documents the refactoring of PT-2's Memori ingestion from **whole-document storage** to **intelligent, granular fact extraction**.

## Problem Statement

### Current State (Broken)
```
❌ 285 memories = 285 whole documents (avg 86KB each)
❌ Query "What are MTL thresholds?" → Returns 3x 86KB dumps
❌ Token cost: ~25,000 tokens per query
❌ Specific facts buried in noise
❌ No semantic extraction or categorization
```

### Root Cause
The current `memori-ingest.py` script bypasses Memori's intelligent architecture:
- Stores raw documents directly in DB
- No use of Memori's Memory Agent (fact extraction)
- No categorization (facts/preferences/rules/skills/context)
- No entity extraction or relationship mapping
- Violates Memori's design: it's meant to intercept LLM conversations, not store whole docs

## Solution Overview

### New Architecture (`memori-ingest-v2.py`)

**1. Intelligent Document Chunking**
- Split by markdown sections (headers)
- Preserve hierarchy and context
- Limit chunk size to 500-1000 chars
- Respect paragraph/sentence boundaries

**2. LLM-Powered Fact Extraction**
- Use GPT-4o-mini to extract facts from each chunk
- Classify into Memori categories (facts/preferences/rules/skills/context)
- Extract entities (services, tables, thresholds)
- Score importance and provide reasoning

**3. Pattern-Based Extraction**
- Regex patterns for high-confidence facts
- Threshold detection ($10,000, $3,000)
- Table ownership parsing
- FK relationship extraction

**4. Granular Storage**
- Store individual facts (200-500 chars each)
- Rich metadata (source file:line, section path, entities)
- Category-based organization
- Importance scoring

## Files Created

### 1. Strategy Document
**File:** `.memori/INGESTION_STRATEGY.md`
**Purpose:** Detailed analysis and strategy for optimization

**Key Sections:**
- Problem analysis
- Chunking rules
- Category mapping (PT-2 docs → Memori categories)
- Performance targets
- Migration path

### 2. Refactored Ingestion Script
**File:** `scripts/memori-ingest-v2.py`
**Purpose:** Production-ready optimized ingestion

**Key Components:**

```python
# Document chunking
class DocumentChunker:
    def chunk_markdown_by_sections(...)  # Split by headers
    def chunk_large_sections(...)         # Refine oversized chunks

# Fact extraction
class FactExtractor:
    def extract_facts_from_chunk(...)  # LLM-powered extraction
    def extract_patterns(...)          # Regex-based extraction

# Main engine
class OptimizedIngestionEngine:
    def ingest_document(...)   # Process single doc
    def ingest_context(...)    # Process bounded context
    def store_memory(...)      # Store individual facts
```

### 3. Implementation Guide (This File)
**File:** `.memori/IMPLEMENTATION_GUIDE.md`
**Purpose:** How to migrate and validate

## Implementation Steps

### Step 1: Backup Current State

```bash
# Backup existing memories
docker exec supabase_db_pt-2 pg_dump -U postgres -d postgres \
  --table=memori.memories \
  --table=memori.entities \
  --table=memori.relationships \
  > /tmp/memori-backup-$(date +%Y%m%d).sql
```

### Step 2: Test Single Context

```bash
# Test on MTL service context first (smallest, most critical)
python scripts/memori-ingest-v2.py --context mtl_service --dry-run

# Review extraction quality
# Check fact count, categories, entities
```

### Step 3: Run Full Ingestion

```bash
# Set OpenAI API key for LLM extraction
export OPENAI_API_KEY="sk-..."

# Run optimized ingestion (parallel to existing data)
python scripts/memori-ingest-v2.py 2>&1 | tee logs/memori-ingest-v2.log
```

### Step 4: Validate Results

```sql
-- Check new memory counts
SELECT
    user_id,
    category,
    COUNT(*) as count,
    AVG(LENGTH(content)) as avg_size
FROM memori.memories
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id, category
ORDER BY user_id, category;

-- Sample facts by category
SELECT category, content, metadata->>'source' as source
FROM memori.memories
WHERE user_id = 'mtl_service'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY category, created_at DESC
LIMIT 20;
```

### Step 5: Test Query Quality

```python
# Test queries against new memories
from memori import Memori

memori = Memori(
    database_connect=DATABASE_URL,
    user_id="mtl_service"
)

# Query for thresholds
results = memori.search_memories("What are the MTL thresholds?", limit=5)
for r in results:
    print(f"[{r['category']}] {r['content']}")
    print(f"  Source: {r['metadata']['source']}")
    print()
```

### Step 6: Compare Performance

```python
# Old approach (whole docs)
old_query_tokens = estimate_tokens(old_results)  # ~25,000 tokens
old_relevance = calculate_relevance(old_results)  # ~40% relevant

# New approach (granular facts)
new_query_tokens = estimate_tokens(new_results)  # ~300 tokens
new_relevance = calculate_relevance(new_results)  # ~90% relevant

# Cost savings
savings = (old_query_tokens - new_query_tokens) / old_query_tokens
print(f"Token reduction: {savings:.1%}")  # Expected: 98-99%
```

## Expected Outcomes

### Memory Storage

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Total memories | 285 | 1,500-2,500 | 5-9x more granular |
| Avg memory size | 86,000 chars | 300 chars | 99.6% smaller |
| Storage overhead | High | Low | More facts, less bloat |
| Categorization | None | 100% | facts/rules/skills/etc |
| Entity extraction | None | 100% | tables/services/thresholds |

### Query Performance

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Relevant results | 20-40% | 85-95% | 2-4x better |
| Token cost/query | 20,000-30,000 | 200-400 | 98-99% reduction |
| Response precision | Low | High | Exact facts vs dumps |
| Context quality | Buried in noise | Targeted | Actionable |

### Example Query Comparison

**Query:** "What are the MTL thresholds?"

**Before (Whole Documents):**
```
Result 1: [86KB SRM document containing thresholds somewhere]
Result 2: [86KB SRM document (duplicate)]
Result 3: [SEC-001 document mentioning thresholds]
Tokens: ~25,000
Usability: ❌ Must manually search through dumps
```

**After (Granular Facts):**
```
Result 1: [FACT] "CTR threshold is $10,000" (SRM:1234)
Result 2: [FACT] "Watchlist floor is $3,000" (SRM:1235)
Result 3: [CONTEXT] "Thresholds stored in casino_settings.watchlist_floor and ctr_threshold" (SRM:1240)
Result 4: [RULE] "MTL reads casino_settings read-only via trigger" (SRM:1260)
Result 5: [FACT] "Transaction logging threshold: $2,500-$3,000 (configurable)" (MTL_DOMAIN:22)
Tokens: ~300
Usability: ✅ Immediate, precise answers
```

## Category Mapping

### PT-2 Documentation → Memori Categories

| PT-2 Content | Memori Category | Examples |
|--------------|-----------------|----------|
| Threshold values | `facts` | "CTR threshold: $10,000" |
| Table ownership | `facts` | "MTL owns mtl_entry (immutable)" |
| FK relationships | `facts` | "MTL references casino_settings (read-only)" |
| Architecture patterns | `preferences` | "Use functional factories, not classes" |
| Anti-patterns | `rules` | "Never use ReturnType inference" |
| Must/must not | `rules` | "All PKs must be uuid" |
| Service capabilities | `skills` | "MTL can detect CTR threshold breaches" |
| Service responsibilities | `skills` | "MTLService handles AML/CTR compliance" |
| Bounded context info | `context` | "MTL is in Compliance bounded context" |
| Dependencies | `context` | "MTL reads casino_settings via trigger" |

## Validation Checklist

- [ ] Backup existing memories created
- [ ] V2 script runs without errors
- [ ] Memory count increased to 1500-2500 range
- [ ] Avg memory size reduced to ~300 chars
- [ ] All categories populated (facts/rules/preferences/skills/context)
- [ ] Entity extraction working (tables, services, thresholds)
- [ ] Source metadata includes file:line references
- [ ] Test query "MTL thresholds" returns 5 specific facts
- [ ] Token usage per query reduced by 95%+
- [ ] Query relevance improved to 85%+
- [ ] Critical facts preserved (thresholds, ownership, relationships)

## Rollback Plan

If validation fails:

```bash
# Restore from backup
docker exec -i supabase_db_pt-2 psql -U postgres -d postgres < /tmp/memori-backup-YYYYMMDD.sql

# Or delete new memories
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c \
  "DELETE FROM memori.memories WHERE created_at > 'YYYY-MM-DD HH:MM:SS';"
```

## Next Steps

After successful validation:

1. **Archive old memories**: Mark whole-document memories as deprecated
2. **Update query scripts**: Use category filters for precision
3. **Monitor performance**: Track query quality and token usage
4. **Iterate extraction**: Improve fact extraction prompts based on results
5. **Expand coverage**: Add more documents to ingestion paths
6. **Automate**: Schedule periodic re-ingestion for doc updates

## Maintenance

### Re-ingestion Triggers

Run v2 ingestion when:
- SRM or other core docs are updated
- New services are added
- Architecture patterns change
- Compliance requirements update

### Quality Monitoring

```sql
-- Check fact distribution
SELECT category, COUNT(*)
FROM memori.memories
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY category;

-- Check entity extraction
SELECT jsonb_array_elements_text(metadata->'entities') as entity, COUNT(*)
FROM memori.memories
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY entity
ORDER BY COUNT(*) DESC
LIMIT 20;

-- Check source coverage
SELECT metadata->>'source' as source, COUNT(*)
FROM memori.memories
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY source
ORDER BY COUNT(*) DESC;
```

## Cost Estimation

### Ingestion Costs (One-Time)

Assuming 12 contexts, ~50 files, 2000 total chunks:

```
LLM calls: 2000 chunks × GPT-4o-mini extraction
Input tokens: ~800 chars/chunk × 1.3 = ~1040 tokens/chunk
Output tokens: ~5 facts × 100 tokens = ~500 tokens/chunk
Total: 2000 × (1040 + 500) = ~3M tokens

Cost: ~3M tokens × $0.150/1M input + ~1M tokens × $0.600/1M output
    = $0.45 + $0.60 = ~$1.05 total ingestion cost
```

### Query Cost Savings (Ongoing)

Per 1000 queries:

```
Before: 1000 × 25,000 tokens = 25M tokens = $3.75/1000 queries
After:  1000 × 300 tokens = 300K tokens = $0.045/1000 queries
Savings: $3.70/1000 queries (98.8% reduction)

Break-even: ~300 queries (~1 day of usage)
```

## Success Criteria

The refactoring is successful if:

1. ✅ Memory count increases 5-9x (more granular)
2. ✅ Avg memory size decreases 99%+ (86KB → 300 chars)
3. ✅ Query token usage decreases 95%+ (25K → 300 tokens)
4. ✅ Query relevance improves to 85%+ (vs 40% before)
5. ✅ All critical facts extractable (thresholds, ownership, rules)
6. ✅ Category distribution balanced across facts/rules/skills/context
7. ✅ Entity extraction captures tables, services, patterns
8. ✅ Source metadata enables traceability
9. ✅ Break-even on cost within 24 hours
10. ✅ Agent queries return actionable, precise answers

## References

- `.memori/INGESTION_STRATEGY.md` - Detailed strategy document
- `scripts/memori-ingest-v2.py` - Optimized ingestion implementation
- https://memorilabs.ai/docs/open-source/architecture/ - Memori architecture
- https://memorilabs.ai/docs/open-source/features/ - Memory categories and types
