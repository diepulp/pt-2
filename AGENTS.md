# PT-2 Pit Station

Casino pit management system for tracking player sessions, rating slips, and loyalty rewards at gaming tables. Built for pit bosses and floor supervisors.

## Project Structure

**Next.js App Router at root level. NO `src/` directory.**

```
pt-2/
├── app/                    # Routes, layouts, API handlers, server actions
├── components/             # React components (ui/, table/, rating-slip/)
├── hooks/                  # Domain-organized React hooks
├── services/               # Service layer (casino, player, visit, loyalty, mtl, etc.)
├── lib/                    # Core utilities (supabase, errors, query, http)
├── types/                  # TypeScript types (database.types.ts = source of truth)
├── supabase/migrations/    # SQL migrations
├── docs/                   # Architecture & governance docs
└── .claude/skills/         # Agent skills for specialized workflows
```

## Quick Reference

```bash
npm run dev              # Dev server at localhost:3000
npm run build            # Production build
npm run test             # Jest tests
npm run db:types         # Regenerate types after migrations (CRITICAL)
npm run type-check       # TypeScript strict check
npm run lint             # ESLint
npm run e2e:playwright   # Playwright E2E tests
```

## Tech Stack

- **Framework**: Next.js (App Router), React 19
- **Database**: Supabase (PostgreSQL + RLS)
- **State**: TanStack Query v5, Zustand
- **UI**: Tailwind CSS v4, shadcn/ui
- **Testing**: Jest (unit), Playwright (E2E)

## Documentation

Start at `docs/INDEX.md` for full navigation. Key docs:
- **SRM** (`docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`) - Bounded context registry (v4.11.0)
- **SLAD** (`docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`) - Implementation patterns
- **Over-Engineering Guardrail** (`docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`) - Complexity rules

Use `docs/patterns/SDLC_DOCS_TAXONOMY.md` to locate docs by SDLC category.
- **Transitional DTO Governance Caveat** (`docs/issues/gaps/financial-data-distribution-standard/decisions/TRANSITIONAL-GOVERNANCE-CAVEAT.md`) - Bridge DTOs may temporarily supersede canonical DTO guidance during active migration slices.

## Critical Guardrails

1. **Types**: Import from `types/remote/database.types.ts` only. Run `npm run db:types` after migrations.
2. **Services**: Functional factories, not classes. Explicit interfaces, no `ReturnType<>`.
3. **DTOs**: Derive from `Database` types using Pick/Omit/Partial. Cross-context consumption via published DTOs only. During active migration slices, check the Transitional DTO Governance Caveat for any bridge DTO exceptions declared by the active PRD / EXEC-SPEC.
4. **Code Quality**: No `as any`, no `console.*` in production code.
5. **Complexity**: See Over-Engineering Guardrail before adding abstractions. YAGNI applies.
6. **Migrations**: Follow `docs/60-release/MIGRATION_NAMING_STANDARD.md` (`YYYYMMDDHHMMSS_description.sql`).

## Service Layer Pattern

Services live in `services/{domain}/` with this structure:
```
services/player/
├── dtos.ts          # DTOs derived from Database types
├── schemas.ts       # Zod validation schemas
├── keys.ts          # React Query key factory
├── mappers.ts       # Row → DTO transformations
├── crud.ts          # CRUD operations
├── http.ts          # ServiceHttpResult wrappers
└── index.ts         # Service factory export
```

Bounded contexts own specific tables (see SRM). Cross-context access via DTO imports only.

## RLS & Security

Casino-scoped multi-tenancy with hybrid RLS (Track A per ADR-020).

**Context Derivation (ADR-024):**
- RPCs call `set_rls_context_from_staff()` - derives context from JWT `staff_id` claim + staff table lookup
- NO spoofable parameters - context is authoritative, not user-provided
- Validates staff is `active` before setting context
- Sets `app.actor_id`, `app.casino_id`, `app.staff_role` via `SET LOCAL` (pooler-safe)

**RLS Patterns (ADR-015):**
- Pattern C hybrid: `COALESCE(current_setting('app.casino_id'), jwt.app_metadata.casino_id)`
- All policies include `auth.uid() IS NOT NULL`
- SECURITY DEFINER RPCs self-inject context (ADR-015 Phase 1A, 86% compliant)

**Key ADRs:**
- ADR-015: Connection pooling strategy, self-injection pattern
- ADR-018: SECURITY DEFINER governance
- ADR-020: Track A hybrid strategy for MVP
- ADR-024: Authoritative context derivation (supersedes spoofable self-injection)

**References:** `docs/30-security/SEC-001-rls-policy-matrix.md`, `docs/30-security/SEC-002-casino-scoped-security-model.md`

## Memori Engine

Cross-session memory for agent continuity. Commands:
- `/memory-recall` - Query past decisions
- `/mvp-status` - Implementation phase status
- `/arch-memory` - Architectural decisions

## Skills & Workflows

Project skills (`.claude/skills/`) provide specialized agent workflows:
- `/lead-architect` - System design, SRM updates, ADR creation
- `/backend-service-builder` - Service layer implementation
- `/api-builder` - Route handlers and API endpoints
- `/build` - PRD/spec execution with gate approvals
- `/rls-expert` - RLS policy implementation
- `/e2e-testing` - Playwright test workflows
- `/qa-specialist` - Quality gates and test coverage

See `.claude/skills/README.md` for full skill catalog.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **pt-2** (46878 symbols, 59454 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/pt-2/context` | Codebase overview, check index freshness |
| `gitnexus://repo/pt-2/clusters` | All functional areas |
| `gitnexus://repo/pt-2/processes` | All execution flows |
| `gitnexus://repo/pt-2/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
