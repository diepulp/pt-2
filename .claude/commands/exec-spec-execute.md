---
description: Execute an existing EXEC-SPEC through workstream agents with parallel execution
arguments:
  - name: spec-id
    description: EXEC-SPEC identifier (e.g., EXEC-SPEC-022) or --resume to continue from checkpoint
---

# EXEC-SPEC Execution Pipeline

Execute an existing EXEC-SPEC (from feature-pipeline Phase 5) through workstream agents with parallel execution and gate validation.

## Invocation

```
/exec-spec-execute EXEC-SPEC-022
/exec-spec-execute EXEC-SPEC-022 --resume
```

## Arguments

- `$ARGUMENTS` - EXEC-SPEC identifier or `--resume` to continue from checkpoint

## Prerequisites

The EXEC-SPEC must have YAML frontmatter defining workstreams:

```yaml
---
spec: EXEC-SPEC-022
feature: player-identity-enrollment
service: PlayerService
workstreams:
  WS1:
    name: Database Layer
    executor: backend-service-builder
    depends_on: []
    outputs: [migration files]
    gate: schema-validation
  WS2:
    name: Service Layer
    executor: backend-service-builder
    depends_on: [WS1]
    outputs: [*.ts files]
    gate: type-check
execution_phases:
  - parallel: [WS1]
  - parallel: [WS2, WS3]
---
```

## Action

### Step 1: Locate EXEC-SPEC

Search for the spec file:
```
docs/20-architecture/specs/**/EXEC-SPEC-$ARGUMENTS.md
docs/20-architecture/specs/**/$ARGUMENTS.md
```

If `$ARGUMENTS` is `--resume`:
- Find most recent checkpoint in `.claude/skills/feature-pipeline/checkpoints/`
- Load the checkpoint and continue from `current_workstream`

### Step 2: Parse YAML Frontmatter

Extract from the EXEC-SPEC:
- `spec`: Identifier
- `feature`: Feature name (for checkpoint naming)
- `service`: Primary service context
- `workstreams`: Workstream definitions
- `execution_phases`: Parallel execution order
- `dod_file`: Path to DoD gate checklist (optional)

### Step 3: Initialize Checkpoint

Create checkpoint at `.claude/skills/feature-pipeline/checkpoints/{feature}.json`:

```json
{
  "spec": "EXEC-SPEC-022",
  "feature": "player-identity-enrollment",
  "current_phase": 0,
  "status": "executing",
  "completed_workstreams": [],
  "in_progress_workstreams": [],
  "pending_workstreams": ["WS1", "WS2", "WS3", "WS4"],
  "artifacts": {},
  "gates_passed": [],
  "gates_pending": ["schema-validation", "type-check", "lint", "test-pass"],
  "timestamp": "<ISO timestamp>"
}
```

### Step 4: Execute Phases (Skill Dispatch)

**BLOCKING REQUIREMENT**: Each workstream MUST be dispatched to its executor
skill via the `Skill` tool. DO NOT implement workstreams inline.

Workstreams in the same phase MUST be dispatched in a **SINGLE message** using
multiple `Skill` tool calls for parallel execution.

For each execution phase:

#### 4a. Display Phase Start

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Executing Phase {N}: {workstream names}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Workstreams:
  {WS_ID}: {name} → {executor}
  {WS_ID}: {name} → {executor}

Dispatching to executor skills...
```

#### 4b. Dispatch via Skill Tool (Parallel)

**IN A SINGLE MESSAGE**, dispatch ALL workstreams for this phase:

```
┌─────────────────────────────────────────────────────────────────┐
│ SINGLE MESSAGE — multiple Skill tool calls:                     │
├─────────────────────────────────────────────────────────────────┤
│ Skill(skill="{executor from WS1}", args="Execute WS1...")       │
│ Skill(skill="{executor from WS2}", args="Execute WS2...")       │
└─────────────────────────────────────────────────────────────────┘
```

#### 4c. Workstream Prompt Template

Each `Skill` call MUST use this template for the `args` parameter:

```
Execute workstream {WS_ID} for {feature}:

**Workstream**: {name}
**Service Context**: {service}
**Required Outputs**: {outputs}
**Dependencies Completed**: {completed_workstreams}

## EXEC-SPEC Section

{Extract relevant section from EXEC-SPEC based on workstream name}

## Constraints

- Follow PT-2 patterns from `docs/70-governance/`
- Use types from `types/database.types.ts`
- Run validation: {gate command}

## Expected Files

{List expected output files}
```

#### 4d. Run Gate Validation

After ALL workstreams in phase complete:

```bash
# Gate validation commands
schema-validation: npm run db:types
type-check: npm run type-check
lint: npm run lint
test-pass: npm test -- -t "{feature pattern}"
```

### Step 5: Phase Approval Gate

After each phase:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Phase {N} Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Completed Workstreams:
  ✅ WS1: Database Layer
  ✅ WS2: Service Layer

Artifacts Created:
  - supabase/migrations/xxx.sql
  - services/player/identity.ts

Validation: ✅ {gate} passed

Next Phase: {N+1} ({workstream names})

Continue? [y/n/inspect]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 6: DoD Gate Validation (Final)

If `dod_file` is specified, run all DoD gates:

```bash
# From DOD-022.md
npm test -- -t "ADR-022"
npm run type-check
npm run lint
npm run build
```

### Step 7: Completion

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ EXEC-SPEC Execution Complete: {spec}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Feature: {feature}
Service: {service}

Workstreams Completed:
  ✅ WS1: Database Layer
  ✅ WS2: Service Layer
  ✅ WS3: UI Components
  ✅ WS4: RLS Tests

Gates Passed:
  ✅ schema-validation
  ✅ type-check
  ✅ lint
  ✅ test-pass

DoD Status: {PASS | requires manual verification}

Artifacts:
  {list all created files}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Executor Skill Mapping

All workstreams use Skills. Task agents are deprecated for pipeline execution.

| Workstream Type | Skill (exact `skill=` value) | Capability |
|-----------------|------------------------------|------------|
| Database Layer | `backend-service-builder` | Migrations, RLS, types |
| Service Layer | `backend-service-builder` | Factory, DTOs, CRUD |
| Route Handlers | `api-builder` | Routes with middleware |
| UI Components | `frontend-design-pt-2` | React 19 components |
| RLS/Security | `rls-expert` | RLS policies, tests |
| Unit Tests (service) | `backend-service-builder` | Unit + integration |
| Unit Tests (component) | `frontend-design-pt-2` | RTL + Jest |
| E2E Tests | `e2e-testing` | Playwright |
| Quality Gates | `qa-specialist` | Coverage validation |

## Error Handling

On workstream failure:
1. Log error in checkpoint
2. Preserve completed artifacts
3. Display error with suggested fix
4. Pause for intervention

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ Workstream Failed: WS2 (Service Layer)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Error: Type error in services/player/identity.ts:45

Completed:
  ✅ WS1: Database Layer

Suggested Fix:
  Check that PlayerIdentityDTO includes all required fields

Resume after fix: /exec-spec-execute --resume
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## References

- Feature pipeline skill: `.claude/skills/feature-pipeline/SKILL.md`
- PRD pipeline (parallel execution pattern): `.claude/skills/prd-pipeline/SKILL.md`
- DoD template: `.claude/skills/feature-pipeline/references/dod-gate-template.md`
