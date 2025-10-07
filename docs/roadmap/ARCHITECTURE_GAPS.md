# PT-2 Architecture Gap Analysis

> **Date**: 2025-10-06
> **Context**: Post-Phase 2 Service Layer Foundation
> **Purpose**: Identify missing architectural components for production readiness

---

## Gap Summary

### ✅ Implemented (Strong Foundation)
- Service layer with explicit interfaces
- Shared infrastructure (operation-wrapper, types, utils)
- Database schema with RLS
- JWT helpers + audit logging skeleton
- CI/CD with quality gates
- Testing infrastructure (Jest + Cypress)
- Anti-pattern enforcement (ESLint)

### ❌ Missing Critical Components

| Category | Component | Status | Blocker For |
|----------|-----------|--------|-------------|
| **State Management** | React Query setup | ❌ Missing | Phase 3 UI |
| **State Management** | Zustand stores | ❌ Missing | Phase 3 UI |
| **Data Fetching** | Server actions layer | ❌ Missing | Phase 3 UI |
| **UI Layer** | Domain components | ❌ Missing | Phase 3 UI |
| **Real-Time** | Channel wrapper hooks | ❌ Missing | Phase 3 UI |
| **Real-Time** | Invalidation scheduler | ❌ Missing | Phase 3 UI |
| **Performance** | Bundle optimization | ❌ Missing | Phase 5 Launch |
| **Performance** | Query optimization | ❌ Missing | Phase 5 Launch |
| **Security** | RLS policy completion | ⚠️ Partial | Phase 4 Compliance |
| **Observability** | Structured logging | ❌ Missing | Phase 5 Launch |
| **Deployment** | Migration automation | ❌ Missing | Phase 5 Launch |

---

## Detailed Gap Analysis

### 1. State Management Layer (Phase 3 Blocker)

**Current State**: Services exist, no consumption layer

**Missing Components**:
```
lib/
└── query-client.ts              ❌ MISSING - React Query config

hooks/
├── shared/
│   └── use-service-query.ts     ❌ MISSING - Query wrapper template
├── player/
│   ├── use-player-queries.ts    ❌ MISSING - Player queries
│   └── use-player-mutations.ts  ❌ MISSING - Player mutations
├── visit/
│   ├── use-visit-queries.ts     ❌ MISSING
│   └── use-visit-mutations.ts   ❌ MISSING
└── ratingslip/
    ├── use-ratingslip-queries.ts ❌ MISSING
    └── use-ratingslip-mutations.ts ❌ MISSING

store/
├── player-store.ts              ❌ MISSING - UI state only
├── visit-store.ts               ❌ MISSING
└── ui-store.ts                  ❌ MISSING - Modal/nav state
```

**PRD Requirements**:
- React Query defaults: `staleTime` > 0, `refetchOnWindowFocus: false`
- Query key pattern: `[domain, entity, identifier]`
- Mutations use `invalidateQueries` or `setQueryData`
- Zustand restricted to ephemeral UI state (no server data)

**Impact**: UI layer blocked until this infrastructure exists

---

### 2. Server Actions Layer (Phase 3 Blocker)

**Current State**: Minimal server actions (player-create only)

**Missing Components**:
```
lib/actions/
└── with-server-action-wrapper.ts ❌ MISSING - Action wrapper

app/actions/
├── player/
│   ├── create-player-action.ts   ✅ EXISTS
│   ├── update-player-action.ts   ❌ MISSING
│   ├── get-player-action.ts      ❌ MISSING
│   └── search-players-action.ts  ❌ MISSING
├── visit/
│   ├── start-visit-action.ts     ❌ MISSING
│   ├── end-visit-action.ts       ❌ MISSING
│   └── cancel-visit-action.ts    ❌ MISSING
└── ratingslip/
    ├── create-rating-action.ts   ❌ MISSING
    └── update-rating-action.ts   ❌ MISSING
```

**PRD Requirements**:
- All mutations via server actions
- Structured telemetry (duration, requestId, error codes)
- Cache invalidation via `revalidatePath`/`revalidateTag`
- No console.* in production

**Impact**: Data fetching/mutations blocked

---

### 3. Real-Time Infrastructure (Phase 3 Critical)

**Current State**: No real-time infrastructure

**Missing Components**:
```
hooks/shared/
└── use-supabase-channel.ts       ❌ MISSING - Channel wrapper

hooks/{domain}/
└── use-{domain}-realtime.ts      ❌ MISSING - Domain subscriptions

lib/realtime/
└── invalidation-scheduler.ts     ❌ MISSING - Batch invalidation
```

**PRD Requirements**:
- `useSupabaseChannel` wrapper for typed channels
- Cleanup on unmount (no memory leaks)
- Batch React Query invalidations via scheduler
- Domain-specific hooks (no global managers)

**PT-1 Reference**:
- `hooks/table-context/useTableContextRealtime.ts` - Proven scheduler pattern

**Impact**: Real-time updates non-functional

---

### 4. UI Component Layer (Phase 3 Blocker)

**Current State**: Minimal UI (player-form only)

**Missing Domain Components**:
```
components/
├── player/
│   ├── player-form.tsx           ✅ EXISTS (enhance needed)
│   ├── player-list.tsx           ❌ MISSING
│   ├── player-detail.tsx         ❌ MISSING
│   └── player-search.tsx         ❌ MISSING
├── visit/
│   ├── visit-form.tsx            ❌ MISSING
│   ├── visit-list.tsx            ❌ MISSING
│   └── visit-detail.tsx          ❌ MISSING
├── ratingslip/
│   ├── rating-form.tsx           ❌ MISSING
│   ├── rating-list.tsx           ❌ MISSING
│   └── rating-detail.tsx         ❌ MISSING
├── casino/
│   └── table-manager.tsx         ❌ MISSING
└── mtl/
    ├── transaction-form.tsx      ❌ MISSING
    └── compliance-dashboard.tsx  ❌ MISSING
```

**PRD Requirements**:
- Server Components for data fetching
- Client Components accept typed DTO props
- Dynamic imports for heavy components
- HeroUI/Radix individual imports

**Impact**: No user-facing functionality

---

### 5. Performance Infrastructure (Phase 5 Blocker)

**Current State**: No performance monitoring

**Missing Components**:
```
lib/performance/
├── lighthouse-config.ts          ❌ MISSING - Budget enforcement
└── bundle-analyzer.ts            ❌ MISSING - Size tracking

.github/workflows/
└── performance.yml               ❌ MISSING - Lighthouse CI

next.config.mjs
└── Bundle analysis setup         ❌ MISSING
```

**PRD Requirements**:
- LCP ≤ 2.5s
- TBT ≤ 200ms
- Initial JS ≤ 250KB
- Automated Lighthouse in CI

**Impact**: Performance budgets not enforced

---

### 6. Observability & Logging (Phase 5 Critical)

**Current State**: No structured logging

**Missing Components**:
```
lib/logging/
├── logger.ts                     ❌ MISSING - Structured logger
└── telemetry.ts                  ❌ MISSING - Metrics collection

instrumentation.ts                ❌ MISSING - Next.js instrumentation
```

**PRD Requirements**:
- Structured logging (JSON/key-value)
- No console.* in production
- Domain metrics at API boundary
- Alertable events for failures

**Impact**: Production debugging impossible

---

### 7. Security Hardening (Phase 4-5 Critical)

**Current State**: RLS skeleton only

**Missing Security Components**:
```
RLS Policies:
├── Player policies               ⚠️ PARTIAL - Staff-only, no owner
├── Visit policies                ⚠️ PARTIAL - Staff-only
├── RatingSlip policies           ⚠️ PARTIAL - Staff-only
├── MTL policies                  ⚠️ PARTIAL - AUDITOR role only
└── Comprehensive testing         ❌ MISSING

supabase/tests/
└── rls-policies.test.sql         ❌ MISSING - Policy verification

lib/security/
├── rate-limiting.ts              ❌ MISSING
└── cors-config.ts                ❌ MISSING
```

**PRD Requirements**:
- Least-privilege RLS policies
- JWT claim validation
- Audit logging for critical actions
- Zero security advisor warnings

**Impact**: Production security compromised

---

### 8. Deployment & Operations (Phase 5 Blocker)

**Current State**: Local development only

**Missing Components**:
```
.github/workflows/
├── deploy-staging.yml            ❌ MISSING
└── deploy-production.yml         ❌ MISSING

scripts/
├── migrate.sh                    ❌ MISSING - Migration automation
├── rollback.sh                   ❌ MISSING - Rollback procedures
└── health-check.sh               ❌ MISSING - Health checks

docs/operations/
├── deployment-runbook.md         ❌ MISSING
├── rollback-playbook.md          ❌ MISSING
└── incident-response.md          ❌ MISSING
```

**PRD Requirements**:
- Environment flow: local → dev → staging → production
- Migration via Supabase CLI
- Rollback scripts ready
- Release gates with manual smoke tests

**Impact**: Cannot deploy to production

---

## Priority Matrix

### P0 (Blockers) - Must Have for Next Phase
1. **React Query setup** → Enables UI layer
2. **Server actions layer** → Data fetching/mutations
3. **Domain UI components** → User functionality
4. **Real-time infrastructure** → Live updates

### P1 (Critical) - Must Have for MVP
1. **Performance monitoring** → Budget enforcement
2. **Security hardening** → RLS completion
3. **Structured logging** → Production observability
4. **Deployment automation** → Production readiness

### P2 (Important) - Should Have
1. **Advanced workflows** → Business logic
2. **Compliance reporting** → Regulatory requirements
3. **Integration testing** → E2E validation

---

## Remediation Plan

### Week 2 (Current) - Finish Services
- Complete Casino, Table Context, MTL CRUD services
- Apply PT-1 search/query patterns
- Lock all service layer templates

### Week 3 - State Management Foundation (P0)
- Implement React Query config
- Build query/mutation hook templates
- Create Zustand UI stores
- Server action wrapper + domain actions

### Week 4 - Real-Time Infrastructure (P0)
- Build `use-supabase-channel` wrapper
- Implement invalidation scheduler
- Domain-specific real-time hooks
- Memory leak prevention testing

### Week 5 - UI Component Layer (P0)
- Player domain UI complete
- Visit domain UI complete
- RatingSlip domain UI complete
- Dynamic import optimization

### Week 6 - Performance & Security (P1)
- Lighthouse CI setup
- Bundle analysis automation
- RLS policy completion
- Security advisor audit

### Week 7 - Observability & Deployment (P1)
- Structured logging implementation
- Telemetry infrastructure
- Deployment automation
- Rollback procedures

---

## Architecture Decision Records Needed

**Pending ADRs** (document before implementation):
1. **Real-Time Strategy**: Scheduler pattern vs direct invalidation
2. **State Management**: React Query cache strategy per domain
3. **Server Actions**: Telemetry format and error handling
4. **Performance**: Bundle splitting strategy
5. **Security**: RLS policy patterns for multi-role access
6. **Deployment**: Migration versioning and rollback approach

---

## References

- [CANONICAL_BLUEPRINT_MVP_PRD.md](../system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md) - Architecture requirements
- [SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md](../system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md) - Service patterns
- [controlled-hybrid-refactor-model.md](../patterns/controlled-hybrid-refactor-model.md) - Implementation strategy
- [SESSION_HANDOFF.md](../phase-2/SESSION_HANDOFF.md) - Current implementation state

---

**Last Updated**: 2025-10-06
**Next Review**: End of Week 3 (Phase 2 completion)
