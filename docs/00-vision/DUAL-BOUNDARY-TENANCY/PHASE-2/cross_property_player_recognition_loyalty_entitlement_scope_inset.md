# Scope Alignment Inset — Cross-Property Player Recognition and Loyalty Entitlement

**Purpose**

This inset realigns the current effort to the actual business capability under discussion: **cross-property player recognition plus cross-property loyalty entitlement** within the same company boundary. It replaces the narrower framing that treated the effort as recognition-only and prevents a second form of scope distortion: treating loyalty entitlement as justification for broad cross-property exposure of operational, financial, or compliance telemetry.

---

## Core Objective

The objective of this effort is:

> **Allow staff at Casino B to recognize a player enrolled at Casino A, view the player's company-usable loyalty entitlement, and locally redeem or act on that entitlement where company policy permits, when both casinos belong to the same company.**

This capability supports:

- patron recognition across sister properties
- local determination of whether the player is already enrolled at the current property
- visibility into redeemable loyalty balance or entitlement status across company properties
- prompted local activation when the player is not yet active at the current property
- local redemption workflows governed by company loyalty policy and current-property controls

It **does not** authorize staff to operate as another casino or expose another casino's operational internals.

---

## Architectural Principle

**Recognition and loyalty entitlement may cross the company boundary.  
Operational telemetry, financial records, and compliance records do not.**

Cross-property capability applies to:

- **identity recognition**
- **enrollment visibility**
- **loyalty entitlement visibility**
- **narrow derived safety or context signals**

Operational activities remain strictly **casino-scoped**, even when they consume company-level entitlement.

---

## Clarifying the Scope

This effort is **not** merely about discovering that a player exists elsewhere.

Recognition alone answers:

- who the player is
- whether the player is known within the company
- where the player is enrolled

Recognition alone does **not** answer:

- what the player has earned
- what the player may redeem
- whether redemption is allowed at this property
- whether sister-property safety flags should affect the local workflow

Because the intended business behavior includes **cross-property loyalty redemption or use**, the scope must include **loyalty entitlement** in addition to player recognition.

---

## In-Scope Capabilities

### 1. Cross-Property Player Recognition

Staff at Casino B may:

- look up a player across the company boundary
- determine whether the player already exists under the same company
- determine whether the player is already active or enrolled locally
- view limited company-safe recognition context

### 2. Cross-Property Loyalty Entitlement

Staff at Casino B may:

- view a company-usable loyalty balance, entitlement state, or redemption-eligible summary
- determine whether the player has rewards value that may be used locally under company policy
- perform local workflows that consume or redeem company-recognized entitlement, where permitted

### 3. Prompted Local Activation

If the player exists elsewhere in the company but is not yet active at Casino B, the system may support:

- explicit local activation
- creation of Casino B-local enrollment or operational context
- local continuation into gaming or loyalty flows

### 4. Narrow Derived Signals

The recognition / entitlement surface may include tightly constrained derived signals such as:

- `last_company_visit` (scalar only)
- `has_sister_property_exclusions`
- `max_exclusion_severity`
- local-eligibility or redemption-eligibility flags

These signals exist to support safe local decisions without exposing raw cross-property operational records.

---

## Explicit Non-Goals

The following remain **out of scope** for this effort.

### 1. Multi-Casino Staff Operations

The system will **not** support:

- staff switching active casino context
- staff operating as another property
- tenant switching UI
- multi-casino operational sessions
- staff performing another casino's operational actions

Staff remains bound to the current property's operational context.

### 2. Cross-Property Operational Telemetry Exposure

The system will **not** expose raw cross-property operational rows such as:

- `visit` rows
- `rating_slip`
- `loyalty_ledger`
- `pit_cash_observation`
- `player_financial_transaction`
- `mtl_entry`
- property-specific notes, tags, or internal workflows

These remain property-scoped operational or compliance data.

### 3. Cross-Property Financial Transparency

Cross-property loyalty entitlement does **not** imply broad visibility into:

- buy-ins
- cash-outs
- money movement history
- casino-specific accounting records

Loyalty entitlement and gaming-money accounting are separate trust classes.

### 4. Shared Mutable Operational State

The system will not treat another property's live operational rows as shared mutable state.

Recognition and entitlement may inform local action.  
They do not convert another property's operational records into company-global working data.

---

## Required Surface Types

The Phase 2 surface should be understood as a **Recognition + Entitlement** surface, not a broad company-scoped read surface.

### Required

- `player` — global identity
- `player_casino` — company enrollment visibility
- `player_loyalty` — company-usable loyalty entitlement or tightly controlled loyalty balance projection

### Allowed via Derived / Narrow Extraction

- `last_company_visit` scalar
- exclusion warning flag(s)
- redemption eligibility signal
- other tightly scoped computed outputs required for safe local decisions

### Not Broadly Exposed

- raw `visit`
- raw `loyalty_ledger`
- raw `player_financial_transaction`
- raw compliance or table telemetry surfaces

---

## Staff Context Remains Single-Casino

During this effort:

`app.casino_id = staff.casino_id`

No tenant switching mechanism is introduced.

Staff at Casino B remains **Casino B staff** throughout the workflow.

Cross-property visibility expands the **read and entitlement horizon**, not the staff's operational identity.

---

## Operational Rule

All mutations remain local in execution, even when they consume company-recognized entitlement.

That means:

- activation happens at the current property
- redemption is executed through the current property's workflow
- local audit events are recorded at the acting property
- company-level entitlement is consumed or checked through controlled loyalty rules, not by exposing another property's ledger internals

---

## Security and Data-Boundary Rule

This effort must follow the following invariant:

> **Cross-property expansion must expose only the minimum identity, entitlement, and derived-signal surface required to support recognition and local redemption. It must not expose raw operational, financial, or compliance telemetry across properties.**

If a proposal requires broad row-level access to another property's operational tables, it exceeds the scope of this effort and must be escalated into a separate architectural decision.

---

## Workflow Shape

The intended workflow is:

1. Staff at Casino B performs player lookup
2. System resolves player within the company boundary
3. System returns:
   - player identity
   - enrollment visibility
   - local activation state
   - loyalty entitlement / redeemable balance summary
   - narrow safety signals where needed
4. Staff either:
   - proceeds normally if already active locally
   - activates locally if found elsewhere but not active locally
   - redeems or uses allowed entitlement through Casino B-local workflows
   - falls back to standard onboarding if not found

At no point does staff switch into Casino A's operational context.

---

## Future Work (Explicitly Deferred)

The following may be explored later, but are **not part of the current effort**:

- multi-casino staff operational access
- tenant switching
- raw cross-property operational dashboards
- cross-property financial detail views
- cross-property ledger inspection
- company-global operational supervision surfaces

Any such expansion requires a separate ADR and security review.

---

## Scope Integrity Rule

All implementation work must satisfy the following rule:

> **This effort expands player recognition and loyalty entitlement only. It does not expand staff operational authority or expose raw sister-property operational data.**

Any proposal that causes the current effort to drift into staff multi-casino operation, broad operational telemetry exposure, or cross-property financial transparency is out of scope.

---

## Summary

This effort introduces:

- **cross-property player recognition**
- **cross-property loyalty entitlement visibility**
- **local activation where needed**
- **local redemption using company-recognized entitlement**

This effort does **not** introduce:

- staff switching casinos
- broad cross-property operational reads
- cross-property financial transparency
- shared mutable operational state across properties

Maintaining this boundary allows the system to support real portfolio loyalty behavior without turning the platform into a sloppy cross-property free-for-all.
