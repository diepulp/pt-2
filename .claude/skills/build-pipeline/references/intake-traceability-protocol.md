# Intake Traceability Protocol

> Enforcement protocol for the FIB-H / FIB-S → PRD → EXEC-SPEC authority chain.
> Referenced by `SKILL.md` (Intake Authority Chain) and `critic-checklist.md`.

---

## Purpose

The FIB-S (Feature Intake Brief — Structured) is the machine-readable scope authority for a feature. It declares the complete inventory of what the feature may contain: capabilities, outcomes, rules, surfaces, entities, and containment loop steps. Everything downstream — PRD requirements, EXEC workstreams, implementation code — must trace back to this inventory.

The protocol exists because implementation plans are where scope erosion happens. An extra modal, a fallback endpoint, a silent DTO expansion, a helpful admin override, a temporary bypass — each individually looks reasonable. Collectively they produce a system that does not match what was approved. The FIB-S is the fence.

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

### At PRD Generation (prd-writer skill)

When generating a PRD from a FIB:

1. PRD frontmatter must include `intake_ref` (FIB-H path) and `structured_ref` (FIB-S path)
2. Every PRD functional requirement must cite at least one FIB-S outcome, rule, or capability
3. PRD non-goals must include all items from `intent.explicit_exclusions`
4. Open questions must be preserved verbatim — not silently resolved
5. PRD must not introduce capabilities absent from `zachman.how.capabilities`

### At EXEC-SPEC Generation (build-pipeline Stage 3)

When FIB-S is loaded in the pipeline:

1. **Workstream traceability** — every workstream has `traces_to` citing FIB-S elements
2. **Capability coverage** — every capability in `zachman.how.capabilities` is covered by at least one workstream
3. **Anti-invention scan** — no new operator-visible surfaces, public API endpoints, or workflow side-paths
4. **Hard rule visibility** — every `severity: "hard"` rule appears in workstream acceptance criteria
5. **Open-question disposition** — every open question is resolved or carried forward; none silently absent

### At DA Review (build-pipeline Stage 4)

DA reviewers should validate intake traceability as part of their review:

- **R2 (Architecture)**: Check that workstream bounded contexts match FIB-S `zachman.where.bounded_contexts`
- **R3 (Implementation)**: Check that workstream outputs match FIB-S declared surfaces and entities
- **R3 (Implementation)**: Check that `traces_to` fields are substantive, not pro-forma

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
