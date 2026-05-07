# WAVE-2 UBIQUITOUS LANGUAGE CLARIFICATION NOTE

**Date:** 2026-05-07  
**Status:** CANONICAL — semantic stabilization guidance  
**Scope:** Pre-producer-wiring clarification only  
**Not:** ADR replacement, architectural re-foundation, or taxonomy expansion

---

## Purpose

This note resolves B-1 criterion 3: a single reference that distinguishes projection
participation from authority semantics before Wave 2 producer wiring begins.

It does not replace ADR-052 through ADR-055. It clarifies one ambiguity introduced
when the Wave 2 Ubiquitous Language proposition added Dependency Event alongside the
existing Class A / Class B model.

---

## Core Distinction

```text
Projection participation ≠ authority semantics
```

An event may influence a projection without bearing financial authority. Fills and
credits update shift win/loss estimates. They are not ledger facts. Their downstream
effect on projections does not elevate their authority classification.

---

## Dependency Event Definition

A **Dependency Event** is a domain event that:

- is consumed as a Projection Input,
- affects aggregate telemetry or projection state,
- and carries **no ledger authority** of its own.

Examples: fills, credits, opening inventory snapshots, inventory corrections.

Dependency Events surface as `'estimated'` under the current surface contract
because they are non-ledger operational inputs — not because their values are
uncertain or approximate.

---

## Surface Contract Preservation

This clarification preserves the Wave 1 surface contract without change:

| Label | Meaning |
|---|---|
| `'actual'` | Ledger-authoritative (PFT-class / Class A) |
| `'estimated'` | Non-ledger operational input (Class B) |

`'estimated'` is a **provenance label**, not an accuracy qualifier. A value may
be operationally exact and auditable to the cent while still carrying `'estimated'`
because it is not a ledger settlement fact.

---

## Projection Input Scope

The outbox propagates **Projection Inputs**, not "financial events":

```text
Projection Input = Authority Fact | Telemetry Fact | Dependency Event
```

Propagation discipline is shared across all three categories. Semantic authority
remains distinct. The relay worker must not treat all propagated events as
authority-bearing.

---

## Conservative Authority Default

```text
Absence of provenance signal must never default to authority.
```

Any surface that cannot determine whether a value is ledger-authoritative must
resolve to `'estimated'`. Fallback logic must check affirmatively for
`'AUTHORITATIVE'` before escalating; absent or ambiguous grade stays `'estimated'`.

This is the canonical behavior entering Wave 2.

---

## Containment Boundary

This clarification must not expand into:

- reconciliation infrastructure
- inventory settlement semantics
- enterprise accounting ontology
- ADR amendments
- new authority tiers beyond the current four (`actual`, `estimated`, `observed`, `compliance`)

Pilot scope remains: truthful operational telemetry propagation through the
transactional outbox.

---

## References

- `wave-2/PRE-WAVE-2-UBIQUITOUS-LANGUAGE-PROPOSITION.md` §4.3–4.4 — full Dependency Event definition
- `wave-2/WAVE-2-BLOCKER-UL-RECONCILIATION-PATH.md` — authority fact / telemetry fact / dependency event triangle
- `actions/pre-wave-2/BOUNDED-SEMANTIC-AUDITS-FINANCIALVALUE-SURFACES.md` — conservative authority defaults
- `actions/pre-wave-2/CONTAINED-PRE-WAVE-2-BLOCKER-REMEDIATION-STRATEGY.md` — stabilization scope and posture
