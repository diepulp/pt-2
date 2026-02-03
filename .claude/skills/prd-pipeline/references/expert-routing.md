# Expert Skill Routing

Domain-specific expert skills should be consulted during EXECUTION-SPEC workstream design, not just execution.

**CRITICAL**: All expert consultations MUST include governance context injection (see Context Injection Protocol below).

---

## Context Injection Protocol (REQUIRED)

Before routing to any expert, load these context files:

```
context/architecture.context.md  # SRM ownership, DTO patterns, bounded context rules
context/governance.context.md    # Service template, migration standards, test locations
context/quality.context.md       # Test strategy, coverage targets, quality gates
```

### Context Extraction by Domain

| Expert Skill | Required Context Sections |
|--------------|---------------------------|
| `backend-service-builder` | SRM ownership, DTO patterns (Pattern A vs Canonical), migration standards |
| `rls-expert` | RLS same-migration rule, SEC-003 role taxonomy, SECURITY DEFINER/INVOKER |
| `api-builder` | Route handler standards, OpenAPI conventions, ServiceHttpResult |
| `frontend-design-pt-2` | Component patterns, test location, state management (ADR-003) |
| `qa-specialist` | Coverage targets (≥90%), test naming (*.int.test.ts), quality gates |

---

## Sequential Thinking Requirement

**All expert consultations MUST use `mcp__sequential-thinking__sequentialthinking`** to ensure structured reasoning.

Each expert skill should invoke sequential thinking when:
- Analyzing workstream requirements
- Selecting domain-specific patterns
- Planning outputs and validation criteria

This is **mandatory** for Phase 1 (EXECUTION-SPEC generation) and **recommended** for Phase 3 (execution).

---

## The Problem

**Before (sub-par pattern):**
```
PRD → lead-architect designs ALL workstreams → experts execute
```

lead-architect is a generalist. When it designs API, RLS, or frontend workstreams without domain expertise, the resulting specifications lack:
- Domain-specific patterns (e.g., ADR-015 RLS patterns)
- PT-2 conventions (e.g., DTO canonical standard)
- Current best practices (e.g., React 19 useTransition patterns)

---

## The Solution: Two-Stage Generation

### Stage 1: Architectural Scaffolding (lead-architect)

lead-architect focuses on **what it does best**:

| Responsibility | Output |
|----------------|--------|
| Vertical slice identification | Which features/flows to implement |
| Bounded context ownership | Which service owns what |
| Phase ordering | Dependencies, parallel vs sequential |
| Gate requirements | Validation checkpoints |
| Workstream skeleton | ID, name, type, dependencies |

**Output format** (skeleton only):

```yaml
workstreams:
  WS1:
    name: Database Schema
    type: database
    bounded_context: rating-slip-service
    dependencies: []
    # NOTE: Details to be refined by backend-service-builder

  WS2:
    name: RLS Policies
    type: rls
    bounded_context: rating-slip-service
    dependencies: [WS1]
    # NOTE: Details to be refined by rls-expert
```

### Stage 2: Expert Consultation (domain skills)

prd-pipeline routes each workstream to its domain expert for refinement:

```
For each workstream in skeleton:
  1. Identify domain type
  2. Invoke expert skill with workstream context
  3. Expert returns enriched workstream specification
  4. Merge into final EXECUTION-SPEC
```

---

## Domain → Expert Skill Mapping

### Backend Domain

| Workstream Type | Expert Skill | Consult For |
|-----------------|--------------|-------------|
| `database` | `backend-service-builder` | Migration patterns, DTO design, type generation |
| `service-layer` | `backend-service-builder` | Service factory patterns, CRUD operations, selects |
| `rls` | `rls-expert` | ADR-015/020 patterns, policy design, SECURITY DEFINER |
| `route-handlers` | `api-builder` | OpenAPI contracts, ServiceHttpResult, middleware |

### Frontend Domain

| Workstream Type | Expert Skill | Consult For |
|-----------------|--------------|-------------|
| `react-components` | `frontend-design-pt-2` | React 19 patterns, PT-2 layout conventions |
| `zustand-stores` | `frontend-design-pt-2` | Store design, devtools middleware, ADR-003 |
| `react-query-hooks` | `frontend-design-pt-2` | Query/mutation patterns, cache invalidation |
| `modal-integration` | `frontend-design-pt-2` | useTransition patterns, optimistic updates |

### Testing Domain

| Workstream Type | Expert Skill | Consult For |
|-----------------|--------------|-------------|
| `e2e-tests` | `e2e-testing` | Playwright patterns, TDD workflow |
| `unit-tests` | `backend-service-builder` (service) or `frontend-design-pt-2` (component) | Jest/RTL patterns, mocking strategies |
| `rls-tests` | `rls-expert` | Policy testing, multi-tenant scenarios |

### Cross-Cutting

| Workstream Type | Expert Skill | Consult For |
|-----------------|--------------|-------------|
| `performance` | `performance-engineer` | SLOs, query optimization, benchmarks |
| `quality-gates` | `qa-specialist` | Coverage validation, critical paths |

---

## Expert Consultation Protocol

### Invocation Pattern

When consulting an expert skill, provide this context WITH governance context injection:

```markdown
**Expert Consultation Request**

PRD: {PRD_ID}
Workstream: {WS_ID} - {WS_NAME}
Type: {workstream_type}
Bounded Context: {bounded_context}
Service: {service_name}
Dependencies: {completed_dependencies}

**Architectural Skeleton from lead-architect:**
{skeleton_details}

**GOVERNANCE CONTEXT (MUST COMPLY):**

From architecture.context.md:
- SRM Ownership: {service} owns {tables}. DO NOT modify tables owned by other services.
- DTO Pattern: {Pattern A if bounded context, Canonical if thin CRUD}
- Cross-context: Only consume published DTOs/views, no direct table access

From governance.context.md:
- Test Location: __tests__/services/{domain}/ (NOT services/{domain}/__tests__/)
- Test Naming: *.int.test.ts (NOT *.integration.test.ts)
- Migration Standard: RLS policies in SAME migration as schema changes
- Lint Gate: max-warnings=0 (no warnings allowed)

From quality.context.md:
- Coverage Target: ≥90% for service modules
- Schema Gate: Run schema-verification test for schema changes

**Your Task:**
Refine this workstream specification with domain-specific details:
1. Detailed outputs (files, types, tests) - MUST follow governance locations
2. Patterns to apply (cite ADRs, standards)
3. Validation criteria - MUST meet coverage and gate requirements
4. Implementation hints

⚠️ GOVERNANCE COMPLIANCE IS MANDATORY. Non-compliant outputs will fail validation.

Return enriched workstream YAML.
```

### Response Format

Expert returns enriched specification:

```yaml
WS2:
  name: RLS Policies
  type: rls
  bounded_context: rating-slip-service
  executor: rls-expert
  executor_type: skill
  dependencies: [WS1]

  # Expert-added details
  outputs:
    - supabase/migrations/YYYYMMDDHHMMSS_ws2_rls_policies.sql
    - docs/30-security/rls/rating-slip-policies.md

  patterns:
    - ADR-015 Pattern C (hybrid context injection)
    - SECURITY DEFINER for cross-tenant operations

  validation:
    - npm run db:types exits 0
    - RLS policy tests pass
    - No direct table access without policy

  implementation_hints:
    - Use app.set_config for context injection
    - Add JWT fallback for edge cases
    - Test with multiple casino_ids
```

---

## Integration with prd-pipeline

### Updated Phase 1 Flow

```
Phase 1: EXECUTION-SPEC Generation
  │
  ├─ Step 0: Load Governance Context (REQUIRED)
  │     Load: architecture.context.md, governance.context.md, quality.context.md
  │
  ├─ Step 1: Read PRD
  │
  ├─ Step 2: lead-architect → Architectural Scaffold (with SRM ownership check)
  │     Output: Workstream skeletons with types and dependencies
  │
  ├─ Step 3: Expert Consultation (parallel where possible)
  │     For each workstream:
  │       - Route to domain expert WITH governance context
  │       - Expert refines with compliance constraints
  │       - Collect enriched specification
  │
  ├─ Step 4: Assemble Final EXECUTION-SPEC
  │     Merge expert refinements into complete spec
  │
  ├─ Step 5: Validate (Structural + Governance)
  │     Run validate-execution-spec.py
  │     Checks: YAML syntax, executors, SRM ownership, test locations, gates
  │
  └─ Step 6: Initialize Checkpoint
```

### Parallel Expert Consultation

When workstreams have no dependencies on each other's design:

```
┌────────────────────────────────────────────────────────────────┐
│ SINGLE MESSAGE with MULTIPLE Skill invocations + CONTEXT:      │
├────────────────────────────────────────────────────────────────┤
│ Skill 1: backend-service-builder (refine WS1, WS3 + context)   │
│ Skill 2: rls-expert (refine WS2 + context)                     │
│ Skill 3: api-builder (refine WS4 + context)                    │
└────────────────────────────────────────────────────────────────┘

Each skill receives:
- Workstream skeleton from lead-architect
- Governance context (SRM ownership, test locations, coverage targets)
- Service-specific rules (DTO pattern, migration standards)
```

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Two-stage generation | Separates architectural decisions from domain expertise |
| lead-architect for scaffolding | Vertical slicing, bounded contexts are architectural concerns |
| Experts for refinement | Domain patterns, ADR compliance, PT-2 conventions |
| Parallel consultation | Independent workstream designs don't need sequencing |
| **Context injection** | **Prevents governance violations by providing rules at consultation time** |
| **Deterministic validation** | **Context files are source of truth, not historical patterns** |

---

## Related Documents

- `executor-registry.md` - Complete executor mapping
- `context/architecture.context.md` - SRM ownership, DTO patterns
- `context/governance.context.md` - Test locations, migration standards
- `context/quality.context.md` - Coverage targets, quality gates
- `../lead-architect/SKILL.md` - Architectural scaffolding role
- `../backend-service-builder/SKILL.md` - Backend domain expertise
- `../api-builder/SKILL.md` - API domain expertise
- `../rls-expert/SKILL.md` - RLS domain expertise
