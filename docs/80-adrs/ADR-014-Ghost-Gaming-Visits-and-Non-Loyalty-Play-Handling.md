# ADR: Ghost Gaming Visits & Non-Loyalty Play Handling

**Status:** Accepted
**Date:** 2025-12-05
**Context:** PT-2 – VisitService, RatingSlip, Loyalty, Finance, MTL
**Implementation:** EXEC-VSE-001 (Visit Service Evolution)

---

## 1. Problem Statement

Operations surfaced an edge case:

> A player without a record in the system (a **ghost player**, i.e., no `player` row and no loyalty account) sits down and plays. There is gaming activity and potentially significant cash movement, but the patron is not enrolled in loyalty.

The system must:

- Track **all gaming activity** for compliance (MTL, CTR, AML) and finance.  
- Avoid **inappropriately accruing loyalty** for patrons who are not enrolled.  
- Maintain a coherent and simple mental model for Visit, RatingSlip, Loyalty, Finance, and MTL.

Previously, we modeled visits mainly in terms of “reward-only” vs “gaming-rated”, implicitly assuming the existence of a Player record. Ghost play forces us to separate **identity**, **engagement**, and **loyalty eligibility** more clearly.

---

## 2. Core Domain Decision

We recognize three distinct business scenarios:

1. **Reward-only, identified**
   - Patron exists as a `player`.
   - No gaming occurs.
   - Visit is used for loyalty redemptions, comps, vouchers, customer care.
   - **No gaming telemetry** is attached to the visit.

2. **Gaming, identified, rated**
   - Patron exists as a `player`.
   - Patron plays; chips are in action.
   - Visit is used for **rated play**, feeding Loyalty, Finance, and Compliance.

3. **Gaming, unregistered / ghost (compliance-only)**
   - Patron has **no Player record** at the time of play.
   - Patron plays; chips are in action.
   - Visit is required for **Compliance and Finance**, *not* for Loyalty.

The fundamental **business rule**:

> VisitService is responsible for tracking **all gaming sessions**, regardless of whether the patron has a Player record. Loyalty is layered on top and applies only where the patron is identified and the visit is explicitly marked as eligible for rating.

---

## 3. Conceptual Dimensions of a Visit

To reason about the Visit more robustly, we make three conceptual dimensions explicit:

1. **Identity scope** – How well we know the patron:
   - `identified` – the visit is tied to an existing `player` row.
   - `ghost` – there is no `player` row; the patron is not enrolled at the time of play.

2. **Engagement mode** – What the visit is used for:
   - `reward` – loyalty / customer-care actions, **no gaming**.
   - `gaming` – actual gaming activity (chips in action, table occupancy).

3. **Loyalty rating eligibility** – Whether the visit participates in loyalty accrual:
   - `rated` – telemetry may generate points, comps, or other loyalty value.
   - `unrated` – telemetry is tracked for Compliance/Finance only; **no** automatic loyalty accrual.

For PT-2, we **do not** expose all combinations. Instead, we define three allowed **visit archetypes**:

| Archetype                         | Identity scope | Engagement | Loyalty rating |
|----------------------------------|----------------|-----------|----------------|
| Reward-only visit (identified)   | identified     | reward    | n/a (no play)  |
| Gaming visit (identified, rated) | identified     | gaming    | rated          |
| Ghost gaming visit (unrated)     | ghost          | gaming    | unrated        |

All other combinations are either future scope or explicitly disallowed for PT-2.

---

## 4. Visit Archetypes (Narrative)

### 4.1. Reward-Only Visit (Identified)

- Patron is known and has a `player` record.
- Use cases:
  - Comp/voucher redemptions.
  - Point redemptions.
  - Service adjustments, courtesy benefits, customer care interactions.
- **No gaming telemetry** (no `rating_slip`) is allowed on this visit.
- Loyalty:
  - Can redeem or adjust points.
  - No play-based accrual (because no gaming occurs).

### 4.2. Gaming Visit (Identified, Rated)

- Patron is known and has a `player` record.
- Patron is actively playing; chips are in action at one or more tables.
- This visit is **gaming-rated**:
  - RatingSlipService records play telemetry (average bet, rounds, theoretical win, etc.).
  - LoyaltyService accrues points/benefits according to config and rules.
  - PlayerFinanceService records in/out, buy-ins, cash-outs tied to the visit.
  - MTL/Compliance can use the visit and its associated telemetry as a grain for risk and CTR rules.

### 4.3. Ghost Gaming Visit (Unrated, Compliance-Only)

- Patron is **not enrolled** and has no `player` record at the time of play.
- Patron sits and plays; we must track:
  - Chips in action.
  - Buy-ins and cash-outs.
  - Table occupancy and duration.
- Visit is a **ghost gaming visit**:
  - Identity scope = `ghost` (no player_id).
  - Engagement = `gaming`.
  - Rating = `unrated` (no loyalty accrual).
- Downstream usage:
  - FinanceService uses the visit to tie together cash movement and exposure.
  - MTL/Compliance uses the visit for CTR/AML rules and suspicious-activity detection.
  - RatingSlipService may still capture telemetry, but only for **non-loyalty** purposes.
  - LoyaltyService does **not** accrue points from ghost visits.

> Compliance does not depend on loyalty enrollment. Ghost gaming visits must be tracked with the same rigor as identified play, using the best available identifiers (casino, table, timestamps, seat, notes). Where legally required, CTR/MTL entries can be filed even if the patron has no loyalty account.

---

## 5. Bounded Context Evolution (High-Level)

### 5.1. VisitService

**Before:**  
VisitService implicitly assumed most visits involved identified players and overlaid “reward-only vs gaming-rated” largely on top of that assumption.

**After:**  
VisitService explicitly supports:

- **Reward-only identified visits** for loyalty redemptions with no gaming.  
- **Gaming-rated identified visits** for standard rated play.  
- **Ghost gaming visits** for non-loyalty, compliance-only play.

High-level responsibilities:

- Track **all visits**, regardless of identity scope.
- Provide a consistent “session anchor” for Finance and MTL (cash and compliance).
- Provide a filtered subset of visits (identified + rated gaming) as the foundation for Loyalty accrual.

### 5.2. RatingSlipService

RatingSlipService’s role becomes twofold:

1. **Rated telemetry** – when attached to identified, gaming-rated visits, play telemetry drives loyalty and performance metrics.
2. **Compliance-only telemetry** – when attached to ghost gaming visits, telemetry documents action, exposure, and risk, but is **explicitly excluded** from loyalty accrual.

Conceptually:

- A “rating slip” is a vehicle for capturing **play telemetry**.  
- Whether this telemetry drives loyalty is determined by:
  - The identity scope and engagement mode of the parent visit.
  - High-level business rules in LoyaltyService.

### 5.3. LoyaltyService

Loyalty accrual rules operate **only** on visits that satisfy **all** of the following:

1. Identity: `identified` (visit is tied to a Player).  
2. Engagement: `gaming`.  
3. Rating eligibility: `rated` (visit is marked as eligible for loyalty).

Implications:

- Reward-only identified visits:
  - Can be used for **redemptions** and adjustments.
  - Generate **no play-based accrual** because they have no gaming telemetry.
- Ghost gaming visits:
  - Are visible for **reporting and audit**, but do **not** trigger automated accrual rules.
  - Any retroactive loyalty treatment (e.g., comping after the fact) is a manual, supervised process, not an automatic consequence of telemetry.

### 5.4. PlayerFinanceService

FinanceService treats **all visits with cash movement** as in-scope, regardless of identity scope or rating eligibility.

- Identified, gaming-rated visits:
  - Standard gaming financial flow (buy-in, chips issued, cash-out, marker redemption, etc.).
- Reward-only identified visits:
  - Redemptions and adjustments that affect balances but do not include gaming.
- Ghost gaming visits:
  - Support full financial tracking for non-enrolled patrons:
    - Buy-in and cash-out events are still recorded.
    - CTR thresholds and cash-intensity patterns are still computable.

### 5.5. MTL / Compliance

MTL/Compliance operates on a simple principle:

> Any combination of **gaming activity** and/or **cash movement** is subject to compliance oversight, regardless of identity scope or loyalty status.

Therefore:

- Identified gaming-rated visits:
  - Fully visible; carry both play and financial data.
- Reward-only identified visits:
  - Relevant when unusually large redemptions or adjustments occur.
- Ghost gaming visits:
  - **First-class citizens** in compliance:
    - Gaming activity, exposure, and financial movement are all tracked.
    - CTR, SAR, and custom MTL rules can be evaluated even when the patron is not in loyalty.

---

## 6. Lifecycle & Conversion Rules (High-Level)

### 6.1. Creation Paths

We recognize three creation flows:

1. **Reward-only (identified)**
   - Staff recognizes or looks up an existing Player.
   - Creates a **reward-only identified** visit.
   - No rating or gaming telemetry attached.

2. **Gaming (identified, rated)**
   - Patron is enrolled and presents a card or otherwise identified.
   - Creates a **gaming-rated identified** visit.
   - RatingSlip, Loyalty, Finance, and MTL all attach to this visit.

3. **Gaming (ghost, compliance-only)**
   - Patron is not enrolled and chooses not to create an account.
   - Creates a **ghost gaming visit**:
     - Minimal identity (table, seat, time, optional free-form notes).
     - Telemetry and cash movement are tracked for Finance and MTL.
     - Visit is **unrated** for loyalty purposes.

### 6.2. Conversion Scenarios

There are two conceptually important conversion paths:

1. **Reward-only → Gaming-rated (identified)**  
   - Allowed; one-way; must occur while the visit is active.  
   - Represents a patron who comes for redemption / service and then **starts playing**.  
   - After conversion, RatingSlipService can attach rated telemetry and Loyalty can accrue.

2. **Ghost gaming → Identified / Rated (back-office, optional)**  
   - A patron may later enroll or be matched to an existing Player.  
   - For PT-2, we define a conservative stance:
     - Association of a ghost visit to a Player (if allowed) is a **manual, supervised operation**, with full audit.
     - It does **not automatically** re-run loyalty accrual or grant retroactive rewards.
     - Any comping based on ghost play is at supervisor discretion, not a default behavior of the system.

This preserves a clear separation between **operational flexibility** (we can track everything) and **loyalty integrity** (points are granted under controlled, auditable conditions).

---

## 7. SRM-Level Language (Suggested Additions)

### 7.1. VisitService Section

> **Ghost Gaming Visits (Compliance-Only)**  
> VisitService supports visits for patrons without a Player record (“ghost players”). These visits:
>
> - Track gaming activity and financial movements for compliance and operational reporting.
> - Are marked as **unrated** and are not eligible for automated loyalty accrual.
> - May, subject to business rules, later be associated with a Player record through a supervised back-office operation, but such association does not implicitly grant retroactive rewards.
>
> VisitService also supports:
>
> - **Reward-only identified visits** used solely for loyalty redemptions and customer service with no gaming activity.
> - **Gaming-rated identified visits** used for standard rated play, feeding Loyalty, Finance, and Compliance.
>
> This ensures that all gaming and financial activity is captured within a consistent visit model, while loyalty remains an opt-in layer on top of identified, explicitly rated visits.

### 7.2. LoyaltyService Section

> **Loyalty Eligibility**  
> Loyalty accrual rules operate only on **identified, gaming-rated visits**:
>
> - The visit must be associated with a Player.
> - The visit must represent gaming activity.
> - The visit must be explicitly marked as rated.
>
> Ghost gaming visits and reward-only visits are visible for audit and reporting but do not trigger automated accrual. Any retroactive loyalty treatment for ghost visits is a manual supervisor action, recorded via audit logging and not driven directly by telemetry.

---

## 8. Next Steps (Design, Not Implementation)

1. **Document the Identity/Rating Matrix**
   - Add a small table (like the one in §3) to the SRM or VisitService ADR.
   - Explicitly mark green (supported), grey (future), and red (disallowed) combinations.

2. **Align Bounded Context Docs**
   - Update VisitService, RatingSlipService, LoyaltyService, FinanceService, and MTL sections to reference:
     - Reward-only identified visits.
     - Gaming-rated identified visits.
     - Ghost gaming visits.
   - Clarify which visit archetypes each service reads from and writes to.

3. **Capture Business & Regulatory Constraints**
   - Write a focused ADR:
     - “Ghost Gaming Visits and Non-Loyalty Play Handling” (this document).
     - Emphasize the separation between **tracking everything** for compliance and **limiting loyalty** to identified, rated cases.
     - Include back-office/manual processes for optional ghost → Player association.

4. **Prepare for Schema & Service Updates**
   - Once these decisions feel stable on paper, implementation steps can follow:
     - Schema adjustments to reflect identity scope and rating eligibility.
     - Visit creation/conversion APIs aligned with the three archetypes.
     - RatingSlip, Loyalty, Finance, and MTL behaviors updated to respect these high-level rules.

This ADR should serve as the conceptual backbone for handling ghost players and non-loyalty play in PT-2, ensuring that compliance and operational needs are met without compromising loyalty integrity or overcomplicating the Visit model.
