---
name: prd-pipeline
description: Orchestrate PRD-to-Production implementation with gate approvals. Automates the workflow from PRD through EXECUTION-SPEC generation, phased workstream execution, validation gates, and MVP progress tracking. Use via /prd-execute command.
---

# PRD Pipeline Orchestrator

## Quick Start

**Entry point**: `/prd-execute PRD-003` command

```
references/
├── execution-spec-template.md   <- YAML + markdown template for workstreams
├── gate-protocol.md             <- Gate approval UX and state management
└── checkpoint-format.md         <- Resume state format (future)
```

---

## Overview

This skill automates the PRD-to-Production pipeline observed in successful implementations (PRD-HZ-001, PRD-000). It consolidates the 6-phase manual workflow into 4 automated phases:

```
Current (Manual):     Roadmap → PRD → SPEC → WORKFLOW → AUDIT → Execute → MVP Update
Automated (This):     Roadmap → PRD → EXECUTION-SPEC → Execute+Validate
```

**Key Design Decisions**:
- **Gate approval**: Pauses after each phase for human review
- **Preserve on failure**: Completed artifacts kept for manual fix and resume
- **Parallel execution**: Independent workstreams run concurrently

---

## Pipeline Phases

### Phase 1: EXECUTION-SPEC Generation

**Actor**: `lead-architect` skill (generate-execution-spec mode)
**Input**: PRD document path
**Output**: EXECUTION-SPEC with YAML frontmatter + markdown

```yaml
---
prd: PRD-003
service: PlayerService
phase: 1
workstreams:
  WS1:
    name: Database Layer
    agent: backend-service-builder
    depends_on: []
    outputs: [migration.sql, dtos.ts, schemas.ts]
    gate: schema-validation
  WS2:
    name: Service Layer
    agent: backend-service-builder
    depends_on: [WS1]
    outputs: [index.ts, keys.ts, http.ts]
    gate: type-check
execution_phases:
  - parallel: [WS1]
  - parallel: [WS2, WS3]
  - parallel: [WS4]
---
```

**Workflow**:
1. Read PRD document
2. Invoke lead-architect with `generate-execution-spec` mode
3. Output EXECUTION-SPEC to `docs/20-architecture/specs/{PRD-ID}/EXECUTION-SPEC-{PRD-ID}.md`

### Phase 2: Approval Gate

**Actor**: Human
**Input**: Generated EXECUTION-SPEC
**Output**: Approval to proceed or modifications

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION-SPEC Generated: PRD-003 (PlayerService)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Workstreams:
  WS1: Database Layer (backend-service-builder)
  WS2: Service Layer (backend-service-builder)
  WS3: Route Handlers (api-builder)
  WS4: Tests (backend-service-builder)

Execution Order:
  Phase 1: [WS1] (parallel)
  Phase 2: [WS2, WS3] (parallel)
  Phase 3: [WS4] (parallel)

Approve execution plan? [y/n/edit]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Phase 3: Phased Execution

For each execution phase:

1. **Parse workstreams** - Extract from EXECUTION-SPEC YAML
2. **Spawn capability agents** - Delegate to appropriate skill:
   - `backend-service-builder` for DB/Service workstreams
   - `api-builder` for Route workstreams
   - `frontend-design` for UI workstreams (future)
3. **Run validation gate** - Execute gate command after workstream
4. **Pause for approval** - Human reviews artifacts before next phase

**Agent Delegation Pattern**:
```
For each workstream in current_phase:
  1. Invoke Task tool with appropriate subagent_type
  2. Provide workstream context from EXECUTION-SPEC
  3. Collect outputs and validate
  4. Record progress to MVPProgressContext
```

### Phase 4: Completion

After all phases complete:

1. **Update MVP-ROADMAP.md** - Mark PRD as complete
2. **Record to Memori** - Via MVPProgressContext
3. **Generate summary** - Files created, tests passing, gates passed

---

## Workstream Execution

### Delegation to Capability Agents

Each workstream delegates to a specialized agent:

| Workstream Type | Agent | Skill |
|-----------------|-------|-------|
| Database Layer | backend-service-builder | Migration, RLS, types |
| Service Layer | backend-service-builder | Factory, DTOs, keys |
| Route Handlers | api-builder | Routes with middleware |
| React Query Hooks | backend-service-builder | Query/mutation hooks |
| Tests | backend-service-builder | Unit + integration tests |
| UI Components | frontend-design | React components (future) |

### Agent Prompt Template

```markdown
Execute workstream {WS_ID} for {PRD_ID}:

**Workstream**: {WS_NAME}
**Outputs Required**: {OUTPUTS}
**Dependencies Completed**: {COMPLETED_WS}

Context from EXECUTION-SPEC:
{WORKSTREAM_DETAILS}

Follow the {SKILL} workflow to produce the required outputs.
Validate against the gate: {GATE_TYPE}
```

---

## Gate Approval Protocol

See `references/gate-protocol.md` for full specification.

### Gate Types

| Gate | Validation | Command |
|------|------------|---------|
| `schema-validation` | Types generate without error | `npm run db:types` |
| `type-check` | No TypeScript errors | `npm run type-check` |
| `lint` | ESLint passes | `npm run lint` |
| `test-pass` | All tests pass | `npm test {path}` |
| `build` | Build succeeds | `npm run build` |

### Approval UX

After each phase:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Phase 2 Complete: Service Layer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Created:
  - services/player/index.ts
  - services/player/dtos.ts
  - services/player/keys.ts
  - services/player/http.ts

Validation: ✅ Type check passed (0 errors)

Next: Phase 3 (Route Handlers)
  - WS3: POST/GET/PATCH /api/v1/players routes

Continue? [y/n/inspect]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## State Management

### Checkpoint on Gate

After each successful gate, save state:

```json
{
  "prd": "PRD-003",
  "current_phase": 2,
  "completed_workstreams": ["WS1", "WS2"],
  "pending_workstreams": ["WS3", "WS4"],
  "artifacts": {
    "WS1": ["supabase/migrations/xxx.sql", "services/player/dtos.ts"],
    "WS2": ["services/player/index.ts", "services/player/keys.ts"]
  },
  "timestamp": "2025-11-29T19:00:00Z"
}
```

**Location**: `.claude/skills/prd-pipeline/checkpoints/{PRD-ID}.json`

### Resume from Checkpoint

When invoked with `--resume`:

1. Load checkpoint file
2. Display completed vs pending workstreams
3. Continue from next pending phase

---

## Integration Points

| Primitive | Role in Pipeline |
|-----------|------------------|
| `lead-architect` | Generates EXECUTION-SPEC from PRD |
| `backend-service-builder` | Executes DB/Service/Test workstreams |
| `api-builder` | Executes Route Handler workstreams |
| `/validation-gate` | Runs validation commands |
| `MVPProgressContext` | Records service completion |
| `/mvp-status` | Final status display |

---

## Error Handling

### Workstream Failure

If a workstream fails:

1. **Log failure** - Record error in checkpoint
2. **Preserve artifacts** - Keep completed work
3. **Display error** - Show what failed and why
4. **Suggest fix** - If error is recognizable, suggest resolution
5. **Pause** - Wait for human intervention

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ Phase 2 Failed: Service Layer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Error in WS2 (Service Layer):
  Type error in services/player/index.ts:45
  Property 'player_id' does not exist on type 'PlayerDTO'

Completed:
  - WS1: Database Layer ✅

Preserved artifacts:
  - supabase/migrations/xxx.sql
  - services/player/dtos.ts

Suggested fix:
  Check that dtos.ts includes 'player_id' in Pick<> fields

Resume after fix: /prd-execute PRD-003 --resume
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Example Execution

### Fresh Execution

```
User: /prd-execute PRD-003

Pipeline: Loading PRD-003 (Player/Visit Services)...

[Phase 1: EXECUTION-SPEC Generation]
Invoking lead-architect to generate execution plan...
Created: docs/20-architecture/specs/PRD-003/EXECUTION-SPEC-PRD-003.md

[Gate: Approve EXECUTION-SPEC?]
... displays workstreams and execution order ...
User: y

[Phase 2: Database Layer - WS1]
Delegating to backend-service-builder...
Created: migration, dtos.ts, schemas.ts
Validation: npm run db:types ✅

[Gate: Phase 1 Complete]
... displays artifacts ...
User: y

[Phase 3: Service Layer - WS2, WS3]
Delegating to backend-service-builder (WS2)...
Delegating to api-builder (WS3)...
... parallel execution ...
Validation: npm run type-check ✅

[Gate: Phase 2 Complete]
... displays artifacts ...
User: y

[Phase 4: Tests - WS4]
Delegating to backend-service-builder...
Created: *.test.ts, *.integration.test.ts
Validation: npm test services/player/ ✅

[Completion]
PRD-003 implementation complete!
Updated: MVP-ROADMAP.md
Recorded: MVPProgressContext (PlayerService, VisitService)
```

### Resume Execution

```
User: /prd-execute PRD-003 --resume

Pipeline: Loading checkpoint for PRD-003...

Status:
  Completed: WS1 (Database), WS2 (Service)
  Pending: WS3 (Routes), WS4 (Tests)
  Last gate: Phase 2

Resuming from Phase 3...

[Phase 3: Route Handlers - WS3]
...
```

---

## Resources

### Reference Documents

| File | Purpose |
|------|---------|
| `references/execution-spec-template.md` | YAML + markdown template |
| `references/gate-protocol.md` | Gate approval UX specification |

### Related Skills

| Skill | When Used |
|-------|-----------|
| `lead-architect` | EXECUTION-SPEC generation |
| `backend-service-builder` | DB/Service/Test workstreams |
| `api-builder` | Route handler workstreams |
| `frontend-design` | UI workstreams (future) |

### Commands

| Command | Purpose |
|---------|---------|
| `/prd-execute` | Entry point for this pipeline |
| `/mvp-status` | Check MVP progress |
| `/validation-gate` | Manual gate validation |
