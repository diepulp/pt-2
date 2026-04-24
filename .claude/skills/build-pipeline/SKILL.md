---
name: build-pipeline
description: Orchestrate specification-to-production builds from PRDs, EXEC-SPECs, FIB specs, or investigation docs — phased workstream execution with validation gates and checkpoint resume. Trigger on "build PRD-XXX", "execute this spec", "implement from EXEC-###", "resume the build", "run workstreams from", or any path under docs/10-prd/, docs/21-exec-spec/, or docs/issues/.
---

# Build Pipeline Orchestrator

## Entry Point

```
/build PRD-XXX                                 # Execute PRD by ID
/build PRD-XXX --resume                        # Resume from checkpoint
/build docs/issues/perf/INVESTIGATION.md       # Execute investigation doc
/build docs/10-prd/PRD-022-feature-name.md     # Execute PRD by path
/build EXEC-003                                # Execute existing EXEC-SPEC (skip generation)
/build --resume                                # Resume most recent checkpoint
```

## Supported Input Types

| Input Format | Example | Resolution |
|--------------|---------|------------|
| PRD identifier | `PRD-003` | `docs/10-prd/PRD-003*.md` |
| PRD file path | `docs/10-prd/PRD-022-feature.md` | Direct path |
| EXEC-SPEC ID | `EXEC-003` | `docs/21-exec-spec/EXEC-003*.md` |
| EXEC-SPEC path | `docs/21-exec-spec/EXEC-003-csv-import.md` | Direct path |
| FIB-H (prose) | `docs/issues/gaps/.../FIB-XXX.md` | Direct path — human scope authority |
| FIB-S (structured) | `docs/issues/gaps/.../FIB-XXX.structured.json` | Direct path — machine traceability authority |
| Investigation doc | `docs/issues/perf/INVESTIGATION.md` | Direct path |
| Any spec path | `docs/20-architecture/specs/ADR-029/EXEC-SPEC.md` | Direct path |

This skill accepts any specification document with implementation requirements — not just PRDs.

## Resources

| Reference | Purpose |
|-----------|---------|
| `references/expert-routing.md` | Two-stage generation: domain→expert skill mapping + executor registry |
| `references/execution-spec-template.md` | YAML + markdown template for workstreams |
| `references/gate-protocol.md` | Gate approval UX and validation commands |
| `references/checkpoint-format.md` | Checkpoint schema and state management |
| `references/intake-traceability-protocol.md` | FIB-S enforcement: capability inventory, anti-invention, open questions |
| `scripts/validate-execution-spec.py` | Validate EXECUTION-SPEC (structural + governance) |
| `scripts/classify-write-path.py` | Deterministic write-path signal scan for E2E mandate |
| `scripts/temporal-integrity.py` | Flag upstream PRD/ADRs modified after EXEC-SPEC generation |

---

## Input Resolution

```
/build <argument>

If argument == "--resume":
  -> load most recent checkpoint, continue

If argument matches PRD-XXX:
  -> resolve to docs/10-prd/PRD-XXX*.md
  -> run GOV-010 prerequisite check
  -> resolve FIB chain

If argument matches EXEC-###:
  -> resolve to docs/21-exec-spec/EXEC-###*.md
  -> skip EXEC-SPEC generation (already exists)

If argument is a file path:
  -> use directly
  -> run GOV-010 if it's a PRD, resolve FIB chain if PRD
```

---

## Complexity Pre-Screen (Pipeline Path Selection)

After input resolution, a quick complexity check picks the path. This is the single gate that decides how much ceremony the spec needs — there is no second tier selector later.

**Low-complexity indicators** (all must be true for streamlined path):
- No migration or schema workstreams (no new tables, columns, RPCs)
- No RLS policy changes
- No new SECURITY DEFINER functions
- No new bounded contexts — all work stays within existing services
- No new public API endpoints — all routes already exist
- Workstream count ≤ 4

**If all true → Streamlined path:**
1. Single-stage EXEC-SPEC (lead-architect scaffold only, no expert consultation)
2. Structural + governance validation
3. Approval gate
4. Execution

**If any false → Full path:** Stages 0–3 below, including per-workstream expert consultation.

Display the pre-screen result:

```
[COMPLEXITY PRE-SCREEN] {PRD-ID}
─────────────────────────────────────────
Migrations:        {yes/no}
RLS changes:       {yes/no}
SECURITY DEFINER:  {yes/no}
New bounded ctx:   {yes/no}
New API surfaces:  {yes/no}
WS count estimate: {N}
─────────────────────────────────────────
Path: {Streamlined | Full}
Override: reply "full" or "streamlined" to change.
```

Record in checkpoint: `complexity_prescreen: "streamlined" | "full"`, and `complexity_override` if changed.

---

## Intake Authority Chain (FIB → PRD → EXEC-SPEC)

When a PRD references a Feature Intake Brief, the pipeline enforces a strict authority chain. The FIB defines what may exist, the PRD constrains requirements to that boundary, and the EXEC-SPEC constrains implementation to all three.

```
FIB-H (prose)         → human scope authority (frozen after approval)
FIB-S (structured)    → machine-readable scope/completeness authority
PRD                   → product requirements constrained by both
EXEC-SPEC             → implementation plan constrained by all three
```

See `references/intake-traceability-protocol.md` for the full enforcement rules (traceability syntax, anti-invention boundaries, open-question decision records, behavior-assertion verification).

### FIB Resolution

The pipeline trusts the PRD's frontmatter shape (verified upstream by `prd-writer`) and only performs integrity checks:

1. If `structured_ref` is declared, verify the referenced file resolves on disk. If it doesn't → block on broken reference.
2. If `structured_ref` resolves, load FIB-S into pipeline context; record `fib_h_ref`, `fib_s_ref`, `fib_s_loaded: true` in checkpoint.
3. If `structured_ref` is absent, proceed in PRD-only mode (FIB-S gate checks become no-ops).

When FIB-S is loaded, anti-invention binds every downstream stage. Implementation plans are where "small" conveniences get introduced — an extra modal, a fallback endpoint, a silent DTO expansion, a helpful admin override. Each looks reasonable individually; collectively they erode the intake boundary. FIB-S is the machine-readable fence that catches these. EXEC-SPEC may introduce internal helpers, adapter DTOs, infrastructure workstreams, and implementation-detail choices — but not new operator-visible surfaces, public APIs, workflow side-paths, capabilities, or persisted shapes absent from FIB-S.

See `references/intake-traceability-protocol.md` for the allowed/disallowed list and the open-question decision record format.

---

## GOV-010 Prerequisite Check

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

Record `gov010_check` as `"passed"`, `"waived:{reason}"`, or `"pending"` in checkpoint.

---

## Pipeline Overview

```
Spec → [GOV-010 + FIB] → [Pre-Screen] → EXECUTION-SPEC → [Validate] → [Approve] → Execution → DoD
```

**Design principles:**
- **Sequential thinking**: Use `mcp__sequential-thinking__sequentialthinking` for EXECUTION-SPEC generation
- **Skills-only execution**: All workstreams dispatched via Skill tool (see `expert-routing.md`)
- **Human review is the sole gate**: No automated adversarial step in the pipeline — `y` executes, `n` pauses for manual edit + `/build --resume`.
- **Preserve on failure**: Keep completed artifacts for manual fix and resume
- **Parallel execution**: Run independent workstreams concurrently

---

## Phase 1: EXECUTION-SPEC Generation

See `references/expert-routing.md` for the full expert consultation protocol.

### Stage 0: Load Intake Authority (FIB-S only, when present)

The pipeline does not load governance/architecture/quality context files — domain experts own those rules in their own skills with current canonical citations. The only artifact this orchestrator loads at generation time is FIB-S, when the PRD references one.

When FIB-S is loaded, the EXEC generator uses it for capability inventory, rule/invariant enforcement, surface mapping, open-question handling, and workstream traceability. See `references/intake-traceability-protocol.md`.

### Stage 1: Architectural Scaffolding

Delegate to `lead-architect` via Skill tool. The general agent lacks bounded context ownership knowledge and produces incorrect phase ordering when it tries to design inline. lead-architect produces a workstream skeleton only (ID, name, type, bounded_context, dependencies) — it does not design granular workstream details.

**Streamlined path exception:** lead-architect produces the full spec in one pass without Stage 2 expert consultation.

### Stage 2: Expert Consultation (Full Path Only)

Delegate each workstream to its domain expert via Skill tool. Each expert receives only the workstream skeleton plus the FIB-S pointer (when loaded) and consults its own references for domain rules. The general agent lacks domain-specific pattern knowledge (ADR-015 RLS, DTO canonical, React 19 useTransition), which is why routing to experts matters — canonical rules live once, in the expert skill.

See `references/expert-routing.md` for:
- Full two-stage generation protocol
- Domain-to-expert skill routing table
- Expert consultation prompt template and response format
- Parallel consultation dispatch pattern

**Invoke experts in parallel** when workstreams have no design dependencies — send a single message with multiple `Skill` tool calls.

### Stage 3: Assemble & Validate

1. **Merge expert refinements** into final EXECUTION-SPEC.

2. **Upstream framing cross-check.** Verify the EXEC-SPEC Overview does not contradict upstream framing from the FIB or PRD. If the FIB characterizes the work as "not purely wiring" and the EXEC Overview reverts to "primarily wiring/integration", flag the contradiction — framing corrections must propagate downstream.

3. **Intake Traceability Audit (FIB-S gate).** When FIB-S is loaded, run before the approval gate:

   - **Workstream coverage**: every workstream has a `traces_to` field citing at least one FIB-S element (capability, rule, outcome, loop step) or `infrastructure`
   - **Capability coverage**: every capability in `zachman.how.capabilities` is referenced by at least one workstream
   - **Anti-invention — two-pass:**
     - Pass 1 (description): no workstream description introduces surfaces, APIs, or side-paths absent from `zachman.where.surfaces` or `containment.loop`
     - Pass 2 (output paths): extract every `app/api/` path from workstream `outputs` arrays; each extracted API path must match a declared surface in `zachman.where.surfaces[kind=api]`. Descriptions can omit paths that appear in outputs, so the path-level scan is load-bearing.
   - **Open-question disposition**: every item in `governance.open_questions_allowed_at_scaffold` is either resolved via a `decisions` record or carried forward in risks — none silently absent
   - **Hard rule visibility**: every `severity: "hard"` rule from `zachman.why.business_rules` appears in at least one workstream's acceptance criteria
   - **Decision-to-test injection**: for each resolved decision, inject a test requirement into the relevant test workstream (`"Verify DEC-{N}: {decision_statement excerpt}"`). Decisions with `verification: assumption` get a verification-focused test; `verification: cited` get a regression test.

   ```
   [INTAKE TRACEABILITY] EXEC-{ID} vs FIB-S {FIB-ID}
   ─────────────────────────────────────────────────────
   Workstream coverage:    {covered}/{total} capabilities
   Anti-invention (desc):  {clean|N violations}
   Anti-invention (paths): {matched}/{total} output paths verified
   Open questions:         {resolved}/{carried}/{missing}
   Hard rule visibility:   {covered}/{total} rules
   ─────────────────────────────────────────────────────
   ```

   Violations block the approval gate. Revise to remove the invention or request an intake amendment.

4. **Write-Path Classification (E2E Mandate).** Run the classifier:

   ```bash
   python .claude/skills/build-pipeline/scripts/classify-write-path.py \
       {prd_path} {exec_spec_path}
   ```

   The script emits JSON with `detected`, `signals[]`, and `has_e2e_workstream`. Branch on the verdict:

   - `detected == false` → record `write_path_classification: "none"` in checkpoint; skip to step 5.
   - `detected == true` and `has_e2e_workstream == true` → record `"detected"` in checkpoint; skip to step 5.
   - `detected == true` and `has_e2e_workstream == false` → display the banner below and auto-inject `WS_E2E`:

   ```
   [E2E MANDATE] PRD-{ID} ships write paths but has no E2E workstream.
   ─────────────────────────────────────────────────────────────────────
   Write-path signals detected:
     - {pattern} at {file}:{line} — {excerpt}

   Action: Adding E2E workstream (executor: e2e-testing) to EXEC-SPEC.
   Override: reply "skip-e2e" with justification to waive.
   ─────────────────────────────────────────────────────────────────────
   ```

   Auto-inject:
   ```yaml
   WS_E2E:
     name: E2E Write-Path Tests
     description: Playwright specs covering write-path user journeys
     executor: e2e-testing
     executor_type: skill
     depends_on: [all implementation workstreams]
     outputs:
       - e2e/{domain}/*.spec.ts
     gate: e2e-write-path
     estimated_complexity: medium
   ```

   Add `e2e-write-path` to the gates definition. Record `write_path_classification: "detected" | "none"` in checkpoint. If waived, record `e2e_mandate_waiver: "{reason}"`.

   Read-only PRDs: no E2E workstream required (read-only UI rendering is Tier 2 per workflows-gaps.md).

5. **Output** to `docs/21-exec-spec/EXEC-###-{slug}.md`.

6. **Validate** before proceeding:
   ```bash
   python .claude/skills/build-pipeline/scripts/validate-execution-spec.py \
       docs/21-exec-spec/EXEC-###-{slug}.md
   ```

   Checks:
   - **Structural**: YAML syntax, executor names, dependencies, gates
   - **Governance**: SRM ownership, test locations, migration standards, DTO patterns

   Both must pass before proceeding.

7. **Initialize checkpoint** (see `references/checkpoint-format.md`).

---

## Phase 2: Approval Gate

Before presenting the summary, run the temporal integrity check:

```bash
python .claude/skills/build-pipeline/scripts/temporal-integrity.py \
    {prd_path} {exec_spec_path}
```

The script emits JSON with `stale`, `stale_refs[]`, and `unresolved_adrs[]`. This is advisory — the human decides at the gate. If `stale == true`, append a `Temporal drift` block to the approval summary listing each stale ref (path, type, mtime) so the reviewer sees that upstream moved after the EXEC-SPEC was generated.

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

Validation: [PASS] Structural + Governance
{If FIB-S loaded: "Intake Traceability: [PASS]"}

{If temporal drift detected:
Temporal drift: {N} upstream artifact(s) modified after EXEC-SPEC generation:
  - {path} ({type}, modified {mtime})
  Consider regenerating if the drift is material.
}

Approve execution plan? [y/n/edit]
---------------------------------------------
```

---

## Phase 3: Phased Execution

> **BLOCKING REQUIREMENT — All workstream execution uses the Skill tool.**
> Do not implement workstreams inline. Each workstream is dispatched to its executor
> skill via `Skill(skill="{executor}", args="...")`. The general agent orchestrates
> (parse, dispatch, collect, validate) but does not write implementation code itself.

For each execution phase:

1. Parse workstreams from EXECUTION-SPEC YAML frontmatter
2. **Dispatch via Skill tool in parallel** (see pattern below)
3. Update checkpoint after each workstream completes
4. Run validation gate (see `references/gate-protocol.md`)
5. Pause for human approval before next phase

### CRITICAL: Parallel Skill Dispatch

Workstreams marked `parallel` in execution_phases must be dispatched using
**multiple Skill tool calls in a single message**:

```
When phase has parallel: [WS2, WS3], send ONE message with TWO Skill calls:

+-------------------------------------------------------------+
| SINGLE MESSAGE — multiple Skill tool calls:                  |
+-------------------------------------------------------------+
| Skill(skill="backend-service-builder", args="WS2...")        |
| Skill(skill="api-builder", args="WS3...")                    |
+-------------------------------------------------------------+
```

**Wrong pattern** (causes sequential execution):
```
Message 1: Skill(WS2) → wait
Message 2: Skill(WS3) → wait
```

### Executor Selection

Consult `references/expert-routing.md` for the complete workstream-to-skill mapping. All workstreams use Skills.

### Workstream Prompt Template

Each `Skill` call uses this template for the `args` parameter:

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
2. **E2E Mandate Gate (write-path PRDs only):**

   If `write_path_classification == "detected"` and no `e2e_mandate_waiver`:
   - Verify E2E spec files exist in `e2e/{domain}/` (at least one `*.spec.ts`)
   - Run `npx playwright test e2e/{domain}/ --reporter=list` (redirect to `/tmp`)
   - If no specs found or all fail:

   ```
   [E2E MANDATE BLOCK] PRD-{ID} ships writes but has no passing E2E specs.
   ─────────────────────────────────────────────────────────────────────
   Expected: e2e/{domain}/*.spec.ts
   Found:    {count} spec files, {pass}/{total} passing

   Options:
     1. Write E2E specs now (dispatch e2e-testing skill)
     2. Waive with justification (record in checkpoint)
     3. Abort pipeline
   ─────────────────────────────────────────────────────────────────────
   ```

3. Update `docs/MVP-ROADMAP.md` — mark PRD as complete
4. Generate summary of files created, tests passing, gates passed
5. Display final status via `/mvp-status`

---

## Gate Validation

See `references/gate-protocol.md` for gate types, commands, approval UX, and failure displays.

---

## Checkpoint Management

See `references/checkpoint-format.md` for the complete schema.

**Location**: `.claude/skills/build-pipeline/checkpoints/{ID}.json`

**Lifecycle**:
```
EXECUTION-SPEC Generated -> Initialize checkpoint (status: "initialized", set created_at + updated_at)
Workstream Completes     -> Update checkpoint (move WS to completed_workstreams, refresh updated_at)
Gate Passes              -> Update checkpoint (increment current_phase, refresh updated_at)
Spec Amendment Defers WS -> Update checkpoint (move WS to dormant_workstreams, record reason in artifacts)
Pipeline Completes       -> Update checkpoint (status: "complete", refresh updated_at)
```

A workstream never disappears from the graph — deferring it means moving it into `dormant_workstreams` so it stays accounted for. Reactivating a dormant workstream requires a spec amendment that moves it back into `pending_workstreams`.

**Resume**: When invoked with `--resume`:
1. Load checkpoint from `.claude/skills/build-pipeline/checkpoints/{ID}.json`
2. Display completed, in-progress, pending, and dormant workstreams (with dormant reasons)
3. Continue from first incomplete phase — dormant workstreams are tracked for accounting but excluded from the resume scan

**Key fields:**
- `gov010_check`: `"passed"` | `"waived:{reason}"` | `"pending"`
- `complexity_prescreen`: `"streamlined"` | `"full"`
- `fib_s_loaded`: boolean
- `write_path_classification`: `"detected"` | `"none"`

---

## Error Handling

On workstream failure: log error in checkpoint, preserve completed artifacts, display actionable error with suggested fix, pause for human intervention. See `references/gate-protocol.md` for failure display format and error categorization.

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `/build PRD-XXX` | Execute PRD from start |
| `/build EXEC-###` | Execute existing EXEC-SPEC |
| `/build --resume` | Resume from checkpoint |
| `/mvp-status` | Check MVP progress |
| `/validation-gate {gate}` | Run manual gate validation |
