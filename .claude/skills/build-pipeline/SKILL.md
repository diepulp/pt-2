---
name: build-pipeline
description: This skill should be used when the user asks to "build", "run /build", "implement", "execute spec", "implement PRD-XXX", "resume pipeline execution", "generate an EXECUTION-SPEC", "execute investigation findings","implement investigation doc", or provides a file path to any specification document (PRD, investigation, EXEC-SPEC, or issue doc). Also triggers when user mentions "build-pipeline" or asks to implement findings from docs/issues/ or similar specification paths. Orchestrates specification-to-production implementation with phased workstream execution, validation gates, and checkpoint-based resume capability.
---

# Build Pipeline Orchestrator

## Entry Point

```
/build PRD-XXX                                        # Execute PRD by ID
/build PRD-XXX --resume                               # Resume from checkpoint
/build docs/issues/perf/INVESTIGATION.md              # Execute investigation doc
/build docs/10-prd/PRD-022-feature-name.md            # Execute PRD by path
/build EXEC-003                                       # Execute existing EXEC-SPEC (skip generation)
/build --resume                                       # Resume most recent checkpoint
```

## Supported Input Types

| Input Format | Example | Resolution |
|--------------|---------|------------|
| PRD identifier | `PRD-003` | `docs/10-prd/PRD-003*.md` |
| PRD file path | `docs/10-prd/PRD-022-feature.md` | Direct path |
| EXEC-SPEC ID | `EXEC-003` | `docs/21-exec-spec/EXEC-003*.md` |
| EXEC-SPEC path | `docs/21-exec-spec/EXEC-003-csv-import.md` | Direct path |
| Investigation doc | `docs/issues/perf/INVESTIGATION.md` | Direct path |
| Issue spec | `docs/issues/ISSUE-XXX.md` | Direct path |
| Any spec path | `docs/20-architecture/specs/ADR-029/EXEC-SPEC.md` | Direct path |

**IMPORTANT**: This skill accepts ANY specification document that contains implementation requirements, not just PRDs. Investigation docs, issue specs, and findings documents are all valid inputs.

## Resources

| Reference | Purpose |
|-----------|---------|
| `references/expert-routing.md` | **Two-stage generation: domain->expert skill mapping** |
| `references/executor-registry.md` | Complete executor mapping (skills vs task-agents) |
| `references/execution-spec-template.md` | YAML + markdown template for workstreams |
| `references/gate-protocol.md` | Gate approval UX and validation commands |
| `references/checkpoint-format.md` | Checkpoint schema and state management |
| `references/critic-checklist.md` | EXECUTION-SPEC quality validation criteria |
| `scripts/validate-execution-spec.py` | Validate EXECUTION-SPEC (structural + governance) |
| `devils-advocate` skill | Adversarial EXEC-SPEC review (Stage 4) |

---

## Input Resolution

```
/build <argument>

If argument == "--resume":
  -> load most recent checkpoint, continue

If argument matches PRD-XXX:
  -> resolve to docs/10-prd/PRD-XXX*.md
  -> run GOV-010 prerequisite check

If argument matches EXEC-###:
  -> resolve to docs/21-exec-spec/EXEC-###*.md
  -> skip EXEC-SPEC generation (already exists)

If argument is a file path:
  -> use directly
  -> run GOV-010 check if it's a PRD
```

---

## GOV-010 Prerequisite Check (at entry)

When input is a PRD:
1. Check PRD frontmatter for `scaffold_ref` and `adr_refs`
2. Verify referenced files exist
3. If missing: warn and require explicit waiver

```
Warning: GOV-010 Gate Check
---------------------------------------------
PRD-027 prerequisite check:
  [PASS] Scaffold: docs/01-scaffolds/SCAFFOLD-001-csv-import.md
  [FAIL] No ADR references (adr_refs not in frontmatter)

Options:
  1. Add ADR references and re-run
  2. Override with waiver reason
---------------------------------------------
```

The `gov010_check` result is recorded in the checkpoint as `"passed"`, `"waived:{reason}"`, or `"pending"`.

---

## Pipeline Overview

```
Spec Document -> [GOV-010 Check] -> EXECUTION-SPEC -> [Validate] -> [DA Review] -> [Approve] -> Execution -> DoD
                                         |                               |
                                   Human Approval                 Gate Validation
```

**Design Principles**:
- **Sequential thinking**: Use `mcp__sequential-thinking__sequentialthinking` for all EXECUTION-SPEC generation
- **Skills-only execution**: All workstreams use Skills (task agents deprecated)
- **Gate approval**: Pause after each phase for human review
- **Preserve on failure**: Keep completed artifacts for manual fix and resume
- **Parallel execution**: Run independent workstreams concurrently
- **Adversarial review**: EXEC-SPEC attacked by devils-advocate before approval

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
   - If input matches `EXEC-###` pattern: resolve to `docs/21-exec-spec/EXEC-###*.md` (skip to Phase 2)
   - If input matches `ISSUE-XXX` pattern: resolve to `docs/issues/ISSUE-XXX*.md`
   - Extract spec ID from filename for checkpoint naming
2. **Load context files** (architecture, governance, quality)
3. **BLOCKING REQUIREMENT -- Delegate to lead-architect via Skill tool:**

   > **DO NOT perform architectural scaffolding inline.**
   > MUST invoke the `Skill` tool to delegate scaffolding to `lead-architect`.
   > The general agent lacks bounded context ownership knowledge and will produce
   > incorrect phase ordering and workstream boundaries if it does this inline.

   **Required tool call:**
   ```
   Skill(skill="lead-architect", args="EXECUTION-SPEC scaffolding for {PRD_ID}:
     Specification: {spec_file_path}
     Task: Produce workstream SKELETON only (ID, name, type, bounded_context, dependencies).
     DO NOT produce granular outputs, patterns, or implementation hints.
     Output format: YAML workstream skeleton per SKILL.md EXECUTION-SPEC Scaffolding Role.")
   ```

   **Expected output from lead-architect** (skeleton only):
   - Vertical slice boundaries
   - Bounded context ownership per workstream
   - Phase ordering and dependencies
   - Workstream SKELETON (ID, name, type, dependencies)

   **lead-architect does NOT design granular workstream details.**

### Stage 2: Expert Consultation (with Context Injection)

4. **BLOCKING REQUIREMENT -- Delegate to domain experts via Skill tool:**

   > **DO NOT refine workstream specifications inline.**
   > MUST invoke the `Skill` tool for EACH workstream, routing to the correct
   > domain expert. The general agent lacks domain-specific pattern knowledge
   > (ADR-015 RLS, DTO canonical, React 19 useTransition) and will produce
   > non-compliant specifications if it does this inline.

   **Domain -> Expert Skill routing table:**

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
   +-------------------------------------------------------------+
   | SINGLE MESSAGE -- multiple Skill tool calls:                 |
   +-------------------------------------------------------------+
   | Skill(skill="backend-service-builder", args="refine WS1...") |
   | Skill(skill="rls-expert", args="refine WS2...")              |
   | Skill(skill="api-builder", args="refine WS4...")             |
   +-------------------------------------------------------------+
   ```

### Stage 3: Assemble & Validate

6. Merge expert refinements into final EXECUTION-SPEC
7. Output to `docs/21-exec-spec/EXEC-###-{slug}.md`
8. **CRITICAL: Run validation before proceeding**:
   ```bash
   python .claude/skills/build-pipeline/scripts/validate-execution-spec.py \
       docs/21-exec-spec/EXEC-###-{slug}.md
   ```

   The validation script checks:
   - **Structural**: YAML syntax, executor names, dependencies, gates
   - **Governance**: SRM ownership, test locations, migration standards, DTO patterns

   Both must pass before proceeding.

9. Initialize checkpoint file immediately (see `references/checkpoint-format.md`)

### Stage 4: Adversarial Review

10. **BLOCKING REQUIREMENT -- Invoke devils-advocate for EXEC-SPEC review:**

    > **DO NOT skip adversarial review.**
    > The EXEC-SPEC is the implementation blueprint. Catching P0 flaws here costs ~0 code rework.
    > Catching them after Phase 3 execution costs significant rework.

    **Required tool call:**
    ```
    Skill(skill="devils-advocate", args="Full adversarial review of EXEC-SPEC for {PRD_ID}:
      Specification: {exec_spec_path}
      Workstreams: {workstream_summary}
      Bounded Contexts: {bounded_contexts}

      Review the complete EXEC-SPEC. Use full review mode (all 11 sections).
      Focus on: bounded context violations, missing RLS workstreams,
      implementation gaps, over-engineering, and test plan holes.")
    ```

    **Gate logic:**
    - Verdict "Ship": **PASS**. Include verdict in Phase 2 display.
    - Verdict "Ship w/ gates": **WARN**. Present findings in Phase 2 approval gate. Human decides.
    - Verdict "Do not ship" with P0 findings: **BLOCK**. Enter retry protocol (see below).

    Record the DA verdict in the checkpoint `adversarial_review` field (see `references/checkpoint-format.md`).

    **Retry protocol (on BLOCK):**

    Present P0 findings to the human:

    ```
    ---------------------------------------------
    [BLOCK] Adversarial Review Failed (Attempt {N}/2)
    ---------------------------------------------

    P0 Findings ({count}):
      1. {P0 finding summary}
      2. {P0 finding summary}

    Options:
      1. Revise EXEC-SPEC (delegate to lead-architect + experts with DA findings)
      2. Override with reason (record waiver, proceed to Phase 2)
      3. Abort pipeline
    ---------------------------------------------
    ```

    - **Option 1 (Revise):** Delegate back to `lead-architect` with DA findings as revision context.
      Re-run expert consultation (Stage 2) for affected workstreams, then Stage 3 (validate),
      then Stage 4 (DA review). Update checkpoint `adversarial_review.attempt` count.
    - **Option 2 (Override):** Record `adversarial_review.verdict` as `"overridden"` with
      `override_reason` in checkpoint. Proceed to Phase 2 with override noted in display.
    - **Option 3 (Abort):** Set checkpoint `status` to `"failed"`, record DA findings. Stop.

    **Max 2 DA attempts.** After 2 consecutive "Do not ship" verdicts, the pipeline forces
    a human decision: override-with-reason or abort. No further automatic revision loops.

---

## Phase 2: Approval Gate

Present EXECUTION-SPEC summary to user:

```
---------------------------------------------
EXECUTION-SPEC Generated: {PRD-ID} ({Service})
---------------------------------------------

Workstreams:
  WS1: {name} ({executor})
  WS2: {name} ({executor})
  ...

Execution Order:
  Phase 1: [WS1] (parallel)
  Phase 2: [WS2, WS3] (parallel)
  ...

Validation: [PASS] EXECUTION-SPEC Valid
Adversarial Review: [{VERDICT}] {P0_count} critical, {P1_count} high
{If P0 > 0: list P0 findings with one-line summaries}

Approve execution plan? [y/n/edit]
---------------------------------------------
```

---

## Phase 3: Phased Execution

> **BLOCKING REQUIREMENT -- All workstream execution MUST use the Skill tool.**
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

+-------------------------------------------------------------+
| SINGLE MESSAGE -- multiple Skill tool calls:                 |
+-------------------------------------------------------------+
| Skill(skill="backend-service-builder", args="WS2...")        |
| Skill(skill="api-builder", args="WS3...")                    |
+-------------------------------------------------------------+
```

**Wrong Pattern** (causes sequential execution):
```
Message 1: Skill(WS2) -> wait
Message 2: Skill(WS3) -> wait
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

## Phase 4: Completion + DoD Validation

After all phases complete:

1. Run DoD gate validation (type-check, lint, test, build)
2. Update `docs/MVP-ROADMAP.md` - Mark PRD as complete
3. Record to Memori via MVPProgressContext
4. Generate summary of files created, tests passing, gates passed
5. Display final status via `/mvp-status`

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

**Location**: `.claude/skills/build-pipeline/checkpoints/{ID}.json`

**Lifecycle**:
```
EXECUTION-SPEC Generated -> Initialize checkpoint (status: "initialized")
Workstream Completes     -> Update checkpoint (move to completed_workstreams)
Gate Passes              -> Update checkpoint (increment current_phase)
Pipeline Completes       -> Update checkpoint (status: "complete")
```

**Resume**: When invoked with `--resume`:
1. Load checkpoint from `.claude/skills/build-pipeline/checkpoints/{ID}.json`
2. Display completed vs pending workstreams
3. Continue from first incomplete phase

**Additional Fields** (vs prd-pipeline):
- `gov010_check`: `"passed"` | `"waived:{reason}"` | `"pending"`

---

## Error Handling

On workstream failure:

1. Log error details in checkpoint (`status: "failed"`, `error: {...}`)
2. Preserve completed artifacts
3. Display actionable error with suggested fix
4. Pause for human intervention

```
---------------------------------------------
[FAIL] Phase {N} Failed: {Workstream Name}
---------------------------------------------

Error in {WS_ID}:
  {Error message with file:line if available}

Completed:
  - WS1: {name} [PASS]

Preserved artifacts:
  - {file1}
  - {file2}

Suggested fix:
  {Actionable suggestion based on error type}

Resume after fix: /build --resume
---------------------------------------------
```

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `/build PRD-XXX` | Execute PRD from start |
| `/build EXEC-###` | Execute existing EXEC-SPEC |
| `/build --resume` | Resume from checkpoint |
| `/mvp-status` | Check MVP progress |
| `/validation-gate {gate}` | Run manual gate validation |
