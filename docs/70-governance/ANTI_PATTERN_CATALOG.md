# Anti-Patterns & Violations

**Version**: 2.0.0 (Modular)
**Last Updated**: 2025-12-20
**Purpose**: Critical violations to avoid - **STOP and ask if you encounter these**

---

## Modular Catalog

This catalog has been modularized to reduce context overhead. **Load only the relevant module for your task.**

### Quick Navigation

| Module | Target Agents | Lines |
|--------|---------------|-------|
| [01-service-layer.md](./anti-patterns/01-service-layer.md) | `backend-developer`, `backend-service-builder` | ~320 |
| [02-security.md](./anti-patterns/02-security.md) | `rls-security-specialist`, `backend-*` | ~150 |
| [03-state-management.md](./anti-patterns/03-state-management.md) | `react-pro`, `pt2-frontend-implementer` | ~150 |
| [04-type-system.md](./anti-patterns/04-type-system.md) | `typescript-pro`, `backend-*` | ~120 |
| [05-query-performance.md](./anti-patterns/05-query-performance.md) | `performance-engineer`, `api-expert` | ~200 |
| [06-architecture.md](./anti-patterns/06-architecture.md) | `lead-architect`, `system-architect` | ~80 |
| [07-migrations.md](./anti-patterns/07-migrations.md) | `devops-pt2` | ~50 |
| [08-production-code.md](./anti-patterns/08-production-code.md) | All agents | ~50 |

**Full Index**: [anti-patterns/INDEX.md](./anti-patterns/INDEX.md)

---

## Quick Checklist (All Categories)

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

## Change Log

- **v2.0.0 (2025-12-20)**: Modularized into 8 focused files for agent context efficiency. Original monolith content preserved in `anti-patterns/` folder.
- **v1.3.0 (2025-12-20)**: Added Query Performance Anti-Patterns (PERF-001 discoveries)
- **v1.2.0 (2025-12-05)**: Added Domain Error, RLS & Security, Visit Domain (ADR-014) anti-patterns
- **v1.1.0 (2025-11-26)**: Added pattern-aware DTO rules (SLAD §356-490)
