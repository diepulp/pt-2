# Context Management Hooks Integration

**Date**: 2025-11-25
**Status**: Complete
**Related**: `docs/context-engineering/CONTEXT_MANAGEMENT_EVOLUTION_PROPOSAL.md`

---

## Overview

This document records the integration of the Context Management Layer hooks with Claude Code's hook system. The new hooks work alongside the existing Memori SDK hooks (Layer 3) to provide session tracking and event logging (Layer 2).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HOOK EXECUTION FLOW                             │
└─────────────────────────────────────────────────────────────────────────┘

User Prompt Submitted
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  UserPromptSubmit Hooks (in order)                                      │
│  ├── memori-init-session.sh    → Layer 3: Memori SDK session           │
│  ├── context-init-session.sh   → Layer 2: Context session (NEW)        │
│  └── lint-prompt.sh            → Prompt validation                      │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
Tool Execution (Write/Edit/Bash)
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PostToolUse Hooks (in order)                                           │
│  ├── memori-record-work.sh     → Layer 3: Entity extraction            │
│  ├── context-log-tool.sh       → Layer 2: Event logging (NEW)          │
│  └── format-and-test.sh        → Code formatting                        │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
Manual Triggers (via slash commands)
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  /end-session                  → context-end-session.sh                 │
│  /validation-gate <n>          → context-validation-gate.sh             │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Memory Pipeline (Automatic on session end / validation gate)           │
│  ├── Extract candidate memories from session events                     │
│  ├── Consolidate with existing memories (CREATE/UPDATE/SKIP)           │
│  └── Store to memori.memories with provenance                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Hook Scripts Created

### 1. context-init-session.sh

**Location**: `.claude/hooks/context-init-session.sh`
**Trigger**: UserPromptSubmit
**Purpose**: Initialize session tracking in PostgreSQL

**Behavior**:
- Checks if session already active (within 4 hours)
- Maps chatmode to user_id namespace
- Creates session in `context.sessions` table
- Saves session ID to `~/.claude/context_session_state.json`

**Chatmode → User ID Mapping**:
```bash
architect       → pt2_architect
service-engineer → service_engineer
documenter      → pt2_documenter
backend-dev     → pt2_backend
frontend-dev    → pt2_frontend
reviewer        → pt2_reviewer
*               → pt2_agent
```

### 2. context-log-tool.sh

**Location**: `.claude/hooks/context-log-tool.sh`
**Trigger**: PostToolUse (write|edit|bash)
**Purpose**: Log tool calls to session event log

**Behavior**:
- Skips read-only tools (Read, Glob, Grep, LS, WebSearch, WebFetch)
- Logs tool name to `context.session_events`
- Runs asynchronously (non-blocking)

### 3. context-end-session.sh

**Location**: `.claude/hooks/context-end-session.sh`
**Trigger**: Manual (`/end-session` command)
**Purpose**: End session and trigger memory pipeline

**Behavior**:
- Marks session as ended in database
- Triggers `MemoryGenerationPipeline`
- Cleans up session state file

### 4. context-validation-gate.sh

**Location**: `.claude/hooks/context-validation-gate.sh`
**Trigger**: Manual (`/validation-gate <n> [desc]`)
**Purpose**: Log validation gate and create checkpoint

**Behavior**:
- Records validation gate event
- Updates scratchpad with `validation_gates_passed`
- Triggers memory extraction checkpoint

---

## Settings Configuration

**File**: `.claude/settings.local.json`

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": ".*",
        "hooks": [
          { "command": "memori-init-session.sh" },
          { "command": "context-init-session.sh" },
          { "command": "lint-prompt.sh" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "write|edit|bash",
        "hooks": [
          { "command": "memori-record-work.sh" },
          { "command": "context-log-tool.sh" },
          { "command": "format-and-test.sh" }
        ]
      }
    ]
  }
}
```

---

## Slash Commands

### /end-session

**File**: `.claude/commands/end-session.md`
**Usage**: `/end-session`

Ends the current context session and triggers memory extraction.

### /validation-gate

**File**: `.claude/commands/validation-gate.md`
**Usage**: `/validation-gate <gate_number> [description]`

Logs a validation gate passage and creates a memory checkpoint.

---

## Database Tables

### context.sessions
```sql
CREATE TABLE context.sessions (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  chatmode text NOT NULL,
  workflow text,
  skill text,
  git_branch text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  metadata jsonb DEFAULT '{}'
);
```

### context.session_events
```sql
CREATE TABLE context.session_events (
  id uuid PRIMARY KEY,
  session_id uuid REFERENCES context.sessions(id),
  sequence integer NOT NULL,
  type text NOT NULL,  -- 'user_message', 'model_message', 'tool_call', 'validation_gate'
  role text NOT NULL,  -- 'user', 'assistant', 'tool', 'system'
  content text NOT NULL,
  parts jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, sequence)
);
```

### context.session_state
```sql
CREATE TABLE context.session_state (
  session_id uuid PRIMARY KEY REFERENCES context.sessions(id),
  scratchpad jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

---

## Dependencies

**Python packages** (in `.venv`):
- `asyncpg>=0.29.0` - Async PostgreSQL driver
- `loguru>=0.7.2` - Logging

**Environment variables**:
- `CLAUDE_PROJECT_DIR` - Project root directory
- `CLAUDE_CHATMODE` - Current chatmode (optional)
- `CLAUDE_WORKFLOW` - Current workflow (optional)
- `MEMORI_DATABASE_URL` - Database URL (default: local Supabase)

---

## Testing Verification

**Date**: 2025-11-25

```
Session start:   ✅ d087f845-1747-493a-aee0-1715ef998a84 created
Validation gate: ✅ Gate 1 logged, checkpoint triggered
Session end:     ✅ Session ended, pipeline ran
Database:        ✅ Session stored in context.sessions
```

---

## Integration with Existing Hooks

The new context hooks **complement** (not replace) the existing Memori SDK hooks:

| Layer | Hooks | Purpose |
|-------|-------|---------|
| Layer 2 (Context Mgmt) | `context-*.sh` | Session tracking, event logging, compaction |
| Layer 3 (Memori SDK) | `memori-*.sh` | Entity extraction, semantic search, preferences |

Both layers write to PostgreSQL but use different schemas:
- Context Layer → `context.*` tables
- Memori Layer → `memori.*` tables

---

## Troubleshooting

### UserPromptSubmit hooks failing
**Issue**: Hooks must consume stdin (event payload) to avoid blocking subsequent hooks.

**Fix** (2025-11-25): All context hooks now consume stdin at the start:
```bash
# Consume stdin (Claude Code passes event payload via stdin)
cat > /dev/null 2>&1 || true
```

### Session not initializing
1. Check `~/.claude/context_session_state.json` exists
2. Verify asyncpg installed: `.venv/bin/pip3 show asyncpg`
3. Check database connection: `npx supabase status`

### Tool calls not logging
1. Verify hook is in `settings.local.json`
2. Check session file exists
3. Review log: `.memori/session.log`

### Memory pipeline not triggering
1. Ensure session has events
2. Check `lib/memori/pipeline.py` imports
3. Review pipeline logs in session.log

---

## References

- Proposal: `docs/context-engineering/CONTEXT_MANAGEMENT_EVOLUTION_PROPOSAL.md`
- Implementation: `lib/context/hooks.py`
- Session Handoff: `docs/context-engineering/SESSION_HANDOFF_20251125_V2.md`
- Agentic Workflow: `docs/agentic-workflow/PROJECT-INITIATION-STRATEGY.md`

---

**Last Updated**: 2025-11-25
**Author**: Context Management Implementation Workflow
