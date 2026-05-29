# Feature Pipeline Development — Gap Record

**Status:** Gap 1 closed · Gap 2 design closed · implementation pending  
**Scope:** `.claude/skills/feature-pipeline/SKILL.md`, checkpoint schema v8  
**Canonical failure instance:** FIB-H-TIA-CANON-001 (ADR-059, ADR-060, ADR-061)  
**Supersedes:** `scope-as-state-update.md` (pre-patch draft)  
**Patches applied:** `patch-delta.yaml` (P0-001 through P1-004, verdict: approve_with_required_patches)

---

## Gap 1 — Multi-ADR Scope Overflow (CLOSED)

**Symptom:** A single pipeline agent produced multiple ADRs in one phase without detecting that
scope had overflowed. ADR-059 embedded EXEC-SPEC content — a P0 component suppression list with
systematically wrong filesystem paths — because the context was full and verification was skipped.

**Root cause:** The `adr-frozen` gate had no concept of phase scope. "Three ADRs in one phase"
was invisible to every gate. The agent batched all decisions and authored them in one pass.

**Fix applied (schema v7, prior session):**
- Phase 4 preamble: hard stop when >1 independent decision detected or when any decision contains
  implementation guidance (file paths, suppression lists, migration steps)
- `adr_scope` checkpoint block: tracks `user_choice`, `active_index`, `deferred_decisions`
- `adr-frozen` gate: requires `adr_scope.user_choice` non-null before passing
- Schema v6→v7 migration

**Canonical failure:** ADR-059 §2.5 suppression list — four wrong component paths, one
non-existent path, missing actual carrier components — produced because the single agent never
verified paths against the filesystem.

---

## Gap 2 — Scope as Prose, Not State (CLOSED — implementation pending)

**Symptom:** FIB-H-TIA-CANON-001 was loaded in fib-bound mode. FIB-H §P explicitly scoped the
first implementation to the Pit Terminal Rundown exemplar ("vertical exemplar, not a broad
rewrite"). FIB-H §L.2 explicitly deferred `posted_drop_amount_cents` until external custody
authority exists. The pipeline loaded the FIBs but ADR-060 still:
- Introduced system-wide drop naming taxonomy (forbidden field names, UI labels for all future
  surfaces) — AP-ES-01 Horizontal-First Rollout violation
- Addressed `posted_drop_amount_cents` / `counted_drop_amount_cents` without an Intake Amendment —
  resolving a FIB §L.2 deferred decision as an implementation input

**Root cause:** FIB constraints present as text ≠ FIB constraints enforced as pipeline state.

The coherence snapshot at FIB load extracted only:
```
coherence.non_goals[]  ←  intent.explicit_exclusions
coherence.feature_loop[]  ←  containment.loop step IDs
coherence.scope_authority  ←  governance.scope_authority
```

§P (exemplar direction), §L (deferred decisions), and §K (expansion triggers) were present in the
FIB document but had no corresponding checkpoint fields. No gate tested ADR candidates against
them. RFC-discovered decisions — including the naming taxonomy that emerged from design work —
flowed directly into Phase 4 authoring without scope validation.

**Design principle (from conversation):**

> FIB constraints that are not projected into checkpoint state are not considered loaded.
> RFC-discovered decisions are candidates only. No ADR candidate may be authored until it passes
> FIB/exemplar containment validation.

---

## Fix Model (schema v8)

### Model Change

Replace the implicit flow:
```
Phase 2 identifies decisions → Phase 4 authors them
```

With an explicit candidate ledger:
```
Phase 2 identifies candidates
Phase 2 exit gate classifies each against FIB §P / §L / §K anchors
Phase 4 authors only approved_candidates[]
```

### FIB Context Load — Three New Extraction Steps

**§P — Exemplar Scope** (semantic aliases: `Exemplar Direction`, `Vertical Collapse`,
`First Implementation Boundary`, `Exemplar Pair`, phrases: "vertical exemplar", "first
implementation", "exemplar pair"):

Sets `exemplar_scope.mode`: `required | optional | not_applicable | unevaluated`

`not_applicable` requires populated `criteria` with negative evidence for all four
EXEMPLAR_SLICE_DISCIPLINE §3 fields — silence or missing §P does not permit `not_applicable`.

```json
"exemplar_scope": {
  "mode": "unevaluated",
  "applies": false,
  "evaluated": false,
  "declaration_source": null,
  "boundary": null,
  "first_surface_or_pair": [],
  "downstream_consumers": [],
  "deferred_decisions": [],
  "forbidden_during_exemplar": [],
  "proof_obligations": [],
  "expansion_gate": null,
  "criteria": {
    "structural_categories_count": null,
    "shared_mechanism_present": null,
    "movable_parts_count": null,
    "shared_change_risk_present": null
  },
  "warnings": [],
  "violations_detected": []
}
```

`proof_obligations[]` records I1–I4 invariants from EXEMPLAR_SLICE_DISCIPLINE §5. Advisory at
feature-pipeline stage — actual proof is a build-pipeline responsibility.

**§L — Deferred Decisions** (semantic aliases: `Deferred Decisions`, `Open Questions Not
Implementation Input`, `Applies Only After`, phrases: "not an implementation input for this
slice", "deferred until"):

Populates `coherence.deferred_items[]` with FIB section citations.
Sets `coherence.deferred_items_extraction.status`: `extracted | section_absent | failed`.
Gates check status, not array length. `unevaluated` (default) is a gate failure in fib-bound mode.

**§K — Expansion Triggers** (semantic aliases: `Expansion Trigger Rule`, `Intake Amendment
Trigger`, `Amendment Required When`, phrases: "requires amendment", "triggers amendment"):

Populates `coherence.expansion_triggers[]`.
Sets `coherence.expansion_triggers_extraction.status` using the same sentinel pattern.
Any ADR candidate tripping an expansion trigger → classified `amendment_required`.

### Phase 2 Exit Gate — ADR Candidate Scope Matrix

Required sub-step of `design-approved`. Classifies every RFC candidate against FIB anchors.

**Status enum:**

| Status | Meaning |
|---|---|
| `in_exemplar` | Required by and contained within the exemplar boundary |
| `constrained` | Partially in scope; only `allowed_form` may be authored |
| `deferred` | In `coherence.deferred_items[]` or `exemplar_scope.downstream_consumers` |
| `out_of_scope` | Exceeds FIB scope authority entirely |
| `amendment_required` | Requires Intake Amendment; or trips `coherence.expansion_triggers[]` |

Every candidate requires a `containment_loop_trace` citing a FIB section (`"FIB §L.2"`,
`"FIB §P.3"`). Classifications without a section reference are invalid — gate fails.

`constrained` candidates require `allowed_form` (what may be authored) and `forbidden_form`
(what must not appear in the authored ADR).

**Checkpoint arrays (P0-002 — full audit trail preserved):**
- `all_candidates[]` — every RFC candidate regardless of status
- `approved_candidates[]` — IDs with status `in_exemplar` or `constrained` only
- `blocked_candidates.deferred[]` — deferred IDs
- `blocked_candidates.out_of_scope[]` — out_of_scope IDs
- `blocked_candidates.amendment_required[]` — amendment_required IDs

If `blocked_candidates` is non-empty: HARD STOP before `design-approved` passes. User decides:
remove blocked candidates, file Intake Amendment, or narrow constrained candidate.

### Phase 4 Authoring Precondition

```
adr_authoring_precondition:
  required:
    - decision_scope.adr_candidate_scope_matrix_completed = true
    - coherence.deferred_items_extraction.status in [extracted, section_absent]
    - coherence.expansion_triggers_extraction.status in [extracted, section_absent]
    - exemplar_scope.evaluated = true (fib-bound)
    - exemplar_scope.mode != "unevaluated" (fib-bound)
  fail_if:
    - candidate not in decision_scope.approved_candidates[]
    - candidate resolves a coherence.deferred_items[] entry as implementation input
    - candidate contradicts exemplar_scope.boundary
```

### `adr-frozen` Gate — Structural Constrained Check (P1-003)

For `constrained` candidates — structural verification, not fuzzy text matching:

```
required:
  - ADR frontmatter includes candidate_id
  - ADR includes allowed_scope_summary
  - ADR non-goals derived from forbidden_form

fail_if:
  - ADR defines schema/ownership/lifecycle/implementation for forbidden_form domain
  - ADR resolves a coherence.deferred_items[] entry
  - ADR rejected-alternatives section authorizes forbidden_form indirectly
```

### Schema Migration v7 → v8 (P0-003)

For legacy checkpoints already past `design-approved`:

```json
"adr_candidate_scope_matrix_completed": false,
"legacy_checkpoint_status": "pre_scope_as_state_gate",
"requires_backfill_review": true
```

Do NOT set `matrix_completed: true` for pre-gate checkpoints — that falsely records a review that
never happened.

---

## Canonical Replay: FIB-H-TIA-CANON-001

With scope-as-state applied:

1. **FIB Context Load**: §P extracted → `exemplar_scope.boundary = "Pit Terminal Rundown backed by
   TableInventoryAccountingProjection"`, `mode = "required"`. §L.2 extracted →
   `coherence.deferred_items = [{item: "posted_drop_amount_cents", trace: "FIB §L.2"}, ...]`.
   `deferred_items_extraction.status = "extracted"`.

2. **Phase 2 exit**: RFC names four ADR candidates. Classification:

   | ID | Title | Status | Trace |
   |---|---|---|---|
   | ADR-CAND-001 | TableInventoryAccounting subdomain ownership | `in_exemplar` | FIB §P |
   | ADR-CAND-002 | Drop naming taxonomy | `constrained` | FIB §P / §L.2 |
   | ADR-CAND-003 | Future custody drop authority | `deferred` | FIB §L.2 |
   | ADR-CAND-004 | Dashboard convergence | `deferred` | FIB §P (downstream_consumers) |

   ADR-CAND-002 constrained: `allowed_form = "forbid generic labels for telemetry-derived estimate
   only"`, `forbidden_form = "posted/count-room/final drop implementation vocabulary and taxonomy"`.

   ADR-CAND-003, ADR-CAND-004 → `blocked_candidates.deferred[]` → **HARD STOP**.

3. **User decides**: Remove ADR-CAND-003 and ADR-CAND-004 from this slice (defer to post-exemplar
   backlog). Gate passes.

4. **Phase 4**: Authors ADR-059 (CAND-001, `in_exemplar`) and ADR-060 (CAND-002, `constrained`).
   ADR-060 `adr-frozen` gate verifies it contains `allowed_scope_summary`, non-goals from
   `forbidden_form`, and no `posted_drop_amount_cents` schema/ownership/implementation.

5. **ADR-060 as produced** (the actual violation form) would fail the structural constrained check
   at step 4 — it defined schema for `posted_drop_amount_cents` and `counted_drop_amount_cents`.
   Gate rejects it. Agent must narrow to `allowed_form` before gate passes.

**Result:** ADR-060 is never authored in its violation form.

---

## Governance Links

| Document | Role |
|---|---|
| `docs/70-governance/EXEMPLAR_SLICE_DISCIPLINE.md` | §3 mandatory criteria, §5 proof invariants, §6 containment rules, AP-ES-01/04 anti-patterns |
| `.claude/skills/feature-pipeline/references/fib-context-protocol.md` | FIB load protocol; anti-invention boundary |
| `docs/80-adrs/ADR-058-feature-classification-gate.md` | Front-door classification rule |
| `docs/70-governance/feature-intake/FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.yaml` | §K expansion triggers source |
| `docs/issues/gaps/feature-pipeline-development/patch-delta.yaml` | Patches P0-001–P1-004 |

---

## Open Question

Should Phase 1 (Scaffold) and Phase 3 (SEC Note) gates also reference `exemplar_scope` for
early-warning drift detection before Phase 2 generates candidates? Currently the candidate ledger
is Phase 2 exit only. Scaffold non-goals and RFC direction could both introduce scope drift that
only surfaces when candidates are classified. Earlier warnings would reduce rework.
