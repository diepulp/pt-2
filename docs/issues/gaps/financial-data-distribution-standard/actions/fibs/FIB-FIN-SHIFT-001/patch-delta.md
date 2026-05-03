# PRD-073 PATCH DELTA — Scope Containment & Topology Alignment

---

status: PATCH (APPLY TO PRD-073)
date: 2026-04-24
intent: Prevent Phase 1 overreach and align with event-driven/outbox topology
-----------------------------------------------------------------------------

# 1. Phase 1 Scope Clarification (HARD CONSTRAINT)

## Amendment

Phase 1.1c is strictly limited to:

* financial **authority routing**
* semantic labeling (type, source, completeness)
* surface rendering correctness

---

## Explicit Non-Goals (MANDATORY ADDITION)

Phase 1.1c does NOT:

* define event propagation
* introduce outbox structures
* influence projection design
* compute totals or reconciliation
* unify financial streams (PFT vs GRIND)

---

## Rationale

Event-driven systems require separation of:

* **event generation**
* **event propagation**
* **event consumption** ([Solace][1])

Phase 1 operates exclusively in the **generation + semantic layer**, not propagation.

---

# 2. Envelope Role Restriction (CRITICAL)

## Amendment

The Financial Envelope is reclassified as:

> **semantic descriptor only**

---

## Allowed Responsibilities

* describe value
* describe type (actual / estimated)
* describe completeness
* expose source authority

---

## Forbidden Responsibilities

Envelope MUST NOT:

* act as event payload
* drive propagation logic
* participate in aggregation
* perform reconciliation
* encode system behavior

---

## Enforcement Rule

> Envelope is descriptive, not executable.

---

## Rationale

Outbox pattern explicitly decouples:

* database state
* event contracts

to avoid tight coupling between internal models and messaging ([Medium][2])

Turning the envelope into an event carrier violates this separation.

---

# 3. Authority vs Propagation Separation

## Amendment

Introduce explicit distinction:

```text
AUTHORITY (Phase 1)
→ who produces financial truth

PROPAGATION (Phase 2)
→ how truth is distributed
```

---

## Authority Definition (LOCKED)

* PFT → player financial truth (ledger-backed)
* GRIND → operational observation (unrated, estimated)
* TBT → deprecated as shadow ledger

---

## Propagation (Deferred)

* handled via transactional outbox (Wave 2)
* must not be implied or partially implemented in Phase 1

---

## Rationale

Outbox pattern solves **dual-write + propagation reliability**, not authority definition ([Conduktor][3])

Mixing these concerns leads to inconsistent system boundaries.

---

# 4. Domain Boundary Declaration (MANDATORY)

## Amendment

Add explicit system boundary:

```text
This system provides:
- operational financial telemetry
- labeled, classified financial signals

This system does NOT provide:
- accounting reconciliation
- authoritative drop totals
- financial closure guarantees
```

---

## Rationale

Outbox/event-driven systems are often paired with:

* eventual consistency
* asynchronous propagation

which inherently do NOT guarantee immediate financial reconciliation ([Conduktor][3])

---

# 5. Envelope vs Event Model Separation (FUTURE GUARDRAIL)

## Amendment

Introduce forward-looking separation:

```ts
// Domain (Phase 1)
FinancialEnvelope

// Event (Phase 2)
FinancialEvent {
  event_id
  aggregate_id
  payload
  metadata
}
```

---

## Constraint

Envelope MUST NOT be reused as:

* event payload
* outbox record
* streaming message

---

## Rationale

Best practice:

> database model ≠ event contract

to avoid schema coupling and brittle evolution ([Medium][2])

---

# 6. Phase Discipline Reinforcement

## Amendment

### Phase 1 (Current)

* define semantic truth
* enforce rendering correctness
* expose completeness

---

### Phase 2 (Future)

* introduce transactional outbox
* implement event propagation
* build projections

---

## Hard Rule

> Phase 1 defines truth.
> Phase 2 moves truth.

---

# 7. Risk Containment Addition

## New Risk (Add to PRD)

### R6 — Premature Topology Coupling

**Description**

Phase 1 begins to encode assumptions about:

* event structure
* propagation
* downstream consumers

---

**Impact**

* locks future architecture prematurely
* creates coupling between UI and event system
* invalidates outbox decoupling benefits

---

**Mitigation**

* prohibit event-related constructs in Phase 1
* treat envelope as terminal representation
* defer all propagation concerns

---

# 8. Final Position

This patch enforces:

* separation of concerns
* alignment with event-driven + outbox topology
* containment of pilot scope

---

# 9. Closing Constraint

> If Phase 1 starts shaping how data moves,
> it has already failed its purpose.

---

[1]: https://solace.com/event-driven-architecture-patterns/?utm_source=chatgpt.com "The Ultimate Guide to Event-Driven Architecture Patterns"
[2]: https://medium.com/engineering-varo/event-driven-architecture-and-the-outbox-pattern-569e6fba7216?utm_source=chatgpt.com "Event-Driven Architecture and the Outbox Pattern"
[3]: https://conduktor.io/glossary/outbox-pattern-for-reliable-event-publishing?utm_source=chatgpt.com "Outbox Pattern for Reliable Event Publishing"
