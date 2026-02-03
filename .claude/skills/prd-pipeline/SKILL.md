---
name: prd-pipeline
description: >
  This skill should be used when the user asks to "execute a PRD",
  "run /prd-execute", "implement PRD-XXX", "resume pipeline execution",
  "generate an EXECUTION-SPEC", "execute investigation findings",
  "implement investigation doc", or provides a file path to any
  specification document (PRD, investigation, EXEC-SPEC, or issue doc).
  Also triggers when user mentions "prd-pipeline" or asks to implement
  findings from docs/issues/ or similar specification paths. Orchestrates
  PRD-to-Production implementation with phased workstream execution,
  validation gates, and checkpoint-based resume capability.
version: 1.2.0
---

# PRD Pipeline Orchestrator

## Entry Point

```
/prd-execute PRD-XXX                                    # Execute PRD by ID
/prd-execute PRD-XXX --resume                           # Resume from checkpoint
/prd-execute docs/issues/perf/INVESTIGATION.md          # Execute investigation doc
/prd-execute docs/10-prd/PRD-022-feature-name.md        # Execute PRD by path
```

## Supported Input Types

| Input Format | Example | Resolution |
|--------------|---------|------------|
| PRD identifier | `PRD-003` | `docs/10-prd/PRD-003*.md` |
| PRD file path | `docs/10-prd/PRD-022-feature.md` | Direct path |
| Investigation doc | `docs/issues/perf/INVESTIGATION.md` | Direct path |
| Issue spec | `docs/issues/ISSUE-XXX.md` | Direct path |
| EXEC-SPEC ID | `EXEC-SPEC-022` | `docs/20-architecture/specs/*/EXEC-SPEC-022.md` |
| Any spec path | `docs/20-architecture/specs/ADR-029/EXEC-SPEC.md` | Direct path |

**IMPORTANT**: This skill accepts ANY specification document that contains implementation requirements, not just PRDs. Investigation docs, issue specs, and findings documents are all valid inputs.

## Resources

| Reference | Purpose |
|-----------|---------|
| `references/expert-routing.md` | **Two-stage generation: domain→expert skill mapping** |
| `references/executor-registry.md` | Complete executor mapping (skills vs task-agents) |
| `references/execution-spec-template.md` | YAML + markdown template for workstreams |
| `references/gate-protocol.md` | Gate approval UX and validation commands |
| `references/checkpoint-format.md` | Checkpoint schema and state management |
| `references/critic-checklist.md` | EXECUTION-SPEC quality validation criteria |
| `scripts/validate-execution-spec.py` | Validate EXECUTION-SPEC (structural + governance) |

---

## Pipeline Overview

```
PRD Document → EXECUTION-SPEC → [Validate] → Phased Execution → Completion
                    ↓                              ↓
              Human Approval              Gate Validation
```

**Design Principles**:
- **Sequential thinking**: Use `mcp__sequential-thinking__sequentialthinking` for all EXECUTION-SPEC generation
- **Skills-only execution**: All workstreams use Skills (task agents deprecated)
- **Gate approval**: Pause after each phase for human review
- **Preserve on failure**: Keep completed artifacts for manual fix and resume
- **Parallel execution**: Run independent workstreams concurrently

---

## Phase 1: EXECUTION-SPEC Generation (Two-Stage)

See `references/expert-routing.md` for full expert consultation protocol.

### Stage 0: Load Governance Context (REQUIRED)

Before any generation, load context files for validation:

```
context/architecture.context.md  # SRM ownership, DTO patterns, bounded context rules
context/governance.context.md    # Service template, migration standards, test locations
context/quality.context.md       # Test strategy, coverage targets, quality gates
```

These files contain deterministic rules that MUST be validated against during spec generation.

### Stage 1: Architectural Scaffolding

1. **Locate specification document** using input resolution:
   - If input is a file path (contains `/` or ends with `.md`): use directly
   - If input matches `PRD-XXX` pattern: resolve to `docs/10-prd/PRD-XXX*.md`
   - If input matches `EXEC-SPEC-XXX` pattern: resolve to `docs/20-architecture/specs/*/EXEC-SPEC-XXX.md`
   - If input matches `ISSUE-XXX` pattern: resolve to `docs/issues/ISSUE-XXX*.md`
   - Extract spec ID from filename for checkpoint naming (e.g., `PIT_DASHBOARD_DATA_FLOW_INVESTIGATION` → checkpoint ID)
2. **Load context files** (architecture, governance, quality)
3. **BLOCKING REQUIREMENT — Delegate to lead-architect via Skill tool:**

   > **DO NOT perform architectural scaffolding yourself.**
   > You MUST invoke the `Skill` tool to delegate scaffolding to `lead-architect`.
   > The general agent lacks bounded context ownership knowledge and will produce
   > incorrect phase ordering and workstream boundaries if it does this inline.

   **Required tool call:**
   ```
   Skill(skill="lead-architect", args="EXECUTION-SPEC scaffolding for {PRD_ID}:
     Specification: {spec_file_path}
     Task: Produce workstream SKELETON only (ID, name, type, bounded_context, dependencies).
     DO NOT produce granular outputs, patterns, or implementation hints.
     Output format: YAML workstream skeleton per SKILL.md §EXECUTION-SPEC Scaffolding Role.")
   ```

   **Expected output from lead-architect** (skeleton only):
   - Vertical slice boundaries
   - Bounded context ownership per workstream
   - Phase ordering and dependencies
   - Workstream SKELETON (ID, name, type, dependencies)

   **lead-architect does NOT design granular workstream details.**

### Stage 2: Expert Consultation (with Context Injection)

4. **BLOCKING REQUIREMENT — Delegate to domain experts via Skill tool:**

   > **DO NOT refine workstream specifications yourself.**
   > You MUST invoke the `Skill` tool for EACH workstream, routing to the correct
   > domain expert. The general agent lacks domain-specific pattern knowledge
   > (ADR-015 RLS, DTO canonical, React 19 useTransition) and will produce
   > non-compliant specifications if it does this inline.

   **Domain → Expert Skill routing table:**

   | Workstream Type | Expert Skill (exact Skill tool name) |
   |-----------------|--------------------------------------|
   | `database`, `service-layer` | `backend-service-builder` |
   | `rls` | `rls-expert` |
   | `route-handlers` | `api-builder` |
   | `react-components`, `zustand-stores`, `react-query-hooks`, `modal-integration` | `frontend-design-pt-2` |
   | `unit-tests` (service) | `backend-service-builder` |
   | `unit-tests` (component) | `frontend-design-pt-2` |
   | `e2e-tests` | `e2e-testing` |

   **Required tool call per workstream:**
   ```
   Skill(skill="{expert_skill_name}", args="Expert consultation for {PRD_ID} {WS_ID}:
     Workstream: {WS_NAME}
     Type: {workstream_type}
     Bounded Context: {bounded_context}
     Dependencies: {dependencies}

     Architectural Skeleton from lead-architect:
     {skeleton_yaml}

     GOVERNANCE CONTEXT (MUST COMPLY):
     {Inject relevant sections from context/architecture.context.md}
     {Inject relevant sections from context/governance.context.md}
     {Inject relevant sections from context/quality.context.md}

     Task: Refine this workstream with domain-specific details (outputs, patterns, validation).
     Return enriched workstream YAML.")
   ```

   **CRITICAL**: Each expert consultation MUST include governance context injection.
   See `references/expert-routing.md` for full context extraction rules per domain.

   **All executors are Skills. Task agents are deprecated for pipeline execution.**

5. **Invoke experts IN PARALLEL** when workstreams have no design dependencies.
   Send a SINGLE message with MULTIPLE `Skill` tool calls:
   ```
   ┌─────────────────────────────────────────────────────────────┐
   │ SINGLE MESSAGE — multiple Skill tool calls:                │
   ├─────────────────────────────────────────────────────────────┤
   │ Skill(skill="backend-service-builder", args="refine WS1…") │
   │ Skill(skill="rls-expert", args="refine WS2…")              │
   │ Skill(skill="api-builder", args="refine WS4…")             │
   └─────────────────────────────────────────────────────────────┘
   ```

### Stage 3: Assemble & Validate

6. Merge expert refinements into final EXECUTION-SPEC
7. Output to `docs/20-architecture/specs/{PRD-ID}/EXECUTION-SPEC-{PRD-ID}.md`
8. **CRITICAL: Run validation before proceeding**:
   ```bash
   python .claude/skills/prd-pipeline/scripts/validate-execution-spec.py \
       docs/20-architecture/specs/{PRD-ID}/EXECUTION-SPEC-{PRD-ID}.md
   ```

   The validation script checks:
   - **Structural**: YAML syntax, executor names, dependencies, gates
   - **Governance**: SRM ownership, test locations, migration standards, DTO patterns

   Both must pass before proceeding.

9. Initialize checkpoint file immediately (see `references/checkpoint-format.md`)

---

## Phase 2: Approval Gate

Present EXECUTION-SPEC summary to user:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION-SPEC Generated: {PRD-ID} ({Service})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Workstreams:
  WS1: {name} ({executor})
  WS2: {name} ({executor})
  ...

Execution Order:
  Phase 1: [WS1] (parallel)
  Phase 2: [WS2, WS3] (parallel)
  ...

Validation: ✅ EXECUTION-SPEC Valid

Approve execution plan? [y/n/edit]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Phase 3: Phased Execution

> **BLOCKING REQUIREMENT — All workstream execution MUST use the Skill tool.**
> DO NOT implement workstreams inline. Each workstream MUST be dispatched to its
> executor skill via `Skill(skill="{executor}", args="...")`. The general agent
> orchestrates (parses, dispatches, collects, validates) but NEVER writes
> implementation code itself.

For each execution phase:

1. Parse workstreams from EXECUTION-SPEC YAML frontmatter
2. **Dispatch via Skill tool IN PARALLEL** (see pattern below)
3. Update checkpoint after each workstream completes
4. Run validation gate (see `references/gate-protocol.md`)
5. Pause for human approval before next phase

### CRITICAL: Parallel Skill Dispatch

Workstreams marked as `parallel` in execution_phases MUST be dispatched using
**multiple Skill tool calls in a SINGLE message**:

```
When phase has parallel: [WS2, WS3], send ONE message with TWO Skill calls:

┌─────────────────────────────────────────────────────────────┐
│ SINGLE MESSAGE — multiple Skill tool calls:                 │
├─────────────────────────────────────────────────────────────┤
│ Skill(skill="backend-service-builder", args="WS2...")       │
│ Skill(skill="api-builder", args="WS3...")                   │
└─────────────────────────────────────────────────────────────┘
```

**Wrong Pattern** (causes sequential execution):
```
Message 1: Skill(WS2) → wait
Message 2: Skill(WS3) → wait
```

### Executor Selection (Skills Only)

Consult `references/executor-registry.md` for the complete mapping.

**All workstreams use Skills. Task agents are deprecated.**

| Workstream Domain | Skill (exact `skill=` value) |
|-------------------|------------------------------|
| Database/Service Layer | `backend-service-builder` |
| Route Handlers | `api-builder` |
| RLS Policies | `rls-expert` |
| Frontend (components, stores, hooks) | `frontend-design-pt-2` |
| E2E Tests | `e2e-testing` |
| Quality Gates | `qa-specialist` |

### Workstream Prompt Template

Each `Skill` call MUST use this template for the `args` parameter:

```
Execute workstream {WS_ID} for {PRD_ID}:

**Workstream**: {WS_NAME}
**Outputs Required**: {OUTPUTS}
**Dependencies Completed**: {COMPLETED_WS}

Context from EXECUTION-SPEC:
{WORKSTREAM_DETAILS}

Follow the {EXECUTOR} workflow to produce the required outputs.
Validate against gate: {GATE_TYPE}
```

---

## Phase 4: Completion

After all phases complete:

1. Update `docs/MVP-ROADMAP.md` - Mark PRD as complete
2. Record to Memori via MVPProgressContext
3. Generate summary of files created, tests passing, gates passed
4. Display final status via `/mvp-status`

---

## Gate Validation

See `references/gate-protocol.md` for full specification.

| Gate | Command | Success |
|------|---------|---------|
| `schema-validation` | `npm run db:types` | Exit 0, no errors |
| `type-check` | `npm run type-check` | Exit 0 |
| `lint` | `npm run lint` | Exit 0 (warnings OK) |
| `test-pass` | `npm test {path}` | All tests pass |
| `build` | `npm run build` | Exit 0 |

---

## Checkpoint Management

See `references/checkpoint-format.md` for complete schema.

**Location**: `.claude/skills/prd-pipeline/checkpoints/{PRD-ID}.json`

**Lifecycle**:
```
EXECUTION-SPEC Generated → Initialize checkpoint (status: "initialized")
Workstream Completes     → Update checkpoint (move to completed_workstreams)
Gate Passes              → Update checkpoint (increment current_phase)
Pipeline Completes       → Update checkpoint (status: "complete")
```

**Resume**: When invoked with `--resume`:
1. Load checkpoint from `.claude/skills/prd-pipeline/checkpoints/{PRD-ID}.json`
2. Display completed vs pending workstreams
3. Continue from first incomplete phase

---

## Error Handling

On workstream failure:

1. Log error details in checkpoint (`status: "failed"`, `error: {...}`)
2. Preserve completed artifacts
3. Display actionable error with suggested fix
4. Pause for human intervention

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ Phase {N} Failed: {Workstream Name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Error in {WS_ID}:
  {Error message with file:line if available}

Completed:
  - WS1: {name} ✅

Preserved artifacts:
  - {file1}
  - {file2}

Suggested fix:
  {Actionable suggestion based on error type}

Resume after fix: /prd-execute {PRD-ID} --resume
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `/prd-execute PRD-XXX` | Execute PRD from start |
| `/prd-execute PRD-XXX --resume` | Resume from checkpoint |
| `/mvp-status` | Check MVP progress |
| `/validation-gate {gate}` | Run manual gate validation |
