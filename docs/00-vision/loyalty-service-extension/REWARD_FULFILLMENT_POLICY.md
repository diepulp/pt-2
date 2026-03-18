# Reward Fulfillment Policy
**Project:** Casino Player Tracker  
**Status:** Pilot policy artifact  
**Purpose:** Define when loyalty rewards must produce a printable artifact, what kind of artifact they produce, and what record constitutes operational truth.

---

## Why this policy exists

The loyalty domain currently risks confusion between:

- reward decision
- ledger activity
- coupon issuance
- slip generation
- printing
- fulfillment

Without an explicit fulfillment policy, implementation will drift into gibberish:

- printing rewards that should not be printed
- treating slips and coupons as interchangeable
- routing all reward types through one fake-unified path
- failing to produce a physical artifact where downstream custody requires one
- confusing accounting truth with operator/patron artifact truth

This policy exists to stop that.

---

## Governing principle

> Printing is a fulfillment attribute, not a loyalty-wide invariant.

However, for this pilot, the practical rule is also:

> Internal/admin-only loyalty adjustments default to no print. All player-facing reward instruments are printable because they must be validated through a downstream custody chain.

That downstream custody chain includes, broadly:

- wait staff
- dealers
- cashiers
- cage staff
- other operational recipients who must inspect, accept, or honor the instrument

If a reward must be presented to another actor to be honored, it is printable for pilot purposes.

---

## Structural split

The system must recognize two different structural families for player-facing loyalty rewards.

### 1. `points_comp` family
**Mechanism:** ledger debit → comp slip

This family represents loyalty value being consumed to authorize a comp-like benefit.

Examples:
- meal comp
- beverage comp
- misc comp
- cigarette comp
- future comp kinds using free-text kind

This family is grounded in:
- a loyalty/ledger accounting event
- an operational slip artifact used by custody recipients

### 2. `entitlement` family
**Mechanism:** coupon issuance → printed coupon

This family represents issuance of a discrete redeemable entitlement.

Examples:
- match play
- free play

This family is grounded in:
- an issuance record
- a coupon artifact used for presentation and redemption

### 3. `internal_adjustment` family
**Mechanism:** internal/admin adjustment → no printed artifact

This family represents internal-only loyalty changes not intended for downstream honoring by a custody recipient.

Examples:
- manual balance correction
- admin-only goodwill adjustment
- reconciliation entry
- internal ledger correction

---

## Canonical distinctions

These terms must not be used interchangeably.

### Reward
The business decision that value or entitlement has been granted.

### Ledger debit
The accounting event recording value consumption for a `points_comp` reward.

### Comp slip
The printable operational artifact associated with a `points_comp` reward.

### Coupon issuance
The system event recording creation of an `entitlement` reward.

### Coupon
The printable operational artifact associated with an `entitlement` reward.

### Print
A fulfillment channel that produces the artifact required for downstream validation.

### Fulfillment
The act of making the reward operationally usable in the real world.

---

## Policy baseline

### Default rule
For pilot purposes:

- **internal/admin-only loyalty adjustments** default to **no print**
- **all player-facing reward instruments** are **printable**
- printing exists because downstream custody must validate the instrument before honoring it

This means the system must not assume that “loyalty” itself implies print.

Instead, the system must evaluate whether the reward is:

- internal/admin-only, or
- player-facing and custody-validated

If it is player-facing and must be honored by another actor, it is printable.

---

## Fulfillment classification model

Every loyalty action or reward type must declare the following:

### 1. Family
- `points_comp`
- `entitlement`
- `internal_adjustment`

### 2. Artifact type
- `comp_slip`
- `coupon`
- `none`

### 3. Print policy
- `required`
- `optional`
- `forbidden`

### 4. Operational truth
The record that makes the reward real.

Examples:
- ledger debit
- coupon issuance record
- internal adjustment record

### 5. Custody validation path
Who must inspect, accept, or redeem the instrument.

Examples:
- wait staff
- cashier
- dealer
- cage
- internal admin only

---

## Pilot fulfillment rules by family

### A. `points_comp` family

#### Definition
A player-facing comp backed by loyalty value consumption and represented by a comp slip.

#### Operational truth
The reward becomes real when the ledger debit / comp issuance record is persisted according to the selected design.

#### Artifact
`comp_slip`

#### Print policy
For pilot: **required** for player-facing use.

#### Rationale
Even though the accounting truth is system-side, the comp still moves through a downstream custody chain and must be validated by the recipient honoring it.

Typical custody chain examples:
- meal comp → wait staff / restaurant recipient
- beverage comp → service staff / bar recipient
- cigarette comp → cage / cashier recipient
- misc comp → designated operational recipient

#### Examples
- meal comp
- beverage comp
- misc comp
- cigarette comp

#### Non-goal
Do not treat `points_comp` as a non-print family merely because it is ledger-backed.

Ledger-backed does not mean paper-free.  
For pilot, player-facing comps are printable.

---

### B. `entitlement` family

#### Definition
A player-facing redeemable reward represented by coupon issuance.

#### Operational truth
The reward becomes real when the entitlement/coupon issuance record is created.

#### Artifact
`coupon`

#### Print policy
For pilot: **required**

#### Rationale
These rewards are discrete redeemable instruments. In pilot, they require printed presentation for downstream honoring.

#### Examples
- match play
- free play

#### Non-goal
Do not collapse coupon issuance and comp slip generation into one fake-unified model.  
They may both print, but they are not the same structure.

---

### C. `internal_adjustment` family

#### Definition
A loyalty action used only for internal/admin purposes and not presented to a downstream custody recipient.

#### Operational truth
The adjustment record itself.

#### Artifact
`none`

#### Print policy
Default: **forbidden**

#### Rationale
If the action is purely internal and not presented for operational honoring, printing adds no value and should not be introduced by default.

#### Examples
- manual balance correction
- admin-only goodwill adjustment
- internal reconciliation entry
- non-player-facing ledger correction

---

## Policy matrix

| Family | Mechanism | Artifact Type | Default Print Policy | Operational Truth | Typical Custody Path |
|---|---|---|---|---|---|
| `points_comp` | ledger debit → comp fulfillment | `comp_slip` | `required` for player-facing pilot use | ledger / comp issuance persistence | wait staff, cashier, cage, service recipient |
| `entitlement` | coupon issuance | `coupon` | `required` for player-facing pilot use | coupon issuance record | dealer, cashier, cage, redemption counterparty |
| `internal_adjustment` | internal system/admin update | `none` | `forbidden` | adjustment record | internal admin only |

---

## Explicit pilot policy by known reward type

### Meal comp
- family: `points_comp`
- artifact: `comp_slip`
- print policy: `required`
- custody chain: wait staff / restaurant recipient

### Beverage comp
- family: `points_comp`
- artifact: `comp_slip`
- print policy: `required`
- custody chain: service staff / bar recipient

### Cigarette comp
- family: `points_comp`
- artifact: `comp_slip`
- print policy: `required`
- custody chain: cage / cashier recipient

### Misc comp
- family: `points_comp`
- artifact: `comp_slip`
- print policy: `required`
- custody chain: designated operational recipient

### Match play
- family: `entitlement`
- artifact: `coupon`
- print policy: `required`
- custody chain: dealer / redemption counterparty

### Free play
- family: `entitlement`
- artifact: `coupon`
- print policy: `required`
- custody chain: dealer / cashier / redemption counterparty

### Internal/admin-only loyalty adjustment
- family: `internal_adjustment`
- artifact: `none`
- print policy: `forbidden`
- custody chain: none beyond internal admin/support review

---

## Implementation consequences

### 1. Do not unify slips and coupons into one storage concept
They may both be printable artifacts, but they arise from different mechanisms and serve different structures.

- `points_comp` → comp slip
- `entitlement` → coupon

### 2. It is valid to share a constrained print path
A shared print path may exist for pilot convenience **only** at the rendering/fulfillment layer, not at the domain-meaning layer.

Meaning:
- a shared print helper is acceptable
- a shared pilot artifact standard is acceptable
- a shared “everything is the same reward object” model is not acceptable

### 3. Printing is required for player-facing pilot instruments
Do not let the team interpret ledger-backed rewards as “therefore not printable.”

For pilot, the relevant test is not “is there a ledger record?”
The relevant test is:

> Must another downstream actor inspect and honor this reward?

If yes, print is required.

### 4. Internal/admin-only actions must not be forced through print
Printing is not a badge of legitimacy.
It exists for custody validation, not ceremony.

---

## Allowed pilot standard

The system may introduce a **single constrained pilot print standard** for player-facing loyalty instruments, provided that:

- the domain distinction between comp slips and coupons remains explicit
- storage and issuance semantics are not collapsed
- print sharing occurs only at the fulfillment layer
- no generalized document platform is implied

This allows the team to implement one ugly practical print path without rewriting the loyalty model into fiction.

---

## Explicitly forbidden interpretations

The following interpretations are banned:

- “All loyalty rewards are the same because they all print”
- “Comp slips and coupons should use the same domain model”
- “Ledger-backed rewards do not need printing”
- “If we introduce shared print logic, we have authorized a printing platform”
- “Because multiple reward types print, we should solve all reward fulfillment generically now”

No.

Shared print capability at pilot does **not** mean shared business semantics.

---

## Decision filter for any new loyalty reward type

Before implementation, the team must answer:

1. Is this player-facing or internal/admin-only?
2. What family does it belong to?
3. What record makes it real?
4. What artifact type does it produce, if any?
5. Is print required, optional, or forbidden?
6. Who in the downstream custody chain must validate it?
7. Does it fit an existing pilot fulfillment path, or is it out of pilot scope?

If these are not answered, implementation should stop.

---

## Final policy statement

For pilot:

> Internal/admin-only loyalty adjustments default to no print.

And:

> All player-facing loyalty reward instruments are printable because they must be validated through a downstream custody chain.

This includes both:

- `points_comp` rewards producing **comp slips**
- `entitlement` rewards producing **coupons**

They may share a constrained pilot print path, but they must remain structurally distinct.

Do not trade clarity for fake unification.  
That is how teams deliver gibberish with confidence.
