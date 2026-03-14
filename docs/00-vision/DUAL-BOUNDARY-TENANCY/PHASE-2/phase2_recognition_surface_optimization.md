
---
id: PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION
title: "Phase 2 Optimization — Minimal Recognition Surface for Cross-Property Player Discovery"
status: Draft
date: 2026-03-13
related_to:
  - PHASE-2-SCOPE-REALIGNMENT
  - CROSS-PROPERTY-PLAYER-SHARING-INVESTIGATION
  - ADR-043
purpose: Reduce Phase‑2 implementation complexity by limiting cross‑property access to the minimum recognition surface required for player discovery and local activation.
---

# Phase 2 Optimization — Minimal Recognition Surface

## Executive Summary

Phase 2 originally proposed introducing company‑scoped read capability across several player‑adjacent domains. While technically valid, this approach expands the RLS blast radius unnecessarily.

The **recognition workflow does not require broad company‑scoped visibility**. It only requires the system to answer three questions:

1. Does this player exist anywhere within the company?
2. Is the player already enrolled at the current casino?
3. If not, should staff activate the player locally?

These questions can be answered with a **minimal recognition surface** rather than a wide RLS rewrite.

Reducing Phase‑2 scope in this way lowers:

- RLS complexity
- policy regression risk
- implementation effort
- testing surface
- security audit scope

This document formalizes the optimization.

---

# Architectural Principle

Recognition crosses the company boundary.
Operations remain casino‑scoped.

Cross‑property functionality expands **visibility**, not **authority**.

---

# Recognition Workflow Requirements

The cross‑property recognition workflow must support the following flow:

staff lookup
     │
     ▼
company‑wide player search
     │
     ├─ A: Player active locally
     │       → continue normal workflow
     │
     ├─ B: Player exists elsewhere
     │       → prompt local activation
     │
     └─ C: Player not found
             → new patron onboarding

Operational activity always occurs within the current casino context.

app.casino_id = staff.casino_id

No context switching is introduced.

---

# Minimal Recognition Surface (Recommended)

Phase 2 should initially expose company‑scoped read access only for the following tables:

| Table | Purpose |
|-----|-----|
| `player` | Global player identity lookup |
| `player_casino` | Enrollment state across company casinos |

This surface allows the system to determine:

- whether a player exists
- which properties recognize the player
- whether the player is active locally

This is sufficient to implement **recognition and activation**.

---

# Optional Context Surface (Deferred)

A limited contextual read surface may optionally be added for host insight:

| Table | Usage |
|-----|-----|
| `visit` | Last visit summary or timeline |

However, if implemented, it should be exposed through a **derived summary surface**, not raw table exposure.

Example conceptual view:

player_company_recognition_v
    player_id
    full_name
    enrolled_casinos
    last_visit_timestamp
    active_locally

This prevents operational telemetry from leaking across casinos.

---

# Explicitly Deferred Domains

The following domains **must remain casino‑scoped during Phase 2**:

| Table | Reason |
|-----|-----|
| `rating_slip` | Casino‑specific operational telemetry |
| `loyalty_ledger` | Property‑specific reward accounting |
| `mtl_entry` | Jurisdictional compliance |
| `promo_coupon` | Property‑specific redemption rules |
| `player_financial_transaction` | Property‑scoped accounting context |

These domains represent **operational records**, not recognition context.

---

# RLS Implementation Pattern

Only the minimal recognition tables require dual‑mode read policies.

Example conceptual template:

SELECT policy:
    casino_id = app.casino_id
    OR casino.company_id = app.company_id

INSERT / UPDATE / DELETE:
    casino_id = app.casino_id

This preserves operational isolation.

---

# Implementation Scope Reduction

## Original Broad Scope

Rewrite policies across multiple domains:

- player_casino
- visit
- loyalty
- financial
- additional player domains

High complexity and security blast radius.

## Optimized Scope

Introduce company‑scoped reads only for:

- player
- player_casino

Optional derived context:

- recognition summary view

All other domains remain unchanged.

---

# Benefits

This optimization produces significant reductions in effort.

| Dimension | Impact |
|-----|-----|
| RLS policies modified | drastically reduced |
| testing scope | reduced |
| security audit surface | reduced |
| migration complexity | reduced |
| regression risk | reduced |

Estimated reduction in Phase‑2 implementation effort:

~70–80% compared to full domain RLS expansion.

---

# Future Expansion (If Needed)

Broader company‑scoped visibility may later support:

- portfolio loyalty summaries
- cross‑property analytics
- corporate host dashboards
- portfolio‑level player reports

These capabilities should be introduced only when the business case exists.

They belong to a **separate architectural phase**, not the recognition MVP.

---

# Governance Rule

Phase 2 must follow this constraint:

Cross‑property visibility must expose only the minimal information required for recognition and activation.

If a proposed change expands visibility beyond recognition context, it must be deferred to a future ADR.

---

# Final Recommendation

Define Phase 2 as:

1. Company‑scoped player identity lookup
2. Enrollment detection via `player_casino`
3. Audited local activation
4. No operational cross‑property mutation

Everything else is enhancement and should not block the recognition capability.
