# Modeling Problem First: Rating Telemetry Before Outbox

**Artifact type:** Architecture framing note  
**Date:** 2026-05-25  
**Status:** Draft for investigation / pre-ADR framing  
**Subject:** Rating slip average-bet lifecycle, visit-level aggregation, and outbox classification discipline

---

## 1. Purpose

This note frames the rating-slip average-bet problem as a **modeling problem first**, not a transport problem.

The immediate temptation is to react to a new classification gap by adding a new `telemetry_outbox`, expanding the existing `finance_outbox`, or refactoring the application into another event-driven layer.

That is the wrong default.

A new classification gap does **not** automatically justify a new outbox. It justifies a disciplined sequence:

```txt
classify the fact
→ decide the source of record
→ decide whether it is authored or derived
→ decide whether local computation is enough
→ only then decide whether propagation is required
```

The architectural question is not:

> Which outbox should this feature use?

The correct question is:

> What kind of fact is this, who owns it, and does another bounded context need to react asynchronously?

---

## 2. Current Problem Stack

The rating-slip investigation surfaced three distinct gaps.

```yaml
rating_average_bet_gap_stack:
  gap_1:
    name: Visit-Level Average Bet Aggregation Gap
    meaning: >
      Multiple rating slips can exist under one visit, each with its own
      operator-attested average_bet and duration, but the system does not
      currently derive or expose a duration-weighted visit-level average bet.
    nature: derived aggregate gap
    likely_outbox_need: no

  gap_2:
    name: Intra-Slip Average Bet Variance Tracking Gap
    meaning: >
      While a slip is open, operator changes to average_bet overwrite the prior
      value. The system does not intrinsically preserve when the previous value
      was valid or how long each operator-entered estimate applied.
    nature: lifecycle capture gap
    likely_outbox_need: not initially

  gap_3:
    name: Rating Slip Telemetry Classification Gap
    meaning: >
      Average-bet changes are related to player valuation and PFT-adjacent
      interpretation, but they are not PFT cash movement, not financial
      reconciliation, and not clearly classified in the current outbox taxonomy.
    nature: classification / bounded-context gap
    likely_outbox_need: undecided
```

The gap stack should not be collapsed into one “telemetry outbox” response.

---

## 3. Core Architectural Position

**Average-bet lifecycle changes are rating telemetry.**

They are not:

- PFT ledger facts,
- cash movement,
- financial reconciliation events,
- drop calculation,
- settlement authority,
- machine-observed wager truth.

They are:

```yaml
rating_telemetry:
  source: operator_attested
  scope:
    - casino
    - visit
    - rating_slip
    - table
    - player
  financial_authority: none
  relationship_to_pft: contextual
  relationship_to_theo: input_candidate
  relationship_to_comps: input_candidate
  relationship_to_outbox: not automatic
```

The system should preserve and aggregate rating information it actually receives.  
It should not pretend to observe every wager unless RFID, smart-table, camera, or equivalent machine instrumentation exists.

---

## 4. Industry Design References

### 4.1 Bounded Contexts

Martin Fowler describes a bounded context as a central DDD pattern for handling large models by dividing them into explicit conceptual boundaries and defining relationships between those boundaries.

This applies directly here:

- `PFT` belongs to financial transaction / ledger semantics.
- `RatingSlip` belongs to rating workflow semantics.
- `AverageBetInterval` belongs to rating telemetry.
- A visit-level rollup is a derived rating surface.

Trying to force all of those into the financial transaction model repeats the same modeling failure that produced earlier semantic drift.

**Reference:** Martin Fowler, “Bounded Context”  
https://www.martinfowler.com/bliki/BoundedContext.html

### 4.2 Domain Events vs. Integration Events

Microsoft’s DDD guidance distinguishes domain events from integration events. Domain events express side effects within a domain or across aggregates. Integration events propagate committed changes to other bounded contexts or external systems.

This distinction matters:

- A rating average-bet checkpoint may be a domain event inside the Rating context.
- It does not become an integration event unless another context must react asynchronously.
- It does not require outbox infrastructure merely because it is an “event” in plain English.

**Reference:** Microsoft, “Domain events: Design and implementation”  
https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation

### 4.3 Transactional Outbox

AWS Prescriptive Guidance frames transactional outbox as a solution to the dual-write problem: one operation must both persist data and send a message/event notification, and failure between those two operations would create inconsistency.

Therefore, the outbox is justified when there is a real asynchronous propagation requirement.

It is not a generic cure for:

- unclear modeling,
- missing rollups,
- local lifecycle history,
- DTO labeling,
- anxiety over future consumers.

**Reference:** AWS Prescriptive Guidance, “Transactional outbox pattern”  
https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html

### 4.4 Event-Driven Architecture Caution

Martin Fowler warns that event notification can reduce coupling, but if a logical flow is spread across events, the flow can become hard to see, debug, and modify because it is no longer explicit in program text.

This is precisely the danger of introducing `telemetry_outbox` too early. A straightforward lifecycle rule could become a distributed inference chain.

**Reference:** Martin Fowler, “What do you mean by ‘Event-Driven’?”  
https://martinfowler.com/articles/201701-event-driven.html

---

## 5. Outbox Decision Rule

Use an outbox only when the following are true:

```yaml
outbox_is_justified_when:
  - an authored state change occurs in a source-of-record table
  - another asynchronous consumer must react to that committed change
  - losing the event is materially different from recomputing later
  - ordering, idempotency, retry, or replay matter
  - the source write and event publication would otherwise become a dual-write risk
```

Do not use an outbox when the problem is:

```yaml
outbox_is_not_justified_for:
  - a local derived aggregate
  - a read-model query
  - a DTO label correction
  - a classification decision
  - a value computable from the source table on demand
  - a feature whose consumers are not known
  - a future-proofing instinct without an actual asynchronous dependency
```

---

## 6. Classification Gate

Before any implementation, apply this classification gate.

```yaml
classification_gate:
  fact_identity:
    question: What is the fact?
    candidate_answer: Operator-attested average-bet interval.

  domain_owner:
    question: Which bounded context owns it?
    candidate_answer: Rating / Rating Slip context.

  fact_nature:
    question: Is it authored, derived, observed, inferred, or machine-captured?
    candidate_answer: Authored by operator; derived values calculated from intervals.

  authority:
    question: What authority does it carry?
    candidate_answer: Operator-attested rating authority, not financial ledger authority.

  mutability:
    question: Is it mutable, append-only, or recomputable?
    candidate_answer: Intervals should be append-only or correction-by-new-interval; weighted averages are recomputable.

  propagation_need:
    question: Does another bounded context need to react asynchronously?
    candidate_answer: Not proven.

  recomputation:
    question: Can surfaces compute from source tables without durable event propagation?
    candidate_answer: Yes, initially.

  surface_label:
    question: What should the user see?
    candidate_answer: Current Segment Avg Bet, Final Slip Weighted Avg Bet, Visit Weighted Avg Bet.

  outbox_decision:
    question: Is an outbox justified now?
    candidate_answer: No, unless diagnostics identify asynchronous consumers or replay requirements.
```

---

## 7. Recommended Modeling Path

### 7.1 Model the Source of Record

Introduce an append-only rating-domain table only if intra-slip variance tracking is required.

```sql
rating_slip_average_bet_interval
  id
  casino_id
  visit_id
  rating_slip_id
  table_id
  player_id
  average_bet_cents
  effective_from
  effective_to
  actor_id
  source -- 'operator_attested'
  created_at
```

This table is not a ledger.  
It is not PFT.  
It is not an outbox.  
It is the rating-domain source of record for operator-entered average-bet timing.

### 7.2 Compute Locally First

Weighted averages should be derived from the local rating model.

```txt
slip_weighted_average_bet =
  SUM(interval.average_bet_cents × active_duration_seconds)
  /
  SUM(active_duration_seconds)
```

```txt
visit_weighted_average_bet =
  SUM(slip.final_average_bet_cents × slip.final_duration_seconds)
  /
  SUM(slip.final_duration_seconds)
```

For the first remediation slice, visit-level rollup may be computed directly from existing `rating_slip.average_bet` and `final_duration_seconds` without introducing interval capture.

### 7.3 Defer Outbox

Do not introduce `telemetry_outbox` merely because a new concept exists.

Defer propagation until at least one of these is true:

```yaml
rating_outbox_triggers:
  - rating telemetry has multiple asynchronous consumers
  - rating telemetry must rebuild independent projections through replay
  - external systems need committed rating events
  - operational intelligence depends on lag-tolerant async rating feeds
  - live source queries become too expensive
  - failure isolation between Rating and another bounded context is required
```

---

## 8. Proposed Architecture Decision

```yaml
decision:
  title: Rating telemetry is modeled before propagated
  status: proposed

  statements:
    - Average-bet lifecycle changes belong to the Rating context.
    - They are operator-attested rating telemetry, not PFT ledger facts.
    - Visit-level average bet is a derived aggregate, not a propagated financial event.
    - Intra-slip average-bet variance, if required, should be captured as append-only rating intervals.
    - Weighted averages should be recomputed from rating sources before introducing asynchronous propagation.
    - No `telemetry_outbox` is introduced until an asynchronous consumer, replay requirement, or cross-context propagation need is proven.

  rejected:
    - Add average-bet updates to PFT.
    - Expand `finance_outbox` to carry rating telemetry without a superseding classification decision.
    - Introduce `telemetry_outbox` as a default reaction to the classification gap.
    - Refactor the application into a generic event platform.
    - Treat outbox as a panacea for every new unclassified feature.
```

---

## 9. Immediate Next-Step Outline

```yaml
next_steps:
  1_frame_classification:
    artifact: ADR_or_RFC
    purpose: Define rating telemetry and prevent contamination of PFT / finance_outbox.

  2_fix_visit_rollup:
    artifact: PRD
    purpose: Add visit_weighted_average_bet using existing slip averages and durations.

  3_assess_interval_capture:
    artifact: investigation_or_PRD
    purpose: Determine whether open-slip average-bet changes need append-only interval tracking.

  4_defer_transport:
    artifact: decision_record
    purpose: Explicitly state no telemetry_outbox until async propagation criteria are met.
```

---

## 10. Blunt Summary

A classification gap is not a transport gap.

The outbox solves dual-write propagation.  
It does not solve unclear domain language.  
It does not fix missing aggregates.  
It does not rescue a system from every new feature category.

For this feature, the sane path is:

```txt
classification-first
→ source-of-record modeling
→ local derivation
→ propagation only if proven necessary
```

Anything else is how the system ends up with five outboxes, seven consumers, and a support burden that looks like it was designed by a committee trapped in a casino basement.
