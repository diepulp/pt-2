# Dynamic Memory Recall System

**Created**: 2025-11-29
**Status**: Implemented
**Location**: `lib/memori/dynamic_recall.py`

## Overview

The Dynamic Memory Recall System addresses three identified gaps in the Memori engine's effectiveness:

1. **Stale Memory Files** - `phase-status.memory.md` was showing outdated information
2. **No Proactive Retrieval** - Skills weren't querying past decisions automatically
3. **Memories Recorded but Not Surfaced** - Data collected but not presented to users

This system provides:

- **DynamicRecall**: Proactive retrieval for skill workflows
- **MemoryFileSync**: DB → memory file synchronization
- **LearningsDiscovery**: Cross-namespace pattern discovery

## Components

### 1. DynamicRecall

Provides proactive memory retrieval for skill workflows. Skills can call `query_past_decisions()` at workflow start to inject relevant context.

```python
from lib.memori.dynamic_recall import DynamicRecall, query_past_decisions

# Quick usage (recommended for skills)
context = query_past_decisions(
    topic="RLS policies",
    namespace="skill:lead-architect",
    limit=5
)
print(context)  # Formatted markdown for injection

# Full API access
recall = DynamicRecall()
memories = recall.query_past_decisions("service architecture")
high_importance = recall.query_high_importance("skill:lead-architect", min_importance=0.8)
recent = recall.query_recent_learnings(hours=24)
recall.close()
```

**Key Methods**:

| Method | Purpose | Use Case |
|--------|---------|----------|
| `query_past_decisions(topic)` | Search across namespaces | Skill startup context |
| `query_recent_learnings(hours)` | Get recent memories | Session continuity |
| `query_high_importance(namespace)` | Get critical context | Inject must-know info |
| `format_for_context(memories)` | Format for injection | Skill preamble |

### 2. MemoryFileSync

Synchronizes Memori database state to memory files, keeping static references current.

```python
from lib.memori.dynamic_recall import MemoryFileSync, sync_memory_files

# Quick sync (recommended)
success, message = sync_memory_files()
print(message)

# Full API access
sync = MemoryFileSync()
success, msg = sync.sync_phase_status()  # Updates memory/phase-status.memory.md
sync.close()
```

**Synced Files**:

| File | Source | Frequency |
|------|--------|-----------|
| `memory/phase-status.memory.md` | MVP Progress namespace | On-demand |

### 3. LearningsDiscovery

Discovers patterns and learnings across all namespaces.

```python
from lib.memori.dynamic_recall import LearningsDiscovery, get_learnings_summary

# Quick summary
print(get_learnings_summary())

# Full API access
discovery = LearningsDiscovery()
stats = discovery.get_namespace_stats()  # Memory counts per namespace
patterns = discovery.get_top_patterns(limit=10)  # Recurring tags/patterns
summary = discovery.format_learnings_summary()  # Formatted output
discovery.close()
```

## Integration Points

### Slash Commands

| Command | Integration |
|---------|-------------|
| `/memory-recall <query>` | Uses DynamicRecall to search memories |
| `/mvp-status` | Includes LearningsDiscovery summary |

### Skill Workflows

Skills should add proactive retrieval at workflow start:

```python
# Example: Add to skill preamble or workflow init
from lib.memori.dynamic_recall import query_past_decisions

# Query relevant past decisions before starting work
context = query_past_decisions(
    topic="<relevant_topic>",
    namespace="skill:<skill-name>",
    limit=5
)

# Inject into context
print("## Past Decisions & Learnings")
print(context)
```

**Recommended Integration Points**:

1. **lead-architect**: Query past architectural decisions before design
2. **backend-service-builder**: Query service patterns before implementation
3. **api-builder**: Query API decisions before route creation
4. **frontend-design**: Query UI patterns before component design

### Memory File Sync

Trigger sync periodically or after significant milestones:

```bash
# From Python
python3 -c "from lib.memori.dynamic_recall import sync_memory_files; print(sync_memory_files())"

# After recording milestone completion
from lib.memori.mvp_progress_context import create_mvp_progress_context
from lib.memori.dynamic_recall import sync_memory_files

ctx = create_mvp_progress_context()
ctx.record_service_completion("ServiceName", ["file1.ts"], test_coverage=90)
sync_memory_files()  # Keep memory file in sync
```

## Scoring Algorithm

Memories are ranked using composite scoring:

```
final_score = (relevance * 0.4) + (recency * 0.3) + (importance * 0.3)
```

| Component | Weight | Calculation |
|-----------|--------|-------------|
| Relevance | 40% | PostgreSQL `ts_rank` full-text search |
| Recency | 30% | Linear decay over 30 days (1.0 → 0.0) |
| Importance | 30% | From metadata `importance` field (default 0.5) |

## Namespace Mappings

The system maps chatmodes/skills to database namespaces:

| Chatmode/Skill | Database user_id |
|----------------|------------------|
| `skill:lead-architect` | `skill_lead_architect` |
| `skill:backend-service-builder` | `skill_backend_service_builder` |
| `skill:api-builder` | `skill_api_builder` |
| `skill:mvp-progress` | `skill_mvp_progress` |
| `skill:frontend-design` | `skill_frontend_design` |
| `architect` | `pt2_architect` |
| `main` | `pt2_agent` |

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Memori Database                              │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ memori.memories table                                       │ │
│  │ - user_id (namespace)                                       │ │
│  │ - content                                                   │ │
│  │ - content_tsv (full-text search index)                      │ │
│  │ - metadata (importance, tags, type)                         │ │
│  │ - created_at                                                │ │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ DynamicRecall │   │MemoryFileSync │   │ Learnings     │
│               │   │               │   │ Discovery     │
│ - Proactive   │   │ - DB → File   │   │               │
│   retrieval   │   │   sync        │   │ - Pattern     │
│ - Context     │   │               │   │   analysis    │
│   injection   │   │               │   │ - Namespace   │
│               │   │               │   │   stats       │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Skill         │   │ Memory Files  │   │ /mvp-status   │
│ Workflows     │   │               │   │               │
│               │   │ phase-status  │   │ Shows patterns│
│ Inject past   │   │ .memory.md    │   │ and activity  │
│ decisions     │   │               │   │               │
└───────────────┘   └───────────────┘   └───────────────┘
```

## Usage Examples

### 1. Search Past Decisions

```bash
/memory-recall service architecture
```

Output:
```
MEMORY RECALL: "service architecture"
============================================================
Category filter: all
Results: 5 found

[1] Score: 0.097
----------------------------------------
Architectural decision: Service-per-bounded-context pattern confirmed

  Category: context
  Namespace: skill_lead_architect
  Tags: architecture, pattern
  Created: 2025-11-28T15:30:00

...
```

### 2. Get MVP Status with Learnings

```bash
/mvp-status
```

Output includes:
```
## Memory Learnings

  Active Namespaces:
    - skill_lead_architect: 53 memories
    - pt2_agent: 16 memories
    - skill_mvp_progress: 10 memories

  Top Patterns:
    - architecture (freq: 12)
    - service-status (freq: 10)
    - milestone (freq: 8)
```

### 3. Sync Memory Files

```python
from lib.memori.dynamic_recall import sync_memory_files

success, msg = sync_memory_files()
print(msg)
# Synced 3 services and 1 phases to memory/phase-status.memory.md
```

### 4. Skill Preamble Integration

```python
# At start of skill workflow
from lib.memori.dynamic_recall import query_past_decisions

# Before designing authentication
context = query_past_decisions("authentication RLS RBAC")
# Returns formatted markdown with past decisions about auth patterns
```

## Effectiveness Assessment

| Capability | Before | After |
|------------|--------|-------|
| Session Checkpoints | HIGH | HIGH (unchanged) |
| Audit Trail | HIGH | HIGH (unchanged) |
| Pattern Learning | LOW | MEDIUM (patterns now surfaced) |
| Doc Evolution | NONE | MEDIUM (auto-sync available) |
| Proactive Retrieval | NONE | HIGH (query_past_decisions) |

## Future Enhancements

1. **Automated Sync Triggers**: Hook into milestone recording to auto-sync
2. **Skill Preamble Templates**: Standard proactive retrieval blocks for each skill
3. **Cross-Session Learning**: Aggregate patterns over longer time periods
4. **Relevance Tuning**: Adjust weights based on usage patterns
5. **Vector Embeddings**: Add semantic search alongside full-text (when needed)

## Related Documentation

- `lib/memori/client.py` - Core Memori client
- `lib/memori/mvp_progress_context.py` - MVP progress tracking
- `lib/memori/retrieval.py` - Async retrieval with composite scoring
- `.claude/commands/memory-recall.md` - Memory recall command
- `.claude/commands/mvp-status.md` - MVP status command
