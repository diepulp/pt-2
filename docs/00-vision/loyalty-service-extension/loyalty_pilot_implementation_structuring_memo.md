# Loyalty Pilot Implementation Structuring Memo
**Project:** Casino Player Tracker  
**Status:** Governance / delivery structuring memo  
**Purpose:** Resolve tension between pilot containment and implementation packaging for the initial loyalty slice.

---

## Why this memo exists

The current loyalty direction contains a real tension:

- the **Loyalty Pilot Slice Boundary** correctly defines one bounded pilot area
- the **Reward Fulfillment Policy** correctly distinguishes slips, coupons, and print obligations
- but the current implementation velocity and packaging appear too aggressive, because multiple development vectors are being pushed toward a single execution artifact

That is the problem.

The issue is **not** that pilot containment is inherently too strict.

The issue is that **scope containment** is being confused with **execution packaging**.

Those are different concerns and must be handled separately.

---

## Core diagnosis

The current loyalty pilot effort contains at least three distinct development vectors:

### 1. Loyalty admin operationalization
This includes:
- reward catalog configuration
- activation / deactivation
- pilot metadata inputs
- minimum pricing / entitlement setup

### 2. Loyalty operator issuance
This includes:
- viewing available rewards in player context
- issuing a configured reward
- persistence of issuance
- history / support visibility
- operator-facing success and failure handling

### 3. Reward instrument fulfillment
This includes:
- comp slip vs coupon fulfillment
- constrained print standard
- issuance-to-print completion
- minimal reprint / support handling if required
- rendering rules and printable artifact production

These vectors are related under one pilot boundary, but they are **not** the same implementation slice.

Trying to force them into one execution spec creates the following failures:

- overloaded scope
- confused acceptance criteria
- false sequencing certainty
- hidden architectural decisions inside delivery docs
- cross-vector scope leakage
- printing quietly becoming “part of loyalty” in an uncontrolled way
- ambiguous Definition of Done

This is not containment.  
It is bundling.

---

## Key clarification

> Pilot containment restricts **scope admission**.  
> It does **not** require all approved pilot work to be packaged into one execution artifact.

This is the central correction.

The **Pilot Containment Protocol** should determine what is allowed into the pilot.  
It should **not** force all allowed work into a single mega-spec.

If multiple approved vectors have:

- different acceptance criteria
- different dependency shapes
- different architectural decision weight
- different rollout risks

then they should be implemented under **separate sibling exec specs**.

---

## Recommended artifact structure

The correct structure is:

### Constitutional / governing artifacts
These define the boundary and policy.

1. **Pilot Containment Protocol**
2. **Loyalty Pilot Slice Boundary**
3. **Reward Fulfillment Policy**

These artifacts answer:
- what is in scope
- what is out of scope
- how loyalty rewards are structurally classified
- when print is required
- what forms of scope expansion are forbidden

These remain the governing layer.

---

### Delivery / execution artifacts
These should be split into separate sibling exec specs.

#### Exec Spec A — Loyalty Admin Catalog Slice
Scope:
- reward catalog manager
- pilot reward configuration
- activation / deactivation
- minimum pricing / entitlement fields
- validation on config input

Definition of Done:
- admin can configure pilot-eligible rewards
- configuration persists and is retrievable
- invalid config states are blocked or clearly surfaced

#### Exec Spec B — Loyalty Operator Issuance Slice
Scope:
- player-context reward availability
- issuance action
- issuance persistence
- support/history visibility
- operator-facing success/failure handling

Definition of Done:
- pit boss can issue a configured pilot reward through the intended workflow
- issuance produces durable records
- support/history visibility is sufficient for operational inspection

#### Exec Spec C — Reward Instrument Fulfillment Slice
Scope:
- constrained pilot print standard
- comp slip vs coupon rendering boundary
- issuance-to-print completion
- minimal reprint/support handling only if required for pilot survival
- print success/failure handling

Definition of Done:
- qualifying player-facing pilot rewards produce the correct printable artifact
- slips and coupons remain structurally distinct
- print feedback is clear enough for real operator use

---

### Architectural decision artifact
Printing / fulfillment deserves its own ADR.

#### ADR — Pilot Reward Instrument Fulfillment Standard
This ADR should freeze the durable decision that:

- `points_comp` and `entitlement` remain structurally distinct
- comp slips and coupons are not collapsed into one domain model
- a constrained shared print path is allowed only at the fulfillment/rendering layer
- internal/admin-only adjustments remain non-print
- player-facing custody-validated instruments are printable
- no generalized print/document platform is authorized in this slice

This is the correct use of an ADR:  
a durable architectural choice with downstream consequences.

---

### Integration note (optional but recommended)
A short integration artifact may also exist.

#### Loyalty Pilot End-to-End Assembly Note
Purpose:
- describe how the three sibling specs connect
- define integration sequence
- define end-to-end validation scenarios
- prevent accidental scope import across specs

This should **not** be another implementation spec.  
It is only a stitching note.

---

## Why separate exec specs are correct

Separate exec specs are justified when the approved workstreams have different:

- completion criteria
- contract surfaces
- sequencing risks
- rollback risks
- architectural significance

That is true here.

### Admin configuration is not issuance
Admin config deals with defining what can exist.

### Issuance is not fulfillment
Issuance deals with granting the reward and persisting the event.

### Fulfillment is not reward semantics
Fulfillment deals with producing the operational artifact required by the custody chain.

They belong under one boundary, but they do not belong in one implementation blob.

---

## How this resolves the protocol tension

The protocol tension comes from using containment rules too bluntly.

### Wrong interpretation
“If all three vectors are pilot-critical, they must all be implemented under one spec.”

That is false.

### Correct interpretation
“If all three vectors are pilot-approved, they may proceed as separate sibling workstreams, so long as each remains bounded by the governing artifacts.”

This resolves the tension without weakening discipline.

The protocol continues to prevent:

- unauthorized feature admission
- speculative platform work
- generalization by stealth
- phase-2 drift

But it no longer forces dissimilar work into one delivery package.

---

## Parallel development posture

These three vectors may be developed in parallel, but only under **bounded parallelism**.

### Parallelism is allowed
The following may proceed concurrently:
- admin catalog work
- issuance flow work
- fulfillment / print work

### Parallelism is not a free-for-all
Parallel work is allowed only if:
- contracts are frozen first
- each lane has explicit acceptance criteria
- each lane can define success independently
- cross-lane refactors are prohibited unless tied to a pilot blocker
- rollout can still occur in controlled sequence

This is not “everyone works on loyalty at once.”  
It is disciplined parallelism with contract boundaries.

---

## Required contract freezes before parallel work

Before the sibling exec specs move in earnest, the following contracts should be frozen.

### 1. Reward configuration contract
Freeze:
- required fields for pilot reward definition
- activation/deactivation semantics
- pricing / entitlement semantics needed for pilot
- what admin-configured data issuance depends on

### 2. Issuance contract
Freeze:
- what record is created when a reward is issued
- what fields distinguish `points_comp` vs `entitlement`
- what history/support data must be available
- what event/state fulfillment receives

### 3. Fulfillment contract
Freeze:
- what data is required to render a comp slip
- what data is required to render a coupon
- what feedback states the operator must receive
- whether minimal reprint is in scope

Without these contract freezes, parallel work becomes mutual sabotage.

---

## Dependency truth

The vectors are related, but not equal.

### Fulfillment depends on issuance semantics
Printing cannot correctly occur without a stable issuance payload and reward-family distinction.

### Issuance depends on configuration semantics
Issuance cannot behave correctly if the reward definition/configuration model is unstable.

Therefore:

- development may overlap
- but **integration order still matters**

### Recommended integration order
1. configuration semantics freeze
2. issuance semantics freeze
3. fulfillment binds to frozen issuance contract
4. end-to-end rehearsal validates the connected flow

---

## Production-friction controls

Splitting the workstreams is not enough by itself.  
To avoid friction in production, use the following controls.

### 1. Contract-first execution
No lane invents its own reality.  
All three lanes implement against frozen interfaces and semantics.

### 2. Fulfillment adapter, not fulfillment platform
The print/fulfillment lane should target a narrow adapter shape.

Conceptually, only something like:
- build comp slip payload
- build coupon payload
- render printable instrument

That is sufficient.

Do **not** authorize:
- print queueing systems
- printer fleet routing
- generic template registries
- generalized document platforms
- broad delivery abstractions

### 3. Separate development from rollout
Work may be developed in parallel, but rollout should still be controlled.

Example rollout posture:
- config capability available first
- issuance flow hidden behind feature gate until stable
- fulfillment/printing hidden behind a further gate until end-to-end validated

### 4. Feature-gated enablement
Especially for printing.

Because half-working printing destroys operator trust immediately.

Enable via:
- pilot-casino gating
- role gating
- hidden surfaces until complete
- reward-family-specific enablement if necessary

### 5. Separate Definition of Done per workstream
This is mandatory.

Bad:
> loyalty is done when loyalty works

Worthless.

Good:
- admin slice has its own done condition
- issuance slice has its own done condition
- fulfillment slice has its own done condition

That keeps the three lanes from contaminating each other.

---

## How to phrase this in governance language

The following clarification should be recognized going forward:

> Pilot containment restricts scope admission, not implementation packaging. Distinct approved pilot vectors may proceed under separate exec specs when they have different acceptance criteria, dependency profiles, rollout risks, or architectural decision weight.

And:

> Parallel work is allowed only where contracts are frozen and each workstream can define success independently without importing unauthorized scope.

These statements resolve the perceived tension without weakening containment.

---

## Anti-creep framing

This restructuring is **not** a weakening of pilot discipline.

It is the opposite.

The point is not to broaden the loyalty pilot.

The point is to prevent:
- false bundling
- accidental mega-specs
- hidden architectural drift
- printing platform creep disguised as “part of loyalty”

The correct framing is:

> These vectors are approved under one pilot boundary but executed as separate slices to avoid conflating configuration, issuance, and fulfillment into a single over-scoped implementation effort.

And for printing specifically:

> Printing is approved only as a constrained fulfillment slice for custody-validated pilot instruments; it is not authorization to build a generalized printing platform.

---

## Recommended final structure

### Keep
- Pilot Containment Protocol
- Loyalty Pilot Slice Boundary
- Reward Fulfillment Policy

### Add
- **ADR:** Pilot Reward Instrument Fulfillment Standard
- **Exec Spec A:** Loyalty Admin Catalog Slice
- **Exec Spec B:** Loyalty Operator Issuance Slice
- **Exec Spec C:** Reward Instrument Fulfillment Slice
- **Optional Integration Note:** Loyalty Pilot End-to-End Assembly

This is the sane structure.

One boundary.  
Multiple sibling exec specs.  
One ADR for durable fulfillment structure.  
One optional stitching note.  
Controlled rollout.  
No mega-spec theater.

---

## Final position

The loyalty slice boundary is valid.  
The current implementation packaging is what is overloaded.

The resolution is:

- keep a single bounded pilot definition
- split execution into sibling workstreams
- freeze contracts before parallel implementation
- give printing/fulfillment its own ADR
- gate rollout to reduce production friction
- do not mistake adjacency for sameness

The boundary stays narrow.  
The delivery plan becomes sane.

That is how you preserve containment without turning execution into a bureaucratic choke collar.
