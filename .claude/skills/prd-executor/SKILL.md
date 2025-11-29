# PRD Executor Skill

## Purpose

Orchestrates PRD implementation workflows by parsing workflow specs and delegating to capability-based agents. Reusable across all PRDs - not hardcoded to any specific workflow.

## When to Use

Invoke when:
- User provides a `WORKFLOW-PRD-XXX.md` spec
- Multi-workstream implementation is needed
- Parallel execution with dependency tracking required

## Workflow

### Phase 1: Parse Workflow Spec

```bash
# Read the workflow document provided by user
Read docs/20-architecture/specs/WORKFLOW-PRD-{XXX}-*.md
```

Extract:
- Work stream list with descriptions
- Dependency graph (which WS blocks which)
- Acceptance criteria per work stream
- Handoff signal paths

### Phase 2: Create Execution Plan

Map work streams to capability agents:

| Work Stream Type | Delegate To |
|-----------------|-------------|
| Database migrations, RLS, RPCs | `pt2-service-implementer` |
| Service layer (business logic) | `pt2-service-implementer` |
| API route handlers | `pt2-service-implementer` |
| React hooks, components | `pt2-frontend-implementer` |
| Unit/integration tests | `pt2-service-implementer` |
| E2E tests | `pt2-frontend-implementer` |

### Phase 3: Execute with Dependency Tracking

```
1. Identify foundation work streams (no dependencies)
2. Execute foundation in parallel via Task tool
3. Wait for handoff signals
4. Execute next tier of work streams
5. Repeat until all complete
```

### Phase 4: Handoff Signal Protocol

Create signal files at `.claude/handoff/{prd}-ws{N}-complete.signal`:

```json
{
  "prd": "PRD-002",
  "workstream": "WS-1",
  "agent": "pt2-service-implementer",
  "status": "complete",
  "timestamp": "2025-01-15T10:30:00Z",
  "files_created": [],
  "files_modified": [],
  "validation": {
    "type_check": "pass",
    "lint": "pass",
    "tests": "pass"
  }
}
```

## Agent Delegation Prompts

### For pt2-service-implementer (Backend Work)

```markdown
Execute work stream {WS-N} from {PRD-XXX}:

**Task**: {extracted task description from workflow}

**Specific Requirements**:
{extracted acceptance criteria}

**Anti-patterns to Avoid**:
- {V1}: Use type guards, not `as` casting
- {V2}: Services throw DomainError, transport returns ServiceResult
- {V4}: Use getAuthContext(), never headers for casino context

**Validation Gate**:
npm run type-check && npm run lint && npm test

**On Success**: Create handoff signal at .claude/handoff/{prd}-ws{N}-complete.signal
```

### For pt2-frontend-implementer (Frontend Work)

```markdown
Execute work stream {WS-N} from {PRD-XXX}:

**Task**: {extracted task description}

**Specific Requirements**:
{extracted acceptance criteria}

**Patterns**:
- Generic mutation key arrays (W1 fix)
- Query invalidation on mutation success
- Idempotency keys via crypto.randomUUID()

**Validation Gate**:
npm run type-check && npm run lint

**On Success**: Create handoff signal at .claude/handoff/{prd}-ws{N}-complete.signal
```

## Parallel Execution Example

For PRD-002 with dependency graph:
```
WS-1 ──┬──> WS-2 ──┬──> WS-4 ──> WS-5
       │          │
       ├──> WS-3 ─┘
       │
       └──> WS-6A/6B ────────────> WS-6C
```

Execute as:
```
# Tier 1 (foundation)
Task(pt2-service-implementer, "Execute WS-1: Database Layer for PRD-002")

# Tier 2 (parallel after WS-1)
Task(pt2-service-implementer, "Execute WS-2: TableContextService")
Task(pt2-service-implementer, "Execute WS-3: RatingSlipService")
Task(pt2-service-implementer, "Execute WS-6A/6B: Unit + Integration Tests")

# Tier 3 (after WS-2 + WS-3)
Task(pt2-service-implementer, "Execute WS-4: API Route Handlers")

# Tier 4 (after WS-4)
Task(pt2-frontend-implementer, "Execute WS-5: React Query Hooks")
Task(pt2-frontend-implementer, "Execute WS-6C: E2E Tests")
```

## Benefits Over Workflow-Specific Agents

| Aspect | 6 Workflow Agents | PRD Executor Skill |
|--------|-------------------|-------------------|
| Reusability | PRD-002 only | Any PRD |
| Maintenance | Edit 6 files | Edit 1 skill + 2 agents |
| Agent sprawl | 6 per PRD | 0 new agents |
| Pattern updates | Propagate to all | Single source |
| Context efficiency | Duplicated | Shared via skills |

## Reference Documents

- Workflow specs: `docs/20-architecture/specs/WORKFLOW-PRD-*.md`
- Service patterns: `.claude/skills/backend-service-builder/references/`
- Frontend patterns: `.claude/skills/frontend-design/references/`
- Anti-patterns: `memory/anti-patterns.memory.md`
