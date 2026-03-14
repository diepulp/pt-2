---
id: PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION-ALIGNMENT-ADDENDUM
title: "Phase 2 Optimization Alignment Addendum — Loyalty Entitlement Boundary Tightening"
status: Draft
date: 2026-03-13
related_to:
  - PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION
  - PHASE-2-SCOPE-REALIGNMENT
  - cross_property_player_recognition_loyalty_entitlement_scope_inset
purpose: Tighten Phase 2 language around cross-property loyalty entitlement so the slice remains aligned with real redemption behavior without drifting into raw ledger sharing.
---

# Phase 2 Optimization Alignment Addendum — Loyalty Entitlement Boundary Tightening

## Verdict

The current direction is broadly aligned, but a final tightening pass is still needed around **loyalty entitlement semantics**.

The architecture is now substantially correct:

- `player_loyalty` is part of the required cross-property entitlement surface
- `loyalty_ledger` remains too operational to expose raw across properties
- recognition remains distinct from operational telemetry
- local redemption remains the acting model

What remains unresolved is not the overall direction, but the **precision of the loyalty contract**.

---

## 1. Replace “local + sister property balances” with entitlement language

The current wording risks smuggling in a property-bucket mental model that may not reflect the intended business behavior.

If points are **redeemable across properties**, then the canonical Phase 2 concept should not casually default to:

- local balance
- sister-property balances

unless the product explicitly intends property-specific sub-balances as part of the user experience.

### Recommended replacement language

Use one of the following consistently:

- **company-usable loyalty entitlement**
- **portfolio redeemable balance**
- **company-recognized entitlement summary**

### Why this matters

Cross-property redemption can mean one of three different models:

1. **Single company redeemable balance**
2. **Per-property balances visible across the company**
3. **Hybrid model** — company total plus optional property breakdown

These are not interchangeable. The current wording leaves the contract ambiguous.

---

## 2. Treat `player_loyalty` as an entitlement-grain surface, not blanket full-row exposure

The argument for including `player_loyalty` should not be:

> the whole table is safe, therefore expose it

The stronger and more durable framing is:

> `player_loyalty` is the entitlement-grain table, and cross-property exposure must be limited to the minimum columns required for entitlement visibility and redemption decisions.

### Recommended constraint

Even if `player_loyalty` is Tier 1 and in scope, the Phase 2 surface may still be a **narrow projection**, not unrestricted full-row exposure.

### Why this matters

Fields such as preferences or other non-essential program metadata may not be needed for cross-property redemption. The boundary should be defined by **redemption necessity**, not by table membership.

---

## 3. Force a decision on the canonical redemption surface

Before ADR-044 is finalized, the project should explicitly decide which loyalty presentation model Phase 2 uses.

### Required decision

**What is the canonical redemption surface?**

#### Option A — Single company-usable balance
One redeemable total is presented and consumed under company policy.

#### Option B — Per-property balances visible cross-property
The interface shows separate balances or entitlements by casino, with local rules determining use.

#### Option C — Hybrid
One company-usable total is primary, with optional property-level provenance or breakdown.

### Recommendation

**Hybrid** is likely the most defensible long-term model, but the ADR must still freeze the exact contract.

Without this decision, the documentation remains aligned in spirit but mushy in implementation semantics.

---

## 4. Tighten the `loyalty_ledger` deferral language

The current deferral is directionally right, but it still leaves a loophole because `points_delta` makes people assume raw ledger exposure is required.

### Recommended wording

> Raw `loyalty_ledger` rows remain deferred.  
> If cross-property redemption UX later requires loyalty history or provenance, it must be introduced as a sanitized projection or derived summary — not as broad raw ledger sharing.

### Why this matters

This closes the recurrent argument:

> “but the ledger has the point deltas, so surely it must be in scope”

No.  
The presence of delta data does not justify cross-property exposure of campaign metadata, staff linkage, source linkage, visit linkage, notes, or raw operational provenance.

---

## 5. Make local redemption accounting explicit

The current direction correctly treats redemption as a **local workflow consuming company-recognized entitlement**, but this should be stated more bluntly.

### Recommended insertion

> Local redemption creates a local ledger event at the acting casino against company-recognized entitlement.  
> It does not expose or directly mutate sister-property ledger rows.

### Why this matters

This sentence closes off a dangerous misunderstanding: that cross-property entitlement somehow implies direct cross-casino mutation of another property’s ledger records.

That would be ugly, confusing, and unnecessarily risky.

---

## 6. Keep the final boundary sharp

The correct scope boundary is now:

### In Scope

- cross-property player recognition
- company-safe enrollment visibility
- company-usable loyalty entitlement
- local activation
- local redemption
- narrow derived safety or context signals

### Out of Scope

- staff multi-casino operation
- tenant switching
- raw cross-property operational telemetry
- raw cross-property financial transparency
- raw `loyalty_ledger` sharing
- raw `visit` sharing
- cross-property compliance row exposure

This is the boundary that must stay frozen.

---

## 7. Final recommendation

The optimization artifact should receive a small amendment that does the following:

1. Replaces balance wording with **entitlement wording**
2. Clarifies that `player_loyalty` may still be exposed as a **narrow projection**
3. Freezes the ADR decision on the **canonical redemption surface**
4. Clarifies that `loyalty_ledger` history, if ever needed cross-property, must be introduced only through **sanitized or derived projection**
5. States plainly that redemption is **locally executed against company-recognized entitlement**

---

## Summary

Phase 2 is now mostly aligned.

The remaining work is not directional correction but **contract sharpening**:

- define what cross-property loyalty entitlement actually looks like
- prevent table-level exposure from masquerading as business necessity
- keep raw provenance and operational internals locked down
- make local redemption accounting explicit

That final tightening is worth doing now, because otherwise the same loyalty scope argument will keep crawling back out of the grave.
