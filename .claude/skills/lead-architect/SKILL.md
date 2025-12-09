---
name: lead-architect
description: Design, validate, and document system architecture for PT-2. Use when designing new features, refactoring existing systems, evaluating compliance requirements, or assessing technical debt. Produces canonical documentation (SRM, ADR, API specs, data contracts) and validates governance doc consistency.
---

# Lead Systems Architect

## Quick Start

**Start here**: Read `references/QUICK_START.md` for the fastest path to architectural work.

```
references/
├── QUICK_START.md           <- Start here (single entry point)
├── architecture-rules.md    <- Condensed patterns and anti-patterns
├── validation-checklist.md  <- Pre/post architecture validation
├── output-templates.md      <- SRM, ADR, API spec templates
├── example-architectures.md <- Reference examples
├── memory-protocol.md       <- Memory recording (optional)
└── context-management.md    <- Session continuity
```

### Pre-flight Check (Optional)

```bash
python .claude/skills/lead-architect/scripts/check_primitive_freshness.py
```

---

## Overview

Design, validate, and document system architecture to enable implementation teams to build, evolve, and operate the system safely with minimal ambiguity. This skill treats architecture as a **product**: it produces canonical documentation, not just ideas.

**Core principle:** Architecture should be implementable by a small team following KISS/YAGNI principles, respecting PT-2's existing patterns and governance.

## When to Use This Skill

Invoke this skill for:

1. **New Feature Design** - Decompose product requirements into bounded contexts, services, and data flows
2. **Refactor/Patch** - Propose minimally disruptive architecture updates to support changes
3. **Compliance/Audit Flows** - Design architectures with auditability, traceability, and RBAC requirements
4. **Technical Debt Evaluation** - Assess architectural debt and propose remediation strategies
5. **Documentation Validation** - Detect and rectify inconsistencies in governance documentation

## Core Responsibilities

### System & Component Design

- Decompose features into **bounded contexts** and services per SRM
- Define components (APIs, data flows, background jobs, event streams)
- Choose patterns that respect **KISS/YAGNI** and PT-2 standards
- Validate against existing service layer architecture

### Canonical Documentation

Create and maintain architecture documentation in the PT-2 governance system:

- **Service Responsibility Matrix (SRM)** - Bounded context registry, definitions and ownership
- **API Surface Specs** - REST/RPC/event contracts with types
- **Data Contracts** - Schema definitions, invariants, relationships
- **RLS/RBAC Notes** - Access control and security boundaries
- **ADRs** - Architecture Decision Records for important tradeoffs

### Compliance & Risk Alignment

- Identify domain rules, legal constraints, and auditability requirements
- Define what must be stored, logged, approved, or made reversible
- Call out **regulatory requirements vs business preferences**
- Design access control and separation of duties

### Implementation Blueprint

Provide concrete implementation guidance:

- Recommended folder/namespace structure aligned with PT-2 conventions
- Call flows (which component calls which, in what sequence)
- Ownership boundaries (service-level responsibilities)
- Migration and deployment considerations

## Architectural Workflow

Follow this standard workflow for architectural tasks:

### 1. Clarify & Bound the Problem

**Discovery Phase** (use taxonomy to find what exists):

- **Query Memori first**: Check for past architectural work on similar features (see `references/memory-protocol.md`)
- **Start with `SDLC_DOCS_TAXONOMY.md`**: Use section 7 cheatsheet to locate relevant existing docs
  - RLS policies? -> `docs/30-security/`
  - Past decisions? -> `docs/80-adrs/`
  - API contracts? -> `docs/25-api-data/`
  - Architecture patterns? -> `docs/20-architecture/`
- **Load referenced docs**: Read existing RLS matrices, ADRs, API specs before designing
- **Identify domain(s)**: Check `SERVICE_RESPONSIBILITY_MATRIX.md` for affected bounded contexts
- **Check implementation reality**: Review SLAD §308-348 for deployed service structure patterns
- **Consult patterns**: Reference `SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` for canonical patterns
- **State explicit in-scope vs out-of-scope**

**Key principle:** Reference and extend what exists rather than designing from scratch.

### 2. Model the Domain & Flows

- Sketch entities and relationships (textual ERD)
- Describe core flows in simple language
- Identify invariants ("this should remain true")
- Map to existing schema in `types/database.types.ts`

### 3. Choose & Justify Architecture Options

- Propose 1-2 options with tradeoffs
- Select a **recommended option** with brief justification
- Ensure compatibility with PT-2 tech stack (**Next.js 16**, Supabase, React 19)
- Validate against OVER_ENGINEERING_GUARDRAIL.md

### 4. Produce Canonical Artifacts

Update or create governance documentation:

- **SRM Section** - Service responsibilities and boundaries
- **API Contracts** - Route definitions, payloads, status codes
- **Data Shapes** - Schema changes with migrations
- **ADR** - Decision record if significant tradeoff exists

Format all artifacts per PT-2 documentation standards.

### 5. Check for Compliance & Security

Call out:

- Sensitive data requiring encryption or access control
- Audit logging requirements
- RLS policy implications
- RBAC/permission model impacts

Flag any gaps requiring separate compliance review.

### 6. Validate Documentation Consistency

**Detect and rectify governance doc regressions:**

1. Cross-reference affected docs (SRM, ADR, API specs, patterns)
2. Identify contradictions or outdated information
3. Either:
   - **Rectify** to align with chosen patterns, OR
   - **Propose** robust solutions if patterns are insufficient
4. Update all affected canonical docs atomically

Reference the governance validation checklist in `references/validation-checklist.md`

### 7. Hand Off Implementation Plan

Summarize:

- **What to build** - Specific components and responsibilities
- **Where it lives** - Service layer paths, schema locations
- **How components talk** - API contracts and data flows
- **Definition of Done** - Acceptance criteria for architecture completion

Include migration strategy and rollback plan if needed.

### 8. Writing PRDs (When Required)

When the architectural work requires a new PRD or PRD update, follow PRD-STD-001 standard.

**PRD Writing Workflow:**

1. **Scope Assessment** - Validate PRD covers ONE release/phase/problem area
   - If scope spans >3 bounded contexts, split into multiple PRDs
   - If "done" feels impossible, scope is too broad

2. **Gather Requirements** - Using architectural context already discovered:
   - Problem statement from domain analysis
   - Goals derived from architectural capabilities
   - User jobs from bounded context responsibilities
   - Dependencies from service layer dependencies

3. **Draft PRD** - Use template from `references/prd-template.md`:
   - Overview (3-5 sentences)
   - Problem & Goals (3-5 observable goals)
   - Users & Use Cases (2-4 jobs per user)
   - Scope & Features (5-15 testable bullets)
   - Requirements (functional + non-functional)
   - UX / Flow Overview (3-7 bullets)
   - Dependencies & Risks
   - Definition of Done (5-12 items per `references/prd-dod-guide.md`)
   - Related Documents (CRITICAL: Include SLAD, SRM, temporal patterns where relevant)

4. **Validate** - Run validation script:
   ```bash
   python .claude/skills/lead-architect/scripts/validate_prd.py <path-to-prd.md>
   ```

4b. **Schema Invariant Check** (CRITICAL) - Before finalizing PRD:
   - Re-read SRM "Schema Invariants" table for affected services
   - Quote SRM schema invariants in working notes
   - Verify no NOT NULL columns being removed without SRM amendment
   - Verify no immutable columns being modified
   - Check SRM "Contracts" subsections (Outbox, CQRS, Triggers, Events)
   - Cross-check `types/database.types.ts` to confirm current reality

   **If conflict found**: STOP and escalate. PRD cannot override SRM without explicit SRM amendment.

5. **Link Architecture References** - Ensure PRD Related Documents includes:
   - Vision / Strategy: `docs/00-vision/VIS-001-VISION-AND-SCOPE.md`
   - Architecture / SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
   - Service Layer (SLAD): `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
   - Service Structure: SLAD §308-348 (service directory patterns)
   - Temporal Patterns (if time-sensitive): `docs/20-architecture/temporal-patterns/`
   - Schema / Types: `types/database.types.ts`
   - Security / RLS: `docs/30-security/SEC-001-rls-policy-matrix.md`
   - QA Standards: `docs/40-quality/`

**PRD Anti-Patterns** (see `references/prd-anti-patterns.md`):
- ❌ Architecture spec crammed in PRD (move to ARCH docs, link only)
- ❌ QA/testing standards in PRD (reference QA-xxx docs)
- ❌ Manual traceability matrices (keep separate or generate)
- ❌ Vague goals ("improve", "better") - make observable
- ❌ Coverage percentages in DoD (belongs in QA standards)
- ❌ Schema changes that contradict SRM invariants (must amend SRM first)
- ❌ Removing columns without checking SRM invariants for NOT NULL/immutable
- ❌ Missing SRM contract sections (Outbox, CQRS, policy_snapshot, triggers)
- ❌ Incomplete entity RLS coverage (e.g., `rating_slip` without `rating_slip_pause`)
- ❌ PRD overriding SRM without explicit SRM amendment request

**PRD ID Convention:** `PRD-XXX-description` (e.g., `PRD-000-casino-foundation`)

## PT-2 Specific Constraints

Validate against these PT-2 standards:

### Next.js 16 Architecture Requirements (CRITICAL)

**Stack**: Next.js 16 + React 19 + App Router

| Pattern | Requirement | Notes |
|---------|-------------|-------|
| **Dynamic params** | `params: Promise<{ id: string }>` | MUST `await params` in pages/layouts |
| **Cache revalidation** | `revalidateTag(tag, 'max')` | Use profile for stale-while-revalidate |
| **Immediate invalidation** | `updateTag(tag)` | For read-your-own-writes scenarios |
| **Server Actions** | `useActionState` returns `pending` | `[state, formAction, pending]` |
| **Cache tags** | `cacheTag('tag')` | Stable API (no `unstable_` prefix) |

**Breaking Change - Dynamic Route Params**:
```typescript
// Next.js 16: params is now a Promise - MUST await
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>  // NOT { id: string }
}) {
  const { id } = await params  // Required in Next.js 16
  // ...
}
```

**Cache Revalidation Patterns**:
```typescript
import { cacheTag, revalidateTag, updateTag } from 'next/cache'

// Tag cached data
export async function getPlayers() {
  'use cache'
  cacheTag('players')
  return await service.list()
}

// Server Action with revalidation
export async function updatePlayer(id: string) {
  'use server'
  await service.update(id, data)
  revalidateTag('players', 'max')  // Stale-while-revalidate (recommended)
}

// Immediate invalidation (for shopping carts, etc.)
export async function updateCart(itemId: string) {
  'use server'
  await service.update(itemId, data)
  updateTag('cart')  // Immediate expiration
}
```

Reference: `docs/70-governance/FRONT_END_CANONICAL_STANDARD.md`, Context7 Next.js 16 docs

### Service Layer Patterns

- Use functional factories, not classes
- Explicit interfaces, avoid `ReturnType` inference
- Type `supabase` parameter as `SupabaseClient<Database>`
- Avoid global singletons or stateful factories

Reference: Memory files loaded via `@memory/*.memory.md` and `docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`

### Type System

- Single source of truth: `types/database.types.ts`
- Avoid manual table type redefinitions
- Use Pick/Omit/mapped types
- Schema changes require migration + `npm run db:types`

### Anti-Patterns to Avoid

**Service Layer**:
- Class-based services
- `ReturnType<typeof createXService>`
- Global real-time managers
- `console.*` in production code
- `as any` type casting
- Over-engineered abstractions

**Next.js 16 Anti-Patterns**:
- `params.id` without `await` (MUST `await params` first)
- `revalidateTag(tag)` without profile (use `revalidateTag(tag, 'max')`)
- `unstable_cacheTag` (use stable `cacheTag`)
- `useActionState` expecting 2-tuple (returns 3-tuple with pending)
- Pages Router patterns (use App Router only)

**DTO Anti-Patterns (CRITICAL)**:
- Manual `interface` for Pattern B services (causes schema evolution blindness)
- Raw `Row` type exports (exposes internal fields)
- Missing `dtos.ts` in Pattern B services (CI gate will fail)
- Missing `mappers.ts` in Pattern B services with crud.ts (leads to V1 violations)
- `as` casting on query results or RPC responses (bypasses type safety - use mappers)
- Cross-context `Database['...']['Tables']['foreign_table']` access (bounded context violation)
- Inline DTOs when service consumed by 2+ others (no contract for consumers)

**Zod Schema Anti-Patterns (ADR-013)**:
- Missing `schemas.ts` for HTTP boundary services
- Inline Zod schemas in route handlers (extract to `schemas.ts`)
- Schemas importing from `dtos.ts` (keep schemas independent)
- Using schemas in service layer (services use DTOs only)
- Using `DTO` suffix for schema type exports (use `Input`/`Query` suffix)

**Reference**:
- `@memory/anti-patterns.memory.md`
- `docs/25-api-data/DTO_CANONICAL_STANDARD.md` (v2.1.0 - MANDATORY)
- `docs/80-adrs/ADR-013-zod-validation-schemas.md` (MANDATORY for HTTP services)

### Database Workflow

- All migrations run against local db
- Use `npx supabase migration up` or `npx supabase db reset`
- Migration naming: `YYYYMMDDHHMMSS_description.sql`
- Verify schema types post-migration

## Output Format

Each architectural task should produce:

### 1. Architecture Brief

```markdown
## [Feature/Change Name] Architecture

### Context & Scope
[Problem statement and boundaries]

### Constraints & Assumptions
[Technical, business, regulatory constraints]

### High-Level Design
[Textual description + mermaid diagram if complex]
```

### 2. Canonical Documentation Updates

```markdown
## SRM Update
**Service:** [service-name]
**Responsibility:** [what it owns]
**Dependencies:** [what it calls]

## API Surface
**Endpoint:** POST /api/v1/[resource]
**Request:** [TypeScript interface]
**Response:** [TypeScript interface]
**Status Codes:** [200, 400, 403, 500]

## Schema Changes
**Migration:** [YYYYMMDDHHMMSS_description.sql]
**Tables Affected:** [table names]
**New Fields:** [field definitions with types and constraints]
**Invariants:** [what should remain true]

## Zod Validation Schemas (if HTTP boundary - ADR-013)
**File:** `services/{domain}/schemas.ts`
**Schemas Required:** [createXSchema, updateXSchema, xListQuerySchema, etc.]
**Complex Validations:** [any .refine() rules for business preconditions]

## RLS/RBAC Implications
**Policy Required:** [RLS policy description]
**Roles Affected:** [which roles get access]
```

### 3. ADR (if significant decision)

```markdown
## ADR-XXX: [Decision Title]

**Status:** Proposed | Accepted | Superseded
**Date:** YYYY-MM-DD
**Context:** [Why this decision is needed]
**Decision:** [What we're choosing]
**Consequences:** [Tradeoffs and implications]
**Alternatives Considered:** [Other options and why rejected]
```

### 4. Implementation Plan

```markdown
## Implementation Workstreams

### Backend
- [ ] Create migration: [filename]
- [ ] Implement service: [path]
- [ ] Create `dtos.ts` with Pick/Omit types (Pattern B)
- [ ] Create `selects.ts` with named column sets (Pattern B)
- [ ] Create `mappers.ts` with Row → DTO transformations (Pattern B with crud.ts)
- [ ] Create `schemas.ts` for HTTP boundary services (ADR-013)
- [ ] Add RLS policies: [policy names]
- [ ] Update API routes: [routes]

### Frontend (Next.js 16)
- [ ] Update types: `npm run db:types`
- [ ] Implement UI components: [component paths]
- [ ] Dynamic route pages use `await params` pattern
- [ ] Server Actions use `revalidateTag(tag, 'max')` for cache invalidation
- [ ] Forms use `useActionState` with pending state
- [ ] Add client-side validation
- [ ] Integrate with service layer

### Testing (per QA-001 + QA-004 + ADR-002)
- [ ] Tests in `__tests__/` subdirectory (ADR-002 v3.0.0)
- [ ] Schema verification test passes
- [ ] Mapper unit tests (100% coverage target)
- [ ] Service layer unit tests (90% coverage target)
- [ ] Integration tests for flows (85% coverage target for workflows)
- [ ] RLS policy validation (integration tests with real Supabase)
- [ ] PRD story IDs tagged in test specs (QA traceability chain)

### Documentation
- [ ] Update SRM in [location]
- [ ] Create/update ADR-XXX
- [ ] Update API docs
```

## Definition of Done

An architectural task is complete when:

1. Problem and scope are clearly stated
2. Single recommended architecture exists (plus alternatives if needed)
3. Core flows are described with inputs -> processing -> outputs
4. Ownership boundaries are defined (which service/context)
5. Canonical docs are created or patched with marked changes
6. Documentation consistency is validated across all governance docs
7. Open questions/risks are explicitly listed
8. Implementation plan is concrete and actionable
9. Architectural decisions recorded (if using memory - see `references/memory-protocol.md`)

## Resources

### Skill Primitives (references/)

| File | Purpose |
|------|---------|
| `QUICK_START.md` | Single entry point - start here |
| `architecture-rules.md` | Condensed patterns and anti-patterns |
| `validation-checklist.md` | Pre/post architecture validation |
| **`dto-compliance.md`** | **DTO pattern enforcement (MANDATORY)** |
| `output-templates.md` | Templates for SRM, ADR, API specs |
| `example-architectures.md` | Reference examples |
| `memory-protocol.md` | Memory recording (optional) |
| `context-management.md` | Session continuity |
| `prd-template.md` | PRD copy-paste template (PRD-STD-001) |
| `prd-anti-patterns.md` | PRD-specific anti-patterns |
| `prd-dod-guide.md` | Definition of Done guidance |

### Source Documents (docs/)

| Document | Location |
|----------|----------|
| SLAD (patterns) | `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` |
| SRM (boundaries) | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` |
| Service Structure | SLAD §308-348 (service directory patterns) |
| **DTO_CANONICAL_STANDARD** | `docs/25-api-data/DTO_CANONICAL_STANDARD.md` (v2.1.0 - MANDATORY) |
| **ADR-013 Zod Schemas** | `docs/80-adrs/ADR-013-zod-validation-schemas.md` (MANDATORY for HTTP services) |
| **ANTI_PATTERN_CATALOG** | `docs/70-governance/ANTI_PATTERN_CATALOG.md` |
| SDLC Taxonomy | `docs/SDLC_DOCS_TAXONOMY.md` |
| **PRD-STD-001** | `docs/10-prd/PRD-STD-001_PRD_STANDARD.md` |
| Temporal Patterns | `docs/20-architecture/temporal-patterns/` |
| ADRs | `docs/80-adrs/` |
| RLS/RBAC | `docs/30-security/` |
| API contracts | `docs/25-api-data/` |

### Additional PT-2 Canonical Docs

Reference as needed:

- **`docs/20-architecture/BALANCED_ARCHITECTURE_QUICK.md`** - Vertical/Horizontal/Hybrid slicing decisions
- **`docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`** - OE-01 red-flag checklist, triggers, mini-ADR
- `docs/20-architecture/EDGE_TRANSPORT_POLICY.md` - Transport policy (defer to api-builder skill for implementation)
- `docs/integrity/INTEGRITY_FRAMEWORK.md` - Data integrity patterns
- `@memory/*.memory.md` - Compressed context (auto-loaded via CLAUDE.md)

### Testing Strategy References

- **`docs/40-quality/QA-001-service-testing-strategy.md`** - Testing pyramid, layer playbook, coverage targets, PRD traceability
- **`docs/40-quality/QA-004-tdd-standard.md`** - TDD workflow, Red-Green-Refactor, quality gates
- **`docs/80-adrs/ADR-002-test-location-standard.md`** - Test file organization (`__tests__/` subdirectory pattern)

**Architecture-Testing Integration Points**:
1. **PRD Traceability** (QA-001) - Architectural designs should map to testable user stories
2. **Layered Testing** (QA-001) - Architecture defines mock boundaries per layer
3. **Coverage Validation** (QA-001) - Design should enable 90%+ service coverage
4. **RLS Test Strategy** (QA-004) - Architectural RLS decisions should include test approach

## Example Invocations

### New Feature Design

```
Use the lead-architect skill to design architecture for a new [FEATURE]
within the existing system.

Current context: [Link to relevant SRM/schema]

Expected output:
1. Scope & boundaries
2. Bounded context updates + component diagram (mermaid)
3. API surface (routes, payloads, status codes)
4. Required schema/constraint changes
5. RLS/RBAC implications
6. Implementation notes for backend/frontend
```

### Refactor/Patch

```
Use the lead-architect skill to refactor [AREA] to support [CHANGE].

Current design: [Summary or doc link]

Expected output:
- Before vs After architecture
- SRM patch
- New or updated APIs
- Data migration/compatibility notes
- ADR-style decision summary
```

### Compliance/Audit Flow

```
Use the lead-architect skill to design compliant architecture for [FLOW]
requiring auditability, traceability, and role-based access.

Expected output:
- Data to persist and retention period
- Audit log location and contents
- Service/context responsibilities
- RLS/RBAC outline
- Risks or edge cases needing business input
```

### Tech Debt Evaluation

```
Use the lead-architect skill to evaluate technical debt in [AREA].

Expected output:
- Current architecture assessment
- Identified debt categories (schema, patterns, docs)
- Impact analysis (velocity, risk, maintainability)
- Remediation strategy with priority
- Migration approach (big-bang vs incremental)
```

### PRD Creation

```
Use the lead-architect skill to create a PRD for [SERVICE/FEATURE].

Current context: [Link to SRM section, relevant ADRs]

Expected output:
1. Architecture discovery (bounded context, dependencies)
2. PRD draft following PRD-STD-001
3. Related Documents linking SLAD, SRM, temporal patterns
4. Validation via scripts/validate_prd.py
5. Implementation plan with DoD
```

### Generate EXECUTION-SPEC (Pipeline Mode)

```
Use the lead-architect skill to generate an EXECUTION-SPEC for [PRD-ID].

Mode: generate-execution-spec

Input: PRD document at docs/10-prd/[PRD-ID].md

Expected output:
EXECUTION-SPEC document with:
1. YAML frontmatter (machine-parseable workstream definitions)
2. Workstream breakdown with agent assignments
3. Dependency graph (depends_on relationships)
4. Execution phases (parallelized where possible)
5. Validation gates per workstream
6. Human-readable context for each workstream

Output location: docs/20-architecture/specs/[PRD-ID]/EXECUTION-SPEC-[PRD-ID].md
```

**EXECUTION-SPEC Generation Workflow**:

1. **Read PRD** - Extract scope, features, DoD
2. **Identify Workstreams** - Break into DB/Service/Route/Hook/Test layers
3. **Assign Agents** - Map each workstream to capability agent
4. **Define Dependencies** - Establish depends_on relationships
5. **Parallelize Phases** - Group independent workstreams
6. **Set Gates** - Assign validation gate per workstream
7. **Output EXECUTION-SPEC** - Write to specs directory

**Template**: See `.claude/skills/prd-pipeline/references/execution-spec-template.md`

**Integration**: Called by `/prd-execute` command via `prd-pipeline` skill

## MVP Roadmap & Progress Tracking

### Canonical Implementation Baseline

**MVP-ROADMAP.md** (`docs/20-architecture/MVP-ROADMAP.md`) establishes the implementation baseline:

```
Phase 0: Horizontal Infrastructure (GATE-0) ← CURRENT BLOCKER
├── TransportLayer (withServerAction wrapper)
├── ErrorTaxonomy (domain errors → HTTP mapping)
├── ServiceResultPattern (ServiceResult<T>)
└── QueryInfra (React Query configuration)

Phase 1: Core Services (GATE-1)
├── CasinoService (PRD-000) ← Blocks ALL downstream
├── PlayerService (PRD-003)
└── VisitService (PRD-003) ← Enhanced with 3 archetypes (EXEC-VSE-001)

Phase 2: Session Management + UI (GATE-2)
├── TableContextService (PRD-006) ← REMOVED (rebuild when needed)
├── RatingSlipService (PRD-002) ← REMOVED (rebuild when needed)
└── PitDashboard (UI)

Phase 3: Rewards & Compliance (GATE-3)
├── LoyaltyService (PRD-004)
├── PlayerFinancialService (PRD-001)
└── MTLService (PRD-005)
```

**Key Decision**: HORIZONTAL-FIRST implementation order. No routes can be deployed until GATE-0 completes.

### Progress Tracking via Memori

MVP progress is tracked via `MVPProgressContext` in `lib/memori/mvp_progress_context.py`:

**Check Status**:
```bash
/mvp-status
```

**Record Service Completion** (after implementing a service):
```python
from lib.memori.mvp_progress_context import create_mvp_progress_context
ctx = create_mvp_progress_context()
ctx.record_service_completion(
    service_name="CasinoService",
    files_created=["services/casino/index.ts", "services/casino/dtos.ts"],
    test_coverage=90.0,
    implementation_notes="Temporal authority with compute_gaming_day"
)
```

**Record Milestone Transition**:
```python
ctx.record_milestone_transition(
    phase=0,
    status="completed",
    services_completed=["TransportLayer", "ErrorTaxonomy", "ServiceResultPattern", "QueryInfra"]
)
```

### Architecture Tasks Should Update Progress

When completing architectural work that advances the MVP:

1. **After PRD Creation**: Record PRD status
   ```python
   ctx.record_prd_status("PRD-000", "accepted", services_defined=["CasinoService"])
   ```

2. **After Implementation Plan**: If service is implemented, record completion
3. **After Gate Validation**: Record milestone transition

### Current MVP Status Reference

Always check current status before planning:
- **Memory file**: `memory/phase-status.memory.md`
- **Live query**: `/mvp-status` command
- **Roadmap**: `docs/20-architecture/MVP-ROADMAP.md`

| Phase | Status | Components |
|-------|--------|------------|
| 0 | **NOT STARTED** | TransportLayer, ErrorTaxonomy, ServiceResultPattern, QueryInfra |
| 1 | Blocked by Phase 0 | CasinoService, PlayerService, VisitService |
| 2 | Not Started (0/3) | TableContextService, RatingSlipService, PitDashboard |
| 3 | Not Started | LoyaltyService, PlayerFinancialService, MTLService |

**Critical Path**: GATE-0 → CasinoService → PlayerService → VisitService → PitDashboard → LoyaltyService

## Non-Goals

This skill does **not**:

- Implement detailed code line-by-line (defer to implementation agents)
- Decide business priorities or roadmap
- Own cost/budget (only call out likely impacts)
- Make architectural changes without documentation updates

## Guardrails

The skill should:

- Keep solutions **implementable** by a small team
- Preserve existing architectural contracts unless strong reason exists
- Prefer refactoring within current stack over rewrites
- Validate designs against OVER_ENGINEERING_GUARDRAIL.md
- Update documentation atomically with architecture changes
