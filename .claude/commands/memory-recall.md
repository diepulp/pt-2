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
---

Execute a memory search using the MemoryRetriever and display results.

## Search Parameters

- **query**: $ARGUMENTS (required) - The search terms
- **category**: Optional filter for memory category
- **limit**: Number of results (default: 5)

## Information to Display

For each matching memory:

1. **Content** - The memory text
2. **Category** - facts, preferences, rules, skills, or context
3. **Source** - Where this memory came from (source_type)
4. **Confidence** - Confidence score (0.0 - 1.0)
5. **Relevance** - How well it matches the query
6. **Last Used** - Timestamp of last retrieval
7. **Use Count** - Number of times retrieved
8. **Tags** - Associated tags from metadata

## Output Format

```
MEMORY RECALL: "{query}"
========================
Category filter: {category or "all"}
Results: {n} found

[1] Score: {final_score}
────────────────────────
{content}

Category: {category}
Source: {source_type} | Confidence: {confidence}
Last used: {last_used_at} | Uses: {use_count}
Tags: {tags}

[2] Score: {final_score}
────────────────────────
{content}
...

Related Documents:
- {doc_path_1}
- {doc_path_2}
```

## Implementation Notes

- Use `lib/memori/retrieval.py` MemoryRetriever.retrieve()
- Apply composite scoring: relevance (40%) + recency (30%) + importance (30%)
- Include provenance information from lineage field
- Suggest related documents based on memory category
- If no results, suggest broadening the search or checking categories
