# FAILURE SIMULATION PLAYBOOK — Financial Event Pipeline (PT-2)

---

status: Draft (pre-production validation artifact)
date: 2026-04-23
scope: PFT / GRIND → OUTBOX → CONSUMER → PROJECTIONS
purpose: Validate system behavior under partial failure conditions
depends_on: System Architecture + Transactional Outbox topology
---------------------------------------------------------------

# 1. Purpose

This playbook defines how to intentionally break the system to verify:

* no financial events are lost
* no duplicate effects occur
* projections recover deterministically
* UI never presents false authority

This is not load testing.

This is **failure-path validation**.

---

# 2. System Under Test

```text
WRITE (PFT / GRIND)
   ↓ (atomic transaction)
OUTBOX
   ↓ (async processing)
CONSUMER
   ↓
PROJECTIONS
   ↓
UI
```

---

# 3. Core Invariants (must NEVER break)

## I1 — Atomicity

PFT/GRIND write and outbox event must always occur together.

## I2 — Durability

Once committed, an event must eventually propagate.

## I3 — Idempotency

Processing the same event multiple times must not change results.

## I4 — Replayability

System must rebuild projections from event history.

## I5 — Truthfulness

UI must not present partial data as authoritative.

---

# 4. Failure Injection Strategy

Introduce controlled failure points:

| Toggle                | Location                 |
| --------------------- | ------------------------ |
| FAIL_BEFORE_OUTBOX    | before outbox insert     |
| FAIL_AFTER_COMMIT     | after DB commit          |
| FAIL_IN_CONSUMER      | during event processing  |
| FAIL_AFTER_PROCESS    | before marking processed |
| FAIL_PROJECTION_WRITE | during projection update |

---

# 5. Test Scenarios

---

## TEST 1 — Atomicity (Dual-Write Protection)

### Scenario

* Force failure before outbox insert

### Expected

* no PFT/GRIND record persists
* no outbox event exists

### Failure Signal

→ record exists without event → **critical violation**

---

## TEST 2 — Post-Commit Crash

### Scenario

* commit PFT + outbox
* crash immediately

### Expected

* event remains in outbox
* processed after restart

### Validates

* durability
* eventual consistency

---

## TEST 3 — Duplicate Delivery

### Scenario

* consumer processes event
* crash before marking processed
* restart → reprocess

### Expected

* projection unchanged after second run

### Validates

* idempotency

---

## TEST 4 — Consumer Failure (Partial Processing)

### Scenario

* event consumed
* projection write fails

### Expected

* retry occurs
* projection eventually consistent

### Failure Signal

→ event marked processed without projection update

---

## TEST 5 — Out-of-Order Events

### Scenario

* delay buy-in event
* process cash-out first

### Expected

* projection remains valid
* eventual correction after ordering resolves

### Failure Signal

→ negative balances / inconsistent state

---

## TEST 6 — Poison Event

### Scenario

* inject malformed payload

### Expected

* retries capped
* event isolated (dead-letter)
* system continues processing

### Failure Signal

→ pipeline blocked

---

## TEST 7 — Backlog Surge

### Scenario

* stop consumer
* accumulate events
* restart consumer

### Expected

* backlog drains
* projections catch up

### Risk

* throughput bottleneck
* delayed UI accuracy

---

## TEST 8 — Dual Source Drift (PFT vs GRIND)

### Scenario

* PFT events processed immediately
* GRIND delayed

### Expected

* UI remains semantically correct
* no merging of mismatched truth classes

### Failure Signal

→ combined totals misrepresent authority

---

## TEST 9 — Projection Rebuild

### Scenario

* wipe projections
* replay all events

### Expected

* identical results

### Failure Signal

→ non-deterministic projection logic

---

# 6. Execution Procedure

For each test:

1. Enable failure toggle
2. Execute real user flow (buy-in, cash-out)
3. Trigger failure
4. Restart system
5. Observe:

   * DB state
   * outbox state
   * projection state
   * UI output

---

# 7. Observability Requirements

Track:

* outbox queue length
* retry counts
* duplicate processing attempts
* projection lag
* failed event count

---

# 8. Pass Criteria

System passes if:

* no events are lost
* no duplicate financial effects
* projections converge
* UI remains semantically correct

---

# 9. Known Pattern Guarantees

Transactional outbox ensures:

* atomic persistence of state + event
* prevention of message loss
* eventual delivery through async processing ([DZone][1])

At-least-once delivery implies:

* duplicates WILL occur
* idempotency is REQUIRED

---

# 10. Failure Philosophy

> Systems do not fail at boundaries.
> They fail between steps.

This playbook targets:

* half-completed transactions
* delayed propagation
* repeated execution

---

# 11. Closing Statement

A system that passes happy-path tests is unproven.

A system that survives:

* crashes
* duplicates
* delays

is **production-ready**.

> The correctness of this architecture is not theoretical.
> It is defined by how it behaves when everything goes wrong.

---

[1]: https://dzone.com/articles/outbox-pattern-reliable-messaging-distributed-systems?utm_source=chatgpt.com "Outbox Pattern: Reliable Messaging in Distributed Systems"


