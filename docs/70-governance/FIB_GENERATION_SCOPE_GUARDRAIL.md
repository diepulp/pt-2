---
id: GOV-FIB-001
title: FIB Generation Scope Guardrail
owner: Engineering Lead
status: Accepted
created: 2026-04-30
last_review: 2026-04-30
affects: [GOV-001, PRD-STD-001]
---

# FIB Generation Scope Guardrail

## 1. Purpose

Prevent scope creep before a Feature Intake Brief is frozen.

The FIB-H/FIB-S pair is the scope authority for downstream PRDs, EXEC-SPECs, and implementation. If a FIB bundles adjacent phase consequences into the same slice, later traceability gates can only preserve the bad boundary. This guardrail catches phase compression at FIB generation time.

## 2. Canonical Failure Pattern

**GOV-FIB-AP-001 - Consequence Bundling**

A FIB starts with one legitimate phase objective, then adds the downstream consequences needed to make the whole system feel fully aligned.

The recurring shape:

1. Define a narrow cause: transport stabilization, canonicalization, UI alignment, enforcement, observability, or migration.
2. Notice adjacent consequences that will eventually be necessary.
3. Pull those consequences into the same FIB for perceived completeness.
4. Create a cross-layer dependency chain that must land atomically.
5. Audit later splits the FIB back into the phases that should have existed upfront.

This is the pattern isolated from:

- `docs/issues/gaps/financial-data-distribution-standard/OVERENGINEERING_GUARDRAIL_FIN_TELEMETRY.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2/PRD-071-AUDIT.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b/phase-scope-containment.md`

## 3. Diagnostic Sentence

If a FIB tries to land the consequences of a change in the same slice as the cause, it is over-scoped.

Examples:

- Transport stabilization plus unit canonicalization
- Canonicalization plus UI migration
- UI migration plus full contract enforcement
- Pattern establishment plus full surface inventory rollout
- Deprecation annotation plus runtime observability

Each pair may be sequentially valid. Bundling them into one FIB is the defect.

## 4. Scope Classification Gate

Every FIB must declare exactly one primary change class.

| Change Class | Primary Question | Allowed Work | Defer By Default |
|--------------|------------------|--------------|------------------|
| Transport | Does an existing fact pass through a boundary truthfully? | Pass-through, envelope shape, representative contract tests, documentation of current semantics | Unit changes, DTO promotion, UI migration, full enforcement |
| Semantics | What does the fact mean? | Unit/type/source canonicalization, mapper correction, DTO meaning stabilization | UI rendering, broad OpenAPI expansion, observability, lint enforcement |
| Presentation | How is a stable fact shown to users? | Components, labels, formatter migration, visible copy alignment | Service canonicalization, API reshaping, contract matrix expansion |
| Enforcement | How do we prevent regression after the contract is stable? | Lint rules, CI gates, full contract matrices, Playwright assertions | Semantic changes, new UI behavior, route inventory expansion |
| Observability | How do we detect use or drift after delivery? | Logs, metrics, dashboards, deprecation usage tracking | Contract definition, semantic changes, UI migration |
| Infrastructure | What runtime support is necessary now? | Small support primitives with a current consumer and rollback plan | Outbox, projections, queues, generic buses without a trigger |

If a FIB needs two primary change classes, split it or explicitly create a parent roadmap plus child FIBs.

## 5. Cross-Class Leakage Rule

If a `MUST` item requires logic work in a different change class, it is automatically out of scope unless explicitly justified as required to prove the primary boundary.

Default disposition: move the item to the Adjacent Consequence Ledger.

A work item proves the boundary only if the boundary would be incorrect without it. If the boundary can be demonstrated with a representative subset, shape assertion, pass-through check, existing contract, or focused regression test, broader cross-class work is not required.

This rule blocks rationalizations such as:

- UI migration "needed to validate" a semantic change.
- OpenAPI expansion "needed to express" service canonicalization.
- Full contract matrices "needed to prove" a transport pattern.
- Runtime logging "needed to make" a deprecation annotation complete.

## 6. Generation-Time Required Blocks

Every new FIB-H must include these blocks before approval.

### 6.1 One-Line Boundary

Format:

```text
This FIB changes <one thing> at <one boundary>; it does not change <next boundary>.
```

Example:

```text
This FIB proves existing financial envelopes at the HTTP boundary; it does not change unit semantics.
```

### 6.2 Primary Change Class

State one value from the classification gate:

```text
Primary change class: Transport
```

Secondary classes are allowed only in `Deferred Work`, not in `MUST`.

### 6.3 Coverage Mode

Every FIB must declare coverage mode.

```text
Coverage mode: Representative | Full
```

If `Representative`:

- Name the exact routes, components, services, reports, workflows, or other surfaces in scope.
- List concrete instances, not categories.
- Treat expansion beyond those named surfaces as prohibited without FIB amendment.
- Do not use "all", "complete", "entire", or equivalent inventory language in `MUST` items.

Invalid representative scope:

- "all visit routes"
- "all session routes"
- "all financial endpoints"
- "all endpoints under `/api/v1`"

Valid representative scope:

- `GET /api/v1/visits/[visitId]/live-view`
- `GET /api/v1/players/[playerId]/recent-sessions`
- `components/financial/FinancialValue.tsx`

If `Full`:

- The FIB must be explicitly classed as Enforcement or as a dedicated rollout/inventory slice.
- The FIB must not also introduce new semantics, UI behavior, transport shape, or infrastructure.
- The FIB must explain why representative coverage is insufficient.

### 6.4 Layer Budget

Every FIB must declare one primary layer.

Allowed primary layers:

- Service/Data
- API
- UI
- Enforcement
- Observability
- Infrastructure

Secondary layers are allowed only for strictly pass-through work with no logic added. If more than one layer requires logic changes, split the FIB.

DTO shape changes are Service/Data work unless they are strictly pass-through of an existing upstream contract.

If a DTO change requires mapper logic, changes field meaning, changes unit semantics, or changes cross-context consumption semantics, it is not an API-layer change even when the DTO is exposed through an API route.

### 6.5 Cause vs Consequence Split

| Category | In This FIB | Deferred |
|----------|-------------|----------|
| Cause being addressed | Required | Not allowed |
| Immediate proof | Required | Not allowed |
| Downstream alignment | Not allowed unless needed to prove the cause | Default |
| Full enforcement | Not allowed unless the FIB is classed as Enforcement | Default |
| Full inventory rollout | Not allowed unless the FIB is specifically the rollout slice | Default |

### 6.6 Adjacent Consequence Ledger

List at least three likely temptations and where they go instead:

| Temptation | Why It Is Adjacent | Disposition |
|------------|--------------------|-------------|
| <work item> | <dependency relation> | Defer to <phase/FIB> |

If the ledger is empty, the FIB has not been reviewed for scope pressure.

At least one ledger item must represent cross-class work that was explicitly considered for `MUST` scope and removed. If all ledger items are trivial, same-class, or unrelated future ideas, the FIB has not been stress-tested.

### 6.7 Atomicity Test

Answer both:

1. Can the FIB ship without the deferred downstream work?
2. Can the deferred downstream work begin after this FIB without rewriting this FIB?

If either answer is no, the FIB boundary is wrong.

The FIB must remain correct and internally consistent after shipping, not merely compilable. If shipping the FIB creates a temporarily inconsistent, misleading, or half-true contract, the boundary is wrong.

## 7. Red Flags

Any two red flags require split or amendment before the FIB is approved.

- The FIB says the work "must land atomically" across service, API, UI, tests, and observability.
- The FIB includes both a semantic change and the UI migration that consumes it.
- The FIB includes both representative pattern proof and full inventory expansion.
- The FIB includes both contract definition and full CI/lint enforcement.
- The FIB includes "all routes", "all components", "all surfaces", or "complete matrix" when the phase objective is pattern establishment.
- The FIB creates a dependency chain where one failure blocks unrelated layers from merging.
- The FIB's `MUST` list is longer than its ability to name the single boundary it changes.
- The FIB's `Explicit Exclusions` repeat work that still appears in outcomes, capabilities, or test requirements.
- The FIB claims one primary class but includes logic work from another class.
- The FIB claims representative scope but uses full-inventory language.

## 8. Required FIB-S Encoding

The structured FIB must preserve the same boundary in machine-readable form.

Required fields or equivalent:

```json
{
  "scope_guardrail": {
    "primary_change_class": "transport",
    "coverage_mode": {
      "mode": "representative",
      "surfaces": ["GET /api/v1/example"],
      "surface_granularity": "concrete-instances-only"
    },
    "layer_budget": {
      "primary_layer": "api",
      "secondary_layers": ["enforcement"],
      "secondary_layer_constraints": "shape assertions only; no service or UI logic changes",
      "dto_classification": "DTO shape changes are Service/Data unless strictly pass-through"
    },
    "one_line_boundary": "This FIB changes ...; it does not change ...",
    "atomicity_test": {
      "ships_without_deferred_work": true,
      "deferred_work_can_follow_without_rewrite": true,
      "ships_as_correct_internal_contract": true
    },
    "diff_size_sanity": {
      "expected_logic_files": 4,
      "directory_boundaries": ["app/api/v1/example"],
      "bounded_contexts": ["visit-service"],
      "hidden_multi_class_scope_review_required": false
    },
    "adjacent_consequence_ledger": [
      {
        "temptation": "Full contract matrix",
        "why_adjacent": "Useful after the wire contract exists",
        "disposition": "Deferred to enforcement FIB",
        "removed_from_must": true
      }
    ]
  }
}
```

If the existing FIB-S schema cannot add `scope_guardrail`, encode these values in `governance`, `intent.explicit_exclusions`, and `coherence.deferred_items`.

## 9. Accurate Scope Rule

A feature is scoped accurately when its `MUST` items, outcomes, capabilities, surfaces, tests, and observability all serve the same primary change class.

Consistency check:

```text
For each MUST/outcome/capability/test/logging item:
  Does this prove the primary boundary?
    YES -> keep
    NO -> move to Adjacent Consequence Ledger
  Does this require logic in another change class or layer?
    YES -> move to Adjacent Consequence Ledger unless the boundary would be incorrect without it
```

Do not keep an item because it is "eventually required." Eventual requirement is exactly why it belongs in the ledger.

## 10. Expansion Rule

Expansion during FIB generation is allowed only when it is required to prove the declared primary boundary.

Allowed:

- Adding one representative route family to prove a transport pattern.
- Adding one focused regression test that proves the changed boundary.
- Adding one compatibility annotation needed to keep current behavior truthful.

Not allowed:

- Expanding from representative route coverage to full route inventory.
- Adding UI migration to prove a service or API contract.
- Adding runtime observability to justify a transport or semantic slice.
- Adding lint rules before the stable contract exists.
- Adding future infrastructure because the current FIB reveals a later need.

## 11. Diff Size Sanity Check

Intent can be correct while implementation scale reveals hidden coupling.

Re-evaluate for hidden multi-class scope if implementation is expected to touch:

- More than 5-7 files with logic changes.
- More than one directory boundary.
- More than one bounded context.

If any threshold is exceeded, the FIB must either split or document why the extra scale is still pass-through work inside the declared primary class and layer.

## 12. Smell Test

If a FIB author writes any of the following phrases, stop and move the item to the Adjacent Consequence Ledger unless it passes the cross-class leakage rule:

- "while we're here"
- "to make it complete"
- "to avoid future rework"
- "to ensure consistency"
- "just to be safe"
- "so the whole system is aligned"

These phrases usually describe downstream alignment, not proof of the current boundary.

## 13. Review Checklist

Before approving a FIB, answer:

- [ ] One primary change class is declared.
- [ ] Cross-class `MUST` items are absent or explicitly justified as required because the primary boundary would otherwise be incorrect.
- [ ] Coverage mode is declared as `Representative` or `Full`.
- [ ] Representative mode names exact concrete surfaces, not categories, and prohibits expansion beyond them.
- [ ] Full mode is limited to Enforcement or a dedicated rollout/inventory slice.
- [ ] One primary layer is declared.
- [ ] DTO shape changes are classified as Service/Data unless strictly pass-through.
- [ ] Secondary layers are strictly pass-through and add no logic.
- [ ] More than one logic-bearing layer triggers a split.
- [ ] The one-line boundary names the changed boundary and the next deferred boundary.
- [ ] Every `MUST` item directly proves the primary boundary.
- [ ] Every outcome and capability traces to the primary change class.
- [ ] Tests are proportional to this FIB, not the future enforcement phase.
- [ ] Observability is included only if the primary class is Observability or the log is required to prove this boundary.
- [ ] Full inventory rollout is included only if the primary class is rollout/enforcement, not pattern proof.
- [ ] Adjacent consequences are listed with explicit destination phases/FIBs.
- [ ] At least one adjacent consequence was explicitly removed from `MUST` scope.
- [ ] The FIB can ship without deferred work.
- [ ] Deferred work can follow without rewriting this FIB.
- [ ] The shipped FIB remains internally consistent and truthful, not merely compilable.
- [ ] Diff-size thresholds were checked for hidden multi-class scope.

## 14. Decision Rule

When uncertain, split by dependency direction:

```text
Cause first.
Surface alignment second.
Enforcement third.
Observability when there is something stable to observe.
Infrastructure only after a current trigger exists.
```

## 15. One-Line Invariant

If the work item is a consequence of the boundary change, it belongs in the next FIB.
