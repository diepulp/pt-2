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

This starts (or resumes) the 6-phase design pipeline with gates at each transition.

---

## Pipeline Phases

```
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

Terminal phase is 5. On `prd-approved`, feature-pipeline records handoff and instructs user to run `/build PRD-###`. No EXEC-SPEC generation, no workstream execution — that's build-pipeline's domain.

---

## Phase 0: SRM-First Ownership Contract

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

Phase 0 is intentionally lean — ownership sentence and write/read/contract table only. Narrative fields (goal, actor, scenario, metric, non-goals) belong in Phase 1.

---

## Phase 1: Feature Scaffold

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

**Delegates to:** Inline (orchestrator can do this — it's a framing doc, not domain-specific)

---

## Phase 2: Design Brief / RFC

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

**Delegates to:** `lead-architect` skill

---

## Phase 3: SEC Note (Tiny Threat Model)

**Goal:** Prevent "security later" from becoming "security never."
**Rule:** Small and explicit beats broad and vague.

**Template:** See `references/sec-note-template.md`

**Must Include:**
- **Assets:** What must be protected (PII, identity docs, player list, etc.)
- **Threats:** Enumeration, spoofed audit, cross-casino leakage, privilege creep
- **Controls:** RLS rules, actor binding, hashing/encryption stance, rate limits
- **Deferred Risks:** Explicitly allowed risks for MVP (and why)

**Gate:** `sec-approved` — If you store sensitive values, you must justify storage form.

---

## Phase 4: ADR(s) (Only for Durable Decisions)

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

---

## Phase 5: PRD

**Goal:** Define *what must be true* with testable statements. Now has scaffold, RFC, SEC note, and ADR(s) as input context.
**Rule:** PRD references ADR IDs for mechanism decisions. If changing a library requires rewriting the PRD, reject it.

**Delegation:** Invoke `prd-writer` skill

**Must Include:**
- User flows (happy path + 2-3 critical unhappy paths)
- Acceptance criteria as verifiable statements
- Out of scope (reiterated)
- Data classification (PII / financial / compliance / operational)
- `scaffold_ref:` frontmatter field pointing to scaffold
- `adr_refs:` frontmatter field listing ADR IDs

**Adversarial Review (Mini One-Pager):**

After `prd-writer` produces the PRD, invoke `devils-advocate` in lightweight mode:

```
Skill(skill="devils-advocate", args="Mini One-Pager review of {PRD_ID}:
  PRD: {prd_path}
  Scaffold: {scaffold_path}
  RFC: {rfc_path}
  SEC Note: {sec_note_path}
  ADR(s): {adr_paths}

  Use Mini One-Pager mode (Verdict, P0 breaks, Missing decisions, Patch delta).
  Focus on: coherence across artifacts, testable acceptance criteria,
  scope creep, and missing non-functional requirements.")
```

- P0 findings: `prd-approved` gate **FAILS**. Enter retry protocol (see below).
- P1-P3 findings: Advisory. Noted in handoff display for build-pipeline awareness.

**Retry protocol (on P0 FAIL):**

Present P0 findings to the human:

```
---------------------------------------------
[FAIL] PRD Adversarial Review (Attempt {N}/2)
---------------------------------------------

P0 Findings ({count}):
  1. {P0 finding summary}
  2. {P0 finding summary}

Options:
  1. Revise PRD (delegate to prd-writer with DA findings)
  2. Override with reason (record waiver, proceed to handoff)
  3. Abort pipeline
---------------------------------------------
```

- **Option 1 (Revise):** Delegate back to `prd-writer` with DA findings as revision context.
  Re-run DA Mini One-Pager after revision. Update attempt count.
- **Option 2 (Override):** Record override reason in checkpoint. Proceed to `prd-approved` gate
  with override noted in handoff display.
- **Option 3 (Abort):** Mark checkpoint `status` as `"failed"`, record DA findings. Stop.

**Max 2 DA attempts.** After 2 consecutive P0 verdicts, the pipeline forces
a human decision: override-with-reason or abort. No further automatic revision loops.

**Gate:** `prd-approved` — If it can't be proven by a test, it's not a criterion. No unresolved P0 findings from adversarial review.

**Terminal phase**: On approval, output handoff instruction.

---

## Handoff

On `prd-approved`, display:

```
---------------------------------------------
Feature Design Complete: {feature-name}
---------------------------------------------

Artifacts:
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

### Checkpoint Structure (v2)

```json
{
  "schema_version": 2,
  "feature_id": "csv-player-import",
  "current_phase": 3,
  "status": "in_progress",
  "gates": {
    "srm-ownership":    { "passed": true,  "timestamp": "2026-02-22T10:00:00Z" },
    "scaffold-approved": { "passed": true,  "timestamp": "2026-02-22T11:00:00Z" },
    "design-approved":   { "passed": true,  "timestamp": "2026-02-22T14:00:00Z" },
    "sec-approved":      { "passed": false, "timestamp": null },
    "adr-frozen":        { "passed": false, "timestamp": null },
    "prd-approved":      { "passed": false, "timestamp": null }
  },
  "artifacts": {
    "feature_boundary": "docs/20-architecture/specs/csv-player-import/FEATURE_BOUNDARY.md",
    "scaffold": "docs/01-scaffolds/SCAFFOLD-001-csv-player-import.md",
    "rfc": "docs/02-design/RFC-001-csv-player-import.md",
    "sec_note": null,
    "adr": null,
    "prd": null
  },
  "da_review": {
    "ran": false,
    "verdict": null,
    "p0_count": 0,
    "p1_count": 0,
    "attempt": 0,
    "override_reason": null
  },
  "branch": null,
  "working_directory": null,
  "timestamp": "2026-02-22T14:00:00Z"
}
```

**Location:** `.claude/skills/feature-pipeline/checkpoints/{feature-id}.json`

**Migration:** Checkpoints with no `schema_version` field are v1. Agents should read v1 checkpoints gracefully — map `gates_passed`/`gates_pending` arrays to the v2 `gates` object, and treat missing `da_review` as not-yet-run.

---

## Integration with Existing Skills

| Phase | Delegates To | How |
|-------|--------------|-----|
| Phase 2 (RFC) | `lead-architect` | Skill invocation with Feature Scaffold context |
| Phase 4 (ADR) | `lead-architect` | Skill invocation, then freeze operation |
| Phase 5 (PRD) | `prd-writer` | Skill invocation with Scaffold + RFC + SEC + ADR context |
| Phase 5 (DA Review) | `devils-advocate` | Skill invocation, Mini One-Pager mode |

---

## Clean Boundary

| Concern | Owner | Artifacts |
|---------|-------|-----------|
| What problem, what options | feature-pipeline | Scaffold (`docs/01-scaffolds/`) |
| What approach + alternatives | feature-pipeline | RFC (`docs/02-design/`) |
| What security risks | feature-pipeline | SEC Note |
| What decisions are locked | feature-pipeline | ADR(s) (`docs/80-adrs/`) |
| What must be true | feature-pipeline | PRD (`docs/10-prd/`) |
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
| `references/feature-boundary-template.md` | Phase 0 template (ownership + contracts) |
| `references/sec-note-template.md` | Phase 3 template |
| `docs/01-scaffolds/TEMPLATE.md` | Phase 1 template |
| `docs/02-design/TEMPLATE.md` | Phase 2 template |

---

## Definition of Done (Feature Design Complete)

A feature design is "Done" when all gates are green and handoff is ready:

- [ ] SRM ownership sentence written and boundary declared
- [ ] Scaffold pins intent, constraints, 5+ non-goals, 2+ options with tradeoffs
- [ ] RFC proposes direction, identifies ADR-worthy decisions
- [ ] If new UI surface: Surface Classification declared (rendering delivery + data aggregation)
- [ ] If new UI surface: Truth-bearing metrics identified with preliminary MEAS-IDs
- [ ] SEC Note covers assets, threats, controls, deferred risks
- [ ] ADR(s) contain only durable decisions (no implementation SQL/code)
- [ ] PRD references ADR IDs, defines testable acceptance criteria
- [ ] Adversarial review passed (no P0 findings, or override-with-reason recorded)
- [ ] Handoff instruction displayed with all artifact paths
