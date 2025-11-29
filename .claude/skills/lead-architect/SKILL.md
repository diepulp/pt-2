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
- **Check implementation reality**: Review `SERVICE_TEMPLATE.md` for deployed vs. planned constraints
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
- Ensure compatibility with PT-2 tech stack (Next.js, Supabase, React 19)
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

## PT-2 Specific Constraints

Validate against these PT-2 standards:

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

- Class-based services
- `ReturnType<typeof createXService>`
- Global real-time managers
- `console.*` in production code
- `as any` type casting
- Over-engineered abstractions

Reference: `@memory/anti-patterns.memory.md`

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
- [ ] Add RLS policies: [policy names]
- [ ] Update API routes: [routes]

### Frontend
- [ ] Update types: `npm run db:types`
- [ ] Implement UI components: [component paths]
- [ ] Add client-side validation
- [ ] Integrate with service layer

### Testing (per QA-001 + QA-004)
- [ ] Schema verification test passes
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
| `output-templates.md` | Templates for SRM, ADR, API specs |
| `example-architectures.md` | Reference examples |
| `memory-protocol.md` | Memory recording (optional) |
| `context-management.md` | Session continuity |

### Source Documents (docs/)

| Document | Location |
|----------|----------|
| SLAD (patterns) | `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` |
| SRM (boundaries) | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` |
| SERVICE_TEMPLATE | `docs/70-governance/SERVICE_TEMPLATE.md` |
| SDLC Taxonomy | `docs/SDLC_DOCS_TAXONOMY.md` |
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
