---
title: Implement Context Management & Memory Evolution
description: Systematic implementation of session layer, memory pipeline, retrieval, compaction, and multi-agent coordination
chatmode_sequence:
  - architect      # Phase 1: Schema Design
  - service-engineer  # Phase 2-4: Implementation
  - service-engineer  # Phase 5: Testing
  - documenter     # Phase 6: Documentation
validation_gates: 6
estimated_time: 3-5 days (iterative phases)
version: 1.0.0
last_updated: 2025-11-25
context_files:
  - docs/context-engineering/CONTEXT_MANAGEMENT_EVOLUTION_PROPOSAL.md
  - lib/memori/README.md
  - lib/memori/client.py
  - .memori/config.yml
references:
  - docs/context-engineering/context-management-handoff.md
  - docs/agentic-workflow/agentic-workflow-strategy.md
---

# Implement Context Management & Memory Evolution Workflow

## Overview

This workflow implements the Context Management Evolution Proposal, transforming PT-2's memory system from static file inclusion to a dynamic, session-aware context management layer.

**Estimated Time**: 3-5 days (phased implementation)

**Key Deliverables**:
1. Session Layer (PostgreSQL `context` schema + Python services)
2. Memory Pipeline Upgrade (provenance fields + ETL pipeline)
3. Hybrid Retrieval (PostgreSQL full-text search + proactive injection)
4. Compaction Strategies (sliding window + summarization)
5. Multi-Agent Coordination (AgentHandoff protocol)
6. Memory File Sync (DB → `.claude/memory/*.memory.md`)

**Architecture Summary**:
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
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      STORAGE LAYER                              │
│  PostgreSQL (memori + context schemas) + File System (.claude/) │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

Before starting this workflow:

- [ ] Memori PostgreSQL schema exists (`memori` schema with `memories` table)
- [ ] `lib/memori/` directory exists with `client.py`
- [ ] Supabase local development running (`npx supabase start`)
- [ ] Python environment configured with asyncpg, asyncio dependencies
- [ ] Proposal document reviewed: `docs/context-engineering/CONTEXT_MANAGEMENT_EVOLUTION_PROPOSAL.md`

---

## Phase 1: Session Layer Foundation (Architect Mode)

**Chatmode**: `architect.chatmode.md`
**Tools**: Read, Grep, Glob, sequential-thinking
**Output**: Database migration + Session service specification

### Step 1.1: Design Session Schema

Review the proposal's session data model and design the PostgreSQL schema:

**Tables to create in `context` schema**:

1. `context.sessions` - Session tracking
   - `id` (uuid PK)
   - `user_id` (text NOT NULL) - namespace for agent/chatmode
   - `chatmode` (text NOT NULL)
   - `workflow` (text NULL)
   - `skill` (text NULL)
   - `git_branch` (text NULL)
   - `started_at` (timestamptz NOT NULL DEFAULT now())
   - `ended_at` (timestamptz NULL)
   - `metadata` (jsonb DEFAULT '{}')

2. `context.session_events` - Append-only event log
   - `id` (uuid PK)
   - `session_id` (uuid FK → sessions)
   - `sequence` (integer NOT NULL) - strict ordering
   - `type` (text NOT NULL) - 'user_message', 'model_message', 'tool_call', etc.
   - `role` (text NOT NULL) - 'user', 'assistant', 'tool', 'system'
   - `content` (text NOT NULL)
   - `parts` (jsonb NULL)
   - `created_at` (timestamptz NOT NULL DEFAULT now())
   - UNIQUE(session_id, sequence)

3. `context.session_state` - Mutable scratchpad
   - `session_id` (uuid PK FK → sessions)
   - `scratchpad` (jsonb NOT NULL DEFAULT '{}')
   - `updated_at` (timestamptz NOT NULL DEFAULT now())

### Step 1.2: Design Memory Schema Extensions

Extend `memori.memories` with provenance fields:

```sql
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS confidence numeric(3,2) DEFAULT 0.8;
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS lineage jsonb DEFAULT '[]'::jsonb;
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS use_count integer DEFAULT 0;
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Full-text search capability
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX IF NOT EXISTS idx_memories_search ON memori.memories USING GIN(search_vector);
```

### Step 1.3: Create Service Specification

Generate `.claude/specs/context-session-service.spec.md`:

```markdown
---
service_name: ContextSessionService
bounded_context: "What is the current workbench state and conversation history?"
status: proposed
created: {date}
---

# ContextSessionService Specification

## Bounded Context
Tracks all events in a conversation session and maintains a mutable scratchpad state.

## Data Ownership
### OWNS
- `context.sessions`: Full CRUD
- `context.session_events`: Append-only log
- `context.session_state`: Scratchpad management

### REFERENCES
- `memori.memories` (MemoriService): Read for context retrieval

## Interface Definition
```python
class SessionService:
    async def create_session(chatmode: str, workflow: str = None) -> Session
    async def end_session(session_id: str) -> None
    async def append_event(session_id: str, event: SessionEvent) -> None
    async def get_recent_events(session_id: str, max_turns: int) -> list[SessionEvent]
    async def get_state(session_id: str) -> SessionState
    async def update_state(session_id: str, scratchpad: dict) -> None
```

## Implementation Requirements
1. Append-only event log (no updates/deletes to events)
2. Sequence numbers must be strictly incrementing
3. Session state is mutable, events are immutable
4. Clean up expired sessions via TTL policy
```

### Step 1.4: VALIDATION GATE 1 - Schema Design Review

🛑 **STOP: Present schema design to user**

**Schema Review Format**:
```
🛑 VALIDATION GATE 1: Schema Design Review

New Schema: context
Tables:
  - context.sessions (7 columns)
  - context.session_events (8 columns)
  - context.session_state (3 columns)

Memory Extensions:
  - memori.memories + 6 columns (source_type, confidence, lineage, last_used_at, use_count, expires_at)
  - Full-text search vector + GIN index

Indexes:
  - idx_session_events_session (session lookup)
  - idx_sessions_user (user queries)
  - idx_sessions_chatmode (chatmode filtering)
  - idx_memories_search (full-text search)
  - idx_memories_namespace_category (composite filter)
  - idx_memories_created_at (recency queries)

Migration file: supabase/migrations/YYYYMMDDHHMMSS_context_session_layer.sql

Specification: .claude/specs/context-session-service.spec.md

Do you approve this schema design? (Reply "approved" to proceed)
```

**User must approve before proceeding to Phase 2.**

---

## Phase 2: Session Layer Implementation (Service Engineer Mode)

**Chatmode**: `service-engineer.chatmode.md`
**Tools**: Read, Write, Edit, MultiEdit, Bash
**Input**: Approved schema specification
**Output**: Migration + Python service implementation

### Step 2.1: Create Database Migration

Generate migration file with proper timestamp:

```bash
TIMESTAMP=$(date +"%Y%m%d%H%M%S")
touch supabase/migrations/${TIMESTAMP}_context_session_layer.sql
```

Migration content from proposal (Section 2.2):
- CREATE SCHEMA context
- CREATE TABLE context.sessions
- CREATE TABLE context.session_events
- CREATE TABLE context.session_state
- ALTER TABLE memori.memories (add provenance + full-text search)
- Indexes for performance

### Step 2.2: Apply Migration

```bash
npx supabase migration up
# OR for clean slate:
npx supabase db reset
```

Verify migration:
```bash
npx supabase db lint
```

### Step 2.3: Create Session Service

Create `lib/context/` directory structure:

```bash
mkdir -p lib/context
touch lib/context/__init__.py
touch lib/context/session.py
touch lib/context/models.py
```

Implement `lib/context/models.py`:
- `Session` dataclass
- `SessionEvent` dataclass
- `SessionState` dataclass
- Event type enums

Implement `lib/context/session.py`:
- `SessionService` class with async methods
- Connection pooling with asyncpg
- Transaction support for atomicity

**Key Implementation Patterns**:
- ✅ Async/await throughout
- ✅ Typed with dataclasses/TypedDict
- ✅ Connection pooling (asyncpg.Pool)
- ✅ Proper error handling
- ❌ NO global state
- ❌ NO synchronous blocking calls

### Step 2.4: Create Basic Hooks Integration

Update `.claude/settings.yaml` hooks section to capture events:

```yaml
hooks:
  post_tool_call:
    - type: command
      command: "python -m lib.context.hooks log_tool_call"
```

### Step 2.5: VALIDATION GATE 2 - Session Layer Implementation

🛑 **STOP: Present implementation to user**

**Implementation Review Format**:
```
🛑 VALIDATION GATE 2: Session Layer Implementation

Migration Applied:
  - supabase/migrations/YYYYMMDDHHMMSS_context_session_layer.sql
  - Schema lint: ✅ passed

Files Created:
  - lib/context/__init__.py
  - lib/context/models.py (X lines)
  - lib/context/session.py (X lines)

SessionService API:
  - create_session(chatmode, workflow) → Session
  - end_session(session_id) → None
  - append_event(session_id, event) → None
  - get_recent_events(session_id, max_turns) → list[SessionEvent]
  - get_state(session_id) → SessionState
  - update_state(session_id, scratchpad) → None

Pattern Compliance:
  - [x] Async/await ✅
  - [x] Typed with dataclasses ✅
  - [x] Connection pooling ✅
  - [x] No global state ✅
  - [x] Error handling ✅

Ready for Phase 3? (Reply "proceed" to continue)
```

**User must approve before Phase 3.**

---

## Phase 3: Memory Retrieval Implementation (Service Engineer Mode)

**Chatmode**: `service-engineer.chatmode.md`
**Tools**: Read, Write, Edit, Bash
**Output**: Retrieval service with composite scoring

### Step 3.1: Implement Memory Retriever

Create `lib/memori/retrieval.py` with:

1. `RetrievalConfig` dataclass:
   - `relevance_weight: float = 0.4`
   - `recency_weight: float = 0.3`
   - `importance_weight: float = 0.3`
   - `min_relevance: float = 0.1`
   - `default_limit: int = 10`

2. `MemoryRetriever` class:
   - `retrieve(namespace, query, category, limit, min_relevance)` - Composite scoring
   - `retrieve_by_tags(namespace, tags, limit)` - Tag-based filtering
   - `retrieve_recent(namespace, hours, limit)` - Recency-based

**Core Retrieval Query** (PostgreSQL full-text search):
```sql
WITH scored_memories AS (
  SELECT
    id, content, category, metadata, created_at, use_count,
    COALESCE(ts_rank(search_vector, plainto_tsquery('english', $query)), 0) AS text_relevance,
    GREATEST(0, 1.0 - EXTRACT(EPOCH FROM (now() - created_at)) / 2592000) AS recency_score,
    COALESCE((metadata->>'importance')::float, 0.5) AS importance_score
  FROM memori.memories
  WHERE user_id = $namespace
    AND ($category IS NULL OR category = $category)
    AND ($query IS NULL OR search_vector @@ plainto_tsquery('english', $query))
    AND (expires_at IS NULL OR expires_at > now())
)
SELECT
  id, content, category, metadata, created_at,
  text_relevance, recency_score, importance_score,
  (text_relevance * $relevance_weight + recency_score * $recency_weight + importance_score * $importance_weight) AS final_score
FROM scored_memories
WHERE ($query IS NULL OR text_relevance >= $min_relevance)
ORDER BY final_score DESC
LIMIT $limit;
```

### Step 3.2: Implement Context Builder

Create `lib/context/builder.py` with:

1. `ContextBuilder` class:
   - `build_context(turn: TurnInput) -> BuiltContext`
   - Loads session events (sliding window)
   - Proactive memory retrieval
   - Fetches high-importance memories
   - Merges and deduplicates

2. `TurnInput` dataclass:
   - `session_id: str`
   - `message: str`
   - `chatmode: str`
   - `user_id: str`

3. `BuiltContext` dataclass:
   - `system: str`
   - `tools: list`
   - `history: list[SessionEvent]`
   - `memories: list[dict]`
   - `scratchpad: dict`

### Step 3.3: Create Memory Search Tool Definition

Create tool interface for reactive retrieval:

```python
# lib/context/tools.py

MEMORY_SEARCH_TOOL = {
    "name": "memory_search",
    "description": "Search project memory for relevant context using full-text search",
    "parameters": {
        "query": {"type": "string", "required": True},
        "scope": {"type": "string", "enum": ["user", "session", "app", "all"]},
        "category": {"type": "string", "enum": ["facts", "preferences", "rules", "skills", "context"]},
        "tags": {"type": "array", "items": {"type": "string"}},
        "limit": {"type": "integer", "default": 10}
    }
}
```

### Step 3.4: VALIDATION GATE 3 - Retrieval Implementation

🛑 **STOP: Present retrieval implementation**

**Retrieval Review Format**:
```
🛑 VALIDATION GATE 3: Memory Retrieval Implementation

Files Created:
  - lib/memori/retrieval.py (X lines)
  - lib/context/builder.py (X lines)
  - lib/context/tools.py (X lines)

MemoryRetriever API:
  - retrieve(namespace, query, category, limit, min_relevance)
  - retrieve_by_tags(namespace, tags, limit)
  - retrieve_recent(namespace, hours, limit)

Scoring Weights:
  - Text relevance: 40%
  - Recency: 30%
  - Importance: 30%

ContextBuilder:
  - [x] Proactive retrieval at turn start ✅
  - [x] High-importance memory injection ✅
  - [x] Deduplication ✅
  - [x] Session event sliding window ✅

Full-text Search:
  - [x] PostgreSQL tsvector/tsquery ✅
  - [x] GIN index for performance ✅
  - [x] Composite scoring ✅

Ready for Phase 4? (Reply "proceed" to continue)
```

**User must approve before Phase 4.**

---

## Phase 4: Compaction & Pipeline (Service Engineer Mode)

**Chatmode**: `service-engineer.chatmode.md`
**Tools**: Read, Write, Edit, Bash
**Output**: Compaction strategies + Memory ETL pipeline

### Step 4.1: Implement Compaction Strategies

Create `lib/context/compaction.py` with:

1. `SessionCompactor` class:
   - `compact_if_needed(events, token_budget) -> list[SessionEvent]`
   - `apply_sliding_window(events, max_turns) -> list[SessionEvent]`
   - `summarize_older_events(events, keep_recent) -> list[SessionEvent]`
   - `count_tokens(events) -> int`

2. Strategy pattern:
   - `SlidingWindowStrategy` - Keep last N turns
   - `TokenTruncationStrategy` - Trim to token budget
   - `RecursiveSummarizationStrategy` - LLM-generated summary

**Compaction Triggers**:
| Trigger | Threshold | Action |
|---------|-----------|--------|
| Turn count | > 30 turns | Apply sliding window |
| Token count | > 80% budget | Apply summarization |
| Time-based | Session idle > 1hr | Generate session summary |
| Workflow gate | Validation gate passed | Create checkpoint summary |

### Step 4.2: Implement Memory ETL Pipeline

Create `lib/memori/pipeline.py` with:

1. `MemoryGenerationPipeline` class:
   - `process_session_completion(session_id)` - Main entry point
   - `load_unprocessed_events(session_id)` - Get new events
   - `extract_memories(events)` - LLM-based extraction
   - `consolidate_memory(candidate)` - UPDATE/CREATE/DELETE logic
   - `find_similar_memories(candidate, threshold)` - Full-text similarity

2. `CandidateMemory` dataclass:
   - `content: str`
   - `category: str`
   - `source_type: str`
   - `confidence: float`
   - `lineage: list[str]`
   - `metadata: dict`

**Consolidation Logic**:
- No similar memories → CREATE new
- Similar match found → Determine UPDATE vs INVALIDATE
- Confidence scores adjust on corroboration/contradiction

### Step 4.3: Create Pipeline Trigger Hooks

Update session hooks to trigger pipeline:

```python
# lib/context/hooks.py

async def on_session_end(session_id: str):
    """Trigger memory generation when session ends."""
    pipeline = MemoryGenerationPipeline(db_url, llm_client)
    await pipeline.process_session_completion(session_id)

async def on_validation_gate_passed(session_id: str, gate_number: int):
    """Trigger memory extraction at workflow checkpoints."""
    pipeline = MemoryGenerationPipeline(db_url, llm_client)
    await pipeline.process_session_completion(session_id)
```

### Step 4.4: VALIDATION GATE 4 - Compaction & Pipeline

🛑 **STOP: Present compaction and pipeline implementation**

**Review Format**:
```
🛑 VALIDATION GATE 4: Compaction & Pipeline Implementation

Files Created:
  - lib/context/compaction.py (X lines)
  - lib/memori/pipeline.py (X lines)
  - lib/context/hooks.py (updated)

Compaction Strategies:
  - [x] Sliding window (max_turns=30) ✅
  - [x] Token truncation (budget=100k) ✅
  - [x] Recursive summarization ✅
  - [x] Checkpoint summaries on gates ✅

Memory Pipeline:
  - [x] Session event ingestion ✅
  - [x] LLM-based extraction ✅
  - [x] Similarity-based consolidation ✅
  - [x] Provenance tracking ✅

Trigger Integration:
  - [x] on_session_end hook ✅
  - [x] on_validation_gate hook ✅

Ready for Phase 5? (Reply "proceed" to continue)
```

**User must approve before Phase 5.**

---

## Phase 5: Testing & Multi-Agent Coordination (Service Engineer Mode)

**Chatmode**: `service-engineer.chatmode.md`
**Tools**: Read, Write, Edit, Bash
**Output**: Tests + AgentHandoff protocol

### Step 5.1: Create Test Suite

```bash
mkdir -p __tests__/lib/context
mkdir -p __tests__/lib/memori

touch __tests__/lib/context/session.test.py
touch __tests__/lib/context/builder.test.py
touch __tests__/lib/context/compaction.test.py
touch __tests__/lib/memori/retrieval.test.py
touch __tests__/lib/memori/pipeline.test.py
```

**Test Categories**:

1. **Session Tests** (session.test.py):
   - [ ] Create session with valid chatmode
   - [ ] Append events with incrementing sequence
   - [ ] Get recent events with sliding window
   - [ ] Update scratchpad state
   - [ ] End session lifecycle

2. **Retrieval Tests** (retrieval.test.py):
   - [ ] Full-text search returns relevant memories
   - [ ] Composite scoring orders correctly
   - [ ] Tag filtering works
   - [ ] Recency scoring decays appropriately
   - [ ] Empty queries return high-importance memories

3. **Compaction Tests** (compaction.test.py):
   - [ ] Sliding window keeps last N turns
   - [ ] Token budget respected
   - [ ] Summarization preserves key information

4. **Pipeline Tests** (pipeline.test.py):
   - [ ] Extract candidate memories from events
   - [ ] Consolidate creates new memory
   - [ ] Consolidate updates existing memory
   - [ ] Confidence adjusts on corroboration

### Step 5.2: Implement AgentHandoff Protocol

Create `lib/context/handoff.py`:

```python
@dataclass
class AgentHandoff:
    from_chatmode: str
    to_chatmode: str
    workflow: str
    handoff_context: HandoffContext
    session_summary: str | None = None

@dataclass
class HandoffContext:
    spec_file: str
    validation_gates_passed: list[int]
    artifacts_created: list[str]
    key_decisions: list[str]
    blockers: list[str]
```

**Handoff Flow**:
1. Source chatmode creates HandoffContext
2. Session summary generated via compaction
3. Handoff stored in session_state
4. Target chatmode consumes handoff on activation

### Step 5.3: Run Tests

```bash
pytest __tests__/lib/context/ -v
pytest __tests__/lib/memori/ -v
```

**Target Coverage**: ≥80% for all modules

### Step 5.4: VALIDATION GATE 5 - Testing & Coordination

🛑 **STOP: Present test results and coordination implementation**

**Review Format**:
```
🛑 VALIDATION GATE 5: Testing & Multi-Agent Coordination

Test Execution:
  Suites: X passed, X total
  Tests:  X passed, X total
  Coverage: XX%

Test Categories:
  - [x] Session service (X/X tests)
  - [x] Memory retrieval (X/X tests)
  - [x] Compaction strategies (X/X tests)
  - [x] Pipeline ETL (X/X tests)
  - [x] AgentHandoff protocol (X/X tests)

AgentHandoff Protocol:
  - [x] HandoffContext dataclass ✅
  - [x] Session summary generation ✅
  - [x] Handoff storage in session_state ✅
  - [x] Target chatmode consumption ✅

All tests passing? (Reply "finalize" to continue)
```

**User must approve before Phase 6.**

---

## Phase 6: Documentation & Slash Commands (Documenter Mode)

**Chatmode**: `documenter.chatmode.md`
**Tools**: Read, Write, Edit
**Output**: Updated memory files, slash commands, documentation

### Step 6.1: Create Slash Commands

**Session Status Command** (`.claude/commands/session-status.md`):
```markdown
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

**Memory Recall Command** (`.claude/commands/memory-recall.md`):
```markdown
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

### Step 6.2: Update Chatmode Memory Protocols

Update each chatmode in `.github/chatmodes/*.chatmode.md` with:

```markdown
## Memory Recording Protocol (Session-Aware)

### Automatic Tracking
The session layer automatically tracks:
- All user messages and responses
- Tool calls and results
- Validation gate outcomes
- Files created/modified

### Manual Recording (Semantic Learnings Only)
Record manually ONLY for:
- Important architectural decisions with rationale
- User corrections/preferences
- Anti-pattern discoveries
- Technical debt findings
```

### Step 6.3: Update Memory Files

Add to `.claude/memory/architecture-decisions.memory.md`:

```markdown
## Context Management Architecture (2025-11-25)

### Session Layer
- PostgreSQL `context` schema with 3 tables
- Append-only event log + mutable scratchpad
- Hook integration for automatic capture

### Memory Retrieval
- PostgreSQL full-text search (no vector DB)
- Composite scoring: relevance (40%) + recency (30%) + importance (30%)
- Proactive injection at turn start

### Compaction
- Sliding window (30 turns)
- Token budget (100k)
- Recursive summarization at checkpoints

### Multi-Agent
- AgentHandoff protocol for workflow transitions
- Per-agent private logs + shared memory
```

### Step 6.4: VALIDATION GATE 6 - Documentation Review

🛑 **STOP: Present documentation updates**

**Review Format**:
```
🛑 VALIDATION GATE 6: Documentation Review

Slash Commands Created:
  - .claude/commands/session-status.md ✅
  - .claude/commands/memory-recall.md ✅

Chatmode Updates:
  - architect.chatmode.md (Memory Protocol)
  - service-engineer.chatmode.md (Memory Protocol)
  - documenter.chatmode.md (Memory Protocol)
  - reviewer.chatmode.md (Memory Protocol)

Memory Files Updated:
  - architecture-decisions.memory.md ✅
  - phase-status.memory.md ✅

All documentation complete? (Reply "complete" to finalize)
```

**User must approve to complete workflow.**

---

## Final Checklist

Before marking Context Management implementation complete:

**Schema & Migrations**:
- [ ] `context` schema created with 3 tables
- [ ] `memori.memories` extended with provenance fields
- [ ] Full-text search index created
- [ ] Migration applied successfully
- [ ] Schema lint passes

**Implementation**:
- [ ] `lib/context/` directory created with all modules
- [ ] `lib/memori/retrieval.py` implemented
- [ ] `lib/memori/pipeline.py` implemented
- [ ] All services use async/await
- [ ] No global state
- [ ] Type safety throughout

**Testing**:
- [ ] Test coverage ≥80%
- [ ] All tests passing
- [ ] Integration tests with local Supabase

**Documentation**:
- [ ] Slash commands created
- [ ] Chatmode memory protocols updated
- [ ] Memory files updated
- [ ] Proposal document marked "Implemented"

**Integration**:
- [ ] Hooks configured in settings.yaml
- [ ] AgentHandoff protocol working
- [ ] Compaction triggers active

---

## Success Metrics

**Quantitative**:
| Metric | Target | Measurement |
|--------|--------|-------------|
| Context load time | < 10s | Time to first agent response |
| Session continuity | 100% | Sessions resumable with context |
| Retrieval precision | > 70% | User feedback on injected memories |
| Token efficiency | < 80% budget | Avg tokens per session |

**Qualitative**:
- Session starts: "Continuing from checkpoint..." (not "Let me review docs...")
- Memory access: Full-text search + auto-injection (not static file reads)
- Workflow handoffs: Preserved via handoff protocol (not lost between chatmodes)

---

## Troubleshooting

### Migration Fails
**Symptoms**: Schema creation errors, constraint violations
**Actions**:
1. Check existing `memori` schema exists
2. Verify no conflicting column names
3. Run `npx supabase db reset` for clean slate

### Retrieval Returns No Results
**Symptoms**: Empty memory search results
**Actions**:
1. Verify `search_vector` column populated
2. Check namespace (user_id) matches
3. Lower `min_relevance` threshold
4. Verify memories exist in DB

### Compaction Too Aggressive
**Symptoms**: Important context lost
**Actions**:
1. Increase `max_turns` parameter
2. Adjust summarization to preserve key decisions
3. Add checkpoint summaries at validation gates

### Pipeline Not Triggering
**Symptoms**: Memories not auto-generated
**Actions**:
1. Check hook configuration in settings.yaml
2. Verify Python environment accessible
3. Check pipeline logs for errors

---

## Anti-Patterns (DO NOT)

- ❌ **Synchronous blocking calls**: Always use async/await
- ❌ **Global state**: No module-level mutable state
- ❌ **Raw SQL strings**: Use parameterized queries
- ❌ **Skip validation gates**: Each gate prevents downstream issues
- ❌ **Vector DB premature optimization**: Start with PostgreSQL full-text search
- ❌ **Manual memory recording**: Let pipeline extract automatically
- ❌ **Large token budgets**: Compaction exists for a reason

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-25 | Initial workflow creation |

---

**Workflow Status**: Ready for Implementation
**Last Updated**: 2025-11-25
**References**: `docs/context-engineering/CONTEXT_MANAGEMENT_EVOLUTION_PROPOSAL.md`
