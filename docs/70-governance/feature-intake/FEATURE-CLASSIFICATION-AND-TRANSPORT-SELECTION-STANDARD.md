# FEATURE CLASSIFICATION AND TRANSPORT SELECTION STANDARD

**Document type:** Governance standard  
**Status:** Proposed  
**Applies to:** PT-2 / d3lt application feature intake, PRD, EXEC, implementation, and audit workflows  
**Date:** 2026-05-21  
**Owner:** Architecture / Product Governance  
**Related authorities:**
- ADR-040 — Identity Provenance Rule
- ADR-041 — Surface Governance Standard
- ADR-050 — Financial Surface Freshness Contract
- ADR-052 — Financial Fact Model Dual-Layer
- ADR-053 — Financial System Scope Boundary
- ADR-054 — Financial Event Propagation and Surface Contract
- ADR-055 — Cross-Class Authoring Parity
- ADR-056 — Relay Worker Execution Environment
- ADR-057 — Class A Table Anchoring and Outbox Idempotency Clarification
- ADR-058 — Feature Classification and Transport Selection (this standard's adopting ADR)
- Feature Intake Brief workflow
- Producer Anchor Resolution Standard
- Wave 2 Transactional Outbox Rollout Map

---

## 1. Purpose

This standard defines how new features are admitted into the application and how their implementation transport is selected.

The system currently contains multiple legitimate mechanisms:

- UI state
- route-level data fetching
- BFF / API composition
- service-layer orchestration
- Supabase RPC authoring boundaries
- transactional outbox propagation
- idempotent consumers
- projection stores
- DTO / surface rendering envelopes

These mechanisms are not interchangeable.

Prior failures came from features choosing their own path through the system without first being classified. The transactional outbox is one remediation for that failure mode, but it is not the default answer for every feature.

This standard provides the missing front-door rule:

> Classify the feature first.  
> Select the narrowest valid transport second.  
> Do not let the implementation path redefine the feature.

---

## 2. Core Principle

A new feature must not begin with:

> What component, API route, RPC, or table do we need?

It must begin with:

> What kind of system change is this?

The feature classification determines the transport.

Transport selection is not a developer preference. It is a governance decision derived from:

- the operator problem,
- the feature containment loop,
- whether a fact is authored,
- whether downstream projections must change,
- whether replay or idempotency is required,
- whether a user-visible surface renders a financial or financial-adjacent value.

---

## 3. Feature Classification Taxonomy

Every new feature must be classified into one primary category before PRD approval.

Secondary categories are allowed only when explicitly named.

---

## 3.1 UI Interaction Feature

### Definition

A UI Interaction Feature changes only presentation, layout, filtering, navigation, local state, or interaction behavior.

### Examples

- Expanding or collapsing dashboard cards.
- Reordering table columns.
- Adding client-side filters over already-loaded data.
- Improving modal layout.
- Adjusting visual hierarchy or button placement.

### Default transport

- Component state
- URL / route params
- Existing query hooks
- Existing BFF/API read endpoints

### Forbidden

- New domain tables.
- New producer RPCs.
- Browser-to-RPC mutation paths.
- Outbox events.
- Projection stores.
- New financial authority claims.

### Admission test

If the feature can be removed without changing stored domain state, replay behavior, or downstream projections, it is probably a UI Interaction Feature.

---

## 3.2 Read Composition Feature

### Definition

A Read Composition Feature assembles existing data from one or more domains into a coherent surface model.

It does not create, correct, or propagate domain facts.

### Examples

- Loading rating slip modal data from player, visit, slip, and financial sources.
- Returning admin review state for pilot evaluators.
- Showing whether an evaluator is runtime-bound.
- Exposing adjustment eligibility and latest eligible transaction metadata.

### Default transport

```text
UI
→ BFF/API route
→ service/read layer
→ existing stores/RPC reads
→ DTO
```

### Required properties

- The BFF/API boundary owns composition.
- The UI receives a surface-shaped DTO.
- Domain anchor resolution may happen here if it is read-only.
- The UI must not stitch multiple bounded contexts directly when the composition has semantic meaning.

### Forbidden

- Authoring new facts.
- Mutating authoritative stores.
- Emitting outbox rows.
- Treating a composed read model as a source of record.

### Admission test

If the UI needs one coherent answer that depends on multiple backend concepts, this is a Read Composition Feature and belongs behind a BFF/API boundary.

---

## 3.3 Authoring Feature

### Definition

An Authoring Feature creates, corrects, or appends a domain fact.

The fact may be authoritative, operational, compliance-related, administrative, or configuration-related.

### Examples

- Recording a buy-in.
- Recording a grind observation.
- Creating a financial adjustment.
- Approving a pilot evaluator.
- Binding a user to runtime membership.
- Closing a gaming day.
- Updating casino settings.

### Default transport

```text
UI
→ BFF/API route
→ service boundary
→ RPC / transaction boundary
→ authoring table
```

### Required properties

- The browser may request intent.
- The service/BFF boundary resolves or validates anchors.
- The RPC owns the write transaction.
- Eligibility and casino scoping are enforced before or inside the authoring boundary.
- The UI must not be trusted to carry resolved ledger identity unless the selection is explicitly user-chosen and server-validated.

### Forbidden

- UI directly calling producer RPCs when anchor resolution or eligibility matters.
- API routes performing ad-hoc cross-domain SQL writes.
- Mutating multiple authoritative stores without a declared transaction discipline.
- Treating a write as "logically atomic" when it is not physically atomic.

### Admission test

If the feature changes what the system knows to be true, this is an Authoring Feature.

---

## 3.4 Projection Input Feature

### Definition

A Projection Input Feature authors a fact or operational dependency that downstream projections, replay, completeness, freshness, dashboards, or derived state must consume.

Projection Inputs are not semantically uniform. They may include:

- Authority Facts
- Telemetry Facts
- Dependency Events

### Examples

- `buyin.recorded`
- `cashout.recorded`
- `adjustment.recorded`
- `grind.observed`
- `fill.recorded`
- `credit.recorded`

### Default transport

```text
UI
→ BFF/API route
→ service boundary
→ RPC
→ authoring row + finance_outbox row in same transaction
→ relay
→ idempotent consumer
→ projection
```

### Required properties

- Authoring row and outbox row commit or roll back together.
- Outbox emission occurs in the same database transaction as the authoring write.
- Event category is explicit.
- `fact_class` and `origin_label` are never inferred downstream.
- Idempotency key is generated at the authoring boundary.
- Consumers must tolerate at-least-once delivery.
- The event must be registered before producer rollout.

### Forbidden

- Writing authoring row now and outbox row later.
- Emitting events from the UI.
- Emitting events from projections.
- Background-job "eventual outbox."
- Consumer-side authority upgrades.
- Treating outbox as event sourcing.
- Treating outbox as a generic platform bus.

### Admission test

If the feature creates a fact that another surface, projection, replay path, or completeness signal depends on, it is a Projection Input Feature and requires transactional outbox propagation.

---

## 3.5 Projection Consumer Feature

### Definition

A Projection Consumer Feature derives read models, summaries, dashboard state, completeness state, freshness state, or replayable projection state from outbox events.

### Examples

- Visit-level Class A financial completeness projection.
- Shift operational telemetry projection.
- Dashboard cache derived from `grind.observed`, `fill.recorded`, and `credit.recorded`.
- Replayable operational summary.

### Default transport

```text
finance_outbox
→ relay / claim RPC
→ idempotent consumer
→ processed_messages
→ projection store
→ BFF/API
→ UI
```

### Required properties

- `processed_messages` is written before or atomically with projection side effects.
- Duplicate delivery produces one projection side effect.
- Replay produces equivalent derived state.
- Consumers preserve `origin_label` unchanged.
- Consumers read `fact_class` and `origin_label`; they do not infer authority from payload.
- Consumers write only projection stores and receipt state.

### Forbidden

- Writing back to PFT.
- Writing back to grind authoring stores.
- Writing to compliance authoring stores as financial settlement.
- Reclassifying events.
- Performing reconciliation.
- Producing authoritative totals.
- Repairing missing producer data by inventing projection inputs.

### Admission test

If the feature is derived, rebuildable, and downstream of the outbox, it is a Projection Consumer Feature.

---

## 3.6 Surface Value Feature

### Definition

A Surface Value Feature exposes a financial or financial-adjacent value to a user, API response, report, export, or operator-facing read model.

### Examples

- Session total buy-in.
- Net position.
- Estimated shift activity.
- Cash accountability display.
- MTL threshold amount.
- Visit financial summary.
- Shift telemetry metric.

### Default transport

```text
projection/read source
→ service mapper
→ DTO envelope
→ BFF/API
→ visible UI/API/rendered output
```

### Required properties

Every financial value must declare:

- source,
- authority,
- completeness.

Authority must come from the originating classification and must not be upgraded.

Completeness must be visible when the system has partial or unknown coverage.

### Forbidden

- Bare financial numbers.
- Hidden authority labels.
- User-visible totals that imply settlement or reconciliation authority.
- UI recomputation against authoring stores to hide projection lag.
- Compliance values merged into financial authority aggregates.
- Mixed-authority values displayed without degradation.

### Admission test

If a user can read the value and infer operational or financial meaning from it, it is a Surface Value Feature.

---

## 3.7 External Integration Feature

### Definition

An External Integration Feature sends data to or receives data from systems outside PT-2.

### Examples

- External reconciliation system.
- Third-party accounting integration.
- Public event API.
- Webhooks.
- Email or Slack notifications.
- Hardware integration beyond existing table-context APIs.
- Casino vendor import/export workflow.

### Default transport

No default transport exists.

External integrations require explicit intake and architecture review.

### Required properties

- Separate FIB.
- ADR if authority, custody, settlement, public contract, replay, delivery, or security boundaries are affected.
- Explicit failure model.
- Explicit data ownership model.
- Explicit tenant/casino scoping.
- Explicit retention and observability posture.

### Forbidden

- Smuggling external integrations into internal outbox work.
- Treating `finance_outbox` as a public event contract.
- Letting third-party needs change internal event semantics without ADR.
- Using internal projection events as public API guarantees.

### Admission test

If a system outside PT-2 consumes or produces the data, this is an External Integration Feature.

---

## 4. Transport Selection Matrix

| Feature classification | Default mechanism | Outbox? | BFF/API? | RPC? | Projection store? |
|---|---|---:|---:|---:|---:|
| UI Interaction | Local state / existing query | No | Maybe existing | No | No |
| Read Composition | BFF/API DTO | No | Yes | Read-only if needed | No |
| Authoring Feature | BFF/API → service → RPC | Maybe | Yes | Yes | No |
| Projection Input | RPC + transactional outbox | Yes | Yes | Yes | No at producer |
| Projection Consumer | Outbox consumer → projection | Consumes | Maybe for read | Claim/receipt RPCs | Yes |
| Surface Value | DTO envelope + visible rendering | No direct | Yes | No direct | Reads projection/source |
| External Integration | Separate design | Maybe, after ADR | Yes | Maybe | Maybe |

---

## 5. Transport Decision Tree

Every PRD must answer this decision tree before implementation.

```text
1. Is there a frozen feature intent and containment loop?
   No → stop; write or amend FIB.
   Yes → continue.

2. Does the feature only change local UI behavior or presentation?
   Yes → UI Interaction Feature.
   No → continue.

3. Does the feature compose existing backend data without mutation?
   Yes → Read Composition Feature; use BFF/API.
   No → continue.

4. Does the feature create, correct, or append a domain fact?
   Yes → Authoring Feature; use BFF/API → service → RPC.
   No → continue.

5. Does the authored fact affect projections, replay, dashboards, completeness, freshness, or downstream derived state?
   Yes → Projection Input Feature; emit transactional outbox row in same transaction.
   No → RPC authoring only.

6. Does the feature derive rebuildable state from existing events?
   Yes → Projection Consumer Feature; use outbox consumer + projection store.
   No → continue.

7. Does the feature expose financial or financial-adjacent values at a system boundary?
   Yes → Surface Value Feature; source + authority + completeness required.
   No → continue.

8. Does the feature communicate with external systems?
   Yes → External Integration Feature; separate FIB and likely ADR required.
   No → classify as support/tooling/admin and document why no domain transport applies.
```

---

## 6. Mandatory Admission Checks

A new feature may not enter PRD unless the intake or scaffold includes:

1. Primary feature classification.
2. Secondary classifications, if any.
3. Selected transport mechanism.
4. Explicit statement of whether the feature authors a fact.
5. Explicit statement of whether the feature emits a Projection Input.
6. Explicit statement of whether outbox propagation is required.
7. Explicit statement of whether the feature consumes projections.
8. Explicit statement of whether financial Surface Values are rendered.
9. Explicit statement of whether a new surface, actor, integration, or workflow is introduced.
10. If yes to item 9, FIB amendment reference.

---

## 7. Hard Rules

## 7.1 No Transport Before Classification

No PRD may prescribe BFF, RPC, outbox, projection, or UI transport before the feature classification is recorded.

Implementation details may not substitute for feature identity.

---

## 7.2 UI Requests Intent; Server Resolves Semantics

UI surfaces may request domain actions.

They must not independently resolve ledger identity, semantic authority, casino scope, or adjustment eligibility when those require domain rules.

Correct:

```text
UI requests: "adjust this slip by this amount for this reason"
BFF/service resolves: eligible original PFT
RPC authors: adjustment
```

Incorrect:

```text
UI guesses original_txn_id
Browser calls producer RPC directly
RPC silently emits nothing when anchor is null
```

---

## 7.3 Outbox Is Required for Projection Inputs

If an authored fact or dependency must be consumed by projections, replay, completeness, freshness, dashboard state, or derived state, it must emit through the transactional outbox.

Same transaction means literal database transaction, not retry choreography.

---

## 7.4 Outbox Is Not a Generic Event Platform

The outbox is internal propagation infrastructure.

It must not become:

- a public event API,
- a general pub/sub framework,
- an event sourcing ledger,
- a reconciliation system,
- a multi-consumer platform,
- a dumping ground for all interesting things that happened.

---

## 7.5 Consumers Are Projection-Only

Consumers may write:

- projection stores,
- dashboard caches,
- receipt / idempotency tables,
- derived operational state.

Consumers must not write:

- PFT,
- grind authoring stores,
- MTL authoring stores as settlement,
- authoritative domain facts,
- final reconciliation totals.

---

## 7.6 Surface Values Must Tell the Truth

Any financial or financial-adjacent value exposed outside the service layer must carry visible source, authority, and completeness.

Bare numbers are not valid financial Surface Values.

Unknown completeness must be rendered as unknown, not hidden.

Partial state must be rendered as partial, not patched by UI recomputation.

---

## 7.7 Scope Expansion Requires Intake Amendment

If a downstream artifact introduces any of the following, it must amend the FIB before implementation:

- new actor,
- new operator workflow,
- new user-visible surface,
- new automation path,
- new external integration,
- new authority claim,
- new projection consumer,
- new event category,
- new outbox producer,
- new reconciliation or settlement implication.

"Small addition" is not a category of governance. It is usually how the raccoon gets into the pantry.

---

## 8. Classification Examples

## 8.1 Mount Grind Buy-in Panel

**Classification:** Authoring Feature + Projection Input Feature + Surface Value Feature  
**Transport:** UI → BFF/API or service hook → RPC → outbox → operational projection  
**Reason:** Operator authors `grind.observed`; shift telemetry projection depends on it.

## 8.2 Add Admin Outbox Observability Page

**Classification:** Read Composition Feature + Surface/Tooling Feature  
**Transport:** Admin UI → API → read-only SECURITY DEFINER RPC  
**Outbox:** Reads outbox only; does not emit.  
**Reason:** Surface inspects transport state; it does not author facts or projections.

## 8.3 Adjustment Creation From Rating Slip Modal

**Classification:** Authoring Feature + Projection Input Feature  
**Transport:** UI intent → BFF/service anchor resolution → `rpc_create_financial_adjustment` → outbox  
**Reason:** Adjustment must resolve original PFT at slip scope; browser must not bypass anchor resolution.

## 8.4 Change Dashboard Card Layout

**Classification:** UI Interaction Feature  
**Transport:** UI only  
**Reason:** No new fact, no projection, no surface authority change.

## 8.5 Visit Financial Completeness Signal

**Classification:** Projection Consumer Feature + Surface Value Feature  
**Transport:** outbox consumer → projection store → DTO envelope → UI  
**Reason:** Completeness is derived from event flow and lifecycle state.

## 8.6 External Reconciliation Export

**Classification:** External Integration Feature + Surface Value Feature  
**Transport:** No default; requires FIB and ADR  
**Reason:** This touches custody, settlement interpretation, and external authority boundaries.

---

## 9. PRD Required Section

Every PRD for a new feature must include the following section.

```md
## Feature Classification and Transport Selection

**Primary classification:**  
[UI Interaction | Read Composition | Authoring | Projection Input | Projection Consumer | Surface Value | External Integration]

**Secondary classifications:**  
[List or None]

**Does this feature author a domain fact?**  
[Yes/No. If yes, name the fact.]

**Does this feature emit a Projection Input?**  
[Yes/No. If yes, name event_type/category.]

**Does this feature require transactional outbox propagation?**  
[Yes/No. Explain why.]

**Does this feature consume outbox events?**  
[Yes/No. If yes, name consumer and projection store.]

**Does this feature render financial or financial-adjacent Surface Values?**  
[Yes/No. If yes, name source/authority/completeness behavior.]

**Selected transport:**  
[UI-only | BFF/API read | BFF/API → service → RPC | RPC + transactional outbox | outbox consumer → projection | external integration TBD]

**Why this is the narrowest valid transport:**  
[One paragraph.]

**Rejected stronger/weaker mechanisms:**  
- [Rejected mechanism] — [Reason]
- [Rejected mechanism] — [Reason]

**FIB amendment required?**  
[Yes/No. If yes, link amendment.]
```

---

## 10. EXEC Required Section

Every EXEC spec must include a transport conformance block.

```md
## Transport Conformance

- [ ] Implementation matches PRD classification.
- [ ] No browser-direct producer RPC when BFF/service anchor resolution is required.
- [ ] No UI-side domain authority inference.
- [ ] No ad-hoc SQL write bypassing the service/RPC boundary.
- [ ] If outbox is required, authoring row and outbox row share one DB transaction.
- [ ] If consumer is introduced, `processed_messages` idempotency is atomic with projection side effect.
- [ ] Consumer does not write authoring stores.
- [ ] `origin_label` and `fact_class` are preserved.
- [ ] Surface Values render source, authority, and completeness.
- [ ] Scope expansion checked against FIB.
```

---

## 11. Audit Checklist

Audits must fail the artifact if any of the following are true:

- Feature classification is missing.
- Selected transport is stronger than needed without justification.
- Selected transport is weaker than required by authoring/projection behavior.
- UI resolves domain anchors that belong at the service/BFF boundary.
- Browser calls producer RPC directly where semantic eligibility must be enforced.
- Authoring write and outbox insert are not physically atomic.
- Consumer mutates authoring stores.
- Projection claims authority not present in source events.
- Surface renders bare financial values.
- PRD introduces a new actor/workflow/surface/integration without FIB amendment.
- Outbox is used as a generic event bus.
- External integration relies on internal event semantics without ADR.

---

## 12. Minimalism Rule

Select the weakest mechanism that preserves the invariant.

| Temptation | Correct response |
|---|---|
| "Let's add an event for this UI interaction" | No. UI state is enough. |
| "Let's let the browser call the RPC directly" | Only if no anchor, eligibility, or semantic resolution is required. |
| "Let's add outbox because this might matter later" | No. Outbox is for real Projection Inputs, not future vibes. |
| "Let's make a projection for one card" | Only if derived state must be replayable, shared, or lifecycle-aware. |
| "Let's expose this internal event to partners" | Separate FIB and ADR. |
| "Let's compute the total from raw stores in the UI" | No. Render projection state and completeness honestly. |

Architecture does not become stronger by adding mechanisms.

It becomes stronger when each mechanism has one job and stays in its lane.

---

## 13. Final Standard

For every future feature:

```text
Feature intent first.
Classification second.
Transport third.
Implementation fourth.
Certification last.
```

A feature that cannot be classified is not ready.

A transport that does not follow classification is non-conformant.

A projection input without outbox is a dual-write risk.

A consumer that writes authoring state is a domain violation.

A financial surface without source, authority, and completeness is a truthfulness violation.

This is the rule that keeps future features from rebuilding the same ad-hoc mess under new filenames.
