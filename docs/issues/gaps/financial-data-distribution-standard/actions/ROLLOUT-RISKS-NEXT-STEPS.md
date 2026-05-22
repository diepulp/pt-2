# ROLLOUT RISKS & NEXT STEPS — Envelope-First Strategy (PT-2)

---

status: ATTACHED TO ROLLOUT-ROADMAP
date: 2026-04-23
scope: Wave 1 (Envelope) → Wave 2 (Outbox + Topology)
purpose: Make risks explicit and enforce disciplined transition
---------------------------------------------------------------

# 1. Context

The rollout follows an **envelope-first strategy**:

* Wave 1 → stabilize semantic truth (labels, authority, completeness)
* Wave 2 → stabilize propagation and data flow (outbox, projections)

This aligns with:

* contract-first evolution (stable interfaces before structural change)
* event-driven systems where **semantics and transport evolve separately**

---

# 2. Core Architectural Tension

> Wave 1 improves correctness of *representation*
> Wave 2 improves correctness of *behavior*

Risk arises when:

* representation looks correct
* underlying system is still inconsistent

---

# 3. Identified Risks

---

## R1 — Envelope Drift Across Layers

### Description

Different layers (service → API → UI) reinterpret or mutate the envelope:

```ts id="r1ex"
service:    type = "estimated"
API:        type = "actual"   ❌
UI:         merges values     ❌
```

### Impact

* breaks semantic guarantees
* reintroduces split-brain at presentation layer
* invalidates Surface Rendering Contract

---

### Mitigation

* Envelope is **WRITE-ONCE at service boundary**
* Downstream layers MUST treat it as immutable
* No reclassification outside service layer

---

### Enforcement Rule

> The service layer is the sole authority for financial classification.

---

## R2 — False Confidence from Wave 1

### Description

Wave 1 produces:

* clean UI
* labeled values
* apparent correctness

But underlying system still has:

* TBT shadow logic
* no outbox guarantees
* inconsistent propagation

---

### Impact

* team assumes system is “fixed”
* delays Wave 2
* hides structural issues

---

### Mitigation

* Explicitly label Wave 1 outputs as:
  → **“semantically correct, structurally incomplete”**

* Do NOT:

  * derive totals
  * rely on envelope for downstream logic
  * treat system as authoritative

---

### Enforcement Rule

> Wave 1 improves truthfulness, not correctness.

---

## R3 — Envelope Becoming a Hidden Source of Truth

### Description

Consumers begin to treat envelope as:

> authoritative financial model

Instead of:

> classification layer over partial data

---

### Impact

* scope creep into accounting domain
* implicit reconciliation logic emerges
* breaks D3 (telemetry boundary)

---

### Mitigation

* Envelope must NOT:

  * compute totals
  * reconcile values
  * imply completeness

---

### Enforcement Rule

> Envelope describes reality—it does not resolve it.

---

## R4 — Dual-Stream Inconsistency (PFT vs GRIND)

### Description

Wave 2 introduces:

```text id="r4flow"
PFT  → outbox
GRIND → outbox
```

If guarantees differ:

* ordering mismatches
* latency skew
* inconsistent projections

---

### Impact

* projection drift
* incorrect aggregation
* subtle data corruption

---

### Mitigation

* identical outbox discipline for both streams:

  * same transaction boundary
  * same event schema
  * same retry semantics

---

### Enforcement Rule

> All financial event sources must conform to a single event contract.

---

## R5 — Envelope / Event Schema Coupling

### Description

Envelope used both as:

* UI contract
* event metadata

---

### Impact

* UI changes → break event consumers
* event evolution → break UI

---

### Mitigation (Optional Refinement)

Split logically:

```ts id="r5split"
EventEnvelope {
  event_id
  origin
}

FinancialEnvelope {
  value
  type
  completeness
}
```

---

### Enforcement Rule

> UI representation must not constrain event evolution.

---

# 4. Phase Discipline (Critical)

---

## Wave 1 — Allowed

* introduce envelope
* enforce labeling
* update UI rendering
* expose completeness

---

## Wave 1 — Forbidden

* schema changes
* outbox introduction
* projection rewrites
* total computation

---

## Wave 2 — Allowed

* transactional outbox
* event propagation
* projection layer

---

## Wave 2 — Forbidden

* changing envelope shape
* redefining semantics
* reclassifying financial types

---

# 5. Transition Gates

---

## Gate G1 — Envelope Integrity

Before Wave 2:

* envelope is immutable
* no reclassification leaks
* UI fully compliant

---

## Gate G2 — Semantic Stability

* no ambiguity in:

  * actual vs estimated
  * ledger vs operational

---

## Gate G3 — Failure Harness (Partial)

* UI truthfulness invariant holds
* no semantic corruption under failure

---

## Gate G4 — Structural Validation (Wave 2)

* outbox atomicity validated
* idempotency proven
* replay determinism confirmed

---

# 6. Next Steps

---

## Step 1 — Lock Envelope Contract

* finalize schema
* enforce write-once semantics
* add type-level guarantees

---

## Step 2 — Audit All Surfaces

* apply rendering contract
* eliminate ambiguous fields
* remove implicit totals

---

## Step 3 — Introduce Failure Harness (Wave 1 scope)

* validate:

  * UI truthfulness under partial data
  * no semantic corruption

---

## Step 4 — Prepare Outbox Integration

* align PFT and GRIND write paths
* unify event envelope
* define idempotency keys

---

## Step 5 — Execute Wave 2

* introduce transactional outbox
* implement consumers
* build projections

---

## Step 6 — Full Failure Simulation

* crash scenarios
* duplicate delivery
* backlog recovery
* replay validation

---

# 7. Final Position

The envelope-first approach is:

* **architecturally sound**
* aligned with contract-first evolution
* aligned with event-driven systems

However:

> Its success depends entirely on strict discipline between phases.

---

# 8. Closing Statement

This rollout does not fail because of design.

It fails if:

* envelope is treated as formatting instead of law
* Wave 1 is mistaken for completion
* Wave 2 is allowed to redefine semantics

> The architecture is correct.
> The execution must be equally strict.

---
