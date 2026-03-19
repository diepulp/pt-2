---
name: build-pipeline
description: Orchestrate specification-to-production implementation with phased workstream execution, validation gates, and checkpoint-based resume. This skill should be used when the user asks to "build from a PRD", "execute a spec", "implement PRD-XXX", "run the build pipeline", "resume the build", "build this", "execute this EXEC-SPEC", or provides a path to any specification document (PRD, EXEC-SPEC, investigation doc, issue spec). Also triggers on requests to implement from a design document, execute findings, or run workstreams from an existing plan.
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
| `references/expert-routing.md` | **Two-stage generation: domain->expert skill mapping + executor registry** |
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
references/architecture.context.md  # SRM ownership, DTO patterns, bounded context rules
references/governance.context.md    # Service template, migration standards, test locations
references/quality.context.md       # Test strategy, coverage targets, quality gates
```

These files contain deterministic rules that MUST be validated against during spec generation.

### Stage 1: Architectural Scaffolding

1. **Locate specification document** using input resolution (see Input Resolution above)
2. **Load context files** (architecture, governance, quality)
3. **Delegate to `lead-architect` via Skill tool** — the general agent lacks bounded context ownership knowledge and produces incorrect phase ordering if it does this inline. lead-architect produces a workstream SKELETON only (ID, name, type, bounded_context, dependencies). It does NOT design granular workstream details.

### Stage 2: Expert Consultation (with Context Injection)

4. **Delegate to domain experts via Skill tool** — each workstream is routed to the correct domain expert because the general agent lacks domain-specific pattern knowledge (ADR-015 RLS, DTO canonical, React 19 useTransition). Each expert consultation MUST include governance context injection.

   See `references/expert-routing.md` for:
   - Full two-stage generation protocol and rationale
   - Domain-to-expert skill routing table
   - Context injection protocol (which context sections to inject per domain)
   - Expert consultation prompt template and response format
   - Parallel consultation dispatch pattern

5. **Invoke experts IN PARALLEL** when workstreams have no design dependencies — send a SINGLE message with MULTIPLE `Skill` tool calls.

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

### Stage 4: Adversarial Review (DA Team)

10. **BLOCKING REQUIREMENT -- Deploy DA review team for EXEC-SPEC review:**

    > **DO NOT skip adversarial review.**
    > The EXEC-SPEC is the implementation blueprint. Catching P0 flaws here costs ~0 code rework.
    > Catching them after Phase 3 execution costs significant rework.
    >
    > **DO NOT use a single DA reviewer.** Deploy the full 5-reviewer team for coverage depth.

    #### Step 4a: Parallel DA Team Dispatch

    Send a **SINGLE message** with **5 parallel** `Agent` calls. Each reviewer runs as an
    **independent agent with full tool access** (Read, Grep, Glob, Bash) so it can verify
    spec claims against the actual codebase, git history, and file system. This prevents
    false positives from spec-only review where implementation has already diverged from
    or advanced beyond the spec text.

    > **Why Agent, not Skill?** `Skill()` loads instructions into the current conversation —
    > all 5 "reviewers" would share one context, compete for tool-call budget, and in practice
    > review only the spec text without verifying against code. `Agent()` spawns independent
    > subprocesses, each with its own context window and tool access. This is what makes the
    > "5 independent reviewers" design actually work.

    ```
    +---------------------------------------------------------------------------------+
    | SINGLE MESSAGE — 5 parallel Agent calls:                                        |
    +---------------------------------------------------------------------------------+
    | Agent(description="DA R1 Security",    prompt="...", run_in_background=true)     |
    | Agent(description="DA R2 Architecture", prompt="...", run_in_background=true)    |
    | Agent(description="DA R3 Implementation", prompt="...", run_in_background=true)  |
    | Agent(description="DA R4 Test Quality", prompt="...", run_in_background=true)    |
    | Agent(description="DA R5 Performance",  prompt="...", run_in_background=true)    |
    +---------------------------------------------------------------------------------+
    ```

    **Required prompt template for each reviewer:**

    ```
    You are an adversarial reviewer for PT-2. Read the devils-advocate skill at
    .claude/skills/devils-advocate/SKILL.md and follow its Focused Review Mode.

    Adversarial review of EXEC-SPEC for {PRD_ID}:
      Specification: {exec_spec_path}
      Workstreams: {workstream_summary}
      Bounded Contexts: {bounded_contexts}

    FOCUS: {REVIEWER_ROLE}
    SECTIONS: {assigned_section_numbers}
    CONTEXT FILES: {domain_context_files}

    Use Focused Review Mode. Attack ONLY your assigned sections with full depth.
    Flag cross-domain issues as one-liners in Cross-Domain Flags section.

    CRITICAL — Ground-truth verification:
    You have full tool access (Read, Grep, Glob, Bash). Before filing any
    "missing implementation" or "missing migration" finding, SEARCH the codebase
    to confirm it is actually missing. Use `git log --oneline -20 -- <path>` to
    check recent changes on relevant files. Never file a "missing X" finding
    without first searching for X.
    ```

    **DA Team Roster:**

    | Reviewer | Role Constant | Sections | Extra Context to Inject |
    |----------|---------------|----------|-------------------------|
    | R1 | `SECURITY_TENANCY` | 1, 4 | SEC-002 guardrails, ADR-015/020/024/030/040 |
    | R2 | `ARCHITECTURE_BOUNDARIES` | 5, 8 | SRM, `architecture.context.md`, Over-Engineering Guardrail |
    | R3 | `IMPLEMENTATION_COMPLETENESS` | 2, 3 | `governance.context.md`, EXEC-SPEC template |
    | R4 | `TEST_QUALITY` | 7 | `quality.context.md`, test patterns, critical workflows |
    | R5 | `PERFORMANCE_OPERABILITY` | 6 | SLO definitions, query patterns, RLS performance |

    #### Step 4b: Synthesis

    After all 5 reviewers return, the orchestrator (build-pipeline) synthesizes inline:

    1. **Collect** all findings with severity labels (P0-P3) from all 5 reviewers
    2. **Deduplicate** — same root cause found by multiple reviewers gets merged, severity = max of reporters
    3. **Promote cross-domain flags** — if a reviewer flagged something in another reviewer's domain, check if that reviewer caught it. If not, add it as a new finding.
    4. **Resolve conflicts** — if reviewers contradict (e.g., R2 says "add X" vs R5 says "X is over-engineering"), flag as `conflict` for human decision. Do NOT auto-resolve.
    5. **Compute consolidated verdict**:
       - All 5 "Ship" → **PASS**
       - Any "Ship w/ gates" (no P0) → **WARN**
       - Any "Do not ship" (P0 found) → **BLOCK**
    6. **Produce consolidated report** (displayed in Phase 2 gate):
       - Consolidated Verdict + per-reviewer verdicts
       - Merged P0/P1 findings (deduplicated, max 15 items)
       - Conflict flags (if any)
       - Unified Patch Delta (15 bullets max, merged from all reviewer patch deltas)
       - Per-reviewer summary (1-2 lines each)

    Record the DA team results in the checkpoint `adversarial_review` field (see `references/checkpoint-format.md`).

    #### Step 4c: Gate Logic

    - Consolidated verdict "Ship" (all 5 agree): **PASS**. Include verdict in Phase 2 display.
    - Consolidated verdict "Ship w/ gates": **WARN**. Present findings in Phase 2 approval gate. Human decides.
    - Consolidated verdict "Do not ship" (any P0): **BLOCK**. Enter retry protocol (see below).

    #### Retry Protocol (on BLOCK)

    Present consolidated P0 findings to the human:

    ```
    ---------------------------------------------
    [BLOCK] DA Team Review Failed (Attempt {N}/2)
    ---------------------------------------------

    Reviewers:
      R1 Security & Tenancy:          {verdict} ({p0_count} P0, {p1_count} P1)
      R2 Architecture & Boundaries:   {verdict} ({p0_count} P0, {p1_count} P1)
      R3 Implementation Completeness: {verdict} ({p0_count} P0, {p1_count} P1)
      R4 Test & Quality:              {verdict} ({p0_count} P0, {p1_count} P1)
      R5 Performance & Operability:   {verdict} ({p0_count} P0, {p1_count} P1)

    Consolidated P0 Findings ({total_count}):
      1. [{source_reviewer}] {P0 finding summary}
      2. [{source_reviewer}] {P0 finding summary}

    Conflicts ({conflict_count}):
      - {R2 vs R5}: {description}

    Options:
      1. Revise EXEC-SPEC (delegate to lead-architect + experts with DA findings)
      2. Override with reason (record waiver, proceed to Phase 2)
      3. Abort pipeline
    ---------------------------------------------
    ```

    - **Option 1 (Revise):** Delegate back to `lead-architect` with consolidated DA findings as revision context.
      Re-run expert consultation (Stage 2) for affected workstreams, then Stage 3 (validate),
      then Stage 4 (full DA team review). Update checkpoint `adversarial_review.attempt` count.
    - **Option 2 (Override):** Record `adversarial_review.verdict` as `"overridden"` with
      `override_reason` in checkpoint. Proceed to Phase 2 with override noted in display.
    - **Option 3 (Abort):** Set checkpoint `status` to `"failed"`, record DA findings. Stop.

    **Max 2 DA team attempts.** After 2 consecutive "Do not ship" verdicts, the pipeline forces
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

DA Team Review: [{CONSOLIDATED_VERDICT}]
  R1 Security & Tenancy:          {verdict} ({p0} P0, {p1} P1)
  R2 Architecture & Boundaries:   {verdict} ({p0} P0, {p1} P1)
  R3 Implementation Completeness: {verdict} ({p0} P0, {p1} P1)
  R4 Test & Quality:              {verdict} ({p0} P0, {p1} P1)
  R5 Performance & Operability:   {verdict} ({p0} P0, {p1} P1)
  Consolidated: {total_p0} P0, {total_p1} P1 (deduplicated)
{If P0 > 0: list P0 findings with source reviewer}
{If conflicts > 0: list cross-reviewer conflicts}

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

Consult `references/expert-routing.md` for the complete workstream-to-skill mapping.
All workstreams use Skills. Task agents are deprecated.

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
2. Update `docs/MVP-ROADMAP.md` — mark PRD as complete
3. Generate summary of files created, tests passing, gates passed
4. Display final status via `/mvp-status`

---

## Gate Validation

See `references/gate-protocol.md` for gate types, commands, approval UX, and failure displays.

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

**Additional Fields**:
- `gov010_check`: `"passed"` | `"waived:{reason}"` | `"pending"`

---

## Error Handling

On workstream failure: log error in checkpoint, preserve completed artifacts, display actionable
error with suggested fix, pause for human intervention. See `references/gate-protocol.md` for
the failure display format and error categorization.

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `/build PRD-XXX` | Execute PRD from start |
| `/build EXEC-###` | Execute existing EXEC-SPEC |
| `/build --resume` | Resume from checkpoint |
| `/mvp-status` | Check MVP progress |
| `/validation-gate {gate}` | Run manual gate validation |
