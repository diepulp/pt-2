# FIB Context Protocol

> Design-time authority chain for the feature-pipeline.
> Mirrors `build-pipeline/references/intake-traceability-protocol.md`,
> which covers the downstream implementation chain (FIB → PRD → EXEC-SPEC).

---

## Purpose

The FIB-H and FIB-S pair are the human-authored scope authority for a feature. They are created before the feature-pipeline runs. When present, they bind every design artifact the pipeline produces. When absent, the pipeline runs without FIB-anchored coherence checks.

The authority chain across the design pipeline is:

```
FIB-H (prose)    → human scope authority (frozen after sign-off)
FIB-S (schema)   → machine-readable scope authority (Zachman structure)
  ↓ constrains
Scaffold         → must not introduce entities/capabilities/surfaces absent from FIB-S
RFC              → must not propose direction that violates FIB non-goals
SEC Note         → threat model informed by FIB-S business rules and data entities
ADR(s)           → decisions must not depend on excluded FIB items
PRD              → requirements must trace to FIB-S outcomes; frontmatter cites FIB refs
  ↓ passes to
build-pipeline   → applies build-pipeline/references/intake-traceability-protocol.md
```

---

## Startup Loading

At pipeline startup (before Phase 0), resolve the FIB chain:

1. Look for `docs/60-release/FIB-H-{feature-id}.md` and `docs/60-release/FIB-S-{feature-id}.json`
2. **If both present:** load into pipeline context → `mode: "fib-bound"`
3. **If either missing:** warn the user, offer to continue or halt

```
[FIB CONTEXT] Feature: {feature-id}
─────────────────────────────────────────
FIB-H: {found | MISSING}
FIB-S: {found | MISSING}

Mode: {fib-bound | fib-absent}

{if fib-absent}
Warning: No FIB pair found. Pipeline will run without scope anchoring.
Coherence checks in Phases 1-5 will be skipped.
Options:
  1. Continue without FIBs
  2. Halt — I will supply FIBs first
     Template: docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md (§11 quick-use blank)
     Schema:   docs/60-release/zachman_interpolated_feature_intake_recommendation.md
```

4. Record in checkpoint:
   ```json
   "fib_context": {
     "mode": "fib-bound" | "fib-absent",
     "fib_h_ref": "docs/60-release/FIB-H-{id}.md" | null,
     "fib_s_ref": "docs/60-release/FIB-S-{id}.json" | null,
     "loaded_at": "{ISO timestamp}" | null
   }
   ```

5. **If fib-bound:** snapshot coherence anchors from FIB-S:
   - `coherence.non_goals[]` ← `intent.explicit_exclusions`
   - `coherence.feature_loop[]` ← `containment.loop[].id`
   - `coherence.feature_loop_frozen = true`
   - `coherence.scope_authority` ← `governance.scope_authority`

---

## FIB-S Validation (when fib-bound)

Before binding, validate FIB-S has the minimum required structure. Flag failures as warnings — do not auto-repair.

FIB-H required sections (warn if missing):
- §B operator problem statement (≤1 paragraph, no architecture language)
- §E containment loop (5–10 numbered steps)
- §F required outcomes (3–7 bullets)
- §G explicit exclusions (≥3 items)
- §L scope authority block (frozen and signed)

FIB-S required fields (warn if missing):
- All Zachman dimensions populated (`what`/`how`/`where`/`who`/`when`/`why`)
- `containment.loop` has ≥5 steps, `containment.frozen = true`
- `governance.scope_authority.frozen = true`
- ≥1 `traceability.capability_to_outcome` entry

---

## Phase-Level Enforcement (fib-bound only)

### Phase 1 (Scaffold)
- Scaffold non-goals must not contradict `coherence.non_goals[]`; may elaborate
- Scaffold must not declare entities, capabilities, or surfaces absent from FIB-S
- Frontmatter must include `scope_authority: FIB-H {feature-id} vN`
- Do not overwrite `coherence.non_goals[]` — it is owned by the FIB

### Phase 2 (RFC)
- RFC scope must not violate `coherence.non_goals[]`
- RFC must not propose capabilities absent from `zachman.how.capabilities` without an Intake Amendment
- Violation → gate fails; file Intake Amendment (`FEATURE_INTAKE_BRIEF_FORM.md` §9) or revise RFC

### Phase 3 (SEC Note)
- Threat model should reference `zachman.why.business_rules[]` for known rules
- PII / financial entities from `zachman.what.entities` inform the assets list

### Phase 4 (ADR)
- ADR decisions must not depend on capabilities in `coherence.non_goals[]`
- Violation → gate fails; file Intake Amendment or revise ADR

### Phase 5 (PRD)
- PRD frontmatter must include `intake_ref` (FIB-H path) and `structured_ref` (FIB-S path)
- Every functional requirement must cite ≥1 FIB-S outcome, rule, or capability
- Non-goals must include all items from `intent.explicit_exclusions`
- Open questions in FIB-S `governance.open_questions_allowed_at_scaffold` must be preserved, not silently resolved
- Temporal check must include FIB-H and FIB-S in the artifact list

---

## Anti-Invention Boundary (fib-bound)

Scope expansion requires an Intake Amendment (`FEATURE_INTAKE_BRIEF_FORM.md` §9).

**Disallowed without amendment:**
- New operator-visible surface not in `zachman.where.surfaces`
- New capability not in `zachman.how.capabilities`
- New entity not in `zachman.what.entities`
- New actor or permission not in `zachman.who.actors`
- Relaxation of any `severity: "hard"` business rule

**Allowed (implementation elaboration):**
- Decomposing a declared capability into sub-steps
- Selecting between design options within a declared boundary
- Adding ADR-worthy decisions that serve existing capabilities
- Security controls that enforce declared rules

The test: would an operator notice this addition? If yes, it needs FIB authorization.

---

## Intake Amendment Path

If any phase gate fails due to scope expansion:

1. Stop. Do not merge the violating artifact.
2. File an Intake Amendment using `FEATURE_INTAKE_BRIEF_FORM.md` §9.
3. Amendment must name: the addition, which containment loop step it supports, net scope effect.
4. On amendment approval: update FIB-H, regenerate FIB-S, update `coherence.non_goals[]`.
5. Resume the blocked phase.

---

## PRD Frontmatter Requirements (fib-bound)

The PRD produced in Phase 5 must carry FIB references so the build-pipeline can bind them:

```yaml
intake_ref: docs/60-release/FIB-H-{feature-id}.md
structured_ref: docs/60-release/FIB-S-{feature-id}.json
```

The build-pipeline's `intake-traceability-protocol.md` takes over from here — enforcing workstream traceability, capability coverage, anti-invention at implementation time, and open-question disposition in the EXEC-SPEC.
