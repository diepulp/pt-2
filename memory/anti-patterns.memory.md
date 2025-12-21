# Anti-Patterns Snapshot (PT-2)
last_updated: 2025-12-20
version: 2.0.0 (modular)
structure: docs/70-governance/anti-patterns/INDEX.md

## Modular Files (load by task)

| Module | File | Target Agents |
|--------|------|---------------|
| Service Layer | 01-service-layer.md | backend-developer, backend-service-builder |
| Security & RLS | 02-security.md | rls-security-specialist, backend-* |
| State Management | 03-state-management.md | react-pro, pt2-frontend-implementer |
| Type System | 04-type-system.md | typescript-pro, backend-* |
| Query Performance | 05-query-performance.md | performance-engineer, api-expert |
| Architecture | 06-architecture.md | lead-architect, system-architect |
| Migrations | 07-migrations.md | devops-pt2 |
| Production Code | 08-production-code.md | all agents |

## Critical Summary (all agents)

### Service Layer (01)
- Ban `ReturnType` inference; export explicit interfaces
- No class-based services, singletons, or cached state
- No service-to-service calls; orchestrate in route handlers

### Security (02)
- NEVER trust client-provided casino_id
- Server actions MUST use `withServerAction()` for RLS context
- Ghost visits = player_id NULL (not visit_id NULL)

### Query Performance (05) - PERF-001
- CRITICAL: N+1 pattern - loops with DB calls (cost: +800ms)
  - ❌ `Promise.all(items.map(async (t) => { await supabase.from()... }))`
  - ✅ Batch query: `.in('table_id', tableIds)` returns Map<id, data[]>
- HIGH: Sequential waterfall - independent queries run one-by-one
  - ✅ Three-phase parallelization: Phase A (deps) → Phase B (parallel) → Phase C (parallel)
- Audit locations: enroll/route.ts:56-73, visits/route.ts:114-121

### Type System (04)
- Pattern B (Player, Visit, Casino): No `export interface.*DTO`
- Pattern A (Loyalty, Finance): Manual interfaces + mappers.ts
- NEVER use `as` casting for RPC responses

### Checklist (quick scan)
- [ ] No `ReturnType` or `any`
- [ ] No N+1 patterns (loops with DB calls)
- [ ] Independent queries use `Promise.all()`
- [ ] RLS context via `withServerAction()`
- [ ] Casino context derived from auth
- [ ] Types regenerated after migrations
