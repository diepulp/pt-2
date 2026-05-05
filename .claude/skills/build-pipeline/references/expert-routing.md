# Expert Skill Routing

Domain-specific expert skills are consulted during EXECUTION-SPEC workstream design, not just execution. Each expert owns its own domain rules, patterns, and canonical citations — the pipeline does not inject governance context. If an expert scaffolds something non-compliant, the fix is in that expert's skill, not in this orchestrator.

For structured reasoning on complex workstreams, experts may use `mcp__sequential-thinking__sequentialthinking`; the pipeline does not mandate it.

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

build-pipeline routes each workstream to its domain expert for refinement:

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

When consulting an expert skill, provide the workstream skeleton and FIB-S reference (when loaded). The expert consults its own references for domain rules.

```markdown
**Expert Consultation Request**

PRD: {PRD_ID}
Workstream: {WS_ID} — {WS_NAME}
Type: {workstream_type}
Bounded Context: {bounded_context}
Service: {service_name}
Dependencies (completed): {completed_dependencies}
FIB-S: {fib_s_path if loaded, else "none"}

**Architectural Skeleton from lead-architect:**
{skeleton_details}

**Your Task:**
Refine this workstream with domain-specific detail using patterns from your skill:
1. Concrete outputs (files, types, tests) following PT-2 conventions
2. Patterns applied, with ADR/spec citations
3. Acceptance criteria and validation commands
4. Implementation notes that belong in the EXEC-SPEC

**Rules:**
- If the skeleton proposes a surface, API, workflow side-path, or domain DTO absent from FIB-S (when FIB-S is loaded), flag it — do not silently enrich. You are reviewer first, refiner second.
- If the skeleton is ambiguous ("X or Y", "Zustand or React state"), pick one and cite why. Do not echo alternatives.
- If the workstream would modify a table owned by another bounded context, flag the SRM violation.

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

## Integration with build-pipeline

### Phase 1 Flow

```
Phase 1: EXECUTION-SPEC Generation
  │
  ├─ Step 1: Resolve input + load FIB-S if present
  │
  ├─ Step 2: lead-architect → architectural scaffold
  │     Output: workstream skeletons (id, name, type, bounded_context, deps)
  │
  ├─ Step 3: Parallel expert consultation
  │     One Skill call per workstream (or per unique executor); no context
  │     injection — each expert consults its own references.
  │
  ├─ Step 4: Assemble final EXECUTION-SPEC (merge expert refinements)
  │
  ├─ Step 5: Structural + intake-traceability validation
  │     Run validate-execution-spec.py for YAML/DAG/executor/gate checks.
  │     Run FIB-S traceability audit if FIB-S loaded.
  │
  └─ Step 6: Initialize checkpoint, present to human for review
```

### Parallel Expert Consultation

Dispatch independent workstreams in a single message with multiple Skill calls. Each expert receives only the skeleton + FIB-S pointer; it consults its own references for domain rules.

```
SINGLE MESSAGE, multiple Skill calls:
  Skill("backend-service-builder", refine WS1, WS3)
  Skill("rls-expert",              refine WS2)
  Skill("api-builder",             refine WS4)
```

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Two-stage generation | Separates architectural decisions from domain expertise |
| lead-architect for scaffolding | Vertical slicing, bounded contexts are architectural concerns |
| Experts for refinement | Domain patterns, ADR compliance, PT-2 conventions |
| Parallel consultation | Independent workstream designs don't need sequencing |
| Experts own their own context | Orchestrator stays thin; canonical rules live once, in the domain skill |

---

## Executor Registry

All workstreams use Skills as executors.

### Skill Registry

| Skill | Domain | Use For |
|---|---|---|
| `lead-architect` | Architecture | EXECUTION-SPEC scaffolding, ADRs, SRM updates |
| `backend-service-builder` | Backend | DTOs, migrations, service factories, CRUD |
| `api-builder` | API | OpenAPI contracts, route handlers, middleware |
| `rls-expert` | Security | RLS policies, ADR-015/020/024/030 patterns, SECURITY DEFINER |
| `frontend-design-pt-2` | Frontend | React 19 components, Zustand stores, hooks |
| `e2e-testing` | Testing | Playwright E2E tests, TDD workflow |
| `qa-specialist` | Quality | Test coverage validation, quality gates |
| `performance-engineer` | Performance | Query optimization, SLOs, benchmarks |

Expert skills serve two roles in the pipeline: design consultation (Phase 1) and execution (Phase 3). No other executor types are dispatched by the pipeline.

> **ANTI-PATTERN**: `executor_type: skill` in the EXEC-SPEC YAML means "dispatch via the `Skill` tool" — it does NOT mean "pass the executor name as `subagent_type` to the `Agent` tool". The `Agent` tool's `subagent_type` parameter only accepts built-in types (`general-purpose`, `Explore`, `typescript-pro`). Project skill names are never valid `subagent_type` values.
> ```
> ✓ Skill(skill="qa-specialist", args="...")          ← correct
> ✗ Agent(subagent_type="qa-specialist", ...)         ← qa-specialist is not a built-in type
> ```

### Validation

Run the validation script before execution:

```bash
python .claude/skills/build-pipeline/scripts/validate-execution-spec.py \
    docs/21-exec-spec/EXEC-###-{slug}.md
```

The script validates `executor_type` is "skill", `executor` name is a valid skill, dependencies reference existing workstreams, and no circular dependencies exist.

---

## Related Documents

- `intake-traceability-protocol.md` — FIB-S enforcement at EXEC-SPEC generation
- `../lead-architect/SKILL.md` — Architectural scaffolding (owns SRM/SLAD knowledge)
- `../backend-service-builder/SKILL.md` — Backend domain (owns DTO/service/migration patterns)
- `../api-builder/SKILL.md` — API domain (owns route handler/OpenAPI patterns)
- `../rls-expert/SKILL.md` — RLS domain (owns SECURITY DEFINER/ADR-015/020/024/030 patterns)
- `../qa-specialist/SKILL.md` — Quality (owns coverage, ADR-044 test governance)
