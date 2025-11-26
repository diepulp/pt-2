---
service_name: ContextSessionService
bounded_context: "What is the current workbench state and conversation history?"
status: proposed
created: 2025-11-25
version: 1.0.0
references:
  - docs/context-engineering/CONTEXT_MANAGEMENT_EVOLUTION_PROPOSAL.md
  - .claude/workflows/implement-context-management.prompt.md
---

# ContextSessionService Specification

## Bounded Context

Tracks all events in a conversation session and maintains a mutable scratchpad state. Provides the foundation for context continuity across turns and multi-agent coordination.

## Data Ownership

### OWNS (Full CRUD)

| Table | Description |
|-------|-------------|
| `context.sessions` | Session lifecycle tracking |
| `context.session_events` | Append-only conversation event log |
| `context.session_state` | Mutable scratchpad/working memory |

### REFERENCES (Read-Only)

| Table | Owner | Usage |
|-------|-------|-------|
| `memori.memories` | MemoriService | Read for context retrieval |

## Schema Design

### Table: context.sessions

Tracks conversation sessions per chatmode/workflow.

```sql
CREATE TABLE context.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,           -- namespace (e.g., 'pt2_architect')
  chatmode text NOT NULL,          -- 'architect', 'service-engineer', etc.
  workflow text,                   -- 'create-service', 'write-migration', etc.
  skill text,                      -- 'backend-service-builder', etc.
  git_branch text,                 -- current working branch
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,            -- set when session closes
  metadata jsonb DEFAULT '{}'::jsonb
);
```

### Table: context.session_events

Append-only event log for session history. Events are immutable once created.

```sql
CREATE TABLE context.session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES context.sessions(id) ON DELETE CASCADE,
  sequence integer NOT NULL,       -- strict ordering within session
  type text NOT NULL,              -- event type enum
  role text NOT NULL,              -- 'user', 'assistant', 'tool', 'system'
  content text NOT NULL,           -- message text or JSON
  parts jsonb,                     -- structured data
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, sequence)
);
```

**Event Types:**
- `user_message` - User input
- `model_message` - Assistant response
- `tool_call` - Tool invocation
- `tool_result` - Tool output
- `validation_gate` - Workflow checkpoint
- `memory_recall` - Memory retrieval event
- `system_event` - System notifications

### Table: context.session_state

Mutable scratchpad for working memory during session.

```sql
CREATE TABLE context.session_state (
  session_id uuid PRIMARY KEY REFERENCES context.sessions(id) ON DELETE CASCADE,
  scratchpad jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Scratchpad Structure:**
```typescript
interface Scratchpad {
  current_task?: string;
  spec_file?: string;              // path to spec being implemented
  files_in_progress: string[];     // active files
  validation_gates_passed: number[];
  blockers: string[];
  handoff_context?: {              // for multi-agent transitions
    from_chatmode: string;
    artifacts_created: string[];
    key_decisions: string[];
  };
}
```

## Interface Definition

```python
from dataclasses import dataclass
from typing import Optional
from datetime import datetime
import asyncpg

@dataclass
class Session:
    id: str
    user_id: str
    chatmode: str
    workflow: Optional[str]
    skill: Optional[str]
    git_branch: Optional[str]
    started_at: datetime
    ended_at: Optional[datetime]
    metadata: dict

@dataclass
class SessionEvent:
    id: str
    session_id: str
    sequence: int
    type: str  # 'user_message', 'model_message', 'tool_call', etc.
    role: str  # 'user', 'assistant', 'tool', 'system'
    content: str
    parts: Optional[dict]
    created_at: datetime

@dataclass
class SessionState:
    session_id: str
    scratchpad: dict
    updated_at: datetime

class SessionService:
    """Manages conversation sessions and event logging."""

    def __init__(self, db_pool: asyncpg.Pool):
        self.db = db_pool

    async def create_session(
        self,
        chatmode: str,
        user_id: str,
        workflow: Optional[str] = None,
        skill: Optional[str] = None,
        git_branch: Optional[str] = None
    ) -> Session:
        """Create a new session and initialize state."""
        ...

    async def end_session(self, session_id: str) -> None:
        """Mark session as ended."""
        ...

    async def append_event(
        self,
        session_id: str,
        event_type: str,
        role: str,
        content: str,
        parts: Optional[dict] = None
    ) -> SessionEvent:
        """Append an event to the session log. Auto-increments sequence."""
        ...

    async def get_recent_events(
        self,
        session_id: str,
        max_turns: int = 30,
        max_tokens: Optional[int] = None
    ) -> list[SessionEvent]:
        """Get recent events with sliding window."""
        ...

    async def get_state(self, session_id: str) -> SessionState:
        """Get current session state/scratchpad."""
        ...

    async def update_state(
        self,
        session_id: str,
        scratchpad: dict
    ) -> SessionState:
        """Update session scratchpad (merge semantics)."""
        ...

    async def get_active_session(
        self,
        chatmode: str,
        user_id: str
    ) -> Optional[Session]:
        """Find active (non-ended) session for chatmode."""
        ...
```

## Implementation Requirements

### Invariants

1. **Append-only events**: No updates or deletes to `session_events`
2. **Strict sequencing**: Sequence numbers must be strictly incrementing per session
3. **State mutability**: Only `session_state.scratchpad` is mutable; events are immutable
4. **Cascade cleanup**: Ending a session does not delete events (for historical analysis)

### Performance Requirements

| Operation | Target Latency |
|-----------|---------------|
| create_session | < 50ms |
| append_event | < 20ms |
| get_recent_events (30 turns) | < 100ms |
| get_state | < 20ms |
| update_state | < 30ms |

### Async Pattern

All methods must be async using `asyncpg` connection pool:

```python
# Connection pool initialization
pool = await asyncpg.create_pool(
    dsn="postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    min_size=2,
    max_size=10
)

# Service instantiation
session_service = SessionService(pool)
```

### Error Handling

- `SessionNotFoundError` - Session ID does not exist
- `SessionEndedError` - Cannot append to ended session
- `SequenceConflictError` - Concurrent sequence number conflict (retry)

## Memory Schema Extensions

Extend `memori.memories` with provenance fields:

```sql
-- Source classification
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS source_type text;
COMMENT ON COLUMN memori.memories.source_type IS 'explicit|implicit|bootstrap|tool_output';

-- Belief strength (0.00 - 1.00)
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS confidence numeric(3,2) DEFAULT 0.80;
COMMENT ON COLUMN memori.memories.confidence IS 'Belief strength, updated on corroboration/contradiction';

-- Provenance tracking
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS lineage jsonb DEFAULT '[]'::jsonb;
COMMENT ON COLUMN memori.memories.lineage IS 'Array of session_ids that contributed';

-- Usage tracking
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS use_count integer DEFAULT 0;

-- TTL support
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS expires_at timestamptz;
```

**Note**: Full-text search already exists via `content_tsv` column with GIN index.

## Indexes

```sql
-- Session queries
CREATE INDEX idx_sessions_user ON context.sessions(user_id);
CREATE INDEX idx_sessions_chatmode ON context.sessions(chatmode);
CREATE INDEX idx_sessions_started_at ON context.sessions(started_at DESC);
CREATE INDEX idx_sessions_active ON context.sessions(chatmode, user_id)
  WHERE ended_at IS NULL;

-- Event queries
CREATE INDEX idx_session_events_session ON context.session_events(session_id);
CREATE INDEX idx_session_events_type ON context.session_events(type);
CREATE INDEX idx_session_events_created_at ON context.session_events(created_at DESC);

-- Memory composite query
CREATE INDEX idx_memories_namespace_category
  ON memori.memories(user_id, category);
```

## Migration Strategy

1. Create `context` schema and tables (additive, no risk)
2. Add provenance columns to `memori.memories` (nullable, backward compatible)
3. Backfill existing memories with `source_type = 'bootstrap'`
4. No existing data modification or deletion

## Testing Requirements

| Test Category | Coverage Target |
|--------------|-----------------|
| Session lifecycle | 100% |
| Event append/retrieve | 100% |
| State management | 100% |
| Concurrent access | 80% |
| Error handling | 90% |

---

**Status**: Proposed (Pending Schema Approval)
**Next Step**: VALIDATION GATE 1 - Schema Design Review
