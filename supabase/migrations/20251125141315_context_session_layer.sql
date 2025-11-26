-- Context Management & Memory Evolution - Session Layer
-- Migration: 20251125141315_context_session_layer.sql
-- Reference: docs/context-engineering/CONTEXT_MANAGEMENT_EVOLUTION_PROPOSAL.md
-- Spec: .claude/specs/context-session-service.spec.md

-- ============================================================================
-- PART 1: Create context schema for session management
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS context;

-- ----------------------------------------------------------------------------
-- Table: context.sessions
-- Purpose: Track conversation sessions per chatmode/workflow
-- ----------------------------------------------------------------------------

CREATE TABLE context.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,                              -- namespace (e.g., 'pt2_architect')
  chatmode text NOT NULL,                             -- 'architect', 'service-engineer', etc.
  workflow text,                                      -- 'create-service', 'write-migration', etc.
  skill text,                                         -- 'backend-service-builder', etc.
  git_branch text,                                    -- current working branch
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,                               -- set when session closes
  metadata jsonb DEFAULT '{}'::jsonb
);

COMMENT ON TABLE context.sessions IS 'Tracks conversation sessions per chatmode/workflow';
COMMENT ON COLUMN context.sessions.user_id IS 'Namespace for agent/chatmode (e.g., pt2_architect, service_engineer)';
COMMENT ON COLUMN context.sessions.chatmode IS 'Active chatmode: architect, service-engineer, documenter, etc.';
COMMENT ON COLUMN context.sessions.workflow IS 'Active workflow prompt if any';
COMMENT ON COLUMN context.sessions.skill IS 'Active skill if any';
COMMENT ON COLUMN context.sessions.ended_at IS 'NULL while session is active, set when closed';

-- ----------------------------------------------------------------------------
-- Table: context.session_events
-- Purpose: Append-only event log for session history
-- Invariant: Events are immutable once created
-- ----------------------------------------------------------------------------

CREATE TABLE context.session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES context.sessions(id) ON DELETE CASCADE,
  sequence integer NOT NULL,                          -- strict ordering within session
  type text NOT NULL,                                 -- event type
  role text NOT NULL,                                 -- 'user', 'assistant', 'tool', 'system'
  content text NOT NULL,                              -- message text or JSON
  parts jsonb,                                        -- structured data (tool_args, tool_result, etc.)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, sequence)
);

COMMENT ON TABLE context.session_events IS 'Append-only event log for session history';
COMMENT ON COLUMN context.session_events.sequence IS 'Strictly incrementing sequence number within session';
COMMENT ON COLUMN context.session_events.type IS 'Event type: user_message, model_message, tool_call, tool_result, validation_gate, memory_recall, system_event';
COMMENT ON COLUMN context.session_events.role IS 'Message role: user, assistant, tool, system';
COMMENT ON COLUMN context.session_events.parts IS 'Structured data: tool_args, tool_result, file_changes, etc.';

-- ----------------------------------------------------------------------------
-- Table: context.session_state
-- Purpose: Mutable scratchpad for working memory during session
-- ----------------------------------------------------------------------------

CREATE TABLE context.session_state (
  session_id uuid PRIMARY KEY REFERENCES context.sessions(id) ON DELETE CASCADE,
  scratchpad jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE context.session_state IS 'Mutable scratchpad for working memory during session';
COMMENT ON COLUMN context.session_state.scratchpad IS 'JSON: current_task, spec_file, files_in_progress, validation_gates_passed, blockers, handoff_context';

-- ============================================================================
-- PART 2: Indexes for context schema
-- ============================================================================

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

-- ============================================================================
-- PART 3: Extend memori.memories with provenance fields
-- ============================================================================

-- Source classification: explicit, implicit, bootstrap, tool_output
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS source_type text;
COMMENT ON COLUMN memori.memories.source_type IS 'Memory source: explicit (user said remember), implicit (extracted), bootstrap (seed data), tool_output (from command)';

-- Belief strength (0.00 - 1.00), updated on corroboration/contradiction
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS confidence numeric(3,2) DEFAULT 0.80;
COMMENT ON COLUMN memori.memories.confidence IS 'Belief strength 0.00-1.00, adjusted on corroboration (+) or contradiction (-)';

-- Provenance tracking - array of session_ids that contributed
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS lineage jsonb DEFAULT '[]'::jsonb;
COMMENT ON COLUMN memori.memories.lineage IS 'Array of session_ids that contributed to this memory';

-- Usage tracking
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
COMMENT ON COLUMN memori.memories.last_used_at IS 'Timestamp of last retrieval';

ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS use_count integer DEFAULT 0;
COMMENT ON COLUMN memori.memories.use_count IS 'Number of times this memory was retrieved';

-- TTL support
ALTER TABLE memori.memories ADD COLUMN IF NOT EXISTS expires_at timestamptz;
COMMENT ON COLUMN memori.memories.expires_at IS 'Optional expiration timestamp, NULL means never expires';

-- ============================================================================
-- PART 4: Additional indexes for memory retrieval
-- ============================================================================

-- Composite index for chatmode + category filtering
CREATE INDEX IF NOT EXISTS idx_memories_namespace_category
  ON memori.memories(user_id, category);

-- Index for expiration queries
CREATE INDEX IF NOT EXISTS idx_memories_expires_at
  ON memori.memories(expires_at)
  WHERE expires_at IS NOT NULL;

-- Index for usage tracking
CREATE INDEX IF NOT EXISTS idx_memories_last_used
  ON memori.memories(last_used_at DESC NULLS LAST);

-- ============================================================================
-- PART 5: Backfill existing memories with source_type = 'bootstrap'
-- ============================================================================

UPDATE memori.memories
SET
  source_type = 'bootstrap',
  confidence = 0.80,
  lineage = '[]'::jsonb
WHERE source_type IS NULL;

-- ============================================================================
-- PART 6: Trigger PostgREST schema cache reload
-- ============================================================================

NOTIFY pgrst, 'reload schema';
