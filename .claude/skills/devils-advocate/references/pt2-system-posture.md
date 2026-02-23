# PT-2 System Posture — Devil's Advocate Reference

Canonical system context for adversarial reviews. Load this before evaluating any PT-2 proposal.

## System Overview

**PT-2 Pit Station** — Casino pit management system for tracking player sessions, rating slips, and loyalty rewards at gaming tables. Built for pit bosses and floor supervisors.

**Stack:** Next.js (App Router), React 19, Supabase (PostgreSQL + RLS), TanStack Query v5, Zustand, Tailwind CSS v4, shadcn/ui.

## Tenancy Model

Casino-scoped multi-tenancy (Pool Primary per ADR-023). Every data table is scoped to `casino_id`. Tenant isolation is enforced at the database level via RLS, not application logic.

**Non-negotiable:** No query, RPC, or API endpoint may return data from a casino the authenticated user does not belong to.

## Auth & Security Model

### Context Derivation (ADR-024)

- RPCs call `set_rls_context_from_staff()` — derives context from JWT `staff_id` claim + staff table lookup
- NO spoofable parameters — context is authoritative, not user-provided
- Validates staff is `active` before setting context
- Sets `app.actor_id`, `app.casino_id`, `app.staff_role` via `SET LOCAL` (pooler-safe)

### RLS Patterns (ADR-015/020)

- Track A hybrid strategy for MVP (ADR-020)
- Pattern C hybrid: `COALESCE(current_setting('app.casino_id'), jwt.app_metadata.casino_id)`
- All policies include `auth.uid() IS NOT NULL`
- SECURITY DEFINER RPCs self-inject context (ADR-015 Phase 1A, 86% compliant)

### Auth Pipeline Hardening (ADR-030)

- TOCTOU elimination on auth checks
- Claims lifecycle management
- Bypass lockdown (no debug/test bypasses in prod)
- Write-path session-var enforcement

### 7 Non-Negotiable Security Guardrails (SEC-002)

1. Context derivation from JWT only (ADR-024)
2. Claims lifecycle with refresh
3. Bypass lockdown
4. Write-path session-var enforcement
5. RLS on every table
6. SECURITY DEFINER governance (ADR-018)
7. Audit trail for sensitive operations

## Bounded Contexts (SRM v4.14.0)

Key service domains and their owned tables:

| Context | Owner | Key Tables |
|---------|-------|------------|
| Casino | casino-service | casinos, casino_settings |
| Staff | staff-service | staff, staff_roles |
| Player | player-service | players, player_aliases |
| Visit | visit-service | visits, visit_snapshots |
| Table | table-service | tables, table_sessions |
| Rating Slip | rating-slip-service | rating_slips, rating_slip_lines |
| Loyalty | loyalty-service | loyalty_tiers, loyalty_rewards |
| MTL | mtl-service | mtl_*, theoretical_win |

**Cross-context rule:** Services consume other contexts via published DTOs only. No direct table access across boundaries.

**Canonical reference:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`

## Service Layer Conventions

- Functional factories, not classes
- Explicit interfaces (no `ReturnType<>`)
- DTOs derived from `Database` types using Pick/Omit/Partial
- Service structure: `dtos.ts`, `schemas.ts`, `keys.ts`, `mappers.ts`, `crud.ts`, `http.ts`, `index.ts`
- No `as any`, no `console.*` in production code

**Canonical reference:** `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`

## Over-Engineering Guardrail (PT-OE-01)

Governance standard preventing premature abstractions. Key rules:

- No generic event buses, plugin systems, or abstract factories until proven need
- KISS/YAGNI enforced with concrete anti-patterns
- Justified trigger criteria required before adding infrastructure
- Three similar lines of code is better than a premature abstraction

**Canonical reference:** `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`

## Migration Standards

- Naming: `YYYYMMDDHHMMSS_description.sql`
- All migrations in `supabase/migrations/`
- Backfill strategy required for data migrations
- Rollback plan required for schema changes
- Lock-awareness for production tables

**Canonical reference:** `docs/60-release/MIGRATION_NAMING_STANDARD.md`

## Key ADR Index

| ADR | Decision | Review Relevance |
|-----|----------|-----------------|
| ADR-007 | API catalog and versioning | API contract reviews |
| ADR-008 | Service layer architecture | Service pattern compliance |
| ADR-009 | Balanced intake workflow | Feature scoping reviews |
| ADR-010 | DTO compliance standard | Cross-context data flow |
| ADR-011 | Over-engineering prevention | Scope creep detection |
| ADR-015 | Connection pooling + RLS | Security and tenancy reviews |
| ADR-018 | SECURITY DEFINER governance | RPC security reviews |
| ADR-020 | Track A hybrid MVP strategy | RLS pattern validation |
| ADR-023 | Multi-tenancy storage model | Tenancy boundary reviews |
| ADR-024 | Authoritative context derivation | Auth bypass detection |
| ADR-025 | MTL authorization | Loyalty/MTL reviews |
| ADR-030 | Auth pipeline hardening | Security posture validation |
| ADR-035 | Client state lifecycle | Frontend auth reviews |

**ADR location:** `docs/80-adrs/`

## Security Reference Docs

- `docs/30-security/SEC-001-rls-policy-matrix.md` — RLS policy expectations per table
- `docs/30-security/SEC-002-casino-scoped-security-model.md` — Security boundaries and guardrails

## Error Taxonomy

- `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md` — Standard error codes and resilience patterns

## Document Navigation

- `docs/INDEX.md` — Master doc index by SDLC taxonomy
- `docs/patterns/SDLC_DOCS_TAXONOMY.md` — Doc classification system
