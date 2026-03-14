---
id: PHASE-2-LOYALTY-ACCRUAL-REDEMPTION-ALIGNMENT
title: "Phase 2 Loyalty Alignment Addendum — Accrual and Redemption Semantics"
status: Draft
date: 2026-03-13
related_to:
  - PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION
  - PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION-ALIGNMENT-ADDENDUM
  - cross_property_player_recognition_loyalty_entitlement_scope_inset
purpose: Make explicit that if loyalty redemption is cross-property, then loyalty accrual must update a company-visible entitlement surface while raw ledger provenance remains property-scoped.
---

# Phase 2 Loyalty Alignment Addendum — Accrual and Redemption Semantics

## Purpose

This addendum tightens the Phase 2 loyalty contract by making explicit a consequence that is currently only implied:

> **If loyalty entitlement is redeemable across properties, then loyalty accrual at either property must update a company-visible entitlement surface that is globally available within the same company boundary.**

Without this rule, cross-property redemption becomes inconsistent or misleading.

---

## Core Clarification

There are two different loyalty concerns in this effort:

### 1. Entitlement Effect

This is the company-usable loyalty state the player actually has available.

Examples:

- current redeemable balance
- tier or status relevant to redemption
- redemption eligibility under company policy
- any company-usable aggregate entitlement exposed by Phase 2

This entitlement state must be visible across the company boundary.

### 2. Operational Provenance

This is how the entitlement changed.

Examples:

- `loyalty_ledger.points_delta`
- campaign linkage
- staff linkage
- visit linkage
- source linkage
- notes and metadata
- property-specific accrual context

This provenance remains property-scoped unless separately introduced through a narrow sanitized projection.

---

## Accrual and Redemption Rule

The correct Phase 2 loyalty rule is:

> **Accrual and redemption both execute locally. Their economic effect updates company-recognized entitlement. Their raw operational provenance remains property-scoped.**

This applies symmetrically.

### Local Accrual

When a player action at Casino A or Casino B earns points:

- the accrual event is recorded locally at the acting property
- the resulting entitlement state must update so it is visible company-wide
- staff at sister properties must be able to rely on the updated entitlement for valid redemption decisions

### Local Redemption

When a player redeems points at Casino A or Casino B:

- the redemption event is recorded locally at the acting property
- the resulting entitlement state must update so it is visible company-wide
- sister properties must see the reduced or adjusted entitlement state

---

## What Must Be Globally Available

If cross-property loyalty is in scope, the following must be globally available at the entitlement layer:

- company-usable redeemable balance
- any redemption-relevant tier or status
- redemption eligibility signals needed for local workflows
- updated entitlement after accrual at any sister property
- updated entitlement after redemption at any sister property

This is what makes cross-property loyalty behavior economically truthful.

---

## What Does NOT Automatically Become Global

The following do not automatically become cross-property-readable merely because accrual and redemption affect global entitlement:

- raw `loyalty_ledger` rows
- campaign internals
- visit-linked provenance
- rating-slip linkage
- source identifiers
- staff attribution
- raw notes or metadata
- broad operational loyalty history

This remains property-scoped operational provenance.

---

## Surface Boundary

### Company-Visible Entitlement Surface

Phase 2 should expose a company-safe entitlement surface through:

- `player_loyalty`, or
- a narrow loyalty entitlement projection / RPC

This surface should answer:

- how much value the player can use
- whether that value is usable here
- what redemption-relevant status applies
- whether recent accrual or redemption has changed the usable entitlement

### Property-Scoped Provenance Surface

The following remain property-scoped unless separately approved:

- raw `loyalty_ledger`
- raw promotional history
- raw accrual event chains
- property-specific operational loyalty internals

---

## Accounting Semantics

The write model should remain explicit:

- accrual creates a local ledger event at the acting casino
- redemption creates a local ledger event at the acting casino
- neither action requires broad readable access to sister-property ledger rows
- the company-visible entitlement surface is what reflects the resulting economic state

This avoids the mistaken interpretation that cross-property loyalty requires raw cross-casino operational sharing.

---

## Implementation Implication

Phase 2 must state plainly that:

> **A loyalty event created at either casino updates a company-visible entitlement state that is globally available for cross-property redemption decisions.**

If this is not explicit in the ADR or optimization artifact, the contract remains incomplete.

---

## Scope Integrity Rule

This clarification does not broaden Phase 2 into raw cross-property loyalty provenance sharing.

It only freezes the correct economic behavior:

- local accrual
- local redemption
- company-visible entitlement effect
- property-scoped provenance

Any proposal to use this rule as justification for raw row-level `loyalty_ledger` sharing exceeds the scope of this effort.

---

## Summary

If Phase 2 includes cross-property loyalty redemption, then it must also include the following truth:

- accrual at either property updates the player’s company-visible entitlement
- redemption at either property updates the player’s company-visible entitlement
- staff across sister properties may rely on that entitlement state
- raw loyalty provenance remains property-scoped unless separately projected

This keeps the loyalty contract coherent without collapsing the operational boundary.
