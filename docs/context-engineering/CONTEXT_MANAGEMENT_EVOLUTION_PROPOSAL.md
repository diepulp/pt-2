# Context Management & Memory System Evolution Proposal

**Version**: 2.0.0
**Date**: 2025-11-25
**Status**: ✅ Implemented
**References**: [Context Management Handoff](./context-management-handoff.md), [Agentic Workflow Strategy](../agentic-workflow/agentic-workflow-strategy.md)

**Changelog**:
- v2.0.0 (2025-11-25): **IMPLEMENTED** - All 6 phases complete. See `docs/context-engineering/SESSION_HANDOFF_20251125_V2.md` for implementation details.
- v1.1.0 (2025-11-25): Revised retrieval strategy to use PostgreSQL-native full-text search instead of vector embeddings. Vector DB marked as optional future enhancement.

---

## Executive Summary

This proposal augments PT-2's existing agentic workflow system with concepts from the **Context Management Handoff** whitepaper. It bridges the current file-based memory approach (`.claude/memory/`, Memori PostgreSQL) with a more sophisticated **Session + Memory architecture** that separates short-term workbench state from long-term knowledge persistence.

**Key innovations:**
1. **Formalize Session Layer** - Structured event logs per conversation, with state scratchpads
2. **Upgrade Memory Generation Pipeline** - Move from manual recording to background ETL with extraction/consolidation
3. **Implement Hybrid Retrieval** - Proactive (auto-inject) + Reactive (memory-as-tool)
4. **Add Compaction Strategies** - Sliding window + summarization for long sessions
5. **Strengthen Multi-Agent Coordination** - Per-agent private logs + shared memory protocol

---

## Table of Contents

1. [Current State Analysis](#part-1-current-state-analysis)
2. [Proposed Architecture](#part-2-proposed-architecture)
3. [Integration with Existing System](#part-3-integration-with-existing-system)
4. [Implementation Roadmap](#part-4-implementation-roadmap)
5. [Migration Strategy](#part-5-migration-strategy)
6. [Success Metrics](#part-6-success-metrics)
7. [Risks & Mitigations](#part-7-risks--mitigations)
8. [File Structure Summary](#part-8-file-structure-summary)

---

## Part 1: Current State Analysis

### What Exists Today

| Layer | Implementation | Status |
|-------|---------------|--------|
| **Memory Files** | `.claude/memory/*.memory.md` (6 planned) | Planned but not created |
| **Chatmodes** | `.github/chatmodes/` (6 modes) | ✅ Implemented |
| **Instructions** | `.github/instructions/` (4 files) | ✅ Implemented |
| **Workflow Prompts** | `.claude/workflows/` (7 prompts) | ✅ Implemented |
| **Skills** | `.claude/skills/` (4 skills) | ✅ Implemented |
| **Memori DB** | PostgreSQL `memori` schema | ✅ Running |
| **Memory Recording** | Manual calls in chatmodes | ⚠️ Partial (hooks not connected) |

### Gap Analysis

| Whitepaper Concept | Current State | Gap |
|--------------------|---------------|-----|
| **Session Events** (append-only log) | None - conversation lost between turns | No persistent session tracking |
| **Session State** (scratchpad) | None - working memory not captured | No structured state object |
| **Memory Generation Pipeline** | Manual recording in chatmodes | No automated extraction/consolidation |
| **Memory Retrieval** | `@memory/*.memory.md` file inclusion | No full-text search, no proactive injection |
| **Compaction** | None | Long sessions exhaust context window |
| **Multi-Agent Protocol** | Per-chatmode isolation | No shared session coordination |
| **Provenance Tracking** | Basic `created_at` | Missing source type, confidence, lineage |

---

## Part 2: Proposed Architecture

### 2.1 Layer Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONTEXT ASSEMBLY LAYER                       │
│  buildContext(turn) → system + tools + memories + history       │
└─────────────────────────────────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  SESSION LAYER  │  │  MEMORY LAYER   │  │   RAG LAYER     │
│  (Short-Term)   │  │  (Long-Term)    │  │ (Static Docs)   │
│                 │  │                 │  │                 │
│ • Event Log     │  │ • User-level    │  │ • docs/**/*.md  │
│ • State Object  │  │ • Session-level │  │ • types/*.ts    │
│ • Turn Counter  │  │ • App-level     │  │ • schemas       │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      STORAGE LAYER                              │
│  PostgreSQL (memori schema) + File System (.claude/)            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Session Service (NEW)

**Purpose:** Capture the workbench - all events in a conversation.

**Data Model:**

```typescript
// lib/context/session.ts

interface Session {
  id: string;
  user_id: string;
  chatmode: string;           // 'service-engineer', 'architect', etc.
  workflow?: string;          // 'create-service', 'write-migration', etc.
  started_at: Date;
  ended_at?: Date;
  metadata: {
    skill?: string;           // 'backend-service-builder', 'lead-architect'
    git_branch?: string;
    workspace?: string;
  };
}

interface SessionEvent {
  id: string;
  session_id: string;
  sequence: number;           // Strict ordering
  type: 'user_message' | 'model_message' | 'tool_call' | 'tool_result' |
        'validation_gate' | 'memory_recall' | 'system_event';
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;            // Text or JSON
  parts?: {
    text?: string;
    tool_args?: Record<string, unknown>;
    tool_result?: unknown;
    file_changes?: string[];
  };
  created_at: Date;
}

interface SessionState {
  session_id: string;
  scratchpad: {
    current_task?: string;
    spec_file?: string;       // .claude/specs/*.spec.md being implemented
    files_in_progress: string[];
    validation_gates_passed: number[];
    blockers: string[];
  };
  updated_at: Date;
}
```

**Database Schema:**

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_context_session_layer.sql

CREATE SCHEMA IF NOT EXISTS context;

-- Session tracking
CREATE TABLE context.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  chatmode text NOT NULL,
  workflow text,
  skill text,
  git_branch text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Append-only event log
CREATE TABLE context.session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES context.sessions(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  type text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  parts jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, sequence)
);

-- Mutable state/scratchpad
CREATE TABLE context.session_state (
  session_id uuid PRIMARY KEY REFERENCES context.sessions(id) ON DELETE CASCADE,
  scratchpad jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_session_events_session ON context.session_events(session_id);
CREATE INDEX idx_sessions_user ON context.sessions(user_id);
CREATE INDEX idx_sessions_chatmode ON context.sessions(chatmode);
```

### 2.3 Memory Service (UPGRADE)

**Current:** Memori PostgreSQL with manual recording.

**Proposed Enhancements:**

#### 2.3.1 Memory Data Model Extension

```sql
-- Extend memori.memories table

ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS confidence numeric(3,2) DEFAULT 0.8;
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS lineage jsonb DEFAULT '[]'::jsonb;
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS use_count integer DEFAULT 0;
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Source types: 'explicit' (user said "remember"), 'implicit' (extracted),
--               'bootstrap' (seed data), 'tool_output' (from command results)

COMMENT ON COLUMN memori.memories.source_type IS 'explicit|implicit|bootstrap|tool_output';
COMMENT ON COLUMN memori.memories.confidence IS 'Belief strength 0.0-1.0, updated on corroboration/contradiction';
COMMENT ON COLUMN memori.memories.lineage IS 'Array of session_ids that contributed';
```

#### 2.3.2 Memory ETL Pipeline

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   INGESTION     │ --> │   EXTRACTION    │ --> │ CONSOLIDATION   │
│                 │     │                 │     │                 │
│ Session events  │     │ LLM extracts    │     │ UPDATE/CREATE/  │
│ from completed  │     │ candidate       │     │ DELETE based on │
│ workflow gates  │     │ memories        │     │ similarity      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                              ┌─────────────────┐
                                              │    STORAGE      │
                                              │                 │
                                              │ memori.memories │
                                              │ with provenance │
                                              └─────────────────┘
```

**Implementation:**

```python
# lib/memori/pipeline.py

class MemoryGenerationPipeline:
    """Background ETL for memory extraction and consolidation."""

    def __init__(self, db_url: str, llm_client):
        self.db = create_engine(db_url)
        self.llm = llm_client

    async def process_session_completion(self, session_id: str):
        """Triggered when session ends or validation gate passes."""
        # 1. Load new events since last processing
        events = self.load_unprocessed_events(session_id)

        # 2. Extract candidate memories via LLM
        candidates = await self.extract_memories(events)

        # 3. Consolidate with existing memories
        for candidate in candidates:
            await self.consolidate_memory(candidate)

    async def extract_memories(self, events: list[SessionEvent]) -> list[CandidateMemory]:
        """LLM-based extraction with topic schemas."""
        prompt = self._build_extraction_prompt(events)
        response = await self.llm.complete(prompt)
        return self._parse_candidates(response)

    async def consolidate_memory(self, candidate: CandidateMemory):
        """UPDATE, CREATE, or DELETE based on semantic similarity."""
        similar = self.find_similar_memories(candidate, threshold=0.85)

        if not similar:
            # CREATE new memory
            self.create_memory(candidate)
        else:
            best_match = similar[0]
            action = self.determine_action(candidate, best_match)

            if action == 'UPDATE':
                self.update_memory(best_match.id, candidate)
            elif action == 'INVALIDATE':
                self.mark_stale(best_match.id)
                self.create_memory(candidate)
```

#### 2.3.3 Memory Retrieval Strategies

##### Design Decision: PostgreSQL-Native Retrieval (No Vector DB Required)

**Rationale:** Vector databases and embeddings add semantic similarity search but are **not imperative** for PT-2's context management. The system can achieve effective retrieval using PostgreSQL-native capabilities:

| Method | Capability | Implementation |
|--------|------------|----------------|
| **Namespace filtering** | Isolate by chatmode/agent | `WHERE user_id = $namespace` |
| **Category filtering** | Narrow by type | `WHERE category = $category` |
| **Full-text search** | Linguistic matching with ranking | PostgreSQL `tsvector`/`tsquery` |
| **Metadata filtering** | Filter by tags, importance | JSONB queries |
| **Recency weighting** | Prefer recent memories | `ORDER BY created_at DESC` |
| **Composite scoring** | Combined relevance | `relevance * 0.4 + recency * 0.3 + importance * 0.3` |

**When Vector Search Would Matter (Future Enhancement):**
- Memory corpus grows > 500 entries
- Retrieval precision drops below 60%
- Users report "I know I saved this but can't find it"
- Queries don't share keywords with memory content

**Why PostgreSQL is Sufficient for PT-2:**
1. **Small memory corpus** (10-100 memories) - Full-text search with metadata is sufficient
2. **Structured domain vocabulary** - PT-2 uses consistent terminology (bounded contexts, services, patterns)
3. **Explicit memory recording** - Memories are crafted with intent, not raw transcripts
4. **Session context available** - Chatmode, workflow, and skill narrow the search space

##### Database Schema Enhancement

```sql
-- Add full-text search capability to memori.memories

-- Step 1: Add generated tsvector column for full-text search
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Step 2: Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_memories_search ON memori.memories USING GIN(search_vector);

-- Step 3: Create composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_memories_namespace_category
  ON memori.memories(user_id, category);

-- Step 4: Create index for recency queries
CREATE INDEX IF NOT EXISTS idx_memories_created_at
  ON memori.memories(created_at DESC);
```

##### Retrieval Implementation

**Core Retrieval Query (PostgreSQL-native, no embeddings):**

```sql
-- Composite scoring retrieval query

WITH scored_memories AS (
  SELECT
    id,
    content,
    category,
    metadata,
    created_at,
    -- Text relevance score (full-text match quality, 0-1 normalized)
    COALESCE(ts_rank(search_vector, plainto_tsquery('english', $query)), 0) AS text_relevance,
    -- Recency score (0-1, recent = higher, decays over 30 days)
    GREATEST(0, 1.0 - EXTRACT(EPOCH FROM (now() - created_at)) / (86400 * 30)) AS recency_score,
    -- Importance from metadata (default 0.5)
    COALESCE((metadata->>'importance')::float, 0.5) AS importance_score,
    -- Usage frequency for popularity boost
    COALESCE(use_count, 0) AS use_count
  FROM memori.memories
  WHERE
    -- Namespace filter (chatmode/agent specific)
    user_id = $namespace
    -- Category filter (optional, pass NULL to skip)
    AND ($category IS NULL OR category = $category)
    -- Full-text search (only if query provided)
    AND ($query IS NULL OR search_vector @@ plainto_tsquery('english', $query))
    -- Exclude expired memories
    AND (expires_at IS NULL OR expires_at > now())
)
SELECT
  id, content, category, metadata, created_at,
  text_relevance, recency_score, importance_score,
  -- Composite final score with configurable weights
  (text_relevance * $relevance_weight +
   recency_score * $recency_weight +
   importance_score * $importance_weight) AS final_score
FROM scored_memories
WHERE
  -- Minimum relevance threshold (only for text search)
  ($query IS NULL OR text_relevance >= $min_relevance)
ORDER BY final_score DESC
LIMIT $limit;
```

**Default Scoring Weights:**
- `relevance_weight`: 0.4 (how well query matches content)
- `recency_weight`: 0.3 (prefer recent memories)
- `importance_weight`: 0.3 (prefer high-value memories)

##### Python Implementation

```python
# lib/memori/retrieval.py

from dataclasses import dataclass
from typing import Optional
import asyncpg

@dataclass
class RetrievalConfig:
    """Configuration for memory retrieval scoring."""
    relevance_weight: float = 0.4
    recency_weight: float = 0.3
    importance_weight: float = 0.3
    min_relevance: float = 0.1
    default_limit: int = 10

class MemoryRetriever:
    """PostgreSQL-native memory retrieval without vector embeddings."""

    def __init__(self, db_pool: asyncpg.Pool, config: RetrievalConfig = None):
        self.db = db_pool
        self.config = config or RetrievalConfig()

    async def retrieve(
        self,
        namespace: str,
        query: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = None,
        min_relevance: float = None
    ) -> list[dict]:
        """
        Retrieve memories using composite scoring.

        Args:
            namespace: Agent/chatmode namespace (user_id)
            query: Natural language search query (optional)
            category: Filter by category (facts, preferences, rules, skills, context)
            limit: Maximum memories to return
            min_relevance: Minimum text relevance score (0-1)

        Returns:
            List of memories sorted by composite score
        """
        limit = limit or self.config.default_limit
        min_relevance = min_relevance or self.config.min_relevance

        result = await self.db.fetch(
            self.RETRIEVAL_QUERY,
            query,
            namespace,
            category,
            self.config.relevance_weight,
            self.config.recency_weight,
            self.config.importance_weight,
            min_relevance,
            limit
        )

        return [dict(row) for row in result]

    async def retrieve_by_tags(
        self,
        namespace: str,
        tags: list[str],
        limit: int = 10
    ) -> list[dict]:
        """Retrieve memories matching specific tags."""
        return await self.db.fetch("""
            SELECT * FROM memori.memories
            WHERE user_id = $1
              AND metadata->'tags' ?| $2
              AND (expires_at IS NULL OR expires_at > now())
            ORDER BY
              COALESCE((metadata->>'importance')::float, 0.5) DESC,
              created_at DESC
            LIMIT $3
        """, namespace, tags, limit)

    async def retrieve_recent(
        self,
        namespace: str,
        hours: int = 24,
        limit: int = 10
    ) -> list[dict]:
        """Retrieve most recent memories within time window."""
        return await self.db.fetch("""
            SELECT * FROM memori.memories
            WHERE user_id = $1
              AND created_at > now() - interval '%s hours'
              AND (expires_at IS NULL OR expires_at > now())
            ORDER BY created_at DESC
            LIMIT $2
        """, namespace, hours, limit)

    # SQL query as class constant
    RETRIEVAL_QUERY = """
        WITH scored_memories AS (
            SELECT
                id, content, category, metadata, created_at, use_count,
                COALESCE(ts_rank(search_vector, plainto_tsquery('english', $1)), 0) AS text_relevance,
                GREATEST(0, 1.0 - EXTRACT(EPOCH FROM (now() - created_at)) / 2592000) AS recency_score,
                COALESCE((metadata->>'importance')::float, 0.5) AS importance_score
            FROM memori.memories
            WHERE user_id = $2
              AND ($3 IS NULL OR category = $3)
              AND ($1 IS NULL OR search_vector @@ plainto_tsquery('english', $1))
              AND (expires_at IS NULL OR expires_at > now())
        )
        SELECT
            id, content, category, metadata, created_at,
            text_relevance, recency_score, importance_score,
            (text_relevance * $4 + recency_score * $5 + importance_score * $6) AS final_score
        FROM scored_memories
        WHERE ($1 IS NULL OR text_relevance >= $7)
        ORDER BY final_score DESC
        LIMIT $8;
    """
```

##### Proactive Retrieval (at turn start)

```python
# lib/context/builder.py

class ContextBuilder:
    """Assembles full context for each turn."""

    def __init__(self, session_service, memory_retriever: MemoryRetriever):
        self.session_service = session_service
        self.memory_retriever = memory_retriever

    async def build_context(self, turn: TurnInput) -> BuiltContext:
        # 1. Load session events (sliding window)
        history = await self.session_service.get_recent_events(
            turn.session_id,
            max_turns=20,
            max_tokens=50000
        )

        # 2. Proactive memory retrieval (PostgreSQL full-text search)
        memories = await self.memory_retriever.retrieve(
            namespace=turn.chatmode,  # or turn.user_id for user-level
            query=turn.message,
            limit=10,
            min_relevance=0.1
        )

        # 3. Also fetch high-importance memories regardless of query match
        important_memories = await self.memory_retriever.retrieve(
            namespace=turn.chatmode,
            query=None,  # No text filter
            limit=5
        )

        # 4. Deduplicate and merge
        all_memories = self._merge_memories(memories, important_memories)

        # 5. Load static context (memory files, docs)
        static_context = self.load_memory_files(turn.chatmode)

        # 6. Assemble final context
        return BuiltContext(
            system=self.build_system_prompt(turn.chatmode, static_context),
            tools=self.get_tools_for_chatmode(turn.chatmode),
            history=history,
            memories=all_memories,
            scratchpad=await self.session_service.get_state(turn.session_id)
        )

    def _merge_memories(self, *memory_lists) -> list[dict]:
        """Deduplicate memories by ID, keeping highest scored."""
        seen = {}
        for memories in memory_lists:
            for mem in memories:
                if mem['id'] not in seen or mem.get('final_score', 0) > seen[mem['id']].get('final_score', 0):
                    seen[mem['id']] = mem
        return sorted(seen.values(), key=lambda m: m.get('final_score', 0), reverse=True)
```

##### Reactive Retrieval (memory-as-tool)

```typescript
// New tool for agents to query memory on-demand

interface MemorySearchTool {
  name: 'memory_search';
  description: 'Search project memory for relevant context, decisions, or patterns using full-text search';
  parameters: {
    query: string;           // Natural language query (uses PostgreSQL full-text search)
    scope: 'user' | 'session' | 'app' | 'all';
    category?: 'facts' | 'preferences' | 'rules' | 'skills' | 'context';
    tags?: string[];         // Filter by specific tags
    limit?: number;          // Max results (default 10)
  };
}

// Usage in chatmode:
// "Before implementing, let me search memory for similar past implementations..."
// Tool call: memory_search({ query: "loyalty service ledger pattern", scope: "all" })
```

##### Future Enhancement: Vector Embeddings (Optional)

If retrieval quality degrades at scale (500+ memories, precision < 60%), add pgvector:

```sql
-- Future: Add pgvector extension for semantic similarity
-- Only implement if PostgreSQL full-text search proves insufficient

-- Step 1: Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Add embedding column (OpenAI ada-002 = 1536 dimensions)
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Step 3: Create index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_memories_embedding
  ON memori.memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Step 4: Hybrid search query (keyword filter + semantic rerank)
-- Only use if needed - adds latency and complexity
SELECT * FROM memori.memories
WHERE user_id = $namespace
  AND search_vector @@ plainto_tsquery('english', $query)
ORDER BY embedding <-> $query_embedding
LIMIT 10;
```

**Trigger for adding embeddings:**
- Memory corpus > 500 entries
- User feedback indicates missed relevant memories
- Queries frequently use different vocabulary than stored memories

### 2.4 Compaction Strategies

**Problem:** Long sessions exhaust context window.

**Solution:** Multi-strategy compaction.

```python
# lib/context/compaction.py

class SessionCompactor:
    """Manages context window through compaction strategies."""

    STRATEGIES = {
        'sliding_window': SlidingWindowStrategy,
        'token_truncation': TokenTruncationStrategy,
        'recursive_summarization': RecursiveSummarizationStrategy,
    }

    def __init__(self, session_id: str, token_budget: int = 100000):
        self.session_id = session_id
        self.token_budget = token_budget

    async def compact_if_needed(self, events: list[SessionEvent]) -> list[SessionEvent]:
        """Apply compaction if events exceed budget."""
        token_count = self.count_tokens(events)

        if token_count <= self.token_budget:
            return events

        # Strategy 1: Sliding window (keep last N turns)
        windowed = self.apply_sliding_window(events, max_turns=30)

        if self.count_tokens(windowed) <= self.token_budget:
            return windowed

        # Strategy 2: Summarize older events
        summarized = await self.summarize_older_events(windowed, keep_recent=10)

        return summarized

    async def summarize_older_events(
        self,
        events: list[SessionEvent],
        keep_recent: int
    ) -> list[SessionEvent]:
        """Replace older events with LLM-generated summary."""
        recent = events[-keep_recent:]
        older = events[:-keep_recent]

        summary = await self.llm.summarize(older)

        summary_event = SessionEvent(
            type='system_event',
            role='system',
            content=f"[Session Summary: {summary}]"
        )

        return [summary_event] + recent
```

**Compaction Triggers:**

| Trigger | Threshold | Action |
|---------|-----------|--------|
| Turn count | > 30 turns | Apply sliding window |
| Token count | > 80% budget | Apply summarization |
| Time-based | Session idle > 1hr | Generate session summary |
| Workflow gate | Validation gate passed | Create checkpoint summary |

### 2.5 Multi-Agent Session Patterns

**Current:** Each chatmode operates independently.

**Proposed:** Shared memory protocol with private session logs.

```
┌────────────────────────────────────────────────────────────────┐
│                    SHARED MEMORY LAYER                         │
│                  (memori.memories table)                       │
│   Facts, preferences, rules, patterns accessible to all        │
└────────────────────────────────────────────────────────────────┘
                               ▲
           ┌───────────────────┼───────────────────┐
           │                   │                   │
    ┌──────┴──────┐     ┌──────┴──────┐     ┌──────┴──────┐
    │  Architect  │     │  Service    │     │ Documenter  │
    │  Session    │     │  Engineer   │     │  Session    │
    │             │     │  Session    │     │             │
    │ Private Log │     │ Private Log │     │ Private Log │
    └─────────────┘     └─────────────┘     └─────────────┘
           │                   │                   │
           └───────────────────┼───────────────────┘
                               ▼
                    ┌──────────────────┐
                    │ Workflow Prompt  │
                    │ (Orchestrator)   │
                    │                  │
                    │ create-service   │
                    │ .prompt.md       │
                    └──────────────────┘
```

**Handoff Protocol:**

```typescript
// When workflow transitions between chatmodes

interface AgentHandoff {
  from_chatmode: string;
  to_chatmode: string;
  workflow: string;
  handoff_context: {
    spec_file: string;              // What to implement
    validation_gates_passed: number[];
    artifacts_created: string[];    // Files created so far
    key_decisions: string[];        // Decisions made
    blockers: string[];             // Known issues
  };
  session_summary?: string;         // Compacted summary of from_chatmode session
}

// Handoff stored in session_state, consumed by next chatmode
```

---

## Part 3: Integration with Existing System

### 3.1 Chatmode Memory Protocol Update

Update each chatmode to use the new session layer:

```markdown
## Memory Recording Protocol 🧠 (Updated)

### Session Lifecycle

The session layer automatically tracks:
- ✅ All user messages and responses
- ✅ Tool calls and results
- ✅ Validation gate outcomes
- ✅ Files created/modified

**Session initialized when:**
- Chatmode activated
- Workflow started

**Session ended when:**
- User switches chatmode
- Workflow completes
- Explicit `/end-session` command

### Memory Generation (Background)

After validation gates or session end:
1. Pipeline extracts candidate memories from session events
2. Consolidates with existing memories (UPDATE/CREATE/DELETE)
3. Updates memory file snapshots (optional)

### Manual Recording (Semantic Learnings)

Record manually ONLY for:
- Important architectural decisions with rationale
- User corrections/preferences
- Anti-pattern discoveries
- Technical debt findings
```

### 3.2 Workflow Prompt Updates

Update `.claude/workflows/create-service.prompt.md` with session/memory frontmatter:

```yaml
---
title: Create New Service (Systematic Workflow)
session:
  type: workflow
  compaction:
    strategy: recursive_summarization
    checkpoint_on: validation_gate
memory:
  generation:
    trigger: validation_gate
    extract_topics:
      - implementation_decisions
      - anti_patterns_avoided
      - test_coverage
  retrieval:
    proactive: true
    scopes: [user, app]
---
```

### 3.3 Hook Integration

Create hooks to capture session events:

```yaml
# .claude/settings.yaml (hooks section)

hooks:
  pre_tool_call:
    - type: command
      command: "python lib/context/hooks.py log_tool_call '$TOOL_NAME' '$TOOL_INPUT'"

  post_tool_call:
    - type: command
      command: "python lib/context/hooks.py log_tool_result '$TOOL_NAME' '$TOOL_OUTPUT'"

  on_message:
    - type: command
      command: "python lib/context/hooks.py log_message '$ROLE' '$CONTENT'"

  on_session_end:
    - type: command
      command: "python lib/context/hooks.py trigger_memory_generation '$SESSION_ID'"
```

### 3.4 New Slash Commands

**Session Status Command:**

```markdown
# .claude/commands/session-status.md
---
description: Show current session state and memory stats
---

Query and display:
1. Current session ID and duration
2. Event count and token usage
3. State/scratchpad contents
4. Recent memories retrieved
5. Compaction status
```

**Memory Recall Command:**

```markdown
# .claude/commands/memory-recall.md
---
description: Search memory for specific context
args:
  - name: query
    description: What to search for
    required: true
---

Execute memory search and display:
1. Top 5 matching memories
2. Source and confidence
3. Related documents
4. Last used timestamp
```

---

## Part 4: Implementation Roadmap

### Phase 1: Session Layer Foundation (Week 1)

**Deliverables:**
1. `context` schema with tables: `sessions`, `session_events`, `session_state`
2. `lib/context/session.py` - Session service implementation
3. Basic hooks to capture messages and tool calls
4. `/session-status` command

**Success Criteria:**
- Sessions tracked in PostgreSQL
- Events logged during conversations
- State scratchpad functional

### Phase 2: Memory Pipeline Upgrade (Week 2)

**Deliverables:**
1. Extended `memori.memories` schema (provenance fields)
2. `lib/memori/pipeline.py` - ETL pipeline implementation
3. Background worker for memory generation
4. Consolidation logic (similarity-based UPDATE/CREATE/DELETE)

**Success Criteria:**
- Automatic memory extraction on validation gates
- Memories have source_type, confidence, lineage
- Duplicates consolidated

### Phase 3: Retrieval Strategies (Week 2-3)

**Deliverables:**
1. `lib/context/builder.py` - Context assembly with proactive retrieval
2. `memory_search` tool for reactive retrieval
3. `/memory-recall` command
4. Relevance scoring (similarity + recency + importance)

**Success Criteria:**
- Top 10 memories auto-injected at turn start
- Agents can query memory on-demand
- Retrieval latency < 500ms

### Phase 4: Compaction Strategies (Week 3)

**Deliverables:**
1. `lib/context/compaction.py` - Compaction strategies
2. Sliding window implementation
3. Recursive summarization with LLM
4. Checkpoint summaries on validation gates

**Success Criteria:**
- Sessions stay within 100k token budget
- Older context preserved via summaries
- No information loss for critical decisions

### Phase 5: Multi-Agent Coordination (Week 4)

**Deliverables:**
1. `AgentHandoff` protocol implementation
2. Updated workflow prompts with handoff context
3. Shared memory access with per-agent private logs
4. Session transition hooks

**Success Criteria:**
- Workflow transitions preserve context
- Each chatmode maintains private session
- Shared memories accessible across agents

### Phase 6: Memory File Sync (Week 4)

**Deliverables:**
1. Background sync: `memori.memories` → `.claude/memory/*.memory.md`
2. Version control for memory files
3. Memory file validation (consistency checks)
4. Scheduled sync (hourly or on-demand)

**Success Criteria:**
- Memory files always reflect latest from DB
- Git-trackable memory snapshots
- Offline access to memories via files

---

## Part 5: Migration Strategy

### Preserve Existing Investments

| Asset | Action |
|-------|--------|
| `.github/chatmodes/*.chatmode.md` | Add session lifecycle + memory protocol sections |
| `.github/instructions/*.instructions.md` | No change (scope-based loading works) |
| `.claude/workflows/*.prompt.md` | Add session + memory YAML frontmatter |
| `.claude/skills/*.md` | Add Memori recording patterns (already have) |
| `memori` PostgreSQL schema | Extend with provenance fields |
| Memori config.yml | Add session + pipeline config |

### Data Migration

```sql
-- Migrate existing memories to have provenance

UPDATE memori.memories
SET
  source_type = 'bootstrap',
  confidence = 0.8,
  lineage = '[]'::jsonb
WHERE source_type IS NULL;
```

### Rollback Plan

All changes are additive:
- New `context` schema (can drop if needed)
- New columns in `memori.memories` (nullable, can ignore)
- New hooks (can disable in settings)
- New commands (can delete files)

---

## Part 6: Success Metrics

### Quantitative

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Context load time | 2-5 min | < 10s | Time to first agent response |
| Session continuity | 0% | 100% | Sessions resumable with context |
| Memory generation | Manual | Automatic | Pipeline triggers/day |
| Retrieval relevance | N/A | > 70% precision | User feedback on injected memories |
| Compaction efficiency | N/A | < 80% token budget | Avg tokens per session |

### Qualitative

| Aspect | Current | Target |
|--------|---------|--------|
| Session starts | "Let me review docs..." | "Continuing from checkpoint..." |
| Memory access | Read static files | Full-text search + auto-injection |
| Workflow handoffs | Lost between chatmodes | Preserved via handoff protocol |
| Long sessions | Context overflow | Graceful compaction |

---

## Part 7: Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Memory generation latency | Blocks workflow | Run pipeline async, never on hot path |
| Storage growth | Database bloat | TTL policies, confidence decay, pruning |
| Retrieval noise | Irrelevant memories injected | Tune relevance threshold, user feedback loop |
| Session state corruption | Lost work progress | Checkpoints on validation gates, WAL recovery |
| Multi-agent conflicts | Inconsistent shared state | Optimistic locking, per-agent namespaces |
| Memory poisoning | Bad memories persist | Confidence scores, source validation, manual purge |

---

## Part 8: File Structure Summary

```
.claude/
├── commands/
│   ├── session-status.md       # NEW: Session diagnostics
│   └── memory-recall.md        # NEW: On-demand memory search
├── memory/                     # EXISTING: Static memory snapshots
│   ├── project.memory.md
│   ├── anti-patterns.memory.md
│   ├── architecture-decisions.memory.md
│   ├── phase-status.memory.md
│   ├── service-catalog.memory.md
│   └── domain-glossary.memory.md
├── skills/                     # EXISTING: Updated with session protocol
│   └── ...
└── workflows/                  # EXISTING: Updated with session/memory frontmatter
    └── ...

.github/
├── chatmodes/                  # EXISTING: Updated with session lifecycle
│   └── ...
└── instructions/               # EXISTING: No changes
    └── ...

lib/
├── context/                    # NEW: Context management layer
│   ├── __init__.py
│   ├── session.py              # Session service
│   ├── builder.py              # Context assembly
│   ├── compaction.py           # Compaction strategies
│   └── hooks.py                # Hook handlers
└── memori/                     # EXISTING: Extended
    ├── client.py               # Existing client
    ├── pipeline.py             # NEW: ETL pipeline
    ├── retrieval.py            # NEW: Retrieval strategies
    └── skill_utils.py          # Existing skill context

supabase/migrations/
└── YYYYMMDDHHMMSS_context_session_layer.sql  # NEW: Session schema
```

---

## Conclusion

This proposal transforms PT-2's memory system from static file inclusion to a dynamic, session-aware context management layer. The key innovations are:

1. **Session Layer** - Every conversation becomes a traceable event log with scratchpad state
2. **Memory Pipeline** - Automatic extraction and consolidation replaces manual recording
3. **Hybrid Retrieval** - Proactive injection + reactive search for optimal context
4. **Compaction** - Long sessions stay within budget via summarization
5. **Multi-Agent Protocol** - Workflows maintain context across chatmode transitions

The architecture respects PT-2's existing investments (chatmodes, skills, workflows) while adding the sophistication needed for true cross-session continuity.

---

## Appendix A: Concept Mapping

### Whitepaper → PT-2 Implementation

| Whitepaper Concept | PT-2 Implementation |
|--------------------|---------------------|
| Session = Workbench | `context.sessions` + `context.session_events` tables |
| Memory = Filing Cabinet | `memori.memories` with provenance fields |
| Context Engineering | `ContextBuilder.build_context()` assembler |
| Per-turn hot path | Hooks + proactive retrieval + compaction |
| Background memory generation | `MemoryGenerationPipeline` ETL |
| Sliding window | `SessionCompactor.apply_sliding_window()` |
| Recursive summarization | `SessionCompactor.summarize_older_events()` |
| Memory-as-tool | `memory_search` tool (PostgreSQL full-text) + `/memory-recall` command |
| Multi-agent sessions | `AgentHandoff` protocol + shared `memori.memories` |

### Existing Assets → Enhancements

| Existing Asset | Enhancement |
|----------------|-------------|
| Chatmodes | Session lifecycle + memory protocol sections |
| Workflow prompts | Session/memory YAML frontmatter |
| Skills | Already have Memori recording (extend with pipeline) |
| Memori DB | Add provenance columns, add `context` schema |
| Memory files | Become snapshots synced from DB |

---

## Appendix B: API Reference

### Session Service API

```python
class SessionService:
    async def create_session(chatmode: str, workflow: str = None) -> Session
    async def end_session(session_id: str) -> None
    async def append_event(session_id: str, event: SessionEvent) -> None
    async def get_recent_events(session_id: str, max_turns: int) -> list[SessionEvent]
    async def get_state(session_id: str) -> SessionState
    async def update_state(session_id: str, scratchpad: dict) -> None
```

### Memory Service API

```python
class MemoryService:
    async def retrieve_memories(
        user_id: str,
        query: str,
        scopes: list[str],
        limit: int = 10,
        min_relevance: float = 0.6,
        recency_weight: float = 0.3
    ) -> list[Memory]

    async def generate_memories(session_id: str) -> list[Memory]
    async def consolidate_memory(candidate: CandidateMemory) -> Memory
    async def search_memories(query: str, filters: dict) -> list[Memory]
```

### Context Builder API

```python
class ContextBuilder:
    async def build_context(turn: TurnInput) -> BuiltContext
    async def compact_history(events: list[SessionEvent]) -> list[SessionEvent]
    def load_memory_files(chatmode: str) -> str
```

---

**Document Version**: 2.0.0
**Last Updated**: 2025-11-25
**Status**: ✅ Implemented
**Implementation Summary**:
- Phase 1-5: Complete with 41 passing unit tests
- Phase 6: Documentation and slash commands
- Total new code: ~4,300+ lines across lib/context/ and lib/memori/
- Migration: `supabase/migrations/20251125141315_context_session_layer.sql`
