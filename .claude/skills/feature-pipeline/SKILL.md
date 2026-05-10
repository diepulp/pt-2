---
name: feature-pipeline
description: Linear feature development pipeline (design-time only) with explicit phase gates. Use this skill whenever the user wants to design a new feature, define feature scope, create a feature boundary, write a scaffold, author an RFC/design brief, produce a SEC note, freeze ADRs, or write a PRD. Also triggers on "new feature", "feature design", "scope this feature", "what should we build", "define requirements". Orchestrates prd-writer, lead-architect, and devils-advocate skills. Produces *what* and *why* artifacts; delegates *how* to build-pipeline. Do NOT trigger for implementation, building, executing specs, running workstreams, or coding — those belong to build-pipeline.
---

# Feature Development Pipeline

**Purpose:** Stop "requirements entropy" and endless ADR iterations by forcing bounded scope + measurable gates.

**Core Principle:** A feature design is *done* when:
1. Its **bounded context** is explicit (what's in/out)
2. Its **decisions** are locked in ADRs (durable, small, stable)
3. Its **PRD** references those ADRs and defines *what must be true*

Design doesn't build. **Build-pipeline does.**

---

## Quick Start

```
/feature-start player-identity-enrollment
```

This starts (or resumes) the 7-phase design pipeline with gates at each transition.

---

## Pipeline Phases

```
+---------------------------------------------------------------+
|  Phase 0: FIB Admission       -> Ingest FIB-H, generate FIB-S |
|     | GATE: fib-approved                                       |
|  Phase 1: SRM Check           -> Ownership sentence            |
|     | GATE: srm-ownership                                      |
|  Phase 2: Feature Scaffold    -> Intent + constraints + options |
|     | GATE: scaffold-approved                                   |
|  Phase 3: Design Brief / RFC  -> Direction + alternatives      |
|     | GATE: design-approved                                     |
|  Phase 4: SEC Note            -> Assets/threats/controls       |
|     | GATE: sec-approved                                        |
|  Phase 5: ADR(s)              -> Durable decisions ONLY        |
|     | GATE: adr-frozen                                          |
|  Phase 6: PRD                 -> Requirements + ADR references |
|     | GATE: prd-approved                                        |
|  HANDOFF -> /build PRD-###                                     |
+---------------------------------------------------------------+
```

Terminal phase is 6. On `prd-approved`, feature-pipeline records handoff and instructs user to run `/build PRD-###`. No EXEC-SPEC generation, no workstream execution — that's build-pipeline's domain.

---

## Phase 0: FIB Admission

**Purpose:** Ingest and validate the pre-existing Feature Intake Brief before any design work begins. The FIB-H is a human artifact — it must be authored and filed before this pipeline is invoked. The pipeline does not create it, prompt for it, or fill gaps in it.

### Admission check

Look for `docs/60-release/FIB-H-{feature-id}.md`.

**If missing:**

```
[HALT] No Feature Intake Brief found for '{feature-id}'.

The FIB must be completed by a human before this pipeline can run.

Template:  docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md  (§11 quick-use blank form)
Output to: docs/60-release/FIB-H-{feature-id}.md

Complete the brief, then re-invoke:
  /feature-start {feature-id}
```

Stop. Do not proceed to Phase 1.

**If present:** validate, then generate FIB-S.

### FIB-H Validation

Check each required section for completeness. Do not fill gaps on the human's behalf — flag each incomplete field as a blocking error and halt until the human corrects the FIB-H.

Required sections:
- **A. Feature identity** — name, ID, priority, date opened
- **B. Operator problem statement** — ≤1 paragraph, no architecture language
- **C. Pilot-fit justification** — tied to a concrete operator journey
- **D. Primary actor and operator moment** — actor, surface, trigger event
- **E. Feature Containment Loop** — 5–10 numbered steps (actor + action + system response each)
- **F. Required outcomes** — 3–7 bullets
- **G. Explicit exclusions** — ≥3 items
- **H. Adjacent ideas considered and rejected** — ≥2 table entries
- **L. Scope authority block** — intake version, frozen, signed

### FIB-S Generation

Parse the validated FIB-H and populate the Zachman-structured schema (`docs/60-release/zachman_interpolated_feature_intake_recommendation.md` §Proposed structured schema):

- `intent` ← §B operator problem, §C pilot fit, §F outcomes, §G exclusions, §H rejected ideas
- `zachman.what.entities` ← domain objects named in §E containment loop steps
- `zachman.how.capabilities` ← one capability per loop action verb
- `zachman.where` ← §D primary surface; any surfaces mentioned in loop steps
- `zachman.who` ← §D primary actor; permissions inferred from loop actions
- `zachman.when` ← §D trigger event; lifecycle transitions in loop steps
- `zachman.why` ← §F outcomes recast as rules; §G exclusions as negative invariants
- `containment.loop` ← §E steps as `{id, actor, action, system_response}` array
- `governance` ← §L scope authority block

Then set:
- `containment.frozen = true`
- `governance.scope_authority.frozen = true`
- `governance.downstream_expansion_allowed_without_amendment = false`
- At least one `traceability.capability_to_outcome` entry

Write to `docs/60-release/FIB-S-{feature-id}.json`.

**Gate: `fib-approved`**

Passes when ALL of the following are true:

**FIB-H validation passed** (all required sections present and non-empty)

**FIB-S completeness:**
- ≥1 entity under `zachman.what`
- ≥1 capability under `zachman.how`
- ≥1 surface or touchpoint under `zachman.where`
- ≥1 actor under `zachman.who`
- ≥1 trigger or lifecycle event under `zachman.when`
- ≥1 rule or invariant under `zachman.why`
- `containment.loop` has ≥5 steps
- `containment.frozen = true`
- `governance.scope_authority.frozen = true`
- `governance.downstream_expansion_allowed_without_amendment = false`
- ≥1 `traceability.capability_to_outcome` entry

**Coherence snapshot — on gate pass:**
- `coherence.non_goals[]` ← `intent.explicit_exclusions` from FIB-S
- `coherence.feature_loop[]` ← step IDs from `containment.loop`
- `coherence.feature_loop_frozen = true`
- `coherence.scope_authority` ← `governance.scope_authority` from FIB-S

These become the binding scope anchors for every subsequent phase. Any downstream artifact that introduces an entity, capability, actor, surface, or outcome absent from FIB-S is scope expansion and requires an Intake Amendment (`docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md` §9).

Phase 0 is intentionally narrow — ingestion and validation only. No design decisions are made here.

---

## Phase 1: SRM-First Ownership Contract

**Input:** Feature name/description
**Output:** Ownership sentence + bounded context table

> "This feature belongs to **{OwnerService}** and may only touch **{Writes}**; cross-context needs go through **{Contracts}**."

**Gate:** `srm-ownership` — If you can't write this sentence, you're not ready to design.

**Workflow:**
1. Load SRM (`docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`)
2. Identify owning bounded context(s)
3. List writes (tables/RPCs) and reads
4. Identify cross-context contracts (DTOs/RPCs)
5. Write ownership sentence
6. Create `docs/20-architecture/specs/{feature}/FEATURE_BOUNDARY.md` using `references/feature-boundary-template.md`
7. **Validate ownership** — verify declared tables against SRM using Grep:
   ```
   For each table in the boundary's "Writes" column:
     Grep the SRM for the table name
     Confirm it's owned by the declared service
     If owned by another service → gate fails (cross-context write violation)
   ```
   Record validated tables in checkpoint `srm_validation` field.

Phase 1 is intentionally lean — ownership sentence and write/read/contract table only. Narrative fields (goal, actor, scenario, metric, non-goals) belong in Phase 2 (Scaffold).

---

## Phase 2: Feature Scaffold

**Goal:** Pin intent, constraints, and decisions needed before design work begins.
**Rule:** Disposable, timeboxed (30-60 min). No implementation detail.

**Template:** `docs/01-scaffolds/TEMPLATE.md`
**Output:** `docs/01-scaffolds/SCAFFOLD-###-{feature}.md`

**Must Include:**
- **Intent:** What outcome changes after shipping
- **Primary Actor:** Specific role that triggers the feature
- **Success Metric:** One measurable outcome
- **Constraints:** Hard walls (security, compliance, domain, operational)
- **Non-goals:** 5+ explicit exclusions with justification
- **Options:** 2-4 max with tradeoffs
- **Decision to make:** Explicit statement of what needs deciding
- **Dependencies:** What must exist before this ships
- **Risks / Open questions:** Known unknowns with mitigation or learning plan

**Gate:** `scaffold-approved` — If you can't list 2+ options with tradeoffs and 5+ non-goals, you haven't thought enough.

**Coherence checkpoint:** On gate pass, verify scaffold non-goals are consistent with `coherence.non_goals[]` already captured at the Phase 0 FIB gate. Scaffold non-goals may elaborate or make more specific the FIB exclusions — they may not contradict or silently remove them. Do not overwrite `coherence.non_goals[]`; that field is owned by the FIB gate. If the scaffold surfaces a legitimate new non-goal not present in the FIB, record it as a candidate Intake Amendment rather than silently adding it.

**Delegates to:** Inline (orchestrator can do this — it's a framing doc, not domain-specific)

---

## Phase 3: Design Brief / RFC

**Goal:** Propose direction with enough detail to identify ADR-worthy decisions.
**Rule:** Funnel style — context -> scope -> overview -> details -> alternatives.

**Template:** `docs/02-design/TEMPLATE.md`
**Output:** `docs/02-design/RFC-###-{feature}.md`

**Must Include:**
- **Context:** Problem, forces, prior art
- **Scope & Goals:** In/out scope, success criteria
- **Proposed Direction:** Overview
- **Detailed Design:** Data model, service layer, API, UI, security
- **Surface Classification** (if feature introduces a new UI surface):
  - Rendering Delivery axis selection + rationale (per `SURFACE_CLASSIFICATION_STANDARD.md` §4 Q1)
  - Data Aggregation axis selection + rationale (per §4 Q2)
  - Preliminary truth-bearing metrics list with proposed MEAS-IDs
- **Cross-Cutting Concerns:** Performance, migration, observability
- **Alternatives Considered**
- **Decisions Required:** Each decision that needs an ADR

Surface Classification is conditional — only required when the feature introduces a genuinely new UI surface (new page, new panel type, new data visualization). Enhancements to existing surfaces or backend-only features skip this.

**Gate:** `design-approved` — If you can't name the decisions that need ADRs, the design is incomplete.

**Coherence check:** Before passing the gate, verify the RFC scope does not violate any stored `coherence.non_goals[]` from the FIB (Phase 0). For each non-goal, confirm the RFC does not include it in scope. If a violation is detected, the gate fails with a coherence error — either revise the RFC or file an Intake Amendment (`docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md` §9) to formally expand scope.

**Surface classification check:** If the RFC detailed design section mentions "page", "panel", "dashboard", "form", or "component", prompt the user to confirm whether Surface Classification (ADR-041) is required. If yes and not present, gate fails.

**Delegates to:** `lead-architect` skill

---

## Phase 4: SEC Note (Tiny Threat Model)

**Goal:** Prevent "security later" from becoming "security never."
**Rule:** Small and explicit beats broad and vague.

**Template:** See `references/sec-note-template.md`

**Delegation:** Invoke `rls-expert` skill with security context:

```
Skill(skill="rls-expert", args="Generate SEC Note for feature '{feature_name}':
  Feature Boundary: {boundary_path}
  Scaffold: {scaffold_path}
  RFC: {rfc_path}
  Owning Service: {owner_service}
  Tables: {write_tables}

  Use the SEC Note template at .claude/skills/feature-pipeline/references/sec-note-template.md.
  Focus on: RLS policy requirements, SECURITY DEFINER governance (ADR-018),
  actor binding (ADR-024 INV-8), tenant boundary analysis (SEC-002),
  and data classification for any PII or financial data.")
```

> **Why delegate?** The orchestrator lacks security domain expertise — it produces
> generic threat models that miss PT-2-specific attack vectors (casino-scoped tenant
> escape, spoofed audit trails, SECURITY DEFINER privilege escalation). The `rls-expert`
> skill knows ADR-015/018/020/024/030 patterns and produces SEC notes that map directly
> to implementation controls.

**Must Include:**
- **Assets:** What must be protected (PII, identity docs, player list, etc.)
- **Threats:** Enumeration, spoofed audit, cross-casino leakage, privilege creep
- **Controls:** RLS rules, actor binding, hashing/encryption stance, rate limits
- **Deferred Risks:** Explicitly allowed risks for MVP (and why)

**Gate:** `sec-approved` — If you store sensitive values, you must justify storage form.

---

## Phase 5: ADR(s) (Only for Durable Decisions)

**Goal:** Capture decisions that are hard to reverse or reused widely.
**Rule:** ADR != diary. ADR is for **durable** architecture decisions.

**Delegation:** Invoke `lead-architect` skill

**ADR-Worthy Examples:**
- "Identity stored as hash + last4 (no plaintext doc number)."
- "CSV import uses streaming parser (not load-all-into-memory)."
- "Actor binding uses `app.actor_id` session var + DB enforcement."

**What Goes in ADR:**
- Context, Decision, Consequences
- Security invariants (INV-1, INV-2, etc.)
- Bounded context ownership
- Access control matrix
- Alternatives considered

**What Does NOT Go in ADR:**
- RLS policy SQL (-> EXEC-SPEC, owned by build-pipeline)
- Trigger bodies (-> EXEC-SPEC)
- Index definitions (-> EXEC-SPEC)
- Migration steps (-> EXEC-SPEC)

**Gate:** `adr-frozen` — ADR contains only context/decision/consequences, no SQL/code. Implementation detail goes to EXEC-SPEC via build-pipeline.

**Coherence check:** Verify ADR decisions do not require capabilities listed in `coherence.non_goals[]`. If an ADR decision's consequences depend on an excluded FIB item, the gate fails — either revise the ADR or file an Intake Amendment (`docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md` §9) and update `coherence.non_goals[]`.

---

## Phase 6: PRD

**Goal:** Define *what must be true* with testable statements. Now has FIB-H, FIB-S, scaffold, RFC, SEC note, and ADR(s) as input context.
**Rule:** PRD references ADR IDs for mechanism decisions. If changing a library requires rewriting the PRD, reject it.

**Delegation:** Invoke `prd-writer` skill

**Must Include:**
- User flows (happy path + 2-3 critical unhappy paths)
- Acceptance criteria as verifiable statements
- Out of scope (reiterated)
- Data classification (PII / financial / compliance / operational)
- `scaffold_ref:` frontmatter field pointing to scaffold
- `adr_refs:` frontmatter field listing ADR IDs

**Adversarial Review (DA Team):**

After `prd-writer` produces the PRD, run the **temporal integrity check** and then
deploy a **DA review team** to attack the PRD against all preceding artifacts.

**Temporal Integrity Check (pre-DA gate):**

Before deploying the DA team, compare the modified timestamps of all Phase 0-5
artifacts against the PRD's created timestamp. If any upstream artifact was modified
after the PRD was written, the PRD may not reflect the current state of its inputs:

```
For each artifact in [fib_h, fib_s, feature_boundary, scaffold, rfc, sec_note, adr]:
  If artifact.modified > prd.created:
    Flag: "[TEMPORAL WARNING] {artifact} modified after {PRD-ID} was written.
           PRD may not reflect current {artifact_type} state.
           Recommend PRD refresh before DA review."
```

If temporal warnings are emitted, present them to the user with options:
1. **Refresh PRD** — delegate back to `prd-writer` to incorporate upstream changes
2. **Proceed anyway** — acknowledge drift, let DA team catch the delta
3. **Abort** — investigate the upstream change first

This check saves an entire DA review cycle when upstream artifacts have changed
since the PRD was written — the DA team will likely find temporal drift issues that
could have been resolved by a simple PRD refresh.

**Magnitude Assessment (DA tier selection):**

Before deploying reviewers, compute a magnitude score from artifacts already in the
pipeline. The score determines how much review overhead is justified — a single-table
CRUD enhancement within an owned context doesn't need 4 adversarial agents.

**Scoring rubric — read these from the checkpoint and artifacts:**

| Signal | Points | Source |
|--------|--------|--------|
| Cross-context contracts exist | +3 | `checkpoint.srm_validation.cross_context_contracts.length > 0` |
| SEC note threat count >= 3 | +2 | Count `## Threat Details` subsections in SEC note |
| PII or financial data classification | +2 | SEC note `## Data Storage Justification` contains PII/financial |
| ADR count >= 2 | +2 | Count entries in `checkpoint.artifacts.adr` or PRD `adr_refs` |
| New SECURITY DEFINER RPCs declared | +2 | SEC note `## Controls` mentions SECURITY DEFINER |
| SEC note deferred risks > 0 | +1 | SEC note `## Deferred Risks` has entries |
| New UI surface (Surface Classification) | +1 | RFC contains Surface Classification section |
| Write tables > 3 | +1 | `checkpoint.srm_validation.write_tables.length > 3` |

**Tier thresholds:**

| Score | Tier | Action |
|-------|------|--------|
| 0-2 | **Tier 0: Self-Certified** | No DA team. Phase gates provide sufficient coverage. |
| 3-5 | **Tier 1: Focused Review** | 1-2 targeted reviewers, no synthesis-lead. See `references/da-team-protocol.md` § Focused Review Protocol. |
| 6+ | **Tier 2: Full DA Team** | Current 4-agent team with two-phase protocol. |

**Display the assessment before acting:**

```
---------------------------------------------
DA Review Magnitude Assessment: {feature-name}
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

**Tier-specific behavior:**

**Tier 0 (Self-Certified):** Record `da_review.magnitude_tier = "self_certified"` in
checkpoint. Display: "Phase gates (FIB, SRM, scaffold, SEC, ADR) provide sufficient coverage.
Skipping DA team review." Proceed directly to `prd-approved` gate. The 6 preceding phase
gates already validated each artifact independently — the cross-artifact contradiction
surface is too small to justify a team.

**Tier 1 (Focused Review):** Select 1-2 reviewers based on which signal categories fired.
No synthesis-lead — the focused reviewer(s) produce an inline verdict. See
`references/da-team-protocol.md` § Focused Review Protocol for reviewer selection logic
and the lightweight protocol.

**Tier 2 (Full DA Team):** The DA team catches scope creep between phases, security
controls that weren't carried forward, untestable acceptance criteria, and cross-artifact
incoherence. Deploy the full 4-agent team per the protocol below.

See `references/da-team-protocol.md` for the complete team protocol, prompt templates,
and phase timing.

> **Why a team, not a single reviewer?** A single `Skill()` invocation reviews only
> the PRD text. A team of independent `Agent()` reviewers can verify the PRD against
> the scaffold, RFC, SEC note, and ADR(s) simultaneously, cross-reference claims
> against the codebase, and flag contradictions between artifacts. Cross-domain
> findings are routed to the owning reviewer via `SendMessage` for verification.

**Step 1: Team Setup & Dispatch**

```
TeamCreate(team_name="da-prd-{PRD-ID}", description="DA review of {PRD-ID}")
```

Create tasks and spawn **4 agents** (3 reviewers + synthesis-lead) in a SINGLE message:

```
+------------------------------------------------------------------------------------+
| SINGLE MESSAGE — 4 parallel Agent calls (all with team_name="da-prd-{PRD-ID}"):   |
+------------------------------------------------------------------------------------+
| Agent(name="r1-scope-security",   team_name="da-prd-{PRD-ID}", prompt="...")       |
| Agent(name="r2-testability-arch", team_name="da-prd-{PRD-ID}", prompt="...")       |
| Agent(name="r3-cross-artifact",   team_name="da-prd-{PRD-ID}", prompt="...")       |
| Agent(name="synthesis-lead",      team_name="da-prd-{PRD-ID}", prompt="...")       |
+------------------------------------------------------------------------------------+
```

**DA Team Roster:**

| Agent Name | Role | Focus |
|------------|------|-------|
| `r1-scope-security` | SCOPE_SECURITY | Scope creep vs scaffold non-goals, SEC note controls carried forward, threat model gaps |
| `r2-testability-arch` | TESTABILITY_ARCHITECTURE | Acceptance criteria testability, ADR alignment, bounded context ownership, SRM compliance |
| `r3-cross-artifact` | CROSS_ARTIFACT_COHERENCE | Contradictions between scaffold/RFC/SEC/ADR/PRD, missing decisions, undefined behavior |
| `synthesis-lead` | SYNTHESIS | Coordinator — monitors completion, routes conflicts, produces consolidated report |

**Step 2: Two-Phase Review Protocol**

Same protocol as build-pipeline DA team (see `references/da-team-protocol.md`):
- **Phase 1**: Independent review. Cross-domain findings routed via `SendMessage`.
- **Phase 2**: Cross-pollination. Reviewers investigate inbox, confirm/refute, negotiate conflicts.

**Step 3: Team-Driven Synthesis**

Synthesis-lead produces consolidated report. Orchestrator extracts verdict.

**Step 4: Gate Logic**

- All 3 "Ship" → **PASS**. Proceed to `prd-approved`.
- Any "Ship w/ gates" (no P0) → **WARN**. Present findings, human decides.
- Any "Do not ship" (P0 found) → **BLOCK**. Enter retry protocol.

**Step 5: Team Cleanup**

```
SendMessage shutdown_request to all 4 agents → TeamDelete()
```

**Retry protocol (on BLOCK):**

Present consolidated P0 findings to the human:

```
---------------------------------------------
[BLOCK] PRD DA Review Failed (Attempt {N}/2)
---------------------------------------------

Reviewers:
  R1 Scope & Security:             {verdict} ({p0_count} P0, {p1_count} P1)
  R2 Testability & Architecture:   {verdict} ({p0_count} P0, {p1_count} P1)
  R3 Cross-Artifact Coherence:     {verdict} ({p0_count} P0, {p1_count} P1)

Consolidated P0 Findings ({total_count}):
  1. [{source_reviewer}] {P0 finding summary}
  2. [{source_reviewer}] {P0 finding summary}

Resolved Conflicts ({resolved_count}):
  - {joint recommendation}

Options:
  1. Revise PRD (delegate to prd-writer with DA findings)
  2. Override with reason (record waiver, proceed to handoff)
  3. Abort pipeline
---------------------------------------------
```

- **Option 1 (Revise):** Delegate back to `prd-writer` with DA findings as revision context.
  Re-run DA team after revision. Update attempt count.
- **Option 2 (Override):** Record override reason in checkpoint. Proceed to `prd-approved` gate
  with override noted in handoff display.
- **Option 3 (Abort):** Mark checkpoint `status` as `"failed"`, record DA findings. Stop.

**Max 2 DA team attempts.** After 2 consecutive "Do not ship" verdicts, the pipeline forces
a human decision: override-with-reason or abort. No further automatic revision loops.

**Gate:** `prd-approved` — If it can't be proven by a test, it's not a criterion. No unresolved P0 findings from adversarial review.

**Terminal phase**: On approval, output handoff instruction.

---

## Handoff (TERMINAL — Phase 6 is the last phase)

On `prd-approved`, the feature-pipeline is **DONE**. There is no Phase 7.

**STOP HERE.** Do not generate EXEC-SPECs, DOD gates, workstream definitions, execution phases,
or any implementation artifact. These belong exclusively to build-pipeline, which the user
invokes separately via `/build PRD-###`. The feature-pipeline's job ends the moment it
displays the handoff block below.

If you find yourself writing SQL, DOD checklists, workstream YAML, or EXEC-SPECs, you have
crossed the boundary. Stop immediately and display the handoff instead.

Display:

```
---------------------------------------------
Feature Design Complete: {feature-name}
---------------------------------------------

Artifacts:
  [PASS] FIB-H:     docs/60-release/FIB-H-{feature-id}.md
  [PASS] FIB-S:     docs/60-release/FIB-S-{feature-id}.json
  [PASS] Boundary:  docs/20-architecture/specs/{feature}/FEATURE_BOUNDARY.md
  [PASS] Scaffold:  docs/01-scaffolds/SCAFFOLD-###-{slug}.md
  [PASS] RFC:       docs/02-design/RFC-###-{slug}.md
  [PASS] SEC Note:  docs/30-security/SEC-NOTE-{slug}.md (or specs/{feature}/SEC_NOTE.md)
  [PASS] ADR(s):    docs/80-adrs/ADR-###-{slug}.md
  [PASS] PRD:       docs/10-prd/PRD-###-{slug}.md
  [PASS] DA Review: {verdict} ({P0_count} P0, {P1_count} P1)

Next: /build PRD-###
---------------------------------------------
```

Set checkpoint `status` to `"design-complete"` and `current_phase` to `6`. Do not increment
the phase beyond 6. Do not add `exec_spec`, `dod_gates`, `exec_spec_workstreams`, or
`execution_phases` fields to the checkpoint — those are build-pipeline state.

**Handoff boundary enforcement:** After setting status to `"design-complete"`, verify the
checkpoint does not contain forbidden fields. If any of `exec_spec`, `dod_gates`,
`exec_spec_workstreams`, or `execution_phases` exist, strip them and warn:

```
[BOUNDARY VIOLATION] Checkpoint contained build-pipeline fields: {field_names}
These have been removed. Feature-pipeline produces design artifacts only.
```

---

## Slash Commands

| Command | Purpose |
|---------|---------|
| `/feature-start <name>` | Start new pipeline at Phase 0 |
| `/feature-resume [name]` | Resume from last checkpoint |
| `/feature-status [name]` | Show current phase, gates passed/pending |
| `/feature-gate <gate>` | Run validation for a specific gate |

---

## Smart Detection Logic

```
/feature-start <argument>

If checkpoint exists for <argument>:
  -> resume from last phase
  -> re-check current gate if previously failed

If no checkpoint exists:
  -> start new pipeline at Phase 0
  -> create checkpoint

/feature-status [argument]
  -> display status (read-only)
  -> if no argument, show most recent feature
```

---

## State Management

### Checkpoint Structure (v3)

```json
{
  "schema_version": 3,
  "feature_id": "csv-player-import",
  "current_phase": 4,
  "status": "in_progress",
  "gates": {
    "fib-approved":      { "passed": true,  "timestamp": "2026-02-22T09:30:00Z" },
    "srm-ownership":     { "passed": true,  "timestamp": "2026-02-22T10:00:00Z" },
    "scaffold-approved": { "passed": true,  "timestamp": "2026-02-22T11:00:00Z" },
    "design-approved":   { "passed": true,  "timestamp": "2026-02-22T14:00:00Z" },
    "sec-approved":      { "passed": false, "timestamp": null },
    "adr-frozen":        { "passed": false, "timestamp": null },
    "prd-approved":      { "passed": false, "timestamp": null }
  },
  "artifacts": {
    "fib_h": "docs/60-release/FIB-H-csv-player-import.md",
    "fib_s": "docs/60-release/FIB-S-csv-player-import.json",
    "feature_boundary": "docs/20-architecture/specs/csv-player-import/FEATURE_BOUNDARY.md",
    "scaffold": "docs/01-scaffolds/SCAFFOLD-001-csv-player-import.md",
    "rfc": "docs/02-design/RFC-001-csv-player-import.md",
    "sec_note": null,
    "adr": null,
    "prd": null
  },
  "da_review": {
    "magnitude_score": 0,
    "magnitude_tier": null,
    "magnitude_signals": [],
    "tier_override": null,
    "tier_override_reason": null,
    "ran": false,
    "verdict": null,
    "p0_count": 0,
    "p1_count": 0,
    "attempt": 0,
    "override_reason": null,
    "team_name": null,
    "team_results": null,
    "cross_artifact_findings": 0,
    "resolved_conflicts": [],
    "unresolved_conflicts": []
  },
  "coherence": {
    "non_goals": [],
    "feature_loop": [],
    "feature_loop_frozen": false,
    "deferred_items": [],
    "scope_authority": {
      "artifact": "FEATURE_INTAKE_BRIEF",
      "version": "v0",
      "frozen": false
    },
    "violations": []
  },
  "srm_validation": {
    "ran": false,
    "owner_service": null,
    "write_tables": [],
    "cross_context_contracts": []
  },
  "branch": null,
  "working_directory": null,
  "timestamp": "2026-02-22T14:00:00Z"
}
```

### Checkpoint Invariants

These rules are non-negotiable. Violating them means the pipeline has crossed into build-pipeline territory.

- **`current_phase`** must be 0-6. There is no Phase 7.
- **`status`** must be one of: `"initialized"`, `"in_progress"`, `"design-complete"`, `"failed"`.
- **`gates`** keys must be from this set only: `fib-approved`, `srm-ownership`, `scaffold-approved`, `design-approved`, `sec-approved`, `adr-frozen`, `prd-approved`.
- **`artifacts`** keys must be from this set only: `fib_h`, `fib_s`, `feature_boundary`, `scaffold`, `rfc`, `sec_note`, `adr`, `prd`.
- **Gate order is strict:** `fib-approved` must pass before any other gate. A scaffold, RFC, SEC note, or ADR may not be written while `fib-approved` is false.
- **Forbidden fields**: `exec_spec`, `dod_gates`, `exec_spec_workstreams`, `execution_phases`. These are build-pipeline state. If you are about to write one of these fields, you have overrun the boundary — stop and display the handoff instead.
```

**Location:** `.claude/skills/feature-pipeline/checkpoints/{feature-id}.json`

**Migration (v1 → v2):** When loading a checkpoint without `schema_version`:

1. Set `schema_version: 2`
2. Map `gates_passed`/`gates_pending` arrays to the v2 `gates` object:
   ```
   For each gate in gates_passed: gates[gate] = { passed: true, timestamp: checkpoint.timestamp }
   For each gate in gates_pending: gates[gate] = { passed: false, timestamp: null }
   ```
3. Initialize missing fields with defaults:
   - `da_review`: `{ ran: false, verdict: null, p0_count: 0, p1_count: 0, attempt: 0 }`
   - `coherence`: `{ non_goals: [], violations: [] }`
   - `srm_validation`: `{ ran: false, owner_service: null, write_tables: [], cross_context_contracts: [] }`
4. Remove old fields: `gates_passed`, `gates_pending`
5. Save migrated checkpoint back to disk

**Migration (v2 → v3):** When loading a checkpoint with `schema_version: 2`:

1. Set `schema_version: 3`
2. Add `fib-approved` gate at the front of `gates` (before `srm-ownership`):
   ```json
   "fib-approved": { "passed": false, "timestamp": null }
   ```
   Do not auto-pass this gate — if the feature already has downstream artifacts, prompt the human to backfill FIB-H and FIB-S before continuing.
3. Add `fib_h` and `fib_s` to `artifacts` (before `feature_boundary`):
   ```json
   "fib_h": null,
   "fib_s": null
   ```
4. Expand `coherence` block with new fields (preserve existing `non_goals` and `violations`):
   ```json
   "feature_loop": [],
   "feature_loop_frozen": false,
   "deferred_items": [],
   "scope_authority": { "artifact": "FEATURE_INTAKE_BRIEF", "version": "v0", "frozen": false }
   ```
5. Shift `current_phase`: if the stored value is N, set it to N+1 (SRM was 0, now 1; Scaffold was 1, now 2; etc.)
6. Save migrated checkpoint back to disk

---

## Integration with Existing Skills

| Phase | Delegates To | How |
|-------|--------------|-----|
| Phase 0 (FIB Admission) | Human + pipeline | Human supplies FIB-H; pipeline validates + generates FIB-S |
| Phase 3 (RFC) | `lead-architect` | Skill invocation with FIB-H, FIB-S, and Feature Scaffold context |
| Phase 4 (SEC Note) | `rls-expert` | Skill invocation with security context (boundary + tables + ADRs) |
| Phase 5 (ADR) | `lead-architect` | Skill invocation, then freeze operation |
| Phase 6 (PRD) | `prd-writer` | Skill invocation with FIB-H, FIB-S, Scaffold + RFC + SEC + ADR context |
| Phase 6 (DA Review) | `devils-advocate` | 4-agent team (3 reviewers + synthesis-lead) via Agent + TeamCreate |

---

## Clean Boundary

| Concern | Owner | Artifacts |
|---------|-------|-----------|
| Human intent, scope authority | **Human** (pre-pipeline) | FIB-H (`docs/60-release/`) |
| Structured machine-readable scope | feature-pipeline (Phase 0) | FIB-S (`docs/60-release/`) |
| Bounded context ownership | feature-pipeline (Phase 1) | Feature Boundary (`docs/20-architecture/specs/`) |
| What problem, what options | feature-pipeline (Phase 2) | Scaffold (`docs/01-scaffolds/`) |
| What approach + alternatives | feature-pipeline (Phase 3) | RFC (`docs/02-design/`) |
| What security risks | feature-pipeline (Phase 4) | SEC Note |
| What decisions are locked | feature-pipeline (Phase 5) | ADR(s) (`docs/80-adrs/`) |
| What must be true | feature-pipeline (Phase 6) | PRD (`docs/10-prd/`) |
| How to build it | build-pipeline | EXEC-SPEC (`docs/21-exec-spec/`) |
| How to prove it's done | build-pipeline | DoD gates |
| Building it | build-pipeline | Code, migrations, tests |

Feature-pipeline produces no implementation artifacts. If you find yourself writing SQL, DoD checklists, or EXEC-SPECs, you've crossed into build-pipeline territory. Stop and hand off.

---

## Why Features "Never End" (The Anti-Pattern)

**Bad Loop:**
"Design -> discover edge case -> redesign -> discover deeper edge case -> redesign..."

**Good Loop:**
"Define boundary + gates -> implement -> prove gates -> ship -> iterate."

Edge cases don't stop existing. You stop letting them expand the scope.

---

## Resources

| File | Purpose |
|------|---------|
| `docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md` | **Phase 0 FIB-H**: form template, completion rules, amendment protocol (§11 quick-use blank) |
| `docs/60-release/zachman_interpolated_feature_intake_recommendation.md` | **Phase 0 FIB-S**: Zachman schema, field mapping, admission gate rules |
| `references/feature-boundary-template.md` | Phase 1 template (ownership + contracts) |
| `references/sec-note-template.md` | Phase 4 template |
| `references/da-team-protocol.md` | **Phase 6 DA team: reviewer roles, prompt templates, two-phase protocol** |
| `docs/01-scaffolds/TEMPLATE.md` | Phase 2 template |
| `docs/02-design/TEMPLATE.md` | Phase 3 template |

---

## Definition of Done (Feature Design Complete)

A feature design is "Done" when all gates are green and handoff is ready:

- [ ] **FIB-H** present at `docs/60-release/FIB-H-{feature-id}.md` — human-authored, all required sections complete, scope authority signed
- [ ] **FIB-S** generated and valid — all Zachman dimensions populated, containment frozen, ≥1 traceability entry
- [ ] SRM ownership sentence written and boundary declared
- [ ] Scaffold pins intent, constraints, 5+ non-goals, 2+ options with tradeoffs; cites FIB scope authority
- [ ] RFC proposes direction, identifies ADR-worthy decisions; scope validated against FIB non-goals
- [ ] If new UI surface: Surface Classification declared (rendering delivery + data aggregation)
- [ ] If new UI surface: Truth-bearing metrics identified with preliminary MEAS-IDs
- [ ] SEC Note covers assets, threats, controls, deferred risks
- [ ] ADR(s) contain only durable decisions (no implementation SQL/code); scope validated against FIB exclusions
- [ ] PRD references ADR IDs and FIB-H containment loop, defines testable acceptance criteria
- [ ] Adversarial review passed (no P0 findings, or override-with-reason recorded)
- [ ] Handoff instruction displayed with all artifact paths (FIB-H and FIB-S included)
