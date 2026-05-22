# POST-MORTEM — PRD-070 Pipeline Interruption  
Financial Telemetry — Wave 1 Phase 1.1

date: 2026-04-24  
status: DIAGNOSTIC — ARCHITECTURAL ALIGNMENT REQUIRED  
applies_to:
  - PRD-070
  - EXEC-070
  - PRD-072 (replacement direction)
  - Financial Telemetry rollout (Wave 1)

---

# 1. Executive Summary

PRD-070 did not fail due to incorrect architecture.

It failed because:

> **It collapsed temporal sequencing and attempted to solve multiple phases simultaneously.**

The system correctly halted execution due to:
- hidden dependencies
- inconsistent workstream scope
- premature enforcement of correctness

---

# 2. What PRD-070 Got Right

## 2.1 Architectural Intent

PRD-070 correctly defined:

- Service-first contract rollout
- FinancialValue envelope as semantic layer
- Direct-coupling exception slices
- Phase 1.2 deferral concept

## 2.2 Core Rule

PRD-070’s core rule was sound:

> Internal DTO envelope work moves first; direct-coupling consumers move as exception slices or defer.

This is the correct Wave 1 strategy.

---

# 3. What Actually Went Wrong

## 3.1 Phase Boundary Violation

PRD-070 mixed two distinct phases:

| Phase | Responsibility |
|------|----------------|
| Phase 1.1 | Semantic labeling through the FinancialValue envelope |
| Phase 1.2 | Data normalization: units, conversions, canonicalization |

### Evidence

The problematic direction appeared in WS5 and WS6:

> Remove dollar pre-conversion and land cents-envelope contract.

That introduces:
- unit normalization
- conversion removal
- semantic change

These are Phase 1.2 concerns, not Phase 1.1 concerns.

---

## 3.2 Service-Led Model Collapse

Declared model:

> Service-led contract migration.

Actual execution:

- Service + route + UI bundled into the same slices
- Vertical slices introduced inside a service-led phase

### Result

```text
Expected:
services → routes → UI

Actual:
services + routes + UI simultaneously
```

This introduced:
- tight coupling
- sequencing constraints
- increased blast radius

---

## 3.3 Exception Slices Became Full Features

Original intent:
- small, bounded exceptions

Actual behavior:
- WS4, WS5, and WS6 became multi-layer slices:
  - service
  - route
  - UI
  - tests

### Result

> Exception slices evolved into mini vertical features.

This violated containment and increased complexity.

---

## 3.4 Shared DTO Contention

The parent spec explicitly identified a `services/visit/dtos.ts` serialization hazard between WS5 and WS6.

### Root Cause

Multiple workstreams were:
- modifying the same DTO file
- with different semantic goals
- under a supposedly service-led phase

### Impact

- Workstreams could not run independently
- Ordering constraints were introduced
- Merge conflicts became likely
- Cross-context coupling became visible

---

## 3.5 Complexity Misclassification

PRD-070 treated unequal workstreams as if they were equivalent execution units.

| Workstream | Actual Complexity |
|----------|-------------------|
| WS4 rename | Low |
| WS5 canonicalization | High |
| WS6 cross-context canonicalization | Very high |

The parent spec later admitted it had conflated tier-1 rename complexity with tier-2 shape-conversion complexity.

---

## 3.6 Premature Test Enforcement

WS9 required:
- route tests
- UI tests
- mapper tests
- a full verification matrix

### Problem

Tests were being enforced before:
- the contract stabilized
- semantics stabilized
- unit consistency stabilized

### Result

> Tests became enforcement for an unstable system.

---

## 3.7 Hidden Coupling Explosion

Because canonicalization entered the phase, the dependency chain became:

```text
value semantics → mapper logic → DTO shape → route contract → UI rendering → tests
```

All layers became interdependent.

That is not a DTO envelope rollout.  
That is a vertical migration.

---

# 4. Root Cause

The true root cause was not:
- missing files
- incomplete tests
- weak execution
- poor agent performance

The true root cause was:

> **Temporal sequencing collapse.**

PRD-070 attempted to achieve:

```text
correct + consistent + labeled
```

inside one phase.

The correct sequence is:

```text
Phase 1.1 → labeled
Phase 1.2 → consistent
Wave 2    → architecturally correct
```

---

# 5. Why the Pipeline Stopped

The pipeline encountered:

- conflicting workstream dependencies
- DTO ownership contention
- unstable contract boundaries
- expanding test obligations
- cross-context conversion semantics leaking into envelope work

### Result

> The pipeline correctly refused to proceed.

This was a useful halt, not a failure of the machinery.

---

# 6. Structural vs Semantic Confusion

## Semantic Layer — Phase 1.1

Questions Phase 1.1 may answer:

- What is this value?
- Where did it come from?
- How complete is it?
- Is it actual, estimated, observed, or compliance?

## Structural Layer — Phase 1.2

Questions Phase 1.2 may answer:

- What unit is it in?
- How is it computed?
- Where should it live?
- Which context owns the DTO?
- Where should conversions happen?

### PRD-070 Mistake

> PRD-070 attempted to solve both layers simultaneously.

---

# 7. Corrective Action

## 7.1 Reframe PRD-072

PRD-072 must become:

> **Pure Phase 1.1 completion slice.**

It should complete the deferred visit-surface envelope coverage from PRD-070 without inheriting the canonicalization drift.

## 7.2 Allowed in PRD-072

- Wrap existing numeric values in `FinancialValue`
- Add:
  - `type`
  - `source`
  - `completeness.status`
- Preserve existing value semantics
- Preserve existing unit representation
- Preserve existing conversion behavior

## 7.3 Forbidden in PRD-072

- Unit changes
- `/100` removal
- Mapper rewrites for correctness
- DTO ownership movement
- Value recomputation
- Route/UI expansion beyond minimum pass-through needs
- Broad test matrix expansion

## 7.4 Defer to Separate PRD

Create a separate future PRD:

> Financial Data Canonicalization — Phase 1.2

It should handle:
- cents normalization
- conversion removal
- mapper cleanup
- DTO ownership clarification
- cross-context value semantics

---

# 8. Lessons Learned

## 8.1 Do Not Collapse Phases

Each phase must solve one class of problem.

Phase 1.1 should make values interpretable.  
Phase 1.2 may make values consistent.  
Wave 2 may make the architecture durable.

## 8.2 Service-Led Must Stay Service-Led

Do not bundle:
- UI
- routes
- new route-boundary tests
- broad consumer migration

inside a service-led phase unless the exception is genuinely tiny.

## 8.3 Exception Slices Must Stay Small

If an exception slice spans:

```text
service + route + UI + tests
```

then it is no longer an exception.

It is a vertical feature and needs its own FIB/PRD.

## 8.4 Label First, Fix Later

> Truth precedes correctness.

The envelope exists to prevent misinterpretation.  
It does not need to fix the underlying system in the same slice.

---

# 9. Final Diagnosis

```text
PRD-070 failed because it attempted to fix the system
while still defining its meaning.
```

---

# 10. Forward Directive

- Freeze Phase 1.1 as semantic-only.
- Regenerate PRD-072 as envelope-only continuation.
- Extract all normalization concerns into Phase 1.2.
- Keep test obligations proportional to envelope stabilization, not canonicalization.
- Do not allow `/100`, unit, or mapper-normalization work inside PRD-072.

---

# 11. One-Line Invariant

```text
If a change makes the system more correct, it does not belong in Phase 1.1.
If a change makes the system more interpretable, it does.
```
