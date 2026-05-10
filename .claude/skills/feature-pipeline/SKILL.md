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
|  Phase 0: FIB Admission       -> Validate FIB-H + FIB-S       |
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

Terminal phase is 6. On `prd-approved`, the pipeline records handoff and instructs the user to run `/build PRD-###`. No EXEC-SPEC, no workstreams — that's build-pipeline's domain.

---

## Phase 0: FIB Admission

**Purpose:** Verify that both FIB intake artifacts exist and are valid before design begins. Both are human-created upstream of this pipeline — the pipeline ingests them, does not produce them.

**Expected inputs (pre-existing, human-authored):**
- `docs/60-release/FIB-H-{feature-id}.md` — operator intent brief
- `docs/60-release/FIB-S-{feature-id}.json` — Zachman-structured schema

**If either is missing — HALT:**

```
[HALT] Missing FIB artifact(s) for '{feature-id}'.

Both must be authored before this pipeline can run.
  FIB-H template: docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md (§11 quick-use blank)
  FIB-S schema:   docs/60-release/zachman_interpolated_feature_intake_recommendation.md

Re-invoke once both files are in place: /feature-start {feature-id}
```

**If both present — validate:**

FIB-H required sections (flag missing/empty as blocking error, do not fill):
- §A feature identity (name, ID, priority, date)
- §B operator problem statement (≤1 paragraph, no architecture language)
- §C pilot-fit justification (tied to a concrete operator journey)
- §D primary actor, surface, trigger event
- §E containment loop (5–10 numbered steps: actor + action + system response)
- §F required outcomes (3–7 bullets)
- §G explicit exclusions (≥3 items)
- §H adjacent ideas rejected (≥2 table entries)
- §L scope authority block (frozen and signed)

FIB-S required fields:
- All Zachman dimensions populated (`what`/`how`/`where`/`who`/`when`/`why`)
- `containment.loop` has ≥5 steps
- `containment.frozen = true`
- `governance.scope_authority.frozen = true`
- `governance.downstream_expansion_allowed_without_amendment = false`
- ≥1 `traceability.capability_to_outcome` entry

**Gate: `fib-approved`** — If either artifact is missing or fails validation, the pipeline does not start.

**Coherence snapshot — on gate pass:**
- `coherence.non_goals[]` ← `intent.explicit_exclusions` from FIB-S
- `coherence.feature_loop[]` ← step IDs from `containment.loop`
- `coherence.feature_loop_frozen = true`
- `coherence.scope_authority` ← `governance.scope_authority` from FIB-S

These are the binding scope anchors for every subsequent phase. Any downstream artifact introducing an entity, capability, actor, surface, or outcome absent from FIB-S is scope expansion and requires an Intake Amendment (`docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md` §9).

Phase 0 is ingestion and validation only. No design decisions are made here.

---

## Phase 1: SRM-First Ownership Contract

**Input:** Feature name/description  
**Output:** Ownership sentence + bounded context table

> "This feature belongs to **{OwnerService}** and may only touch **{Writes}**; cross-context needs go through **{Contracts}**."

**Gate:** `srm-ownership` — If you can't write this sentence, you're not ready to design.

**Workflow:**
1. Load SRM (`docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`)
2. Identify owning bounded context(s), writes (tables/RPCs), reads, cross-context contracts
3. Write ownership sentence
4. Create `docs/20-architecture/specs/{feature}/FEATURE_BOUNDARY.md` using `references/feature-boundary-template.md`
5. Grep SRM for each declared write table — gate fails if owned by another service

Phase 1 is lean — ownership sentence and boundary table only. Narrative fields belong in Phase 2.

---

## Phase 2: Feature Scaffold

**Goal:** Pin intent, constraints, and decisions needed before design work begins.  
**Rule:** Disposable, timeboxed (30–60 min). No implementation detail.

**Template:** `docs/01-scaffolds/TEMPLATE.md`  
**Output:** `docs/01-scaffolds/SCAFFOLD-###-{feature}.md`

**Must Include:**
- **Scope Authority citation:** `Scope Authority: FIB-H {feature-id} v{N}` in frontmatter
- **Intent:** Outcome that changes after shipping (traces to FIB §F outcomes)
- **Primary Actor:** Role that triggers the feature (matches FIB §D)
- **Success Metric:** One measurable outcome
- **Constraints:** Hard walls (security, compliance, domain, operational)
- **Non-goals:** 5+ explicit exclusions (must not contradict FIB §G; may elaborate)
- **Options:** 2–4 with tradeoffs
- **Decision to make:** What needs deciding
- **Dependencies and Risks / Open questions**

**Gate:** `scaffold-approved` — 2+ options with tradeoffs and 5+ non-goals required. Fails if scaffold introduces entities, capabilities, or surfaces absent from FIB-S (file Intake Amendment first).

**Coherence checkpoint:** Verify scaffold non-goals are consistent with `coherence.non_goals[]` set at Phase 0. Scaffold non-goals may elaborate FIB exclusions but may not contradict or remove them. `coherence.non_goals[]` is owned by the FIB gate — do not overwrite.

---

## Phase 3: Design Brief / RFC

**Goal:** Propose direction with enough detail to identify ADR-worthy decisions.  
**Rule:** Funnel style — context → scope → overview → details → alternatives.

**Template:** `docs/02-design/TEMPLATE.md`  
**Output:** `docs/02-design/RFC-###-{feature}.md`

**Must Include:**
- Context, Scope & Goals, Proposed Direction, Detailed Design, Alternatives, Decisions Required
- **Surface Classification** (only when the feature introduces a genuinely new UI surface): rendering delivery axis + data aggregation axis (per `SURFACE_CLASSIFICATION_STANDARD.md` §4), preliminary MEAS-IDs

**Gate:** `design-approved` — Name every decision that needs an ADR. If the RFC mentions "page", "panel", "dashboard", "form", or "component", confirm Surface Classification (ADR-041) is handled.

**Coherence check:** Verify RFC scope does not violate `coherence.non_goals[]` from the FIB. If a violation is found, revise the RFC or file an Intake Amendment (`docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md` §9).

**Delegates to:** `lead-architect` skill

---

## Phase 4: SEC Note (Tiny Threat Model)

**Goal:** Prevent "security later" from becoming "security never."  
**Template:** `references/sec-note-template.md`

**Must Include:** Assets, Threats, Controls (RLS, actor binding, hashing, rate limits), Deferred Risks

**Gate:** `sec-approved` — If you store sensitive values, you must justify the storage form.

**Delegates to:** `rls-expert` skill — pass feature boundary, scaffold path, RFC path, owning service, and write tables as context. The orchestrator lacks PT-2 security domain knowledge; `rls-expert` knows ADR-015/018/020/024/030 patterns.

---

## Phase 5: ADR(s) (Only for Durable Decisions)

**Goal:** Capture decisions that are hard to reverse or reused widely.  
**Rule:** ADR ≠ diary. ADRs are for **durable** architecture decisions only.

**ADR-Worthy:** Identity storage strategy, parser choice, actor-binding mechanism.  
**Not in ADR:** RLS SQL, trigger bodies, index definitions, migration steps (those go in EXEC-SPEC via build-pipeline).

**Gate:** `adr-frozen` — ADR contains only context/decision/consequences, no SQL/code.

**Coherence check:** ADR decisions must not depend on capabilities in `coherence.non_goals[]`. If they do, revise the ADR or file an Intake Amendment and update `coherence.non_goals[]`.

**Delegates to:** `lead-architect` skill

---

## Phase 6: PRD

**Goal:** Define *what must be true* with testable statements.  
**Input context:** FIB-H, FIB-S, scaffold, RFC, SEC note, ADR(s).

**Must Include:**
- User flows (happy path + 2–3 critical unhappy paths)
- Acceptance criteria as verifiable statements
- Out of scope (reiterated)
- Data classification (PII / financial / compliance / operational)
- `scaffold_ref:` frontmatter pointing to scaffold
- `adr_refs:` frontmatter listing ADR IDs
- Reference to FIB containment loop steps in acceptance criteria

**Gate:** `prd-approved` — Criteria must be provable by a test. No unresolved P0 findings from adversarial review.

**Adversarial review:** After `prd-writer` produces the PRD, run the DA review per `references/da-team-protocol.md`. That reference covers: temporal integrity check (including FIB artifacts), magnitude assessment (Tier 0/1/2), DA team dispatch, two-phase review, synthesis, retry protocol, and gate logic.

**Delegates to:** `prd-writer` skill, then `references/da-team-protocol.md` for review

---

## Handoff (TERMINAL — Phase 6 is the last phase)

On `prd-approved`, the feature-pipeline is **DONE**. There is no Phase 7.

**STOP HERE.** Do not generate EXEC-SPECs, DOD gates, workstream definitions, or any implementation artifact. Those belong exclusively to build-pipeline.

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
  [PASS] SEC Note:  docs/30-security/SEC-NOTE-{slug}.md
  [PASS] ADR(s):    docs/80-adrs/ADR-###-{slug}.md
  [PASS] PRD:       docs/10-prd/PRD-###-{slug}.md
  [PASS] DA Review: {verdict} ({P0_count} P0, {P1_count} P1)

Next: /build PRD-###
---------------------------------------------
```

Set checkpoint `status` to `"design-complete"` and `current_phase` to `6`. Do not increment beyond 6. Strip any forbidden fields (`exec_spec`, `dod_gates`, `exec_spec_workstreams`, `execution_phases`) and warn if found.

---

## Slash Commands

| Command | Purpose |
|---------|---------|
| `/feature-start <name>` | Start new pipeline at Phase 0 (FIB Admission) |
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
  -> start new pipeline at Phase 0 (FIB Admission)
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
    "magnitude_score": 0, "magnitude_tier": null, "magnitude_signals": [],
    "tier_override": null, "tier_override_reason": null,
    "ran": false, "verdict": null, "p0_count": 0, "p1_count": 0,
    "attempt": 0, "override_reason": null, "team_name": null, "team_results": null,
    "cross_artifact_findings": 0, "resolved_conflicts": [], "unresolved_conflicts": []
  },
  "coherence": {
    "non_goals": [], "feature_loop": [], "feature_loop_frozen": false,
    "deferred_items": [],
    "scope_authority": { "artifact": "FEATURE_INTAKE_BRIEF", "version": "v0", "frozen": false },
    "violations": []
  },
  "srm_validation": {
    "ran": false, "owner_service": null, "write_tables": [], "cross_context_contracts": []
  },
  "branch": null, "working_directory": null, "timestamp": "2026-02-22T14:00:00Z"
}
```

**Location:** `.claude/skills/feature-pipeline/checkpoints/{feature-id}.json`

### Checkpoint Invariants

- **`current_phase`** must be 0–6. There is no Phase 7.
- **`status`** must be one of: `"initialized"`, `"in_progress"`, `"design-complete"`, `"failed"`.
- **`gates`** keys: `fib-approved`, `srm-ownership`, `scaffold-approved`, `design-approved`, `sec-approved`, `adr-frozen`, `prd-approved`. No others.
- **`artifacts`** keys: `fib_h`, `fib_s`, `feature_boundary`, `scaffold`, `rfc`, `sec_note`, `adr`, `prd`. No others.
- **Gate order:** `fib-approved` must pass before any other gate.
- **Forbidden fields:** `exec_spec`, `dod_gates`, `exec_spec_workstreams`, `execution_phases` — build-pipeline state. If present, strip and warn.

### Migration

**v1 → v2:** Set `schema_version: 2`. Map `gates_passed`/`gates_pending` arrays to `gates` object (`passed: true/false`, timestamp from checkpoint). Initialize `da_review`, `coherence`, `srm_validation` with defaults. Remove old array fields.

**v2 → v3:** Set `schema_version: 3`. Inject `"fib-approved": { "passed": false, "timestamp": null }` before `srm-ownership`. Inject `"fib_h": null, "fib_s": null` before `feature_boundary`. Expand `coherence` with `feature_loop`, `feature_loop_frozen`, `deferred_items`, `scope_authority`. Shift `current_phase` by +1. Do not auto-pass `fib-approved` — prompt user to supply FIB artifacts.

---

## Integration with Existing Skills

| Phase | Delegates To | How |
|-------|--------------|-----|
| Phase 0 (FIB Admission) | Human (pre-pipeline) | Pipeline validates pre-existing FIB-H and FIB-S |
| Phase 3 (RFC) | `lead-architect` | Skill invocation with FIB-H, FIB-S, and scaffold context |
| Phase 4 (SEC Note) | `rls-expert` | Skill invocation with boundary, tables, ADRs |
| Phase 5 (ADR) | `lead-architect` | Skill invocation, then freeze |
| Phase 6 (PRD) | `prd-writer` then DA review | `prd-writer` invocation; DA review per `references/da-team-protocol.md` |

---

## Clean Boundary

| Concern | Owner | Artifacts |
|---------|-------|-----------|
| Human intent + scope authority | **Human** (pre-pipeline) | FIB-H + FIB-S (`docs/60-release/`) |
| Bounded context ownership | feature-pipeline Phase 1 | Feature Boundary (`docs/20-architecture/specs/`) |
| What problem, what options | feature-pipeline Phase 2 | Scaffold (`docs/01-scaffolds/`) |
| What approach + alternatives | feature-pipeline Phase 3 | RFC (`docs/02-design/`) |
| What security risks | feature-pipeline Phase 4 | SEC Note |
| What decisions are locked | feature-pipeline Phase 5 | ADR(s) (`docs/80-adrs/`) |
| What must be true | feature-pipeline Phase 6 | PRD (`docs/10-prd/`) |
| How to build it | build-pipeline | EXEC-SPEC (`docs/21-exec-spec/`) |

---

## Resources

| File | Purpose |
|------|---------|
| `docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md` | FIB-H form template, completion rules, amendment protocol |
| `docs/60-release/zachman_interpolated_feature_intake_recommendation.md` | FIB-S schema, Zachman field mapping |
| `references/feature-boundary-template.md` | Phase 1 boundary template |
| `references/sec-note-template.md` | Phase 4 SEC note template |
| `references/da-team-protocol.md` | Phase 6 DA review: magnitude assessment, team protocol, retry logic |
| `docs/01-scaffolds/TEMPLATE.md` | Phase 2 scaffold template |
| `docs/02-design/TEMPLATE.md` | Phase 3 RFC template |

---

## Definition of Done

- [ ] **FIB-H** present — all required sections complete, scope authority signed
- [ ] **FIB-S** present — all Zachman dimensions populated, containment frozen, ≥1 traceability entry
- [ ] SRM ownership sentence written; boundary declared and table-validated against SRM
- [ ] Scaffold cites FIB scope authority; 5+ non-goals, 2+ options with tradeoffs
- [ ] RFC proposes direction, names ADR-worthy decisions; scope validated against FIB non-goals
- [ ] If new UI surface: Surface Classification declared; preliminary MEAS-IDs identified
- [ ] SEC Note covers assets, threats, controls, deferred risks
- [ ] ADR(s) contain only durable decisions (no SQL/code); validated against FIB exclusions
- [ ] PRD references ADR IDs and FIB containment loop; testable acceptance criteria
- [ ] Adversarial review passed (no P0 findings, or override-with-reason recorded)
- [ ] Handoff displayed with all artifact paths
