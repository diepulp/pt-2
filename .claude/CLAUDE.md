# PT-2 Pit Station

Casino pit management system for tracking player sessions, rating slips, and loyalty rewards at gaming tables. Built for pit bosses and floor supervisors to manage real-time table operations.

## Project Structure

**Next.js 15 App Router at root level. NO `src/` directory.**

```
pt-2/
├── app/                    # Routes, layouts, API handlers, server actions
├── components/             # React components (ui/, table/, rating-slip/)
├── hooks/                  # Domain-organized React hooks
├── services/               # Service layer (casino, player, rating-slip, visit)
├── lib/                    # Core utilities (supabase, errors, query, http)
├── types/                  # TypeScript types (database.types.ts = source of truth)
├── supabase/migrations/    # SQL migrations
├── docs/                   # Architecture & governance documentation
└── memory/                 # Compressed context files
```

## Quick Reference

```bash
npm run dev              # Dev server at localhost:3000
npm run build            # Production build
npm run test             # Jest tests
npm run db:types         # Regenerate types after migrations
```

## Documentation Navigation

Use **`docs/patterns/SDLC_DOCS_TAXONOMY.md`** to locate documentation by category:

| Category | What It Contains | Location |
|----------|------------------|----------|
| **V&S** | Vision, goals, scope | `docs/00-vision/` |
| **PRD** | Product requirements, features | `docs/10-prd/` |
| **ARCH** | Service architecture, bounded contexts | `docs/20-architecture/` |
| **API/DATA** | OpenAPI specs, DTOs, schema | `docs/25-api-data/` |
| **SEC/RBAC** | RLS policies, role matrix | `docs/30-security/` |
| **DEL/QA** | Test strategy, quality gates | `docs/40-quality/` |
| **OPS/SRE** | Observability, runbooks | `docs/50-ops/` |
| **REL** | Release notes, rollout plans | `docs/60-release/` |
| **GOV** | Standards, anti-patterns, guardrails | `docs/70-governance/` |
| **ADR** | Architecture decision records | `docs/80-adrs/` |

**Start here**: `docs/INDEX.md` for full documentation index.

## Memori Engine

Cross-session memory system for agent continuity. Stores lightweight context in PostgreSQL (`memori` schema).

- **Session recall**: `/memory-recall` command to query past decisions
- **Progress tracking**: `/mvp-status` for implementation phase status
- **Architecture memory**: `/arch-memory` for architectural decisions

Memori stores pointers and learnings, not full documents. Documentation lives in `docs/` (git-controlled).

## Memory Files (Compressed Context)

These files provide compressed context from 200k+ words of documentation:

@memory/project.memory.md
@memory/anti-patterns.memory.md
@memory/architecture-decisions.memory.md
@memory/phase-status.memory.md
@memory/service-catalog.memory.md
@memory/domain-glossary.memory.md

## Tech Stack

- **Framework**: Next.js 15 (App Router), React 19
- **Database**: Supabase (PostgreSQL + RLS)
- **State**: TanStack Query v5, Zustand
- **UI**: Tailwind CSS v4, shadcn/ui
- **Testing**: Jest, Playwright

## Critical Guardrails

- Types from `types/database.types.ts` only (run `npm run db:types` after migrations)
- Functional factories for services, not classes
- No `as any`, no `console.*` in production
- See `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` before adding abstractions
