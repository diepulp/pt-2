# Architecture Decisions Snapshot
last_updated: 2025-11-28
sources:
  - .claude/memory/architecture-decisions.memory.md (detailed)
  - docs/80-adrs/
  - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
key_points:
  - ADR-001: Supabase + PostgREST as canonical data layer with RLS enforcing casino tenancy.
  - ADR-003: React 19 server components + React Query for data orchestration; Zustand limited to ephemeral UI state.
  - ADR-007: Observability via structured server action wrapper with audit logging and correlation IDs.
  - ADR-010: ServiceResult envelope required for all domain mutations; HTTP translation happens at edge layer.
  - ADR-012: Error handling layers - services THROW DomainError; transport layer CATCHES and returns ServiceResult<T>.
  - ADR-014: MTL compliance engine owns cash ledgers; finance integrations must consume published views only.
guardrails:
  - Schema-first development using generated types; migrations must precede application code changes.
  - Vertical slice delivery pattern: service factory + server action + UI hook with shared DTOs.
  - Weekly ADR review ensures docs stay aligned; superseded ADRs must be referenced in new decisions.
  - Error handling: Service layer throws DomainError; never return ServiceResult from services (ADR-012).

## Context Management Architecture (2025-11-25)

### Session Layer
- PostgreSQL `context` schema with 3 tables (sessions, session_events, session_state)
- Append-only event log + mutable scratchpad for session state
- Hook integration for automatic event capture

### Memory Retrieval
- PostgreSQL full-text search via tsvector/tsquery (no vector DB)
- Composite scoring: relevance (40%) + recency (30%) + importance (30%)
- Proactive injection at turn start based on message analysis

### Compaction Strategies
- SlidingWindowStrategy: Keep last 30 turns
- TokenTruncationStrategy: Trim to 100k token budget
- RecursiveSummarizationStrategy: LLM-generated checkpoint summaries

### Multi-Agent Coordination
- AgentHandoff protocol for workflow transitions between chatmodes
- HandoffContext preserves validation gates, artifacts, key decisions
- WORKFLOW_TRANSITIONS defines valid chatmode sequences per workflow

### Implementation Files
- lib/context/ (6 modules, ~2,200 lines): session.py, models.py, builder.py, compaction.py, hooks.py, handoff.py
- lib/memori/ (2 new modules, ~1,000 lines): retrieval.py, pipeline.py
- Migration: supabase/migrations/20251125141315_context_session_layer.sql
