---
id: ADR-058
title: Feature Classification and Transport Selection
status: Proposed
date: 2026-05-21
owner: Architecture Review
decision_scope: Future feature admission, classification, and implementation transport selection
triggered_by: Wave 2 transactional outbox closure (PRD-087 Phase 2.3) surfaced the absence of a front-door classification gate for future feature admission
adopts:
  - docs/70-governance/feature-intake/FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.md
related:
  - ADR-040
  - ADR-041
  - ADR-050
  - ADR-052
  - ADR-053
  - ADR-054
  - ADR-055
  - ADR-056
  - ADR-057
  - docs/issues/gaps/financial-data-distribution-standard/wave-2/PRODUCER-ANCHOR-RESOLUTION-STANDARD.yaml
  - docs/60-release/FEATURE_INTAKE_BRIEF_FORM.md
  - docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md
supersedes: []
---

# ADR-058: Feature Classification and Transport Selection

## 1. Context

The application now contains several legitimate implementation mechanisms:

- UI-local state and interaction handling
- route-level data fetching
- BFF / API composition
- service-layer orchestration
- Supabase RPC authoring boundaries
- transactional outbox propagation
- idempotent consumers
- projection stores
- DTO and surface rendering envelopes

These mechanisms solve different problems.

Prior feature work often selected mechanisms opportunistically instead of classifying the feature first. That ad-hoc pattern produced several recurring failure modes:

- browser-direct RPC calls bypassed service/BFF semantic mediation;
- UI surfaces were allowed to carry or omit producer anchors;
- authoring paths diverged from projection needs;
- transport guarantees were applied inconsistently;
- surfaces compensated for missing projection state through inference;
- outbox propagation was introduced reactively after dual-write and semantic-drift risks had already appeared.

Wave 2 corrected one major class of this failure through the transactional outbox. However, the outbox is not the universal answer to future feature work. It is the correct mechanism only when an authored fact or operational dependency must become a projection input.

The system therefore needs a front-door rule for all future features:

> classify the feature before selecting the transport.

This ADR records that decision and adopts the companion standard as the operating procedure.

---

## 2. Decision

All future feature implementation in PT-2 / d3lt MUST classify the feature before selecting implementation transport.

The canonical operating standard is:

```text
FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.md
```

That standard is adopted by this ADR as the governing procedure for:

- feature classification;
- transport selection;
- PRD admission checks;
- EXEC transport conformance;
- audit review;
- exceptions and amendment handling.

The standard may be revised as an operational artifact, but its governing principle may not be bypassed without a superseding ADR.

---

## 3. Accepted Feature Classes

The application recognizes the following feature classes for transport selection:

| Class | Description | Default transport |
|---|---|---|
| UI Interaction | Presentation, local interaction, filtering, navigation, layout | UI state / existing query |
| Read Composition | Existing data assembled into a coherent surface model | BFF/API route |
| Authoring Feature | Creates, corrects, or appends a domain fact | BFF/API → service → RPC |
| Projection Input | Authored fact/dependency consumed by projections, replay, freshness, or completeness | RPC + transactional outbox |
| Projection Consumer | Derived read model or replayable projection state | Outbox consumer → projection store |
| Surface Value | Financial or financial-adjacent value rendered at a boundary | DTO envelope + visible rendering |
| External Integration | Data exchanged with systems outside PT-2 | Separate FIB and likely ADR |

A feature may have secondary classifications, but it MUST name one primary classification.

---

## 4. Transport Selection Rule

Transport selection follows classification.

### 4.1 UI Interaction

UI-only changes use the weakest valid mechanism:

```text
component state / URL state / existing query
```

They must not introduce producer RPCs, outbox events, projection stores, or financial authority claims.

### 4.2 Read Composition

Features that assemble existing data for a surface use a BFF/API route.

The UI receives a surface-shaped DTO. The UI must not stitch semantically meaningful cross-domain state when the backend boundary should own composition.

### 4.3 Authoring

Features that create or correct domain facts use:

```text
UI intent
→ BFF/API
→ service boundary
→ RPC / transaction boundary
```

When semantic anchors, eligibility, casino scoping, or ledger identity must be resolved, that resolution belongs at the service/BFF boundary or inside the RPC, not in the browser.

### 4.4 Projection Input

If an authored fact or operational dependency affects projections, replay, completeness, freshness, dashboards, or derived state, the authoring RPC MUST emit a transactional outbox row in the same database transaction as the authoring write.

"Same transaction" is literal.

Retry choreography, background event creation, UI-side emission, or "logically atomic" patterns are not acceptable substitutes.

### 4.5 Projection Consumer

Consumers are projection-only.

They may write projection stores, receipt/idempotency state, dashboard caches, and derived operational state.

They must not write authoring stores, reclassify events, perform reconciliation, or produce authoritative totals.

### 4.6 Surface Value

Financial and financial-adjacent values rendered through UI, API, export, report, or operator-facing surfaces MUST carry visible source, authority, and completeness semantics.

Bare financial numbers are not valid system-boundary values.

### 4.7 External Integration

External integrations have no default transport.

They require separate intake and architecture review. If they affect authority, custody, public contracts, reconciliation, security, replay, or settlement semantics, an ADR is required.

---

## 5. Required PRD Gate

Every future PRD MUST include a feature classification and transport selection section.

At minimum, the PRD must state:

- primary classification;
- secondary classifications, if any;
- whether the feature authors a domain fact;
- whether the feature emits a Projection Input;
- whether transactional outbox propagation is required;
- whether the feature consumes outbox events;
- whether the feature renders financial or financial-adjacent Surface Values;
- selected transport;
- why the selected transport is the narrowest valid mechanism;
- whether a FIB amendment is required.

A PRD that omits feature classification is not ready for implementation.

---

## 6. Required EXEC Gate

Every EXEC spec MUST include transport conformance checks.

At minimum, the EXEC must verify:

- implementation matches PRD classification;
- no browser-direct producer RPC is used where BFF/service anchor resolution is required;
- no UI-side domain authority inference is introduced;
- no ad-hoc SQL write bypasses the service/RPC boundary;
- if outbox is required, authoring row and outbox row share one database transaction;
- if a consumer is introduced, idempotency is atomic with projection side effects;
- consumers do not write authoring stores;
- `origin_label` and `fact_class` are preserved;
- Surface Values render source, authority, and completeness;
- scope expansion is checked against the governing FIB.

---

## 7. Relationship to Existing Decisions

Subsections are ordered numerically by ADR number, then by non-ADR standard.

### 7.1 ADR-040 — Identity Provenance Rule

ADR-040 classifies identity attribution into Category A (RPC-provided) and Category B (RLS-context-derived).

This ADR refers to that classification in §4.3, which requires ledger identity, eligibility, and casino scoping to be resolved at the service/BFF boundary or inside the RPC. ADR-040 is the authority on which category a given identity attribution falls into; ADR-058 makes that resolution a transport-selection precondition rather than an implementation afterthought.

### 7.2 ADR-041 — Surface Governance Standard

ADR-041 defines the Surface Classification declaration (D1) and the Metric Provenance Matrix (D3) for every UI surface.

§4.6 of this ADR requires Surface Value features to render "visible source, authority, and completeness semantics." Those semantics are ADR-041's mandatory fields — rendering delivery, data aggregation, rejected patterns, and per-metric provenance. ADR-058 does not restate ADR-041's requirements; Surface Value features inherit them.

### 7.3 ADR-050 — Financial Surface Freshness Contract

ADR-050 defines the four mandatory declarations per financially meaningful fact: trigger, propagation, freshness SLA, and verification.

§4.6 governs *what* a Surface Value feature must declare. ADR-050 governs *when* its read-plane must refresh. Together they form the surface contract that Surface Value features designed under ADR-058 must satisfy.

### 7.4 ADR-052 — Financial Fact Model

ADR-052 defines the distinction between ledger and operational financial fact classes.

This ADR does not change that taxonomy.

It requires future features to decide whether they author a fact before selecting the transport path.

### 7.5 ADR-053 — Financial System Scope Boundary

ADR-053 prohibits the system from claiming financial truth, final totals, or reconciliation authority.

This ADR extends that protection by requiring Surface Value features and External Integration features to be classified before they can introduce new authority claims.

### 7.6 ADR-054 — Event Propagation and Surface Contract

ADR-054 defines transactional outbox propagation and mandatory surface rendering semantics.

This ADR defines when that propagation mechanism is required:

> outbox is required for Projection Input features, not for every feature.

### 7.7 ADR-055 — Cross-Class Authoring Parity

ADR-055 requires symmetry across fact-class authoring paths.

This ADR adds the upstream gate that prevents asymmetric transport selection from entering a PRD unnoticed.

### 7.8 ADR-056 — Relay Worker Execution Environment

ADR-056 fixes the runtime host, scheduling mechanism, auth model, and lifecycle metadata boundary for the transactional outbox relay worker.

§4.4 of this ADR mandates same-transaction outbox emission for Projection Input features. ADR-056 governs the relay that delivers those emissions. A Projection Input feature designed under ADR-058 §4.4 inherits ADR-056's operational posture — runtime, schedule, and auth — without redeciding them.

### 7.9 ADR-057 — Class A Table Anchoring and Outbox Idempotency Clarification

ADR-057 amends ADR-054 D1 by scoping Class A outbox emission to Wave-2-eligible `rating_slip_id`-resolved rows and clarifies the `processed_messages` key shape.

§4.4 of this ADR states the universal Projection Input → outbox rule. ADR-057 qualifies that rule for Class A: non-table-anchored Class A rows are out of scope for outbox emission. Future Class A-adjacent feature designs must apply ADR-057's scope qualifier when reading §4.4; the universal phrasing does not override the ADR-057 clarification.

### 7.10 Producer Anchor Resolution Standard

The Producer Anchor Resolution Standard defines the rule that UI surfaces may request linked financial corrections, but only a service or BFF boundary may resolve the authoring fact being corrected.

This ADR generalizes that pattern:

> UI requests intent.  
> Server boundaries resolve semantics.  
> RPCs author facts.  
> Outbox propagates projection inputs.

### 7.11 Feature Intake Brief Workflow

Feature Intake remains the scope authority for human intent.

This ADR does not replace FIB-H or FIB-S. It adds a required classification gate after feature intent is frozen and before PRD/EXEC design.

---

## 8. Rejected Alternatives

### 8.1 Continue selecting transport per feature

Rejected.

This preserves the failure mode that produced browser-direct RPC drift, missing anchor resolution, and reactive outbox remediation.

### 8.2 Make BFF/API mandatory for every operation

Rejected.

Some features are UI-only. Some reads already have valid APIs. Some internal service operations do not need new BFF routes.

The correct rule is not "everything goes through BFF."

The correct rule is "BFF is required where composition, semantic mediation, or anchor resolution belongs at the server boundary."

### 8.3 Make transactional outbox mandatory for every mutation

Rejected.

The outbox is not a generic event platform.

Mutations require outbox only when the authored fact or dependency must be consumed by projections, replay, completeness, freshness, dashboards, or derived state.

### 8.4 Let the UI call producer RPCs directly and rely on RPC validation

Rejected.

RPC validation is necessary but not sufficient.

Some semantic resolution belongs before the RPC call. The browser may request intent, but it must not be trusted to resolve ledger identity, eligibility, or producer anchors when those require domain rules.

### 8.5 Treat classification as optional documentation

Rejected.

Classification is now an admission gate. If it is optional, the same ad-hoc implementation drift returns under nicer filenames.

---

## 9. Consequences

### 9.1 Positive

- Future features have a consistent admission path.
- Transport mechanism selection becomes auditable.
- Browser-direct RPC drift is reduced.
- BFF/service mediation is required where semantic resolution matters.
- Transactional outbox is used where necessary, not everywhere.
- Projection consumers remain projection-only.
- Surface truthfulness becomes a feature gate.
- FIB, PRD, EXEC, and audit artifacts share a common vocabulary.
- New external integrations cannot quietly inherit internal event semantics.

### 9.2 Trade-offs

- Every feature now pays a small classification cost.
- Some "simple" UI changes will be revealed as authoring or projection features.
- PRDs become slightly more formal.
- EXEC specs must prove transport conformance, not merely implementation completeness.
- Some direct-call shortcuts are no longer acceptable.

These trade-offs are accepted.

The cost of classification is lower than the cost of discovering semantic drift after implementation.

---

## 10. Enforcement

This ADR is enforced through:

1. **FIB / scaffold admission**  
   Feature intent must be frozen before classification.

2. **PRD gate**  
   PRDs must include feature classification and transport selection.

3. **EXEC gate**  
   EXEC specs must include transport conformance checks.

4. **Audit gate**  
   Audits must fail artifacts that select a transport inconsistent with classification.

5. **Code review gate**  
   Implementation that bypasses the selected transport must be blocked or justified through an approved amendment.

6. **Supersession rule**  
   Bypassing the core principle of this ADR requires a superseding ADR.

---

## 11. Waiver Rule

A temporary waiver is allowed only when all of the following are true:

- the feature classification is still recorded;
- the selected transport deviation is explicit;
- the deviation is time-boxed;
- the risk is named;
- a follow-up remediation artifact is created;
- the waiver does not violate ADR-052, ADR-053, ADR-054, or ADR-055.

Waivers cannot authorize:

- non-atomic projection input emission;
- consumer writes to authoring stores;
- financial surfaces without source/authority/completeness;
- external public contracts based on internal event semantics;
- reconciliation or settlement authority claims.

---

## 12. Final Decision Statement

Future feature implementation in PT-2 / d3lt must follow this sequence:

```text
Feature intent
→ feature classification
→ transport selection
→ PRD
→ EXEC
→ implementation
→ transport conformance audit
```

A feature that cannot be classified is not ready.

A transport that does not follow classification is non-conformant.

A Projection Input without transactional outbox propagation is a dual-write risk.

A consumer that writes authoring state is a domain violation.

A financial Surface Value without source, authority, and completeness is a truthfulness violation.

The adopted standard is the operating procedure for applying this decision.
