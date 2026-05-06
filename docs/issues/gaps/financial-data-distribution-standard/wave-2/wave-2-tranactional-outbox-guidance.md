# WAVE 2 IMPLEMENTATION GUIDANCE — Transactional Outbox (PT-2)

---

status: GUIDANCE (FOR ROLLOUT ROADMAP — WAVE 2)
date: 2026-04-24
purpose: Define how to use transactional outbox as a reference without misapplying it
scope: Event propagation, consumer design, projection layer
-----------------------------------------------------------

# 1. Positioning

The transactional outbox pattern is used as a **constraint reference**, not a system blueprint.

---

## Core Principle

> AWS Outbox defines **how to not lose events**.
> This system defines **what those events mean**.

---

# 2. What to Use from AWS Outbox (MANDATORY)

Reference:
https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html

---

## 2.1 Atomic Write (NON-NEGOTIABLE)

* DB write + outbox insert must occur in the same transaction
* either both succeed or both fail

This prevents dual-write inconsistency ([AWS Documentation][1])

---

## 2.2 At-Least-Once Delivery

* events may be delivered multiple times
* system must tolerate duplicates

---

## 2.3 Idempotent Consumers

Consumers must be idempotent:

* processing same event multiple times must not change outcome ([microservices.io][2])

---

## 2.4 Async Propagation

* outbox acts as durable intent log
* worker processes events asynchronously

Ensures eventual delivery even after crashes ([SoftwareMill][3])

---

## 2.5 Ordering (Scoped, Not Global)

* ordering must be preserved per entity (e.g., table_id)
* global ordering is not required

---

# 3. What NOT to Use from AWS (CRITICAL)

---

## 3.1 Do NOT Treat Domain Model as Event Model

AWS examples imply:

```text
entity → event
```

This system uses:

```text
financial fact → classified → event (later)
```

---

## 3.2 Do NOT Make Outbox the System Backbone

Outbox is:

* infrastructure layer

NOT:

* system architecture
* domain model
* semantic contract

---

## 3.3 Ignore AWS Service Implementations

Do NOT replicate:

* DynamoDB Streams
* EventBridge
* Lambda pipelines

They are implementation-specific, not pattern-defining.

---

## 3.4 Do NOT Drift into Event Sourcing

Outbox ≠ event sourcing

This system explicitly does NOT:

* reconstruct full system state from events
* act as a general ledger

---

# 4. Required Complementary Patterns

Outbox alone is insufficient.

---

## 4.1 Idempotent Consumer Pattern

Reference:
https://microservices.io/post/microservices/patterns/2020/10/16/idempotent-consumer.html

---

### Requirement

* track processed event IDs
* ignore duplicates

---

### Implementation Options

* `processed_messages` table
* idempotency key on aggregate

---

### Why

Outbox guarantees delivery, not uniqueness.

---

## 4.2 Inbox Pattern (Recommended)

Reference:
https://dev.to/actor-dev/inbox-pattern-51af

---

### Purpose

* ensure safe consumption
* deduplicate events
* provide replay safety

---

## 4.3 Change Data Capture (CDC) — Optional

Reference:
https://softwaremill.com/microservices-101/

---

### Purpose

* alternative to polling
* stream outbox changes via WAL

---

### Note

Not required for pilot, but useful for scale.

---

## 4.4 Event Schema Discipline

Reference:
https://www.birjob.com/blog/event-driven-architecture

---

### Requirement

Events must include:

* event_id
* timestamp
* aggregate_id
* payload
* metadata

---

# 5. System-Specific Constraints (NON-STANDARD)

---

## 5.1 Dual Authoring Streams

System has:

* PFT (ledger facts)
* GRIND (operational facts)

---

### Requirement

Both must:

* write to outbox using identical rules
* use same event schema
* follow same transaction guarantees

---

## 5.2 Envelope Separation

```text
FinancialEnvelope ≠ EventPayload
```

---

### Rule

Envelope must NOT be:

* stored in outbox
* used as event payload
* used for propagation

---

## 5.3 Domain Boundary Enforcement

System provides:

* operational financial telemetry

System does NOT provide:

* reconciliation
* final totals
* accounting truth

---

# 6. Event Model (Wave 2)

---

## Event Structure

```ts
Event {
  event_id: string
  aggregate_id: string   // table_id
  type: string
  payload: DomainFact
  metadata: {
    source: 'PFT' | 'GRIND'
    timestamp: number
  }
}
```

---

## Key Rule

> Event schema is independent of UI envelope.

---

# 7. Failure Model (Must Be Supported)

---

## Expected Failures

* duplicate delivery
* delayed processing
* out-of-order events
* consumer crash
* backlog accumulation

---

## System Requirements

* no data loss
* no duplicate side effects
* eventual consistency
* projection rebuild capability

---

# 8. Implementation Strategy (Wave 2)

---

## Step 1 — Outbox Table

* append-only
* transactional insert

---

## Step 2 — Relay Worker

* polling or CDC
* retries until success

---

## Step 3 — Consumer Layer

* idempotent
* isolated side effects

---

## Step 4 — Projection Layer

* rebuildable
* deterministic

---

# 9. Observability Requirements

Track:

* outbox backlog
* processing lag
* retry count
* duplicate rate

---

# 10. Anti-Patterns (DO NOT DO)

---

❌ Use envelope as event payload
❌ Derive authority in consumer
❌ Merge PFT + GRIND implicitly
❌ Assume exactly-once delivery
❌ Introduce reconciliation logic

---

# 11. Final Position

AWS Outbox is:

* a reliability constraint
* a failure-handling mechanism

It is NOT:

* your architecture
* your domain model
* your system design

---

# 12. Closing Statement

> The outbox ensures that events are not lost.
> It does not ensure they are meaningful.

Meaning is defined by:

* your domain model
* your classification logic
* your system boundaries

---

[1]: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html?utm_source=chatgpt.com "Transactional outbox pattern - AWS Prescriptive Guidance"
[2]: https://microservices.io/post/microservices/patterns/2020/10/16/idempotent-consumer.html?utm_source=chatgpt.com "Handling duplicate messages using the Idempotent ..."
[3]: https://softwaremill.com/microservices-101/?utm_source=chatgpt.com "Microservices 101: Transactional Outbox and Inbox"
 