# ADR-XXX — Financial System Scope Boundary

---

status: Accepted — Frozen 2026-04-23 (decision-only; supersede via new ADR, do not patch)
date: 2026-04-23
frozen_date: 2026-04-23
scope: Pilot (PT-2)
source: DECISION-CONSOLIDATION.md — D3, D5
frozen_with:
- ADR-FINANCIAL-FACT-MODEL.md
- ADR-FINANCIAL-EVENT-PROPAGATION.md
- ../actions/SURFACE-RENDERING-CONTRACT.md
purpose: Fix a hard boundary around what the system does and does not claim about financial truth.

---

# 1. Context

Prior designs drifted into accounting territory — producing "Total Drop", reconciling ledger against reality, exposing totals as authoritative. Those outputs were numerically correct within the system but **semantically false**: the system does not observe the full cash lifecycle (count room, inventory, custody handoffs), so any total it computes is necessarily partial.

Users interpreted partial numbers as final. That interpretation — not the math — is the failure mode.

This ADR records the scope boundary. It is a boundary ADR, not an implementation ADR.

---

# 2. Decision

## D1 — System Scope Is Operational Telemetry

The system provides:

* structured operational financial activity (Ledger + Operational classes, per ADR-FINANCIAL-FACT-MODEL)
* attribution where attribution is possible
* explicit visibility into completeness (what is known, what is not)

The system does **not** provide:

* financial truth
* drop calculations claimed as authoritative
* reconciled totals
* variance resolution

---

## D2 — No Authoritative Totals

The system MUST NOT produce outputs labeled as authoritative financial totals.

Specifically:

* no "Total Drop" exposed as a settled number
* no shift-end settlement values
* no "final" money position for a table, shift, or casino

Partial aggregates are permitted **only** when rendered with source, authority, and completeness labels (per ADR-FINANCIAL-EVENT-PROPAGATION §Surface).

---

## D3 — Reconciliation Is External

Reconciliation requires inputs the system does not observe:

* count room totals
* inventory counts
* cage custody handoffs
* physical cash movements

Therefore:

* the system **exposes data for reconciliation**
* the system **does not perform reconciliation**
* variance resolution logic is out of scope
* no "ledger vs reality" comparator is built

The system is one input to an external reconciliation process. It is not that process.

---

## D4 — Integration Point, Not Integration

A future external reconciliation layer may read from the system via the propagation layer (ADR-FINANCIAL-EVENT-PROPAGATION). This ADR defines the **point of integration** (consumer reads outbox events, both classes, with authority labels intact).

It does **not** define:

* the reconciliation algorithm
* who owns reconciliation
* what the authoritative external system is
* how variance is resolved

Those belong to whatever domain owns custody and count.

---

# 3. Consequences

## Positive

* Eliminates false-authority failure mode
* Keeps scope tractable for pilot
* Forces honest surface labeling (pushes D6 through the stack)
* Avoids accumulating accounting-domain complexity the system cannot honor

## Trade-offs

* Users asking "what's the drop?" will get "here's what was observed" — a different answer
* Stakeholders who expected a settlement number must be redirected to the external reconciliation process
* Pilot UX must invest in completeness indicators rather than hiding partial state behind a clean total

---

# 4. Rejected Alternatives

### ❌ Full accounting reconstruction inside the system

Rejected: the system lacks custody inputs. Building reconstruction produces incorrect totals with false authority and introduces accounting-domain complexity outside pilot scope.

### ❌ "Best-effort" reconciliation with a disclaimer

Rejected: a disclaimer on a total that looks authoritative is still misread as authoritative. The previous audit failure was exactly this pattern.

### ❌ Deferring the scope question to implementation

Rejected: scope creep is the original cause of the dual-truth drift. The boundary is set here, before the next implementation cycle.

---

# 5. Enforcement

This ADR is enforced by three downstream mechanisms:

1. **Surface Rendering Contract** (ADR-FINANCIAL-EVENT-PROPAGATION §Surface) — any financial surface MUST declare source, authority, completeness. A surface claiming "Total Drop" without those labels is non-conformant.
2. **Propagation contract** (ADR-FINANCIAL-EVENT-PROPAGATION) — `origin_label` is immutable in transit; a consumer cannot relabel `Observed` as `Actual`.
3. **Code review / ADR gate** — any feature proposing an authoritative total, a reconciliation step, or a variance resolution must amend or supersede this ADR first.

---

# 6. Out of Scope

* Schema-level enforcement of class discriminators (owned by ADR-FINANCIAL-FACT-MODEL)
* Surface rendering mechanics (owned by ADR-FINANCIAL-EVENT-PROPAGATION)
* Compliance domain (parallel ledger, not governed by this ADR)
* Future external reconciliation layer architecture

---

# 7. Closing Statement

The system's job is to tell the truth about what it observes — no more, no less.

> Financial truth originates from custody.
> The system is not custody.
> It is one witness among several.

What the system owes its users is a clear account of **what it saw** and **what it did not see**. Anything beyond that is someone else's responsibility.
