# WAVE-2 BLOCKER — UL REFINEMENT & DEPENDENCY EVENT RECONCILIATION

**Date:** 2026-05-06  
**Status:** PRE-WAVE-2 BLOCKER  
**Scope:** Financial Canonization / Transactional Outbox / Projection Semantics

---

# Executive Summary

Wave 1 remains fundamentally valid and does **not** require rollback or redesign.

However, the emergence of the **Dependency Event** category during the Wave 2 UL (Ubiquitous Language) refinement revealed a semantic compression in the earlier Phase 1 mental model:

```text
Class A = actual
Class B = estimated
```

This model was sufficient for:
- surface truthfulness,
- stale dashboard elimination,
- authority propagation,
- and FinancialValue envelope rollout.

But it did not distinguish between:

- intrinsically authority-bearing financial facts,
- operational telemetry facts,
- and operational dependency events that influence projections.

The discovery occurred during fills/credits analysis and surfaced a previously hidden semantic distinction:

```text
projection participation
≠
authority semantics
```

This clarification must be reconciled before Wave 2 producer wiring and relay propagation begin.

---

# BLOCKER STATEMENT

## Wave 2 must not begin producer wiring until:

1. Dependency Event semantics are formally recognized in the UL
2. Existing fills/credits surface violations are corrected
3. Silent `'actual'` fallback behavior is removed
4. Outbox propagation scope is clarified as:
   - projection-input propagation
   - NOT purely authority-fact propagation

This is NOT a rollback of Wave 1.

It is a semantic stabilization pass before propagation infrastructure hardens the wrong ontology into replayable state.

---

# WHAT PHASE 1 GOT RIGHT

Wave 1 correctly established:

| Concern | Status |
|---|---|
| Surface truthfulness | VALID |
| Explicit authority labeling | VALID |
| Anti-split-brain propagation direction | VALID |
| FinancialValue envelope discipline | VALID |
| Semantic honesty at render boundaries | VALID |
| Replay-aware propagation direction | VALID |

The issue is NOT:
- propagation discipline,
- outbox direction,
- or the rendering contract.

The issue is:
- insufficiently refined event ontology beneath the rendering layer.

---

# ROOT CAUSE

## Earlier semantic compression

The system implicitly treated:

```text
surface authority label
```

as equivalent to:

```text
intrinsic event ontology
```

This became unstable once fills/credits entered the canonization discussion.

---

# WHY FILLS/CREDITS EXPOSED THE GAP

Fills and credits:

- influence shift telemetry
- affect operational win/loss interpretation
- participate in projection computation
- require freshness guarantees
- require replay correctness

But they are NOT:
- player-attributed financial truth
- ledger-authoritative activity
- direct telemetry facts in the same sense as PFT

They are more accurately:

```text
Dependency Events
```

Operational state mutations required for projection correctness.

---

# NEW UL DISTINCTION

## 1. Authority Facts

Canonical authored financial truth.

### Examples
- PFT buy-ins
- PFT cashouts
- adjustments

### Characteristics
- authority-bearing
- auditable
- attributed
- ledger-like

---

## 2. Telemetry Facts

Operational estimates/observations surfaced as operational intelligence.

### Examples
- TBT/grind telemetry
- observational operational estimates

### Characteristics
- non-authoritative
- operationally useful
- estimate-bearing

---

## 3. Dependency Events

Operational state mutations that influence telemetry projections but are not themselves authority-bearing financial truth.

### Examples
- fills
- credits
- inventory resets
- inventory corrections

### Characteristics
- projection-affecting
- replay-relevant
- freshness-relevant
- not intrinsically authority-bearing

---

## 4. Surface Authorities

Operational interpretation labels applied at render/projection boundaries.

### Examples
- `actual`
- `estimated`

This distinction is critical:

```text
surface authority
≠
intrinsic ontology
```

---

# IMPORTANT CLARIFICATION

The system is NOT introducing:
- a fifth authority class,
- custody-truth semantics,
- accounting-grade inventory ontology,
- or reconciliation infrastructure.

Dependency Event is:
- an internal semantic category,
- NOT a user-facing authority class.

Operational surfaces may still legitimately render:
- fills/credits as `estimated`
- when surfaced through telemetry projections.

That rendering behavior remains coherent.

---

# IMPLEMENTATION VIOLATIONS TO PATCH BEFORE WAVE 2

## Blocking Violations

### 1. Explicit `actual` fills/credits

Files:
- `rundown-summary-panel.tsx`

Problem:
- fills/credits explicitly labeled `actual`

Required:
- remove `actual`
- align to projection-driven estimated semantics

---

### 2. Silent `'actual'` fallback defaults

Files:
- `secondary-kpi-stack.tsx`

Problem:
- missing `metricGrade` silently defaults to `actual`

Required:
- remove implicit authority fallback
- require explicit semantic classification

---

### 3. Unlabeled fills/credits surfaces

Files:
- `pit-metrics-table.tsx`
- `table-metrics-table.tsx`

Required:
- explicit FinancialValue rendering
- explicit estimated surface semantics

---

# OUTBOX RECONCILIATION PATH

## Previous implicit assumption

```text
Outbox propagates financial authority facts
```

## Refined Wave 2 understanding

```text
Outbox propagates projection inputs
```

Which may include:
- Authority Facts
- Telemetry Facts
- Dependency Events

This does NOT imply:
- shared authority semantics
- shared ontology
- or accounting equivalence

Shared propagation discipline
does not imply shared financial authority.

---

# REQUIRED WAVE 2 ALIGNMENTS

## 1. UL adoption

Dependency Event terminology must become canonical before:
- producer wiring
- replay harnesses
- relay worker implementation

---

## 2. Surface patching

All known fills/credits semantic violations must be corrected before:
- outbox replay
- producer emission
- propagation hardening

---

## 3. ADR clarification

The ADR set should explicitly distinguish:

```text
projection participation
```

from:

```text
authority semantics
```

This prevents future semantic collapse between:
- inventory movement
- telemetry
- and ledger truth

---

## 4. Preserve pilot containment

This refinement must NOT expand into:
- full accounting architecture
- reconciliation infrastructure
- inventory settlement systems
- generalized casino financial ontology

The pilot remains focused on:

```text
truthful operational telemetry propagation
```

NOT:
```text
enterprise casino accounting infrastructure
```

---

# FINAL DIRECTION

Wave 1 remains valid.

Wave 2 now introduces:
- refined event ontology,
- clarified propagation semantics,
- and explicit distinction between:
  - authority-bearing facts
  - projection-affecting dependency events

This refinement strengthens the canonization effort.

It does NOT invalidate the rollout direction.

The correct next step is:
- semantic stabilization,
- implementation patching,
- then Wave 2 producer wiring.

NOT:
- rollback,
- ontology explosion,
- or architecture redesign.
