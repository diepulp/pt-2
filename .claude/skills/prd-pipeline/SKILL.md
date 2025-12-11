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
└── checkpoint-format.md         <- Checkpoint state management (required)

checkpoints/
└── {PRD-ID}.json                <- Active checkpoint files
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
4. **Initialize checkpoint file** immediately after EXECUTION-SPEC generation (see Checkpoint Initialization below)

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
2. **Spawn capability agents IN PARALLEL** - See Parallel Agent Spawning section
3. **Update checkpoint** - After each workstream completes
4. **Run validation gate** - Execute gate command after phase completes
5. **Pause for approval** - Human reviews artifacts before next phase

---

## CRITICAL: Parallel Agent Spawning

**REQUIREMENT**: Workstreams marked as `parallel` in execution_phases MUST be spawned using multiple Task tool calls in a SINGLE message. This is the ONLY way to achieve concurrent execution.

### Correct Pattern (Parallel)

When a phase has `parallel: [WS2, WS3]`, spawn BOTH agents in ONE message with `run_in_background: true`:

```text
┌─────────────────────────────────────────────────────────────────┐
│ SINGLE MESSAGE containing MULTIPLE Task tool invocations:      │
├─────────────────────────────────────────────────────────────────┤
│ Task 1:                                                         │
│   subagent_type: "backend-developer"                            │
│   description: "WS2: Service Layer"                             │
│   prompt: "Execute workstream WS2 for PRD-003..."               │
│   run_in_background: true                                       │
├─────────────────────────────────────────────────────────────────┤
│ Task 2:                                                         │
│   subagent_type: "api-expert"                                   │
│   description: "WS3: Route Handlers"                            │
│   prompt: "Execute workstream WS3 for PRD-003..."               │
│   run_in_background: true                                       │
└─────────────────────────────────────────────────────────────────┘
```

### WRONG Pattern (Sequential - DO NOT USE)

Do NOT spawn agents one-at-a-time in separate messages:

```text
❌ WRONG:
   Message 1: Task(WS2) → wait for result
   Message 2: Task(WS3) → wait for result

✅ CORRECT:
   Message 1: Task(WS2, background=true) + Task(WS3, background=true)
   Then: TaskOutput(WS2_id, block=true) + TaskOutput(WS3_id, block=true)
```

### Agent Type Mapping

| Workstream Type | subagent_type |
|-----------------|---------------|
| Database Layer | backend-developer |
| Service Layer | backend-developer |
| Route Handlers | api-expert |
| React Query Hooks | backend-developer |
| Tests | backend-developer |
| UI Components | pt2-frontend-implementer |

### Background Execution Workflow

1. **Launch phase agents** - All parallel workstreams in ONE message with `run_in_background: true`
2. **Collect results** - Use `TaskOutput` tool with task IDs to wait for completion
3. **Update checkpoint** - After each result arrives, update checkpoint file
4. **Validate** - Run gate validation after ALL parallel workstreams complete

```python
# Pseudo-code for parallel phase execution
phase = execution_phases[current_phase]

# Step 1: Launch all workstreams in parallel (SINGLE message)
task_ids = []
for ws_id in phase.parallel:
    ws = workstreams[ws_id]
    task_id = Task(
        subagent_type=AGENT_MAP[ws.agent],
        description=f"{ws_id}: {ws.name}",
        prompt=build_workstream_prompt(ws),
        run_in_background=True
    )
    task_ids.append((ws_id, task_id))

# Step 2: Collect results (can also be parallel TaskOutput calls)
for ws_id, task_id in task_ids:
    result = TaskOutput(task_id, block=True)
    update_checkpoint(prd_id, ws_id, result.artifacts)

# Step 3: Run gate validation
run_validation_gates(phase.gates)
```

### Phase 4: Completion

After all phases complete:

1. **Update MVP-ROADMAP.md** - Mark PRD as complete
2. **Record to Memori** - Via MVPProgressContext
3. **Generate summary** - Files created, tests passing, gates passed

---

## Workstream Execution

### Delegation to Capability Agents

Each workstream delegates to a specialized agent. Use the `subagent_type` values below with the Task tool:

| Workstream Type | subagent_type | Capability |
|-----------------|---------------|------------|
| Database Layer | `backend-developer` | Migration, RLS, types |
| Service Layer | `backend-developer` | Factory, DTOs, keys |
| Route Handlers | `api-expert` | Routes with middleware |
| React Query Hooks | `backend-developer` | Query/mutation hooks |
| Tests | `backend-developer` | Unit + integration tests |
| UI Components | `pt2-frontend-implementer` | React components |

**Available Agent Types** (for reference):
- `backend-developer` - Lightweight backend implementation
- `api-expert` - API endpoints, Route Handlers, DTOs
- `pt2-frontend-implementer` - React/Next.js UI components
- `pt2-service-implementer` - Full-stack bounded context services
- `rls-security-specialist` - RLS policies, security

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

### CRITICAL: Checkpoint Initialization

**REQUIREMENT**: A checkpoint file MUST be created immediately after EXECUTION-SPEC generation, BEFORE any workstreams execute. Do not defer checkpoint creation.

### Checkpoint Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. EXECUTION-SPEC Generated                                     │
│    └─> CREATE checkpoint file with all workstreams "pending"    │
├─────────────────────────────────────────────────────────────────┤
│ 2. Each Workstream Completes                                    │
│    └─> UPDATE checkpoint: move WS from pending → completed      │
│    └─> UPDATE artifacts array for that workstream               │
├─────────────────────────────────────────────────────────────────┤
│ 3. Phase Gate Passes                                            │
│    └─> UPDATE checkpoint: increment current_phase               │
│    └─> UPDATE gates_passed array                                │
├─────────────────────────────────────────────────────────────────┤
│ 4. Pipeline Completes                                           │
│    └─> UPDATE checkpoint: status = "complete"                   │
└─────────────────────────────────────────────────────────────────┘
```

### Initialize Checkpoint (After EXECUTION-SPEC)

Immediately after generating EXECUTION-SPEC, create the checkpoint file:

```bash
# Create checkpoint directory if needed
mkdir -p .claude/skills/prd-pipeline/checkpoints
```

```json
{
  "prd": "PRD-XXX",
  "prd_title": "Service/Feature Name",
  "current_phase": 0,
  "status": "initialized",
  "completed_workstreams": [],
  "in_progress_workstreams": [],
  "pending_workstreams": ["WS1", "WS2", "WS3", "WS4", "WS5"],
  "artifacts": {},
  "gates_passed": [],
  "gates_pending": ["schema-validation", "type-check", "lint", "test-pass"],
  "timestamp": "2025-XX-XXTXX:XX:XXZ"
}
```

**Location**: `.claude/skills/prd-pipeline/checkpoints/{PRD-ID}.json`

### Update Checkpoint (After Each Workstream)

After each workstream completes, update the checkpoint:

```python
# Pseudo-code for checkpoint update
def update_checkpoint_workstream(prd_id: str, ws_id: str, artifacts: list[str]):
    checkpoint = load_checkpoint(prd_id)

    # Move workstream from in_progress to completed
    checkpoint["in_progress_workstreams"].remove(ws_id)
    checkpoint["completed_workstreams"].append(ws_id)
    checkpoint["pending_workstreams"] = [
        ws for ws in checkpoint["pending_workstreams"] if ws != ws_id
    ]

    # Record artifacts
    checkpoint["artifacts"][ws_id] = artifacts
    checkpoint["timestamp"] = datetime.now().isoformat()

    save_checkpoint(prd_id, checkpoint)
```

### Update Checkpoint (After Gate Pass)

After phase validation gates pass:

```python
def update_checkpoint_gate(prd_id: str, gate_name: str, phase_num: int):
    checkpoint = load_checkpoint(prd_id)

    checkpoint["current_phase"] = phase_num
    checkpoint["gates_passed"].append(gate_name)
    checkpoint["gates_pending"].remove(gate_name)
    checkpoint["timestamp"] = datetime.now().isoformat()

    save_checkpoint(prd_id, checkpoint)
```

### Resume from Checkpoint

When invoked with `--resume`:

1. Load checkpoint file from `.claude/skills/prd-pipeline/checkpoints/{PRD-ID}.json`
2. Display completed vs pending workstreams
3. Identify the next incomplete phase based on `current_phase` and `pending_workstreams`
4. Continue execution from that phase

---

## Integration Points

| Primitive | Role in Pipeline |
|-----------|------------------|
| `lead-architect` skill | Generates EXECUTION-SPEC from PRD |
| `backend-developer` agent | Executes DB/Service/Test workstreams |
| `api-expert` agent | Executes Route Handler workstreams |
| `pt2-frontend-implementer` agent | Executes UI workstreams |
| `/validation-gate` command | Runs validation commands |
| `MVPProgressContext` | Records service completion |
| `/mvp-status` command | Final status display |

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

### Related Skills and Agents

| Skill/Agent | subagent_type | When Used |
|-------------|---------------|-----------|
| `lead-architect` skill | (skill invocation) | EXECUTION-SPEC generation |
| `backend-developer` agent | `backend-developer` | DB/Service/Test workstreams |
| `api-expert` agent | `api-expert` | Route handler workstreams |
| `pt2-frontend-implementer` agent | `pt2-frontend-implementer` | UI workstreams |
| `pt2-service-implementer` agent | `pt2-service-implementer` | Full-stack bounded context |

### Commands

| Command | Purpose |
|---------|---------|
| `/prd-execute` | Entry point for this pipeline |
| `/mvp-status` | Check MVP progress |
| `/validation-gate` | Manual gate validation |
