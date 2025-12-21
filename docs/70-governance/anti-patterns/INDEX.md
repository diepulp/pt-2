# Anti-Patterns Catalog Index

**Version**: 2.0.0 (Modular)
**Last Updated**: 2025-12-20
**Purpose**: Critical violations to avoid - **STOP and ask if you encounter these**

---

## Quick Navigation by Agent/Task

| Agent Type | Relevant Module | File |
|------------|-----------------|------|
| `backend-developer`, `backend-service-builder` | Service Layer | [01-service-layer.md](./01-service-layer.md) |
| `rls-security-specialist`, `backend-*` | Security & RLS | [02-security.md](./02-security.md) |
| `react-pro`, `pt2-frontend-implementer` | State Management | [03-state-management.md](./03-state-management.md) |
| `typescript-pro`, `backend-*` | Type System & DTOs | [04-type-system.md](./04-type-system.md) |
| `performance-engineer`, `api-expert` | Query Performance | [05-query-performance.md](./05-query-performance.md) |
| `lead-architect`, `system-architect` | Architecture & Scope | [06-architecture.md](./06-architecture.md) |
| `devops-pt2` | Migrations | [07-migrations.md](./07-migrations.md) |
| All agents | Production Code | [08-production-code.md](./08-production-code.md) |

---

## Module Summaries

### [01-service-layer.md](./01-service-layer.md) (~320 lines)
**For**: Backend service implementation

- Type System Violations (`ReturnType`, `any`, casting)
- Implementation Patterns (classes, singletons, state)
- Export Patterns (default exports, wrappers)
- Service-to-Service Calls
- Boundary & Access Violations
- Service Contract Violations
- Domain Error Anti-Patterns

### [02-security.md](./02-security.md) (~150 lines)
**For**: RLS policies, authentication, tenancy

- RLS Policy Anti-Patterns
- Context Injection Violations
- Service-Role Key Usage
- Visit Domain (ADR-014) Violations

### [03-state-management.md](./03-state-management.md) (~150 lines)
**For**: Frontend React/Zustand/Real-time

- React Query Violations
- Zustand Violations
- Real-Time Anti-Patterns

### [04-type-system.md](./04-type-system.md) (~120 lines)
**For**: TypeScript patterns, DTOs

- DTO Pattern Classification (A/B/C)
- Manual Type Redefinitions
- Type Regeneration Violations

### [05-query-performance.md](./05-query-performance.md) (~200 lines)
**For**: API endpoints, database queries

- N+1 Query Pattern (CRITICAL)
- Sequential Query Waterfall
- Missing Batch Queries
- Redundant Idempotency
- Missing Timing Instrumentation
- Known Audit Locations

### [06-architecture.md](./06-architecture.md) (~80 lines)
**For**: System design, abstractions

- Premature Infrastructure
- Non-Idempotent Writes
- Dual Database Clients

### [07-migrations.md](./07-migrations.md) (~50 lines)
**For**: Database migrations

- Direct psql Usage
- Timestamp Patterns

### [08-production-code.md](./08-production-code.md) (~50 lines)
**For**: All production code

- Console Usage
- Bulk Imports

---

## Quick Checklist (All Categories)

Before committing code, verify the relevant sections:

### Service Layer
- [ ] No `ReturnType` inference in service exports
- [ ] No `any` typing on supabase parameters
- [ ] No class-based services
- [ ] No service-to-service calls

### Security
- [ ] Server actions use `withServerAction()` for RLS context
- [ ] No service-role key in application runtime
- [ ] Casino context derived from auth, not headers

### DTO Patterns
- [ ] **Pattern B services**: No `export interface.*DTO`
- [ ] **Pattern A services**: Has `mappers.ts` if using DTOs

### Query Performance (PERF-001)
- [ ] No N+1 patterns (loops with DB calls)
- [ ] Independent queries use `Promise.all()`
- [ ] Batch queries for "get by multiple IDs"

### General
- [ ] No `console.*` in production
- [ ] Types regenerated after migrations

---

## Violation Response Protocol

1. **STOP** - Do not proceed with implementation
2. **Identify** - Match violation to specific module
3. **Load Module** - Read only the relevant anti-pattern file
4. **Apply** - Use the ✅ CORRECT pattern
5. **Ask** - If unsure, request architectural review

---

## References

- `docs/patterns/SDLC_DOCS_TAXONOMY.md` - Documentation navigation
- `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` - Service patterns
- `docs/30-security/SEC-001-rls-policy-matrix.md` - RLS templates
- `docs/50-ops/performance/PERF-001-rating-slip-modal-analysis.md` - Performance analysis

---

**Migration from Monolith**: The original `ANTI_PATTERN_CATALOG.md` has been modularized into this folder structure as of v2.0.0. The original file now serves as a redirect to this index.
