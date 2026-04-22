---
name: build-pipeline
description: Orchestrate specification-to-production implementation with phased workstream execution, validation gates, and checkpoint-based resume. This skill should be used when the user asks to "build from a PRD", "execute a spec", "implement PRD-XXX", "run the build pipeline", "resume the build", "build this", "execute this EXEC-SPEC", or provides a path to any specification document (PRD, EXEC-SPEC, investigation doc, issue spec). Also triggers on requests to implement from a design document, execute findings, or run workstreams from an existing plan.
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
| `references/critic-checklist.md` | EXECUTION-SPEC quality validation criteria |
| `references/intake-traceability-protocol.md` | FIB-S enforcement: capability inventory, anti-invention, open questions |
| `scripts/validate-execution-spec.py` | Validate EXECUTION-SPEC (structural + governance) |
| `devils-advocate` skill | Single-pass adversarial EXEC-SPEC review |

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
3. Approval gate (DA skipped — validation provides sufficient coverage)
4. Execution

**If any false → Full path:** Stages 0–4 below, including a single DA pass.

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

When a PRD is the build input, check its frontmatter for `intake_ref` (FIB-H) and `structured_ref` (FIB-S):

**Admission rules:**

- **New PRDs** (created after this policy): `structured_ref` is required. Missing → fail admission:
  ```
  [FIB-S MISSING] PRD-{ID} has intake_ref but no structured_ref.
  ─────────────────────────────────────────────────────────────────
  New PRDs must reference a FIB-S structured artifact for intake
  traceability. Generate FIB-S from the intake brief, then add
  structured_ref to the PRD frontmatter.
  ─────────────────────────────────────────────────────────────────
  ```
- **Legacy PRDs** (no `intake_ref`): warn and proceed — PRD-only authority.
- **Transitional PRDs** (`intake_ref` present, `structured_ref` missing): warn with recommendation.

If both are present: verify files exist, load FIB-S into pipeline context, record `fib_h_ref`, `fib_s_ref`, `fib_s_loaded: true` in checkpoint.

When FIB-S is loaded, anti-invention binds every downstream stage. The reason this matters most at EXEC stage is that implementation plans are where "small" conveniences get introduced — an extra modal, a fallback endpoint, a silent DTO expansion, a helpful admin override. Each looks reasonable individually; collectively they erode the intake boundary. FIB-S is the machine-readable fence that catches these. EXEC-SPEC may introduce internal helpers, adapter DTOs, infrastructure workstreams, and implementation-detail choices — but not new operator-visible surfaces, public APIs, workflow side-paths, capabilities, or persisted shapes absent from FIB-S.

See the intake-traceability reference for the full allowed/disallowed list and for the open-question decision record format.

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
Spec → [GOV-010 + FIB] → [Pre-Screen] → EXECUTION-SPEC → [Validate] → [DA (full path only)] → [Approve] → Execution → DoD
```

**Design principles:**
- **Sequential thinking**: Use `mcp__sequential-thinking__sequentialthinking` for EXECUTION-SPEC generation
- **Skills-only execution**: All workstreams dispatched via Skill tool (see `expert-routing.md`)
- **Gate approval**: Pause after each phase for human review
- **Preserve on failure**: Keep completed artifacts for manual fix and resume
- **Parallel execution**: Run independent workstreams concurrently
- **Single-pass adversarial review**: One DA reviewer on the full path. No team, no magnitude scoring, no auto-retry.

---

## Phase 1: EXECUTION-SPEC Generation

See `references/expert-routing.md` for the full expert consultation protocol.

### Stage 0: Load Governance Context (Required)

Before generation, load:

```
references/architecture.context.md  # SRM ownership, DTO patterns, bounded context rules
references/governance.context.md    # Service template, migration standards, test locations
references/quality.context.md       # Test strategy, coverage targets, quality gates
FIB-S (if resolved)                 # Traceability authority
```

These files contain deterministic rules that must be validated against during spec generation. When FIB-S is loaded, the EXEC generator uses it for capability inventory, rule/invariant enforcement, surface mapping, open-question handling, and workstream traceability.

### Stage 1: Architectural Scaffolding

Delegate to `lead-architect` via Skill tool. The general agent lacks bounded context ownership knowledge and produces incorrect phase ordering when it tries to design inline. lead-architect produces a workstream skeleton only (ID, name, type, bounded_context, dependencies) — it does not design granular workstream details.

**Streamlined path exception:** lead-architect produces the full spec in one pass without Stage 2 expert consultation.

### Stage 2: Expert Consultation (Full Path Only)

Delegate each workstream to its domain expert via Skill tool. Each expert consultation must include governance context injection. The general agent lacks domain-specific pattern knowledge (ADR-015 RLS, DTO canonical, React 19 useTransition), which is why routing to experts matters.

See `references/expert-routing.md` for:
- Full two-stage generation protocol
- Domain-to-expert skill routing table
- Context injection protocol (which context sections to inject per domain)
- Expert consultation prompt template and response format
- Parallel consultation dispatch pattern

**Invoke experts in parallel** when workstreams have no design dependencies — send a single message with multiple `Skill` tool calls.

### Stage 3: Assemble & Validate

1. **Merge expert refinements** into final EXECUTION-SPEC.

2. **Upstream framing cross-check.** Verify the EXEC-SPEC Overview does not contradict upstream framing from the FIB or PRD. If the FIB characterizes the work as "not purely wiring" and the EXEC Overview reverts to "primarily wiring/integration", flag the contradiction — framing corrections must propagate downstream.

3. **Intake Traceability Audit (FIB-S gate).** When FIB-S is loaded, run before DA:

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

   Violations block DA. Revise to remove the invention or request an intake amendment.

4. **Write-Path Classification (E2E Mandate).** Scan the PRD and assembled EXEC-SPEC for write-path indicators: `INSERT`, `UPDATE`, `DELETE`, `withServerAction`, mutating RPCs, form submissions. If the PRD ships writes and no `e2e-tests` workstream exists:

   ```
   [E2E MANDATE] PRD-{ID} ships write paths but has no E2E workstream.
   ─────────────────────────────────────────────────────────────────────
   Write-path signals detected:
     - {signal_1}: {evidence}

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

### Stage 4: Adversarial Review (Single-Pass DA)

**Skip entirely on streamlined path.** Structural + governance validation already checked executor names, dependencies, SRM ownership, test locations, and migration standards. The cross-workstream contradiction surface is too small to justify a DA pass.

**On full path:** run one `devils-advocate` pass. One reviewer, one verdict, one decision point. No team, no magnitude scoring, no auto-retry — the human decides on BLOCK.

#### Temporal Integrity Check (pre-DA)

Before dispatching DA, compare the PRD's modified timestamp against the EXEC-SPEC's creation timestamp:

```
If prd.modified > exec_spec.created:
  Flag: "[TEMPORAL WARNING] {PRD-ID} modified after EXEC-SPEC was generated.
         EXEC-SPEC may not reflect current PRD state.
         Recommend regeneration before DA."
```

Also check ADRs referenced in `prd.adr_refs`:
```
For each ADR in prd.adr_refs:
  If adr.modified > exec_spec.created:
    Flag: "[TEMPORAL WARNING] {ADR-ID} modified after EXEC-SPEC was generated.
           EXEC-SPEC may reference stale ADR decisions."
```

If temporal warnings emit, present options:

1. **Regenerate EXEC-SPEC** — re-run Stages 1–3 with current upstream artifacts
2. **Proceed anyway** — acknowledge drift, let DA catch the delta
3. **Abort** — investigate the upstream change first

This check saves a DA cycle when upstream artifacts have changed since the EXEC-SPEC was generated.

#### DA Dispatch

```
Skill(skill="devils-advocate", args="Adversarial review of EXEC-SPEC for {PRD_ID}.

Specification: {exec_spec_path}
Workstreams:   {workstream_summary}
Bounded ctx:   {bounded_contexts}
FIB-S:         {fib_s_path if loaded, else 'none'}

Run in Focused Review Mode with full ground-truth verification.
Attack all sections. Return:
  - Verdict: Ship | Ship w/ gates | Do not ship
  - P0 findings (each with file path, line, ADR reference)
  - P1 findings
  - Patch Delta (max 15 bullets, prioritized)
")
```

The `devils-advocate` skill owns the review protocol — ADR-amendment rule, framing self-consistency, computation precision, ground-truth verification. Do not restate them here or in the dispatch prompt.

#### Verdict Handling

| Verdict | Action |
|---------|--------|
| **Ship** | PASS. Proceed to approval gate with verdict noted. |
| **Ship w/ gates** (no P0) | WARN. Present findings in approval gate; human decides. |
| **Do not ship** (P0 found) | BLOCK. Present findings to human — no automatic retry. |

#### On BLOCK — Human Decides

```
---------------------------------------------
[BLOCK] DA Review: Do not ship
---------------------------------------------

Verdict: Do not ship ({p0_count} P0, {p1_count} P1)

P0 Findings:
  1. {finding summary}
  2. {finding summary}

Patch Delta:
  - {item}
  - {item}

Options:
  1. Revise EXEC-SPEC (re-run Stages 1-3 with DA findings)
  2. Override with reason (record waiver, proceed to approval)
  3. Abort pipeline
---------------------------------------------
```

- **Revise:** re-run Stages 1–3 with DA findings as revision context. Increment `adversarial_review.attempt`. No automatic cap — each revision is a fresh human-driven decision.
- **Override:** record `adversarial_review.verdict = "overridden"` with `override_reason`. Proceed to approval gate.
- **Abort:** set checkpoint `status = "failed"`, record findings. Stop.

Record in checkpoint (full schema in `references/checkpoint-format.md`):

```typescript
adversarial_review: {
  verdict: "ship" | "ship_with_gates" | "do_not_ship" | "overridden" | "skipped";
  p0_count: number;
  p1_count: number;
  attempt: number;              // increments on each revision
  findings_path?: string;
  override_reason?: string;
}
```

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

Validation: [PASS] Structural + Governance

DA Review: [{VERDICT}] ({p0} P0, {p1} P1)
{If streamlined path: "Skipped — streamlined path"}
{If P0 > 0: list P0 findings}

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
EXECUTION-SPEC Generated -> Initialize checkpoint (status: "initialized")
Workstream Completes     -> Update checkpoint (move to completed_workstreams)
Gate Passes              -> Update checkpoint (increment current_phase)
Pipeline Completes       -> Update checkpoint (status: "complete")
```

**Resume**: When invoked with `--resume`:
1. Load checkpoint from `.claude/skills/build-pipeline/checkpoints/{ID}.json`
2. Display completed vs pending workstreams
3. Continue from first incomplete phase

**Key fields:**
- `gov010_check`: `"passed"` | `"waived:{reason}"` | `"pending"`
- `complexity_prescreen`: `"streamlined"` | `"full"`
- `fib_s_loaded`: boolean
- `write_path_classification`: `"detected"` | `"none"`
- `adversarial_review`: verdict, counts, attempt (schema in reference)

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
