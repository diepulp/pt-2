# Project Context

**Last Updated**: 2025-10-17
**Status**: Phase 2 - Service Layer Foundation (87.5% Complete)
**Source**: Extracted from validated architecture docs (Phase 0 audit complete)

---

## Tech Stack

### Core Framework

- Next.js 14 (App Router)
- TypeScript (strict mode)
- React 19

### Backend & Data

- Supabase (PostgreSQL + RLS + Auth + Realtime)
- @supabase/ssr (server/client factories)
- Supavisor (transaction-mode pooling)

### State Management

- React Query v5 (server state)
  - Default staleTime: 5 minutes
  - Default gcTime: 30 minutes
- Zustand (UI state ONLY - no server data)

### Testing

- Jest + React Testing Library (unit/integration)
- Cypress (E2E)
- Test location: `__tests__/services/{domain}/` (root-level)

### UI

- shadcn/ui + Radix UI primitives
- Tailwind CSS
- HeroUI components

### Build & Tooling

- Webpack (Turbopack disabled)
- ESLint + TypeScript compiler
- Lighthouse CI (performance budgets)

---

## Project Objective

**Goal**: Clean Casino Tracker Application with proven patterns, KISS/YAGNI principles

**MVP Domains**:

- Player (identity, profile)
- Visit (check-in/out tracking)
- Rating Slip (gameplay telemetry)
- Table Context (table lifecycle)
- Casino (properties, tables)
- MTL (Money Transaction Logging - compliance)
- Staff/Auth (roles, permissions)

---

## Core Constraints

### Guiding Principles

1. **Single Source of Truth**: One Supabase schema → one `database.types.ts`
2. **Vertical Slice Delivery**: DB → Service → API → UI with tests before expansion
3. **Security First**: RLS enabled by default, audit logging mandatory
4. **Guardrails Upfront**: CI gates for lint, type-check, tests, schema validation
5. **No Anti-Patterns**: See `anti-patterns.memory.md`

### Architecture Strategy

- **Hybrid Model**: HORIZONTAL layers + VERTICAL delivery
- **4-Second Rule**: "1 domain? VERTICAL. ALL domains? HORIZONTAL."
- **Reference**: `docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`

### Type System Rules

- **Single canonical type file**: `types/database.types.ts` (generated from Supabase)
- **No manual type redefinitions**: Use Pick/Omit/mapped types only
- **CI fails on**: Stale types, alternate schema definitions
- **Workflow**: Migration → `npm run db:types` → commit diff → typecheck

### Service Layer Rules

- **Pattern**: Functional factories (NOT classes)
- **Interfaces**: Explicit (NOT ReturnType inference)
- **Typing**: `supabase: SupabaseClient<Database>` (never `any`)
- **Structure**: CRUD (`crud.ts`) + Business (`business.ts`) + Queries (`queries.ts`)
- **Exports**: Named exports only (no default/mixed)

### State Management Rules

- **React Query**: ALL server data (players, visits, etc.)
- **Zustand**: UI state ONLY (modals, selections, nav)
- **Forbidden**: Server data in Zustand stores
- **Real-time**: Domain-specific hooks (no global managers)

---

## Current Status

### Phase 2: Service Layer Foundation (87.5%)

**Completed (7/8 services)**:

- ✅ Player Service (CRUD + queries + tests)
- ✅ Casino Service (CRUD + tables + tests)
- ✅ Visit Service (CRUD + lifecycle + tests)
- ✅ RatingSlip Service (CRUD + calculations + tests)
- ✅ Table Context Service (lifecycle + temporal + tests)
- ✅ MTL Service (compliance queries + CTR + tests)
- ✅ PlayerFinancial Service (transactions + tests)

**Test Status**: 98/98 tests passing (100%)

**Pending**:

- ⏳ Loyalty Service (optional, post-MVP)

**Next Phase (Phase 3 - Week 3)**:

- HORIZONTAL: React Query + Zustand infrastructure
- HORIZONTAL: Server action wrapper pattern
- VERTICAL: Player Management UI (Weeks 4-6)

---

## Key Decisions

### Architecture

- **ADR-001**: Dual database type strategy (local + remote)
- **ADR-002**: Root-level test location (`__tests__/services/`)
- **ADR-003**: React Query + Zustand state management (Week 3)
- **ADR-004**: Real-time strategy (domain hooks + scheduler)
- **ADR-005**: Integrity enforcement (IDE + runtime + CI)

### Migration Patterns

- **Forward-only**: Timestamped `YYYYMMDDHHMMSS_description.sql`
- **Never**: Manual DDL in production, psql for changes
- **Always**: `npx supabase migration up` OR `npx supabase db reset`
- **Trigger**: NOTIFY pgrst, 'reload schema' (cache refresh)

### Schema Consistency

- **UUID Primary Keys**: Universal standard across all domain tables
- **Resolution**: Migrated `ratingslip.id` TEXT → UUID (zero-cast schema)
- **Enforcement**: All new tables MUST use `UUID PRIMARY KEY DEFAULT gen_random_uuid()`

---

## Performance Budgets

- **LCP**: ≤ 2.5 seconds
- **TBT**: ≤ 200 milliseconds
- **Initial JS**: ≤ 250 KB
- **Service Ops**: <100ms (CRUD), <50ms (queries)
- **Lighthouse**: Automated CI checks

---

## Development Workflow

### Daily Operations

1. **Start**: Review session handoff + phase status
2. **Code**: Follow service templates + patterns
3. **Migrate**: Apply migrations → regenerate types → commit
4. **Test**: Run relevant test suites
5. **Commit**: Follow conventions (no breaking PRD rules)
6. **Handoff**: Update session handoff + phase status

### Before PR

- ✅ Zero TypeScript errors
- ✅ All tests passing
- ✅ No anti-pattern violations
- ✅ Types regenerated if schema changed
- ✅ Lint clean
- ✅ Coverage >80%

### CI Gates

- Lint + type-check
- Unit + integration tests
- Lighthouse performance
- Supabase migration validation
- Type regeneration diff check

---

## References

**Core Docs**:

- PRD: `docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md`
- Architecture: `docs/system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- Patterns: `docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`
- Index: `docs/INDEX.md`

**Quick References**:

- Service Template: `docs/patterns/SERVICE_TEMPLATE_QUICK.md`
- Database Workflow: `docs/workflows/DATABASE_TYPE_WORKFLOW.md`
- Session Handoff: `docs/phases/phase-2/SESSION_HANDOFF.md`

**Auto-Load**: This file loads automatically with `.claude/config.yml`

---

**Version**: 1.0.0
**Words**: ~650 (target: <500 lines)
**Next Update**: Phase transition or major decision
