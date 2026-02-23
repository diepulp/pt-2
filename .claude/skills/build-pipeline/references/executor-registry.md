# Executor Registry

This document defines the complete mapping of workstream types to executors for the build pipeline.

---

## Sequential Thinking Requirement

**CRITICAL**: All EXECUTION-SPEC development MUST leverage the `mcp__sequential-thinking__sequentialthinking` tool.

### When to Use Sequential Thinking

| Phase | Required | Purpose |
|-------|----------|---------|
| Phase 1: Scaffolding | **YES** | Vertical slice decomposition, dependency analysis |
| Phase 1: Expert Consultation | **YES** | Domain pattern selection, output planning |
| Phase 3: Workstream Execution | Recommended | Complex implementation decisions |

### Invocation Pattern

During EXECUTION-SPEC generation, invoke sequential thinking for:

```
1. Analyzing PRD requirements → workstream decomposition
2. Determining bounded context ownership
3. Planning phase ordering and dependencies
4. Selecting domain-specific patterns (ADRs, standards)
5. Validating completeness before output
```

**Example invocation:**
```
mcp__sequential-thinking__sequentialthinking(
    thought="Analyzing PRD-XXX: Identify vertical slices...",
    thoughtNumber=1,
    totalThoughts=5,
    nextThoughtNeeded=true
)
```

This ensures structured reasoning and reduces errors in complex multi-workstream specs.

---

## Expert Skills: Design vs Execution

Expert skills serve **two roles** in the pipeline:

| Role | When | Purpose |
|------|------|---------|
| **Design Consultation** | Phase 1 (Stage 2) | Refine workstream specifications with domain expertise |
| **Execution** | Phase 3 | Implement the workstream |

See `expert-routing.md` for the design consultation protocol.

---

## Executor Type: Skills Only

**All workstreams use Skills as executors.** Task agents are deprecated for pipeline execution.

### Invocation

```
Skill(skill="skill-name", args="Execute workstream WS1 for PRD-XXX...")
```

### Rationale for Deprecating Task Agents

| Concern | Task Agents | Skills |
|---------|-------------|--------|
| PT-2 context | Generic, no project knowledge | PT-2 patterns baked in |
| ADR compliance | Must be prompted each time | Built into skill workflow |
| Consistency | Variable output quality | Standardized outputs |
| Domain expertise | Generalist | Domain-specific |

---

## Skill Registry

| Skill Name | Domain | Use For |
|------------|--------|---------|
| `backend-service-builder` | Backend | DTOs, migrations, service factories, CRUD |
| `api-builder` | API | OpenAPI contracts, route handlers, middleware |
| `rls-expert` | Security | RLS policies, ADR-015/020 patterns, SECURITY DEFINER |
| `frontend-design-pt-2` | Frontend | React 19 components, Zustand stores, hooks |
| `e2e-testing` | Testing | Playwright E2E tests, TDD workflow |
| `qa-specialist` | Quality | Test coverage validation, quality gates |
| `performance-engineer` | Performance | Query optimization, SLOs, benchmarks |
| `lead-architect` | Architecture | EXECUTION-SPEC scaffolding, ADRs, SRM updates |
| `devils-advocate` | Review | Adversarial EXEC-SPEC review, P0-P3 findings |

---

## Workstream → Skill Mapping

### Backend Workstreams

| Workstream Type | Skill |
|-----------------|-------|
| Database Layer | `backend-service-builder` |
| Service Layer | `backend-service-builder` |
| Route Handlers | `api-builder` |
| RLS Policies | `rls-expert` |

### Frontend Workstreams

| Workstream Type | Skill |
|-----------------|-------|
| Zustand Stores | `frontend-design-pt-2` |
| Selector Hooks (useShallow) | `frontend-design-pt-2` |
| React Query Hooks | `frontend-design-pt-2` |
| React 19 Components | `frontend-design-pt-2` |
| Modal Integration (useTransition) | `frontend-design-pt-2` |

### Testing Workstreams

| Workstream Type | Skill |
|-----------------|-------|
| Unit Tests | `backend-service-builder` (for service tests) or `frontend-design-pt-2` (for component tests) |
| Integration Tests | `backend-service-builder` |
| E2E Tests | `e2e-testing` |
| Quality Gates | `qa-specialist` |

### Cross-Cutting Workstreams

| Workstream Type | Skill |
|-----------------|-------|
| Performance Analysis | `performance-engineer` |
| Architecture Planning | `lead-architect` |
| Adversarial Review | `devils-advocate` |

---

## Deprecated: Task Agents

**DO NOT USE** task agents (`typescript-pro`, `general-purpose`, `Explore`, `Plan`) as workstream executors.

Task agents remain available for:
- Ad-hoc exploration outside pipeline (`Explore`)
- One-off investigations (`general-purpose`)

But within the build pipeline, **all workstreams must use Skills**.

### Migration Guide

| Old (Deprecated) | New (Required) |
|------------------|----------------|
| `typescript-pro` for Zustand | `frontend-design-pt-2` |
| `typescript-pro` for unit tests | `backend-service-builder` or `frontend-design-pt-2` |
| `typescript-pro` for React Query | `frontend-design-pt-2` |
| `Plan` for architecture | `lead-architect` |

---

## Validation

Run the validation script before execution:

```bash
python .claude/skills/build-pipeline/scripts/validate-execution-spec.py \
    docs/20-architecture/specs/PRD-XXX/EXECUTION-SPEC-PRD-XXX.md
```

The script validates:
- `executor_type` is "skill" (task-agent will warn as deprecated)
- `executor` name is a valid skill
- Dependencies reference existing workstreams
- No circular dependencies
