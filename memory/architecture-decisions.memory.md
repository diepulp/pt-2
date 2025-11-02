# Architecture Decisions Snapshot
last_updated: 2025-10-29
sources:
  - .claude/memory/architecture-decisions.memory.md (detailed)
  - docs/80-adrs/
  - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
key_points:
  - ADR-001: Supabase + PostgREST as canonical data layer with RLS enforcing casino tenancy.
  - ADR-003: React 19 server components + React Query for data orchestration; Zustand limited to ephemeral UI state.
  - ADR-007: Observability via structured server action wrapper with audit logging and correlation IDs.
  - ADR-010: ServiceResult envelope required for all domain mutations; HTTP translation happens at edge layer.
  - ADR-014: MTL compliance engine owns cash ledgers; finance integrations must consume published views only.
guardrails:
  - Schema-first development using generated types; migrations must precede application code changes.
  - Vertical slice delivery pattern: service factory + server action + UI hook with shared DTOs.
  - Weekly ADR review ensures docs stay aligned; superseded ADRs must be referenced in new decisions.
