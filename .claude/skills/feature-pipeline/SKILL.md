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
/feature-start player-identity-enrollment --fib-h docs/60-release/FIB-H-player-identity-enrollment.md --fib-s docs/60-release/FIB-S-player-identity-enrollment.json
```

This starts (or resumes) the 6-phase design pipeline with gates at each transition. `--fib-h` and `--fib-s` are optional; when omitted the pipeline derives paths from the feature name by convention.

---

## Pipeline Phases

```
[FIB CONTEXT LOAD] Resolve FIB-H + FIB-S → fib-bound | fib-absent  (pre-phase, not a gate)
+---------------------------------------------------------------+
|  Phase 0: SRM Check           -> Ownership sentence            |
|     | GATE: srm-ownership                                      |
|  Phase 1: Feature Scaffold    -> Intent + constraints + options |
|     | GATE: scaffold-approved                                   |
|  Phase 2: Design Brief / RFC  -> Direction + alternatives      |
|     | GATE: design-approved                                     |
|  Phase 3: SEC Note            -> Assets/threats/controls       |
|     | GATE: sec-approved                                        |
|  Phase 4: ADR(s)              -> Durable decisions ONLY        |
|     | GATE: adr-frozen                                          |
|  Phase 5: PRD                 -> Requirements + ADR references |
|     | GATE: prd-approved                                        |
|  HANDOFF -> /build PRD-###                                     |
+---------------------------------------------------------------+
```

Terminal phase is 5. On `prd-approved`, the pipeline records handoff and instructs the user to run `/build PRD-###`. No EXEC-SPEC, no workstreams — that's build-pipeline's domain.

---

## Pipeline Startup: FIB Context Load

Before Phase 0 begins, the pipeline resolves the FIB pair for `{feature-id}`. This is context injection, not a gate — the pipeline can run in either mode.

**Resolution:**
1. Resolve paths: use `--fib-h`/`--fib-s` args if supplied; otherwise derive `docs/60-release/FIB-H-{feature-id}.md` and `docs/60-release/FIB-S-{feature-id}.json` by convention.
2. If both resolved paths exist on disk → `mode: fib-bound` (coherence checks active in every subsequent phase)
3. If either missing → `mode: fib-absent` (coherence checks skipped, offer to halt)

**Warning display (fib-absent):**
```
[FIB CONTEXT] Feature: {feature-id}
─────────────────────────────────────────
FIB-H: {found | MISSING}   FIB-S: {found | MISSING}
Mode: fib-absent

Warning: No FIB pair found. Pipeline will run without scope anchoring.
Coherence checks in Phases 0–4 will be skipped.
Options:
  1. Continue without FIBs
  2. Halt — I will supply FIBs first
     Template: docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md (§11 quick-use blank)
     Schema:   docs/60-release/zachman_interpolated_feature_intake_recommendation.md
```

**Coherence snapshot (fib-bound only):**
- `coherence.non_goals[]` ← `intent.explicit_exclusions`
- `coherence.feature_loop[]` ← step IDs from `containment.loop`
- `coherence.feature_loop_frozen` ← `true`
- `coherence.scope_authority` ← `governance.scope_authority`

These anchors bind all subsequent phases. Scope expansion requires an Intake Amendment (`FEATURE_INTAKE_BRIEF_FORM.md` §9).

**Exemplar + Deferred + Expansion Trigger Extraction (fib-bound only):**

Run all three steps after the coherence snapshot. FIB constraints not projected into checkpoint fields are not considered loaded.

**§P — Exemplar Scope.** Match canonical `§P` first, then aliases: `Exemplar Direction`, `Vertical Collapse`, `First Implementation Boundary`, `Exemplar Pair`; phrases "vertical exemplar", "first implementation", "exemplar pair".
- Found → set `exemplar_scope.mode` (`"required"` if EXEMPLAR_SLICE_DISCIPLINE §3 all-four criteria met, else `"optional"`); `applies = true`; `evaluated = true`; populate `boundary`, `first_surface_or_pair[]`, `downstream_consumers[]`, `forbidden_during_exemplar[]`, `declaration_source`; record `criteria` counts from §3.
- Not found but §3 criteria met → `mode = "required"`, `applies = true`, `evaluated = true`; add warning "FIB-H should name the exemplar pair explicitly."
- §3 criteria not met → `mode = "not_applicable"`, `applies = false`, `evaluated = true`; populate all four `criteria` fields with negative evidence. Silence or missing §P does not permit `not_applicable` — unevaluated is the default.

**§L — Deferred Decisions.** Match `§L` first, then aliases: `Deferred Decisions`, `Open Questions Not Implementation Input`, `Applies Only After`; phrases "not an implementation input for this slice", "deferred until", "applies only after".
- Extract each deferred decision into `coherence.deferred_items[]` with FIB section citation.
- Set `coherence.deferred_items_extraction.status`: `"extracted"` (found + populated), `"section_absent"` (no section found — empty array is valid), `"failed"` (section found but unparseable).
- Gates check extraction status, not array length. Default `"unevaluated"` is a fib-bound gate failure.

**§K — Expansion Triggers.** Match `§K` first, then aliases: `Expansion Trigger Rule`, `Intake Amendment Trigger`, `Amendment Required When`; phrases "requires amendment", "triggers amendment".
- Extract into `coherence.expansion_triggers[]`. Set `coherence.expansion_triggers_extraction.status` using the same sentinel pattern.
- Any ADR candidate whose scope trips an extracted trigger → classify `amendment_required` unless an approved amendment already covers it.

Full enforcement rules per phase → `references/fib-context-protocol.md`.

---

## Phase 0: SRM-First Ownership Contract

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
6. If the feature introduces new canonical terminology (result states, authority claims, surface labels, derivation rules): note `semantic_extension_pending: true` in the FEATURE_BOUNDARY.md document. SRL admission through `docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md` §9 is required before any such term appears in a DTO, migration, API contract, or UI label. This is not a Phase 0 hard gate but a downstream obligation — record it now so it surfaces in Phase 4.

Phase 0 is lean — ownership sentence and boundary table only. Narrative fields belong in Phase 1.

---

## Phase 1: Feature Scaffold

**Goal:** Pin intent, constraints, and decisions needed before design work begins.  
**Rule:** Disposable, timeboxed (30–60 min). No implementation detail.

**Template:** `docs/01-scaffolds/TEMPLATE.md`  
**Output:** `docs/01-scaffolds/SCAFFOLD-###-{feature}.md`

**Must Include:**
- **Scope Authority citation:** `Scope Authority: FIB-H {feature-id} v{N}` in frontmatter (fib-bound only)
- **Intent:** Outcome that changes after shipping (traces to FIB §F outcomes)
- **Primary Actor:** Role that triggers the feature (matches FIB §D)
- **Success Metric:** One measurable outcome
- **Constraints:** Hard walls (security, compliance, domain, operational)
- **Non-goals:** 5+ explicit exclusions (must not contradict FIB §G; may elaborate)
- **Options:** 2–4 with tradeoffs
- **Decision to make:** What needs deciding
- **Dependencies and Risks / Open questions**
- **Feature Classification block** (see sub-step below)

**Classification Sub-step (required before `scaffold-approved` gate):**

Walk the decision tree in `docs/70-governance/feature-intake/FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.yaml` (`§how.decision_tree`, steps 2–8) to determine:

1. **`primary_classification`** — one of: `ui_interaction | read_composition | authoring | projection_input | projection_consumer | surface_value | external_integration`
2. **`secondary_classifications`** — any additional classes that apply, or `None`
3. **`selected_transport`** — narrowest valid mechanism from `§how.transport_selection_matrix`
4. **`scope_expansion_check`** — verify none of the 10 `§when.scope_expansion_triggers` apply; if any do, file an Intake Amendment before continuing (ADM-10 requires a link)

Record these in the scaffold frontmatter. The classification drives Phase 2 RFC direction and the Phase 5 PRD required section.

**Scope expansion triggers that require a FIB amendment before proceeding:**
`new_actor`, `new_operator_workflow`, `new_user_visible_surface`, `new_automation_path`, `new_external_integration`, `new_authority_claim`, `new_projection_consumer`, `new_event_category`, `new_outbox_producer`, `new_reconciliation_or_settlement_implication`

**Coherence check (fib-bound):** Any expansion trigger discovered must not already be excluded by `coherence.non_goals[]` — if it is, the FIB amendment is mandatory.

**Gate:** `scaffold-approved` — 2+ options with tradeoffs and 5+ non-goals required. Classification block (primary_classification + selected_transport) must be present. In fib-bound mode: fails if scaffold introduces entities, capabilities, or surfaces absent from FIB-S (file Intake Amendment first).

**Coherence checkpoint (fib-bound):** Non-goals must be consistent with `coherence.non_goals[]`. May elaborate FIB exclusions but not contradict them. `coherence.non_goals[]` is owned by the FIB — do not overwrite.

---

## Phase 2: Design Brief / RFC

**Goal:** Propose direction with enough detail to identify ADR-worthy decisions. The `selected_transport` from Phase 1 classification anchors the proposed direction — the RFC must be consistent with the transport chain declared there.  
**Rule:** Funnel style — context → scope → overview → details → alternatives.

**Template:** `docs/02-design/TEMPLATE.md`  
**Output:** `docs/02-design/RFC-###-{feature}.md`

**Must Include:**
- Context, Scope & Goals, Proposed Direction, Detailed Design, Alternatives, Decisions Required
- **Surface Classification** (only when the feature introduces a genuinely new UI surface): rendering delivery axis + data aggregation axis (per `SURFACE_CLASSIFICATION_STANDARD.md` §4), preliminary MEAS-IDs

**Gate:** `design-approved` — Three conditions, all required:
1. Every decision in "Decisions Required" is named; Surface Classification confirmed if RFC mentions "page", "panel", "dashboard", "form", or "component" (ADR-041).
2. RFC scope does not violate `coherence.non_goals[]` (fib-bound). Violation → revise RFC or file Intake Amendment.
3. **ADR Candidate Scope Matrix completed** (see sub-step below).

**ADR Candidate Scope Matrix (required before `design-approved` passes):**

Classify every RFC "Decisions Required" entry against FIB anchors. Applies in fib-bound and fib-absent mode (fib-absent: classify against scaffold non-goals only; exemplar checks skipped).

| Status | Meaning |
|---|---|
| `in_exemplar` | Required by and contained within the exemplar boundary |
| `constrained` | Partially in scope; only `allowed_form` may be authored |
| `deferred` | In `coherence.deferred_items[]` or `exemplar_scope.downstream_consumers` |
| `out_of_scope` | Exceeds FIB scope authority entirely |
| `amendment_required` | Requires Intake Amendment; or trips `coherence.expansion_triggers[]` |

Each candidate requires:
- `containment_loop_trace`: FIB section citation (e.g., `"FIB §L.2"`, `"FIB §P.3"`). No citation = invalid classification, gate fails.
- `constrained` candidates: `allowed_form` (what may be authored) and `forbidden_form` (what must not appear in the authored ADR).
- `deferred` / `out_of_scope` / `amendment_required`: `reason` with FIB section cite.

Populate checkpoint arrays:
- `decision_scope.all_candidates[]` — every RFC candidate regardless of status (full audit trail preserved)
- `decision_scope.approved_candidates[]` — IDs with status `in_exemplar` or `constrained` only
- `decision_scope.blocked_candidates.deferred[]` / `.out_of_scope[]` / `.amendment_required[]`

If `blocked_candidates` is non-empty: HARD STOP before `design-approved` passes.

```
[CANDIDATE SCOPE GATE]
─────────────────────────────────────────
FIB scope authority: {fib_scope_authority.artifact} (frozen: {frozen})
Exemplar boundary:   {exemplar_scope.boundary}
Exemplar mode:       {exemplar_scope.mode}

All candidates:
  {id} — {title}
  Status: {scope_status}   Trace: {containment_loop_trace}
  [allowed_form / forbidden_form if constrained]
  [reason if blocked]

⚠ {N} candidate(s) blocked. Approved: {approved_candidates[]}

How do you want to proceed?
  1. Remove blocked candidates (defer to post-exemplar backlog)
  2. File Intake Amendment to FIB-H (required for amendment_required)
  3. Narrow constrained candidate to allowed_form only
  4. Other — describe

Waiting for your decision.
```

Set `decision_scope.adr_candidate_scope_matrix_completed = true` only after all blocked candidates are resolved.

**Delegates to:** `lead-architect` skill

---

## Phase 3: SEC Note (Tiny Threat Model)

**Goal:** Prevent "security later" from becoming "security never."  
**Template:** `references/sec-note-template.md`

**Must Include:** Assets, Threats, Controls (RLS, actor binding, hashing, rate limits), Deferred Risks

**Gate:** `sec-approved` — If you store sensitive values, you must justify the storage form.

**Delegates to:** `rls-expert` skill — pass feature boundary, scaffold path, RFC path, owning service, and write tables as context. The orchestrator lacks PT-2 security domain knowledge; `rls-expert` knows ADR-015/018/020/024/030 patterns.

---

## Phase 4: ADR(s) (Only for Durable Decisions)

**Goal:** Capture decisions that are hard to reverse or reused widely.  
**Rule:** ADR ≠ diary. ADRs are for **durable** architecture decisions only.

**ADR-Worthy:** Identity storage strategy, parser choice, actor-binding mechanism.  
**Not in ADR:** RLS SQL, trigger bodies, index definitions, migration steps (those go in EXEC-SPEC via build-pipeline).
**Delegates to:** `lead-architect` skill

### Phase 4 Preamble: Scope Check (required before authoring begins)

Before writing any ADR, count the independent decisions listed in the RFC's "Decisions Required" section. A decision is independent if it could be accepted or rejected without affecting the others.

**If more than one independent decision is detected, or if any decision contains implementation guidance (file paths, component names, suppression lists, migration steps), HARD STOP:**

```
[PHASE 4 SCOPE CHECK]
─────────────────────────────────────────
Detected {N} independent decisions in this phase:

  Decision A: {document type} — {domain} — {one-line boundary}
  Decision B: {document type} — {domain} — {one-line boundary}
  ...

⚠ This phase exceeds single-ADR scope. Producing multiple ADRs
  in one pass causes context collapse and unverified content.

How do you want to proceed?
  1. Decompose — run a separate pipeline phase per decision
  2. Scope to one decision now, defer the rest (specify which)
  3. Collapse into one ADR (you acknowledge the scope risk)
  4. Other — describe your preferred approach

Waiting for your decision before continuing.
```

Do not proceed, spawn agents, or make a "best guess" decomposition. The pipeline's job at this gate ends at naming what it found. Sequencing and topology belong to the user.

**Scope overflow heuristics (any one triggers the stop):**
- RFC "Decisions Required" section lists more than one independently resolvable decision
- Any decision involves a list of more than ~3 specific file paths, component names, or DTO field names — that is EXEC-SPEC content, not ADR content
- Any decision includes SQL, migration steps, or implementation instructions — those belong in the EXEC-SPEC produced by build-pipeline

Record the user's choice in `adr_scope.user_choice` before proceeding. If the user chooses option 1 or 2, update `adr_scope.active_index` to track which decision is being authored in this run.

**ADR Authoring Precondition (verify before authoring any candidate):**

```
required:
  - decision_scope.adr_candidate_scope_matrix_completed = true
  - decision_scope.fib_scope_authority.artifact is non-null
  - coherence.deferred_items_extraction.status in [extracted, section_absent]   ← not unevaluated
  - coherence.expansion_triggers_extraction.status in [extracted, section_absent]
  - exemplar_scope.evaluated = true                                               (fib-bound only)
  - exemplar_scope.mode != "unevaluated"                                          (fib-bound only)
fail_if:
  - candidate ID not in decision_scope.approved_candidates[]
  - candidate scope_status is deferred | out_of_scope | amendment_required
  - candidate has no containment_loop_trace
  - candidate contradicts exemplar_scope.boundary
  - candidate resolves a coherence.deferred_items[] entry as implementation input
```

Primary enforcement is at the Phase 2 exit gate. Phase 4 precondition is a verification step only.

**Gate:** `adr-frozen` — Three conditions, all required:
1. ADR contains only context/decision/consequences — no SQL, no code, no file paths, no component lists
2. `adr_scope.user_choice` is non-null (record `"not-applicable"` for single unambiguous candidates)
3. **Structural constrained check** (if candidate `scope_status = constrained`):
   - ADR frontmatter includes `candidate_id` matching `decision_scope.all_candidates[].id`
   - ADR body includes `allowed_scope_summary` (explicit statement of what is in scope)
   - ADR non-goals section contains exclusions derived from `forbidden_form`
   - Fail if: ADR defines schema / ownership / lifecycle / implementation for `forbidden_form` domain; ADR resolves a `coherence.deferred_items[]` entry; rejected-alternatives section authorizes `forbidden_form` indirectly
4. **SRL admission check** (if ADR introduces new canonical terms, result states, authority claims, or operator-visible surface labels): ADR must explicitly bind each term to an SRM-owned service/subdomain. Record `semantic_extension_required: true` in the checkpoint and name the SRL artifact to create. ADRs that define terminology without SRM-bound SRL admission are incomplete (SRL Rule 1 + Rule 2). The SRL extension artifact is a dependency of this ADR — it must be created or dependency-linked before the ADR is marked frozen.

**Coherence check (fib-bound):** ADR decisions must not depend on capabilities in `coherence.non_goals[]`. Violation → revise ADR or file Intake Amendment.

**Delegates to:** `lead-architect` skill

---

## Phase 5: PRD

**Goal:** Define *what must be true* with testable statements.  
**Input context:** FIB-H, FIB-S, scaffold, RFC, SEC note, ADR(s).

**Must Include:**
- User flows (happy path + 2–3 critical unhappy paths)
- Acceptance criteria as verifiable statements
- Out of scope (reiterated)
- Data classification (PII / financial / compliance / operational)
- `scaffold_ref:` frontmatter pointing to scaffold
- `adr_refs:` frontmatter listing ADR IDs
- `intake_ref:` and `structured_ref:` frontmatter (fib-bound only) — required for build-pipeline handoff
- Reference to FIB containment loop steps in acceptance criteria (fib-bound only)
- **Feature Classification and Transport Selection section** (mandatory — per `FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.yaml` §required_sections.prd):

  | Field | Required | Notes |
  |-------|----------|-------|
  | `primary_classification` | yes | enum from taxonomy |
  | `secondary_classifications` | yes | name or `None` |
  | `authors_domain_fact` | yes | boolean; name the fact if true |
  | `emits_projection_input` | yes | boolean; name event_type + category if true |
  | `requires_transactional_outbox` | yes | boolean; explain why if true |
  | `consumes_outbox_events` | yes | boolean; name consumer + projection store if true |
  | `renders_financial_surface_values` | yes | boolean; name source/authority/completeness if true |
  | `selected_transport` | yes | enum from transport_selection_matrix |
  | `narrowest_valid_transport_justification` | yes | prose paragraph |
  | `rejected_mechanisms` | yes | array of `{mechanism, reason}` |
  | `fib_amendment_required` | yes | boolean; link amendment if true |

**Gate:** `prd-approved` — Criteria must be provable by a test. Feature Classification and Transport Selection section must be complete (ADM-1 through ADM-10 all answered). If ADM-9 is true (new surface/actor/integration/workflow introduced), ADM-10 must provide a FIB amendment link — gate fails without it. No unresolved P0 findings from adversarial review.

**Adversarial review:** After `prd-writer` produces the PRD, run the DA review per `references/da-team-protocol.md`. That reference covers: temporal integrity check (including FIB artifacts), magnitude assessment (Tier 0/1/2), DA team dispatch, two-phase review, synthesis, retry protocol, and gate logic.

**Delegates to:** `prd-writer` skill, then `references/da-team-protocol.md` for review

---

## Handoff (TERMINAL — Phase 5 is the last phase)

On `prd-approved`, the feature-pipeline is **DONE**. There is no Phase 6.

**STOP HERE.** Do not generate EXEC-SPECs, DOD gates, workstream definitions, or any implementation artifact. Those belong exclusively to build-pipeline.

Display:

```
---------------------------------------------
Feature Design Complete: {feature-name}
---------------------------------------------

Artifacts:
  [CTX] FIB-H:    docs/60-release/FIB-H-{feature-id}.md   (fib-bound)
  [CTX] FIB-S:    docs/60-release/FIB-S-{feature-id}.json  (fib-bound)
  [PASS] Boundary: docs/20-architecture/specs/{feature}/FEATURE_BOUNDARY.md
  [PASS] Scaffold: docs/01-scaffolds/SCAFFOLD-###-{slug}.md
  [PASS] RFC:      docs/02-design/RFC-###-{slug}.md
  [PASS] SEC Note: docs/30-security/SEC-NOTE-{slug}.md
  [PASS] ADR(s):   docs/80-adrs/ADR-###-{slug}.md
  [PASS] PRD:      docs/10-prd/PRD-###-{slug}.md
  [PASS] DA Review: {verdict} ({P0_count} P0, {P1_count} P1)

Next: /build PRD-###
---------------------------------------------
```

Set checkpoint `status` to `"design-complete"` and `current_phase` to `5`. Do not increment beyond 5. Strip any forbidden fields (`exec_spec`, `dod_gates`, `exec_spec_workstreams`, `execution_phases`) and warn if found.

---

## State Management

### Checkpoint Structure (v8)

Full JSON schema and field index: `references/checkpoint-schema.md`.

**Location:** `.claude/skills/feature-pipeline/checkpoints/{feature-id}.json`

### Checkpoint Invariants

- **`current_phase`** must be 0–5. There is no Phase 6.
- **`status`** must be one of: `"initialized"`, `"in_progress"`, `"design-complete"`, `"failed"`.
- **`fib_context.mode`** must be `"fib-bound"` or `"fib-absent"`. Set at pipeline startup.
- **`gates`** keys: `srm-ownership`, `scaffold-approved`, `design-approved`, `sec-approved`, `adr-frozen`, `prd-approved`. No others.
- **`artifacts`** keys: `feature_boundary`, `scaffold`, `rfc`, `sec_note`, `adr`, `prd`. No others.
- **`feature_classification.primary`** must be set before `scaffold-approved` passes.
- **`feature_classification.qualifier`** must be explicitly set before `scaffold-approved` passes — `null` when no sub-pattern applies, or one of `"canonical_derived_model"` (CLS-002-Q1) / `"telemetry_fact"` (CLS-004-Q1) when the Phase 1 decision tree trace reaches a qualifier condition. The field must not be absent from the checkpoint.
- **`feature_classification.adm_checks`** all 10 values must be non-null before `prd-approved` passes.
- **`adr_scope.user_choice`** must be non-null before `adr-frozen` passes. Valid values: `"decompose"` | `"scope-to-one"` | `"collapse-user-acknowledged"` | `"user-defined"` | `"not-applicable"` (single unambiguous decision, no overflow detected).
- **`exemplar_scope.mode`** must not remain `"unevaluated"` after FIB Context Load in fib-bound mode. `"not_applicable"` requires all four `criteria` fields populated with negative evidence.
- **`coherence.deferred_items_extraction.status`** and **`expansion_triggers_extraction.status`** must not be `"unevaluated"` after FIB Context Load in fib-bound mode. Gates check status, not array length.
- **`decision_scope.adr_candidate_scope_matrix_completed`** must be `true` before `design-approved` passes.
- **`decision_scope.all_candidates[]`** must contain every RFC candidate regardless of status (full audit trail).
- **`decision_scope.approved_candidates[]`** may only contain IDs with `scope_status` in [`in_exemplar`, `constrained`]. Phase 4 may author only IDs listed here.
- **Forbidden fields:** `exec_spec`, `dod_gates`, `exec_spec_workstreams`, `execution_phases` — build-pipeline state. If present, strip and warn.

### Migration

Full migration protocol (v1→v8): `references/checkpoint-schema.md`. Current schema version: 8.

---

## Integration with Existing Skills

| Phase | Delegates To | How |
|-------|--------------|-----|
| Startup (pre-phase) | Human (pre-pipeline) | Pipeline loads pre-existing FIB-H and FIB-S into context |
| Phase 0 (SRM) | — | Direct SRM lookup |
| Phase 2 (RFC) | `lead-architect` | Skill invocation with FIB context, boundary, and scaffold |
| Phase 3 (SEC Note) | `rls-expert` | Skill invocation with boundary, tables, ADRs |
| Phase 4 (ADR) | `lead-architect` | Skill invocation, then freeze |
| Phase 5 (PRD) | `prd-writer` then DA review | `prd-writer` invocation; DA review per `references/da-team-protocol.md` |

---

## Clean Boundary

| Concern | Owner | Artifacts |
|---------|-------|-----------|
| Human intent + scope authority | **Human** (pre-pipeline) | FIB-H + FIB-S (`docs/60-release/`) |
| Bounded context ownership | feature-pipeline Phase 0 | Feature Boundary (`docs/20-architecture/specs/`) |
| What problem, what options | feature-pipeline Phase 1 | Scaffold (`docs/01-scaffolds/`) |
| What approach + alternatives | feature-pipeline Phase 2 | RFC (`docs/02-design/`) |
| What security risks | feature-pipeline Phase 3 | SEC Note |
| What decisions are locked | feature-pipeline Phase 4 | ADR(s) (`docs/80-adrs/`) |
| What must be true | feature-pipeline Phase 5 | PRD (`docs/10-prd/`) |
| How to build it | build-pipeline | EXEC-SPEC (`docs/21-exec-spec/`) |

---

## Resources

| File | Purpose |
|------|---------|
| `references/checkpoint-schema.md` | v8 checkpoint JSON schema, full field invariants, migration protocol (v1→v8) |
| `references/fib-context-protocol.md` | FIB context injection: startup loading, fib-bound/absent modes, phase-level enforcement, anti-invention boundary, PRD handoff requirements |
| `docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md` | FIB-H form template, completion rules, amendment protocol |
| `docs/60-release/zachman_interpolated_feature_intake_recommendation.md` | FIB-S schema, Zachman field mapping |
| `references/feature-boundary-template.md` | Phase 0 boundary template |
| `references/sec-note-template.md` | Phase 3 SEC note template |
| `references/da-team-protocol.md` | Phase 5 DA review: magnitude assessment, team protocol, retry logic |
| `docs/01-scaffolds/TEMPLATE.md` | Phase 1 scaffold template |
| `docs/02-design/TEMPLATE.md` | Phase 2 RFC template |
| `docs/70-governance/feature-intake/FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.yaml` | Phase 1 classification decision tree (§how.decision_tree steps 2–8); transport selection matrix; scope expansion triggers; Phase 5 PRD required section schema (ADM-1–10); audit checklist AUD-01–12 |
| `docs/70-governance/EXEMPLAR_SLICE_DISCIPLINE.md` | §3 mandatory criteria (when exemplar discipline applies); §5 proof invariants (I1–I4); §6 containment rules; AP-ES-01/04/05 anti-patterns. Read during FIB Context Load to determine `exemplar_scope.mode`. |
| `docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md` | SRL companion authority; §9 admission paths for new canonical terms; §7 enforcement rules; §6 semantic class registry |

---

## Definition of Done

- [ ] **FIB pair** loaded at startup — `fib-bound` or `fib-absent` recorded in `fib_context`
- [ ] SRM ownership sentence written; boundary declared and table-validated against SRM
- [ ] Scaffold cites FIB scope authority (fib-bound); 5+ non-goals, 2+ options with tradeoffs
- [ ] **Feature Classification block present in scaffold** — `primary_classification`, `qualifier` (or explicit `null`), `selected_transport`, scope expansion check ran; `feature_classification.primary` and `feature_classification.qualifier` both set in checkpoint
- [ ] RFC proposes direction consistent with `selected_transport`; names ADR-worthy decisions; scope validated against FIB non-goals (fib-bound)
- [ ] If new UI surface: Surface Classification declared; preliminary MEAS-IDs identified
- [ ] SEC Note covers assets, threats, controls, deferred risks
- [ ] **FIB §P extracted** (fib-bound) — `exemplar_scope.mode` and `criteria` recorded; not `"unevaluated"`
- [ ] **FIB §L extracted** (fib-bound) — `coherence.deferred_items_extraction.status` in [`extracted`, `section_absent`]; not `"unevaluated"`
- [ ] **FIB §K extracted** (fib-bound) — `coherence.expansion_triggers_extraction.status` in [`extracted`, `section_absent`]; not `"unevaluated"`
- [ ] **ADR candidate scope matrix completed at Phase 2 exit** — all RFC candidates in `all_candidates[]` with FIB section citations; blocked candidates resolved before `design-approved` passes
- [ ] **Phase 4 scope check ran** — `adr_scope.user_choice` is non-null; only `approved_candidates[]` authored
- [ ] ADR(s) contain only durable decisions (no SQL/code, no file paths, no component lists); constrained candidates verified at `adr-frozen` gate (structural check); validated against FIB exclusions (fib-bound)
- [ ] PRD references ADR IDs and FIB containment loop (fib-bound); testable acceptance criteria
- [ ] **PRD includes Feature Classification and Transport Selection section** — all ADM-1 through ADM-10 checks answered; `feature_classification.adm_checks` fully populated in checkpoint
- [ ] PRD frontmatter includes `intake_ref`/`structured_ref` (fib-bound) for build-pipeline handoff
- [ ] Adversarial review passed (no P0 findings, or override-with-reason recorded)
- [ ] If ADR introduces new canonical terms: `semantic_extension_required` flag recorded in checkpoint; SRL extension artifact created or dependency-linked; each term bound to SRM owner per `SEMANTIC_RESPONSIBILITY_LAYER.md` §4
- [ ] Handoff displayed with all artifact paths
