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
| FIB-H (prose) | `docs/issues/gaps/.../FIB-XXX.md` | Direct path — human scope authority |
| FIB-S (structured) | `docs/issues/gaps/.../FIB-XXX.structured.json` | Direct path — machine traceability authority |
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
| `references/da-team-protocol.md` | **DA team protocol: prompt templates, two-phase review, synthesis-lead** |
| `references/intake-traceability-protocol.md` | **FIB-S enforcement: capability inventory, anti-invention audit, open-question handling** |
| `scripts/validate-execution-spec.py` | Validate EXECUTION-SPEC (structural + governance + intake traceability) |
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
  -> resolve FIB chain (see Intake Authority Chain)

If argument matches EXEC-###:
  -> resolve to docs/21-exec-spec/EXEC-###*.md
  -> skip EXEC-SPEC generation (already exists)

If argument is a file path:
  -> use directly
  -> run GOV-010 check if it's a PRD
  -> resolve FIB chain if PRD (see Intake Authority Chain)
```

---

## Complexity Pre-Screen

After input resolution but before full pipeline execution, perform a quick complexity assessment to determine which pipeline path to use. This prevents heavy ceremony for work that doesn't need it.

**Low-complexity indicators** (all must be true for streamlined path):
- No migration or schema workstreams expected (no new tables, columns, RPCs)
- No RLS policy changes
- No new SECURITY DEFINER functions
- No new bounded contexts — all work stays within existing services
- No new public API endpoints — all routes already exist
- Workstream count <= 4

**If all indicators are true** → **Streamlined path:**
1. Single-stage EXEC-SPEC generation (lead-architect scaffold only, no expert consultation)
2. Validation (structural + governance)
3. Approval gate (skip DA team — Tier 0 auto-qualified)
4. Execution

**If any indicator is false** → **Full pipeline** (Stages 0-4 as described below)

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
Path: {Streamlined | Full Pipeline}
Override: reply "full" or "streamlined" to change.
```

Record in checkpoint: `complexity_prescreen: "streamlined"` or `"full"`, and `complexity_override` if changed.

---

## Intake Authority Chain

When a PRD references a Feature Intake Brief (FIB), the pipeline enforces a strict authority chain. The FIB defines what may exist, the PRD constrains requirements to that boundary, and the EXEC-SPEC constrains implementation to all three.

```
FIB-H (prose)         → human scope authority (frozen after approval)
FIB-S (structured)    → machine-readable scope/completeness authority
PRD                   → product requirements constrained by both
EXEC-SPEC             → implementation plan constrained by all three
```

### FIB Resolution

When a PRD is the build input, check its frontmatter for `intake_ref` and `structured_ref`:

```yaml
# PRD frontmatter fields that link to FIB
intake_ref: docs/issues/gaps/.../FIB-XXX.md          # FIB-H
structured_ref: docs/issues/gaps/.../FIB-XXX.structured.json  # FIB-S
```

**Admission rules:**

- **New PRDs** (created after this policy): `structured_ref` is **required**. If missing, the pipeline **fails admission** with:
  ```
  [FIB-S MISSING] PRD-{ID} has intake_ref but no structured_ref.
  ─────────────────────────────────────────────────────────────────
  New PRDs must reference a FIB-S structured artifact for intake
  traceability. Generate FIB-S from the intake brief, then add
  structured_ref to the PRD frontmatter.
  ─────────────────────────────────────────────────────────────────
  ```
- **Legacy PRDs** (no `intake_ref` at all): warn and proceed — no FIB chain, PRD-only authority.
- **Transitional PRDs** (`intake_ref` exists, `structured_ref` missing): warn with recommendation to generate FIB-S before building.

If both are present:
1. Verify both files exist
2. Load FIB-S into pipeline context — this is the **traceability authority** for EXEC generation
3. Record in checkpoint: `fib_h_ref`, `fib_s_ref`, `fib_s_loaded: true`

### Anti-Invention Policy

When FIB-S is present, the following constraints bind every downstream stage. The reason this matters most at EXEC stage: implementation plans are where "small" conveniences get introduced — an extra modal, a fallback endpoint, a silent DTO expansion, a helpful admin override, a temporary bypass. Each looks reasonable individually. Collectively they erode the intake boundary. The FIB-S is the machine-readable fence that catches these.

**EXEC-SPEC must not:**
- Add new operator-visible surfaces not in `zachman.where.surfaces`
- Add new public API endpoints not in `zachman.where.surfaces`
- Add new workflow side-paths not in `containment.loop`
- Add new operator outcomes not in `traceability.outcomes`
- Add new capabilities not in `zachman.how.capabilities`
- Add new domain DTOs or persisted shapes that alter scope semantics beyond what `zachman.what.entities` declares
- Relax hard rules from `zachman.why.business_rules` where `severity: "hard"`
- Relax invariants from `zachman.why.invariants`

**EXEC-SPEC may:**
- Introduce internal helper types, adapter DTOs, or mapper utilities that do not change capability, surface, or workflow scope
- Refine implementation details (file paths, executor selection, phase ordering)
- Add standard infrastructure workstreams (tests, migrations, type generation)
- Resolve open questions **if explicitly recorded as decisions** (see Open-Question Resolution below)

### Workstream Traceability Requirement

Every EXEC workstream must trace to at least one of:
- `zachman.how.capabilities` — which capability does this workstream implement?
- `zachman.why.business_rules` — which rule does this workstream enforce?
- `traceability.outcomes` — which outcome does this workstream serve?
- `containment.loop` — which loop step(s) does this workstream realize?

This turns the policy from "don't invent" into "prove why this work item exists." A workstream that cannot cite at least one FIB-S element is either:
1. A standard infrastructure workstream (tests, type generation, migrations) — acceptable, cite `infrastructure` as the trace
2. An invention that the intake does not authorize — flag for review

The EXEC-SPEC YAML should include a `traces_to` field per workstream when FIB-S is present:
```yaml
WS1:
  name: End Visit UI Wiring
  traces_to: [CAP:end_visit_from_rating_slip_modal, OUT-1, RULE-1, END-2, END-3]
  # ...
```

### Open-Question Resolution Protocol

Open questions from `governance.open_questions_allowed_at_scaffold` may be resolved at EXEC stage, but only with explicit decision records. Each resolution must include:

```yaml
# Illustrative format only — the example decision content is not a
# recommended domain ruling. Actual decisions require domain review.
decisions:
  - decision_id: DEC-001
    resolves_open_question: "OQ-2"
    decision_statement: "The pending-continuation toast dismisses on Escape key press and after 30 seconds of inactivity, using the existing toast auto-dismiss pattern."
    rationale: "Existing toast infrastructure already supports timeout and keyboard dismiss. No new UI component is needed, satisfying RULE-7."
    impact_on_scope: none  # none | amendment_required
```

- `impact_on_scope: none` — the decision stays within intake boundaries, no amendment needed
- `impact_on_scope: amendment_required` — the decision expands scope; pipeline **blocks** until the FIB is amended and the PRD updated
- `verification: cited` — decision is backed by code/SQL evidence (file path + line cited in rationale)
- `verification: assumption` — decision asserts existing behavior without ground-truth verification; must be flagged as "assumption pending WS verification" and a verification test injected into the relevant test workstream

**Behavior Assertion Verification Rule:** When a decision resolves an open question by asserting *existing system behavior* (e.g., "RPC X tolerates NULL Y"), the pipeline must verify the claim against the actual code or SQL before marking `impact_on_scope: none`. Read the relevant file, cite the path and line in the rationale. If verification is not feasible at EXEC stage, mark `verification: assumption` — this automatically generates a verification test case in the relevant test workstream. A decision that depends on unverified behavior must not use `impact_on_scope: none` without evidence.

Open questions that are **not** resolved at EXEC stage must appear in the EXEC-SPEC's risks section as carried-forward items. They must not silently disappear into hand-wavy task descriptions.

See `references/intake-traceability-protocol.md` for the full enforcement protocol.

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
FIB-S (if resolved)                 # Intake traceability authority (capabilities, rules, surfaces, open questions)
```

These files contain deterministic rules that MUST be validated against during spec generation.

When FIB-S is loaded, the EXEC generator uses it for:
- **Capability inventory** — workstreams map to declared capabilities, not invented ones
- **Rule and invariant enforcement** — hard constraints stay visible at implementation planning time
- **Surface and touchpoint mapping** — EXEC does not quietly add new surfaces, APIs, or side-paths
- **Open-question handling** — unresolved items are either explicitly resolved as decisions or carried forward visibly
- **Traceability checks** — each work item traces back to capability, rule, outcome, and loop step

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

   **6a. Upstream Framing Cross-Check:**

   Before proceeding to traceability audit, verify the EXEC-SPEC Overview section does not contradict the upstream framing from the FIB or PRD:
   - If FIB Section C explicitly states the work is "not purely wiring" or similar characterization, the EXEC Overview must not revert to "primarily wiring/integration"
   - If the PRD Section 1 establishes a scope characterization, the EXEC must preserve it
   - Extract key framing assertions from the FIB-H and PRD first section and compare against the EXEC Overview. Flag contradictions — upstream framing corrections must propagate downstream.

7. **Intake Traceability Audit (FIB-S gate, when loaded):**

   If FIB-S was loaded in Stage 0, run the traceability audit before proceeding:

   a. **Workstream coverage** — every workstream has a `traces_to` field citing at least one FIB-S element (capability, rule, outcome, or loop step). Infrastructure workstreams cite `infrastructure`.
   b. **Capability coverage** — every capability in `zachman.how.capabilities` is referenced by at least one workstream. Report uncovered capabilities.
   c. **Anti-invention scan** — two-pass check:
      - **Pass 1 (description-level):** No workstream description introduces operator-visible surfaces, public API endpoints, or workflow side-paths absent from `zachman.where.surfaces` or `containment.loop`.
      - **Pass 2 (output-path extraction):** Extract every `app/api/` path from all workstream `outputs` arrays. Each extracted API path must match a declared surface in `zachman.where.surfaces[kind=api]`. Any unmatched API path is a violation — the description-level scan alone is insufficient because workstream descriptions can omit paths that appear in outputs.
   d. **Open-question disposition** — every item in `governance.open_questions_allowed_at_scaffold` is either resolved via a `decisions` record or carried forward in the EXEC-SPEC risks section. None may be silently absent.
   e. **Hard rule visibility** — every `severity: "hard"` rule in `zachman.why.business_rules` appears in at least one workstream's acceptance criteria or constraints.

   f. **Decision-to-test injection** — after the `decisions` block is assembled, scan each resolved decision and inject a corresponding test requirement into the relevant test workstream: `"Verify DEC-{N}: {decision_statement excerpt}"`. Decisions with `verification: assumption` get a verification-focused test; decisions with `verification: cited` get a regression test. This is part of Stage 3 assembly — it must not be left for DA review or execution to discover.

   ```
   [INTAKE TRACEABILITY] EXEC-{ID} vs FIB-S {FIB-ID}
   ─────────────────────────────────────────────────────
   Workstream coverage:    {covered}/{total} capabilities
   Anti-invention (desc):  {clean|N violations}
   Anti-invention (paths): {matched}/{total} output paths verified
   Open questions:         {resolved}/{carried}/{missing}
   Hard rule visibility:   {covered}/{total} rules
   ─────────────────────────────────────────────────────
   {If violations: list each with workstream ID, output path, and FIB-S element}
   ```

   Violations block progression to DA review. The EXEC must be revised to either remove the invention or request an intake amendment.

8. **Write-Path Classification (E2E Mandate):**

   Scan the PRD and assembled EXEC-SPEC for write-path indicators. A PRD "ships writes"
   if any workstream involves `INSERT`, `UPDATE`, `DELETE`, server actions (`withServerAction`),
   RPCs that mutate state, or form submissions that persist data.

   ```
   Write-path signals (any one triggers the mandate):
     - Migration workstreams with INSERT/UPDATE/DELETE grants
     - Route handler workstreams using withServerAction
     - Service workstreams with mutation operations (create, update, delete)
     - RPC workstreams with SECURITY DEFINER that mutate
     - Frontend workstreams with form submissions or mutation hooks
   ```

   **If the PRD ships writes and no `e2e-tests` workstream exists:**

   ```
   [E2E MANDATE] PRD-{ID} ships write paths but has no E2E workstream.
   ─────────────────────────────────────────────────────────────────────
   Per Test-per-PRD mandate (workflows-gaps.md §3), every PRD shipping
   writes MUST include a Playwright E2E spec in its Definition of Done.

   Write-path signals detected:
     - {signal_1}: {evidence}
     - {signal_2}: {evidence}

   Action: Adding E2E workstream (executor: e2e-testing) to EXEC-SPEC.
   The workstream will depend on all implementation workstreams and
   produce specs in e2e/{domain}/.

   Override: reply "skip-e2e" with justification to waive.
   ─────────────────────────────────────────────────────────────────────
   ```

   Auto-inject an E2E workstream into the EXEC-SPEC:
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

   Add the workstream to the final execution phase, and add `e2e-write-path` to the
   gates definition. Record the classification in the checkpoint:
   `write_path_classification: "detected"` or `"none"`, and if waived:
   `e2e_mandate_waiver: "{reason}"`.

   **If the PRD does NOT ship writes:** No E2E workstream is required (read-only UI
   rendering is Tier 2 per workflows-gaps.md — desirable but not mandated).

8. Output to `docs/21-exec-spec/EXEC-###-{slug}.md`
9. **CRITICAL: Run validation before proceeding**:
   ```bash
   python .claude/skills/build-pipeline/scripts/validate-execution-spec.py \
       docs/21-exec-spec/EXEC-###-{slug}.md
   ```

   The validation script checks:
   - **Structural**: YAML syntax, executor names, dependencies, gates
   - **Governance**: SRM ownership, test locations, migration standards, DTO patterns

   Both must pass before proceeding.

10. Initialize checkpoint file immediately (see `references/checkpoint-format.md`)

### Stage 4: Adversarial Review (DA Team)

12. **Temporal Integrity Check (pre-DA gate):**

    Before deploying the DA team, compare the PRD's modified timestamp against the
    EXEC-SPEC's creation timestamp. If the PRD was modified after the EXEC-SPEC was
    generated, the spec may not reflect the current requirements:

    ```
    If prd.modified > exec_spec.created:
      Flag: "[TEMPORAL WARNING] {PRD-ID} modified after EXEC-SPEC was generated.
             EXEC-SPEC may not reflect current PRD state.
             Recommend EXEC-SPEC regeneration before DA review."
    ```

    Also check ADRs referenced in the PRD frontmatter:
    ```
    For each ADR in prd.adr_refs:
      If adr.modified > exec_spec.created:
        Flag: "[TEMPORAL WARNING] {ADR-ID} modified after EXEC-SPEC was generated.
               EXEC-SPEC workstreams may reference stale ADR decisions."
    ```

    If temporal warnings are emitted, present them to the user with options:
    1. **Regenerate EXEC-SPEC** — re-run Stages 1-3 with current upstream artifacts
    2. **Proceed anyway** — acknowledge drift, let DA team catch the delta
    3. **Abort** — investigate the upstream change first

    This check saves an entire DA review cycle when upstream artifacts have changed
    since the EXEC-SPEC was generated.

13. **Magnitude Assessment (DA tier selection):**

    Before deploying reviewers, compute a magnitude score from the EXEC-SPEC and its
    upstream artifacts. The score determines how much review overhead is justified.

    **Scoring rubric — read these from the EXEC-SPEC YAML and PRD:**

    | Signal | Points | Source |
    |--------|--------|--------|
    | Cross-context bounded contexts > 1 | +3 | EXEC-SPEC YAML `bounded_contexts` or PRD scope |
    | Migration workstreams with RLS policies | +2 | EXEC-SPEC workstream descriptions mention RLS/migration |
    | SECURITY DEFINER workstreams present | +2 | EXEC-SPEC workstream descriptions |
    | ADR refs >= 2 | +2 | PRD frontmatter `adr_refs` |
    | Workstream count > 4 | +2 | EXEC-SPEC YAML workstream array length |
    | Execution phases > 2 | +1 | EXEC-SPEC YAML execution_phases length |
    | Dependency graph depth > 3 | +1 | Max chain length in EXEC-SPEC DAG |
    | Executor diversity > 3 distinct skills | +1 | Count unique executors in EXEC-SPEC |

    **Complexity discount signals** (reduce score when actual risk surface is small):

    | Signal | Points | Source |
    |--------|--------|--------|
    | No migration workstreams | -2 | EXEC-SPEC has no `database` or `migration` type workstreams |
    | No RLS workstreams | -1 | EXEC-SPEC has no `rls` type workstreams |
    | No SECURITY DEFINER workstreams | -1 | No workstream mentions SECURITY DEFINER |
    | All outputs modify existing files (no greenfield) | -1 | No new services, tables, or RPCs |

    These discounts prevent mechanical over-scoring of wiring-only PRDs. A PRD that scores +8 from cross-context boundaries and ADR refs but has zero migrations, zero RLS, and zero SECURITY DEFINER work is fundamentally lower-risk than the raw score suggests. Minimum score after discounts is 0.

    **Tier thresholds:**

    | Score | Tier | Action |
    |-------|------|--------|
    | 0-2 | **Tier 0: Self-Certified** | No DA team. Structural + governance validation (Stage 3) provides sufficient coverage. |
    | 3-5 | **Tier 1: Focused Review** | 1-2 targeted reviewers, no synthesis-lead. See `references/da-team-protocol.md` § Focused Review Protocol. |
    | 6+ | **Tier 2: Full DA Team** | Full 6-agent team with two-phase protocol. |

    **Display the assessment before acting:**

    ```
    ---------------------------------------------
    DA Review Magnitude Assessment: {PRD-ID}
    ---------------------------------------------

    Signal Breakdown:
      [+N] {signal description}: {evidence}
      [+N] {signal description}: {evidence}
      ...
      ────
      Score: {total} → Tier {N} ({tier_name})

    {tier-specific message}
    Override: reply "tier 0", "tier 1", or "tier 2" to change.
    ---------------------------------------------
    ```

    Record magnitude in checkpoint: `adversarial_review.magnitude_score`,
    `adversarial_review.magnitude_tier`, `adversarial_review.magnitude_signals[]`.
    If the user overrides: `adversarial_review.tier_override`, `adversarial_review.tier_override_reason`.

    **Tier-specific behavior:**

    **Tier 0 (Self-Certified):** Record `adversarial_review.magnitude_tier = "self_certified"`.
    Display: "Structural + governance validation (Stage 3) provides sufficient coverage.
    Skipping DA team review." Proceed directly to Phase 2 approval gate. The EXEC-SPEC
    validation script already checked structural integrity, SRM ownership, test locations,
    and migration standards — the cross-workstream contradiction surface is too small to
    justify a team.

    **Tier 1 (Focused Review):** Select 1-2 reviewers based on which signal categories fired.
    No synthesis-lead — the focused reviewer(s) produce an inline verdict. See
    `references/da-team-protocol.md` § Focused Review Protocol for reviewer selection logic.

    **Tier 2 (Full DA Team):** Proceed with full team deployment below.

14. **Deploy DA review team for EXEC-SPEC review (Tier 2 only, or Tier 1 focused):**

    > For **Tier 2**: Deploy the full 6-agent team (5 reviewers + synthesis-lead).
    > The EXEC-SPEC is the implementation blueprint. Catching P0 flaws here costs ~0 code rework.
    > Catching them after Phase 3 execution costs significant rework.
    >
    > For **Tier 1**: Deploy only the selected reviewer(s) per focused review protocol.
    > For **Tier 0**: Skip — proceed to Phase 2 approval gate.

    See `references/da-team-protocol.md` for the complete team protocol, prompt templates, and phase timing.

    #### Step 4a: Team Setup & Dispatch

    **1. Create the DA review team:**

    ```
    TeamCreate(team_name="da-review-{PRD-ID}", description="DA review for {PRD-ID}")
    ```

    **2. Create tasks for each reviewer + synthesis:**

    ```
    TaskCreate: "R1: Security & Tenancy review of {PRD-ID}"
    TaskCreate: "R2: Architecture & Boundaries review of {PRD-ID}"
    TaskCreate: "R3: Implementation Completeness review of {PRD-ID}"
    TaskCreate: "R4: Test Quality review of {PRD-ID}"
    TaskCreate: "R5: Performance & Operability review of {PRD-ID}"
    TaskCreate: "Synthesis: Consolidate DA findings for {PRD-ID}"
    ```

    **3. Spawn 6 named agents in a SINGLE message:**

    Each reviewer runs as an **independent agent with full tool access** (Read, Grep, Glob, Bash)
    AND **team messaging** (SendMessage) so reviewers can route cross-domain findings to the
    owning reviewer and resolve conflicts through direct negotiation.

    > **Why Agent teams, not isolated Agents?** The previous design spawned 5 independent agents
    > with no communication channel. Cross-domain findings became dead-drop one-liners that the
    > generalist orchestrator had to interpret. Conflicts were punted to the human. With team
    > messaging, reviewers verify cross-domain flags with the owning expert, negotiate conflict
    > resolution directly, and the synthesis-lead can ask targeted follow-up questions. This
    > produces higher-fidelity findings and pre-resolved conflicts.

    ```
    +-------------------------------------------------------------------------------------+
    | SINGLE MESSAGE — 6 parallel Agent calls (all with team_name="da-review-{PRD-ID}"):  |
    +-------------------------------------------------------------------------------------+
    | Agent(name="r1-security",      team_name="da-review-{PRD-ID}", prompt="...")         |
    | Agent(name="r2-architecture",  team_name="da-review-{PRD-ID}", prompt="...")         |
    | Agent(name="r3-implementation",team_name="da-review-{PRD-ID}", prompt="...")         |
    | Agent(name="r4-test-quality",  team_name="da-review-{PRD-ID}", prompt="...")         |
    | Agent(name="r5-performance",   team_name="da-review-{PRD-ID}", prompt="...")         |
    | Agent(name="synthesis-lead",   team_name="da-review-{PRD-ID}", prompt="...")         |
    +-------------------------------------------------------------------------------------+
    ```

    **DA Team Roster:**

    | Agent Name | Role Constant | Sections | Extra Context to Inject |
    |------------|---------------|----------|-------------------------|
    | `r1-security` | `SECURITY_TENANCY` | 1, 4 | SEC-002 guardrails, ADR-015/020/024/030/040 |
    | `r2-architecture` | `ARCHITECTURE_BOUNDARIES` | 5, 8 | SRM, `architecture.context.md`, Over-Engineering Guardrail |
    | `r3-implementation` | `IMPLEMENTATION_COMPLETENESS` | 2, 3 | `governance.context.md`, EXEC-SPEC template |
    | `r4-test-quality` | `TEST_QUALITY` | 7 | `quality.context.md`, test patterns, critical workflows |
    | `r5-performance` | `PERFORMANCE_OPERABILITY` | 6 | SLO definitions, query patterns, RLS performance |
    | `synthesis-lead` | `SYNTHESIS` | — | All context files (reads findings, does not review spec) |

    **Reviewer prompt template** — see `references/da-team-protocol.md` § Reviewer Prompt Template.

    **Synthesis-lead prompt template** — see `references/da-team-protocol.md` § Synthesis-Lead Prompt Template.

    #### Step 4b: Two-Phase Review Protocol

    The DA team executes a two-phase review coordinated by the synthesis-lead:

    **Phase 1 — Independent Deep-Dive:**
    Each reviewer completes their assigned sections independently with full ground-truth
    verification. When they find issues outside their domain, they send a **targeted message**
    to the owning reviewer via `SendMessage` — not a one-liner flag, but a substantive
    finding with file paths, line numbers, and what they need investigated.

    **Phase 2 — Cross-Pollination:**
    After completing their independent review, each reviewer:
    1. Reads incoming messages from other reviewers
    2. Investigates cross-domain flags that land in their domain
    3. Sends responses confirming or refuting findings
    4. If conflicts arise (e.g., R2 says "add X", R5 says "X violates PT-OE-01"),
       the involved reviewers negotiate directly via messaging and produce a joint recommendation

    The synthesis-lead monitors task completion, triggers Phase 2 when all reviewers
    report Phase 1 complete, and routes conflict resolution requests when needed.

    See `references/da-team-protocol.md` § Two-Phase Protocol for the full messaging sequence.

    #### Step 4c: Team-Driven Synthesis

    The `synthesis-lead` agent handles consolidation within the team:

    1. **Collects** all findings with severity labels (P0-P3) from all 5 reviewers
    2. **Deduplicates** — same root cause found by multiple reviewers gets merged, severity = max
    3. **Incorporates cross-domain verifications** — Phase 2 messages confirmed or refuted
       cross-domain flags; only verified findings survive
    4. **Reports conflict resolutions** — joint recommendations from reviewer negotiations
       replace raw contradictions. Unresolved conflicts (if any) are flagged for human decision
    5. **Computes consolidated verdict**:
       - All 5 "Ship" → **PASS**
       - Any "Ship w/ gates" (no P0) → **WARN**
       - Any "Do not ship" (P0 found) → **BLOCK**
    6. **Produces consolidated report** sent to the orchestrator via final task completion:
       - Consolidated Verdict + per-reviewer verdicts
       - Merged P0/P1 findings (deduplicated + cross-verified, max 15 items)
       - Resolved conflicts (with joint recommendations)
       - Unresolved conflicts (for human decision, if any)
       - Unified Patch Delta (15 bullets max, merged from all reviewer patch deltas)
       - Per-reviewer summary (1-2 lines each)

    The orchestrator extracts the consolidated report and records the DA team results
    in the checkpoint `adversarial_review` field (see `references/checkpoint-format.md`).

    #### Step 4d: Gate Logic

    - Consolidated verdict "Ship" (all 5 agree): **PASS**. Include verdict in Phase 2 display.
    - Consolidated verdict "Ship w/ gates": **WARN**. Present findings in Phase 2 approval gate. Human decides.
    - Consolidated verdict "Do not ship" (any P0): **BLOCK**. Enter retry protocol (see below).

    #### Step 4e: Team Cleanup

    After recording results:

    ```
    1. SendMessage(to="r1-security",      message={type: "shutdown_request"})
    2. SendMessage(to="r2-architecture",   message={type: "shutdown_request"})
    3. SendMessage(to="r3-implementation", message={type: "shutdown_request"})
    4. SendMessage(to="r4-test-quality",   message={type: "shutdown_request"})
    5. SendMessage(to="r5-performance",    message={type: "shutdown_request"})
    6. SendMessage(to="synthesis-lead",    message={type: "shutdown_request"})
    7. TeamDelete()
    ```

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

    Resolved Conflicts ({resolved_count}):
      - {R2 + R5}: {joint recommendation}

    Unresolved Conflicts ({unresolved_count}):
      - {R2 vs R5}: {description} — requires human decision

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
2. **E2E Mandate Gate (write-path PRDs only):**

   If `write_path_classification == "detected"` in checkpoint and no `e2e_mandate_waiver`:
   - Verify E2E spec files exist in `e2e/{domain}/` (at least one `*.spec.ts`)
   - Run `npx playwright test e2e/{domain}/ --reporter=list` (redirect to `/tmp`)
   - If no E2E specs found or all fail:

   ```
   [E2E MANDATE BLOCK] PRD-{ID} ships writes but has no passing E2E specs.
   ─────────────────────────────────────────────────────────────────────
   Ref: workflows-gaps.md §3 — Test-per-PRD mandate

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
