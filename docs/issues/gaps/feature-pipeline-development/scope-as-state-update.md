 Plan: Feature Pipeline — Scope-as-State Upgrade

 Context

 The feature pipeline loaded FIBs correctly (fib-bound mode) for FIB-H-TIA-CANON-001 but produced
 ADR-060 which violated the exemplar scope in two ways:
 - Introduced system-wide drop naming taxonomy beyond the Pit Terminal Rundown exemplar boundary
 - Addressed FIB §L.2 deferred decisions (posted_drop_amount_cents) without an Intake Amendment

 Root cause: FIB constraints were prose, not checkpoint state. The pipeline extracted only
 non_goals, feature_loop, and scope_authority at load time. §P (exemplar direction) and §L
 (deferred decisions) were present in the FIB document but invisible to every gate. RFC-discovered
 decisions flowed directly into Phase 4 authoring with no scope validation step.

 The fix: Scope becomes state. FIB constraints that are not projected into checkpoint fields are
 not considered loaded. RFC decisions are candidates only. No ADR candidate may be authored until it
 passes a scope classification gate.

 ---
 Model Change Summary

 Replace the current implicit flow:

 Phase 2 identifies decisions → Phase 4 authors them

 With an explicit candidate ledger:

 Phase 2 identifies candidates → Phase 2 exit gate classifies each against FIB anchors
 → Phase 4 authors only approved candidates

 ---
 File: .claude/skills/feature-pipeline/SKILL.md

 Change 1 — FIB Context Load: Extract §P and §L into checkpoint

 After the existing coherence snapshot block (fib-bound only), add:

 Exemplar Scope Extraction (fib-bound only):
 1. Read FIB-H §P (or equivalent "exemplar direction" section — look for phrases "vertical exemplar",
    "exemplar direction", "first implementation", "exemplar pair").
    - If found: set exemplar_scope.applies = true
    - Extract exemplar_scope.boundary (the scope sentence)
    - Extract exemplar_scope.first_surface_or_pair[] (named exemplar entries)
    - Extract exemplar_scope.downstream_consumers[] (surfaces/consumers deferred until after exemplar)
    - Extract exemplar_scope.forbidden_during_exemplar[] (any explicit §P exclusions)
    - Set exemplar_scope.declaration_source = "fib_section_P"
    - If §3 of EXEMPLAR_SLICE_DISCIPLINE.md mandatory criteria are met but §P is absent: set applies
      = true with a warning that FIB-H should name the exemplar pair explicitly
    - If neither applies: set applies = false

 2. Read FIB-H §L (or equivalent "deferred decisions" / "scope authority" section — look for phrases
    "not an implementation input for this slice", "deferred until", "applies only after").
    - Extract each deferred decision into coherence.deferred_items[] with its FIB section citation
    - These items are binding: no ADR candidate may resolve a deferred item as an implementation input

 FIB constraints not projected into checkpoint fields are not considered loaded. If a section
 cannot be located, record it as absent and surface a warning — do not silently skip.

 Change 2 — Phase 2 Exit Gate: ADR Candidate Scope Matrix

 Add as a required sub-step of design-approved. The RFC's "Decisions Required" section produces
 candidates; the gate classifies each before approving Phase 2.

 **ADR Candidate Scope Matrix (required before `design-approved` passes):**

 For each decision in the RFC's "Decisions Required" section, classify it against FIB anchors:

 | Status | Meaning |
 |---|---|
 | `in_exemplar` | Decision is required by and contained within the exemplar boundary |
 | `constrained` | Decision is partially in scope; only the `allowed_form` may be authored |
 | `deferred` | Decision is in coherence.deferred_items[] or exemplar_scope downstream_consumers |
 | `out_of_scope` | Decision exceeds the FIB scope authority entirely |
 | `amendment_required` | Decision requires an Intake Amendment before it can proceed |

 Each candidate must record:
 - `scope_status` (from enum above)
 - `containment_loop_trace`: the FIB section that supports the classification (e.g. "FIB §L.2",
   "FIB §P.3", "FIB §G exclusion"). Citations without a section reference are invalid.
 - For `constrained`: `allowed_form` (what may be authored) and `forbidden_form` (what must not
   appear in the authored ADR)
 - For `deferred`/`out_of_scope`/`amendment_required`: `reason` with FIB section cite

 If any candidate is `deferred`, `out_of_scope`, or `amendment_required`: HARD STOP before
 `design-approved` passes.

 [CANDIDATE SCOPE GATE]
 ─────────────────────────────────────────
 FIB scope authority: {fib_scope_authority.artifact} (frozen: {frozen})
 Exemplar boundary: {exemplar_scope.boundary}

 Candidate classification:
   {id} — {title}
   Status: {scope_status}
   Trace: {containment_loop_trace}
   [allowed_form / forbidden_form if constrained]
   [reason if deferred/out_of_scope/amendment_required]

 ⚠ Candidates with status [deferred | out_of_scope | amendment_required] block Phase 2 approval.

 How do you want to proceed?
   1. Remove blocked candidates from scope (defer to post-exemplar backlog)
   2. File an Intake Amendment to FIB-H to widen scope (required for amendment_required status)
   3. Narrow a constrained candidate to its allowed_form only
   4. Other — describe

 Waiting for your decision.

 Populate decision_scope.adr_candidates[] with the full classification before recording
 design-approved.

 Change 3 — Phase 4: Simplified (candidates pre-approved at Phase 2 exit)

 The Phase 4 scope check we added in the previous session remains but is now lighter — it verifies
 the candidate ledger was completed and no unapproved candidates are being authored:

 **Phase 4 Precondition (authoring gate):**

 Before authoring any ADR, verify:
 1. `decision_scope.adr_candidate_scope_matrix_completed = true`
 2. `fib_scope_authority.loaded = true`
 3. `coherence.deferred_items` was populated at FIB load (not empty-by-default)
 4. `exemplar_scope.evaluated = true` (if fib-bound)
 5. Every candidate being authored in this phase has `scope_status` in [`in_exemplar`, `constrained`]

 For `constrained` candidates: the authored ADR must not contain content matching `forbidden_form`.
 The `adr-frozen` gate verifies this — if the authored text covers the `forbidden_form`, the gate
 fails even if the candidate was approved at Phase 2.

 If any candidate being authored has `scope_status` in [`deferred`, `out_of_scope`,
 `amendment_required`]: HARD STOP — this was approved at Phase 2 or the ledger was not completed.

 The exemplar containment hard stop from the previous plan is now handled at Phase 2 exit. Phase 4
 precondition is a verification step, not the primary enforcement point.

 Change 4 — Checkpoint Schema Updates

 coherence block — add deferred_items:
 "coherence": {
   "non_goals": [],
   "feature_loop": [],
   "feature_loop_frozen": false,
   "deferred_items": [],
   "expansion_triggers": [],
   "scope_authority": { "artifact": null, "version": null, "frozen": false },
   "violations": []
 }

 exemplar_scope block (new, between fib_context and gates):
 "exemplar_scope": {
   "applies": false,
   "declaration_source": null,
   "boundary": null,
   "first_surface_or_pair": [],
   "downstream_consumers": [],
   "deferred_decisions": [],
   "forbidden_during_exemplar": [],
   "proof_obligations": [],
   "expansion_gate": null,
   "evaluated": false,
   "containment_decision": null,
   "violations_detected": []
 }

 Note: proof_obligations[] records EXEMPLAR_SLICE_DISCIPLINE §5 I1–I4 invariants identified
 during design. Advisory only at feature-pipeline stage — actual proof is a build-pipeline
 responsibility and must be satisfied in the EXEC phase.

 decision_scope block (new, between exemplar_scope and da_review):
 "decision_scope": {
   "adr_candidate_scope_matrix_completed": false,
   "fib_scope_authority": {
     "artifact": null,
     "frozen": false,
     "downstream_expansion_allowed_without_amendment": true
   },
   "adr_candidates": [],
   "rejected_or_deferred_candidates": [],
   "amendment_required_candidates": []
 }

 Each entry in adr_candidates[]:
 {
   "id": "ADR-CAND-001",
   "title": "string",
   "scope_status": "in_exemplar | constrained | deferred | out_of_scope | amendment_required",
   "containment_loop_trace": "FIB §X.Y",
   "allowed_form": "string or null",
   "forbidden_form": "string or null",
   "reason": "string",
   "authored": false,
   "adr_id": null
 }

 adr_scope block (added in previous session) — remove overflow_detected (redundant with
 candidate ledger) and retain:
 "adr_scope": {
   "user_choice": null,
   "active_index": 0,
   "deferred_decisions": []
 }

 Change 5 — Checkpoint Invariants (add)

 - coherence.deferred_items must be populated (not left as empty default) during FIB Context Load
 in fib-bound mode. If FIB-H has no §L or equivalent, record [] with a note that no deferred
 decisions were found.
 - decision_scope.adr_candidate_scope_matrix_completed must be true before design-approved
 passes.
 - exemplar_scope.evaluated must be true before design-approved passes (fib-bound only).
 - decision_scope.adr_candidates[] may only contain scope_status in [in_exemplar,
 constrained] when adr_candidate_scope_matrix_completed = true. Blocked candidates move to
 rejected_or_deferred_candidates[] or amendment_required_candidates[].
 - adr_authoring_precondition (Phase 4): all of the following must be true:
   - decision_scope.adr_candidate_scope_matrix_completed
   - decision_scope.fib_scope_authority.loaded
   - coherence.deferred_items populated (even if empty)
   - exemplar_scope.evaluated (if fib-bound)
   - candidate being authored has scope_status in [in_exemplar, constrained]

 Change 6 — Schema v7 → v8

 Bump schema_version to 8. Migration:
 - Inject exemplar_scope block (all-null/false defaults) after fib_context
 - Inject decision_scope block (all-null/false defaults) after exemplar_scope
 - Add deferred_items: [] and expansion_triggers: [] to coherence block
 - For checkpoints already past design-approved: set adr_candidate_scope_matrix_completed: true
 and exemplar_scope.evaluated: true with containment_decision: "pre-gate"

 Change 7 — design-approved Gate Update

 Add: "ADR candidate scope matrix completed: all candidates classified against FIB anchors with
 section citations; no candidate in [deferred, out_of_scope, amendment_required] remains in
 adr_candidates[]."

 Change 8 — adr-frozen Gate Update (constrained candidate check)

 Add: "For any candidate with scope_status: constrained: authored ADR text does not contain
 content matching forbidden_form. If it does, the gate fails."

 Change 9 — Definition of Done (add before ADR item)

 - [ ] **ADR candidate scope matrix completed at Phase 2 exit**: each RFC decision classified with
   FIB section citation; blocked candidates moved to deferred/amendment lists; constrained candidates
   have allowed_form and forbidden_form documented; `design-approved` gate recorded classification
 - [ ] **Exemplar scope extracted** (fib-bound): `exemplar_scope.boundary`, `downstream_consumers`,
   `deferred_decisions`, and `forbidden_during_exemplar` populated from FIB §P and §L at load time

 ---
 Deliverable 2: Gap Document
     │ - [ ] **Exemplar scope extracted** (fib-bound): `exemplar_scope.boundary`, `downstream_consumers`,    │
     │   `deferred_decisions`, and `forbidden_during_exemplar` populated from FIB §P and §L at load time     │
     │                                                                                                       │
     │ ---                                                                                                   │
     │ Deliverable 2: Gap Document                                                                           │
     │                                                                                                       │
     │ File: docs/issues/gaps/feature-pipeline-development/GAP-FEATURE-PIPELINE-DEVELOPMENT.md               │
     │                                                                                                       │
     │ Contents:                                                                                             │
     │ - Gap 1 (CLOSED in prior session): Multi-ADR scope overflow — hard stop gate, adr_scope               │
     │ block, schema v7. Canonical failure: ADR-059 embedding EXEC-SPEC suppression paths.                   │
     │ - Gap 2 (CLOSED by this plan): Scope as prose, not state — FIB §P and §L not extracted into           │
     │ checkpoint; RFC decisions flowed to authoring without scope validation. Canonical failure: ADR-060    │
     │ introducing system-wide naming taxonomy, resolving FIB §L.2 deferred decisions.                       │
     │ - Fix model: candidate ledger, Phase 2 exit classification gate, authoring precondition.              │
     │ - Governance links: EXEMPLAR_SLICE_DISCIPLINE.md, fib-context-protocol.md, ADR-058.                   │
     │ - Open question for future sessions: Should Phase 1 (Scaffold) and Phase 3 (SEC Note) also            │
     │ reference exemplar_scope for early-warning drift detection, before Phase 2 generates candidates?      │
     │                                                                                                       │
     │ ---                                                                                                   │
     │ Verification                                                                                          │
     │                                                                                                       │
     │ 1. Read Phase 2 section in SKILL.md — confirm "ADR Candidate Scope Matrix" appears as a required      │
     │ sub-step of design-approved, with classification enum, citation requirement, and hard stop.           │
     │ 2. Read FIB Context Load section — confirm §P and §L extraction steps are present.                    │
     │ 3. Read checkpoint schema — confirm exemplar_scope, decision_scope blocks present with correct        │
     │ field shapes; coherence has deferred_items and expansion_triggers.                                    │
     │ 4. Read design-approved gate — confirm candidate matrix is a gate condition.                          │
     │ 5. Read adr-frozen gate — confirm constrained candidate forbidden_form check.                         │
     │ 6. Mental replay FIB-H-TIA-CANON-001:                                                                 │
     │   - FIB load: §P extracted → exemplar_scope.boundary = "Pit Terminal Rundown"; §L.2 extracted →       │
     │ coherence.deferred_items = ["posted_drop_amount_cents", "final_table_win_loss_cents", ...]            │
     │   - Phase 2 exit: ADR-CAND-002 (drop naming taxonomy) classified constrained with                     │
     │ allowed_form = "forbid generic labels for telemetry-derived estimate only" and                        │
     │ forbidden_form = "posted/count-room/final drop implementation vocabulary"; ADR-CAND-003               │
     │ (custody drop) classified deferred citing FIB §L.2 → HARD STOP → user decides                         │
     │   - ADR-060 is never authored in its violation form                                                   │
     ╰───────────────────────────────────────────────────────────────────────────────────────────────────────╯
