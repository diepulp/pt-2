---
id: ADR-044-PRE-DECISION-FREEZE-INSET
title: "ADR-044 Pre-Decision Freeze Inset — Activation, Exclusion, Redemption, and Surface Contract"
status: Draft
date: 2026-03-13
related_to:
  - PHASE-2-SCOPE-REALIGNMENT
  - PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION
  - PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION-ALIGNMENT-ADDENDUM
  - PHASE-2-LOYALTY-ACCRUAL-REDEMPTION-ALIGNMENT
purpose: Freeze the key open decisions that must be settled before ADR-044 formulation so the Phase 2 contract is explicit and internally consistent.
---

# ADR-044 Pre-Decision Freeze Inset — Activation, Exclusion, Redemption, and Surface Contract

## Purpose

This inset freezes the remaining high-impact decisions that must be resolved before ADR-044 is formulated.

These decisions govern:

- how a player is locally activated
- how sister-property exclusions affect the workflow
- how cross-property loyalty redemption is executed
- what loyalty redemption surface staff actually sees

Without freezing these decisions, the ADR remains vulnerable to ambiguity in workflow, accounting semantics, and user-visible contract.

---

## Decision Summary

| Decision | Freeze |
|---|---|
| **D3 — Activation RPC** | **Use a new dedicated audited activation RPC** |
| **D5 — Exclusion UX Policy** | **Use severity-based escalation** |
| **D6 — Redemption Mechanics** | **Use a dedicated atomic local redemption RPC against company-visible entitlement** |
| **D7 — Canonical Redemption Surface** | **Use Hybrid: company total primary, property breakdown secondary** |

---

## D3 — Activation RPC

### Decision

**Freeze D3 as: Use a new dedicated audited activation RPC.**

Recommended contract shape:

`rpc_activate_player_locally(p_player_id, ...)`

### Rationale

Local activation is not just a generic `player_casino` insert.  
It is a distinct business action with its own intent and audit meaning.

A dedicated RPC is preferred because it:

- captures the explicit intent to activate a player at the current property
- creates a first-class audit event
- provides one choke point for exclusion checks, idempotency, and local validation
- avoids every caller inventing its own activation semantics through direct inserts

### Rejected Direction

**Do not treat local activation as a raw extension of generic `player_casino` insert behavior.**

That approach hides intent, fragments validation, and weakens audit clarity.

---

## D5 — Exclusion UX Policy

### Decision

**Freeze D5 as: Use severity-based escalation.**

### Policy

| Severity | Workflow |
|---|---|
| `hard_block` | Block activation and redemption |
| `soft_alert` | Require elevated-role override |
| `monitor` | Warn only; allow normal flow |
| `null` | No exclusion intervention |

### Rationale

A single universal policy is too blunt.

- **Warn only** is too weak for serious sister-property exclusions
- **Always block** is too rigid for lower-severity or informational flags
- **Severity-based escalation** preserves safety while keeping the workflow operationally usable

This aligns with the existing direction of surfacing derived exclusion signals such as:

- `has_sister_property_exclusions`
- `max_exclusion_severity`

without exposing raw exclusion details cross-property.

---

## D6 — Redemption Mechanics

### Decision

**Freeze D6 as: Use a dedicated atomic local redemption RPC that debits company-visible entitlement and records a local event at the acting casino.**

### Required Behavior

The redemption mechanism must:

1. validate local eligibility and exclusion policy
2. validate available company-visible entitlement
3. atomically debit the entitlement with a balance guard
4. write a local ledger or audit event at the acting casino
5. return the updated entitlement state for immediate cross-property consistency

### Important Clarification

A statement like:

`UPDATE player_loyalty SET current_balance = current_balance - p_amount WHERE current_balance >= p_amount`

is **necessary but not sufficient**.

The actual contract is not “run a balance update.”  
The actual contract is:

- perform a controlled local redemption action
- debit company-recognized entitlement atomically
- emit the proper local accounting and audit event

### Accounting Rule

Redemption is executed **locally**, but its economic effect updates **company-visible entitlement**.

It does **not** imply direct readable or mutable access to sister-property ledger rows.

---

## D7 — Canonical Redemption Surface

### Decision

**Freeze D7 as: Hybrid redemption surface.**

### Canonical Presentation Model

The user-visible redemption surface should present:

1. **Primary value:** one company-usable redeemable total
2. **Secondary detail:** optional per-property breakdown or provenance summary

### Why Hybrid Wins

A single total is operationally necessary because staff needs a fast answer to:

> “How much value can this player use here?”

But in some contexts, limited property-level breakdown remains useful for:

- support explanation
- portfolio awareness
- reconciliation context
- program understanding

The Hybrid model preserves both truths without forcing the UI into either extreme.

### Rejected Extremes

#### Reject Option A — Single total only
Too opaque for cases where limited provenance or property distribution matters.

#### Reject Option B — Per-property balances only
Too fragmented for an actual cross-property redemption workflow and too likely to drag the surface back into property-bucket thinking.

---

## Governing Loyalty Rule

The following rule must be carried into ADR-044:

> **Accrual and redemption execute locally, but their economic effect updates company-visible entitlement; raw loyalty provenance remains property-scoped unless separately projected.**

This rule binds D6 and D7 together and prevents the architecture from drifting into raw cross-property ledger sharing.

---

## Implementation Guardrail

These decisions do **not** authorize:

- tenant switching
- staff multi-casino operation
- raw cross-property `loyalty_ledger` sharing
- raw cross-property `visit` sharing
- raw cross-property financial transparency
- direct mutation of sister-property operational rows

They authorize only:

- explicit local activation
- severity-aware exclusion handling
- local redemption against company-visible entitlement
- a hybrid loyalty surface for staff use

---

## Summary

ADR-044 should proceed with the following frozen posture:

- **D3:** new dedicated audited activation RPC
- **D5:** severity-based exclusion policy
- **D6:** dedicated atomic local redemption RPC with local event write
- **D7:** hybrid redemption surface with company total primary and property breakdown secondary

These freezes give the upcoming ADR a stable contract for workflow, loyalty accounting, and user-visible semantics.
