---
title: Pre-Wave-2 Ubiquitous Language Proposition
date: 2026-05-06
status: PROPOSED
scope: PT-2 internal financial canonization, Wave 2 prep
purpose: Establish shared terminology before dual-layer/outbox implementation to prevent semantic drift between authority facts, telemetry facts, dependency events, projections, and surface values.
---

# Pre-Wave-2 Ubiquitous Language Proposition

## 1. Why This Exists

Wave 2 is about internal financial-system canonization, not external consumer contracts, reconciliation architecture, or enterprise event-platform design.

Recent design-review discussion surfaced a terminology problem: words like **financial event**, **telemetry**, **grind**, **TBT**, **inventory movement**, **projection input**, and **authority** are beginning to collapse into one another.

That collapse is dangerous because some operational events affect financial telemetry without being financial-authority facts themselves.

Example:

> A fill affects shift financial telemetry, but a fill is not player financial activity and should not be casually absorbed into the same authority class as PFT.

This document proposes a bounded ubiquitous language for Wave 2 so implementation work can proceed without silently widening scope.

---

## 2. Core Principle

> The outbox propagates projection inputs.
> Projection inputs are not all semantically equivalent.

A propagated event may be:

- an authority-bearing financial fact,
- a non-authoritative telemetry fact,
- or an operational dependency event needed by projections.

Propagation discipline may be shared.
Semantic authority must remain distinct.

---

## 3. Terms to Retire or Avoid

### 3.1 Avoid: “financial event” as an umbrella term

The phrase **financial event** is now too overloaded. It can ambiguously refer to:

- PFT buy-ins/cash-outs,
- grind / TBT observations,
- fills and credits,
- outbox rows,
- projection inputs,
- rendered surface values,
- or accounting/reconciliation events.

Use more specific terms below.

### 3.2 Avoid: “operational” without qualifier

The word **operational** can mean:

- operational telemetry,
- operational dependency,
- operational inventory movement,
- operational UI surface,
- or non-accounting scope.

Always qualify it.

---

## 4. Proposed Ubiquitous Language

## 4.1 Authority Fact

### Definition

An **Authority Fact** is an authored financial claim that carries direct financial authority inside PT-2’s pilot scope.

### Examples

- Player buy-in recorded in `player_financial_transaction`.
- Player cash-out recorded in `player_financial_transaction`.
- Player financial adjustment.

### Characteristics

- Player-attributed.
- Auditable inside PT-2’s operational scope.
- Append-only or correction-by-new-row.
- Emits authority label `actual`.
- Maps to ADR-052 Class A.

### Non-examples

- Grind / unattributed table activity.
- Fills and credits.
- Inventory slips.
- MTL compliance rows.
- Projection aggregates.

---

## 4.2 Telemetry Fact

### Definition

A **Telemetry Fact** is a non-authoritative operational financial observation or estimate that is useful for floor visibility, dashboards, or shift intelligence, but is not ledger truth.

### Examples

- Grind / unattributed buy-in telemetry.
- TBT-derived operational estimates, where TBT is acting as the operational observation source.
- Table-level estimated activity without player attribution.

### Characteristics

- Table-anchored.
- Player attribution absent by construction.
- Non-authoritative.
- Emits authority label `estimated` in pilot.
- Maps to ADR-052 Class B.

### Non-examples

- PFT ledger facts.
- Fills and credits.
- Cage reconciliation records.
- Final accounting totals.

### TBT / Grind clarification

Do not casually use **TBT** and **grind** as exact synonyms.

For pilot scope:

- **TBT** may describe the current operational data source or table-buy-in telemetry surface.
- **Grind** describes the Class B operational telemetry concept.
- **Telemetry Fact** is the canonized semantic category.

If future implementation separates raw TBT observations from derived grind estimates, this language should already support that distinction.

---

## 4.3 Dependency Event

### Definition

A **Dependency Event** is an operational state transition that affects projections or telemetry interpretation, but is not itself a financial authority fact or telemetry fact.

### Examples

- Table fill.
- Table credit.
- Opening inventory snapshot.
- Closing inventory snapshot.
- Inventory correction.
- Table state transition that changes how telemetry should be computed.

### Characteristics

- Projection-affecting.
- Replay-relevant.
- Freshness-relevant.
- May be propagated through the same internal outbox infrastructure.
- Does not automatically carry `actual` or `estimated` financial authority.
- Does not become PFT.
- Does not imply reconciliation.

### Why this category matters

Fills and credits directly affect shift financial telemetry, but they are inventory movements. They should participate in projection computation without being flattened into PFT or grind authority classes.

Correct phrasing:

> Fills and credits are Dependency Events used by shift telemetry projections.

Incorrect phrasing:

> Fills and credits are financial telemetry facts.

---

## 4.4 Projection Input

### Definition

A **Projection Input** is any event/fact consumed by a projection to compute a read model or rendered surface.

### Includes

- Authority Facts.
- Telemetry Facts.
- Dependency Events.

### Characteristics

- Internal propagation unit.
- Replayable.
- Idempotency-protected.
- Ordered according to the projection’s required scope.
- Not semantically uniform.

### Rule

Projection Inputs may share propagation mechanics without sharing authority semantics.

---

## 4.5 Projection Artifact

### Definition

A **Projection Artifact** is a derived read model, aggregate, dashboard cache, or computed state produced from Projection Inputs.

### Examples

- Shift telemetry summary.
- Table performance read model.
- Rated/unrated split display model.
- Dashboard cache.
- Gaming-day operational summary.

### Characteristics

- Derived.
- Rebuildable.
- Deterministic given the same ordered input set.
- Must preserve authority and completeness semantics when rendered.
- Must not author PFT, grind, or inventory records.

### Rule

A projection may compose multiple input categories, but the resulting Surface Value must declare source, authority, and completeness honestly.

---

## 4.6 Surface Value

### Definition

A **Surface Value** is a financial or financial-adjacent value exposed at a system boundary: UI, API response, export, report, or operator-facing read model.

### Examples

- Net position displayed in a modal.
- Estimated drop displayed on a table dashboard.
- Shift telemetry metric.
- MTL summary amount.

### Characteristics

- User-visible or API-visible.
- Carries the FinancialValue envelope where applicable.
- Must declare type/source/completeness.
- Must not hide uncertainty.
- Must not claim authoritative total when the system lacks full custody inputs.

---

## 5. Category Boundary Table

| Category | Primary Role | Examples | Authority-bearing? | Propagated? | Rendered directly? |
|---|---|---|---:|---:|---:|
| Authority Fact | Authored financial claim | PFT buy-in, cash-out, adjustment | Yes | Yes | Sometimes, through surfaces |
| Telemetry Fact | Operational estimate/observation | Grind, unattributed table buy-in telemetry | Yes, but non-authoritative / estimated | Yes | Sometimes, through surfaces |
| Dependency Event | Projection dependency | Fill, credit, inventory snapshot | Not by default | Maybe / likely for affected projections | Usually no |
| Projection Input | Umbrella for projection-consumed events | Authority Fact + Telemetry Fact + Dependency Event | Varies | Yes | No |
| Projection Artifact | Derived read model | Shift telemetry, dashboard cache | Derived only | Rebuildable output | Yes, through Surface Values |
| Surface Value | Boundary value | FinancialValue DTO field, UI metric | Must declare if applicable | N/A | Yes |

---

## 6. Outbox Implications

## 6.1 Outbox scope

The Wave 2 outbox should be described as internal propagation infrastructure for Projection Inputs, not as a generic external event bus.

Better wording:

> The internal outbox propagates Projection Inputs required to keep PT-2 operational financial surfaces current and semantically honest.

Avoid:

> The outbox propagates all financial events.

The second phrase invites scope creep.

## 6.2 Event schema implication

A future outbox row may need to distinguish event category explicitly, for example:

```ts
category: 'authority_fact' | 'telemetry_fact' | 'dependency_event'
```

This is a proposal, not yet a schema decision.

If adopted, this category is separate from `fact_class` and `origin_label`:

- `fact_class` distinguishes ledger vs operational financial fact classes.
- `origin_label` preserves authority semantics.
- `category` distinguishes whether the row is an authority fact, telemetry fact, or dependency event.

Do not overload `fact_class` to represent dependency events unless ADR-052/054 are explicitly superseded.

## 6.3 Fills / credits implication

Fills and credits should not be ignored if shift telemetry depends on them.

They should be modeled as Dependency Events that participate in projection freshness and replay, while remaining outside PFT/Telemetry Fact authority classes unless a later ADR explicitly changes that boundary.

---

## 7. Canonization Boundary

The current Wave 2 effort canonizes internal operational financial telemetry semantics.

In scope:

- PFT authority facts.
- Grind / TBT telemetry facts.
- Internal propagation discipline.
- Projection freshness and replay for affected operational surfaces.
- Dependency events required to compute those surfaces correctly.
- Surface truthfulness.

Out of scope:

- External reconciliation contracts.
- Full casino accounting.
- Settlement truth.
- Cage/vault/custody reconstruction.
- Public event contracts.
- General enterprise event platform.

---

## 8. Recommended Review Decisions

### DEC-UL-1 — Retire ambiguous “financial event” umbrella

Use precise terms: Authority Fact, Telemetry Fact, Dependency Event, Projection Input, Projection Artifact, Surface Value.

### DEC-UL-2 — Classify fills and credits as Dependency Events

Fills and credits affect shift financial telemetry, but they are inventory movements. They participate in projection computation without becoming PFT or grind authority facts.

### DEC-UL-3 — Define outbox as internal Projection Input propagation

The outbox propagates the inputs needed for internal operational projections. It is not an external financial event contract.

### DEC-UL-4 — Preserve authority semantics separately from propagation mechanics

A shared outbox does not imply shared authority. Propagation unifies delivery discipline; it does not collapse domain semantics.

---

## 9. Suggested Patch Delta for Context Brief / Wave 2 Prep

```md
## Ubiquitous Language Boundary — Wave 2

Wave 2 must stop using "financial event" as a broad umbrella term.
The term is overloaded and invites scope drift.

Use the following categories:

- **Authority Fact** — authored, authority-bearing financial claim; current Class A / PFT examples include buy-ins, cash-outs, and adjustments.
- **Telemetry Fact** — non-authoritative operational financial observation or estimate; current Class B / grind examples include unattributed table buy-in telemetry.
- **Dependency Event** — operational state transition required by projections but not itself a financial authority fact; examples include fills, credits, opening inventory, closing inventory, and inventory corrections.
- **Projection Input** — umbrella for events consumed by projections: Authority Facts + Telemetry Facts + Dependency Events.
- **Projection Artifact** — derived read model or dashboard cache built from Projection Inputs.
- **Surface Value** — user/API-visible value that must preserve source, authority, and completeness semantics where applicable.

Fills and credits are classified as Dependency Events for Wave 2 pilot scope.
They affect shift financial telemetry and may need propagation/replay/freshness guarantees,
but they are not PFT authority facts and should not be flattened into grind telemetry facts.

The outbox should therefore be described as internal Projection Input propagation infrastructure,
not as a generic external financial event bus.
```

---

## 10. Closing Statement

Wave 2 can share propagation mechanics without collapsing semantics.

> Shared delivery does not mean shared authority.
> Shared replay does not mean shared ontology.
> Projection dependency does not mean financial truth.

This language should be adopted before producer wiring begins.
