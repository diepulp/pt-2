# Intake Traceability Protocol

> Enforcement protocol for the FIB-H / FIB-S → PRD → EXEC-SPEC authority chain.
> Referenced by `SKILL.md` (Intake Authority Chain).

---

## Purpose

The FIB-S (Feature Intake Brief — Structured) is the machine-readable scope authority for a feature. It declares the complete inventory of what the feature may contain: capabilities, outcomes, rules, surfaces, entities, and containment loop steps. Everything downstream — PRD requirements, EXEC workstreams, implementation code — must trace back to this inventory.

The protocol exists because implementation plans are where scope erosion happens. An extra modal, a fallback endpoint, a silent DTO expansion, a helpful admin override, a temporary bypass — each individually looks reasonable. Collectively they produce a system that does not match what was approved. The FIB-S is the fence.

Before that fence is frozen, FIB authors must apply `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md`. That guardrail catches phase compression at generation time: transport plus semantics, semantics plus UI, pattern proof plus full inventory, contract definition plus enforcement, or any other bundle where a FIB tries to land the consequences of a change in the same slice as the cause.

---

## FIB-S Structure Reference

The structured intake JSON follows this shape (relevant sections for traceability):

```
zachman.what.entities[]         → declared data entities and their fields
zachman.how.capabilities[]      → declared capabilities (name, verb, served_outcomes, loop_steps)
zachman.where.surfaces[]        → declared UI surfaces, API endpoints, RPCs
zachman.why.business_rules[]    → hard and soft rules (id, statement, severity)
zachman.why.invariants[]        → invariants that must hold
traceability.outcomes[]         → declared outcomes (id, statement)
containment.loop[]              → declared containment loop steps (id, actor, action, system_response)
governance.open_questions_allowed_at_scaffold[]  → unresolved items
```

---

## Enforcement Points

### At FIB Generation

Before approving a FIB-H/FIB-S pair:

1. Declare exactly one primary change class from `FIB_GENERATION_SCOPE_GUARDRAIL.md`: Transport, Semantics, Presentation, Enforcement, Observability, or Infrastructure.
2. Add a one-line boundary in the FIB-H: `This FIB changes <one thing> at <one boundary>; it does not change <next boundary>.`
3. Apply the cross-class leakage rule: any `MUST` item that requires logic in another change class is out of scope unless the primary boundary would be incorrect without it.
4. Declare coverage mode as `Representative` or `Full`. Representative mode must name exact concrete surfaces, not categories, and prohibit expansion. Full mode must be Enforcement or a dedicated rollout/inventory slice.
5. Declare one primary layer: Service/Data, API, UI, Enforcement, Observability, or Infrastructure. Secondary layers may only be pass-through with no logic added. DTO shape changes are Service/Data unless they strictly pass through an existing upstream contract.
6. Add an adjacent consequence ledger that names likely temptations and their destination phase/FIB. At least one ledger item must represent cross-class work explicitly removed from `MUST` scope.
7. Run the atomicity test: the FIB must ship without deferred downstream work, deferred work must follow without rewriting this FIB, and the shipped FIB must remain internally consistent and truthful, not merely compilable.
8. Run the diff-size sanity check: expected implementation touching more than 5-7 files with logic changes, more than one directory boundary, or more than one bounded context requires re-evaluation for hidden multi-class scope.
9. Encode the same scope boundary in FIB-S, preferably under `scope_guardrail`; if the schema cannot add that field, encode it in `governance`, `intent.explicit_exclusions`, and `coherence.deferred_items`.

Generation-time violations block approval. Split the FIB or amend the parent roadmap before producing PRD/EXEC artifacts.

### At PRD Generation (prd-writer skill)

When generating a PRD from a FIB:

1. PRD frontmatter must include `intake_ref` (FIB-H path) and `structured_ref` (FIB-S path)
2. Every PRD functional requirement must cite at least one FIB-S outcome, rule, or capability
3. PRD non-goals must include all items from `intent.explicit_exclusions`
4. Open questions must be preserved verbatim — not silently resolved
5. PRD must not introduce capabilities absent from `zachman.how.capabilities`

### At EXEC-SPEC Generation (build-pipeline Stage 3 — Assemble & Validate)

When FIB-S is loaded in the pipeline:

1. **Workstream traceability** — every workstream has `traces_to` citing FIB-S elements
2. **Capability coverage** — every capability in `zachman.how.capabilities` is covered by at least one workstream
3. **Anti-invention scan** — two-pass: (a) no workstream description introduces surfaces absent from FIB-S, (b) extract every `app/api/` path from workstream `outputs` arrays and verify each matches a declared `zachman.where.surfaces[kind=api]` entry
4. **Hard rule visibility** — every `severity: "hard"` rule appears in workstream acceptance criteria
5. **Open-question disposition** — every open question is resolved or carried forward; none silently absent
6. **Bounded-context alignment** — workstream bounded contexts match FIB-S `zachman.where.bounded_contexts`
7. **Output-surface alignment** — workstream outputs match FIB-S declared surfaces and entities

Violations block human review. Revise to remove the invention, or request an intake amendment.

---

## Traceability Reference Syntax

Workstream `traces_to` fields use these prefixes:

| Prefix | Source | Example |
|--------|--------|---------|
| `CAP:` | `zachman.how.capabilities[].name` | `CAP:end_visit_from_rating_slip_modal` |
| `OUT-` | `traceability.outcomes[].id` | `OUT-1` |
| `RULE-` | `zachman.why.business_rules[].id` | `RULE-2` |
| (bare) | `containment.loop[].id` | `END-4`, `SFP-7` |
| `infrastructure` | Standard infra workstream | `infrastructure` |

Example:
```yaml
WS2:
  name: Slip Finalization Orchestrator
  traces_to: [CAP:finalize_open_slips_for_visit, RULE-1, RULE-2, OUT-2, OUT-3, END-4, END-5]
```

---

## Open-Question Decision Records

When an EXEC-SPEC resolves an open question from the FIB-S, the decision must be recorded in the EXEC YAML `decisions` array:

```yaml
decisions:
  - decision_id: DEC-001
    resolves_open_question: "OQ-2"
    decision_statement: "..."
    rationale: "..."
    impact_on_scope: none  # none | amendment_required
```

**Rules:**
- `decision_id` must be unique within the EXEC-SPEC
- `resolves_open_question` must match an item in `governance.open_questions_allowed_at_scaffold`
- `impact_on_scope: amendment_required` blocks the pipeline until the FIB is amended and PRD updated
- Decisions with `impact_on_scope: none` must genuinely stay within the declared scope — reviewers should validate this claim
- Decisions that assert *existing system behavior* must include `verification: cited` with file path and line number in the rationale, OR `verification: assumption` which auto-injects a verification test into the relevant test workstream
- The example content in decision records is illustrative of format, not recommended domain rulings

---

## Anti-Invention Boundary

The distinction between allowed and disallowed additions:

### Disallowed (requires intake amendment)

- New operator-visible modal, panel, or screen
- New public API endpoint (`GET/POST/PATCH/DELETE /api/v1/...`)
- New workflow branch not in the containment loop (e.g., "if X then redirect to admin console")
- New domain DTO that changes the data contract visible to other contexts
- New persisted column/table that expands the entity model beyond `zachman.what.entities`
- Relaxation of any `severity: "hard"` business rule or invariant

### Allowed (standard implementation)

- Internal helper types (`FooMapper`, `BarAdapter`, utility unions)
- Adapter DTOs that transform between existing entities without changing scope semantics
- Standard infrastructure (test files, migration boilerplate, type generation)
- Implementation-detail choices (which executor, phase ordering, file paths)
- Error types and error-handling utilities that serve declared capabilities

The test: would an operator notice this addition? If yes, it needs FIB authorization. If no, it's implementation plumbing.

---

## Failure Patterns

| Pattern | Description | Fix |
|---------|-------------|-----|
| `untraceable-workstream` | Workstream has no `traces_to` or cites only `infrastructure` for non-infra work | Add substantive FIB-S trace or remove workstream |
| `uncovered-capability` | FIB-S capability not referenced by any workstream | Add workstream or verify coverage through existing workstream |
| `invented-surface` | Workstream creates UI surface / API not in FIB-S | Remove or request intake amendment |
| `silent-oq-resolution` | Open question absent from both decisions and risks | Add explicit decision record or carry forward in risks |
| `hard-rule-invisible` | Hard rule not in any workstream acceptance criteria | Add to relevant workstream constraints |
| `scope-expanding-decision` | Decision marked `impact_on_scope: none` but actually expands scope | Reclassify as `amendment_required` |
| `consequence-bundling` | FIB combines a primary boundary change with downstream alignment or enforcement needed only after that boundary exists | Split FIB by primary change class and move consequences to the adjacent consequence ledger |
| `cross-class-leakage` | FIB declares one primary change class but includes logic work from another class | Move leaked work to adjacent consequence ledger or prove the primary boundary would be incorrect without it |
| `coverage-mode-drift` | FIB claims representative coverage but uses category names, full-inventory language, or expands unnamed surfaces | Name exact concrete surfaces or reclassify as a Full enforcement/rollout slice |
| `layer-budget-overrun` | More than one layer requires logic changes in the same FIB | Split by layer unless secondary work is strictly pass-through |
| `dto-layer-smuggling` | DTO shape, mapper, or semantic changes are framed as API-only work | Reclassify as Service/Data or prove the DTO is strict pass-through of an existing upstream contract |
| `atomicity-half-truth` | FIB can compile or merge without deferred work but leaves a misleading or internally inconsistent contract | Redraw the boundary so the shipped FIB is truthful on its own |
| `ledger-underfill` | Adjacent consequence ledger contains only trivial, same-class, or unrelated future items | Add at least one cross-class item explicitly removed from `MUST` scope |
| `diff-size-drift` | Expected implementation scale exceeds file, directory, or bounded-context thresholds | Re-evaluate for hidden multi-class scope and split if needed |
