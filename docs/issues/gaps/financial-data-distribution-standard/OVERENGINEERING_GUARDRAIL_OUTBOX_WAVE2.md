# OVERENGINEERING GUARDRAIL — Transactional Outbox / Wave 2

**date:** 2026-05-10  
**status:** ACTIVE — PILOT PROTECTION  
**applies_to:**
- Wave 2 Transactional Outbox
- FIB-H-W2-OUTBOX-001
- GAP-F1 Closure
- Outbox producer / relay / idempotent-consumer infrastructure
- Any downstream Wave 2 transport slice before projection work begins

---

## 1. Purpose

Prevent the transactional outbox slice from expanding into an event platform, projection redesign, observability system, or reconciliation mechanism.

Wave 1 made financial surfaces truthful.

Wave 2 must now make financial event delivery reliable.

This guardrail exists to stop:

> turning a bounded transport guarantee into a full event-driven architecture refoundation.

---

## 2. System Reality Check

The system is NOT waiting for a platform.

What is now stable:

- Financial surface semantics
- `FinancialValue` envelope contract
- Authority / source / completeness labeling
- Class A vs Class B semantic distinction
- Fills / credits classified as Dependency Events
- RPC-centric authoring posture

What is still missing:

- Same-transaction outbox insertion
- Durable internal relay
- Idempotent consumer receipt
- Replay-capable event history
- Failure-harness proof for I1–I4

What must NOT be bundled into this slice:

- Lifecycle-aware completeness projections
- New dashboards or UI freshness semantics
- External reconciliation contracts
- Generic pub/sub infrastructure
- Full observability platform

---

## 3. Primary Risk

> Infrastructure metastasis.

### Manifestation

- Building a generic event bus instead of `finance_outbox`
- Adding multi-consumer fan-out before pilot need exists
- Designing replay as event sourcing
- Treating outbox history as ledger authority
- Bundling projection consumers into producer/relay work
- Adding observability dashboards before transport proof
- Reopening trigger-vs-RPC after the FIB froze RPC-coupled insertion

---

## 4. Core Sequencing Rule

Wave 1 invariant:

> Truth before consistency before architecture.

Wave 2 invariant:

> Transport before projection before observability.

Do not skip steps.

---

## 5. Guardrail Principles

### 5.1 Propagate, Don’t Platformize

Build reliable propagation for financial events.

Do not build:

- a generic event platform
- subscription framework
- internal Kafka clone
- reusable event orchestration layer
- cross-domain pub/sub abstraction

If the work cannot be explained as “authoring row + outbox row + durable relay + idempotent receipt,” it is probably out of scope.

---

### 5.2 Transport Before Freshness

The outbox slice proves:

- I1 atomicity
- I2 durability
- I3 idempotency
- I4 replayability

It does not yet prove:

- live dashboard freshness
- lifecycle-aware completeness
- operator-visible staleness indicators
- new projection correctness

Those belong to downstream consumer slices.

---

### 5.3 One Internal Relay Path

Pilot scope assumes one internal relay topology.

Reject:

- multi-relay orchestration
- fan-out routing engines
- consumer registry frameworks
- per-consumer delivery policies
- dynamic subscription management

Multi-consumer fan-out is future schema evolution, not Wave 2 entry scope.

---

### 5.4 Replay Is Not Event Sourcing

Replay exists to rebuild derived projections.

Replay does not:

- replace authoring tables
- create authoritative financial truth
- become the ledger
- establish final totals
- create settlement authority

The authoring stores remain the source of record.

The outbox is propagation infrastructure.

---

### 5.5 Minimal Observability Only

Allowed in the transport slice:

- relay success / failure logs
- backlog size log
- retry visibility sufficient to debug delivery
- failure-harness evidence

Not allowed:

- observability dashboard
- alerting framework
- replay visualizer
- delivery analytics product surface
- generic telemetry platform

If observability requires its own UX, schema family, or dashboard, it is a separate FIB.

---

### 5.6 Preserve Class A / Class B Symmetry

ADR-055 parity is non-negotiable.

Reject:

- Class A first, Class B later
- “temporary” producer asymmetry
- outbox for player ledger only
- delayed support for table-level operational observations
- drift between `origin_label` rules across fact classes

If both fact classes do not land under the same transport discipline, the slice is not complete.

---

### 5.7 No Projection Leakage

This outbox slice must not:

- emit `completeness.status = 'complete'`
- emit `completeness.status = 'partial'`
- redesign visit summaries
- update dashboard projections
- change UI labels
- alter operator-facing financial surfaces

Projection consumers are downstream.

Transport does not present.

---

### 5.8 Event Types Are Cataloged, Not Invented Inline

Producer RPCs and consumers must use registered event types only.

Reject:

- ad-hoc event strings
- payload-inferred event semantics
- route-local event naming
- consumer-private event meaning

New event types require registration in the Wave 2 event catalog artifact before use.

---

### 5.9 RPC-Coupled Insertion Is Frozen for Pilot

Trigger-based insertion has been rejected for the pilot.

Do not reopen:

- trigger-vs-RPC
- CDC/WAL streaming
- `pg_notify`
- external broker integration

unless a superseding decision artifact explicitly amends the FIB.

---

## 6. Explicit Anti-Patterns

Reject any work that attempts to:

- Build a generic event framework
- Add external event consumers
- Add public event APIs
- Treat outbox as event sourcing
- Derive authoritative totals from replay
- Add projection consumers to the producer/relay slice
- Upgrade `'estimated'` to `'actual'` in consumers
- Add `player_id` to Class B / grind rows
- Add compliance events to `finance_outbox`
- Modify `player_financial_transaction` column schema
- Add broad observability dashboards
- Introduce multi-consumer fan-out
- Reopen fills/credits authority classification
- Reopen trigger-based outbox insertion
- Use row counts alone as I1 atomicity proof

---

## 7. Allowed Work

Allowed within the Wave 2 transactional outbox transport slice:

- `finance_outbox` table DDL
- `table_buyin_telemetry` minimal Class B store
- `processed_messages` table
- producer RPC extensions for Class A
- producer RPC birth for Class B
- fills/credits Dependency Event outbox insertion
- `FinancialOutboxEventDTO`
- internal polling relay
- idempotent consumer receipt
- replay ordering guarantee
- Wave 2 event catalog artifact
- I1–I4 failure-harness validation
- minimal relay debug logging

---

## 8. Decision Gate

Before accepting any task into this slice, ask:

### Question 1

Does this task help prove atomic delivery from authoring RPC to outbox?

- YES → possibly in scope
- NO → continue

### Question 2

Does this task help prove durable relay or idempotent receipt?

- YES → possibly in scope
- NO → continue

### Question 3

Does this task modify projection behavior, UI semantics, or operator-visible completeness?

- YES → out of scope
- NO → continue

### Question 4

Does this task generalize infrastructure beyond the known pilot transport path?

- YES → out of scope
- NO → possibly in scope

---

## 9. Phase Boundary

This guardrail protects the first Wave 2 infrastructure slice only.

The slice may produce transport facts.

It may not consume them into new operator-visible meaning.

Downstream slices may build:

- lifecycle-aware completeness projection
- shift telemetry projection consumers
- session summary freshness
- pit dashboard projections
- observability dashboards

but only after the transport invariant is proven.

---

## 10. Final Directive

Do not let discomfort with future scale turn the outbox into a platform.

Do not let enthusiasm for freshness drag projections into transport.

Do not let replay become theology.

The goal is not to build an event-driven system.

The goal is to guarantee that when a financial fact is authored, its propagation input is durably born with it.

---

## One-Line Invariant

If this work makes the transport layer responsible for presentation behavior, it is wrong.

If this work makes reliable propagation smaller, clearer, and testable, it is probably right.
