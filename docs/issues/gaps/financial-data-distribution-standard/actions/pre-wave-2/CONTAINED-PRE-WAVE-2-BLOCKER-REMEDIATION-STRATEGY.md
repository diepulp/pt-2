# CONTAINED PRE-WAVE-2 BLOCKER REMEDIATION STRATEGY

**Date:** 2026-05-06  
**Status:** ACTIVE DIRECTION  
**Scope:** Minimal semantic stabilization required before Wave 2 producer wiring

---

# Executive Summary

The recent fills/credits investigation surfaced:
- semantic inconsistencies,
- authority-label drift,
- and legacy UI assumptions.

It did NOT reveal:
- provenance collapse,
- broken financial accountability,
- invalid propagation architecture,
- or failed canonization foundations.

The objective before Wave 2 is NOT:

```text
full semantic convergence
```

The objective is:

```text
minimum viable semantic safety
```

before replay and outbox propagation harden incorrect authority semantics into infrastructure behavior.

---

# Core Direction

Proceed with Wave 2 after:
- replay-dangerous authority drift is patched,
- conservative authority defaults are enforced,
- and minimal semantic clarification is established.

Do NOT delay Wave 2 waiting for:
- ontology perfection,
- exhaustive semantic audits,
- ADR expansion,
- or complete surface convergence.

---

# Mandatory Pre-Wave-2 Remediation

The following items remain true blockers because replay/outbox hardening would otherwise fossilize incorrect authority semantics.

---

## B-1 — Minimal Semantic Clarification

### Required

- Adopt Dependency Event terminology in active Wave 2 planning docs
- Clarify:
  ```text
  projection participation
  ≠
  authority semantics
  ```
- Preserve current surface contract:
  - `'actual'` = ledger-authoritative semantics
  - `'estimated'` = non-ledger operational semantics

### Explicitly NOT required

- ADR replacement
- taxonomy redesign
- new authority tiers
- reconciliation semantics
- accounting ontology expansion

This is semantic stabilization guidance only.

---

## B-2 — Replay-Dangerous Surface Drift Patches

The following MUST be patched before:
- producer wiring
- replay harnesses
- relay propagation

### Required categories

| Drift Type | Why It Blocks |
|---|---|
| Silent default-to-`'actual'` | authority escalation propagates downstream |
| Explicit false `'actual'` labels | replay preserves incorrect authority semantics |
| Mixed formulas incorrectly authoritative | semantic contamination risk |
| Missing FinancialValue envelopes on telemetry surfaces | inconsistent propagation semantics |

### Current patch scope

- `rundown-summary-panel.tsx`
- `secondary-kpi-stack.tsx`
- `metrics-table.tsx`
- `pit-metrics-table.tsx`
- `table-metrics-table.tsx`
- `pit-table.tsx`

These remain localized surface corrections only.

---

# Explicit Non-Blockers

The following are intentionally deferred and must NOT block Wave 2:

| Deferred Concern | Reason |
|---|---|
| Full semantic convergence | iterative stabilization work |
| Exhaustive FinancialValue audits | not replay-critical |
| Perfect ontology terminology | operationally unnecessary |
| Third authority taxonomy | scope expansion risk |
| ADR re-foundation | disproportional to issue severity |
| Global UI semantic harmonization | indefinite stabilization risk |
| Enterprise accounting semantics | outside pilot scope |

---

# Operational Rule Going Forward

```text
Absence of provenance signal
must never default to authority.
```

Conservative authority semantics are now canonical behavior.

This is the critical stabilization invariant entering Wave 2.

---

# Recommended Wave 2 Posture

## Before Wave 2

Patch:
- replay-dangerous semantic drift
- authority escalation paths
- incorrect defaults
- explicit false provenance labels

## During Wave 2

Observe:
- real replay behavior
- propagation pressure
- recurring semantic hotspots
- operational interpretation patterns

## After Wave 2

Perform:
- bounded semantic convergence passes
- targeted FinancialValue audits
- iterative surface reconciliation

NOT:
- full-system semantic redesign

---

# Important Clarification

The current issue is primarily:

```text
surface semantic drift
```

NOT:

```text
financial provenance failure
```

The underlying provenance model remains intact:
- attribution boundaries preserved
- event lineage preserved
- operational accountability preserved
- propagation architecture coherent

The canon is functioning correctly:
it is exposing older semantic shortcuts embedded in legacy surfaces.

---

# Final Direction

The correct response is:

```text
contained semantic stabilization
```

before replay hardening.

NOT:

```text
indefinite canonization convergence
```

Wave 2 should proceed once:
- replay-dangerous authority drift is patched,
- conservative authority defaults are enforced,
- and minimal semantic clarification is complete.

Broader semantic convergence remains ongoing iterative stabilization work.
