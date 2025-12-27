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
│   subagent_type: "backend-service-builder"                      │
│   description: "WS2: Service Layer"                             │
│   prompt: "Execute workstream WS2 for PRD-003..."               │
│   run_in_background: true                                       │
├─────────────────────────────────────────────────────────────────┤
│ Task 2:                                                         │
│   subagent_type: "api-builder"                                  │
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

### Executor Registry

The pipeline uses two executor types: **Task Agents** (spawned via Task tool) and **Skills** (invoked via Skill tool).

#### Task Agents (via `Task` tool with `subagent_type`)

| subagent_type | Purpose |
|---------------|---------|
| `typescript-pro` | TypeScript architecture, type-safe code, React hooks, unit tests |
| `general-purpose` | Research, code search, multi-step generic tasks |
| `Explore` | Fast codebase exploration, file patterns, keyword search |
| `Plan` | Software architect for implementation planning |

#### Skills (via `Skill` tool)

| Skill Name | Purpose |
|------------|---------|
| `backend-service-builder` | PT-2 service layer, DTOs, migrations, bounded contexts |
| `api-builder` | API endpoints, OpenAPI contracts, route handlers |
| `frontend-design-pt-2` | PT-2 React 19 components, Zustand integration, useTransition patterns |
| `rls-expert` | Row-Level Security policies, RLS debugging |
| `e2e-testing` | Playwright E2E tests, TDD workflow |
| `qa-specialist` | Quality gates, test coverage validation |
| `performance-engineer` | Query performance, SLOs, benchmarks |
| `lead-architect` | System architecture, ADRs, EXECUTION-SPEC generation |

**NOTE**: `frontend-design-pt-2` (project skill) replaces `frontend-design:frontend-design` (plugin).
The project skill has PT-2-specific knowledge including React 19 patterns, ADR-003 Zustand conventions,
and layout strategy that the generic plugin lacks.

#### Workstream → Executor Mapping

| Workstream Type | Executor | Executor Type |
|-----------------|----------|---------------|
| Database Layer | `backend-service-builder` | Skill |
| Service Layer | `backend-service-builder` | Skill |
| Route Handlers | `api-builder` | Skill |
| React Query Hooks | `typescript-pro` | Task Agent |
| Unit/Integration Tests | `typescript-pro` | Task Agent |
| Hook Integration Tests | `typescript-pro` | Task Agent |
| E2E Tests | `e2e-testing` | Skill |
| **Zustand Stores** | `typescript-pro` | Task Agent |
| **Selector Hooks (useShallow)** | `frontend-design-pt-2` | Skill |
| **React 19 Component Refactors** | `frontend-design-pt-2` | Skill |
| **Modal Integration (useTransition)** | `frontend-design-pt-2` | Skill |
| UI Components (new) | `frontend-design-pt-2` | Skill |
| RLS Policies | `rls-expert` | Skill |
| Performance | `performance-engineer` | Skill |
| Quality Gates | `qa-specialist` | Skill |
| Exploration/Research | `Explore` | Task Agent |
| Architecture Planning | `Plan` | Task Agent |

**Frontend Workstream Guidelines**:
- **Zustand Store creation** (`store/*.ts`): Use `typescript-pro` for pure TypeScript store with devtools
- **Selector Hooks** (`hooks/ui/*.ts`): Use `frontend-design-pt-2` for React 19 hook patterns (useShallow)
- **Component Refactors** (prop drilling → hooks): Use `frontend-design-pt-2` for React 19 compliance
- **Modal Integration** (useTransition, key-based reset): Use `frontend-design-pt-2`

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

### Delegation to Executors

Each workstream delegates to a specialized executor. Use the correct invocation method based on executor type:

**For Task Agents**: Use `Task` tool with `subagent_type` parameter
```
Task(subagent_type="typescript-pro", description="...", prompt="...", run_in_background=true)
```

**For Skills**: Use `Skill` tool with skill name
```
Skill(skill="backend-service-builder", args="...")
```

See **Executor Registry** section above for the complete mapping of workstream types to executors and their invocation methods.

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

| Executor | Type | Role in Pipeline |
|----------|------|------------------|
| `lead-architect` | Skill | Generates EXECUTION-SPEC from PRD |
| `backend-service-builder` | Skill | Executes DB/Service workstreams |
| `api-builder` | Skill | Executes Route Handler workstreams |
| `frontend-design-pt-2` | Skill | UI components, React 19 refactors, selector hooks, modal integration |
| `e2e-testing` | Skill | Executes E2E test workstreams |
| `rls-expert` | Skill | Executes RLS policy workstreams |
| `qa-specialist` | Skill | Executes quality gate workstreams |
| `typescript-pro` | Task Agent | Zustand stores, React Query hooks, unit tests |
| `Explore` | Task Agent | Codebase exploration tasks |
| `/validation-gate` | Command | Runs validation commands |
| `MVPProgressContext` | Memory | Records service completion |
| `/mvp-status` | Command | Final status display |

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

### Related Executors

#### Skills (Skill tool)

| Skill | When Used |
|-------|-----------|
| `lead-architect` | EXECUTION-SPEC generation |
| `backend-service-builder` | DB/Service workstreams |
| `api-builder` | Route handler workstreams |
| `frontend-design-pt-2` | UI components, React 19 refactoring, selector hooks, modal integration |
| `e2e-testing` | Playwright E2E tests |
| `rls-expert` | RLS policies, security |
| `qa-specialist` | Quality gates, validation |
| `performance-engineer` | Query optimization, benchmarks |

#### Task Agents (Task tool with subagent_type)

| subagent_type | When Used |
|---------------|-----------|
| `typescript-pro` | Zustand stores, React Query hooks, unit/integration tests, TypeScript code |
| `general-purpose` | Research, complex multi-step tasks |
| `Explore` | Codebase exploration, file search |
| `Plan` | Architecture planning, design |

### Commands

| Command | Purpose |
|---------|---------|
| `/prd-execute` | Entry point for this pipeline |
| `/mvp-status` | Check MVP progress |
| `/validation-gate` | Manual gate validation |
