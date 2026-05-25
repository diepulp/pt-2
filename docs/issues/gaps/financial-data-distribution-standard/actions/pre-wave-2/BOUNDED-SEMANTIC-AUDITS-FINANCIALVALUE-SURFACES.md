# BOUNDED SEMANTIC AUDITS — FINANCIALVALUE SURFACES

**Date:** 2026-05-06  
**Status:** Directional Guidance  
**Scope:** Post-Wave-1 semantic convergence / pre-Wave-2 stabilization

---

# Executive Summary

The recent fills/credits investigation does **not** indicate:
- provenance collapse,
- broken financial accountability,
- or invalid canonization architecture.

It revealed:
- legacy surface assumptions,
- implicit authority defaults,
- and semantic shortcuts that predate the current canon.

The canonical model is functioning correctly:
it is exposing semantic inconsistencies in older UI surfaces.

This direction introduces:

```text
Bounded Semantic Audits
```

A controlled convergence process that reconciles legacy FinancialValue-rendering
surfaces against the canonical authority/provenance model without triggering
full architectural re-evaluation or governance sprawl.

---

# Core Principle

```text
All FinancialValue surfaces are provisional
until reconciled against canonical semantic contracts.
```

This is expected during canonization phases.

---

# Audit Objective

Detect and correct:

| Drift Type | Example |
|---|---|
| Silent authority escalation | missing provenance signal defaults to `'actual'` |
| Explicit authority mismatch | operational telemetry labeled `'actual'` |
| Unlabeled operational surfaces | raw `formatCents()` bypassing FinancialValue |
| Incorrect completeness semantics | live shift data marked `complete` |
| Formula authority mismatch | mixed operational formulas surfacing authoritative |
| Generic source lineage | `table_rundown` instead of domain-specific source |

The goal is:
- stable operational semantics,
- conservative authority behavior,
- and replay-safe rendering.

---

# Scope Boundary

## In Scope

Surfaces that:
- render `FinancialValue`
- display financial telemetry
- compute mixed formulas
- aggregate operational metrics
- display provenance-sensitive KPIs
- degrade authority/completeness semantics

### Priority Surface Types

| Priority | Surface |
|---|---|
| P1 | Shift dashboards |
| P1 | KPI stacks |
| P1 | Table/pit metrics |
| P1 | Aggregate telemetry panels |
| P2 | Rundown summaries |
| P2 | Session-level telemetry |
| P3 | Historical/reporting views |

---

## Out of Scope

- PFT write paths
- service layer
- DTO redesign
- migrations
- outbox infrastructure
- replay infrastructure
- reconciliation systems
- accounting settlement semantics
- full UI redesign

---

# Audit Checklist

For every FinancialValue-rendering surface:

| Check | Question |
|---|---|
| Authority | Is `'actual'` explicitly justified by provenance? |
| Fallbacks | Does missing classification silently escalate authority? |
| Completeness | Does the completeness status match operational reality? |
| Formula degradation | Do mixed operational inputs degrade correctly? |
| Source lineage | Is the source string domain-specific and meaningful? |
| Envelope discipline | Is FinancialValue bypassed via raw formatting helpers? |
| Surface type | Is this operational telemetry or authoritative surface? |

---

# Severity Classification

## S1 — Provenance Risk

Examples:
- silent escalation to `'actual'`
- replay-propagating wrong authority semantics
- incorrect formula authority inheritance

Action:
- patch before replay/outbox hardening

---

## S2 — Surface Semantic Drift

Examples:
- incorrect completeness semantics
- generic source lineage
- inconsistent rendering labels

Action:
- patch during stabilization passes

---

## S3 — Ontology Clarification Opportunity

Examples:
- awkward terminology
- overloaded labels
- semantic discomfort without propagation risk

Action:
- document only
- avoid taxonomy expansion during pilot

---

# Operational Rule Going Forward

```text
Absence of provenance signal
must never default to authority.
```

Conservative authority semantics are the canonical default.

---

# Important Clarification

The current surface contract:

| Label | Meaning |
|---|---|
| `'actual'` | ledger-authoritative semantics |
| `'estimated'` | non-ledger operational semantics |

These are:
- operational authority semantics,
NOT:
- epistemic certainty semantics.

A value may be:
- operationally concrete,
- auditable,
- and exact to the cent,

while still surfacing as:
```text
'estimated'
```

under the current non-ledger operational rendering contract.

---

# Final Direction

The system does not currently require:
- architectural re-foundation,
- provenance redesign,
- or enterprise accounting expansion.

The canon is functioning correctly:
it is exposing older semantic shortcuts embedded in legacy surfaces.

The correct response is:

```text
controlled semantic convergence
```

through bounded FinancialValue surface audits.

NOT:
```text
full architectural re-evaluation
```
