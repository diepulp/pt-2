---
description: Search memory for specific context
args:
  - name: query
    description: What to search for
    required: true
  - name: category
    description: Filter by category (facts, preferences, rules, skills, context)
    required: false
  - name: limit
    description: Maximum results to return (default 5)
    required: false
allowed-tools: Bash, Read
---

# Memory Recall Command

Search the Memori database for past decisions, patterns, and learnings using full-text search with composite scoring.

## Search Parameters

- **query**: $ARGUMENTS (required) - The search terms
- **category**: Optional filter for memory category
- **limit**: Number of results (default: 5)

## Instructions

Run this Python code to execute the memory search:

```bash
python3 << 'EOF'
import sys
from lib.memori.dynamic_recall import DynamicRecall, LearningsDiscovery

# Parse arguments (query is required)
query = "$ARGUMENTS"
if not query or query == "$ARGUMENTS":
    print("ERROR: Query is required. Usage: /memory-recall <search terms>")
    sys.exit(1)

# Optional filters
category = None  # Can be: facts, preferences, rules, skills, context
limit = 5

print("=" * 60)
print(f"MEMORY RECALL: \"{query}\"")
print("=" * 60)
print(f"Category filter: {category or 'all'}")
print()

# Initialize DynamicRecall
recall = DynamicRecall()

try:
    # Query past decisions across namespaces
    memories = recall.query_past_decisions(
        topic=query,
        namespace=None,  # Search all namespaces
        limit=limit,
        include_cross_namespace=True
    )

    if not memories:
        print("No results found.")
        print()
        print("Suggestions:")
        print("  - Try broader search terms")
        print("  - Check available categories: facts, preferences, rules, skills, context")
        print("  - Use /mvp-status to see namespace activity")
    else:
        print(f"Results: {len(memories)} found\n")

        for i, mem in enumerate(memories, 1):
            print(f"[{i}] Score: {mem.relevance_score:.3f}")
            print("-" * 40)
            print(mem.content)
            print()
            print(f"  Category: {mem.category}")
            print(f"  Namespace: {mem.source_namespace}")
            if mem.tags:
                print(f"  Tags: {', '.join(mem.tags[:5])}")
            print(f"  Created: {mem.created_at[:19] if mem.created_at else 'unknown'}")
            print()

    # Also show recent high-importance memories if query is broad
    if len(query.split()) <= 2:
        print("-" * 60)
        print("HIGH-IMPORTANCE RECENT MEMORIES:")
        print("-" * 60)

        recent = recall.query_recent_learnings(hours=48)
        for mem in recent[:3]:
            importance = mem.metadata.get("importance", 0.5) if mem.metadata else 0.5
            if importance >= 0.8:
                print(f"  [{mem.category}] {mem.content[:100]}...")
                print(f"    Source: {mem.source_namespace}")
                print()

finally:
    recall.close()

# Show related documents based on query patterns
print("-" * 60)
print("RELATED DOCUMENTS:")
print("-" * 60)

# Pattern-based document suggestions
query_lower = query.lower()
related_docs = []

if any(term in query_lower for term in ["rls", "policy", "security", "rbac"]):
    related_docs.append("docs/30-security/SEC-001-rls-policy-matrix.md")
if any(term in query_lower for term in ["service", "layer", "architecture"]):
    related_docs.append("docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md")
    related_docs.append("docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md")
if any(term in query_lower for term in ["pattern", "anti-pattern", "guard"]):
    related_docs.append("docs/patterns/OVER_ENGINEERING_GUARDRAIL.md")
    related_docs.append("memory/anti-patterns.memory.md")
if any(term in query_lower for term in ["prd", "requirement", "feature"]):
    related_docs.append("docs/10-prd/PRD-STD-001_PRD_STANDARD.md")
if any(term in query_lower for term in ["api", "route", "endpoint"]):
    related_docs.append("docs/20-architecture/EDGE_TRANSPORT_POLICY.md")
if any(term in query_lower for term in ["test", "quality", "qa"]):
    related_docs.append("docs/40-quality/QA-001-service-testing-strategy.md")
if any(term in query_lower for term in ["type", "schema", "database"]):
    related_docs.append("types/database.types.ts")
if any(term in query_lower for term in ["temporal", "gaming day", "time"]):
    related_docs.append("docs/20-architecture/temporal-patterns/")
if any(term in query_lower for term in ["mvp", "phase", "roadmap"]):
    related_docs.append("docs/20-architecture/MVP-ROADMAP.md")
    related_docs.append("memory/phase-status.memory.md")

if related_docs:
    for doc in related_docs[:5]:
        print(f"  - {doc}")
else:
    print("  No specific related documents identified.")
    print("  Try: docs/INDEX.md for full documentation index")

print()
print("=" * 60)
EOF
```

## Output Format

```
MEMORY RECALL: "{query}"
============================================================
Category filter: {category or "all"}
Results: {n} found

[1] Score: {relevance_score}
----------------------------------------
{content}

  Category: {category}
  Namespace: {source_namespace}
  Tags: {tags}
  Created: {created_at}

[2] Score: {relevance_score}
----------------------------------------
{content}
...

------------------------------------------------------------
RELATED DOCUMENTS:
------------------------------------------------------------
  - {doc_path_1}
  - {doc_path_2}
```

## Scoring Algorithm

Memories are scored using composite ranking:

- **Relevance (40%)**: Full-text search rank using PostgreSQL `ts_rank`
- **Recency (30%)**: Decay over 30 days (1.0 for new, 0.0 after 30 days)
- **Importance (30%)**: From metadata `importance` field (default 0.5)

## Usage Examples

```bash
# Search for RLS-related decisions
/memory-recall RLS policies

# Search for service architecture patterns
/memory-recall service layer architecture

# Search for recent decisions about a specific service
/memory-recall CasinoService

# Search for testing patterns
/memory-recall testing strategy
```

## Programmatic Usage

For skill workflows, use the Python API directly:

```python
from lib.memori.dynamic_recall import query_past_decisions

# Quick context injection at skill start
context = query_past_decisions(
    topic="service layer patterns",
    namespace="skill:lead-architect",
    limit=5
)
print(context)  # Formatted markdown for injection
```

## Related Commands

- `/mvp-status` - Show MVP progress and namespace activity
- `/session-status` - Show current session state
- `/arch-memory` - Architect-specific memory queries
